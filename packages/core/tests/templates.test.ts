import { describe, expect, it } from 'vitest'
import { SIZE_LADDER, TEMPLATES, type TemplateDef } from '../src/templates.js'

const all = Object.values(TEMPLATES)

describe('แคตตาล็อก template', () => {
  it('มีครบ 12 แบบ — compact 5 large 7', () => {
    expect(all).toHaveLength(12)
    expect(all.filter((t) => t.sizeName === 'compact')).toHaveLength(5)
    expect(all.filter((t) => t.sizeName === 'large')).toHaveLength(7)
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

  it('ทุกขนาดใน SIZE_LADDER เป็นขนาดที่ LINE รับ และเรียงจากใหญ่ไปเล็ก', () => {
    const allowed = new Set([
      '2500x1686', '2500x843', '1200x810', '1200x405', '800x540', '800x270',
    ])
    for (const sizes of Object.values(SIZE_LADDER)) {
      for (const s of sizes) expect(allowed.has(`${s.width}x${s.height}`)).toBe(true)
      const widths = sizes.map((s) => s.width)
      expect(widths).toEqual([...widths].sort((a, b) => b - a))
    }
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
