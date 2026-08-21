// ทุก `require()`/`import` ที่เหลืออยู่ในบันเดิลต้องหาเจอได้จากสิ่งที่ package.json ประกาศไว้
//
// ด่านนี้ตรวจที่ `dist` ซึ่งเป็นสิ่งที่ผู้ใช้ได้รับจริง ต่างจากเทสต์ใน tests/package-shape.test.ts
// ที่ตรวจที่ต้นทาง (package.json) — รูปแบบเดียวกับด่าน browser bundle ของ packages/core ใน CI
// และเหมือนกับ packages/strapi-v4/scripts/check-runtime-deps.mjs ทุกประการ ต่างแค่รายชื่อไฟล์
// บันเดิลที่ sdk-plugin ปล่อยออกมา (server/index.js + admin/index.js แทน dist/server, dist/admin
// รูปแบบเดิมของ tsup)
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))

const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
])
const builtin = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

/** `react/jsx-runtime` ต้องนับเป็นแพ็กเกจ `react` ไม่ใช่ชื่อเต็ม */
const packageOf = (specifier) => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const problems = []
for (const bundle of ['dist/server/index.js', 'dist/admin/index.js']) {
  const source = readFileSync(`${root}${bundle}`, 'utf8')
  const specifiers = [
    ...[...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]),
    ...[...source.matchAll(/from\s+"([^"./][^"]*)"/g)].map((match) => match[1]),
  ]
  for (const specifier of new Set(specifiers)) {
    if (specifier.startsWith('.') || builtin.has(specifier)) continue
    if (!declared.has(packageOf(specifier))) {
      problems.push(`${bundle} require("${specifier}") แต่ ${packageOf(specifier)} ไม่ได้ประกาศไว้`)
    }
  }
}

const unsupported = Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies })
  .filter(([, range]) => /^(workspace|link|catalog|file):/.test(range))
  .map(([name, range]) => `${name}: "${range}" — npm ติดตั้ง protocol นี้ไม่ได้`)

const all = [...problems, ...unsupported]
if (all.length > 0) {
  for (const line of all) console.error(`::error::${line}`)
  process.exit(1)
}
console.log('runtime deps ok — ทุก require()/import ในบันเดิลถูกประกาศไว้และติดตั้งได้จาก npm')
