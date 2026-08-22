import { ZodError } from 'zod'
import { ValidationError, type ValidationIssue } from '@fosivo/line-rich-menu-core'
import { getServices } from './container.js'
import type { StrapiV5 } from './strapi.js'

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
 * Task 20 item 10 (strapi-v5 L5) — คอมเมนต์เดิมตรงนี้บอกว่า "ไม่ส่ง message เด็ดขาด" ซึ่ง**ไม่ตรง
 * กับโค้ดจริง**: `issuesOf()` ด้านล่างใส่ `issue.message` ของ zod ไว้ในทุก issue และ
 * `error.issues` ของ core's `ValidationError` (ก็มี `message` เหมือนกัน) ถูกส่งต่อดิบ ๆ ที่บรรทัด
 * `ctx.body = ... issues: error.issues` ด้านล่าง — ไม่มี live leak จริง (zod ฝัง received value
 * เฉพาะ `invalid_enum_value`/`invalid_literal`/`unrecognized_keys` และไม่มี field ที่เก็บ secret
 * ตัวไหนเป็น enum ใน schema ของเรา; message ของ core เองก็เป็น static string หรือ scope แค่ payload
 * ไม่เคย interpolate credential) แต่กฎจริงคือ **"message เป็นข้อความอังกฤษสำหรับนักพัฒนา ต้องไม่มี
 * credential ปนอยู่"** ไม่ใช่ "ไม่ส่ง message เลย" — แก้คอมเมนต์ให้ตรงกับกฎจริง ไม่ใช่กฎที่โค้ดไม่ได้ทำตาม
 */
const STATUS_BY_CODE: Record<string, number> = {
  validation_failed: 400,
  channel_not_found: 404,
  menu_not_found: 404,
  menu_not_ready: 409,
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

/**
 * Task 20 item 4 (strapi-v5 M2) — ด่านสำรองสำหรับ error ที่ `documents()`/`db.query()` ของ
 * Strapi 5 เองโยนออกมาโดยตรง (ไม่ใช่ error ของ core หรือ zod) เช่นตอน relation เขียนหา id ที่ไม่มีอยู่
 * จริง (`channelId` ที่ไม่ถูก resolve ไว้ก่อนใน saveMenu — ดูคอมเมนต์ที่นั่น) หรือ path อื่นที่ยังไม่
 * ถูกไล่เจอ `@strapi/utils`'s errors.d.ts` ประกาศ subclass พวกนี้ทุกตัวด้วย `name` คงที่เฉพาะของมัน
 * (`ValidationError`, `NotFoundError`, ...) แต่**ไม่มี** `code` เลยสักตัว (ตรวจกับซอร์สจริงที่ติดตั้ง
 * อยู่ใน examples/v5-app/node_modules — ไม่ใช่เดาจากเอกสาร) จึงตกไปที่ `known === undefined` → 500
 * `internal_error` เสมอ ทั้งที่ทุกตัวในนี้คือ "ผู้ใช้ส่งของผิด" ไม่ใช่ "เซิร์ฟเวอร์พัง"
 *
 * เช็คด้วย `error.name` ไม่ใช่ `instanceof` เพราะไม่อยาก import class จริงจาก `@strapi/utils` เข้ามา
 * ผูก compile-time กับแพ็กเกจที่เป็น peer ของ Strapi เอง — `name` ที่นี่ไม่ชนกับ error ในตัวของ
 * JavaScript เลยสักตัว (TypeError/RangeError/...) จึงไม่มีทางจับ error ภายในจริงของเราไปแปลงเป็น 4xx
 * โดยไม่ตั้งใจ ไม่ส่ง `message`/`details` ของ error พวกนี้ต่อ (เหมือนกับ error อื่นทุกตัวในไฟล์นี้)
 * เพราะรูปทรงของมันไม่ได้ผ่านการตรวจว่าปลอดภัยจะส่งออกเหมือน `ValidationError.issues` ของ core
 */
const STRAPI_UTILS_STATUS_BY_NAME: Record<string, { status: number; code: string }> = {
  ValidationError: { status: 400, code: 'validation_failed' },
  YupValidationError: { status: 400, code: 'validation_failed' },
  PaginationError: { status: 400, code: 'validation_failed' },
  NotFoundError: { status: 404, code: 'not_found' },
  ForbiddenError: { status: 403, code: 'forbidden' },
  PolicyError: { status: 403, code: 'forbidden' },
  UnauthorizedError: { status: 401, code: 'unauthorized' },
  RateLimitError: { status: 429, code: 'rate_limited' },
  PayloadTooLargeError: { status: 413, code: 'payload_too_large' },
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
    const name = (error as { name?: unknown } | null)?.name
    const fallback = typeof name === 'string' ? STRAPI_UTILS_STATUS_BY_NAME[name] : undefined
    if (fallback !== undefined) {
      ctx.status = fallback.status
      ctx.body = { error: { code: fallback.code } }
      return
    }
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
 * Task 20 item 10 (strapi-v5 L6) — เดิม catch ที่นี่ไม่ log อะไรเลย ผสมกับ M2/M3 (item 4, 6 ของ
 * task นี้) แล้ว 500 `internal_error` ทุกตัวก่อนหน้านั้นไม่เหลือร่องรอยอะไรให้ operator เลย: response
 * บอกแค่ 'internal_error' และ log ก็ไม่มี stack ไม่มี message ไม่มี name — log เฉพาะตอนที่ยังตกไปที่
 * `known === undefined` (500) เท่านั้น ไม่ log error ที่ตอบเป็นรหัสรู้จักแล้ว (400/404/409/...) เพราะ
 * นั่นคือ input ของผู้ใช้ที่ถูกปฏิเสธถูกต้องแล้ว ไม่ใช่ความผิดปกติที่ operator ต้องรู้
 *
 * ใช้ `getServices(strapi).logger` (scrubbed ผ่าน `createScrubbedLogger`) — ช่องเดียวกับที่
 * `tick.ts` ใช้อยู่แล้ว ไม่ใช่ `strapi.log` ดิบที่ไม่ผ่านการ scrub เลย ห่อด้วย try/catch อีกชั้น
 * เพราะ `getServices` เองมีสิทธิ์ throw ได้ (เช่น encryption key ยังตั้งไม่เสร็จ — `resolveEncryptionKey`
 * ในบูตแรกสุด) ซึ่งเป็นเคสเดียวกับที่ `tick.ts` มี "fallback ที่ไม่ต้องพึ่ง getServices สำเร็จ" ไว้แล้ว
 * — ที่นี่ fallback ไปที่ `strapi.log.error` ดิบ (ไม่ scrub) เฉพาะตอนที่ scrubbed logger ประกอบไม่ได้
 * จริง ๆ ดีกว่าไม่ log อะไรเลย
 */
export function guard(
  strapi: StrapiV5,
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
