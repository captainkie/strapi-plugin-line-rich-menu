import { z } from 'zod'
import { actionSchema, boundsSchema, DISPLAY_PERIOD_ORDER_CODE, isDisplayPeriodValid } from '@fosivo/line-rich-menu-core'

/**
 * `actionSchema` / `boundsSchema` ยืมมาจาก core ไม่ประกาศซ้ำ — สองที่ที่ประกาศกฎเดียวกัน
 * จะไม่ตรงกันในวันใดวันหนึ่งเสมอ แล้ว action ที่ผ่านด่าน route จะไปตายตอน publish แทน
 * ซึ่งเป็นตอนที่ผู้ใช้เสียเวลาไปแล้วและ LINE อาจถูกแตะไปแล้ว
 */

/**
 * ตัวระบุของ Strapi 5 คือ `documentId` — สตริงตัวพิมพ์เล็กผสมตัวเลข 24 ตัวที่ Strapi สร้างเอง
 * ไม่ใช่เลขจำนวนเต็มแบบ v4 การยก `/^\d+$/` ของ v4 มาตรง ๆ จะทำให้ทุก route ที่มี `:id`
 * ตอบ 400 ตั้งแต่คำขอแรก
 *
 * ยังคุมรูปทรงไว้แน่น ไม่ใช่ `z.string()` เปล่า ๆ — ค่านี้ถูกส่งต่อลงไปเป็นเงื่อนไข query และเป็น
 * ส่วนหนึ่งของ path เพราะฉะนั้นการจำกัดให้เหลือ [A-Za-z0-9_-] ยาวไม่เกิน 64 คือการปิดทั้ง
 * path traversal และการยัดอักขระควบคุมเข้าไปในชั้นที่อยู่ถัดไป โดยไม่ต้องเดาว่าชั้นนั้นกันไว้แล้วหรือยัง
 */
export const idParam = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'id must be a document id')

// รูปแบบ richMenuId ของ LINE ไม่ตายตัวเหมือน aliasId (ไม่ใช่ slug ที่เราตั้งเอง) จึงคุมได้แค่
// "ไม่ว่างและไม่ยาวเกินไป" — การยืนยันว่ามันคือกำพร้าจริงเกิดที่ deleteOrphan ของ core
// (ต้องเรียก reconcile ซ้ำ) ไม่ใช่ที่ชั้น validation นี้
export const lineRichMenuIdParam = z.string().min(1).max(64)

const isoDate = z.string().datetime({ offset: true })

export const channelCreateSchema = z.object({
  name: z.string().min(1).max(120),
  channelId: z.string().min(1).max(64),
  channelAccessToken: z.string().min(1).max(1000),
  channelSecret: z.string().max(1000).nullish(),
  isDefault: z.boolean().optional(),
}).strict()

export const channelUpdateSchema = channelCreateSchema.partial().strict()

export const menuInputSchema = z.object({
  name: z.string().min(1).max(300),
  channelId: idParam,
  size: z.enum(['large', 'compact']),
  chatBarText: z.string().max(14),
  chatBarMode: z.enum(['default', 'custom']),
  selected: z.boolean(),
  templateKey: z.string().max(64).nullable(),
  areas: z.array(z.object({ bounds: boundsSchema, action: actionSchema }).strict()).min(1).max(20),
  imageFileId: z.number().int().positive().nullable(),
  areaImages: z.array(z.object({ index: z.number().int().min(0).max(19), fileId: z.number().int().positive() }).strict()),
  // ตัวเดียวกับที่ LINE ยอมรับใน richMenuAliasId — ตรึงไว้ที่นี่ด้วยเพราะ alias เป็น slug
  // ที่ผู้ใช้ตั้งเอง (สเปก §9) และมันไปโผล่ใน URL ของ LINE ตรง ๆ
  aliasId: z.string().regex(/^[a-z0-9_-]+$/).max(32).nullable(),
  startAt: isoDate.nullable(),
  endAt: isoDate.nullable(),
}).strict().superRefine((value, ctx) => {
  // สเปกงานนี้ #4 — บังคับที่ขอบของ route ด้วย ไม่ใช่แค่ในฟอร์ม: RBAC กันคนนอกได้ แต่ไม่ได้การันตี
  // ว่าผู้เรียกคือฟอร์มของเรา (ดูคอมเมนต์เต็มที่ isDisplayPeriodValid ใน packages/core)
  if (!isDisplayPeriodValid(value.startAt, value.endAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endAt'],
      message: 'endAt must be strictly after startAt',
      params: { code: DISPLAY_PERIOD_ORDER_CODE },
    })
  }
})

export type MenuInput = z.infer<typeof menuInputSchema>

export const publishBodySchema = z.object({
  setAsDefault: z.boolean().default(false),
}).strict().default({})

export const listQuerySchema = z.object({
  channel: idParam.optional(),
}).strict()

export const setDefaultBodySchema = z.object({}).strict().default({})
