import { deleteOrphan } from '@fosivo/line-rich-menu-core'
import { getServices } from '../container.js'
import { guard, type AdminContext } from '../http-error.js'
import type { StrapiV5 } from '../strapi.js'
import { channelCreateSchema, channelUpdateSchema, idParam, lineRichMenuIdParam } from '../validation.js'

const actorOf = (ctx: AdminContext): string | null =>
  ctx.state.user === undefined ? null : String(ctx.state.user.id)

export const channels = ({ strapi }: { strapi: StrapiV5 }) => ({
  find: guard(async (ctx) => {
    ctx.body = await getServices(strapi).channels.list()
  }),

  create: guard(async (ctx) => {
    const services = getServices(strapi)
    const input = channelCreateSchema.parse(ctx.request.body)

    // ไม่ใช้ `audit.around` ที่นี่ เพราะ context ของ audit ต้องมี `channelId` ตั้งแต่ก่อนเริ่ม
    // แต่ id เพิ่งมีตอนสร้างเสร็จ การใส่ค่าหลอกไว้ก่อนแล้วเขียนทับทีหลังจะทำให้แถวที่ล้ม
    // ชี้ไป channel ที่ไม่มีอยู่จริง — เขียนสองทางแยกกันตรงไปตรงมากว่า
    const context = { actorId: actorOf(ctx), action: 'channel-update' as const, richMenuId: null }
    try {
      const created = await services.channels.create(input)
      await services.audit.write({
        ...context, channelId: created.id, before: null,
        after: { channelId: created.channelId, name: created.name },
        result: 'success', errorCode: null,
      })
      ctx.body = created
    } catch (error) {
      // channel ยังไม่เกิด จึงยังไม่มี documentId ให้อ้าง — `'(none)'` คือ "ยังไม่มี" และเป็นค่าที่
      // คอลัมน์ string แบบ required รับได้ ไม่ใช่ null ที่จะถูกปฏิเสธ
      //
      // ต่างจาก v4 ที่ใช้ `'0'` เพราะคอลัมน์ที่นั่นเป็น integer — บน v5 การคง `'0'` ไว้จะอ่านได้
      // เหมือน documentId จริงที่ชื่อว่า "0" ซึ่งเป็นค่าที่คนไล่ audit แยกจากของจริงไม่ออก
      await services.audit.write({
        ...context, channelId: '(none)', before: null, after: null,
        result: 'failure', errorCode: (error as { code?: string }).code ?? 'unknown_error',
      })
      throw error
    }
  }),

  update: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const input = channelUpdateSchema.parse(ctx.request.body)
    const before = await services.channels.findOne(id)
    ctx.body = await services.audit.around(
      { actorId: actorOf(ctx), action: 'channel-update', richMenuId: null, channelId: id, before },
      () => services.channels.update(id, input),
      (updated) => ({ channelId: updated.channelId, name: updated.name }),
    )
  }),

  test: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    // withSecrets() ถูกเรียกตรงนี้เท่านั้นในทั้งไฟล์ — เป็นจุดเดียวที่ต้องใช้ token จริง
    const channel = await services.channels.withSecrets().findOne(id)
    const info = await services.clientFor(channel).getBotInfo()
    ctx.body = { userId: info.userId, basicId: info.basicId, displayName: info.displayName }
  }),

  deleteOrphan: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const lineRichMenuId = lineRichMenuIdParam.parse(ctx.params['lineRichMenuId'])
    const channel = await services.channels.withSecrets().findOne(id)
    // deleteOrphan ของ core เป็นคนตรวจซ้ำว่า lineRichMenuId ยังกำพร้าจริงก่อนยิง DELETE ให้ LINE
    // (เรียก reconcileChannel ใหม่ทุกครั้ง) — ชั้นนี้แค่ประกอบ deps ส่งต่อ ไม่เชื่อ id จาก client เอง
    await deleteOrphan(
      { client: services.clientFor(channel), menus: services.menus, audit: services.audit },
      { channelId: id, lineRichMenuId, actorId: actorOf(ctx) },
    )
    ctx.status = 204
    ctx.body = null
  }),
})
