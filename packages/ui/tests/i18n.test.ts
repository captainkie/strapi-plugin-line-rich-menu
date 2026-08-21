// @vitest-environment node
//
// This file only walks the filesystem — it never touches the DOM. Under the package-wide
// `environment: 'jsdom'` (vitest.config.ts), Vite's static asset-URL rewrite intercepts
// `new URL('..', import.meta.url)` and rewrites it into an `http://localhost/@fs/...` dev-server
// URL instead of leaving it a real `file:` URL, so `fileURLToPath()` below throws
// "The URL must be of scheme file" (see tests/no-framework-deps.test.ts for the same fix).
// Forcing the `node` environment for this file only avoids that rewrite.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VALIDATION_CODES } from '@fosivo/line-rich-menu-core/browser'
import { describe, expect, it } from 'vitest'
import { MESSAGES, TRANSLATION_KEYS, validationKey } from '../src/i18n/index.js'

const srcRoot = fileURLToPath(new URL('../src', import.meta.url))
const translationsRoot = fileURLToPath(new URL('../src/translations', import.meta.url))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : []
  })
}

/**
 * ดึงทุกคีย์ที่โค้ดเรียกจริงผ่าน t('...')
 *
 * ข้อจำกัด: regex นี้จับได้แค่ literal ที่เป็น single-quote ตามหลัง `t(` ทันที — คีย์ที่ประกอบตอน
 * runtime ด้วย template literal (เช่น `t(\`validation.${issue.code}\`)`) หรือที่อยู่หลัง expression
 * (เช่น `t(publish ? 'a' : 'b')`) จะไม่ถูกจับ ทดสอบนี้จึง "เขียว" ได้โดยไม่ได้พิสูจน์ว่าคีย์ทุกคีย์ที่
 * โค้ดเรียกจริงมีคำแปลครบ — พิสูจน์แค่ว่าคีย์ที่เขียนตรง ๆ ครบเท่านั้น ครอบคลุมคีย์ที่ประกอบตอน runtime
 * ต้องอาศัยเทสต์แยกที่แจกแจงค่าที่เป็นไปได้เอง (ดู describe ถัดไปในไฟล์นี้)
 */
function keysUsedInSource(): string[] {
  const found = new Set<string>()
  for (const file of walk(srcRoot)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9._-]+)'/g)) {
      found.add(match[1]!)
    }
  }
  return [...found].sort()
}

function isSorted(keys: readonly string[]): boolean {
  return keys.every((key, index) => index === 0 || keys[index - 1]! <= key)
}

describe('i18n', () => {
  it('มีทั้ง en และ th', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual(['en', 'th'])
  })

  it('ทั้งสองภาษามีคีย์ชุดเดียวกันเป๊ะ', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.th).sort())
  })

  it('TRANSLATION_KEYS ตรงกับคีย์ทั้งหมดใน en', () => {
    expect([...TRANSLATION_KEYS]).toEqual(Object.keys(MESSAGES.en).sort())
  })

  it('ไม่มีคำแปลไหนเป็นสตริงว่าง', () => {
    for (const [locale, table] of Object.entries(MESSAGES)) {
      const empty = Object.entries(table).filter(([, value]) => value.trim() === '')
      expect(empty, `${locale} มีคำแปลว่าง`).toEqual([])
    }
  })

  // ยามที่สำคัญที่สุด: คีย์ที่โค้ดเรียกแต่ไม่มีคำแปล จะโผล่เป็น raw key บนหน้าจอผู้ใช้
  it('ทุกคีย์ที่โค้ดเรียกใช้ (แบบ literal) มีคำแปลครบทั้งสองภาษา', () => {
    const missing: string[] = []
    for (const key of keysUsedInSource()) {
      // คีย์ที่ประกอบขึ้นตอน runtime เช่น t(`action.type.${type}`) จับด้วย regex ไม่ได้
      // จึงตรวจเฉพาะคีย์ที่เขียนตรง ๆ
      if (MESSAGES.en[key] === undefined) missing.push(`en:${key}`)
      if (MESSAGES.th[key] === undefined) missing.push(`th:${key}`)
    }
    expect(missing).toEqual([])
  })

  it('มีคำแปลของคีย์ที่ประกอบตอน runtime ครบทุกค่าที่เป็นไปได้ — action.type/mode, status, template group', () => {
    const dynamic = [
      ...['message', 'uri', 'postback', 'datetimepicker', 'richmenuswitch', 'clipboard', 'camera', 'cameraRoll', 'location']
        .map((t) => `action.type.${t}`),
      ...['date', 'time', 'datetime'].map((m) => `action.mode.${m}`),
      ...['draft', 'publishing', 'published', 'failed'].map((s) => `status.${s}`),
      ...['large', 'compact'].map((g) => `template.picker.group.${g}`),
    ]
    const missing = dynamic.filter((key) => MESSAGES.en[key] === undefined || MESSAGES.th[key] === undefined)
    expect(missing).toEqual([])
  })

  // validation.* เป็นครอบครัวเดียวที่ "เปิด" ไม่ปิด — packages/core/src/schema.ts คำนวณ
  // code เป็น `params?.code ?? issue.code` แปลว่ามันคือ code ของเราเองเมื่อเราตั้งไว้ ไม่งั้นก็เป็น
  // อะไรก็ได้ที่ zod คำนวณเอง (เปลี่ยนได้ตอน zod อัปเกรด) รายการที่ hand-copy ไว้ในเทสต์จึงพิสูจน์
  // ไม่ได้ว่าคำแปลครบจริง — ต้อง import VALIDATION_CODES จาก core แทนพิมพ์ซ้ำ เพื่อให้เทสต์นี้แดง
  // จริงถ้าใครเพิ่ม code ใหม่ใน schema.ts แล้วลืมเติมคำแปล ส่วน code ของ zod เอง (too_small,
  // too_big, unrecognized_keys) เป็น literal ที่ schema.ts เรียกใช้จริงในตอนนี้ — คงไว้ตรงนี้
  it('มีคำแปลของ validation.* ครบทุก code ที่ schema.ts ประกาศเอง บวก code ของ zod ที่ใช้จริง', () => {
    const dynamic = [
      ...VALIDATION_CODES.map((code) => `validation.${code}`),
      ...['too_small', 'too_big', 'unrecognized_keys'].map((code) => `validation.${code}`),
    ]
    const missing = dynamic.filter((key) => MESSAGES.en[key] === undefined || MESSAGES.th[key] === undefined)
    expect(missing).toEqual([])
  })

  describe('validationKey', () => {
    it('code กำหนดเอง (อยู่ใน VALIDATION_CODES) map ไปคีย์ของตัวเอง', () => {
      for (const code of VALIDATION_CODES) {
        expect(validationKey(code)).toBe(`validation.${code}`)
      }
    })

    it('code ของ zod ที่ schema.ts ใช้จริงก็ map ไปคีย์ของตัวเองเช่นกัน', () => {
      expect(validationKey('too_small')).toBe('validation.too_small')
    })

    // 'invalid_type' เป็น code รูปทรงแบบ zod แต่ไม่ได้อยู่ในแคตตาล็อกคำแปลของเราโดยตั้งใจ —
    // จำลองกรณี zod อัปเกรดแล้วเปลี่ยน/เพิ่ม internal code ที่เราไม่เคยเห็นมาก่อน
    it('code แปลกหน้าที่ไม่มีคำแปล ตกไปที่ validation.unknown แทนที่จะหลุดเป็น validation.invalid_type ดิบ ๆ', () => {
      expect(validationKey('invalid_type')).toBe('validation.unknown')
    })

    it('validation.unknown มีคำแปลจริงทั้งสองภาษา', () => {
      expect(MESSAGES.en['validation.unknown']).toBeDefined()
      expect(MESSAGES.th['validation.unknown']).toBeDefined()
    })
  })

  // คำแปลไทยที่ "ตรงกับอังกฤษเป๊ะ" มีสองแบบที่หน้าตาเหมือนกันทุกประการ คือแบบที่ตั้งใจใช้คำทับศัพท์
  // ตามที่ LINE ใช้เอง กับแบบที่ลืมแปลแล้ว copy อังกฤษมาวาง — guard ตัวอื่นในไฟล์นี้แยกสองอย่างนี้
  // ไม่ออกเลย เพราะคีย์มีครบและค่าไม่ว่าง allowlist ด้านล่างจึงเป็นการประกาศเจตนา: อยู่ในนี้ = ตั้งใจ
  // ไม่อยู่ = พลาด เพิ่มคีย์เข้ารายการนี้ได้ แต่ต้องเป็นการตัดสินใจที่เห็นใน diff ไม่ใช่หลุดมาเงียบ ๆ
  describe('คำแปลที่เหมือนอังกฤษทุกตัวอักษร ต้องเป็นคำทับศัพท์ที่ตั้งใจ ไม่ใช่ที่ลืมแปล', () => {
    const DELIBERATE_LOANWORDS: readonly string[] = [
      'action.field.uri',
      'action.type.postback',
      'action.type.uri',
      'channel.accessToken',
      'channel.channelId',
      'channel.channelSecret',
      'editor.heading',
      'editor.template',
      'template.picker.group.compact',
      'template.picker.group.large',
    ]

    it('ไม่มีคีย์ที่เหมือนกันเป๊ะนอกเหนือจากรายการที่ประกาศไว้', () => {
      const identical = Object.keys(MESSAGES.en)
        .filter((key) => MESSAGES.en[key] === MESSAGES.th[key])
        .sort()
      expect(identical).toEqual([...DELIBERATE_LOANWORDS].sort())
    })
  })

  describe('translations/{en,th}.json เรียงตามคีย์ (spec §12 — source of truth ที่ adapter จะ copy ไป)', () => {
    it('en.json เรียงตามคีย์', () => {
      const raw = JSON.parse(readFileSync(join(translationsRoot, 'en.json'), 'utf8')) as Record<string, string>
      expect(isSorted(Object.keys(raw))).toBe(true)
    })

    it('th.json เรียงตามคีย์', () => {
      const raw = JSON.parse(readFileSync(join(translationsRoot, 'th.json'), 'utf8')) as Record<string, string>
      expect(isSorted(Object.keys(raw))).toBe(true)
    })
  })
})
