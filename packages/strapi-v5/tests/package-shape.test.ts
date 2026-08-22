import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENDPOINTS } from '@fosivo/line-rich-menu-ui'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name?: string
  type?: string
  files?: string[]
  scripts?: Record<string, string>
  strapi?: { name?: string }
  exports?: Record<string, Record<string, string> | string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  description?: string
  author?: string
  repository?: { type?: string; url?: string; directory?: string }
  homepage?: string
  bugs?: { url?: string }
  keywords?: string[]
  publishConfig?: { access?: string }
  private?: boolean
  license?: string
}

const STANDARD_EXPORTS = ['./strapi-admin', './strapi-server'] as const

describe('รูปทรงของแพ็กเกจที่ Strapi 5 ต้องการ (สเปก §2.1)', () => {
  it('ลงทะเบียนผ่าน exports map ไม่ใช่ไฟล์ shim ที่ root แบบ v4', () => {
    for (const key of STANDARD_EXPORTS) {
      expect(pkg.exports?.[key], key).toBeTypeOf('object')
    }
    expect(existsSync(`${root}strapi-server.js`)).toBe(false)
    expect(existsSync(`${root}strapi-admin.js`)).toBe(false)
  })

  /**
   * `strapi-plugin build` ปล่อยทั้ง .mjs และ .js — ประกาศ `type: module` เมื่อไหร่ `.js`
   * จะถูกอ่านเป็น ESM แล้ว Strapi ที่ require() มันจะพังด้วย ERR_REQUIRE_ESM
   */
  it('ไม่ประกาศ type: module — dist มีทั้ง cjs และ esm อยู่ข้าง ๆ กัน', () => {
    expect(pkg.type).toBeUndefined()
  })

  /**
   * `strapi-plugin verify` บังคับลำดับนี้และล้มด้วย exit code 1 ถ้าสลับ ด่านนี้ทำให้รู้ตั้งแต่
   * `pnpm test` ไม่ต้องรอถึงขั้น build ซึ่งช้ากว่ามากและอยู่หลัง commit ไปแล้ว
   */
  it('ทุก export ขึ้นต้นด้วย types และลงท้ายด้วย default', () => {
    for (const key of STANDARD_EXPORTS) {
      const keys = Object.keys(pkg.exports?.[key] as Record<string, string>)
      expect(keys[0], `${key} คีย์แรก`).toBe('types')
      expect(keys[keys.length - 1], `${key} คีย์สุดท้าย`).toBe('default')
    }
  })

  /**
   * sdk-plugin คำนวณ path ของ tsconfig สำหรับ emit .d.ts จากชื่อ export key ตรง ๆ
   * (`./strapi-admin` → `./admin/tsconfig.build.json`) ไม่มีไฟล์นั้น = ไม่มี .d.ts ออกมา
   * = `types` ใน exports ชี้ไปไฟล์ที่ไม่มีอยู่ = `strapi-plugin verify` ล้ม
   */
  it('มี tsconfig.build.json อยู่ในโฟลเดอร์ที่ sdk-plugin จะไปหา', () => {
    expect(existsSync(`${root}admin/tsconfig.build.json`)).toBe(true)
    expect(existsSync(`${root}server/tsconfig.build.json`)).toBe(true)
  })

  it('source ที่ประกาศไว้ใน exports ชี้ไปไฟล์ที่มีอยู่จริง', () => {
    for (const key of STANDARD_EXPORTS) {
      const source = (pkg.exports?.[key] as Record<string, string>)['source']!
      expect(existsSync(`${root}${source.replace('./', '')}`), source).toBe(true)
    }
  })

  // Task 22 item 2 — dual AGPL + commercial ไปแล้ว เหลือ LICENSE ฉบับเดียว (Apache-2.0) บวกกับ
  // THIRD_PARTY_NOTICES.md ที่ item 1 เพิ่มมาสำหรับโลโก้ LINE — COMMERCIAL-LICENSE.md ต้องไม่มี
  // อยู่ในนี้อีกต่อไป ไม่ใช่แค่ "ไม่ถูกเช็ค" เฉยๆ
  it('files ที่จะถูกปล่อยขึ้น npm มี dist, LICENSE และ THIRD_PARTY_NOTICES.md — ไม่มี COMMERCIAL-LICENSE.md หลงเหลือ', () => {
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'LICENSE', 'THIRD_PARTY_NOTICES.md']))
    expect(pkg.files).not.toContain('COMMERCIAL-LICENSE.md')
  })
})

describe('ข้อบังคับด้าน supply chain (สเปก §11.6)', () => {
  it('ไม่มี script ที่รันตอนติดตั้ง', () => {
    const forbidden = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']
    expect(forbidden.filter((name) => (pkg.scripts ?? {})[name] !== undefined)).toEqual([])
  })
})

describe('plugin id ผูกกับ path ที่ ui ยิงจริง', () => {
  it('ทุก endpoint ของปลั๊กอินขึ้นต้นด้วยชื่อปลั๊กอิน', () => {
    const id = pkg.strapi?.name
    expect(id).toBe('line-rich-menu')
    const paths = [
      ENDPOINTS.channels, ENDPOINTS.channel('a'), ENDPOINTS.channelTest('a'),
      ENDPOINTS.menus, ENDPOINTS.menu('a'), ENDPOINTS.menuPublish('a'), ENDPOINTS.menuSetDefault('a'),
    ]
    expect(paths.every((path) => path.startsWith(`/${id}/`))).toBe(true)
  })

  it('ชื่อแพ็กเกจเป็นตัวที่ไม่มีคำต่อท้าย — v4 เป็นคนแบก suffix ไม่ใช่ v5', () => {
    expect(pkg.name).toBe('strapi-plugin-line-rich-menu')
  })
})

describe('peer range', () => {
  it('ผูกกับ Strapi 5 เท่านั้น — v4 เป็นคนละแพ็กเกจ', () => {
    expect(pkg.peerDependencies?.['@strapi/strapi']).toBe('^5.0.0')
  })

  it('ผูกกับ Design System v2 และ router v6 ตามตารางสเปก §2.1', () => {
    expect(pkg.peerDependencies?.['@strapi/design-system']).toBe('^2.0.0')
    expect(pkg.peerDependencies?.['@strapi/icons']).toBe('^2.0.0')
    expect(pkg.peerDependencies?.['react-router-dom']).toBe('^6.0.0')
    expect(pkg.peerDependencies?.['styled-components']).toBe('^6.0.0')
  })
})

/**
 * ด่านเดียวกับ tests/package-shape.test.ts ของ v4 ซึ่งเกิดจากความล้มเหลวจริงที่ Task 20
 * ของ Plan 03 เจอเป็นครั้งแรก: `dependencies` ประกาศ `@fosivo/*: "workspace:*"` แล้ว
 * `npm install` ตอบ `EUNSUPPORTEDPROTOCOL` — เทสต์ 608 ตัวไม่มีตัวไหนแตะเลยเพราะทุกตัวรัน
 * ในเวิร์กสเปซที่ pnpm ลิงก์ให้แล้ว
 *
 * v5 มีกับดักตัวเดียวกันเป๊ะ ต่างแค่กลไก: sdk-plugin ตั้ง external จาก `dependencies` +
 * `peerDependencies` เท่านั้น (ดู getExternals ใน dist/vite-config-*.mjs) ตราบใดที่ @fosivo/*
 * อยู่ที่ devDependencies มันจะถูกรวมเข้าบันเดิลโดยอัตโนมัติ ซึ่งเป็นสิ่งที่เราต้องการ
 */
describe('ทุก dependency ที่เหลืออยู่ต้องติดตั้งได้จาก npm จริง', () => {
  const runtime = Object.entries(pkg.dependencies ?? {})

  it('ไม่มี dependency ไหนใช้ protocol ที่ npm ไม่รู้จัก', () => {
    const bad = [...runtime, ...Object.entries(pkg.peerDependencies ?? {})]
      .filter(([, range]) => /^(workspace|link|catalog|file):/.test(range))
    expect(bad).toEqual([])
  })

  it('ไม่มีแพ็กเกจภายในของเวิร์กสเปซหลงอยู่ใน dependencies หรือ peerDependencies', () => {
    expect(runtime.filter(([name]) => name.startsWith('@fosivo/'))).toEqual([])
    expect(Object.keys(pkg.peerDependencies ?? {}).filter((name) => name.startsWith('@fosivo/'))).toEqual([])
  })

  it('แพ็กเกจภายในยังต้องอยู่ที่ devDependencies — build ต้องหามันเจอเพื่อรวมเข้าบันเดิล', () => {
    const dev = pkg.devDependencies ?? {}
    expect(dev['@fosivo/line-rich-menu-core']).toBe('workspace:*')
    expect(dev['@fosivo/line-rich-menu-ui']).toBe('workspace:*')
  })
})

/**
 * เมทาดาทาที่หน้าแพ็กเกจบน npm แสดงและที่ผู้ใช้ใช้ตัดสินใจว่าจะติดตั้งไหม — carry-forward
 * บันทึกว่าทั้งสี่ฟิลด์ยังไม่มีในแพ็กเกจไหนเลย
 *
 * `publishConfig.access` เป็น no-op สำหรับแพ็กเกจที่ไม่มี scope (unscoped เป็น public
 * โดยปริยาย) — ประกาศไว้เพราะความล้มเหลวที่มันกันคือ "วันที่มีคนย้ายไปใช้ scope" ซึ่งจะทำให้
 * `npm publish` ล้มด้วย 402 Payment Required ที่อ่านแล้วไม่มีใครเดาถูกว่าต้องแก้ที่ไหน
 */
describe('เมทาดาทาที่ต้องมีก่อนปล่อย 1.0.0', () => {
  it('มี description, author, repository, homepage, bugs และ keywords ครบ', () => {
    expect(pkg.description).toBeTypeOf('string')
    expect(pkg.description!.length).toBeGreaterThan(20)
    expect(pkg.author).toBeTypeOf('string')
    expect(pkg.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/captainkie/strapi-plugin-line-rich-menu.git',
      directory: expect.stringMatching(/^packages\/strapi-v[45]$/),
    })
    expect(pkg.homepage).toBe('https://github.com/captainkie/strapi-plugin-line-rich-menu#readme')
    expect(pkg.bugs).toEqual({ url: 'https://github.com/captainkie/strapi-plugin-line-rich-menu/issues' })
    expect(pkg.keywords).toEqual(expect.arrayContaining(['strapi', 'strapi-plugin', 'line', 'rich-menu']))
  })

  it('ประกาศ publishConfig.access เป็น public', () => {
    expect(pkg.publishConfig).toEqual({ access: 'public' })
  })

  it('ไม่ได้ private — สองตัวนี้คือของที่ปล่อยจริง', () => {
    expect(pkg.private).not.toBe(true)
  })

  // Task 22 item 2 — relicense จาก AGPL-3.0 + commercial ไปเป็น Apache-2.0 เดี่ยว ต้องแดงถ้ามี
  // ใครใส่ AGPL-3.0-only กลับเข้ามา (สตริงเดิมเป๊ะ ไม่ใช่แค่ "ไม่ตรงกับที่คาด")
  it('สัญญาอนุญาตเป็น Apache-2.0 ตรงกับที่ LICENSE ในแพ็กเกจเป็น', () => {
    expect(pkg.license).toBe('Apache-2.0')
  })
})
