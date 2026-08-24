/**
 * ชั้น service ที่ใช้ร่วมกันระหว่าง adapter ของ Strapi 4 กับ 5
 *
 * ไม่มีบรรทัดไหนในโฟลเดอร์นี้ import `@strapi/*` — ทุกอย่างที่ต้องพึ่ง Strapi เข้ามาทาง
 * interface (`Repo<T>`, `ImageStore`, `KnexLike`) ที่ adapter เป็นคน implement
 * ดู design notes ข้อ 1 สำหรับเหตุผลที่ไม่ทำซ้ำในแต่ละ adapter
 */
export const SERVER_MODULE_MARKER = 'line-rich-menu/server'

export * from './types.js'
export * from './errors.js'
export * from './secrets.js'
export * from './scrub.js'
export * from './channels.js'
export * from './audit.js'
export * from './rate-limit.js'
export * from './images.js'
export * from './payload.js'
export * from './compensation.js'
export * from './publish.js'
export * from './menu-ops.js'
export * from './lock.js'
export * from './scheduler.js'
export * from './members.js'
