#!/usr/bin/env node
/**
 * ประตูความปลอดภัยของ dependency — กั้นเฉพาะสิ่งที่ "เราปล่อยออกไปจริง"
 *
 * ทำไมไม่กั้นทั้งไฟล์ล็อก: ปลั๊กอินรองรับ Strapi 4.25.x ซึ่ง **EOL ตั้งแต่ 30 เมษายน 2026**
 * ต้นไม้ dependency ของมันเองมีช่องโหว่ที่รู้จักแล้วเกิน 70 รายการ (มี critical ด้วย) และจะไม่มี
 * วันได้แพตช์ เพราะไม่มีใครดูแลแล้ว เราไม่ได้เป็นคนพามันเข้ามา แก้ก็ไม่ได้ และลูกค้าที่รัน
 * Strapi 4 มีช่องโหว่ชุดนั้นอยู่แล้วไม่ว่าจะติดตั้งปลั๊กอินนี้หรือไม่ — `@strapi/strapi` เป็น
 * peerDependency ไม่ใช่ dependency ของเรา
 *
 * การกั้นทั้งไฟล์ล็อกจึงทำให้ CI แดงตลอดกาลด้วยเรื่องที่เราทำอะไรไม่ได้ ซึ่งจบลงที่คนเลิกอ่านมัน
 * แล้ววันที่ `sharp` หรือ `zod` มีช่องโหว่จริงก็จะไม่มีใครสังเกต
 *
 * ประตูนี้จึงล้มเฉพาะเมื่อช่องโหว่นั้นเดินมาถึงได้โดย **ไม่ผ่าน** `@strapi/strapi` — คือของที่เรา
 * เลือกเอง อัปเดตเองได้ และปล่อยไปกับ tarball จริง ส่วนสถานะของต้นไม้ Strapi ยังถูกสแกนและ
 * รายงานไว้ในอีก job หนึ่งแบบไม่บล็อก เพื่อให้มองเห็นอยู่ ไม่ใช่ถูกปิดปาก
 */
import { execFileSync } from 'node:child_process'

const UPSTREAM = '@strapi/strapi'

const raw = (() => {
  try {
    return execFileSync('pnpm', ['audit', '--prod', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    // pnpm audit ออก non-zero เมื่อเจอช่องโหว่ ซึ่งเป็นเรื่องปกติที่นี่ — ยังต้องอ่าน stdout ต่อ
    if (typeof error.stdout === 'string' && error.stdout.length > 0) return error.stdout
    throw error
  }
})()

const report = JSON.parse(raw)
const advisories = Object.values(report.advisories ?? {})

const ours = advisories.filter((advisory) =>
  (advisory.findings ?? []).some((finding) =>
    (finding.paths ?? []).some((path) => !path.includes(UPSTREAM)),
  ),
)

const upstreamOnly = advisories.length - ours.length
console.log(`ตรวจ ${advisories.length} รายการ · ผ่าน Strapi 4 เท่านั้น ${upstreamOnly} รายการ (ไม่บล็อก) · ของเราเอง ${ours.length} รายการ`)

if (ours.length === 0) {
  console.log('✓ ไม่มีช่องโหว่ในสิ่งที่เราปล่อยออกไปเอง')
  process.exit(0)
}

for (const advisory of ours) {
  const paths = (advisory.findings ?? []).flatMap((f) => f.paths ?? []).filter((p) => !p.includes(UPSTREAM))
  console.error(`\n✗ ${advisory.severity?.toUpperCase() ?? '?'} ${advisory.module_name} — ${advisory.title}`)
  console.error(`  ${advisory.url ?? ''}`)
  console.error(`  แพตช์ที่: ${advisory.patched_versions ?? '?'}`)
  for (const p of paths.slice(0, 3)) console.error(`  path: ${p}`)
}
console.error(`\nช่องโหว่ ${ours.length} รายการอยู่ใน dependency ที่เราเลือกเอง — อัปเดตได้ และต้องอัปเดต`)
process.exit(1)
