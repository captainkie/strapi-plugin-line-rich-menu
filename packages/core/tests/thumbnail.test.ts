import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../src/templates.js'
import { areaLabel, renderTemplateSvg } from '../src/thumbnail.js'

describe('areaLabel', () => {
  it('เริ่มที่ A และไล่ไปตามลำดับ', () => {
    expect(areaLabel(0)).toBe('A')
    expect(areaLabel(19)).toBe('T')
    expect(areaLabel(25)).toBe('Z')
  })

  it('ไม่พังถ้าเกิน Z', () => {
    expect(areaLabel(26)).toBe('AA')
  })
})

describe('renderTemplateSvg', () => {
  const t = TEMPLATES['RICH_MENU_TEMPLATE_201']!

  it('viewBox ตรงกับผืนผ้าใบจริง', () => {
    expect(renderTemplateSvg(t.bounds, t.size)).toContain('viewBox="0 0 2500 1686"')
  })

  it('มี rect หนึ่งอันต่อหนึ่งช่อง', () => {
    const svg = renderTemplateSvg(t.bounds, t.size)
    expect(svg.match(/<rect/g)).toHaveLength(t.bounds.length)
  })

  it('ติดป้ายตัวอักษรครบทุกช่อง', () => {
    const svg = renderTemplateSvg(t.bounds, t.size)
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(svg).toContain(`>${letter}<`)
    }
  })

  it('วาดได้ทุก template ที่มีในแคตตาล็อก', () => {
    for (const template of Object.values(TEMPLATES)) {
      const svg = renderTemplateSvg(template.bounds, template.size)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.match(/<rect/g)).toHaveLength(template.bounds.length)
    }
  })

  it('วาด custom layout ที่ไม่ได้อยู่ในแคตตาล็อกได้ด้วยโค้ดเดียวกัน', () => {
    const custom = [
      { x: 0, y: 0, width: 700, height: 843 },
      { x: 700, y: 0, width: 1800, height: 843 },
    ]
    const svg = renderTemplateSvg(custom, { width: 2500, height: 843 })
    expect(svg.match(/<rect/g)).toHaveLength(2)
  })

  it('ไม่มี script หรือ event handler หลุดเข้าไปใน SVG', () => {
    const svg = renderTemplateSvg(t.bounds, t.size)
    expect(svg).not.toMatch(/<script|onload=|onclick=/i)
  })
})
