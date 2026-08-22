import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))

/** ไฟล์ที่ผู้ใช้เปิดอ่านจริงบน GitHub — ลิงก์เสียในนี้คือสิ่งแรกที่คนเห็น */
const PAGES = ['README.md', 'SECURITY.md', 'docs/USAGE.md', 'docs/SPEC.md', 'docs/DEMO.md', 'docs/RELEASING.md']

/**
 * ลิงก์สัมพัทธ์ทุกตัวต้องชี้ไปยังไฟล์ที่มีอยู่จริง
 *
 * เอกสารชุดนี้ลิงก์ข้ามไฟล์กันไปมา (README → USAGE → SPEC → SECURITY) การย้ายหรือเปลี่ยนชื่อ
 * ไฟล์เดียวทำให้ลิงก์อีกหลายจุดเสียเงียบ ๆ — GitHub ไม่เตือนอะไรเลย คนอ่านเจอ 404 แทน
 * ซึ่งเป็นความประทับใจแรกของคนที่เพิ่งเจอปลั๊กอินนี้
 */
describe('ลิงก์ในเอกสาร', () => {
  for (const page of PAGES) {
    it(`${page} — ลิงก์สัมพัทธ์ทุกตัวมีปลายทางจริง`, () => {
      const source = readFileSync(`${root}${page}`, 'utf8')
      const base = dirname(`${root}${page}`)
      const broken: string[] = []

      for (const match of source.matchAll(/\]\(([^)#\s]+)(?:#[^)\s]*)?\)/g)) {
        const target = match[1]!
        // ข้ามลิงก์ภายนอกและ anchor ในหน้าเดียวกัน
        if (/^(https?:|mailto:|#)/.test(target)) continue
        if (!existsSync(resolve(base, target))) broken.push(target)
      }

      expect(broken, `${page} มีลิงก์ที่ชี้ไปไฟล์ที่ไม่มีอยู่`).toEqual([])
    })
  }

  // สารบัญคือทางเข้าเดียวที่คนหาเอกสารเจอ — ไม่มีลิงก์ = เอกสารที่เขียนแล้วไม่มีใครหาเจอ
  it('README ชี้ไปคู่มือใช้งานและเอกสารออกแบบ', () => {
    const readme = readFileSync(`${root}README.md`, 'utf8')
    expect(readme).toContain('docs/USAGE.md')
    expect(readme).toContain('docs/SPEC.md')
    expect(readme).toMatch(/^##+ .*Documentation/mi)
  })
})
