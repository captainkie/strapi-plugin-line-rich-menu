import { describe, expect, it, vi } from 'vitest'
import { LineMark, MESSAGES } from '@fosivo/line-rich-menu-ui'
import admin from '../../src/admin/index.js'
import { prefixTranslations } from '../../src/admin/translations.js'

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

  // ชั้นแรกของ deny by default — คนที่ไม่มีสิทธิ์ read ไม่ควรเห็นแม้แต่ชื่อปลั๊กอิน
  it('เมนูซ้ายถูกกั้นด้วยสิทธิ์ read ของปลั๊กอิน', () => {
    expect(register().link['permissions']).toEqual([
      { action: 'plugin::line-rich-menu.read', subject: null },
    ])
  })

  it('มี icon จริง ไม่ใช่ undefined — แอดมินของ v4 วาด icon ของทุกเมนูโดยไม่เช็คก่อน', () => {
    expect(register().link['icon']).toBeTypeOf('function')
  })

  // สเปกงานนี้ #2 — ไอคอนเมนูต้องเป็นเครื่องหมาย LINE ที่เราวาดเอง ไม่ใช่ `Message` กลาง ๆ ของ
  // Strapi (`@strapi/icons`) อีกต่อไป ต้องแดงถ้ามีใครสลับกลับ
  it('ไอคอนเมนูคือ LineMark ของเราเอง ไม่ใช่ไอคอนกลาง ๆ ของ @strapi/icons', () => {
    expect(register().link['icon']).toBe(LineMark)
  })

  /**
   * ยามที่แพงที่สุดในไฟล์นี้: มันโหลดทั้งต้นไม้ของหน้าจอจริง (App → port → primitives → pages)
   * import ที่พังสักตัวเดียวในนั้นจะแดงที่นี่ แทนที่จะไปแดงเป็นหน้าขาวในแอดมินของลูกค้า
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
  it('คืนตารางที่เติม namespace แล้ว พร้อมส่งให้ react-intl ตรง ๆ', async () => {
    expect(await admin.registerTrads({ locales: ['en', 'th', 'fr'] })).toEqual([
      { locale: 'en', data: prefixTranslations(MESSAGES.en) },
      { locale: 'th', data: prefixTranslations(MESSAGES.th) },
    ])
  })
})
