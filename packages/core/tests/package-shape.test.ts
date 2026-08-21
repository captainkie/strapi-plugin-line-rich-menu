import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relative: string) =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8')) as {
    name?: string
    private?: boolean
    publishConfig?: { access?: string }
    scripts?: Record<string, string>
  }

const INTERNAL = [
  ['core', read('../package.json')],
  ['ui', read('../../ui/package.json')],
] as const

/**
 * สองแพ็กเกจนี้เป็นการแบ่งโค้ดภายในระหว่าง adapter v4/v5 ไม่ใช่ API สาธารณะ — Plan 03
 * ตัดสินใจไว้แล้วว่าจะรวมเข้าบันเดิลของ adapter แทนที่จะปล่อยขึ้น npm (ดูคอมเมนต์ใน
 * packages/strapi-v4/tsup.config.ts) `private: true` คือการเขียนคำตัดสินนั้นลงในไฟล์
 * ที่เครื่องมืออ่าน ไม่ใช่แค่ในคอมเมนต์: `npm publish` จะล้มทันที และ changesets จะข้ามมันเอง
 *
 * ทางเลือกที่ carry-forward เสนอ (`publishConfig.access: "public"`) ตั้งอยู่บนสมมติฐานว่า
 * ทั้งสองจะถูกปล่อย ซึ่งไม่ใช่แผนอีกต่อไปแล้ว
 */
describe('แพ็กเกจภายในต้องปล่อยขึ้น npm ไม่ได้', () => {
  for (const [label, pkg] of INTERNAL) {
    it(`${label} ประกาศ private`, () => {
      expect(pkg.private).toBe(true)
    })

    it(`${label} ไม่มี publishConfig ที่ขัดกับ private`, () => {
      expect(pkg.publishConfig).toBeUndefined()
    })

    it(`${label} ไม่มี script ที่รันตอนติดตั้ง (สเปก §11.6)`, () => {
      const forbidden = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']
      expect(forbidden.filter((name) => (pkg.scripts ?? {})[name] !== undefined)).toEqual([])
    })
  }
})
