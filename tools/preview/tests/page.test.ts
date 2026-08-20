import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '@fosivo/line-rich-menu-core'
import { renderPage } from '../src/page.js'

describe('หน้า preview', () => {
  const html = renderPage()

  it('เป็นเอกสาร HTML ที่สมบูรณ์', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
  })

  it('แสดงครบทั้ง 12 template', () => {
    for (const key of Object.keys(TEMPLATES)) expect(html).toContain(key)
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(13)
  })

  it('บอกจำนวนช่องของแต่ละ template', () => {
    const t = TEMPLATES['RICH_MENU_TEMPLATE_201']!
    expect(html).toContain(`${t.bounds.length} areas`)
  })

  it('มีตัวอย่าง custom layout เพื่อพิสูจน์ว่า renderer ตัวเดียวกันวาดได้', () => {
    expect(html).toContain('Custom layout')
  })

  it('ไม่มี script tag — หน้านี้เป็น static ล้วน ไม่ต้องมี JS', () => {
    expect(html).not.toMatch(/<script/i)
  })

  it('รองรับทั้งธีมสว่างและมืดของเบราว์เซอร์', () => {
    expect(html).toContain('prefers-color-scheme: dark')
  })
})
