import { ZodError } from 'zod'
import { ValidationError, type ValidationIssue } from '@fosivo/line-rich-menu-core'

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

/** ห่อ handler ทุกตัวให้ error กลายเป็น response ที่มี code เสมอ ไม่ใช่ 500 เปล่า ๆ ของ koa */
export function guard(
  handler: (ctx: AdminContext) => Promise<void>,
): (ctx: AdminContext) => Promise<void> {
  return async (ctx) => {
    try {
      await handler(ctx)
    } catch (error) {
      toHttpError(ctx, error)
    }
  }
}
