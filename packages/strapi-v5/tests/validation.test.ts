import { describe, expect, it } from 'vitest'
import { channelCreateSchema, idParam, listQuerySchema, menuInputSchema } from '../server/src/validation.js'

const menu = {
  name: 'เมนูหลัก',
  channelId: 'ch0000000000000000000001',
  size: 'large' as const,
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom' as const,
  selected: true,
  templateKey: null,
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'ไง' } }],
  imageFileId: 3,
  areaImages: [],
  aliasId: 'main',
  startAt: null,
  endAt: null,
}

/**
 * โน้ตส่งต่อของ Plan 03 บอกว่า `validation.ts` "ย้ายไปได้เกือบทั้งดุ้น" — จริงทุกบรรทัดยกเว้น
 * บรรทัดเดียวนี้ และมันเป็นบรรทัดที่ทำให้ทั้งปลั๊กอินใช้ไม่ได้ถ้าย้ายมาตรง ๆ
 *
 * v4 ใช้ `z.string().regex(/^\d+$/)` เพราะ id ของ v4 เป็นตัวเลข ส่วน documentId ของ v5
 * เป็นสตริงตัวอักษรผสมตัวเลข 24 ตัว regex ของ v4 จะปฏิเสธมันทุกตัว ผลคือ **ทุก route ที่มี
 * `:id` ตอบ 400 `validation_failed` เสมอ** ตั้งแต่คำขอแรก ซึ่งอ่านเหมือนฝั่ง UI ส่งของผิด
 */
describe('idParam ของ Strapi 5', () => {
  it('รับ documentId ที่เป็นตัวอักษรผสมตัวเลข', () => {
    expect(idParam.parse('kx91p2m4c7v0b8n3q5r6t7y8')).toBe('kx91p2m4c7v0b8n3q5r6t7y8')
  })

  it('ยังรับสตริงตัวเลขล้วน — id ของ admin user ที่ไหลมาทาง path ก็ยังต้องผ่าน', () => {
    expect(idParam.parse('7')).toBe('7')
  })

  it('ปฏิเสธค่าที่ว่าง ค่าที่ยาวเกินจริง และค่าที่มีอักขระที่ไม่ใช่ id', () => {
    for (const bad of ['', 'a'.repeat(65), '../../etc/passwd', 'ab cd', "a'or'1"]) {
      expect(() => idParam.parse(bad), bad).toThrow()
    }
  })
})

describe('menuInputSchema', () => {
  it('รับ payload ที่ครบและถูกต้อง', () => {
    expect(menuInputSchema.parse(menu).channelId).toBe('ch0000000000000000000001')
  })

  it('channelId เป็น documentId ไม่ใช่ตัวเลข', () => {
    expect(() => menuInputSchema.parse({ ...menu, channelId: 'ch0000000000000000000001' })).not.toThrow()
  })

  it('ปฏิเสธฟิลด์แปลกปลอม (สเปก §11.3 — .strict() ทุกตัว)', () => {
    expect(() => menuInputSchema.parse({ ...menu, extra: true })).toThrow()
  })

  it('chatBarText เกิน 14 ตัวไม่ผ่าน — ข้อจำกัดของ LINE เอง', () => {
    expect(() => menuInputSchema.parse({ ...menu, chatBarText: 'ก'.repeat(15) })).toThrow()
  })

  it('areas ต้องมี 1–20 ช่อง', () => {
    expect(() => menuInputSchema.parse({ ...menu, areas: [] })).toThrow()
    expect(() => menuInputSchema.parse({ ...menu, areas: Array.from({ length: 21 }, () => menu.areas[0]) })).toThrow()
  })

  it('imageFileId ยังเป็นตัวเลข — ไฟล์ของ upload plugin ไม่ใช่ document', () => {
    expect(() => menuInputSchema.parse({ ...menu, imageFileId: 'abc' })).toThrow()
    expect(menuInputSchema.parse({ ...menu, imageFileId: null }).imageFileId).toBeNull()
  })

  it('aliasId ต้องเป็น slug ที่ LINE รับได้', () => {
    expect(() => menuInputSchema.parse({ ...menu, aliasId: 'Main Menu' })).toThrow()
  })
})

describe('listQuerySchema', () => {
  it('channel เป็น documentId', () => {
    expect(listQuerySchema.parse({ channel: 'ch0000000000000000000001' }).channel)
      .toBe('ch0000000000000000000001')
  })

  it('ปฏิเสธ query แปลกปลอม', () => {
    expect(() => listQuerySchema.parse({ nope: '1' })).toThrow()
  })
})

describe('channelCreateSchema', () => {
  it('ปฏิเสธ token ที่ว่าง', () => {
    expect(() => channelCreateSchema.parse({ name: 'ร้าน', channelId: '165', channelAccessToken: '' })).toThrow()
  })
})
