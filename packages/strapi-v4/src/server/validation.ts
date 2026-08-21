import { z } from 'zod'
import { actionSchema, boundsSchema } from '@fosivo/line-rich-menu-core'

/**
 * `actionSchema` / `boundsSchema` ยืมมาจาก core ไม่ประกาศซ้ำ — สองที่ที่ประกาศกฎเดียวกัน
 * จะไม่ตรงกันในวันใดวันหนึ่งเสมอ แล้ว action ที่ผ่านด่าน route จะไปตายตอน publish แทน
 * ซึ่งเป็นตอนที่ผู้ใช้เสียเวลาไปแล้วและ LINE อาจถูกแตะไปแล้ว
 */
export const idParam = z.string().regex(/^\d+$/, 'id must be numeric')

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
}).strict()

export type MenuInput = z.infer<typeof menuInputSchema>

export const publishBodySchema = z.object({
  setAsDefault: z.boolean().default(false),
}).strict().default({})

export const listQuerySchema = z.object({
  channel: idParam.optional(),
}).strict()

export const setDefaultBodySchema = z.object({}).strict().default({})
