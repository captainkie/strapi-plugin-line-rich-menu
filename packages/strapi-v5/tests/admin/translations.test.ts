import { describe, expect, it } from 'vitest'
import { MESSAGES, TRANSLATION_KEYS } from '@fosivo/line-rich-menu-ui'
import { prefixTranslations, trads } from '../../admin/src/translations.js'

describe('prefixTranslations', () => {
  it('เติม namespace ให้ทุกคีย์ ไม่ตกหล่นแม้แต่ตัวเดียว', () => {
    const prefixed = prefixTranslations(MESSAGES.en)
    expect(Object.keys(prefixed)).toHaveLength(TRANSLATION_KEYS.length)
    expect(Object.keys(prefixed).every((key) => key.startsWith('line-rich-menu.'))).toBe(true)
    expect(prefixed[`line-rich-menu.${TRANSLATION_KEYS[0]!}`]).toBe(MESSAGES.en[TRANSLATION_KEYS[0]!])
  })

  /**
   * ยืนยันทั้งตาราง ไม่ใช่แค่คีย์แรก — `objectContaining`/การเช็คทีละคีย์ยังเขียวได้ถึงแม้ค่าจะถูกสลับ
   * (คำแปลไปโผล่ผิดคีย์) ซึ่งเป็นความพังที่ผู้ใช้เห็นแต่เทสต์ไม่เห็น
   */
  it('ค่าของทุกคีย์ยังเป็นค่าเดิม แค่ชื่อคีย์เปลี่ยน', () => {
    expect(prefixTranslations(MESSAGES.th)).toEqual(
      Object.fromEntries(Object.entries(MESSAGES.th).map(([key, value]) => [`line-rich-menu.${key}`, value])),
    )
  })
})

describe('trads', () => {
  it('คืนทั้ง en และ th เมื่อ admin เปิดทั้งสองภาษา', () => {
    expect(trads(['en', 'th']).map((entry) => entry.locale)).toEqual(['en', 'th'])
  })

  it('ภาษาที่ปลั๊กอินไม่มีคำแปลถูกข้ามไป ไม่ใช่คืนตารางว่างทับของเดิม', () => {
    expect(trads(['fr']).map((entry) => entry.locale)).toEqual([])
  })

  it('ทั้งสองภาษามีคีย์ครบชุดเดียวกัน — คีย์ที่หายทำให้ผู้ใช้เห็น id ดิบบนหน้าจอ', () => {
    const [en, th] = [trads(['en'])[0]!, trads(['th'])[0]!]
    expect(Object.keys(th.data).sort()).toEqual(Object.keys(en.data).sort())
  })

  it('ข้อมูลที่คืนออกไปคือตารางที่เติม namespace แล้ว พร้อมส่งให้ registerTrads ตรง ๆ', () => {
    expect(trads(['en'])[0]!.data).toEqual(prefixTranslations(MESSAGES.en))
  })
})
