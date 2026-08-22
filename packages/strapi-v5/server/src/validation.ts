import { z } from 'zod'
import { boundsSchema, DISPLAY_PERIOD_ORDER_CODE, draftActionSchema, isDisplayPeriodValid } from '@fosivo/line-rich-menu-core'

/**
 * `draftActionSchema` / `boundsSchema` ยืมมาจาก core ไม่ประกาศซ้ำ — สองที่ที่ประกาศกฎเดียวกัน
 * จะไม่ตรงกันในวันใดวันหนึ่งเสมอ แล้ว action ที่ผ่านด่าน route จะไปตายตอน publish แทน
 * ซึ่งเป็นตอนที่ผู้ใช้เสียเวลาไปแล้วและ LINE อาจถูกแตะไปแล้ว
 *
 * ใช้ `draftActionSchema` (ผ่อนปรน) แทน `actionSchema` (เข้ม) ที่ระดับ route — endpoint นี้คือ
 * create/update ซึ่งเป็น "บันทึกร่าง" เสมอไม่ว่าผู้ใช้กดปุ่มไหน ("เผยแพร่" เป็นคำขอแยกต่างหากไป
 * `POST /menus/:id/publish` ดู `menus.ts:publish`) รูปทรงที่ LINE ต้องการครบถูกบังคับที่ชั้น publish
 * เท่านั้น ผ่าน `buildPayload`/`validateRichMenu` ใน `packages/core/src/server/payload.ts` ซึ่งยังใช้
 * `actionSchema` ตัวเข้มเดิม — สองด่านนี้ต่างกันโดยเจตนา ดูคอมเมนต์เต็มที่ `draftActionSchema`
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
  // min(0) ไม่ใช่ min(1) — ร่างที่ยังไม่ได้เลือก template เลยก็ต้องบันทึกได้ (bounds/areas ว่างเปล่า
  // เป็นสถานะจริงของ `emptyDraft()` ใน RichMenuEditor.tsx) ผังต้องมีอย่างน้อยหนึ่งช่องก็ต่อเมื่อจะ
  // publish เท่านั้น ซึ่งบังคับที่ `buildPayload` (`MenuNotReadyError('no_areas')`) ไม่ใช่ที่นี่
  areas: z.array(z.object({ bounds: boundsSchema, action: draftActionSchema }).strict()).min(0).max(20),
  imageFileId: z.number().int().positive().nullable(),
  areaImages: z.array(z.object({ index: z.number().int().min(0).max(19), fileId: z.number().int().positive() }).strict()),
  // ตัวเดียวกับที่ LINE ยอมรับใน richMenuAliasId — ตรึงไว้ที่นี่ด้วยเพราะ alias เป็น slug
  // ที่ผู้ใช้ตั้งเอง (สเปก §9) และมันไปโผล่ใน URL ของ LINE ตรง ๆ
  aliasId: z.string().regex(/^[a-z0-9_-]+$/).max(32).nullable(),
  startAt: isoDate.nullable(),
  endAt: isoDate.nullable(),
  // Task 13 ruling — เพิ่มเข้ามาปิดช่องที่ `audience` เคยประกาศไว้ในสคีมา (Task 5/6) แต่ไม่มี
  // เส้นทาง HTTP ไหนเขียนถึงมันได้เลย (ทั้ง `.strict()` เดิมไม่มีคีย์นี้ และ `saveMenu` ก็ไม่เคย
  // เขียนคีย์นี้ลง patch) `optional().default('all')` ทำให้ caller เดิมทุกตัว (ทั้ง UI และเทสต์ที่
  // ไม่ส่งฟิลด์นี้มา) ยังทำงานเหมือนเดิมทุกประการ — ไม่ต้องแก้ที่ไหนอื่นนอกจากที่นี่กับ `saveMenu`
  audience: z.enum(['all', 'members']).optional().default('all'),
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

/**
 * `count` (จำนวนสมาชิกของ channel) คิดจาก `findMany` ทั้งตาราง — ไม่มี `Repo.count()` ให้ใช้
 * (Task 11 fix round 1: เพิ่ม `Repo.count()` เป็นงานแยกต่างหาก ไม่ใช่ของ task นี้) จึงให้คำนวณ
 * เฉพาะตอนถูกขอจริงผ่าน query นี้ ไม่ใช่ทุกครั้งที่เรียก `/channels/:id/audience` — endpoint นี้
 * ถูกเรียกทุกครั้งที่เปิดหน้ารายการ (การ์ด + สวิตช์ทุกแถว) แต่ count มีประโยชน์แค่ตอนกล่องยืนยัน
 * activate ของ `ui.AudienceToggle` กำลังจะเปิดเท่านั้น
 */
export const audienceQuerySchema = z.object({
  count: z.literal('1').optional(),
}).strict()
