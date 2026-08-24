import {
  assertMembersAudience, publishedMenuOrThrow, unlinkAllFromMenu, type RichMenuRow,
} from '@fosivo/line-rich-menu-core'
import { getServices, type Services } from '../container.js'
import { guard, type AdminContext } from '../http-error.js'
import type { StrapiV5 } from '../strapi.js'
import { runTick } from '../tick.js'
import { audienceQuerySchema, idParam } from '../validation.js'

// เหมือนกับ actorOf ของ controllers/menus.ts และ channels.ts เป๊ะ — คงรูปแบบ "หนึ่งไฟล์คุมของตัวเอง"
// เดียวกันไว้ ไม่ดึงข้ามไฟล์ controller มาแชร์ (ทั้งสองไฟล์นั้นก็ไม่ export ตัวนี้ออกมาเหมือนกัน)
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
  // บอกว่าเปิดอยู่ (ตรงข้ามกับ deactivate ที่ตั้งใจไม่ atomic — ดูคอมเมนต์ในตัว deactivate เอง)
  await services.transaction(async () => {
    await services.channels.update(menu.channelId, { memberRichMenuId: menu.lineRichMenuId })

    const rows = await services.schedules.findMany({
      filters: { richMenuId: menu.id, op: 'link-members' },
    })
    const runAt = new Date().toISOString()

    // งานที่ยังไม่จบ (pending รอคิว หรือ running ที่ worker ถืออยู่) นับว่ามีคนทำอยู่แล้ว — สร้าง
    // แถวใหม่ทับคือได้สองงานของเมนูเดียวกันวิ่งพร้อมกัน แถวใหม่ cursor: null จะไล่ผูกตั้งแต่คนแรก
    // ซ้อนกับแถวเดิมที่ทำไปได้ครึ่งทางแล้ว (`writeDisplayPeriod` ใน menu-write.ts กันซ้ำแบบเดียวกัน)
    if (rows.some((row) => row.state === 'pending' || row.state === 'running')) return

    // ปลุกแถวที่ล้มไว้ **ทุกแถว** ไม่ใช่แถวแรกที่เจอ — scheduler ไม่เคยหยิบ 'failed' ซ้ำเอง แถวที่
    // ถูกข้ามจึงค้างตายถาวรพร้อม cursor ของมัน การปลุกทั้งหมดยังทำให้ผลลัพธ์ไม่ขึ้นกับลำดับที่ repo
    // คืนแถวมาด้วย (ไม่ต้องพึ่ง sort ที่ adapter อาจแม็ปคนละแบบ) แต่ละแถวไปต่อจาก cursor ของตัวเอง
    // ช่วงที่ซ้อนกันแค่ส่ง bulkLink ซ้ำ ซึ่ง LINE รับได้ ไม่ใช่การผูกผิดคน
    const failed = rows.filter((row) => row.state === 'failed')
    if (failed.length > 0) {
      for (const row of failed) {
        // ไม่แตะ cursor — นั่นคือประเด็นทั้งหมดของการ reuse แถวนี้แทนสร้างใหม่ (ดูคอมเมนต์ข้างบน)
        await services.schedules.update(row.id, { state: 'pending', runAt, lastError: null })
      }
      return
    }

    await services.schedules.create({
      richMenuId: menu.id, runAt, op: 'link-members', state: 'pending',
      lockedBy: null, lockedAt: null, lastError: null, cursor: null,
    })
  })
}

/**
 * (Task 19 item 2) ปลดระวางงาน `link-members` ของเมนูนี้ตอนที่ผู้ดูแลกดปิด
 *
 * `enqueueLinkMembers` ตั้งใจ resume จากแถวที่ `failed` พร้อม cursor เดิม ซึ่งถูกต้องเมื่อ resume
 * **ภายในการเปิดครั้งเดียวกัน** (LINE ตอบ 503 ที่ชุดที่ 15 จาก 20 — กดซ้ำแล้วไปต่อจากชุดที่ 15)
 * แต่ผิดทันทีเมื่อมีการ "ปิด" คั่นกลาง: งาน unlink ระหว่างนั้นล้างคนที่ถูกผูกไว้แล้วออกจนหมด การ
 * เปิดใหม่แล้วเริ่มจาก cursor เดิมจึงข้ามทุกคนที่อยู่ **เหนือ** cursor ไปเงียบ ๆ สวิตช์อ่านว่าเปิด
 * ทั้งที่สมาชิกครึ่งหนึ่งไม่เคยได้เมนู และไม่มีอะไรรายงานเลย
 *
 * บน v5 หนักกว่านั้นอีกชั้น: cursor คือ `documentId` ซึ่งสุ่ม ไม่ monotonic — เหตุผลของ keyset ที่
 * `members.ts` เขียนไว้ ("แถวที่ id นี้ไม่ขยับ") จริงกับการลบแถว แต่ไม่จริงกับการ **แทรก** แถวใหม่
 *
 * ตัดสินที่ตอนปิด ไม่ใช่ตอนเปิด — "มีการปิดเกิดขึ้น" คือสัญญาณที่ตรงประเด็นที่สุด และมันมีอยู่ตรง
 * นี้พอดีตอนที่มันเกิด ส่วนตอนเปิดไม่มีทางแยกออกเลยว่า cursor ที่ค้างอยู่มาจากงานที่สะดุดในรอบนี้
 * หรือจากรอบก่อนที่ถูกปิดไปแล้ว
 *
 * แถวที่ `running` ไม่แตะ `state` — เจ้าของ lock เป็นคนเขียนสถานะสุดท้ายของมันเอง (`lock.release`
 * มีเงื่อนไข `lockedBy = owner`) เขียนทับตรงนี้จะโดนมันเขียนกลับอยู่ดี แต่ **ล้าง cursor** ได้และ
 * ต้องล้าง: `release` ไม่เคยแตะคอลัมน์ `cursor` เลย ค่าที่ล้างไว้จึงอยู่รอดข้ามการปล่อย lock
 * ถ้างานนั้นล้มหลังจากนี้แล้วถูกปลุกในอนาคต มันจะเริ่มใหม่ตั้งแต่คนแรก (ส่งซ้ำ ซึ่ง LINE รับได้)
 * แทนที่จะข้ามคนไปเงียบ ๆ — ผิดไปทางที่ซ่อมตัวเองได้ ไม่ใช่ทางที่ทำคนหาย
 */
async function retireLinkMembers(services: Services, menu: RichMenuRow): Promise<void> {
  const rows = await services.schedules.findMany({
    filters: { richMenuId: menu.id, op: 'link-members' },
  })

  let retired = 0
  for (const row of rows) {
    if (row.state === 'pending' || row.state === 'failed') {
      // 'done' คือสถานะปลายทางเดียวที่ทั้ง scheduler (หยิบแค่ pending/running) และ
      // `enqueueLinkMembers` (ปลุกแค่ failed) มองข้ามพร้อมกัน — ไม่มีค่า 'cancelled' ในสคีมา และ
      // การเพิ่มค่าใหม่เข้า enum ของทั้งสอง adapter เพื่อความหมายที่ละเอียดขึ้นไม่คุ้มกับความเสี่ยง
      // ของการอัปเกรดคอลัมน์ในผลิตภัณฑ์ที่ปล่อยไปแล้ว
      await services.schedules.update(row.id, { state: 'done', cursor: null, lastError: null })
      retired += 1
    } else if (row.state === 'running') {
      await services.schedules.update(row.id, { cursor: null })
      retired += 1
    }
  }

  if (retired > 0) {
    services.logger.info(
      'line-rich-menu: retired link-members jobs because the member menu was deactivated',
      { menuId: menu.id, retired },
    )
  }
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
    // Task 13 ruling — เมนูที่ publish แล้วแต่ audience ไม่ใช่ 'members' ยัง activate ไม่ได้: ทำแบบ
    // นั้นจะปักหมุด channel.memberRichMenuId ไปที่เมนูที่ไม่ได้ประกาศไว้ว่าเป็นของสมาชิก แล้วหน้าจอ
    // (ซึ่งเช็ค audience: 'all' จากค่า default ของ LINE ไม่ใช่จาก pointer นี้) จะบอกว่ามันปิดอยู่
    // ทั้งที่ live จริงสำหรับสมาชิก — ไม่ใช้ activate เพื่อ "เดา" ว่าผู้ใช้ตั้งใจให้เป็นเมนูสมาชิก
    // และไม่แก้ audience ให้เองด้วย (ดู assertMembersAudience) เพราะนั่นคือการเขียนทับเจตนาที่
    // ประกาศไว้แทนที่จะเคารพมัน — โยน 409 menu_not_members_audience (http-error.ts) ให้ผู้ใช้แก้
    // audience ของเมนูก่อนแล้วค่อยกลับมา activate ใหม่
    assertMembersAudience(menu)
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

      // เมนูที่ไม่เคยขึ้น LINE เป็นเมนูสมาชิกของ channel ไหนไม่ได้ (activate ผ่าน
      // publishedMenuOrThrow เสมอ) และไม่มีใครถืออยู่ได้ — ไม่มีทั้ง pointer ให้ล้างและงานให้ตั้ง
      const lineRichMenuId = menu.lineRichMenuId
      if (lineRichMenuId !== null) {
        // ล้าง pointer เฉพาะตอนที่ channel ยังชี้มาที่เมนูนี้จริง ๆ — ปิดเมนูเก่า A ขณะที่ B เป็น
        // เมนูสมาชิกที่ใช้อยู่ ต้องไม่ล้าง pointer ของ B ทิ้ง ไม่งั้น audience อ่านว่าปิดทั้งที่ยังเปิด
        // สมาชิกใหม่หยุดถูกผูกกับ B (lifecycles อ่าน pointer ตัวนี้) และงานปลดของ A ก็ไม่แมตช์ใคร
        // เลยเพราะไม่มีใครถือ A อยู่ — จบที่ B ไม่ถูกรื้อและไม่ถูกใช้ ทั้งที่ไม่มีใครสั่งให้ปิด B
        const channel = await services.channels.findOne(menu.channelId)
        if (channel.memberRichMenuId === lineRichMenuId) {
          await services.channels.update(menu.channelId, { memberRichMenuId: null })
        }

        // ปลดระวางงานผูกสมาชิกที่ยังค้างอยู่ **ก่อน** runTick ข้างล่าง — ไม่งั้น tick ของคำขอนี้เอง
        // จะหยิบงาน link ที่ยัง pending ขึ้นมาวิ่งสวนกับงาน unlink ที่เพิ่งตั้งไปในคำขอเดียวกัน
        await retireLinkMembers(services, menu)

        // ตั้งงานเสมอ ไม่ผูกกับเงื่อนไขข้างบน — กดปิดซ้ำหลังรอบก่อนล้มต้องตั้งงานใหม่ได้ ทั้งที่
        // pointer ถูกล้างไปตั้งแต่รอบแรกแล้ว ถ้าผูกไว้ด้วยกันจะไม่มีทางปลดคนที่ค้างผ่านหน้าจอได้อีก
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
      const query = audienceQuerySchema.parse(ctx.query)
      const channel = await services.channels.withSecrets().findOne(id)
      // audience: 'all' active เมื่อ default ของ LINE จริง ๆ ตรงกับเมนูนั้น — ต้องถามฝั่ง LINE
      // ไม่ใช่เดาจาก DB (สเปก: "อ่านจาก LINE ไม่ใช่เดา")
      const defaultRichMenuId = await services.clientFor(channel).getDefault()
      // Task 11 fix round 1 — เดิม endpoint นี้นับสมาชิกทุกครั้งที่ถูกเรียก (ทุกครั้งที่เปิดหน้า
      // รายการ ผ่านทั้งการ์ดและสวิตช์ทุกแถว) ทั้งที่ตัวเลขนี้มีประโยชน์แค่ตอนกล่องยืนยัน activate
      // กำลังจะเปิด — สำหรับ channel ที่มีสมาชิกหลักหมื่นคน นั่นคือ findMany ทั้งตารางโดยเปล่าประโยชน์
      // ในการเปิดหน้าจอเฉย ๆ ตอนนี้นับเฉพาะตอนถูกขอผ่าน `?count=1` (ดูคอมเมนต์ที่ audienceQuerySchema)
      const memberCount = query.count === undefined
        ? null
        : (await services.members.findMany({ filters: { channelId: id } })).length
      ctx.body = { defaultRichMenuId, memberRichMenuId: channel.memberRichMenuId, memberCount }
    }),

    /**
     * Task 12 — การบำรุงรักษาที่ตั้งใจให้หายาก: ปลดทุกคนที่ LINE รู้ว่ายังถือเมนูนี้อยู่ ไม่ใช่แค่
     * คนที่แถว line-member ของเรายังอ้างถึง (ต่างจาก deactivate ข้างบนที่ตั้งงานให้ scheduler ปลด
     * ทีละคนจากแถวของเราเอง) — ใช้ตอนแถวสมาชิกหายไประหว่าง LINE ล่ม หรือมีคนถูกผูกไว้ตั้งแต่ก่อน
     * ฟีเจอร์นี้มีอยู่ ธุรกิจตรงกับ activate/sync ข้างบน: เช็คว่าแถวเมนูมีอยู่จริงก่อน (404 ต่างจาก
     * "publish แล้วหรือยัง" 409 ที่ unlinkAllFromMenu เช็คเองอีกชั้นผ่าน publishedMenuOrThrow)
     * ทำงานอยู่ในคำขอนี้เลย ไม่ผ่าน scheduler เหมือน deactivate — batch ของ LINE เป็นคำสั่งเดียว
     * ต่อเมนู ไม่ใช่งานที่ต้องแบ่ง chunk ตามจำนวนสมาชิกแบบ unlink-members
     */
    unlinkAll: guard(strapi, async (ctx) => {
      const services = getServices(strapi)
      const id = idParam.parse(ctx.params['id'])
      const menu = await services.menus.findOne(id)
      if (menu === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

      const channel = await services.channels.withSecrets().findOne(menu.channelId)
      await unlinkAllFromMenu(
        { client: services.clientFor(channel), menus: services.menus, audit: services.audit },
        { menuId: id, actorId: actorOf(ctx) },
      )
      ctx.status = 204
      ctx.body = null
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
