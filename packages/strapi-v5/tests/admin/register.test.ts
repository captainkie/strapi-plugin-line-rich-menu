// @vitest-environment jsdom
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LineMark, MESSAGES } from '@fosivo/line-rich-menu-ui'
import admin from '../../admin/src/index.js'
import { prefixTranslations } from '../../admin/src/translations.js'

function register() {
  const addMenuLink = vi.fn()
  const registerPlugin = vi.fn()
  admin.register({ addMenuLink, registerPlugin })
  return {
    link: addMenuLink.mock.calls[0]![0] as Record<string, unknown>,
    plugin: registerPlugin.mock.calls[0]![0] as Record<string, unknown>,
  }
}

describe('register', () => {
  it('เมนูซ้ายชี้ไปยัง path เดียวกับที่ router ของปลั๊กอินรับไว้', () => {
    const { link } = register()
    expect(link['to']).toBe('/plugins/line-rich-menu')
    expect(link['intlLabel']).toEqual({ id: 'line-rich-menu.plugin.name', defaultMessage: 'LINE Rich Menu' })
  })

  it('เมนูซ้ายถูกกั้นด้วยสิทธิ์ read ของปลั๊กอิน', () => {
    expect(register().link['permissions']).toEqual([
      { action: 'plugin::line-rich-menu.read', subject: null },
    ])
  })

  /**
   * v4 ถามว่า icon เป็นฟังก์ชันไหม เพราะ DS v1 ส่งไอคอนออกมาเป็น function component ตรง ๆ
   * DS v2 เคยห่อไอคอนของตัวเอง (`@strapi/icons`) ด้วย `forwardRef` (ค่าที่ได้จึงเป็นอ็อบเจกต์
   * `{ $$typeof, render }`) แต่ตั้งแต่สเปกงานนี้ #2 ไอคอนเมนูไม่ใช่ `@strapi/icons` อีกต่อไป —
   * เป็น `LineMark` ของแพ็กเกจเราเอง ซึ่งเป็น plain function component ธรรมดา (ใช้ร่วมกับ v4
   * ที่ต้องการ `toBeTypeOf('function')` ตรง ๆ) เทสต์นี้จึงต้องไม่ผูกกับ "รูปทรง" ของไอคอนตัวใดตัวหนึ่ง
   * (forwardRef หรือ function เฉย ๆ ก็ได้) ยืนยันแค่สิ่งที่ชื่อเทสต์บอกจริง ๆ: "React วาดมันได้"
   * เพราะแอดมินของ Strapi วาด icon ของทุกเมนูโดยไม่เช็คก่อนว่ารูปทรงเป็นแบบไหน
   */
  it('มี icon จริงที่ React วาดได้ ไม่ใช่ undefined', () => {
    const Icon = register().link['icon'] as ComponentType
    expect(Icon).toBeDefined()
    expect(() => renderToStaticMarkup(createElement(Icon))).not.toThrow()
  })

  // สเปกงานนี้ #2 — ไอคอนเมนูต้องเป็นเครื่องหมาย LINE ที่เราวาดเอง ไม่ใช่ `Message` กลาง ๆ ของ
  // Strapi (`@strapi/icons`) อีกต่อไป ต้องแดงถ้ามีใครสลับกลับ
  it('ไอคอนเมนูคือ LineMark ของเราเอง ไม่ใช่ไอคอนกลาง ๆ ของ @strapi/icons', () => {
    expect(register().link['icon']).toBe(LineMark)
  })

  /**
   * ยามที่แพงที่สุดในไฟล์นี้: มันโหลดทั้งต้นไม้ของหน้าจอจริง (App → port → primitives → pages)
   * import ที่พังสักตัวเดียวในนั้นจะแดงที่นี่ แทนที่จะไปแดงเป็นหน้าขาวในแอดมินของลูกค้า
   *
   * ตัวเดียวที่ไม่ใช่ของจริงในต้นไม้นี้คือ `@strapi/strapi/admin` ซึ่ง vitest.config.ts ชี้ไป
   * test double — ดูเหตุผลเต็มในไฟล์ double เอง และดู examples/v5-app (Task 10) ที่พิสูจน์ของจริง
   */
  it('Component ที่ lazy ไว้ resolve เป็น module ที่มี default component จริง', async () => {
    const load = register().link['Component'] as () => Promise<{ default: unknown }>
    expect(load).toBeTypeOf('function')
    expect((await load()).default).toBeTypeOf('function')
  })

  it('ลงทะเบียนตัวปลั๊กอินด้วย id เดียวกับที่ endpoint ทุกเส้นใช้', () => {
    expect(register().plugin).toEqual({
      id: 'line-rich-menu', initializer: undefined, isReady: true, name: 'line-rich-menu',
    })
  })
})

describe('registerTrads', () => {
  /**
   * สเปก §12 บอกว่า v5 ใช้ `registerTrads` เหมือน v4 แต่ helper `prefixPluginTranslations`
   * หายไปพร้อม `@strapi/helper-plugin` ทั้งแพ็กเกจ — Plan 03 เขียนตัวแทนสามบรรทัดไว้แล้ว
   * ไฟล์นั้นจึงย้ายมาทั้งดุ้น และนี่คือด่านที่ยืนยันว่ามันยังทำงานเหมือนเดิม
   */
  it('คืนตารางที่เติม namespace แล้ว พร้อมส่งให้ react-intl ตรง ๆ', async () => {
    expect(await admin.registerTrads({ locales: ['en', 'th', 'fr'] })).toEqual([
      { locale: 'en', data: prefixTranslations(MESSAGES.en) },
      { locale: 'th', data: prefixTranslations(MESSAGES.th) },
    ])
  })
})
