import { describe, expect, it } from 'vitest'
import { ValidationError, type ValidationIssue } from '../src/errors.js'
import {
  actionSchema, draftActionSchema, DISPLAY_PERIOD_ORDER_CODE, isDisplayPeriodValid, validateRichMenu,
  VALIDATION_CODES,
} from '../src/schema.js'

/** เรียก validateRichMenu แล้วคืน issues ที่ได้ — ล้มเทสต์ถ้ามันดันผ่าน */
function issuesOf(input: unknown): readonly ValidationIssue[] {
  try {
    validateRichMenu(input)
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError)
    return (e as ValidationError).issues
  }
  expect.unreachable('validateRichMenu ควรโยน ValidationError')
}

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

  it('ใส่รายละเอียดข้อผิดพลาดมาใน issues ให้ UI เอาไปแปลได้', () => {
    const issues = issuesOf({ ...base, chatBarText: '' })
    expect(issues.length).toBeGreaterThan(0)
    // สเปก 11.7 กับ 12: core ปล่อย code ออกมา ไม่ใช่ข้อความสำเร็จรูปภาษาใดภาษาหนึ่ง
    // ('en' เป็นค่าเริ่มต้น การฝังไทยไว้ตรงนี้แปลว่า admin ที่ใช้อังกฤษจะเห็นไทย)
    expect(issues.every((i) => typeof i.code === 'string' && i.code.length > 0)).toBe(true)
    expect(issues.every((i) => typeof i.path === 'string' && i.path.length > 0)).toBe(true)
    // เป็น code ของ zod เองที่นำกลับมาใช้ได้เลย ไม่ต้องประดิษฐ์ใหม่
    expect(issues.map((i) => i.code)).toContain('too_small')
  })

  it('message ของ issue เป็นอังกฤษล้วน ไม่มีอักษรไทยหลงมาให้ UI ต้องเดา', () => {
    const samples = [
      { ...base, chatBarText: '' },
      { ...base, size: { width: 999, height: 999 } },
      { ...base, areas: [{ ...base.areas[0], action: { type: 'uri', uri: 'javascript:alert(1)' } }] },
      { ...base, areas: [{ ...base.areas[0], bounds: { x: 2000, y: 0, width: 1000, height: 100 } }] },
      { ...base, sneaky: true },
    ]
    for (const sample of samples) {
      for (const issue of issuesOf(sample)) {
        expect(issue.message, `${issue.code} มีอักษรไทยอยู่ใน message`).not.toMatch(/[\u0E00-\u0E7F]/)
      }
    }
  })

  it('ปฏิเสธ URI ที่ไม่ใช่รูปแบบ URL เลย (parse ไม่ผ่านตั้งแต่ new URL())', () => {
    const areas = [{ ...base.areas[0], action: { type: 'uri', uri: 'not a url at all' } }]
    expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
  })

  it('URI ที่ใช้ scheme ต้องห้ามได้ code ที่แปลได้ ไม่ใช่ประโยคสำเร็จรูป', () => {
    const areas = [{ ...base.areas[0], action: { type: 'uri', uri: 'javascript:alert(1)' } }]
    expect(issuesOf({ ...base, areas }).map((i) => i.code)).toContain('uri_scheme_not_allowed')
  })

  it('ขนาดผืนผ้าใบที่ไม่อยู่ใน allowlist ได้ code canvas_size_not_allowed', () => {
    const issues = issuesOf({ ...base, size: { width: 999, height: 999 } })
    expect(issues.map((i) => i.code)).toContain('canvas_size_not_allowed')
    expect(issues.find((i) => i.code === 'canvas_size_not_allowed')?.path).toBe('size')
  })

  it('ช่องที่ล้นกรอบได้ code area_out_of_bounds พร้อม path ชี้ไปที่ช่องนั้น', () => {
    const areas = [{ ...base.areas[0], bounds: { x: 2000, y: 0, width: 1000, height: 100 } }]
    const issues = issuesOf({ ...base, areas })
    const found = issues.find((i) => i.code === 'area_out_of_bounds')
    expect(found).toBeDefined()
    expect(found?.path).toBe('areas.0.bounds')
  })

  it('ฟิลด์แปลกปลอมที่ระดับบนสุดได้ path เป็น (root) ไม่ใช่สตริงว่าง', () => {
    const issues = issuesOf({ ...base, sneaky: true })
    const found = issues.find((i) => i.code === 'unrecognized_keys')
    expect(found).toBeDefined()
    expect(found?.path).toBe('(root)')
  })

  // VALIDATION_CODES คือแหล่งเดียวที่ packages/ui/src/i18n (validationKey + เทสต์ guard ของมัน)
  // ใช้ตรวจว่าคำแปลของ validation.* ครบ — เทสต์นี้ปักหมุดว่ามันมีครบไม่ขาดไม่เกิน ถ้าใครเผลอลบ
  // code ออกจาก VALIDATION_CODE_DEF โดยที่ params: { code: ... } ยังอ้างถึงอยู่ ที่นี่จะพังก่อน
  // ให้เห็นตอนคอมไพล์อยู่แล้ว (ตัวแปรอ้างไม่ถึง) แต่ถ้าใครลบ entry ที่ไม่มี refinement ไหนอ้างถึง
  // เทสต์นี้จับ drift ของ "รายการ" ตรง ๆ แทนที่จะพึ่ง type error เพียงอย่างเดียว
  /**
   * Task 20 item 10 (ui-core L1) — `display_period_end_not_after_start` ย้ายเข้ามาอยู่ใน
   * VALIDATION_CODE_DEF แล้ว (เดิมอยู่นอกออบเจกต์นี้ ทำให้ i18n.test.ts ของ packages/ui ไม่เคยเห็น
   * มันเลย) จำนวนจึงเป็น 4 ไม่ใช่ 3 อีกต่อไป
   */
  it('VALIDATION_CODES มี code ที่ schema นี้ตั้งเองครบทั้ง 4 ตัว ไม่มากไม่น้อยกว่านี้', () => {
    expect([...VALIDATION_CODES].sort()).toEqual([
      'area_out_of_bounds', 'canvas_size_not_allowed',
      'display_period_end_not_after_start', 'uri_scheme_not_allowed',
    ])
  })

  it('ทุก code ใน VALIDATION_CODES โผล่จริงเป็น issue.code เมื่อ payload ผิดแบบที่ code นั้นตรวจ', () => {
    const uriIssues = issuesOf({
      ...base,
      areas: [{ ...base.areas[0], action: { type: 'uri', uri: 'javascript:alert(1)' } }],
    })
    expect(uriIssues.map((i) => i.code)).toContain('uri_scheme_not_allowed')

    const sizeIssues = issuesOf({ ...base, size: { width: 999, height: 999 } })
    expect(sizeIssues.map((i) => i.code)).toContain('canvas_size_not_allowed')

    const boundsIssues = issuesOf({
      ...base,
      areas: [{ ...base.areas[0], bounds: { x: 2000, y: 0, width: 1000, height: 100 } }],
    })
    expect(boundsIssues.map((i) => i.code)).toContain('area_out_of_bounds')

    // display_period_end_not_after_start ตั้งใจไม่รวมในลูปนี้ — มันไม่ใช่ code ที่
    // `richMenuPayloadSchema`/`validateRichMenu` ของไฟล์นี้ตรวจเลย (ช่วงเวลาแสดงผลไม่ใช่ฟิลด์ของ
    // RichMenuPayload ที่ส่งให้ LINE — ดูคอมเมนต์เต็มที่ isDisplayPeriodValid ด้านล่าง) แต่ถูก
    // emit จาก `menuInputSchema.superRefine` ของแต่ละ adapter (v4/v5 validation.ts) แทน — คนละ
    // schema กับที่เทสต์นี้ทดสอบ การเช็ค "ครบทุก code" (test ก่อนหน้า) ยังคุมว่า i18n ครบอยู่
    for (const code of VALIDATION_CODES) {
      if (code === DISPLAY_PERIOD_ORDER_CODE) continue
      const allEmitted = [...uriIssues, ...sizeIssues, ...boundsIssues].map((i) => i.code)
      expect(allEmitted, `${code} ไม่เคยถูกโค้ดจริง emit เลยสักครั้ง`).toContain(code)
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

/**
 * Task 20 item 1 (ui-core H2) — "Save draft" ต้องบันทึกงานที่ยังไม่เสร็จได้จริง `draftActionSchema`
 * คือด่านเดียวที่ยอมให้ action ไม่ครบ ส่วน `actionSchema` (ตัวที่ `richMenuPayloadSchema` ใช้ตอน
 * publish จริง) ต้องยังเข้มเหมือนเดิมทุกประการ — คู่เทสต์นี้พิสูจน์ว่าสอง schema "ต่างกันจริง"
 * ไม่ใช่แค่คนละชื่อที่พฤติกรรมเหมือนกันโดยบังเอิญ (ทำลาย guard ก่อนเชื่อ — ดู working agreement)
 */
describe('draftActionSchema', () => {
  it('ยอมรับ message.text ว่าง — actionSchema ตัวเข้มต้องปฏิเสธ payload เดียวกัน', () => {
    const draft = { type: 'message' as const, text: '' }
    expect(() => draftActionSchema.parse(draft)).not.toThrow()
    expect(() => actionSchema.parse(draft)).toThrow()
  })

  it('ยอมรับ uri.uri ว่าง (ไม่ผ่าน new URL() แน่นอน) — actionSchema ต้องปฏิเสธ', () => {
    const draft = { type: 'uri' as const, uri: '' }
    expect(() => draftActionSchema.parse(draft)).not.toThrow()
    expect(() => actionSchema.parse(draft)).toThrow()
  })

  /**
   * ด่านนี้ต้อง**ไม่**ผ่อนตาม min(1) — "กรอกไม่ครบ" แปลว่าว่างเท่านั้น ไม่ใช่ "ค่าอะไรก็ได้"
   * ไม่งั้นร่างจะรับ scheme อันตรายเข้าไปเก็บในฐานข้อมูลได้ตั้งแต่ขอบของ route (ดูคอมเมนต์เต็มที่
   * `draftActionSchema`) เทสต์คู่กับ "ปฏิเสธ uri scheme ที่อันตราย ตั้งแต่ขอบของ route" ในทั้งสอง
   * adapter ที่ยืนยันว่า menuInputSchema (ซึ่งใช้ draftActionSchema) ยังปฏิเสธเหมือนกัน
   */
  it('ปฏิเสธ uri ที่ไม่ว่างแต่ใช้ scheme อันตราย — ผ่อนแค่ "ว่างได้" ไม่ใช่ผ่อนรูปแบบ', () => {
    for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      expect(() => draftActionSchema.parse({ type: 'uri', uri }), uri).toThrow()
    }
  })

  it('ยอมรับ postback.data / datetimepicker.data / clipboard.clipboardText ว่าง', () => {
    expect(() => draftActionSchema.parse({ type: 'postback', data: '' })).not.toThrow()
    expect(() => draftActionSchema.parse({ type: 'datetimepicker', data: '', mode: 'date' })).not.toThrow()
    expect(() => draftActionSchema.parse({ type: 'clipboard', clipboardText: '' })).not.toThrow()
  })

  it('ยอมรับ camera/cameraRoll/location ที่ label ว่าง — actionSchema ต้องปฏิเสธ (LINE บังคับ label เสมอ)', () => {
    for (const type of ['camera', 'cameraRoll', 'location'] as const) {
      const draft = { type, label: '' }
      expect(() => draftActionSchema.parse(draft), type).not.toThrow()
      expect(() => actionSchema.parse(draft), type).toThrow()
    }
  })

  it('ยอมรับ richmenuswitch.richMenuAliasId ว่าง แต่ยังปฏิเสธ slug รูปแบบผิด (ไม่ใช่แค่ผ่อนให้รับขยะ)', () => {
    expect(() => draftActionSchema.parse({ type: 'richmenuswitch', richMenuAliasId: '', data: '' })).not.toThrow()
    expect(() => draftActionSchema.parse({ type: 'richmenuswitch', richMenuAliasId: 'Not Valid!', data: '' })).toThrow()
  })

  it('ยังคง .strict() — ฟิลด์แปลกปลอมถูกปฏิเสธเหมือน actionSchema', () => {
    expect(() => draftActionSchema.parse({ type: 'message', text: '', evil: 1 })).toThrow()
  })

  it('ยังคงเพดานความยาวสูงสุดไว้เหมือน actionSchema — ผ่อนแค่ "ต้องมีเนื้อหา" ไม่ใช่ผ่อนทุกอย่าง', () => {
    expect(() => draftActionSchema.parse({ type: 'message', text: 'x'.repeat(301) })).toThrow()
  })
})

import fc from 'fast-check'

// สเปกงานนี้ #4 — ไม่มีการตรวจลำดับ startAt/endAt อยู่ที่ไหนเลยก่อนหน้านี้ (ไม่ใช่แค่ในฟอร์ม
// ไม่ใช่แค่ใน packages/core ไม่ใช่ใน schema ของ adapter ไหนเลย) เมนูที่ endAt มาก่อน startAt
// บันทึกผ่านได้เงียบ ๆ แล้วไม่แสดงให้ใครเห็นเลย
describe('isDisplayPeriodValid', () => {
  it('ปฏิเสธเมื่อ endAt มาก่อน startAt', () => {
    expect(isDisplayPeriodValid('2026-09-30T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toBe(false)
  })

  // การตัดสินใจของเจ้าของโปรดักต์ (ไม่ใช่ค่าที่ LINE เอกสารไว้ — ดูคอมเมนต์ที่ schema.ts):
  // endAt === startAt ถือว่าไม่ผ่าน เพราะเป็นช่วงเวลายาวเป็นศูนย์ ไม่แสดงเมนูให้ใครเลย
  it('ปฏิเสธเมื่อ endAt เท่ากับ startAt เป๊ะ', () => {
    expect(isDisplayPeriodValid('2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toBe(false)
  })

  it('ผ่านเมื่อ endAt อยู่หลัง startAt', () => {
    expect(isDisplayPeriodValid('2026-09-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z')).toBe(true)
  })

  it('ผ่านเมื่อฝั่งใดฝั่งหนึ่ง (หรือทั้งคู่) เป็น null — ยังไม่ระบุไม่ใช่ช่วงเวลาที่ต้องเรียงลำดับ', () => {
    expect(isDisplayPeriodValid(null, '2026-09-30T00:00:00.000Z')).toBe(true)
    expect(isDisplayPeriodValid('2026-09-01T00:00:00.000Z', null)).toBe(true)
    expect(isDisplayPeriodValid(null, null)).toBe(true)
  })

  // ฟอร์มฝั่ง UI เก็บค่าที่ยังไม่ตั้งเป็น '' (ไม่ใช่ null) — ต้องรับได้เหมือนกันโดยไม่ต้องแปลงก่อนเรียก
  it('ผ่านเมื่อฝั่งใดฝั่งหนึ่งเป็นสตริงว่าง เหมือนกับ null', () => {
    expect(isDisplayPeriodValid('', '2026-09-30T00:00:00.000Z')).toBe(true)
    expect(isDisplayPeriodValid('2026-09-01T00:00:00.000Z', '')).toBe(true)
  })
})

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
