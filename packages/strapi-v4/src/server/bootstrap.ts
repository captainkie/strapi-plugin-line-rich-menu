import { createScrubbedLogger } from '@fosivo/line-rich-menu-core'
import { UID } from './content-types/index.js'
import { registerMemberLifecycles } from './lifecycles.js'
import { permissionActions } from './permissions.js'
import type { StrapiV4 } from './strapi.js'
import { registerCron } from './tick.js'

/**
 * ลงทะเบียนสี่สิทธิ์เข้า action provider ของ admin
 *
 * บน Community Edition (สเปก §6.3) สิทธิ์เหล่านี้ยังลงทะเบียนได้ปกติ แต่จะไปโผล่เฉพาะใน
 * role มาตรฐานสามตัว เพราะ CE ไม่มี custom role — ไม่ต้องทำอะไรเพิ่มและไม่ต้องดักกรณีนี้
 */
export async function registerPermissions(strapi: StrapiV4): Promise<void> {
  await strapi.admin.services.permission.actionProvider.registerMany([...permissionActions])
}

/**
 * เติม `audience = 'all'` ให้แถวที่ยังเป็น NULL — ครั้งเดียวตอนบูต และปลอดภัยที่จะรันซ้ำ
 *
 * ทำไมต้องมี: `default: 'all'` บน content-type ไม่เคยกลายเป็น DEFAULT ของฐานข้อมูล Strapi ใส่ค่านั้น
 * ให้ตอน *สร้างแถว* ผ่าน entity/document service เท่านั้น (ยืนยันแล้วบน SQLite และ PostgreSQL 16,
 * ทั้ง Strapi 4.25.11 และ 5.52.1 และบน install ใหม่ด้วย — task-15-report.md §"Step 2") ดังนั้นทุกเมนู
 * ที่มีอยู่ก่อนอัปเกรดจาก 1.0.0 จะถือ NULL ตลอดไป: หน้ารายการวาดคีย์แปล `audience.null` ที่ไม่มีอยู่
 * และการกด Save เมนูเก่าตอบ `400 validation_failed` บนฟิลด์ที่ผู้ใช้ไม่ได้แตะเลย
 *
 * ทำไมต้องมีทั้งคู่ (ตัวนี้ + `audienceOrAll` ใน repo.ts): ถ้ามีแต่การแปลงตอนอ่าน ฐานข้อมูลจะยังถือค่า
 * ที่ model บอกว่าเป็นไปไม่ได้เอาไว้ ใครก็ตามที่อ่านตารางโดยไม่ผ่าน repo (รายงาน, SQL ตรง ๆ, ปลั๊กอินอื่น)
 * ยังเห็น NULL — ถ้ามีแต่ backfill แถวที่มาถึงทีหลัง (restore, dump เก่า) ก็ยังเดินเข้า editor เป็น NULL ได้อยู่ดี
 *
 * `db.query().updateMany` ไม่ใช่ `documents()`/`entityService` โดยตั้งใจ: มันคือชั้นเดียวที่ยิง UPDATE
 * ทีเดียวทั้งตารางได้ และ where/data ของมันพูดด้วย **ชื่อ attribute** (`audience`) ไม่ใช่ชื่อคอลัมน์ดิบ
 * `@strapi/database` เป็นคนแปลงเป็นชื่อตาราง/คอลัมน์จริงของแต่ละ adapter ให้เอง จึงไม่มี SQL ดิบและไม่มี
 * ชื่อ `rich_menus` เขียนค้างไว้ที่ไหนเลย
 *
 * ไม่ล้มการบูตเด็ดขาด: การล้ม Strapi ทั้งอินสแตนซ์เพราะซ่อมข้อมูลไม่สำเร็จ แย่กว่าตัวข้อบกพร่องที่มันซ่อม
 * (ข้อบกพร่องทำให้แก้เมนูเก่าไม่ได้ การบูตไม่ขึ้นทำให้ทำอะไรไม่ได้เลย) — จับ error, log ให้อ่านออกว่า
 * *ผลคืออะไร* ไม่ใช่แค่ว่ามันล้ม แล้วปล่อยบูตเดินต่อ
 *
 * log ทุกครั้งพร้อมตัวเลข แม้ตัวเลขจะเป็น 0: backfill ที่เงียบสนิทแยกไม่ออกเลยจาก backfill ที่ไม่ได้ถูก
 * เรียก — คนที่กำลังไล่ว่าทำไมเมนูเก่ายังแก้ไม่ได้ ต้องอ่านจาก log ได้ว่ามันรันแล้วและเจอกี่แถว
 */
export async function backfillLegacyAudience(strapi: StrapiV4): Promise<void> {
  // scrub ทุก level ตามสเปก §11.2 — error ของ knex ที่หลุดออกมาจาก UPDATE พก config ของ connection
  // (รวม password ของ Postgres) ติดมาด้วยได้ ไม่ผ่าน getServices เพราะตัวนั้นล้มได้เองตอนบูต
  // (เช่นยังไม่ได้ตั้ง APP_KEYS) และการซ่อมข้อมูลต้องยังทำงานในสภาพนั้น
  const logger = createScrubbedLogger(strapi.log)
  try {
    const { count } = await strapi.db.query(UID.menu).updateMany({
      where: { audience: { $null: true } },
      data: { audience: 'all' },
    })
    logger.info(`line-rich-menu: audience backfill updated ${count} pre-existing rich menu row(s) to 'all'`)
  } catch (error) {
    logger.error(
      'line-rich-menu: audience backfill failed — rich menus that existed before this version will '
      + 'read audience as null: the admin list shows a missing label for them and saving one from the '
      + 'editor is rejected with validation_failed on "audience", a field the operator never touched. '
      + 'Boot continues; the next boot retries.',
      error,
    )
  }
}

export async function bootstrap({ strapi }: { strapi: StrapiV4 }): Promise<void> {
  await registerPermissions(strapi)
  // ก่อน registerCron/registerMemberLifecycles โดยตั้งใจ — ทั้งสองตัวนั้นเป็นการ *ลงทะเบียน*
  // ที่จะเริ่มแตะข้อมูลเมนูหลังจากนี้ การซ่อมแถวเก่าให้จบก่อนจึงเป็นลำดับที่อ่านแล้วตรงกับเจตนา
  // (ตัวมันเองกลืน error ทั้งหมดอยู่แล้ว จึงไม่มีทางกั้นสองบรรทัดข้างล่างไม่ให้ทำงาน)
  await backfillLegacyAudience(strapi)
  registerCron(strapi)
  registerMemberLifecycles(strapi)
}
