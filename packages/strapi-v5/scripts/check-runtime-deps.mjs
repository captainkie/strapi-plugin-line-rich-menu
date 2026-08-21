// ทุก `require()`/`import` ที่เหลืออยู่ในบันเดิลต้องหาเจอได้จากสิ่งที่ package.json ประกาศไว้
//
// ด่านนี้ตรวจที่ `dist` ซึ่งเป็นสิ่งที่ผู้ใช้ได้รับจริง ต่างจากเทสต์ใน tests/package-shape.test.ts
// ที่ตรวจที่ต้นทาง (package.json) — รูปแบบเดียวกับด่าน browser bundle ของ packages/core ใน CI
// และเป็นฝาแฝดของ packages/strapi-v4/scripts/check-runtime-deps.mjs
//
// ต่างจากของ v4 สามข้อ ซึ่งสองข้อหลังคือสิ่งที่รุ่นแรกของไฟล์นี้ (Task 1) มองไม่เห็น:
//
// 1. sdk-plugin ปล่อยทั้ง CJS (`require("x")`) และ ESM (`from "x"`) จึงต้องกวาดทั้งสองรูป
//
// 2. **ต้องไล่ทุกไฟล์ในโฟลเดอร์ ไม่ใช่รายชื่อไฟล์ที่เขียนตายตัว** — Vite ของ sdk-plugin
//    code-split บันเดิลของแอดมินออกเป็นชิ้นที่มี content hash อยู่ในชื่อ (`index-D6qODGqM.js`,
//    `App-C7Y9U07R.js`) ตัว `dist/admin/index.js` มีขนาด 0.23 kB และอ้างถึงแค่ `@strapi/icons`
//    กับ chunk ข้างเคียง ของจริงทั้งหมด — react, react/jsx-runtime, @strapi/design-system,
//    @strapi/strapi/admin, react-intl, react-router-dom, zod — อยู่ใน chunk ทั้งสิ้น
//    รายชื่อไฟล์ตายตัวจึงแทบไม่ได้ตรวจอะไรเลยฝั่งแอดมิน และ hash ในชื่อเปลี่ยนทุกครั้งที่โค้ดเปลี่ยน
//    รายชื่อตายตัวจึงล้าสมัยตั้งแต่ commit ถัดไปโดยที่ยังเขียวอยู่
//
// 3. มีด่านเพิ่มว่า `sharp` ห้ามโผล่ในบันเดิลของแอดมินเด็ดขาด — มันเป็น native module ที่
//    Vite ของ Strapi 5 จะพยายามลากเข้าเบราว์เซอร์แล้ว build ล้มทั้งแอป และถ้ามันหลุดเข้ามาจริง
//    มันจะไปโผล่ใน chunk (เพราะถูก import จากหน้าเพจ ไม่ใช่จาก entry) ซึ่งเป็นที่เดียวที่
//    รายชื่อตายตัวมองไม่เห็นพอดี — ข้อ 2 กับข้อ 3 จึงต้องมาคู่กัน
import { readdirSync, readFileSync, statSync } from 'node:fs'
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

/**
 * ไฟล์ที่รันจริงทุกไฟล์ใต้ dir — ไม่รวม .map กับ .d.ts ที่ไม่ถูกโหลดตอนรัน
 *
 * โฟลเดอร์ที่ไม่มีอยู่คืนลิสต์ว่าง ไม่ใช่โยน ENOENT ทิ้ง stack trace ให้อ่าน — ผู้ใช้ด่านนี้
 * ต้องได้บรรทัด `::error::` ที่บอกว่าต้องรัน build ก่อน ไม่ใช่ต้องแกะ stack ของ node เอง
 */
const bundlesUnder = (dir) => {
  const found = []
  const walk = (relative) => {
    let entries
    try {
      entries = readdirSync(`${root}${relative}`)
    } catch {
      return
    }
    for (const entry of entries) {
      const next = `${relative}/${entry}`
      if (statSync(`${root}${next}`).isDirectory()) walk(next)
      else if (/\.(js|mjs|cjs)$/.test(entry)) found.push(next)
    }
  }
  walk(dir)
  return found
}

const server = bundlesUnder('dist/server')
const admin = bundlesUnder('dist/admin')

// `from` และ `import` ต้องเป็น **คีย์เวิร์ด** ไม่ใช่ตัวอักษรที่บังเอิญอยู่ท้ายสตริง — ตัว
// lookbehind กัน `"editor.from"` ในตาราง i18n ซึ่งตามด้วย `",\n  "` แล้วทำให้รุ่นแรกของ
// regex นี้จับ `",\n  "` มาเป็นชื่อแพ็กเกจ (ด่านแดงตั้งแต่ baseline โดยที่บันเดิลไม่มีอะไรผิด)
// และ `[^"\n]` กันไม่ให้ specifier กินข้ามบรรทัดด้วยเหตุผลเดียวกัน
const PATTERNS = [
  /(?<![\w$.])require\(\s*"([^"\n]+)"\s*\)/g,
  /(?<![\w$.])from\s*"([^"\n]+)"/g,
  /(?<![\w$.])import\s*"([^"\n]+)"/g,
  /(?<![\w$.])import\(\s*"([^"\n]+)"\s*\)/g,
]

const externalsOf = (source) => {
  const found = new Set()
  for (const pattern of PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier.startsWith('.') || specifier.startsWith('/') || builtin.has(specifier)) continue
      found.add(specifier)
    }
  }
  return found
}

const problems = []
/** นับไว้เพื่อพิสูจน์ว่าตัวสกัด specifier ยังมองเห็นของจริง ไม่ได้เงียบไปเพราะ regex เพี้ยน */
const seen = { 'dist/server': 0, 'dist/admin': 0 }

for (const [dir, bundles] of [
  ['dist/server', server],
  ['dist/admin', admin],
]) {
  // ด่านที่กันตัวเองจากการเขียวเพราะไม่เจอไฟล์เลย — build ที่ยังไม่ได้รัน หรือโครงของ dist
  // ที่เปลี่ยนไป ต้องทำให้ด่านนี้แดง ไม่ใช่ผ่านฉลุยแล้วรายงานว่าตรวจครบแล้ว
  if (bundles.length === 0) {
    problems.push(`${dir} ไม่มีไฟล์ .js/.mjs เลย — build รันแล้วหรือยัง`)
    continue
  }
  for (const bundle of bundles) {
    const source = readFileSync(`${root}${bundle}`, 'utf8')
    for (const specifier of externalsOf(source)) {
      seen[dir] += 1
      if (!declared.has(packageOf(specifier))) {
        problems.push(`${bundle} อ้างถึง "${specifier}" แต่ ${packageOf(specifier)} ไม่ได้ประกาศไว้`)
      }
    }
    if (dir === 'dist/admin' && /["']sharp["']/.test(source)) {
      problems.push(`${bundle} มี sharp อยู่ — บันเดิลของแอดมินรันในเบราว์เซอร์ ต้องไม่มี native module`)
    }
  }
}

// เหตุผลเดียวกับด่านข้างบน แต่กันอีกชั้น: ไฟล์อาจมีอยู่ครบแต่ regex อ่านมันไม่ออกเลย
// ซึ่งจะทำให้ด่านทั้งด่านเขียวโดยไม่ได้ตรวจอะไร (STANDING-CORRECTIONS S2)
for (const [dir, count] of Object.entries(seen)) {
  if (count === 0 && !problems.some((line) => line.startsWith(dir))) {
    problems.push(`${dir} ไม่พบ specifier ภายนอกสักตัว — ตัวสกัดน่าจะพัง ไม่ใช่บันเดิลสะอาด`)
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
console.log(
  `runtime deps ok — ${server.length + admin.length} ไฟล์ในบันเดิล ` +
    `(server ${seen['dist/server']} · admin ${seen['dist/admin']} specifier) ` +
    `ทุกตัวถูกประกาศไว้และติดตั้งได้จาก npm`,
)
