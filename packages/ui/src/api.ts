import type { Action, Bounds } from '@fosivo/line-rich-menu-core/browser'

/**
 * สัญญาระหว่าง ui กับ adapter — adapter ของทั้ง Strapi 4 และ 5 ต้อง implement path เหล่านี้
 * ให้เหมือนกัน ui ไม่รู้ว่าเบื้องหลังเป็น entityService หรือ documents()
 */
export const ENDPOINTS = {
  channels: '/line-rich-menu/channels',
  channel: (id: string) => `/line-rich-menu/channels/${id}`,
  channelTest: (id: string) => `/line-rich-menu/channels/${id}/test`,
  channelReconcile: (id: string) => `/line-rich-menu/channels/${id}/reconcile`,
  channelOrphan: (id: string, lineRichMenuId: string) => `/line-rich-menu/channels/${id}/orphans/${lineRichMenuId}`,
  menus: '/line-rich-menu/menus',
  menu: (id: string) => `/line-rich-menu/menus/${id}`,
  menuPublish: (id: string) => `/line-rich-menu/menus/${id}/publish`,
  menuSetDefault: (id: string) => `/line-rich-menu/menus/${id}/default`,
  // Task 11 — :id ของสองเส้นนี้คือ "เมนู" (สลับเมนูของสมาชิกให้ชี้มาที่แถวนี้) ส่วน channelAudience
  // ใช้ :id ของ "channel" (บอกว่าตอนนี้ทุกคน/สมาชิกกำลังเห็นเมนูไหน) — คนละ resource กัน แม้ path
  // จะขึ้นต้นด้วย "audience" เหมือนกันก็ตาม
  menuAudienceActivate: (id: string) => `/line-rich-menu/menus/${id}/audience/activate`,
  menuAudienceDeactivate: (id: string) => `/line-rich-menu/menus/${id}/audience/deactivate`,
  channelAudience: (id: string) => `/line-rich-menu/channels/${id}/audience`,
  upload: '/upload',
} as const

export interface ChannelSummary {
  id: string
  name: string
  channelId: string
  /** สี่ตัวท้ายเท่านั้น — token เต็มไม่เคยออกจากฝั่งเซิร์ฟเวอร์ (สเปก §11.2) */
  accessTokenPreview: string
  isDefault: boolean
}

export interface RichMenuSummary {
  id: string
  title: string
  status: 'draft' | 'publishing' | 'published' | 'failed'
  channelId: string
  aliasId: string | null
  updatedAt: string
  /**
   * ห้าฟิลด์ล่างนี้เพิ่มเข้ามาเพื่อหน้ารายการแบบ LINE OA Manager — คอลัมน์ Image / Action /
   * Display period ของมันวาดจากตรงนี้ ไม่ใช่จากการยิง `GET /menus/:id` ทีละแถว ซึ่งเป็น N+1
   * ที่จะยิงสิบคำขอสำหรับรายการสิบแถว
   *
   * `size` + `areas` มาคู่กันเสมอ: ภาพย่อคือผังช่องที่วาดบนผืนผ้าใบขนาดนั้น ขาดตัวใดตัวหนึ่ง
   * ก็วาดไม่ได้ ส่วน `areas` ยังเป็นที่มาของคอลัมน์ Action ด้วย (ประเภท action ของแต่ละช่อง)
   */
  size: 'large' | 'compact'
  areas: { bounds: Bounds; action: Action }[]
  /** `null` เมื่อยังไม่ได้อัปโหลดรูป หรือไฟล์ถูกลบไปจาก Media Library แล้ว */
  imageUrl: string | null
  startAt: string | null
  endAt: string | null
  /** ใครควรเห็นเมนูนี้ — คอลัมน์ Audience ของหน้ารายการอ่านค่านี้ตรง ๆ (Task 11) */
  audience: 'all' | 'members'
  /**
   * id ฝั่ง LINE ของเมนูนี้ (ไม่ใช่ id แถวของเรา) — `null` จนกว่าจะ publish สำเร็จครั้งแรก
   * `CurrentMenuCard`/`AudienceToggle` เทียบค่านี้กับ `ChannelAudience.defaultRichMenuId`/
   * `memberRichMenuId` เพื่อบอกว่าแถวนี้คือเมนูที่ "active" อยู่ตอนนี้หรือไม่ (Task 11 — สเปก
   * "Active is derived, never stored" เทียบสด ไม่มีคอลัมน์ isActive เก็บไว้ที่ไหนเลย)
   */
  lineRichMenuId: string | null
}

/**
 * ผลของ `GET /channels/:id/audience` (Task 9/10) — ใครกำลังเห็นเมนูไหนอยู่ ณ ตอนนี้จริง ๆ
 * `defaultRichMenuId` มาจากการถาม LINE ตรง ๆ (`GET /v2/bot/user/all/richmenu`) ส่วน
 * `memberRichMenuId` มาจาก `channel.memberRichMenuId` — ทั้งคู่เป็น id ฝั่ง LINE เหมือนกัน
 * `null` แปลว่า "ยังไม่ได้ตั้ง" ทั้งคู่ ไม่ใช่ error
 */
export interface ChannelAudience {
  defaultRichMenuId: string | null
  memberRichMenuId: string | null
  /** จำนวนแถว line-member ของ channel นี้ — กล่องยืนยันก่อน activate ใช้บอกว่าจะกระทบกี่คน */
  memberCount: number
}

export interface BotInfo {
  userId: string
  basicId: string
  displayName: string
}

/**
 * ผลของ core's reconcileChannel — ไม่ import type จาก `@fosivo/line-rich-menu-core` ตรง ๆ
 * (ต่างจากไฟล์นี้ทั้งไฟล์ที่ประกาศ DTO เองเสมอ) เพราะ core ทั้ง package (ไม่ใช่ subpath `/browser`)
 * ลากโค้ดฝั่งเซิร์ฟเวอร์เข้ามาด้วย ซึ่งเป็นสิ่งที่ guard ของ Task 1 (`/browser` import) ห้ามไว้
 */
export interface ReconcileReport {
  /** อยู่บน LINE แต่ไม่มีแถวไหนใน DB อ้างถึง — มีปุ่มลบได้เพราะ id ฝั่ง LINE คือสิ่งเดียวที่มันมี */
  orphans: string[]
  /** DB บอกว่า published แต่ LINE ไม่มีแล้ว — ลบแถวไม่ได้แก้อะไร ต้อง publish ใหม่ */
  missing: string[]
}
