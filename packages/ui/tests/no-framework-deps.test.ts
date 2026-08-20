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

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
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

  it('ไม่มีไฟล์ .css ในแพ็กเกจ — style ต้อง inline หรือฉีดผ่าน <style>', () => {
    const css = walk(join(uiRoot, 'src')).filter((f) => f.endsWith('.css'))
    expect(css).toEqual([])
  })
})
