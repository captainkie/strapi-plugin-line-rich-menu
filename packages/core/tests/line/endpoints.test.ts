import { describe, expect, it } from 'vitest'
import { DEFAULT_API_BASE, DEFAULT_API_DATA_BASE, endpoints } from '../../src/line/endpoints.js'

const B = DEFAULT_API_BASE
const D = DEFAULT_API_DATA_BASE

describe('endpoints', () => {
  it('ประกอบ URL ได้ถูกต้องทุกเส้น', () => {
    expect(endpoints.createRichMenu(B)).toBe('https://api.line.me/v2/bot/richmenu')
    expect(endpoints.validateRichMenu(B)).toBe('https://api.line.me/v2/bot/richmenu/validate')
    expect(endpoints.richMenu(B, 'rm-1')).toBe('https://api.line.me/v2/bot/richmenu/rm-1')
    expect(endpoints.richMenuList(B)).toBe('https://api.line.me/v2/bot/richmenu/list')
    expect(endpoints.uploadContent(D, 'rm-1')).toBe('https://api-data.line.me/v2/bot/richmenu/rm-1/content')
    expect(endpoints.setDefault(B, 'rm-1')).toBe('https://api.line.me/v2/bot/user/all/richmenu/rm-1')
    expect(endpoints.clearDefault(B)).toBe('https://api.line.me/v2/bot/user/all/richmenu')
    expect(endpoints.alias(B)).toBe('https://api.line.me/v2/bot/richmenu/alias')
    expect(endpoints.aliasById(B, 'tab-a')).toBe('https://api.line.me/v2/bot/richmenu/alias/tab-a')
    expect(endpoints.aliasList(B)).toBe('https://api.line.me/v2/bot/richmenu/alias/list')
    expect(endpoints.botInfo(B)).toBe('https://api.line.me/v2/bot/info')
    expect(endpoints.userRichMenu(B, 'U123', 'rm-1')).toBe('https://api.line.me/v2/bot/user/U123/richmenu/rm-1')
  })

  it('เข้ารหัสค่าที่มาจากผู้ใช้ กัน path traversal', () => {
    expect(endpoints.richMenu(B, '../../admin')).toBe('https://api.line.me/v2/bot/richmenu/..%2F..%2Fadmin')
    expect(endpoints.aliasById(B, 'a/b')).toBe('https://api.line.me/v2/bot/richmenu/alias/a%2Fb')
    expect(endpoints.userRichMenu(B, 'U/1', 'r?x=1')).toBe('https://api.line.me/v2/bot/user/U%2F1/richmenu/r%3Fx%3D1')
  })

  it('รองรับ base URL ที่ชี้ไป line-mock ตอนทดสอบ', () => {
    expect(endpoints.createRichMenu('http://127.0.0.1:4010')).toBe('http://127.0.0.1:4010/v2/bot/richmenu')
  })
})
