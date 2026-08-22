import { describe, expect, it } from 'vitest'
import { ValidationError } from '../../src/errors.js'
import { AliasNotPublishedError, MenuNotReadyError } from '../../src/server/errors.js'
import {
  DEFAULT_CHAT_BAR_TEXT, buildPayload, publishedAliasesOf, resolveChatBarText, scaleBounds,
} from '../../src/server/payload.js'
import type { RichMenuRow } from '../../src/server/types.js'

function menu(overrides: Partial<RichMenuRow> = {}): RichMenuRow {
  return {
    id: '1', name: 'เมนูหลัก', channelId: '1', size: 'large',
    chatBarText: 'เปิดเมนู', chatBarMode: 'custom', selected: true,
    templateKey: 'RICH_MENU_TEMPLATE_201', areas: [
      { bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'สวัสดี' } },
    ],
    imageFileId: 11, areaImages: [],
    normalizedFileId: 900, normalizedMime: 'image/jpeg',
    normalizedSize: { width: 2500, height: 1686 },
    aliasId: 'main', status: 'draft', lineRichMenuId: null, publishedAt: null, lastError: null,
    updatedAt: '2026-08-20T00:00:00.000Z', audience: 'all',
    ...overrides,
  }
}

describe('resolveChatBarText', () => {
  it('โหมด custom ใช้ข้อความที่ผู้ใช้พิมพ์', () => {
    expect(resolveChatBarText({ chatBarMode: 'custom', chatBarText: 'เปิดเมนู' })).toBe('เปิดเมนู')
  })
  it('โหมด default เติมค่าคงที่ให้ ไม่ใช่ค่าว่าง — LINE บังคับให้มีฟิลด์นี้เสมอ', () => {
    expect(resolveChatBarText({ chatBarMode: 'default', chatBarText: '' })).toBe(DEFAULT_CHAT_BAR_TEXT)
    expect(resolveChatBarText({ chatBarMode: 'default', chatBarText: 'ถูกละเลย' })).toBe(DEFAULT_CHAT_BAR_TEXT)
  })
})

describe('scaleBounds', () => {
  it('อัตราส่วน 1 คืนตัวเลขเดิมเป๊ะ ไม่ใช่ค่าที่ปัดแล้วเพี้ยน', () => {
    const from = { width: 2500, height: 1686 }
    const bounds = { x: 833, y: 0, width: 834, height: 843 }
    expect(scaleBounds(bounds, from, from)).toEqual(bounds)
  })

  it('ย่อลงขั้นบันไดถัดไปแล้วยังอยู่ในกรอบ', () => {
    const scaled = scaleBounds(
      { x: 1250, y: 843, width: 1250, height: 843 },
      { width: 2500, height: 1686 },
      { width: 1200, height: 810 },
    )
    expect(scaled.x + scaled.width).toBeLessThanOrEqual(1200)
    expect(scaled.y + scaled.height).toBeLessThanOrEqual(810)
    expect(scaled.width).toBeGreaterThan(0)
    expect(scaled.height).toBeGreaterThan(0)
  })
})

describe('publishedAliasesOf', () => {
  it('นับเฉพาะเมนูที่ publish แล้วและมี alias กับ id จาก LINE จริง', () => {
    const rows = [
      menu({ id: '1', aliasId: 'tab-a', status: 'published', lineRichMenuId: 'richmenu-a' }),
      menu({ id: '2', aliasId: 'tab-b', status: 'draft', lineRichMenuId: null }),
      menu({ id: '3', aliasId: null, status: 'published', lineRichMenuId: 'richmenu-c' }),
    ]
    expect([...publishedAliasesOf(rows)]).toEqual(['tab-a'])
  })
})

describe('buildPayload', () => {
  it('ประกอบ payload จากแถวในฐานข้อมูลและผ่าน validateRichMenu ของ core', () => {
    const payload = buildPayload(menu(), new Set())
    expect(payload.size).toEqual({ width: 2500, height: 1686 })
    expect(payload.chatBarText).toBe('เปิดเมนู')
    expect(payload.selected).toBe(true)
    expect(payload.areas).toHaveLength(1)
  })

  it('size มาจากขั้นบันไดที่รูปลงจริง และ bounds ถูกย่อตามไปด้วย', () => {
    const payload = buildPayload(menu({ normalizedSize: { width: 1200, height: 810 } }), new Set())
    expect(payload.size).toEqual({ width: 1200, height: 810 })
    expect(payload.areas[0]!.bounds).toEqual({ x: 0, y: 0, width: 1200, height: 810 })
  })

  it('ยังไม่มีรูปที่ normalize แล้วโยน MenuNotReadyError', () => {
    expect(() => buildPayload(menu({ normalizedSize: null, normalizedFileId: null }), new Set()))
      .toThrow(MenuNotReadyError)
  })

  it('ไม่มีช่องเลยโยน MenuNotReadyError ไม่ใช่ปล่อยให้ LINE ปฏิเสธ', () => {
    expect(() => buildPayload(menu({ areas: [] }), new Set())).toThrow(MenuNotReadyError)
  })

  it('ขนาดที่เก็บกับขั้นบันไดที่รูปลงไม่ตรงตระกูลกัน = แถวเสีย ต้อง prepare รูปใหม่', () => {
    expect(() => buildPayload(menu({ normalizedSize: { width: 2500, height: 843 } }), new Set()))
      .toThrow(MenuNotReadyError)
  })

  it('richmenuswitch ที่ชี้ไป alias ที่ยังไม่ publish โยน AliasNotPublishedError พร้อมชื่อ alias', () => {
    const withSwitch = menu({
      areas: [{
        bounds: { x: 0, y: 0, width: 2500, height: 1686 },
        action: { type: 'richmenuswitch', richMenuAliasId: 'tab-b', data: 'go' },
      }],
    })
    expect(() => buildPayload(withSwitch, new Set())).toThrow(AliasNotPublishedError)
    expect(() => buildPayload(withSwitch, new Set(['tab-b']))).not.toThrow()
  })

  it('payload ที่ผิดกฎของ LINE ยังโยน ValidationError ของ core เหมือนเดิม', () => {
    expect(() => buildPayload(menu({ chatBarMode: 'custom', chatBarText: 'ยาวเกินสิบสี่ตัวอักษรแน่นอน' }), new Set()))
      .toThrow(ValidationError)
  })
})
