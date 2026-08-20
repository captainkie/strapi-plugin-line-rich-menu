import { z } from 'zod'
import { ValidationError, type ValidationIssue } from './errors.js'
import type { RichMenuPayload } from './types.js'

export const ALLOWED_URI_SCHEMES = ['https:', 'http:', 'tel:', 'line:'] as const

const ALLOWED_CANVAS = [
  '2500x1686', '2500x843', '1200x810', '1200x405', '800x540', '800x270',
] as const

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
  params: { code: 'uri_scheme_not_allowed' },
})

const label = z.string().min(1).max(20).optional()

const actionSchema = z.discriminatedUnion('type', [
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

const boundsSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict()

const sizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict().refine(
  (s) => (ALLOWED_CANVAS as readonly string[]).includes(`${s.width}x${s.height}`),
  {
    message: 'size must be one of the canvas sizes LINE accepts',
    params: { code: 'canvas_size_not_allowed' },
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
        params: { code: 'area_out_of_bounds' },
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
