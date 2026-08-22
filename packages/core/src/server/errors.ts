import { CoreError } from '../errors.js'

/**
 * error ของชั้น service แยกไฟล์จาก `../errors.js` เพราะไฟล์นั้นถูก re-export ผ่าน
 * subpath `./browser` — อะไรที่มีแต่ฝั่งเซิร์ฟเวอร์ใช้ ไม่ควรไปนั่งอยู่ในบันเดิลของ admin
 * (คลาสเปล่า ๆ ไม่หนัก แต่บรรทัดฐาน "browser ไม่รู้จัก server" มีค่ามากกว่าไบต์ที่ประหยัดได้)
 *
 * ทุกตัวมี `code` ตามสเปก §11.7 — UI แปล code เป็นข้อความ ไม่เคยเห็น message ดิบ
 */
export class PublishRateLimitedError extends CoreError {
  readonly code = 'publish_rate_limited'
  constructor(readonly retryAfterMs: number) {
    super(`publish rate limit hit, retry in ${retryAfterMs}ms`)
  }
}

/** เมนูยังไม่มีรูปที่ normalize ผ่านเกณฑ์ — publish ไปก็โดน LINE ปฏิเสธ */
export class MenuNotReadyError extends CoreError {
  readonly code = 'menu_not_ready'
  constructor(readonly reason: 'no_image' | 'no_areas' | 'no_channel' | 'not_published') {
    super(`menu is not ready to publish: ${reason}`)
  }
}

/**
 * I4 — เมนูตัวนี้มี publish อีกตัวหนึ่งที่ยัง `status: 'publishing'` และยังไม่หมดอายุ (ดู
 * `PUBLISHING_STALE_AFTER_MS` ใน publish.ts) ปล่อยให้คำขอที่สองเดินต่อคือ `create` ตัวที่สอง
 * clobber id ที่ตัวแรกเพิ่งเขียนลง DB แล้วเมนูของตัวแรกกลายเป็นกำพร้าที่ไม่มีแถวไหนอ้างถึงอีกเลย
 */
export class PublishAlreadyRunningError extends CoreError {
  readonly code = 'publish_already_running'
  constructor(readonly menuId: string) {
    super(`rich menu ${menuId} already has a publish in progress`)
  }
}

/** สเปก §9 — action ชี้ไป alias ของเมนูที่ยังไม่เคย publish */
export class AliasNotPublishedError extends CoreError {
  readonly code = 'alias_not_published'
  constructor(readonly aliasId: string) {
    super(`alias "${aliasId}" is not published yet`)
  }
}

export class ChannelNotFoundError extends CoreError {
  readonly code = 'channel_not_found'
}

export class MenuNotFoundError extends CoreError {
  readonly code = 'menu_not_found'
}

/**
 * Task 13 ruling — `activate`/`sync` ปักหมุด `channel.memberRichMenuId` ไปที่เมนูนี้ ทำแบบนั้นกับ
 * เมนูที่ `audience` ไม่ใช่ `'members'` ไม่ได้ เพราะ "active" ของ `audience: 'all'` ถูกอ่านจาก
 * ค่า default ของ LINE จริง ๆ ไม่ใช่จาก `channel.memberRichMenuId` (ดู `members.audience` ทั้งสอง
 * adapter) — เมนูที่ label ว่า `'all'` แต่ถูก activate จะกลายเป็น live สำหรับสมาชิกจริง ๆ ขณะที่
 * หน้าจอยังบอกว่าปิดอยู่ เพราะหน้าจอเช็คคนละแหล่งสำหรับ label นั้น ไม่มีใครเห็นสถานะที่แท้จริง
 * และไม่มีทางปิดจาก UI ได้เลย — 409 เหมือน `menu_not_ready` (ทั้งคู่คือ "เมนูนี้ยังทำสิ่งที่ขอไม่ได้"
 * ไม่ใช่ 400 ที่แปลว่า "คำขอผิดรูปแบบ") แต่แยก code ออกจากกันเพราะสาเหตุคนละเรื่อง: `not_published`
 * แก้ได้ด้วยการ publish ส่วนอันนี้แก้ได้ด้วยการเปลี่ยน audience ของเมนู
 */
export class MenuNotMembersAudienceError extends CoreError {
  readonly code = 'menu_not_members_audience'
  constructor(readonly menuId: string) {
    super(`rich menu ${menuId} is not audience:'members', cannot be activated for members`)
  }
}

/**
 * Task 14b item 3 — เมนูนี้กำลังเป็นเมนูสมาชิกของ channel อยู่ (`channel.memberRichMenuId` ชี้มาที่
 * `lineRichMenuId` ของมัน) การเปลี่ยน `audience` ออกจาก `'members'` ตอนนี้จะพาไปลงที่สถานะเดียวกับ
 * ที่ `MenuNotMembersAudienceError` ข้างบนมีไว้กันไม่ให้เกิด แต่มาทางประตูใหม่: แถวถูก label ว่า
 * `'all'` ขณะที่สมาชิกจริงยังถือมันอยู่ และหน้าจอจะมองไม่เห็นเลย เพราะ "active" ของเมนู `'all'`
 * ถูกอ่านจากค่า default ของ LINE ไม่ใช่จาก pointer นี้ — ไม่มีใครเห็นสถานะที่แท้จริง และปิดจาก UI
 * ก็ไม่ได้ (สวิตช์สมาชิกถูก gate ด้วย `menu.audience === 'members'` ตั้งแต่ Task 14b item 2)
 *
 * ตาม ruling ของ Task 13 ตรง ๆ — **การกระทำทำตามเจตนา ไม่ใช่เขียนทับเจตนา**: ไม่ deactivate ให้เอง
 * เงียบ ๆ (นั่นคือการตัดสินใจแทนผู้ใช้ว่าสมาชิกหลายหมื่นคนควรถูกปลดเมนู) แต่ปฏิเสธแล้วบอกให้ปิด
 * สวิตช์สมาชิกก่อน — 409 เหมือน `MenuNotMembersAudienceError` (ทั้งคู่คือ "เมนูนี้ยังทำสิ่งที่ขอ
 * ไม่ได้" ไม่ใช่ "คำขอผิดรูปแบบ") แต่คนละ code เพราะแก้คนละวิธี
 */
export class MenuActiveForMembersError extends CoreError {
  readonly code = 'menu_active_for_members'
  constructor(readonly menuId: string) {
    super(
      `rich menu ${menuId} is currently the channel's member menu; `
      + "turn the members toggle off before changing its audience away from 'members'",
    )
  }
}

/** ไม่มี encryptionKey และไม่มี APP_KEYS[0] ให้ derive — ปฏิเสธตั้งแต่ตอน bootstrap */
export class EncryptionKeyMissingError extends CoreError {
  readonly code = 'encryption_key_missing'
}
