import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url))

/**
 * `[^'"]*?` เป็น lazy โดยตั้งใจ เพื่อให้ข้ามบรรทัดได้ — import ที่แตกหลายบรรทัด
 * (`import {\n  A, B,\n} from './x.js'`) มีอยู่จริงในโค้ดเบสนี้ ถ้าใช้ `[^'"\n]*`
 * บรรทัด `} from './x.js'` จะไม่ถูกจับเลย และยามจะเขียวทั้งที่ตาบอด
 */
const SPECIFIER = /(?:^|\n)[ \t]*(?:import|export)\b[^'"]*?['"]([^'"]+)['"]/g

function specifiersOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(SPECIFIER)].map((m) => m[1]!).filter((s) => s.length > 0)
}

/** เดินตาม import ที่เป็น relative และลงท้าย .js เท่านั้น — เป็น convention ที่ทั้งแพ็กเกจนี้ใช้ */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    for (const spec of specifiersOf(file)) {
      if (!spec.startsWith('.') || !spec.endsWith('.js')) continue
      queue.push(resolve(dirname(file), spec.replace(/\.js$/, '.ts')))
    }
  }
  return [...seen]
}

function bareSpecifiersOf(file: string): string[] {
  return specifiersOf(file).filter((s) => !s.startsWith('.'))
}

const underServer = (file: string) =>
  relative(srcRoot, file).split(sep)[0] === 'server'

describe('กราฟ import ของ subpath "./browser"', () => {
  it('เดินได้จริง ไม่ใช่ regex ที่จับอะไรไม่ได้เลย', () => {
    const reached = reachableFrom(resolve(srcRoot, 'browser.ts'))
    expect(reached.length).toBeGreaterThan(4)
    expect(reached.some((f) => f.endsWith(`${sep}templates.ts`))).toBe(true)
  })

  it('ไปไม่ถึงไฟล์ใดใต้ src/server/ เลย', () => {
    const reached = reachableFrom(resolve(srcRoot, 'browser.ts'))
    expect(reached.filter(underServer).map((f) => relative(srcRoot, f))).toEqual([])
  })

  it('ไม่มีไฟล์ที่เดินไปถึงตัวไหน import sharp หรือ node: builtin', () => {
    const offenders = reachableFrom(resolve(srcRoot, 'browser.ts'))
      .flatMap((file) => bareSpecifiersOf(file).map((spec) => ({ file: relative(srcRoot, file), spec })))
      .filter(({ spec }) => spec === 'sharp' || spec.startsWith('node:'))
    expect(offenders).toEqual([])
  })
})

describe('กราฟ import ของ entry "."', () => {
  it('เดินไปถึง src/server/index.ts ได้ — ชั้น service ต้องอยู่บน entry ฝั่ง Node', () => {
    const reached = reachableFrom(resolve(srcRoot, 'index.ts'))
    expect(reached.map((f) => relative(srcRoot, f))).toContain(`server${sep}index.ts`)
  })
})
