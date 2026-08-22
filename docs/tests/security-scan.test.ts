import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const config = readFileSync(`${root}.gitleaks.toml`, 'utf8')

/**
 * ตัวตรวจความลับที่ถูกปิดปากไว้ อ่านเหมือนตัวตรวจที่ผ่าน
 *
 * ไฟล์ config ของ gitleaks **แทนที่**กฎมาตรฐานทั้งชุดเมื่อประกาศกฎเอง — config ที่ลืม
 * `useDefault = true` จะสแกนโดยไม่มีกฎอะไรเลย แล้วรายงาน "no leaks found" ทุกครั้ง
 * ซึ่งดูดีกว่าเดิมด้วยซ้ำ นั่นคือรูปแบบความล้มเหลวที่แพงที่สุดของโปรเจกต์นี้: ด่านที่เขียวโดยไม่ได้
 * บังคับอะไร
 *
 * พิสูจน์แล้วด้วยการยิงจริงตอนเพิ่มไฟล์นี้ (ไม่ใช่เชื่อเอกสาร): ปลูก key สุ่มจริงลง commit แล้วสแกน
 * — มี config จับได้ 1 (key ที่ปลูก) ไม่มี config จับได้ 2 (key ที่ปลูก + fixture เก่าในประวัติ)
 * แปลว่า allowlist ปิดเฉพาะค่าที่ตั้งใจ ไม่ได้ปิดตัวตรวจ
 */
describe('.gitleaks.toml', () => {
  it('ต่อยอดกฎมาตรฐาน ไม่ใช่แทนที่ — ขาดบรรทัดนี้เท่ากับปิดตัวตรวจทั้งชุด', () => {
    expect(config).toMatch(/useDefault\s*=\s*true/)
  })

  it('ยกเว้นเฉพาะค่า fixture ค่าเดียว ไม่ใช่ทั้ง path หรือทั้งกฎ', () => {
    expect(config).toContain('0123456789abcdef0123456789abcdef')
    // ยกเว้นทั้งไฟล์/ทั้งโฟลเดอร์ = ความลับจริงที่หลุดเข้าไฟล์นั้นในอนาคตผ่านฉลุย
    expect(config, 'ห้าม allowlist ด้วย paths').not.toMatch(/^\s*paths\s*=/m)
    // ห้ามปิดกฎทั้งข้อ
    expect(config, 'ห้าม allowlist ด้วย stopwords/rule ทั้งข้อ').not.toMatch(/^\s*\[\[rules\]\]/m)
  })

  it('ไม่มี regex ที่กว้างจนครอบอะไรก็ได้', () => {
    const regexes = [...config.matchAll(/'''([^']*)'''/g)].map((m) => m[1]!)
    expect(regexes.length).toBeGreaterThan(0)
    for (const r of regexes) {
      expect(r, `${r} กว้างเกินไป`).not.toMatch(/^\.[*+]$/)
      expect(r.length, `${r} สั้นเกินกว่าจะเจาะจงพอ`).toBeGreaterThan(12)
    }
  })
})
