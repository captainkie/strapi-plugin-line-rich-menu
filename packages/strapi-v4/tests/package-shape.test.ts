import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENDPOINTS } from '@fosivo/line-rich-menu-ui'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  type?: string
  main?: string
  files?: string[]
  scripts?: Record<string, string>
  strapi?: { name?: string }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

describe('รูปทรงของแพ็กเกจที่ Strapi 4 ต้องการ', () => {
  it('ไม่ใช่ ES module — Strapi 4 require() ไฟล์ shim ตรง ๆ', () => {
    expect(pkg.type).toBeUndefined()
  })

  it('มีไฟล์ shim ทั้งสองตัวอยู่ที่ root จริง', () => {
    expect(existsSync(`${root}strapi-server.js`)).toBe(true)
    expect(existsSync(`${root}strapi-admin.js`)).toBe(true)
  })

  it('shim แกะ default ออกให้ด้วย — tsup ห่อ CJS ไว้ใต้ .default', () => {
    for (const shim of ['strapi-server.js', 'strapi-admin.js']) {
      const source = readFileSync(`${root}${shim}`, 'utf8')
      expect(source).toContain('.default')
      expect(source).toContain('module.exports')
    }
  })

  it('files ที่จะถูกปล่อยขึ้น npm มีทั้ง dist และ shim', () => {
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'strapi-server.js', 'strapi-admin.js']))
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
      ENDPOINTS.channels, ENDPOINTS.channel('1'), ENDPOINTS.channelTest('1'),
      ENDPOINTS.menus, ENDPOINTS.menu('1'), ENDPOINTS.menuPublish('1'), ENDPOINTS.menuSetDefault('1'),
    ]
    expect(paths.every((path) => path.startsWith(`/${id}/`))).toBe(true)
  })
})

describe('peer range', () => {
  it('ผูกกับ Strapi 4 เท่านั้น — v5 เป็นคนละแพ็กเกจ', () => {
    expect(pkg.peerDependencies?.['@strapi/strapi']).toBe('^4.25.0')
  })
})

/**
 * ด่านนี้เกิดจากความล้มเหลวจริงที่ Task 20 เจอเป็นครั้งแรก ไม่ใช่จากการเดา
 *
 * ก่อนหน้านี้ `dependencies` ประกาศ `@fosivo/line-rich-menu-core: "workspace:*"` และ
 * `@fosivo/line-rich-menu-ui: "workspace:*"` ซึ่งเทสต์ทั้ง 608 ตัวไม่มีตัวไหนแตะเลย
 * เพราะทุกตัวรันในเวิร์กสเปซที่ pnpm ลิงก์ให้แล้ว พอ `npm install` tarball จริงในแอปของลูกค้า
 * npm ตอบทันทีว่า
 *
 *     npm error code EUNSUPPORTEDPROTOCOL
 *     npm error Unsupported URL Type "workspace:": workspace:*
 *
 * แปลว่าปลั๊กอินตัวนี้ติดตั้งไม่ได้เลยแม้แต่ครั้งเดียวนอกรีโปนี้ ทางแก้คือให้ tsup รวมสอง
 * แพ็กเกจนั้นเข้าบันเดิล (`noExternal`) แล้วย้ายมันไป devDependencies — ด่านนี้กันไม่ให้
 * มันไหลกลับเข้า `dependencies` อีก
 */
describe('ทุก dependency ที่เหลืออยู่ต้องติดตั้งได้จาก npm จริง (Task 20)', () => {
  const runtime = Object.entries(pkg.dependencies ?? {})

  it('ไม่มี dependency ไหนใช้ protocol ที่ npm ไม่รู้จัก', () => {
    const bad = runtime.filter(([, range]) => /^(workspace|link|catalog):/.test(range))
    expect(bad).toEqual([])
  })

  it('ไม่มีแพ็กเกจภายในของเวิร์กสเปซหลงอยู่ใน dependencies', () => {
    expect(runtime.filter(([name]) => name.startsWith('@fosivo/'))).toEqual([])
  })

  it('แพ็กเกจภายในยังต้องอยู่ที่ devDependencies — build ต้องหามันเจอเพื่อรวมเข้าบันเดิล', () => {
    const dev = pkg.devDependencies ?? {}
    expect(dev['@fosivo/line-rich-menu-core']).toBe('workspace:*')
    expect(dev['@fosivo/line-rich-menu-ui']).toBe('workspace:*')
  })

  it('tsup ถูกสั่งให้รวม @fosivo/* เข้าบันเดิล ไม่ใช่ปล่อยเป็น external', () => {
    const config = readFileSync(new URL('../tsup.config.ts', import.meta.url), 'utf8')
    // สอง config (server, admin) ต้องมีทั้งคู่ — ฝั่งไหนพลาดฝั่งนั้นติดตั้งไม่ได้
    expect(config.match(/noExternal: \[\/\^@fosivo\\\/\/\]/g)).toHaveLength(2)
  })
})
