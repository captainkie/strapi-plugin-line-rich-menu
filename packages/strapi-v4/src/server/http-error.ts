import { ZodError } from 'zod'
import { ValidationError, type ValidationIssue } from '@fosivo/line-rich-menu-core'
import { getServices } from './container.js'
import type { StrapiV4 } from './strapi.js'

export interface AdminContext {
  request: { body: unknown }
  query: Record<string, unknown>
  params: Record<string, string>
  state: { user?: { id: number } }
  status: number
  body: unknown
  set(field: string, value: string): void
}

/**
 * สเปก §11.7 — UI แปล `code` เป็นข้อความตามภาษา `code` (และ `path` ของแต่ละ issue) จึงเป็นสิ่งที่
 * ฟอร์มต้องพึ่งจริง ๆ
 *
 * Task 20 item 10 (strapi-v5 L5 — comment เดียวกันในไฟล์คู่ขนานนี้แก้ไปด้วย) — คอมเมนต์เดิมตรงนี้
 * บอกว่า "ไม่ส่ง message เด็ดขาด" ซึ่ง**ไม่ตรงกับโค้ดจริง**: `issuesOf()` ด้านล่างใส่ `issue.message`
 * ของ zod ไว้ในทุก issue และ `error.issues` ของ core's `ValidationError` ถูกส่งต่อดิบ ๆ — ไม่มี
 * live leak จริง (ดูเหตุผลเต็มในไฟล์ http-error.ts ของ strapi-v5) แต่กฎจริงคือ **"message เป็น
 * ข้อความอังกฤษสำหรับนักพัฒนา ต้องไม่มี credential ปนอยู่"** ไม่ใช่ "ไม่ส่ง message เลย"
 */
const STATUS_BY_CODE: Record<string, number> = {
  validation_failed: 400,
  channel_not_found: 404,
  menu_not_found: 404,
  menu_not_ready: 409,
  // Task 13 ruling — เมนูที่ publish แล้วแต่ audience ไม่ใช่ 'members' ยัง activate/sync ให้เป็น
  // เมนูสมาชิกไม่ได้ (ดู assertMembersAudience ใน core/server/menu-ops.ts) 409 เหมือน menu_not_ready
  // เพราะเป็น "เมนูนี้ยังทำสิ่งที่ขอไม่ได้" ไม่ใช่ 400 ที่แปลว่า "คำขอผิดรูปแบบ" แต่แยก code ออกจาก
  // menu_not_ready เพราะสาเหตุคนละเรื่องและแก้ต่างกัน (publish เมนู vs เปลี่ยน audience ของเมนู)
  menu_not_members_audience: 409,
  // Task 14b item 3 — ด้านกลับของ `menu_not_members_audience` ข้างบน: ถอดป้าย 'members' ออกจาก
  // เมนูที่กำลังเป็นเมนูสมาชิกของ channel อยู่จริงไม่ได้ ต้องปิดสวิตช์สมาชิกก่อน (ดู
  // `MenuActiveForMembersError` ใน core) 409 ด้วยเหตุผลเดียวกัน — "เมนูนี้ยังทำสิ่งที่ขอไม่ได้"
  // ไม่ใช่ "คำขอผิดรูปแบบ" — แต่คนละ code เพราะวิธีแก้ของผู้ใช้คนละอย่างกัน
  menu_active_for_members: 409,
  // Task 17 / final review BLOCKER — ด้านกลับของ `menu_not_members_audience` ที่ยังไม่เคยมียาม:
  // ทำให้เมนูที่ประกาศตัวว่าเป็นของสมาชิกกลายเป็น default ของบัญชี (= ผู้ติดตามทุกคนเห็น) ไม่ได้
  // ครอบทั้ง `POST /menus/:id/publish` ที่ setAsDefault, `POST /menus/:id/default` และ op
  // `set-default` ของ scheduler — ดู `MenuNotAllAudienceError` ใน core
  menu_not_all_audience: 409,
  // Task 17 / deferred item 3 — ย้ายเมนูที่มีตัวจริงอยู่บนบัญชี LINE ของ channel เดิมแล้วไป channel
  // อื่นไม่ได้ (`MenuChannelLockedError` ใน core) เส้นทางนี้เข้าถึงได้จาก admin API เท่านั้น ไม่ใช่
  // จาก editor — แต่นั่นคือเหตุผลที่ยามต้องอยู่ที่ชั้นนี้ ไม่ใช่ที่ฟอร์ม
  menu_channel_locked: 409,
  // Task 17 item 5 — ช่วงเวลาแสดงผลคือแถว set-default/clear-default ที่ตั้งเวลาไว้ เมนูสมาชิกจึงมี
  // ไม่ได้ (`MenuDisplayPeriodNotAllowedError` ใน core) 409 ไม่ใช่ 400 ทั้งที่มาจากฟอร์ม เพราะสิ่งที่
  // ผิดไม่ใช่รูปทรงของคำขอ แต่เป็นการรวมกันของสองฟิลด์ที่ต่างก็ถูกต้องในตัวเอง
  menu_display_period_not_allowed: 409,
  // Task 22 / review H-1 — ครึ่งที่เหลือของ class เดียวกับ `menu_not_all_audience` ข้างบน: ที่นั่น
  // กัน "เมนูป้าย members ถูกทำให้เป็น default ของบัญชี" ตัวนี้กันทางกลับ — เมนูที่**เป็น default
  // อยู่แล้ว**ถูกติดป้าย members ทีหลัง ปลายทางเดียวกันเป๊ะ (`MenuIsAccountDefaultError` ใน core)
  // คนละ code เพราะวิธีแก้คนละอย่าง: ตัวนั้นแก้ audience ของเมนู ตัวนี้ล้าง default ของบัญชีก่อน
  menu_is_account_default: 409,
  // Task 22 / review H-1 — ด่านข้างบนต้องอ่าน default จาก LINE จริง และการอ่านนั้นล้มได้ ล้มแล้ว
  // **ปฏิเสธ** ไม่ใช่ปล่อยผ่าน (`MenuDefaultUnknownError` ใน core) 409 ไม่ใช่ 502 ทั้งที่ต้นเหตุ
  // อยู่ที่ LINE เพราะสิ่งที่ผู้เรียกต้องรู้คือ "คำขอนี้ถูกปฏิเสธ" ส่วน LINE ที่ล่มเป็นเหตุผล
  // ไม่ใช่ตัวคำตอบ — แยก code จาก `menu_is_account_default` เพราะทางแก้คือแก้การเชื่อมต่อแล้วลองใหม่
  // ไม่ใช่ไปล้าง default ที่อาจไม่ได้ชี้มาที่เมนูนี้ด้วยซ้ำ
  menu_default_unknown: 409,
  alias_not_published: 409,
  publish_already_running: 409,
  publish_rate_limited: 429,
  encryption_key_missing: 500,
  crypto_envelope_invalid: 500,
  image_unsupported_format: 400,
  image_too_large: 400,
  image_pixel_limit_exceeded: 400,
  image_processing_failed: 400,
  line_auth_failed: 502,
  line_rejected_payload: 502,
  line_rate_limited: 502,
  line_server_error: 502,
  line_not_found: 502,
}

/**
 * zod ที่ขอบของ route โยน `ZodError` ไม่ใช่ `ValidationError` ของ core — ถ้าไม่แปลงตรงนี้
 * body ที่มีฟิลด์แปลกปลอมจะกลายเป็น 500 ซึ่งอ่านเหมือนเซิร์ฟเวอร์พัง ทั้งที่ผู้ใช้ส่งของผิดมา
 * แปลงเป็น `issues` รูปทรงเดียวกับของ core เพื่อให้ฟอร์มฝั่ง UI ชี้ลงช่องที่ผิดได้เหมือนกัน
 */
function issuesOf(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    code: issue.code,
    message: issue.message,
  }))
}

export function toHttpError(ctx: AdminContext, error: unknown): void {
  if (error instanceof ZodError) {
    ctx.status = 400
    ctx.body = { error: { code: 'validation_failed', issues: issuesOf(error) } }
    return
  }

  const code = (error as { code?: unknown } | null)?.code
  const known = typeof code === 'string' ? STATUS_BY_CODE[code] : undefined

  if (known === undefined) {
    ctx.status = 500
    ctx.body = { error: { code: 'internal_error' } }
    return
  }

  ctx.status = known
  if (known === 429) {
    const retryAfterMs = (error as { retryAfterMs?: number }).retryAfterMs ?? 1000
    ctx.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
  }

  ctx.body = error instanceof ValidationError
    ? { error: { code: 'validation_failed', issues: error.issues } }
    : { error: { code } }
}

/**
 * ห่อ handler ทุกตัวให้ error กลายเป็น response ที่มี code เสมอ ไม่ใช่ 500 เปล่า ๆ ของ koa
 *
 * Task 20 item 6 — เดิม catch ที่นี่ไม่ log อะไรเลย ต่างจาก strapi-v5 ที่ log 500 ทุกตัวผ่าน
 * scrubbed logger อยู่แล้ว ทั้งที่ branch นี้เพิ่งต่อหกเส้นทางใหม่ที่ผูก/ปลดสมาชิก LINE จริงเข้ากับยาม
 * ตัวนี้ (controllers/members.ts) — อะแดปเตอร์เดียวไม่มีร่องรอยอะไรเหลือให้ operator เลยสำหรับพื้นผิว
 * ที่ผลลัพธ์แพงที่สุดของทั้งโปรดักต์ log เฉพาะตอนที่ยังตกไปที่ `known === undefined` (500) เท่านั้น
 * ไม่ log error ที่ตอบเป็นรหัสรู้จักแล้ว (400/404/409/...) เพราะนั่นคือ input ของผู้ใช้ที่ถูกปฏิเสธ
 * ถูกต้องแล้ว ไม่ใช่ความผิดปกติที่ operator ต้องรู้ — คู่ขนานกับ strapi-v5/server/src/http-error.ts เป๊ะ
 *
 * ใช้ `getServices(strapi).logger` (scrubbed ผ่าน `createScrubbedLogger`) — ช่องเดียวกับที่
 * `tick.ts` ใช้อยู่แล้ว ไม่ใช่ `strapi.log` ดิบที่ไม่ผ่านการ scrub เลย ห่อด้วย try/catch อีกชั้น
 * เพราะ `getServices` เองมีสิทธิ์ throw ได้ (เช่น encryption key ยังตั้งไม่เสร็จ — `resolveEncryptionKey`
 * ในบูตแรกสุด) — ที่นี่ fallback ไปที่ `strapi.log.error` ดิบ (ไม่ scrub) เฉพาะตอนที่ scrubbed logger
 * ประกอบไม่ได้จริง ๆ ดีกว่าไม่ log อะไรเลย
 */
export function guard(
  strapi: StrapiV4,
  handler: (ctx: AdminContext) => Promise<void>,
): (ctx: AdminContext) => Promise<void> {
  return async (ctx) => {
    try {
      await handler(ctx)
    } catch (error) {
      toHttpError(ctx, error)
      if (ctx.status === 500) {
        try {
          getServices(strapi).logger.error('line-rich-menu: unhandled error in admin route', { error })
        } catch {
          strapi.log.error('line-rich-menu: unhandled error in admin route (scrubbed logger unavailable)', error)
        }
      }
    }
  }
}
