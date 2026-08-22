/**
 * type ขั้นต่ำของ global `strapi` เท่าที่ adapter นี้ใช้จริง
 *
 * ตั้งใจไม่ `import type { Strapi } from '@strapi/strapi'` ด้วยสองเหตุผล:
 * type ของ v4 กว้างมากและหลายส่วนเป็น `any` อยู่แล้ว จึงไม่ได้ความปลอดภัยเพิ่ม และ
 * Strapi 4 หมดอายุการสนับสนุนไปแล้ว (30 เม.ย. 2026) — ไฟล์ที่ประกาศ shape เองแบบนี้
 * คอมไพล์ผ่านได้ทั้งบน v4 และ v5 ทำให้ตอนลูกค้าย้าย ไม่ต้องเขียนชั้น service ใหม่
 */
export interface StrapiLogger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/**
 * รูปทรงขั้นต่ำของ event ที่ `db.lifecycles` ส่งเข้า subscriber แต่ละตัว — v4 ใช้ `@strapi/database`
 * ตัวเดียวกับ v5 เป๊ะ (`db.lifecycles.subscribe` ไม่ใช่ของ v5 เท่านั้น) รูปทรง event จึงเหมือนกัน
 * ทุกประการ ต่างแค่ว่า relation/primary key ที่อยู่ในนั้นเป็นเลข id ตัวเลขของ v4 ไม่ใช่ documentId
 * ของ v5 — ไม่มีเอกสารระบุตรง ๆ ว่าที่ระดับนี้ (ก่อน entityService แนบ relation ให้) ค่าจะเป็น
 * เลข id ดิบ, object ที่ populate แล้ว (`{id}`), หรือรูป `{connect:[...]}`/`{set:[...]}`
 * ผู้เรียก (`lifecycles.ts`) ต้องเผื่อเองแทนที่จะเชื่อ type ที่แคบเกินจริง
 *
 * `state` คือช่องทางเดียวที่ `@strapi/database` มีไว้ให้ hook คู่ before/after ส่งของถึงกัน:
 * provider เก็บ `event.state` ที่ hook ตัวหน้าตั้งไว้ลง Map ที่คีย์ด้วย subscriber แล้วส่งกลับ
 * มาเป็น `event.state` ของ hook ตัวหลังในคำสั่งเดียวกัน (`createLifecyclesProvider` ของ 4.25.11
 * ที่ติดตั้งอยู่จริง เหมือน 5.x บรรทัดต่อบรรทัด) Map ใบนั้นเกิดใหม่ต่อหนึ่งคำสั่ง ค่าที่ฝากไว้จึง
 * ถูกคีย์ด้วยตัวคำสั่งเองอยู่แล้ว การลบที่วิ่งพร้อมกันมองไม่เห็น state ของกันและกันโดยโครงสร้าง
 */
export interface LifecycleEvent {
  params: { data?: Record<string, unknown>; where?: Record<string, unknown> }
  result?: Record<string, unknown>
  state?: Record<string, unknown>
}

export type LifecycleSubscriber = {
  models: string[]
  beforeCreate?(event: LifecycleEvent): Promise<void>
  beforeUpdate?(event: LifecycleEvent): Promise<void>
  afterCreate?(event: LifecycleEvent): Promise<void>
  beforeDelete?(event: LifecycleEvent): Promise<void>
  afterDelete?(event: LifecycleEvent): Promise<void>
}

export interface StrapiV4 {
  log: StrapiLogger
  config: { get<T>(path: string, defaultValue?: T): T }
  plugin(name: string): { service<T>(name: string): T; contentType(name: string): unknown }
  entityService: {
    findMany(uid: string, params?: unknown): Promise<unknown[]>
    findOne(uid: string, id: number | string, params?: unknown): Promise<unknown>
    create(uid: string, params: { data: unknown }): Promise<unknown>
    update(uid: string, id: number | string, params: { data: unknown }): Promise<unknown>
    delete(uid: string, id: number | string): Promise<unknown>
  }
  db: {
    connection: unknown
    /** Task 8 — `lifecycles.ts` ใช้ตัวนี้ผูก link/unlink สมาชิกเข้ากับ create/delete ของ line-member */
    lifecycles: { subscribe(subscriber: LifecycleSubscriber): void }
  }
  admin: { services: { permission: { actionProvider: { registerMany(actions: unknown[]): Promise<void> } } } }
  cron: { add(jobs: Record<string, unknown>): void }
  /** ใช้อ่านไฟล์ของ upload provider แบบ local ที่คืน url สัมพัทธ์ */
  dirs: { static: { public: string } }
}
