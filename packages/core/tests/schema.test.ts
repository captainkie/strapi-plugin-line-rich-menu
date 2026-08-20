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

  it('ปฏิเสธ URI ที่ไม่ใช่รูปแบบ URL เลย (parse ไม่ผ่านตั้งแต่ new URL())', () => {
    const areas = [{ ...base.areas[0], action: { type: 'uri', uri: 'not a url at all' } }]
    expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
  })

  it('บอกข้อความเตือน scheme ที่ถูกต้องจริงเมื่อ URI ใช้ scheme ต้องห้าม', () => {
    const areas = [{ ...base.areas[0], action: { type: 'uri', uri: 'javascript:alert(1)' } }]
    try {
      validateRichMenu({ ...base, areas })
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect((e as ValidationError).issues.some((i) => i.includes('uri ต้องขึ้นต้นด้วย https, http, tel หรือ line เท่านั้น'))).toBe(true)
    }
  })

  it('บอกข้อความเตือนขนาดผืนผ้าใบที่ถูกต้องจริงเมื่อขนาดไม่อยู่ใน allowlist', () => {
    try {
      validateRichMenu({ ...base, size: { width: 999, height: 999 } })
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect((e as ValidationError).issues.some((i) => i.includes('ขนาดผืนผ้าใบต้องเป็นขนาดที่ LINE รับเท่านั้น'))).toBe(true)
    }
  })

  it('บอกข้อความเตือนช่องล้นกรอบที่ถูกต้องจริง พร้อม path ไปที่ช่องนั้น', () => {
    const areas = [{ ...base.areas[0], bounds: { x: 2000, y: 0, width: 1000, height: 100 } }]
    try {
      validateRichMenu({ ...base, areas })
      expect.unreachable('ควรโยน error')
    } catch (e) {
      const issues = (e as ValidationError).issues
      expect(issues.some((i) => i.includes('ช่องนี้ล้นออกนอกผืนผ้าใบ'))).toBe(true)
      expect(issues.some((i) => i.startsWith('areas.0.bounds'))).toBe(true)
    }
  })

  it('ยอมรับช่องที่อยู่ตำแหน่งบวกจริง ๆ ไม่ใช่แค่ที่มุม (0,0)', () => {
    const areas = [{ bounds: { x: 100, y: 100, width: 500, height: 500 }, action: { type: 'message', text: 'hi' } }]
    expect(() => validateRichMenu({ ...base, areas })).not.toThrow()
  })

  describe('action type ที่เหลือทั้งหมด — ต้องมีเทสต์คลุมทุกแบบ ไม่ใช่แค่ message กับ uri', () => {
    const validByType: Record<string, unknown> = {
      camera: { type: 'camera', label: 'กล้อง' },
      cameraRoll: { type: 'cameraRoll', label: 'อัลบั้ม' },
      location: { type: 'location', label: 'ตำแหน่ง' },
      datetimepicker: { type: 'datetimepicker', data: 'pick', mode: 'date' },
      richmenuswitch: { type: 'richmenuswitch', richMenuAliasId: 'tab-a1_2', data: 'switch' },
      clipboard: { type: 'clipboard', clipboardText: 'copy me' },
      postback: { type: 'postback', data: 'go' },
    }

    for (const [type, action] of Object.entries(validByType)) {
      it(`ผ่านสำหรับ action แบบ ${type} ที่ถูกต้อง`, () => {
        const areas = [{ ...base.areas[0], action }]
        expect(() => validateRichMenu({ ...base, areas })).not.toThrow()
      })
    }

    it('camera/cameraRoll/location ต้องมี label เสมอ (ไม่ optional เหมือนแบบอื่น)', () => {
      for (const type of ['camera', 'cameraRoll', 'location']) {
        const areas = [{ ...base.areas[0], action: { type } }]
        expect(() => validateRichMenu({ ...base, areas }), `${type} ควรถูกปฏิเสธถ้าไม่มี label`).toThrow(ValidationError)
      }
    })

    it('datetimepicker ปฏิเสธ mode ที่ไม่รู้จัก', () => {
      const areas = [{ ...base.areas[0], action: { type: 'datetimepicker', data: 'pick', mode: 'century' } }]
      expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
    })

    it('datetimepicker รับ mode ได้ครบทั้งสามแบบ', () => {
      for (const mode of ['date', 'time', 'datetime']) {
        const areas = [{ ...base.areas[0], action: { type: 'datetimepicker', data: 'pick', mode } }]
        expect(() => validateRichMenu({ ...base, areas }), `mode ${mode} ควรผ่าน`).not.toThrow()
      }
    })

    it('clipboard ปฏิเสธ clipboardText ว่าง และที่ยาวเกิน 1000 ตัว', () => {
      const empty = [{ ...base.areas[0], action: { type: 'clipboard', clipboardText: '' } }]
      expect(() => validateRichMenu({ ...base, areas: empty })).toThrow(ValidationError)
      const tooLong = [{ ...base.areas[0], action: { type: 'clipboard', clipboardText: 'x'.repeat(1001) } }]
      expect(() => validateRichMenu({ ...base, areas: tooLong })).toThrow(ValidationError)
      const atLimit = [{ ...base.areas[0], action: { type: 'clipboard', clipboardText: 'x'.repeat(1000) } }]
      expect(() => validateRichMenu({ ...base, areas: atLimit })).not.toThrow()
    })

    it('ปฏิเสธฟิลด์แปลกปลอมในตัว action เอง เพราะ .strict() ระดับ action', () => {
      const areas = [{ ...base.areas[0], action: { type: 'camera', label: 'กล้อง', sneaky: 'x' } }]
      expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
    })

    it('label ของ action ยาวได้ถึง 20 ตัว แต่ 21 ตัวต้องปฏิเสธ', () => {
      const at20 = [{ ...base.areas[0], action: { type: 'message', label: 'x'.repeat(20), text: 'hi' } }]
      expect(() => validateRichMenu({ ...base, areas: at20 })).not.toThrow()
      const at21 = [{ ...base.areas[0], action: { type: 'message', label: 'x'.repeat(21), text: 'hi' } }]
      expect(() => validateRichMenu({ ...base, areas: at21 })).toThrow(ValidationError)
    })

    it('richMenuAliasId ยอมรับตัวอักษรผสมตัวเลข _ - ได้ และปฏิเสธความยาวเกิน 32', () => {
      const valid = [{ ...base.areas[0], action: { type: 'richmenuswitch', richMenuAliasId: 'tab-a1_2', data: 'x' } }]
      expect(() => validateRichMenu({ ...base, areas: valid })).not.toThrow()
      const tooLong = [{ ...base.areas[0], action: { type: 'richmenuswitch', richMenuAliasId: 'a'.repeat(33), data: 'x' } }]
      expect(() => validateRichMenu({ ...base, areas: tooLong })).toThrow(ValidationError)
    })

    it('richMenuAliasId ปฏิเสธตัวพิมพ์ใหญ่นำหน้าหรือสัญลักษณ์ต่อท้ายที่ไม่อนุญาต', () => {
      const leadingUpper = [{ ...base.areas[0], action: { type: 'richmenuswitch', richMenuAliasId: 'Xtab-a', data: 'x' } }]
      expect(() => validateRichMenu({ ...base, areas: leadingUpper })).toThrow(ValidationError)
      const trailingBang = [{ ...base.areas[0], action: { type: 'richmenuswitch', richMenuAliasId: 'tab-a!', data: 'x' } }]
      expect(() => validateRichMenu({ ...base, areas: trailingBang })).toThrow(ValidationError)
    })
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
