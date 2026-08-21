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

/** ไม่มี encryptionKey และไม่มี APP_KEYS[0] ให้ derive — ปฏิเสธตั้งแต่ตอน bootstrap */
export class EncryptionKeyMissingError extends CoreError {
  readonly code = 'encryption_key_missing'
}
