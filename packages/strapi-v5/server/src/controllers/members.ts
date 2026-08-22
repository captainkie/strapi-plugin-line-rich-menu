import {
  MAX_BULK_USER_IDS, errorCodeOf, publishedMenuOrThrow,
  type ChannelWithSecrets, type RichMenuRow,
} from '@fosivo/line-rich-menu-core'
import { getServices, type Services } from '../container.js'
import { guard, type AdminContext } from '../http-error.js'
import type { StrapiV5 } from '../strapi.js'
import { runTick } from '../tick.js'
import { idParam } from '../validation.js'

const actorOf = (ctx: AdminContext): string | null =>
  ctx.state.user === undefined ? null : String(ctx.state.user.id)

/**
 * activate และ sync ทำงานเหมือนกันทุกประการ (สเปกบอกตรง ๆ ว่า sync คือ activate ของเมนูที่
 * active อยู่แล้ว) — ต่างกันแค่ปุ่มที่ผู้ใช้กด ไม่ใช่พฤติกรรม แยกฟังก์ชันไว้ที่นี่ตัวเดียว
 * แล้วให้ทั้งสอง key ของ controller ชี้มาที่มันแทนการ copy กัน
 *
 * เหตุผลที่ resume จากแถว 'link-members' ที่ failed แทนสร้างแถวใหม่ (cursor: null เสมอ):
 * scheduler บันทึก cursor ทุกจบ chunk เพื่อให้งานที่ตายกลางทางไปต่อได้ crash จริง ๆ (process ตาย)
 * กู้เองได้อยู่แล้วผ่าน lock ที่หมดอายุ (แถวค้างเป็น 'running' แล้วถูกเก็บใหม่) แต่ exception
 * ระหว่างวิ่ง (เช่น LINE ตอบ 503 ที่ chunk ที่ 15 จาก 20) ปล่อยแถวเป็น 'failed' ซึ่ง scheduler
 * ไม่หยิบซ้ำอีกเลย — ถ้ากดปุ่มซ้ำแล้วสร้างแถวใหม่ cursor: null จะส่ง 14 chunk แรกที่สำเร็จไปแล้วซ้ำ
 * ทั้งหมด cursor ที่ค้างอยู่ในแถวเดิมบอกตำแหน่งที่หยุดไว้แม่นอยู่แล้ว ใช้มันแทนการทิ้งไป
 */
async function enqueueLinkMembers(services: Services, menu: RichMenuRow): Promise<void> {
  // สอง write นี้ (channel + schedule) ต้องไปด้วยกันหรือไม่ไปเลย — ถ้า channel ถูกตั้งเป็น
  // "มีเมนูสมาชิกแล้ว" แต่ไม่มีงาน link-members คู่กัน จะไม่มีใครถูกผูกจริงเลยสักคนทั้งที่ toggle
  // บอกว่าเปิดอยู่ (ตรงข้ามกับ deactivate ที่ตั้งใจไม่ atomic — ดูคอมเมนต์ที่ unlinkAllMembers)
  await services.transaction(async () => {
    await services.channels.update(menu.channelId, { memberRichMenuId: menu.lineRichMenuId })

    const failed = await services.schedules.findMany({
      filters: { richMenuId: menu.id, op: 'link-members', state: 'failed' },
    })
    const runAt = new Date().toISOString()
    const existing = failed[0]
    if (existing !== undefined) {
      // ไม่แตะ cursor — นั่นคือประเด็นทั้งหมดของการ reuse แถวนี้แทนสร้างใหม่ (ดูคอมเมนต์ข้างบน)
      await services.schedules.update(existing.id, { state: 'pending', runAt, lastError: null })
    } else {
      await services.schedules.create({
        richMenuId: menu.id, runAt, op: 'link-members', state: 'pending',
        lockedBy: null, lockedAt: null, lastError: null, cursor: null,
      })
    }
  })
}

/**
 * ปลด LINE user ทุกคนที่ยังถือเมนูนี้อยู่ ณ ตอนนี้
 *
 * ไม่มี ScheduleRow มารองรับ — `ScheduleOp` ของ core ยังไม่มี 'unlink-members' (มีแค่
 * 'link-members') และ scheduler.ts ก็ไม่มี case จัดการงานแบบนี้ ทำให้ไม่มี resumable cursor
 * แบบที่ link-members ได้ ฟังก์ชันนี้จึงวิ่งตรงในคำขอนี้เอง ไม่ผ่าน scheduler (ดูรายงาน task-9
 * สำหรับเหตุผลที่ไม่เพิ่ม ScheduleOp ใหม่ในงานนี้ — แตะ core กว้างกว่าที่ scope ของ task อนุญาต)
 *
 * ถึงจะไม่มี cursor แยกเก็บ แต่ก็ resume ได้เองโดยไม่ต้องมี: ทุกคนที่ unlink สำเร็จจะถูกล้าง
 * linkedRichMenuId ทันที จึงหลุดจากเงื่อนไข query ข้างล่างในรอบถัดไปเอง — ทั้งใน loop นี้เอง
 * (chunk ถัดไปของคำขอเดียวกัน) และถ้าทั้งคำขอนี้ตายกลางทาง คนที่กด deactivate ซ้ำในภายหลัง
 * ก็จะเจอเฉพาะคนที่ยังไม่ถูกปลดเท่านั้น ไม่ใช่ทั้งชุดใหม่
 */
async function unlinkAllMembers(services: Services, channel: ChannelWithSecrets, richMenuId: string): Promise<void> {
  const client = services.clientFor(channel)
  for (;;) {
    const rows = await services.members.findMany({
      filters: { channelId: channel.id, linkedRichMenuId: richMenuId },
      sort: 'id:asc',
      limit: MAX_BULK_USER_IDS,
    })
    if (rows.length === 0) return

    await client.bulkUnlink(rows.map((row) => row.lineUserId))
    for (const row of rows) {
      await services.members.update(row.id, { linkedRichMenuId: null, linkedAt: null })
    }
  }
}

export const members = ({ strapi }: { strapi: StrapiV5 }) => {
  const activateOrSync = guard(strapi, async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    // เมนูที่ยังไม่เคย publish ไม่มี lineRichMenuId ให้ผูกสมาชิกด้วย — โยน MenuNotReadyError
    // ('not_published') แบบเดียวกับที่ publish path ใช้อยู่แล้ว แม็ปเป็น 409 menu_not_ready
    const menu = await publishedMenuOrThrow(services.menus, id)
    await enqueueLinkMembers(services, menu)
    // เรียก tick ในคำขอนี้เลย ไม่ใช่ให้ผู้ใช้รอ cron รอบถัดไป (สูงสุด 1 นาที) — งานที่พึ่ง
    // ต้องกดปุ่มแล้วเห็นผลทันที ไม่ใช่ตารางเวลาที่ตั้งไว้ล่วงหน้า
    await runTick(strapi, services)
    ctx.status = 204
    ctx.body = null
  })

  return {
    activate: activateOrSync,
    sync: activateOrSync,

    deactivate: guard(strapi, async (ctx) => {
      const services = getServices(strapi)
      const id = idParam.parse(ctx.params['id'])
      const menu = await services.menus.findOne(id)
      if (menu === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

      const channel = await services.channels.withSecrets().findOne(menu.channelId)
      // ไม่มีเมนูสมาชิกอยู่แล้ว (เคย deactivate ไปแล้ว หรือไม่เคย activate เลย) — idempotent,
      // ไม่มีอะไรให้ unlink ทั้งฝั่ง LINE
      if (channel.memberRichMenuId !== null) {
        const richMenuId = channel.memberRichMenuId
        try {
          await unlinkAllMembers(services, channel, richMenuId)
          await services.audit.write({
            actorId: actorOf(ctx), action: 'unlink-members', richMenuId, channelId: channel.id,
            before: null, after: null, result: 'success', errorCode: null,
          })
        } catch (error) {
          // ปลดไม่สำเร็จ (LINE ล่ม ฯลฯ) ต้องไม่ทำให้ปุ่ม "ปิด" กดไม่ติด — memberRichMenuId
          // ยังต้องถูกล้างต่อไปข้างล่าง เหมือนกับ unlinkDeletedMember ใน lifecycles.ts ที่กลืน
          // error ของ LINE เสมอ ไม่ throw กลับ ผู้ใช้ที่ยังเชื่อมค้างอยู่หากันได้จาก audit log
          // หรือกด deactivate ซ้ำได้ (ดูคอมเมนต์ที่ unlinkAllMembers — retry ต่อจากที่ค้างเองได้)
          services.logger.error(
            'line-rich-menu: deactivate audience — some members failed to unlink', { menuId: id, error },
          )
          await services.audit.write({
            actorId: actorOf(ctx), action: 'unlink-members', richMenuId, channelId: channel.id,
            before: null, after: null, result: 'failure', errorCode: errorCodeOf(error),
          })
        }
      }

      await services.channels.update(menu.channelId, { memberRichMenuId: null })
      ctx.status = 204
      ctx.body = null
    }),

    audience: guard(strapi, async (ctx) => {
      const services = getServices(strapi)
      const id = idParam.parse(ctx.params['id'])
      const channel = await services.channels.withSecrets().findOne(id)
      // audience: 'all' active เมื่อ default ของ LINE จริง ๆ ตรงกับเมนูนั้น — ต้องถามฝั่ง LINE
      // ไม่ใช่เดาจาก DB (สเปก: "อ่านจาก LINE ไม่ใช่เดา")
      const defaultRichMenuId = await services.clientFor(channel).getDefault()
      ctx.body = { defaultRichMenuId, memberRichMenuId: channel.memberRichMenuId }
    }),

    verify: guard(strapi, async (ctx) => {
      const services = getServices(strapi)
      const id = idParam.parse(ctx.params['id'])
      const member = await services.members.findOne(id)
      if (member === null) { ctx.status = 404; ctx.body = { error: { code: 'member_not_found' } }; return }

      const channel = await services.channels.withSecrets().findOne(member.channelId)
      // เรียก LINE ครั้งเดียว — เมนูที่ user คนนี้ถืออยู่จริง ณ ตอนนี้ ไม่ผ่านค่าที่แคชไว้ใน
      // DB (linkedRichMenuId อาจไม่ตรงของจริงถ้า user unfollow/follow บอทใหม่นอกระบบนี้)
      const richMenuId = await services.clientFor(channel).getUserRichMenu(member.lineUserId)
      ctx.body = { richMenuId }
    }),
  }
}
