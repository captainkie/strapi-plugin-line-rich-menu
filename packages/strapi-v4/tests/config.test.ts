import { describe, expect, it } from 'vitest'
import { configDefault, readConfig, validateConfig } from '../src/server/config.js'
import type { StrapiV4 } from '../src/server/strapi.js'

function fakeStrapi(values: Record<string, unknown>): StrapiV4 {
  return {
    config: { get: <T>(path: string, fallback?: T) => (values[path] ?? fallback) as T },
  } as unknown as StrapiV4
}

describe('validateConfig', () => {
  it('เติมค่าเริ่มต้นให้ครบเมื่อผู้ใช้ไม่ได้ตั้งอะไรเลย', () => {
    expect(validateConfig({})).toEqual(configDefault)
  })

  it('ปฏิเสธ cron ที่ว่างและ lockTtlMs ที่ไม่เป็นบวก', () => {
    expect(() => validateConfig({ scheduler: { enabled: true, cron: '', lockTtlMs: 1000 } })).toThrow()
    expect(() => validateConfig({ scheduler: { enabled: true, cron: '* * * * *', lockTtlMs: 0 } })).toThrow()
  })

  it('ปฏิเสธ base url ที่ไม่ใช่ URL', () => {
    expect(() => validateConfig({ lineApiBaseUrl: 'ไม่ใช่ url' })).toThrow()
  })

  it('ปฏิเสธคีย์แปลกปลอม — จับ typo ตั้งแต่ตอนบูต ไม่ใช่ตอนที่ฟีเจอร์เงียบไปเฉย ๆ', () => {
    expect(() => validateConfig({ mockmode: true })).toThrow()
  })
})

describe('readConfig', () => {
  it('อ่านค่าจาก config ของปลั๊กอินและผ่าน validator', () => {
    const config = readConfig(fakeStrapi({
      'plugin.line-rich-menu': { mockMode: true, lineApiBaseUrl: 'http://127.0.0.1:4010' },
    }))
    expect(config.mockMode).toBe(true)
    expect(config.lineApiBaseUrl).toBe('http://127.0.0.1:4010')
    expect(config.scheduler.cron).toBe(configDefault.scheduler.cron)
  })
})
