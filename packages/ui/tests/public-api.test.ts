import { describe, expect, it } from 'vitest'
import * as pkg from '../src/index.js'

/**
 * index.ts ต้อง export ทุกอย่างที่ adapter (Plan 03/04) ต้อง import — รายการนี้คือ
 * runtime export ทั้งหมดที่ควรมี (type/interface ล้วนหายไปตอน compile จึงไม่อยู่ในรายการนี้)
 *
 * ตั้งใจเทียบเป็นชุดทั้งหมด (toEqual กับ sorted array) ไม่ใช่แค่ subset — ถ้ามีใครเพิ่มโมดูลใหม่
 * ใน src/ แล้วลืมต่อเข้า index.ts เทสต์นี้จะไม่รู้ (มันเช็คแค่สิ่งที่ import มาได้) แต่ถ้ามีใคร
 * ลบ/เปลี่ยนชื่อ export ที่มีอยู่โดยไม่ได้ตั้งใจ หรือพิมพ์ path export * ผิดจนไม่ได้อะไรออกมา
 * เทสต์นี้จะแดงทันที — ป้องกัน export list ที่นิ่งเงียบจนกว่า adapter ฝั่ง Plan 03 จะ build ไม่ผ่าน
 */
const EXPECTED_EXPORTS = [
  // index.ts เอง
  'UI_VERSION',

  // port.ts
  'PortProvider',
  'usePort',

  // stub-port.tsx
  'createStubPort',
  'createRejectingHttpClient',

  // action-form.ts
  'emptyActionForm',
  'toAction',
  'fromAction',

  // styles.ts
  'injectStylesOnce',
  'OUTLINE_COLOR',
  'ACTIVE_FILL',
  'INVALID_COLOR',

  // components/*
  'ActionForm',
  'AreaList',
  'CanvasEditor',
  'ChatBarSettings',
  'ImageField',
  'MainSettings',
  'Preview',
  'TemplatePicker',

  // pages/*
  'ChannelSettings',
  'RichMenuEditor',
  'RichMenuList',
  'emptyDraft',
  'hasAnyActionConfigured',

  // api.ts — สัญญา endpoint ที่ adapter ต้อง implement (Task 12)
  'ENDPOINTS',

  // i18n/index.ts — Task 13, adapter ทั้งสองฝั่งใช้ registerTrads ด้วยคีย์พวกนี้
  'MESSAGES',
  'TRANSLATION_KEYS',
  'validationKey',
].sort()

describe('index.ts — ผิวส่งออกสาธารณะของแพ็กเกจ', () => {
  it('export ครบตามรายการที่ adapter ต้องใช้ ไม่ขาดไม่เกิน', () => {
    expect(Object.keys(pkg).sort()).toEqual(EXPECTED_EXPORTS)
  })

  it('ไม่มี export ไหนเป็น undefined — เผื่อ path export * พิมพ์ผิดจนไม่ได้อะไรออกมาเลย', () => {
    for (const [name, value] of Object.entries(pkg)) {
      expect(value, `${name} ไม่ควรเป็น undefined`).not.toBeUndefined()
    }
  })

  it('MESSAGES/TRANSLATION_KEYS/validationKey ที่ import จาก index.ts เป็นตัวเดียวกับที่ i18n/index.ts ส่งออก', async () => {
    const direct = await import('../src/i18n/index.js')
    expect(pkg.MESSAGES).toBe(direct.MESSAGES)
    expect(pkg.TRANSLATION_KEYS).toBe(direct.TRANSLATION_KEYS)
    expect(pkg.validationKey).toBe(direct.validationKey)
  })
})
