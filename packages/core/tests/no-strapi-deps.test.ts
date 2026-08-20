import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }

describe('core มีอิสระจาก Strapi', () => {
  it('ไม่มี dependency ที่ขึ้นต้นด้วย @strapi/', () => {
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]
    expect(names.filter((n) => n.startsWith('@strapi/'))).toEqual([])
  })

  it('ไม่มี dependency ที่เป็น React หรือ bundler ของ admin panel', () => {
    const banned = ['react', 'react-dom', 'styled-components', 'react-router-dom']
    const names = Object.keys(pkg.dependencies ?? {})
    expect(names.filter((n) => banned.includes(n))).toEqual([])
  })
})
