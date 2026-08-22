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

export interface StrapiV5 {
  log: StrapiLogger
  config: { get<T>(path: string, defaultValue?: T): T }
  plugin(name: string): { service<T>(name: string): T; contentType(name: string): unknown }
  /** สเปก §2.1 — v5 แทน entityService ด้วยตัวนี้ และคืน `documentId` เป็นสตริง */
  documents(uid: string): DocumentsApi
  db: {
    connection: unknown
    query(uid: string): unknown
    /**
     * Task 20 item 5 (strapi-v5 M1) — `documents()`/`db.query()` ที่เกิดระหว่าง `fn` ทำงาน
     * เข้าร่วม transaction เดียวกันเองผ่าน `AsyncLocalStorage` ของ `@strapi/database` ไม่ต้อง
     * ส่ง `trx` ผ่านทุกเลเยอร์ — ดูคอมเมนต์เต็มที่ `Services.transaction` ใน container.ts
     */
    transaction<T>(fn: () => Promise<T>): Promise<T>
  }
  admin: { services: { permission: { actionProvider: { registerMany(actions: unknown[]): Promise<void> } } } }
  cron: { add(jobs: Record<string, unknown>): void }
  /** ใช้อ่านไฟล์ของ upload provider แบบ local ที่คืน url สัมพัทธ์ */
  dirs: { static: { public: string } }
}
