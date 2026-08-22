/**
 * type ขั้นต่ำของ global `strapi` เท่าที่ adapter นี้ใช้จริง
 *
 * ตั้งใจไม่ `import type { Core } from '@strapi/strapi'` ด้วยเหตุผลเดียวกับที่ v4 ไม่ทำ:
 * type ของ CMS กว้างมาก ผูกกับ minor version และดึงทั้งแพ็กเกจเข้ามาในกราฟ typecheck
 * ไฟล์นี้ประกาศเฉพาะสิ่งที่ถูกเรียกจริง ซึ่งเป็นเซ็ตที่เล็กและตรวจด้วยตาได้ทั้งหมด
 */
export interface StrapiLogger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** พารามิเตอร์ของ Document Service เท่าที่ repo ใช้ — ทุกตัวเป็น optional ตามของจริง */
export interface DocumentParams {
  documentId?: string
  data?: unknown
  filters?: Record<string, unknown>
  sort?: string
  populate?: string[]
  fields?: string[]
  start?: number
  limit?: number
}

export interface DocumentsApi {
  findMany(params?: DocumentParams): Promise<unknown[]>
  findOne(params: DocumentParams & { documentId: string }): Promise<unknown>
  create(params: DocumentParams & { data: unknown }): Promise<unknown>
  update(params: DocumentParams & { documentId: string; data: unknown }): Promise<unknown>
  delete(params: DocumentParams & { documentId: string }): Promise<unknown>
}

/** Query Engine เท่าที่ adapter นี้ใช้จริง — ดูเหตุผลที่ต้องมีมันเลยที่ `StrapiV5.db.query` */
export interface DbQuery {
  findOne(params: { where: Record<string, unknown> }): Promise<unknown>
}

/**
 * รูปทรงขั้นต่ำของ event ที่ `db.lifecycles` ส่งเข้า subscriber แต่ละตัว (`@strapi/database`
 * ประกาศไว้กว้างกว่านี้มากใน `Event`/`Params` แต่ adapter นี้ import เฉพาะสิ่งที่ใช้จริงเสมอ —
 * เหตุผลเดียวกับที่ `StrapiV5`/`DocumentsApi` ทั้งไฟล์ไม่ import type จาก `@strapi/*` ทั้งก้อน)
 *
 * `data`/`where` เป็น `Record<string, unknown>` ไม่ใช่ type ที่เจาะจงกว่านี้ เพราะรูปที่ห่อ
 * primary key ไว้ในนั้น (เลขดิบ, `{id}`, `{connect:[...]}`, `{set:[...]}`) ไม่มีเอกสารระบุตรง ๆ
 * ว่าที่ระดับ `db.lifecycles` จะเป็นแบบไหน — ผู้เรียก (`lifecycles.ts`) ต้องเผื่อเองแทนที่จะเชื่อ
 * type ที่แคบเกินจริง
 *
 * `state` คือช่องทางเดียวที่ `@strapi/database` มีไว้ให้ hook คู่ before/after ส่งของถึงกัน:
 * provider เก็บ `event.state` ที่ hook ตัวหน้าตั้งไว้ลง Map ที่คีย์ด้วย subscriber แล้วส่งกลับ
 * มาเป็น `event.state` ของ hook ตัวหลังในคำสั่งเดียวกัน (`lifecycles/index.ts` ของแพ็กเกจจริงที่
 * ติดตั้งอยู่ — ไม่ใช่เดาจากเอกสาร) Map ใบนั้นเกิดใหม่ต่อหนึ่งคำสั่ง ค่าที่ฝากไว้จึงถูกคีย์ด้วย
 * ตัวคำสั่งเองอยู่แล้ว การลบที่วิ่งพร้อมกันมองไม่เห็น state ของกันและกันโดยโครงสร้าง
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

export interface StrapiV5 {
  log: StrapiLogger
  config: { get<T>(path: string, defaultValue?: T): T }
  plugin(name: string): { service<T>(name: string): T; contentType(name: string): unknown }
  /** สเปก §2.1 — v5 แทน entityService ด้วยตัวนี้ และคืน `documentId` เป็นสตริง */
  documents(uid: string): DocumentsApi
  db: {
    connection: unknown
    /**
     * Task 13 รอบสอง — ชั้นเดียวที่ยังค้นแถวด้วย **primary key ตัวเลข** ได้ `documents()` รับแต่
     * `documentId` ส่วน event ของ `db.lifecycles` อยู่ใต้ document service จึงพูดด้วย primary key
     * เสมอ ตรงนี้คือจุดแปลระหว่างสองภาษานั้น (ดูคอมเมนต์ที่ `documentIdByPk` ใน lifecycles.ts)
     */
    query(uid: string): DbQuery
    /**
     * Task 20 item 5 (strapi-v5 M1) — `documents()`/`db.query()` ที่เกิดระหว่าง `fn` ทำงาน
     * เข้าร่วม transaction เดียวกันเองผ่าน `AsyncLocalStorage` ของ `@strapi/database` ไม่ต้อง
     * ส่ง `trx` ผ่านทุกเลเยอร์ — ดูคอมเมนต์เต็มที่ `Services.transaction` ใน container.ts
     */
    transaction<T>(fn: () => Promise<T>): Promise<T>
    /** Task 7 — `lifecycles.ts` ใช้ตัวนี้ผูก link/unlink สมาชิกเข้ากับ create/delete ของ line-member */
    lifecycles: { subscribe(subscriber: LifecycleSubscriber): void }
  }
  admin: { services: { permission: { actionProvider: { registerMany(actions: unknown[]): Promise<void> } } } }
  cron: { add(jobs: Record<string, unknown>): void }
  /** ใช้อ่านไฟล์ของ upload provider แบบ local ที่คืน url สัมพัทธ์ */
  dirs: { static: { public: string } }
}
