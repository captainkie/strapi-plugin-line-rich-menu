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
  db: { connection: unknown }
  admin: { services: { permission: { actionProvider: { registerMany(actions: unknown[]): Promise<void> } } } }
  cron: { add(jobs: Record<string, unknown>): void }
}
