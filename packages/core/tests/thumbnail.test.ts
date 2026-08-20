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

  // เดิมเช็คแค่ onload=/onclick= สองตัว — แคบเกินไปเพราะ event handler attribute ของ HTML/SVG
  // มีอีกหลายสิบตัว (onmouseover, onerror, onfocus, ...) เช็คแบบ \son\w+\s*= ครอบคลุมทั้งตระกูล
  it('ไม่มี script หรือ event handler ตระกูล on* ใด ๆ หลุดเข้าไปใน SVG', () => {
    const svg = renderTemplateSvg(t.bounds, t.size)
    expect(svg).not.toMatch(/<script|\son\w+\s*=/i)
  })

  // renderTemplateSvg เป็น public API — ผู้เรียกจาก JS ล้วน (เช่น adapter ที่ parse JSON จาก DB
  // มาไม่ตรวจ) ส่งค่าที่ไม่ใช่ number จริงเข้ามาได้แม้ type จะประกาศว่าเป็น number ก็ตาม
  // ค่าที่พยายามหลุดออกจาก attribute (เช่นปิด quote แล้วแปะ event handler) ต้องถูกบังคับเป็น
  // fallback ที่ปลอดภัยเสมอ ไม่ใช่แปะสตริงดิบเข้าไปตรง ๆ
  it('bounds/size ที่เป็นสตริงอันตราย (จาก JSON ที่ parse มาไม่ตรวจ) ถูกบังคับเป็นตัวเลขก่อนแปะเข้า markup', () => {
    const hostileBounds = [{
      x: '0" onmouseover="alert(1)' as unknown as number,
      y: 0,
      width: 100,
      height: 100,
    }]
    const svg = renderTemplateSvg(hostileBounds, { width: 2500, height: 843 })
    expect(svg).not.toMatch(/\son\w+\s*=/i)
    expect(svg).not.toContain('alert(1)')
    expect(svg).toContain('x="0"')
  })

  it('size ที่เป็นสตริงอันตรายก็ถูกบังคับเป็นตัวเลขเช่นกัน (viewBox)', () => {
    const svg = renderTemplateSvg(t.bounds, {
      width: '2500" onload="alert(1)' as unknown as number,
      height: 1686,
    })
    expect(svg).not.toMatch(/\son\w+\s*=/i)
    expect(svg).toContain('viewBox="0 0 0 1686"')
  })

  it('cell แต่ละอันต่อกันตรง ๆ ไม่มีตัวคั่นแปลกปลอมเล็ดลอดออกมา', () => {
    const svg = renderTemplateSvg(t.bounds, t.size)
    expect(svg).not.toContain('Stryker was here!')
    // .join('') ต้องแปะ rect ต่อ text ต่อกันตรง ๆ ไม่มีอะไรคั่นระหว่าง /> กับ <text
    expect(svg).toMatch(/\/><text/)
  })

  it('fontSize คำนวณจากด้านที่สั้นกว่าเสมอ (ไม่ใช่ด้านยาว) คูณ 0.18 พอดี', () => {
    // ผืนผ้าใบไม่เป็นสี่เหลี่ยมจัตุรัส เพื่อแยกแยะ min จาก max ได้จริง
    const svg = renderTemplateSvg([{ x: 0, y: 0, width: 2500, height: 843 }], { width: 2500, height: 843 })
    expect(svg).toContain('font-size="152"')
  })

  it('ตำแหน่งกึ่งกลางช่องคำนวณถูกต้องเป๊ะจากพิกัดและขนาดจริง', () => {
    const svg = renderTemplateSvg(
      [{ x: 100, y: 50, width: 200, height: 80 }],
      { width: 2500, height: 843 },
    )
    const match = svg.match(/<text x="(-?\d+)" y="(-?\d+)"/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(200)
    expect(Number(match![2])).toBe(90)
  })
})
