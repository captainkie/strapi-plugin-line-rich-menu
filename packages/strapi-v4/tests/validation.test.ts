import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  channelCreateSchema, idParam, lineRichMenuIdParam, listQuerySchema, menuInputSchema, publishBodySchema,
} from '../src/server/validation.js'

const validMenu = {
  name: 'เมนูหลัก',
  channelId: '10',
  size: 'large',
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom',
  selected: true,
  templateKey: 'RICH_MENU_TEMPLATE_201',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
  imageFileId: 11,
  areaImages: [],
  aliasId: 'tab-a',
  startAt: null,
  endAt: null,
}

describe('menuInputSchema', () => {
  it('ยอมรับ input ที่ถูกต้อง', () => {
    expect(menuInputSchema.parse(validMenu)).toMatchObject({ name: 'เมนูหลัก', channelId: '10' })
  })

  it('ปฏิเสธฟิลด์แปลกปลอมที่ระดับบนสุด', () => {
    expect(() => menuInputSchema.parse({ ...validMenu, isAdmin: true })).toThrow(ZodError)
  })

  it('ปฏิเสธฟิลด์แปลกปลอมที่อยู่ลึกใน action ด้วย — ไม่ใช่แค่ระดับบนสุด', () => {
    expect(() => menuInputSchema.parse({
      ...validMenu,
      areas: [{ bounds: validMenu.areas[0]!.bounds, action: { type: 'message', text: 'hi', evil: 1 } }],
    })).toThrow(ZodError)
  })

  it('ปฏิเสธ uri scheme ที่อันตราย ตั้งแต่ขอบของ route', () => {
    for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      expect(() => menuInputSchema.parse({
        ...validMenu,
        areas: [{ bounds: validMenu.areas[0]!.bounds, action: { type: 'uri', uri } }],
      }), uri).toThrow(ZodError)
    }
  })

  it('จำกัดจำนวนช่องที่ 1–20 และ chatBarText ที่ 14 ตัว', () => {
    expect(() => menuInputSchema.parse({ ...validMenu, areas: [] })).toThrow(ZodError)
    expect(() => menuInputSchema.parse({ ...validMenu, chatBarText: 'x'.repeat(15) })).toThrow(ZodError)
  })

  it('aliasId ต้องเป็น slug ที่ LINE ยอมรับ', () => {
    expect(() => menuInputSchema.parse({ ...validMenu, aliasId: 'Tab A!' })).toThrow(ZodError)
    expect(menuInputSchema.parse({ ...validMenu, aliasId: null }).aliasId).toBeNull()
  })

  // สเปกงานนี้ #4 — เกตนี้ต้องอยู่ที่ขอบของ route ด้วย ไม่ใช่แค่ในฟอร์ม เพราะ RBAC กันคนนอกได้
  // แต่ไม่ได้การันตีว่าผู้เรียกคือฟอร์มของเรา (คำขอที่ข้ามฟอร์มมาตรง ๆ ต้องโดนปฏิเสธเหมือนกัน)
  describe('ช่วงเวลาแสดงผล (startAt/endAt)', () => {
    it('ปฏิเสธเมื่อ endAt มาก่อน startAt', () => {
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: '2026-09-30T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z',
      })).toThrow(ZodError)
    })

    it('ปฏิเสธเมื่อ endAt เท่ากับ startAt เป๊ะ — ช่วงเวลายาวเป็นศูนย์ไม่แสดงเมนูให้ใครเลย', () => {
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z',
      })).toThrow(ZodError)
    })

    it('ยอมรับเมื่อ endAt อยู่หลัง startAt', () => {
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z',
      })).not.toThrow()
    })

    it('ยอมรับเมื่อฝั่งใดฝั่งหนึ่งเป็น null — ยังไม่ระบุไม่ใช่ช่วงเวลาที่ต้องเรียงลำดับ', () => {
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: null, endAt: '2026-09-30T00:00:00.000Z',
      })).not.toThrow()
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: '2026-09-01T00:00:00.000Z', endAt: null,
      })).not.toThrow()
    })
  })
})

describe('channelCreateSchema', () => {
  it('บังคับให้มี token และปฏิเสธฟิลด์แปลกปลอม', () => {
    expect(() => channelCreateSchema.parse({ name: 'x', channelId: '1' })).toThrow(ZodError)
    expect(() => channelCreateSchema.parse({
      name: 'x', channelId: '1', channelAccessToken: 't', role: 'super-admin',
    })).toThrow(ZodError)
  })
})

describe('idParam · listQuerySchema · publishBodySchema', () => {
  it('id ต้องเป็นตัวเลขล้วน', () => {
    expect(idParam.parse('12')).toBe('12')
    expect(() => idParam.parse('12; DROP TABLE x')).toThrow(ZodError)
  })

  it('query ที่ไม่รู้จักถูกปฏิเสธ', () => {
    expect(listQuerySchema.parse({ channel: '10' })).toEqual({ channel: '10' })
    expect(() => listQuerySchema.parse({ channel: '10', limit: '99999' })).toThrow(ZodError)
  })

  it('body ของ publish ว่างได้ และ default เป็นไม่ตั้ง default', () => {
    expect(publishBodySchema.parse(undefined)).toEqual({ setAsDefault: false })
  })

  it('lineRichMenuId ต้องไม่ว่างและไม่ยาวเกิน 64 ตัว', () => {
    expect(lineRichMenuIdParam.parse('richmenu-abc123')).toBe('richmenu-abc123')
    expect(() => lineRichMenuIdParam.parse('')).toThrow(ZodError)
    expect(() => lineRichMenuIdParam.parse('x'.repeat(65))).toThrow(ZodError)
  })
})
