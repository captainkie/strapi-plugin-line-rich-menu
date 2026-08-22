import { publishedMenuOrThrow, type RichMenuRow } from '@fosivo/line-rich-menu-core'
import { getServices, type Services } from '../container.js'
import { guard } from '../http-error.js'
import type { StrapiV5 } from '../strapi.js'
import { runTick } from '../tick.js'
import { idParam } from '../validation.js'

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
  // บอกว่าเปิดอยู่ (ตรงข้ามกับ deactivate ที่ตั้งใจไม่ atomic — ดูคอมเมนต์ในตัว deactivate เอง)
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
 * ตั้งงานปลดสมาชิกทุกคนที่ยังถือเมนูนี้อยู่ ให้ scheduler ทำ ไม่ใช่ทำในคำขอนี้
 *
 * ระบบนี้ออกแบบมาสำหรับสมาชิกเกินหมื่นคน — วนปลดในคำขอ HTTP คือยิง LINE ยี่สิบกว่าครั้งบวก
 * อัปเดตแถวเป็นหมื่นในคำขอเดียว proxy timeout หรือ restart กลางทางทิ้งคนจำนวนที่ไม่มีใครรู้ไว้กับ
 * เมนูที่ผู้ดูแลกดปิดไปแล้ว พร้อมกับทำให้คำขอที่จะทำงานให้จบหายไปด้วย เหตุผลเดียวกับที่ enrolment
 * อยู่ใน scheduler ตั้งแต่ต้น
 *
 * ไม่ reuse แถวงานเดิมแบบ `enqueueLinkMembers` เพราะไม่มี cursor ให้รักษา — งาน unlink เริ่มจาก
 * ศูนย์ได้เสมอโดยไม่ส่งซ้ำให้ใคร ชุดงานของมันคือ "คนที่ยังถืออยู่" ซึ่งหดเองทุกคนที่ปลดสำเร็จ
 * (ดู `unlinkMemberChunk` ใน core)
 */
async function enqueueUnlinkMembers(services: Services, menu: RichMenuRow): Promise<void> {
  await services.schedules.create({
    richMenuId: menu.id, runAt: new Date().toISOString(), op: 'unlink-members', state: 'pending',
    lockedBy: null, lockedAt: null, lastError: null, cursor: null,
  })
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

      // ล้าง channel ก่อน และไม่ห่อรวม transaction กับการตั้งงาน (ตรงข้ามกับ activate) — เมนูที่
      // ผู้ดูแลกดปิดต้องอ่านว่าปิดทันที ไม่ต้องรอให้ปลดใครสำเร็จสักคน ถ้าตั้งงานไม่สำเร็จหลังจากนี้
      // toggle ที่ปิดอยู่คือคำตอบที่ถูกแล้ว และการกดปิดซ้ำจะตั้งงานใหม่ให้เอง
      await services.channels.update(menu.channelId, { memberRichMenuId: null })

      // เงื่อนไขคือ "เมนูนี้เคยขึ้น LINE ไหม" ไม่ใช่ "channel ยังชี้มาที่เมนูนี้อยู่ไหม" — ถ้าเช็ค
      // อย่างหลัง การกดปิดซ้ำหลังรอบแรกล้มจะไม่ทำอะไรเลย เพราะ memberRichMenuId ถูกล้างไปตั้งแต่
      // รอบแรกแล้วทั้งที่ยังมีคนถือเมนูนั้นค้างอยู่จริง — กลายเป็นสภาพที่กู้ผ่านหน้าจอไม่ได้อีกเลย
      // ส่วนเมนูที่ไม่เคยมีใครถือ งานที่ตั้งไปก็แค่ query ที่ไม่เจอใครแล้วจบ ไม่ยิง LINE สักครั้ง
      if (menu.lineRichMenuId !== null) {
        await enqueueUnlinkMembers(services, menu)
        // เรียก tick ในคำขอนี้เลยเหมือน activate — งานที่ล้มถูกบันทึกไว้ในแถวงานและ audit
        // (scheduler กลืน error ของงานแต่ละแถวไว้เอง) ปุ่มปิดจึงไม่เคยล้มเพราะ LINE ล่ม
        await runTick(strapi, services)
      }

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
