// @vitest-environment node
//
// This file only walks the filesystem — it never touches the DOM. Under the package-wide
// `environment: 'jsdom'` (vitest.config.ts), Vite's static asset-URL rewrite intercepts
// `new URL('..', import.meta.url)` and rewrites it into an `http://localhost/@fs/...` dev-server
// URL instead of leaving it a real `file:` URL, so `fileURLToPath()` below throws
// "The URL must be of scheme file". Forcing the `node` environment for this file only avoids
// that rewrite and leaves the DOM environment untouched for the rest of the package's tests.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const uiRoot = fileURLToPath(new URL('..', import.meta.url))

const BANNED = [
  '@strapi/',
  'styled-components',
  'react-router-dom',
  'react-intl',
]

/**
 * ไดเรกทอรีที่ไม่ใช่ซอร์สของแพ็กเกจ — ต้องข้าม เพราะการสแกนจากรากแพ็กเกจ (ไม่ใช่แค่ `src/`)
 * จะเดินเข้า node_modules ของ dependency ทุกตัว ซึ่งมี .css เต็มไปหมดและไม่ใช่เรื่องของเรา
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', '.omc', '.turbo'])

const isSource = (path: string): boolean => path.endsWith('.ts') || path.endsWith('.tsx')

/**
 * `keep` ต้องรับเข้ามาเป็นพารามิเตอร์ ไม่ใช่ฝังเงื่อนไข `.ts`/`.tsx` ไว้ข้างใน
 *
 * ตอนที่ฝังไว้ เทสต์ "ไม่มีไฟล์ .css" ด้านล่างกรอง `.css` จากรายการที่มีแต่ `.ts`/`.tsx` — ผลลัพธ์
 * ว่างเปล่าโดยโครงสร้าง มันจึงเขียวตลอดกาลไม่ว่าจะมีไฟล์ .css จริงกี่ไฟล์ก็ตาม (พิสูจน์แล้วด้วยการ
 * วาง .css จริงลงไปทั้งใน src/ และที่รากแพ็กเกจ แล้วทั้งสี่เทสต์ยังเขียวหมด)
 */
function walk(dir: string, keep: (path: string) => boolean = isSource): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return SKIP_DIRS.has(entry) ? [] : walk(full, keep)
    return keep(full) ? [full] : []
  })
}

describe('ui ไม่ผูกกับ framework ใด ๆ', () => {
  const pkg = JSON.parse(readFileSync(join(uiRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

  it('manifest ไม่มี dependency ต้องห้าม', () => {
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]
    for (const banned of BANNED) {
      expect(names.filter((n) => n.startsWith(banned))).toEqual([])
    }
  })

  // manifest อย่างเดียวไม่พอ — ไฟล์อาจ import ชื่อที่ hoist มาจาก root ของ workspace ได้
  //
  // จับทั้ง static import (`from '<banned>'`), side-effect import (`import '<banned>'`
  // ที่ไม่มี `from`) และ `require('<banned>')` — ไม่ใช่แค่รูปแบบที่มี `from` เท่านั้น
  it('ไม่มีไฟล์ไหน import ของต้องห้าม', () => {
    const offenders: string[] = []
    for (const file of walk(join(uiRoot, 'src'))) {
      const source = readFileSync(file, 'utf8')
      for (const banned of BANNED) {
        const patterns = [
          `from '${banned}`,
          `from "${banned}`,
          `import '${banned}`,
          `import "${banned}`,
          `require('${banned}`,
          `require("${banned}`,
        ]
        if (patterns.some((pattern) => source.includes(pattern))) {
          offenders.push(`${file.replace(uiRoot, '')} → ${banned}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('import core ผ่าน subpath /browser เท่านั้น — "." ลาก sharp เข้าบันเดิล', () => {
    const offenders: string[] = []
    for (const file of walk(join(uiRoot, 'src'))) {
      const source = readFileSync(file, 'utf8')
      if (/from ['"]@fosivo\/line-rich-menu-core['"]/.test(source)) {
        offenders.push(file.replace(uiRoot, ''))
      }
    }
    expect(offenders).toEqual([])
  })

  // สแกนจาก "รากแพ็กเกจ" ไม่ใช่แค่ src/ — ข้อห้ามนี้เป็นเรื่องของสิ่งที่แพ็กเกจ ship ออกไป
  // ไฟล์สไตล์ที่วางไว้ข้าง ๆ src/ (เช่นที่รากแพ็กเกจแล้วให้ tsup คัดลอกตาม) ก็บังคับให้ bundler
  // ของผู้ใช้ต้องประมวลผล CSS จาก node_modules เหมือนกันทุกประการ (ดูเหตุผลเต็มที่ src/styles.ts)
  //
  // นับ .scss/.sass/.less ด้วย เพราะเหตุผลที่ห้ามคือ "bundler ต้องประมวลผลไฟล์สไตล์" ไม่ใช่
  // นามสกุล .css เอง — ไฟล์ .scss ไฟล์เดียวก็สร้างปัญหาเดียวกันและยังต้องมี loader เพิ่มอีก
  const STYLESHEET = /\.(css|scss|sass|less)$/

  it('ไม่มีไฟล์สไตล์ในแพ็กเกจเลย — style ต้อง inline หรือฉีดผ่าน <style>', () => {
    const found = walk(uiRoot, (f) => STYLESHEET.test(f))
    expect(found.map((f) => f.replace(uiRoot, ''))).toEqual([])
  })
})
