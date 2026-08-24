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

/**
 * (Task 19 item 3) แถวที่กำลังจะเขียนทับหายไปแล้วระหว่างที่งานกำลังวิ่งอยู่
 *
 * ไดรเวอร์ของทั้งสอง Strapi **คืน `null`** เมื่อ id ที่ส่งไปไม่มีแถวอยู่แล้ว ไม่ใช่ throw
 * (v5 `documents().update` คืน `updatedDraft` ที่ยังเป็น null, v4 `entityService.update`
 * `return null` ตั้งแต่ต้นฟังก์ชัน — ตรวจกับต้นไม้ที่ติดตั้งจริงทั้งคู่) `null` ก้อนนั้นเดินทาง
 * ต่อไปเข้า `toRow` แล้วระเบิดเป็น `TypeError` ที่อ่านไม่ออกว่าเกิดจากอะไร ผู้เรียกที่อยากจัดการ
 * เคสนี้ต่างจากบั๊กจริงจึงแยกไม่ได้เลย
 *
 * error ตัวนี้คือการแปล "null ที่ดูเหมือนคำตอบสำเร็จ" ให้เป็นข้อเท็จจริงที่มีชื่อ **ตรงจุดที่ null
 * มาถึง** ผู้เรียกที่รู้ว่าแถวหายไปแล้วไม่ใช่ความผิดพลาด (เช่น `linkMemberChunk`) จับเฉพาะตัวนี้
 * ข้ามแถวนั้นแล้วไปต่อได้ โดยที่ error จริง ๆ (DB ล่ม, สิทธิ์ไม่พอ) ยังหลุดออกไปเหมือนเดิม
 */
export class RowVanishedError extends CoreError {
  readonly code = 'row_vanished'
  constructor(readonly uid: string, readonly rowId: string) {
    super(`${uid} row ${rowId} no longer exists`)
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
 * ปฏิบัติการที่ถูกปฏิเสธเพราะเมนูนั้น "เป็นเมนูสมาชิกของ channel อยู่ตอนนี้" — ทั้งสามตัวมีทางแก้
 * เดียวกันเป๊ะ (ปิดสวิตช์สมาชิกก่อน) จึงใช้ error ตัวเดียว code เดียว ต่างกันแค่ท่อนท้ายของข้อความ
 * ที่บอกว่ากำลังปฏิเสธ *อะไร* อยู่
 *
 * required ไม่ใช่ optional ที่มี default — ตัวที่สี่ในอนาคตต้องถูกบังคับให้เลือกคำของตัวเอง
 * ไม่ใช่เงียบ ๆ ไปได้ข้อความของ 'audience' ที่บอกวิธีแก้ผิดเรื่อง
 */
export type MemberMenuOperation = 'audience' | 'publish' | 'delete'

const MEMBER_MENU_REMEDY: Record<MemberMenuOperation, string> = {
  audience: "changing its audience away from 'members'",
  publish: 'publishing it again',
  delete: 'deleting it',
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
 *
 * **Task 17 ขยายมาคุมอีกสองประตูที่พาไปลงสถานะเดียวกัน** (final review H1/H2) โดยไม่เพิ่ม code ใหม่
 * เพราะข้อเท็จจริงและทางแก้เป็นอันเดียวกันทั้งสามทาง:
 *
 * - `publish` ซ้ำบนเมนูที่เป็นเมนูสมาชิกอยู่ — publish สร้างเมนูใหม่บน LINE (id ใหม่เสมอ) เขียน id
 *   ใหม่ลงแถว แล้วลบตัวเก่าทิ้ง ไม่มีใครอัปเดต `channel.memberRichMenuId` ตาม สมาชิกทุกคนจึงหลุด
 *   จากเมนูที่ถูกลบ ขณะที่ pointer ยังชี้ id ที่ไม่มีอยู่แล้ว สวิตช์อ่านว่า "ปิด"
 *   `assertAudienceChangeAllowed` เริ่ม return early (pointer ไม่ตรงแล้ว) และ `linkNewMember`
 *   แจกเมนูที่ถูกลบให้สมาชิกใหม่ต่อไป — ไม่ใช่การหลบเลี่ยง: LINE ออก id ใหม่ทุก publish สมาชิก
 *   ทุกคนต้องถูกผูกใหม่อยู่แล้วไม่ว่าทางไหน เลือกได้แค่ว่าต้นทุนนั้นจะมองเห็นหรือถูกซ่อน
 * - `delete` แถวเมนูที่เป็นเมนูสมาชิกอยู่ — `deactivate` เริ่มด้วย `menus.findOne(id)` แล้ว 404
 *   pointer จึงกลับเป็น null ผ่านผลิตภัณฑ์ไม่ได้อีกเลย
 */
export class MenuActiveForMembersError extends CoreError {
  readonly code = 'menu_active_for_members'
  constructor(readonly menuId: string, readonly operation: MemberMenuOperation) {
    super(
      `rich menu ${menuId} is currently the channel's member menu; `
      + `turn the members toggle off before ${MEMBER_MENU_REMEDY[operation]}`,
    )
  }
}

/**
 * Task 17 / final review BLOCKER — ด้านกลับของ `MenuNotMembersAudienceError` ข้างบนแบบตรงตัว:
 * ที่นั่นกัน "เมนูป้าย all ถูกทำให้ live สำหรับสมาชิก" ที่นี่กัน "เมนูป้าย members ถูกทำให้ live
 * สำหรับทุกคน" ก่อนมีตัวนี้ ครึ่งหลังไม่มียามเลยสักด่าน ทั้งที่มันคือเส้นทาง**บังคับ**: สวิตช์
 * สมาชิกทำงานได้ต่อเมื่อเมนู publish แล้ว และปุ่ม publish เดียวที่มีใน editor ส่ง
 * `setAsDefault: true` ตายตัว — เมนูสมาชิกทุกตัวจึงถูกยัดให้ผู้ติดตามทุกคนก่อนจะได้เป็นของสมาชิก
 *
 * ครอบสามประตูเดียวกันทั้งหมด: `publishMenu` ที่ `setAsDefault: true`, `POST /menus/:id/default`
 * และ op `set-default` ของ scheduler (ซึ่งเป็นตัวที่ `writeDisplayPeriod` เคยตั้งไว้ให้เมนูสมาชิก
 * ได้ — ดู `MenuDisplayPeriodNotAllowedError` ข้างล่าง) ยามที่ชั้น scheduler ยังจำเป็นแม้ทางเขียน
 * ปิดแล้ว เพราะฐานข้อมูลที่อัปเกรดมาอาจมีแถว `set-default` ของเมนูสมาชิกค้างอยู่แล้วจริง ๆ
 *
 * 409 ไม่ใช่ 400 ด้วยเหตุผลเดียวกับพี่น้องของมัน — "เมนูนี้ยังทำสิ่งที่ขอไม่ได้" ไม่ใช่ "คำขอผิดรูป"
 */
export class MenuNotAllAudienceError extends CoreError {
  readonly code = 'menu_not_all_audience'
  constructor(readonly menuId: string) {
    super(
      `rich menu ${menuId} is not audience:'all'; making it the account default would show it to `
      + "every follower — change its audience to 'all' first",
    )
  }
}

/**
 * Task 17 / deferred item 3 — ย้ายเมนูที่เคยขึ้น LINE แล้วไปอยู่ channel อื่นไม่ได้
 *
 * `saveMenu` เขียน `channelId` จาก input ตรง ๆ ทุกครั้ง การย้ายเมนูสมาชิกที่ยัง live อยู่ไป channel
 * อื่นโดยคง `audience: 'members'` ไว้ จึงข้าม `assertAudienceChangeAllowed` ทั้งด่าน (มัน return
 * early ที่ `next === 'members'` ก่อนจะได้อ่าน channel ด้วยซ้ำ) ผลคือ pointer ของ channel ต้นทาง
 * ยังชี้เมนูที่ย้ายไปแล้ว ส่วน `deactivate` ไปอ่าน channel ปลายทางแทน — ล้างของต้นทางไม่ได้อีกเลย
 * สถานะเดียวกับการลบแถวทิ้ง (H2) เป๊ะ ๆ
 *
 * เงื่อนไขคือ `lineRichMenuId !== null` ไม่ใช่ `status === 'published'` — ข้อเท็จจริงที่ทำให้การ
 * ย้ายไม่มีความหมายคือ "มีเมนูตัวจริงอยู่บนบัญชี LINE ของ channel เดิม" ซึ่งเป็นจริงกับแถว
 * `publishing`/`failed` ที่ถือ id ค้างไว้ด้วย ไม่ใช่แค่แถวที่ status เป็น published พอดี
 */
export class MenuChannelLockedError extends CoreError {
  readonly code = 'menu_channel_locked'
  constructor(readonly menuId: string) {
    super(
      `rich menu ${menuId} already exists on its channel's LINE account; `
      + 'it cannot be moved to another channel',
    )
  }
}

/**
 * Task 17 item 5 — ช่วงเวลาแสดงผลบนเมนูสมาชิก
 *
 * `writeDisplayPeriod` แปลง `startAt`/`endAt` เป็นแถว `set-default`/`clear-default` โดยไม่ดู
 * `audience` เลย เมนูสมาชิกที่มีช่วงเวลาแสดงผลจึงถูกยัดให้ผู้ติดตามทุกคนเมื่อถึงเวลาเริ่ม —
 * ประตูที่สองของ BLOCKER เดียวกันกับ `MenuNotAllAudienceError` แต่มาแบบตั้งเวลาไว้ล่วงหน้า
 *
 * **ไม่**แปลงมันเป็นการตั้งเวลา `link-members`/`unlink-members` แทนในงานนี้: การทำแบบนั้นต้องย้าย
 * pointer `memberRichMenuId` ตามไปด้วยเพื่อรักษาสมการสามฝ่าย ซึ่งเป็น semantics ใหม่ของ scheduler
 * ทั้งชุด ต้องออกแบบเป็นงานของตัวเอง ไม่ใช่แถมมาในรอบแก้บั๊ก (บันทึกเป็น follow-up ไว้แล้ว)
 *
 * ไม่พก menuId เหมือน error ตัวอื่นในไฟล์นี้ เพราะด่านนี้ทำงานตอน **create** ได้ด้วย ซึ่งยังไม่มี
 * แถวและยังไม่มี id ให้อ้าง — ผู้เรียกรู้อยู่แล้วว่าตัวเองเพิ่งส่งเมนูตัวไหนมา
 */
export class MenuDisplayPeriodNotAllowedError extends CoreError {
  readonly code = 'menu_display_period_not_allowed'
  constructor() {
    super(
      "a display period makes the menu the account default for everyone at its start time, so a menu "
      + "with audience:'members' cannot have one — clear the display period or change the audience to 'all'",
    )
  }
}

/** ไม่มี encryptionKey และไม่มี APP_KEYS[0] ให้ derive — ปฏิเสธตั้งแต่ตอน bootstrap */
export class EncryptionKeyMissingError extends CoreError {
  readonly code = 'encryption_key_missing'
}
