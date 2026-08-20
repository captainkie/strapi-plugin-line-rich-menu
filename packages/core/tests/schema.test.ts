import { describe, expect, it } from 'vitest'
import { ValidationError } from '../src/errors.js'
import { validateRichMenu } from '../src/schema.js'

const base = {
  size: { width: 2500, height: 1686 },
  selected: false,
  name: 'เมนูหลัก',
  chatBarText: 'เมนู',
  areas: [
    { bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } },
  ],
}

describe('validateRichMenu', () => {
  it('ผ่านสำหรับ payload ที่ถูกต้อง', () => {
    expect(validateRichMenu(base).name).toBe('เมนูหลัก')
  })

  it('ปฏิเสธ chatBarText ที่ยาวเกิน 14 ตัว', () => {
    expect(() => validateRichMenu({ ...base, chatBarText: 'x'.repeat(15) }))
      .toThrow(ValidationError)
  })

  it('ปฏิเสธ chatBarText ว่าง', () => {
    expect(() => validateRichMenu({ ...base, chatBarText: '' })).toThrow(ValidationError)
  })

  it('ปฏิเสธเมื่อมีช่องเกิน 20', () => {
    const areas = Array.from({ length: 21 }, () => base.areas[0])
    expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
  })

  it('ปฏิเสธเมื่อไม่มีช่องเลย', () => {
    expect(() => validateRichMenu({ ...base, areas: [] })).toThrow(ValidationError)
  })

  it('ปฏิเสธช่องที่ล้นออกนอกผืนผ้าใบ', () => {
    const areas = [{ ...base.areas[0], bounds: { x: 2000, y: 0, width: 1000, height: 100 } }]
    expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
  })

  it('ยอมให้ช่องซ้อนทับกันได้ เพราะ LINE อนุญาต', () => {
    const areas = [
      { bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'a' } },
      { bounds: { x: 0, y: 0, width: 100, height: 100 }, action: { type: 'message', text: 'b' } },
    ]
    expect(() => validateRichMenu({ ...base, areas })).not.toThrow()
  })

  it('ปฏิเสธขนาดผืนผ้าใบที่ LINE ไม่รับ', () => {
    expect(() => validateRichMenu({ ...base, size: { width: 1000, height: 1000 } }))
      .toThrow(ValidationError)
  })

  describe.each(['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd'])(
    'ยามกัน URI อันตราย: %s',
    (uri) => {
      it('ถูกปฏิเสธ', () => {
        const areas = [{ ...base.areas[0], action: { type: 'uri', uri } }]
        expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
      })
    },
  )

  describe.each(['https://example.com', 'http://example.com', 'tel:0812345678', 'line://ti/p/@abc'])(
    'URI ที่อนุญาต: %s',
    (uri) => {
      it('ผ่าน', () => {
        const areas = [{ ...base.areas[0], action: { type: 'uri', uri } }]
        expect(() => validateRichMenu({ ...base, areas })).not.toThrow()
      })
    },
  )

  it('ปฏิเสธ postback.data ที่ยาวเกิน 300 ตัว', () => {
    const areas = [{ ...base.areas[0], action: { type: 'postback', data: 'x'.repeat(301) } }]
    expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
  })

  it('ปฏิเสธฟิลด์แปลกปลอมที่ไม่มีในสเปก', () => {
    expect(() => validateRichMenu({ ...base, sneaky: true })).toThrow(ValidationError)
  })

  it('ใส่รายละเอียดข้อผิดพลาดมาใน issues ให้ UI เอาไปแสดงได้', () => {
    try {
      validateRichMenu({ ...base, chatBarText: '' })
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      expect((e as ValidationError).issues.length).toBeGreaterThan(0)
    }
  })
})

import fc from 'fast-check'

describe('property: bounds ที่ล้นกรอบต้องถูกปฏิเสธเสมอ', () => {
  it('ไม่ว่าจะสุ่มยังไง ถ้า x+width เกิน 2500 ต้องไม่ผ่าน', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2500 }),
        fc.integer({ min: 1, max: 5000 }),
        (x, width) => {
          fc.pre(x + width > 2500)
          const areas = [{
            bounds: { x, y: 0, width, height: 100 },
            action: { type: 'message', text: 'hi' },
          }]
          expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
        },
      ),
      { numRuns: 300 },
    )
  })
})
