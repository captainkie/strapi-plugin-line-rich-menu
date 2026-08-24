import {
  assertNotChannelMemberMenu, clearChannelDefault, publishMenu, reconcileChannel, setMenuAsDefault,
  type RichMenuRow,
} from '@fosivo/line-rich-menu-core'
import { getServices, type Services } from '../container.js'
import { guard, type AdminContext } from '../http-error.js'
import { readDisplayPeriod, saveMenu } from '../menu-write.js'
import type { StrapiV4 } from '../strapi.js'
import {
  idParam, listQuerySchema, menuInputSchema, publishBodySchema, setDefaultBodySchema,
} from '../validation.js'

const actorOf = (ctx: AdminContext): string | null =>
  ctx.state.user === undefined ? null : String(ctx.state.user.id)

/**
 * url ของรูปที่ควร "เอาไปโชว์" — รูปที่ normalize แล้วมาก่อนรูปดิบที่ผู้ใช้อัปมา เพราะตัวที่
 * normalize แล้วคือตัวที่ถูกส่งขึ้น LINE จริง หน้าจอจึงควรแสดงตัวเดียวกับที่ผู้ใช้ปลายทางเห็น
 */
async function imageUrlOf(services: Services, row: RichMenuRow): Promise<string | null> {
  const fileId = row.normalizedFileId ?? row.imageFileId
  return fileId === null ? null : services.store.url(fileId)
}

/** รูปทรงที่ `RichMenuSummary` ใน packages/ui/src/api.ts ประกาศไว้ — ห้ามเพิ่มหรือลดฟิลด์ */
async function toSummary(services: Services, row: RichMenuRow) {
  const [imageUrl, period] = await Promise.all([
    imageUrlOf(services, row),
    readDisplayPeriod(services.schedules, row.id),
  ])
  return {
    id: row.id,
    title: row.name,
    status: row.status,
    channelId: row.channelId,
    aliasId: row.aliasId,
    updatedAt: row.updatedAt,
    size: row.size,
    areas: row.areas,
    imageUrl,
    // Task 11 — คอลัมน์ Audience ของหน้ารายการอ่าน `audience` ตรง ๆ ส่วน `lineRichMenuId` คือกุญแจ
    // ที่ `CurrentMenuCard` ใช้ resolve `defaultRichMenuId`/`memberRichMenuId` (ทั้งคู่เป็น id ฝั่ง
    // LINE) กลับเป็นชื่อเมนูจากรายการที่โหลดมาแล้ว โดยไม่ต้องยิง `GET /menus/:id` เพิ่มทีละ id
    audience: row.audience,
    lineRichMenuId: row.lineRichMenuId,
    ...period,
  }
}

async function toDetail(services: Services, row: RichMenuRow) {
  const [imageUrl, period] = await Promise.all([
    imageUrlOf(services, row),
    readDisplayPeriod(services.schedules, row.id),
  ])
  return { ...row, ...period, imageUrl }
}

/** ops ที่ menu-ops ต้องการ ประกอบจาก channel ของเมนูนั้น ๆ ไม่ใช่ channel เริ่มต้น */
async function opsFor(services: Services, menu: RichMenuRow) {
  const channel = await services.channels.withSecrets().findOne(menu.channelId)
  return { client: services.clientFor(channel), menus: services.menus, audit: services.audit }
}

export const menus = ({ strapi }: { strapi: StrapiV4 }) => ({
  find: guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const query = listQuerySchema.parse(ctx.query)
    const rows = await services.menus.findMany({
      ...(query.channel === undefined ? {} : { filters: { channelId: query.channel } }),
      sort: 'updatedAt:desc',
    })
    // ทีละแถวขนานกัน ไม่ใช่ทีละแถวต่อกัน — ทุกแถวต้องยิงสองคำถาม (url ของไฟล์ กับตารางเวลา)
    // ถ้าปล่อยให้เป็น for-await ต่อกัน รายการยี่สิบแถวจะกลายเป็นสี่สิบคำขอที่รอกันเป็นทอด ๆ
    ctx.body = await Promise.all(rows.map((row) => toSummary(services, row)))
  }),

  findOne: guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const row = await services.menus.findOne(idParam.parse(ctx.params['id']))
    if (row === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }
    ctx.body = await toDetail(services, row)
  }),

  create: guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const input = menuInputSchema.parse(ctx.request.body)
    const saved = await saveMenu(services, input, null, actorOf(ctx))
    ctx.status = 201
    ctx.body = await toDetail(services, saved)
  }),

  update: guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const input = menuInputSchema.parse(ctx.request.body)
    const existing = await services.menus.findOne(id)
    if (existing === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }
    const saved = await saveMenu(services, input, existing, actorOf(ctx))
    ctx.body = await toDetail(services, saved)
  }),

  delete: guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const existing = await services.menus.findOne(id)
    if (existing === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

    // Task 17 / final review H2 — ลบแถวเมนูที่เป็นเมนูสมาชิกของ channel อยู่ตอนนี้ไม่ได้: หลังแถว
    // หายไป `deactivate` จะ 404 ที่ `menus.findOne(id)` ทันที pointer `memberRichMenuId` จึงกลับ
    // เป็น null ผ่านผลิตภัณฑ์ไม่ได้อีกเลย และสมาชิกทุกคนค้างอยู่กับเมนูที่ไม่มีใครรู้จักแล้ว —
    // ปฏิเสธแล้วบอกให้ปิดสวิตช์ก่อน ไม่ใช่ deactivate ให้เองเงียบ ๆ (Task 13 ruling: การกระทำทำตาม
    // เจตนา ไม่ใช่เขียนทับเจตนา) ตรรกะทั้งหมดอยู่ที่ `assertNotChannelMemberMenu` ใน core ตัวเดียว
    // ที่ publish เรียกด้วย — ไม่ใช่สำเนาที่วันหนึ่งจะไม่ตรงกันระหว่างสอง adapter
    //
    // อ่าน channel ทุกครั้งโดยไม่เช็ค `lineRichMenuId` ก่อน เพื่อไม่ให้เงื่อนไขของยามมีสองสำเนา
    // (ที่นี่หนึ่ง ในตัวยามอีกหนึ่ง) — ตัวยามเองรู้ว่าเมนูที่ยังไม่เคยขึ้น LINE ผ่านเสมอ
    const owner = await services.channels.findOne(existing.channelId)
    assertNotChannelMemberMenu({
      menu: existing, memberRichMenuId: owner.memberRichMenuId, operation: 'delete',
    })

    await services.audit.around(
      {
        actorId: actorOf(ctx), action: 'delete', richMenuId: id, channelId: existing.channelId,
        before: { status: existing.status, lineRichMenuId: existing.lineRichMenuId },
      },
      () => services.menus.delete(id),
    )
    ctx.status = 204
    ctx.body = null
  }),

  publish: guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const body = publishBodySchema.parse(ctx.request.body)
    const menu = await services.menus.findOne(id)
    if (menu === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

    const channel = await services.channels.withSecrets().findOne(menu.channelId)
    ctx.body = await publishMenu({
      client: services.clientFor(channel),
      menus: services.menus,
      audit: services.audit,
      limiter: services.limiter,
      store: services.store,
      logger: services.logger,
      now: () => new Date(),
      // Task 17 / final review H1 — publish ซ้ำบนเมนูที่เป็นเมนูสมาชิกอยู่ตอนนี้ ทำลายทุกลิงก์ที่มี
      // อยู่ (LINE ออก id ใหม่ทุก publish แล้วขั้น deleteOld ลบตัวเก่าทิ้ง) โดยไม่มีใครขยับ pointer
      // ตาม — core เป็นคนตัดสิน ที่นี่แค่ส่งข้อเท็จจริงที่ core มองไม่เห็นเองเข้าไป
      // อ่านจาก `channel` ก้อนเดิมที่โหลดมาเพื่อ access token อยู่แล้ว ไม่ยิง query เพิ่ม
    }, {
      menuId: id,
      actorId: actorOf(ctx),
      setAsDefault: body.setAsDefault,
      memberRichMenuId: channel.memberRichMenuId,
    })
  }),

  setDefault: guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    setDefaultBodySchema.parse(ctx.request.body)
    const menu = await services.menus.findOne(id)
    if (menu === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

    await setMenuAsDefault(await opsFor(services, menu), { menuId: id, actorId: actorOf(ctx) })
    ctx.status = 204
    ctx.body = null
  }),

  clearDefault: guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const menu = await services.menus.findOne(id)
    if (menu === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

    await clearChannelDefault(await opsFor(services, menu), { channelId: menu.channelId, actorId: actorOf(ctx) })
    ctx.status = 204
    ctx.body = null
  }),

  reconcile: guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const channelId = idParam.parse(ctx.params['id'])
    const channel = await services.channels.withSecrets().findOne(channelId)
    ctx.body = await reconcileChannel(
      { client: services.clientFor(channel), menus: services.menus, audit: services.audit },
      { channelId },
    )
  }),
})
