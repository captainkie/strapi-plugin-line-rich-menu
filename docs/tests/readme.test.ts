import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const readme = readFileSync(`${root}README.md`, 'utf8')

describe('README — สิ่งที่ผู้ใช้เห็นก่อนตัดสินใจติดตั้ง', () => {
  it('บอกชื่อแพ็กเกจของทั้งสองเวอร์ชัน พร้อมคำสั่งติดตั้งที่ก๊อปไปวางได้', () => {
    expect(readme).toContain('npm install strapi-plugin-line-rich-menu')
    expect(readme).toContain('npm install strapi-plugin-line-rich-menu-v4')
  })

  // สเปก §2.1 — v4 เป็นสะพานระหว่างรอ migrate ไม่ใช่เหตุผลให้อยู่ v4 ต่อ
  it('บอกว่า Strapi 4 หมดอายุการสนับสนุนแล้วและปลั๊กอิน v4 คือสะพาน', () => {
    expect(readme).toMatch(/end of life|EOL/i)
    expect(readme).toMatch(/30 April 2026|2026-04-30/)
  })

  it('มีภาพหน้าจอที่มีอยู่จริงบนดิสก์ ไม่ใช่ลิงก์เสีย', () => {
    const images = [...readme.matchAll(/!\[[^\]]*\]\((docs\/screenshots\/[^)]+)\)/g)].map((m) => m[1]!)
    expect(images.length, 'README ต้องมีภาพหน้าจออย่างน้อยสามภาพ').toBeGreaterThanOrEqual(3)
    for (const image of images) {
      expect(existsSync(`${root}${image}`), image).toBe(true)
    }
  })

  it('อธิบายสัญญาอนุญาตคู่ AGPL-3.0 + commercial และลิงก์ไปทั้งสองไฟล์', () => {
    expect(readme).toContain('AGPL-3.0')
    expect(readme).toMatch(/\(LICENSE\)/)
    expect(readme).toMatch(/\(COMMERCIAL-LICENSE\.md\)/)
    expect(readme).toMatch(/commercial licen[cs]e/i)
  })

  it('มีส่วนรับบริจาค', () => {
    expect(readme).toMatch(/^##+ .*(Support|Donate|สนับสนุน)/mi)
  })

  /**
   * สี่ข้อนี้เป็นข้อจำกัดที่ Plan 03 ตัดสินใจรับไว้พร้อมเงื่อนไขว่า "ต้องอยู่ใน README" —
   * ผู้ใช้ที่ไม่รู้ล่วงหน้าจะไปเจอตอนมันพัง ซึ่งเป็นตอนที่แพงที่สุดสำหรับเขา
   */
  it('บอกข้อจำกัดที่รู้อยู่ครบสี่ข้อ', () => {
    expect(readme, 'รูปที่บีบยากอาจใช้เวลาเกิน 10 วินาทีตอน save').toMatch(/10 seconds|proxy timeout/i)
    expect(readme, 'rate limiter เป็น in-memory ต่อ process').toMatch(/in-memory|per process/i)
    expect(readme, 'ตัวอย่าง curl ของ /schedules/tick พร้อม header').toContain('/line-rich-menu/schedules/tick')
    expect(readme, 'aliasId unique ต่อ channel บังคับที่ชั้น application').toMatch(/alias/i)
  })

  it('ตัวอย่าง curl ของ tick มี Authorization header — ไม่งั้นคนที่ก๊อปไปใช้จะเจอ 403 โดยไม่รู้สาเหตุ', () => {
    const block = /curl[^`]*\/line-rich-menu\/schedules\/tick[^`]*/s.exec(readme)?.[0] ?? ''
    expect(block).toContain('Authorization: Bearer')
  })

  it('มีตารางเทียบว่าแพ็กเกจไหนใช้กับ Strapi เวอร์ชันไหน', () => {
    expect(readme).toMatch(/\^?5\.\d|Strapi 5/)
    expect(readme).toMatch(/4\.25/)
  })

  /**
   * README ไม่ใช่ที่เก็บรายละเอียดความปลอดภัย แค่บอกจุดยืนเรื่อง
   * Strapi 4 EOL สั้น ๆ สองประโยคแล้วชี้ไปที่ SECURITY.md รายละเอียดอยู่ที่เดียว ไม่ใช่สองที่
   */
  it('มีส่วน Security สั้น ๆ ที่ลิงก์ไปยัง SECURITY.md', () => {
    expect(readme).toMatch(/^##+ .*Security/mi)
    expect(readme).toMatch(/\(SECURITY\.md\)/)
  })
})

describe('SECURITY.md ', () => {
  const security = readFileSync(`${root}SECURITY.md`, 'utf8')

  it('มีไฟล์อยู่จริงที่ root ของ repo', () => {
    expect(existsSync(`${root}SECURITY.md`)).toBe(true)
  })

  it('บอกช่องทางรายงานช่องโหว่ — GitHub private reporting และอีเมลสำรอง', () => {
    expect(security).toMatch(/private vulnerability reporting|security advisor/i)
    expect(security).toContain('security@fosivo.com')
  })

  it('บอกวันที่ Strapi 4 หมดอายุการสนับสนุน', () => {
    expect(security).toMatch(/30 April 2026|2026-04-30/)
  })
})
