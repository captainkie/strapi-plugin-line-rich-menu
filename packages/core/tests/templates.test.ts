import { describe, expect, it } from 'vitest'
import {
  isAllowedCanvas, LINE_ALLOWED_SIZES, sizeNameFor, SIZE_LADDER, TEMPLATES, type TemplateDef,
} from '../src/templates.js'

const all = Object.values(TEMPLATES)

describe('แคตตาล็อก template', () => {
  it('มีครบ 12 แบบ — compact 5 large 7', () => {
    expect(all).toHaveLength(12)
    expect(all.filter((t) => t.sizeName === 'compact')).toHaveLength(5)
    expect(all.filter((t) => t.sizeName === 'large')).toHaveLength(7)
  })

  it('คีย์ตรงกับ template code ของ LINE เป๊ะทุกตัว — เผื่อผู้ใช้ lookup ด้วยคีย์ตรง ๆ', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([
      'RICH_MENU_TEMPLATE_101', 'RICH_MENU_TEMPLATE_102', 'RICH_MENU_TEMPLATE_103',
      'RICH_MENU_TEMPLATE_104', 'RICH_MENU_TEMPLATE_105',
      'RICH_MENU_TEMPLATE_201', 'RICH_MENU_TEMPLATE_202', 'RICH_MENU_TEMPLATE_203',
      'RICH_MENU_TEMPLATE_204', 'RICH_MENU_TEMPLATE_205', 'RICH_MENU_TEMPLATE_206',
      'RICH_MENU_TEMPLATE_207',
    ].sort())
    for (const key of Object.keys(TEMPLATES)) {
      expect(TEMPLATES[key]!.key).toBe(key)
    }
  })

  it('ทุกแบบมีช่อง 1–20 ช่องตามที่ LINE จำกัด', () => {
    for (const t of all) {
      expect(t.bounds.length).toBeGreaterThanOrEqual(1)
      expect(t.bounds.length).toBeLessThanOrEqual(20)
    }
  })

  it('ทุกช่องอยู่ในกรอบผืนผ้าใบ', () => {
    for (const t of all) {
      for (const b of t.bounds) {
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.width).toBeGreaterThan(0)
        expect(b.height).toBeGreaterThan(0)
        expect(b.x + b.width).toBeLessThanOrEqual(t.size.width)
        expect(b.y + b.height).toBeLessThanOrEqual(t.size.height)
      }
    }
  })

  // invariant นี้พิสูจน์ว่าการพอร์ตพิกัดมาจากโค้ดเดิมถูกต้องครบถ้วน
  it('ช่องทุกช่องรวมกันปูเต็มผืนผ้าใบพอดี ไม่มีรูโหว่ ไม่ทับกัน', () => {
    for (const t of all) {
      const sum = t.bounds.reduce((acc, b) => acc + b.width * b.height, 0)
      expect(sum, `${t.key} พื้นที่รวมไม่เท่าผืนผ้าใบ`).toBe(t.size.width * t.size.height)
      expect(hasOverlap(t), `${t.key} มีช่องทับกัน`).toBe(false)
    }
  })

  it('ทุกขนาดใน SIZE_LADDER เป็นขนาดที่ LINE รับ (ตรงกับ LINE_ALLOWED_SIZES) และเรียงจากใหญ่ไปเล็ก', () => {
    const allowed = new Set(LINE_ALLOWED_SIZES.map((s) => `${s.width}x${s.height}`))
    for (const sizes of Object.values(SIZE_LADDER)) {
      for (const s of sizes) expect(allowed.has(`${s.width}x${s.height}`)).toBe(true)
      const widths = sizes.map((s) => s.width)
      expect(widths).toEqual([...widths].sort((a, b) => b - a))
    }
  })

  it('LINE_ALLOWED_SIZES มีครบ 6 ขนาด ไม่ซ้ำกันเลย', () => {
    expect(LINE_ALLOWED_SIZES).toHaveLength(6)
    const keys = new Set(LINE_ALLOWED_SIZES.map((s) => `${s.width}x${s.height}`))
    expect(keys.size).toBe(6)
  })

  // ค่าตายตัว (independent oracle) ห้ามลบทิ้งหรือเปลี่ยนไป derive จาก SIZE_LADDER/LINE_ALLOWED_SIZES —
  // ถ้า assertion ด้านล่างเทียบ ladder กับค่าที่ derive มาจาก ladder เอง มันจะพังไม่ได้เลยไม่ว่า
  // ตัวเลขจริงจะผิดแค่ไหน (ดู PR ที่ลบ literal นี้ไปครั้งก่อน — ทำให้ 1200x405 กับ 800x270
  // ไม่มี assertion ใดพินไว้เลยทั้งไฟล์) ตัวเลข 6 ค่านี้มาจากสเปก LINE 4.1 ตรง ๆ พิมพ์ซ้ำในเทสต์
  // เป็นความตั้งใจ ไม่ใช่ duplication ที่ต้อง dedupe
  const LINE_SPEC_SIZES = new Set([
    '2500x1686', '2500x843', '1200x810', '1200x405', '800x540', '800x270',
  ])

  it('LINE_ALLOWED_SIZES ตรงกับสเปก LINE 4.1 เป๊ะทั้ง 6 ขนาด (independent oracle ไม่ derive จาก source)', () => {
    const actual = new Set(LINE_ALLOWED_SIZES.map((s) => `${s.width}x${s.height}`))
    for (const key of actual) {
      expect(LINE_SPEC_SIZES.has(key), `${key} ไม่อยู่ใน spec ที่ตรึงไว้ในเทสต์`).toBe(true)
    }
    for (const key of LINE_SPEC_SIZES) {
      expect(actual.has(key), `${key} หายไปจาก LINE_ALLOWED_SIZES`).toBe(true)
    }
  })
})

describe('isAllowedCanvas', () => {
  it('ผ่านทุกขนาดที่อยู่ใน LINE_ALLOWED_SIZES', () => {
    for (const size of LINE_ALLOWED_SIZES) expect(isAllowedCanvas(size)).toBe(true)
  })

  it('ปฏิเสธขนาดที่ไม่อยู่ใน allowlist', () => {
    expect(isAllowedCanvas({ width: 999, height: 999 })).toBe(false)
  })

  it('ปฏิเสธขนาดที่ใกล้เคียงแต่ไม่ตรงเป๊ะ (กว้างตรงแต่สูงผิด)', () => {
    expect(isAllowedCanvas({ width: 2500, height: 1000 })).toBe(false)
  })
})

describe('SIZE_LADDER แช่แข็ง runtime — mutate ไม่ได้จริง ไม่ใช่แค่ type-level', () => {
  // ไฟล์ src เป็น ESM strict mode เขียนทับ property/array ของ frozen object เลย throw
  // TypeError แทนที่จะ fail เงียบ ๆ (silent no-op แบบ sloppy mode) — เทสต์นี้ยืนยันทั้งสองด้าน:
  // การ mutate เอง throw, และต่อให้ throw ไม่ทัน isAllowedCanvas ก็ต้องไม่เปลี่ยนพฤติกรรม

  it('เขียนทับ width ของ entry ใน SIZE_LADDER.large throw TypeError', () => {
    expect(() => {
      // @ts-expect-error -- ทดสอบว่า runtime บล็อกจริง ต่อให้ type-level ห้ามไว้แล้ว
      SIZE_LADDER.large[0].width = 1
    }).toThrow(TypeError)
  })

  it('เขียนทับ entry ใน SIZE_LADDER.compact throw TypeError', () => {
    expect(() => {
      // @ts-expect-error -- ทดสอบว่า runtime บล็อกจริง ต่อให้ type-level ห้ามไว้แล้ว
      SIZE_LADDER.compact[0] = { width: 1, height: 1 }
    }).toThrow(TypeError)
  })

  it('push entry ใหม่เข้า SIZE_LADDER.large throw TypeError', () => {
    expect(() => {
      // @ts-expect-error -- ทดสอบว่า runtime บล็อกจริง ต่อให้ type-level ห้ามไว้แล้ว
      SIZE_LADDER.large.push({ width: 1, height: 1 })
    }).toThrow(TypeError)
  })

  it('เขียนทับ key ของ SIZE_LADDER เอง throw TypeError', () => {
    expect(() => {
      // @ts-expect-error -- ทดสอบว่า runtime บล็อกจริง ต่อให้ type-level ห้ามไว้แล้ว
      SIZE_LADDER.large = []
    }).toThrow(TypeError)
  })

  it('การพยายาม mutate (ที่ throw แล้วถูกจับไว้) ไม่เปลี่ยนสิ่งที่ isAllowedCanvas ยอมรับ', () => {
    try {
      // @ts-expect-error -- ทดสอบว่า runtime บล็อกจริง ต่อให้ type-level ห้ามไว้แล้ว
      SIZE_LADDER.large[0].width = 1
    } catch {
      // คาดว่า throw — ประเด็นคือ isAllowedCanvas ต้องยังผ่านของจริงและปฏิเสธของปลอมเหมือนเดิม
    }
    expect(isAllowedCanvas({ width: 2500, height: 1686 })).toBe(true)
    expect(isAllowedCanvas({ width: 1, height: 1686 })).toBe(false)
  })
})

describe('sizeNameFor', () => {
  it('คืน large สำหรับทุกขนาดใน SIZE_LADDER.large', () => {
    for (const size of SIZE_LADDER.large) expect(sizeNameFor(size)).toBe('large')
  })

  it('คืน compact สำหรับทุกขนาดใน SIZE_LADDER.compact', () => {
    for (const size of SIZE_LADDER.compact) expect(sizeNameFor(size)).toBe('compact')
  })

  it('คืน undefined สำหรับขนาดที่ไม่อยู่ในแคตตาล็อกเลย', () => {
    expect(sizeNameFor({ width: 999, height: 999 })).toBeUndefined()
  })
})

function hasOverlap(t: TemplateDef): boolean {
  for (let i = 0; i < t.bounds.length; i++) {
    for (let j = i + 1; j < t.bounds.length; j++) {
      const a = t.bounds[i]!
      const b = t.bounds[j]!
      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
      if (overlapX > 0 && overlapY > 0) return true
    }
  }
  return false
}
