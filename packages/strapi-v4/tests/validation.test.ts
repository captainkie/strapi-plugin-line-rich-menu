import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  channelCreateSchema, idParam, listQuerySchema, menuInputSchema, publishBodySchema,
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
})
