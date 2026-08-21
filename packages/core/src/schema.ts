import { z } from 'zod'
import { ValidationError, type ValidationIssue } from './errors.js'
import { isAllowedCanvas } from './templates.js'
import type { RichMenuPayload } from './types.js'

export const ALLOWED_URI_SCHEMES = ['https:', 'http:', 'tel:', 'line:'] as const

/**
 * รหัส validation ที่ schema นี้กำหนดเอง (ต่างจาก code มาตรฐานของ zod เช่น too_small, too_big,
 * unrecognized_keys ที่ใช้ค่าของ zod เองได้เลย ไม่ต้องประกาศซ้ำที่นี่ — ดูคอมเมนต์ของ
 * `toValidationIssue` ด้านล่าง)
 *
 * เป็นที่เดียวที่พิมพ์สตริงพวกนี้ — ทุกจุดที่ตั้ง `params: { code: ... }` ในไฟล์นี้อ้างกลับมาที่ค่า
 * ใน `VALIDATION_CODE_DEF` แทนพิมพ์ literal ซ้ำเอง (แพทเทิร์นเดียวกับ `SIZE_LADDER_DEF` →
 * `LINE_ALLOWED_SIZES` ใน templates.ts) เพื่อให้ `packages/ui/src/i18n/index.ts` (`validationKey`)
 * และเทสต์ guard ของมัน (`packages/ui/tests/i18n.test.ts`) import `VALIDATION_CODES` ไปตรวจว่า
 * คำแปลครบทุก code จริง แทนที่จะเทียบกับ list ที่ hand-copy มาจากที่นี่แล้วไม่มีทางรู้ว่าไฟล์นี้
 * เพิ่ม code ใหม่เมื่อไหร่ (นี่คือช่องโหว่ที่พบใน carry-forward ของ Plan 02 Task 13)
 */
const VALIDATION_CODE_DEF = {
  uriSchemeNotAllowed: 'uri_scheme_not_allowed',
  canvasSizeNotAllowed: 'canvas_size_not_allowed',
  areaOutOfBounds: 'area_out_of_bounds',
} as const

export const VALIDATION_CODES: readonly string[] = Object.freeze(Object.values(VALIDATION_CODE_DEF))

const uriString = z.string().min(1).max(1000).refine((value) => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return (ALLOWED_URI_SCHEMES as readonly string[]).includes(parsed.protocol)
}, {
  message: 'uri must use one of the allowed schemes: https, http, tel, line',
  params: { code: VALIDATION_CODE_DEF.uriSchemeNotAllowed },
})

const label = z.string().min(1).max(20).optional()

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('postback'), label, data: z.string().min(1).max(300), displayText: z.string().max(300).optional() }).strict(),
  z.object({ type: z.literal('message'), label, text: z.string().min(1).max(300) }).strict(),
  z.object({ type: z.literal('uri'), label, uri: uriString, altUri: z.object({ desktop: uriString }).strict().optional() }).strict(),
  z.object({
    type: z.literal('datetimepicker'), label, data: z.string().min(1).max(300),
    mode: z.enum(['date', 'time', 'datetime']),
    initial: z.string().optional(), max: z.string().optional(), min: z.string().optional(),
  }).strict(),
  z.object({ type: z.literal('camera'), label: z.string().min(1).max(20) }).strict(),
  z.object({ type: z.literal('cameraRoll'), label: z.string().min(1).max(20) }).strict(),
  z.object({ type: z.literal('location'), label: z.string().min(1).max(20) }).strict(),
  z.object({ type: z.literal('richmenuswitch'), label, richMenuAliasId: z.string().min(1).max(32).regex(/^[a-z0-9_-]+$/), data: z.string().min(1).max(300) }).strict(),
  z.object({ type: z.literal('clipboard'), label, clipboardText: z.string().min(1).max(1000) }).strict(),
])

export const boundsSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict()

const sizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict().refine(
  (s) => isAllowedCanvas(s),
  {
    message: 'size must be one of the canvas sizes LINE accepts',
    params: { code: VALIDATION_CODE_DEF.canvasSizeNotAllowed },
  },
)

export const richMenuPayloadSchema = z.object({
  size: sizeSchema,
  selected: z.boolean(),
  name: z.string().min(1).max(300),
  chatBarText: z.string().min(1).max(14),
  areas: z.array(z.object({ bounds: boundsSchema, action: actionSchema }).strict()).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  value.areas.forEach((area, index) => {
    const { x, y, width, height } = area.bounds
    if (x + width > value.size.width || y + height > value.size.height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['areas', index, 'bounds'],
        message: 'area falls outside the canvas',
        params: { code: VALIDATION_CODE_DEF.areaOutOfBounds },
      })
    }
  })
})

/**
 * zod ตั้ง code ของ issue ที่มาจาก refinement ของเราเองเป็น 'custom' ทุกตัวเหมือนกันหมด
 * จึงแนบคีย์จริงมาทาง params เพื่อให้ UI แยกออกว่าเป็นข้อไหน ส่วน issue ในตัวของ zod
 * (`too_small`, `too_big`, `unrecognized_keys`, ...) ใช้ code ของมันเองได้เลย
 */
function toValidationIssue(issue: z.ZodIssue): ValidationIssue {
  const params = issue.code === z.ZodIssueCode.custom
    ? (issue.params as { code?: string } | undefined)
    : undefined
  return {
    path: issue.path.join('.') || '(root)',
    code: params?.code ?? issue.code,
    message: issue.message,
  }
}

export function validateRichMenu(input: unknown): RichMenuPayload {
  const result = richMenuPayloadSchema.safeParse(input)
  if (!result.success) {
    throw new ValidationError(
      'rich menu payload failed validation',
      result.error.issues.map(toValidationIssue),
    )
  }
  return result.data as RichMenuPayload
}

/**
 * รหัสที่ทั้งสอง adapter แนบไว้ใน `params.code` ตอน superRefine ของ `menuInputSchema` ปฏิเสธ
 * ช่วงเวลาแสดงผลที่กลับหัว — เอกสารตัวเองว่าทำไม issue นี้เป็นของเรา ไม่ใช่ค่า 'custom' ดิบของ zod
 * (ดูคอมเมนต์ที่ `toValidationIssue` ด้านบน) แม้ `http-error.ts` ของทั้งสอง adapter จะยังไม่ได้
 * อ่าน `params` ตอนแปลง ZodError เป็น HTTP response ก็ตาม (ต่างจาก `toValidationIssue` ในไฟล์นี้)
 */
export const DISPLAY_PERIOD_ORDER_CODE = 'display_period_end_not_after_start'

/**
 * กฎเดียวที่ทั้งฟอร์มฝั่ง UI และ request schema ของทั้งสอง adapter ต้องเห็นตรงกัน: `endAt` ต้องอยู่
 * "หลัง" `startAt` เสมอ ไม่ใช่แค่ "ไม่ก่อน" — อยู่ในไฟล์เดียวกับ validation อื่นของเมนูแทนที่จะให้
 * แต่ละที่เขียนกฎเอง ซึ่งเป็นรูปแบบความผิดพลาดที่โปรเจกต์นี้เคยเจอมาแล้วครั้งหนึ่ง (rule ที่มีอยู่
 * แค่ชั้น UI คือ rule ที่อะไรก็ตามที่ไม่ใช่ฟอร์มของเราเดินข้ามไปได้เฉย ๆ)
 *
 * หมายเหตุ: ช่วงเวลาแสดงผลนี้**ไม่ใช่แนวคิดของ LINE เอง** — มันไม่ได้อยู่ใน `RichMenuPayload`
 * ที่ส่งให้ LINE เลยสักฟิลด์ (ดู `richMenuPayloadSchema` ด้านบน) แต่เป็นฟีเจอร์ของแอปนี้เอง ทำผ่าน
 * แถวตาราง schedule ที่ยิง set-default/clear-default ตามเวลา (ดู menu-write.ts ของทั้งสอง adapter)
 * จึงไม่มีเอกสาร API ของ LINE ให้ยึดว่า `endAt === startAt` ควรเป็นอะไร — **ที่นี่ถือว่าไม่ผ่าน**
 * (เป็นการตัดสินใจของเจ้าของโปรดักต์ตรง ๆ ไม่ใช่ค่าที่ LINE กำหนด): ช่วงเวลาที่ยาวเป็นศูนย์ไม่แสดง
 * เมนูให้ใครเห็นเลย ไม่ต่างจากไม่ตั้งช่วงเวลาที่ถูกต้องอะไรเลย
 *
 * คืน `true` (ผ่าน) ทันทีเมื่อฝั่งใดฝั่งหนึ่งว่าง (`null` ของ adapter หรือ `''` ของฟอร์ม — ยอมรับทั้ง
 * สองแบบเพื่อให้ทั้งสองจุดเรียกไม่ต้องแปลงค่าก่อนเรียก) — "ยังไม่ระบุ" ไม่ใช่ช่วงเวลาที่ต้องเรียงลำดับ
 * ตั้งแค่ฝั่งใดฝั่งหนึ่งไว้ก็เป็นค่าที่ถูกต้องอยู่แล้ว (schedule ฝั่งนั้นยิงเดี่ยว ๆ ได้ตามปกติ)
 */
export function isDisplayPeriodValid(startAt: string | null, endAt: string | null): boolean {
  if (startAt === null || startAt === '' || endAt === null || endAt === '') return true
  return new Date(endAt).getTime() > new Date(startAt).getTime()
}

/**
 * ประตูกัน drift ระหว่าง schema กับ type
 *
 * `validateRichMenu` ปิดท้ายด้วย `as RichMenuPayload` ซึ่งเป็นจุดเชื่อมเดียวระหว่างสองอย่างนี้
 * ที่เขียนกันคนละวันและต่างฝ่ายต่างตาม API ของ LINE เอง ถ้าวันไหนไม่ตรงกัน บรรทัดล่างจะพัง
 * ตอนคอมไพล์ทันที เพราะ `false` ไม่ผ่าน constraint `extends true`
 * (เขียนเป็น `? true : never` ไม่ได้ เพราะ `never extends true` เป็นจริงเสมอ — จะเงียบสนิท)
 */
type Assert<T extends true> = T
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _SchemaMatchesRichMenuPayload =
  Assert<z.infer<typeof richMenuPayloadSchema> extends RichMenuPayload ? true : false>
