import type { Action, Bounds, RichMenuSize, RichMenuSizeName } from '../types.js'

/**
 * seam ของสเปก §6.2 — ชั้น service มองเห็น `id: string` เสมอ
 * v5 คืน `documentId` เป็น string อยู่แล้ว ส่วน v4 คืน `id` เป็น number แล้วแปลงที่ขอบ (Task 15)
 */
export interface ListParams {
  filters?: Record<string, string | number | boolean | null>
  /**
   * เพจแบบ keyset สำหรับ enrolment routine (members.ts, Task 2) — แยกจาก `filters` ที่เป็น
   * equality-only โดยตั้งใจ เพราะ "id มากกว่าค่านี้" ไม่ใช่เงื่อนไขเท่ากับ จะยัดลงในแมพเดิม
   * แล้วให้ adapter เดา key พิเศษก็ได้ แต่จะเป็นสัญญาที่ไม่ปรากฏใน type เลย — ผู้เขียน adapter
   * ใหม่ (Task 5/6) ต้องเห็นจาก interface ตรง ๆ ว่านี่คือ WHERE id > ? ไม่ใช่ WHERE idGreaterThan = ?
   */
  idGreaterThan?: string
  sort?: string
  limit?: number
  start?: number
  populate?: readonly string[]
}

export interface Repo<T> {
  findMany(params?: ListParams): Promise<T[]>
  findOne(id: string): Promise<T | null>
  create(data: Partial<T>): Promise<T>
  update(id: string, data: Partial<T>): Promise<T>
  delete(id: string): Promise<void>
}

export type MenuStatus = 'draft' | 'publishing' | 'published' | 'failed'
export type ScheduleOp = 'set-default' | 'clear-default' | 'swap-alias' | 'link-members'
export type ScheduleState = 'pending' | 'running' | 'done' | 'failed'
export type AuditAction =
  | 'publish' | 'set-default' | 'clear-default' | 'swap-alias' | 'delete' | 'channel-update'
  | 'link-members' | 'unlink-members'
export type AuditResult = 'success' | 'failure'

/** แถวดิบจาก DB — ฟิลด์ลับยังเป็น envelope `v1.<iv>.<tag>.<ct>` ที่ยังไม่ได้ถอด */
export interface ChannelRow {
  id: string
  name: string
  channelId: string
  channelAccessToken: string
  channelSecret: string | null
  /**
   * สี่ตัวท้ายของ access token เก็บเป็น plaintext แยกไว้ตั้งแต่ตอนเขียน
   * เพื่อให้เส้นทาง list/get **ไม่ต้องถอดรหัสอะไรเลย** ก็แสดง `••••••••abcd` ได้
   * ป้องกันแบบชั้นเดียวคือ "อย่าลืม redact" ส่วนแบบนี้คือ "ไม่มีอะไรให้ leak ตั้งแต่ต้น"
   */
  accessTokenLast4: string
  isDefault: boolean
  /**
   * เมนูที่ควรได้เมื่อ LINE user คนนั้นมีแถวใน line-member ของ channel นี้ — Task 5/6 เพิ่มคอลัมน์นี้
   * ไว้ในสคีมาของทั้งสอง adapter แล้ว Task 7 (v5) และ Task 8 (v4) ผูกเข้า `toRow` ของ repo ตัวเอง
   * ครบทั้งคู่แล้ว
   *
   * required ไม่ใช่ optional — เคย optional ไว้ชั่วคราวระหว่างที่ v4 ยังไม่ได้ผูกคอลัมน์นี้ เพื่อให้
   * v4 คอมไพล์ผ่านโดยไม่ต้องแก้พร้อมกับ v5 ตอนนี้ทั้งสอง adapter ผูกครบแล้วจึงบังคับกลับมาเป็น
   * required: adapter ตัวที่สามในอนาคตที่ลืมผูกคอลัมน์นี้เข้า `toRow` จะคอมไพล์ไม่ผ่านทันที
   * แทนที่จะเงียบแล้วไปโผล่เป็น `undefined` ที่ runtime
   */
  memberRichMenuId: string | null
}

/** สิ่งที่ออกจาก service ได้ — ไม่มีฟิลด์ลับ ไม่ว่าจะเป็น plaintext หรือ ciphertext */
export interface ChannelRecord {
  id: string
  name: string
  channelId: string
  /** `••••••••abcd` — สี่ตัวท้ายของ access token เท่านั้น (สเปก §11.2) */
  accessTokenPreview: string
  isDefault: boolean
  memberRichMenuId: string | null
}

export interface ChannelWithSecrets extends ChannelRecord {
  channelAccessToken: string
  channelSecret: string | null
}

export interface AreaRecord {
  bounds: Bounds
  action: Action
}

export interface RichMenuRow {
  id: string
  name: string
  channelId: string
  size: RichMenuSizeName
  chatBarText: string
  chatBarMode: 'default' | 'custom'
  selected: boolean
  templateKey: string | null
  areas: AreaRecord[]
  /** file id ของรูปที่ผู้ใช้อัปมาดิบ ๆ ผ่าน POST /upload */
  imageFileId: number | null
  areaImages: { index: number; fileId: number }[]
  /**
   * ผลของ normalize ที่ทำไว้ตอน save (design notes ข้อ 3) — publish อ่านตัวนี้อย่างเดียว
   * ไม่เคยเรียก sharp เอง `normalizedSize` คือขั้นบันไดที่รูป *ลงจริง* ไม่ใช่ที่ฟอร์มเชื่อว่าจะลง
   */
  normalizedFileId: number | null
  normalizedMime: 'image/jpeg' | 'image/png' | null
  normalizedSize: RichMenuSize | null
  aliasId: string | null
  status: MenuStatus
  lineRichMenuId: string | null
  publishedAt: string | null
  lastError: string | null
  /** Strapi เขียนให้เอง — `RichMenuSummary` ใน packages/ui/src/api.ts ต้องการฟิลด์นี้ */
  updatedAt: string
}

export interface ScheduleRow {
  id: string
  richMenuId: string
  runAt: string
  op: ScheduleOp
  state: ScheduleState
  lockedBy: string | null
  lockedAt: string | null
  lastError: string | null
  /**
   * id ของสมาชิกคนสุดท้ายที่ประมวลผลแล้ว ของงาน `link-members` — **ไม่ใช่ offset** (ดู
   * เหตุผลเต็มที่ `linkMemberChunk` ใน members.ts) งานชนิดอื่นไม่ใช้ฟิลด์นี้และปล่อยเป็น null
   * ตลอดอายุงาน ส่วน `link-members` เป็น null ก่อนเริ่ม pass แรกเท่านั้น
   */
  cursor: string | null
}

export interface AuditRow {
  id: string
  actorId: string | null
  action: AuditAction
  richMenuId: string | null
  channelId: string
  before: unknown
  after: unknown
  result: AuditResult
  errorCode: string | null
}

/** สเปก §7.2 — ค่าที่มาจาก config/plugins.js ของผู้ใช้ หลังผ่าน validator แล้ว */
export interface PluginConfig {
  encryptionKey: string | null
  scheduler: { enabled: boolean; cron: string; lockTtlMs: number }
  lineApiBaseUrl: string
  lineApiDataBaseUrl: string
  mockMode: boolean
  publishRateLimit: { capacity: number; refillPerMinute: number }
}
