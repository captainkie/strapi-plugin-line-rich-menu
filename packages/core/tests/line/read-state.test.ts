import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { LineNotFoundError, LineValidationError } from '../../src/errors.js'
import { LineClient } from '../../src/line/client.js'
import { endpoints } from '../../src/line/endpoints.js'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const client = () => new LineClient({ accessToken: 'secret-token-value' })

describe('endpoints.defaultRichMenu', () => {
  it('เป็น URL เดียวกับ clearDefault — ต่างกันแค่ HTTP method', () => {
    expect(endpoints.defaultRichMenu('https://api.line.me'))
      .toBe(endpoints.clearDefault('https://api.line.me'))
  })
})

describe('getDefault', () => {
  it('คืน richMenuId เมื่อมี default อยู่', async () => {
    server.use(http.get('https://api.line.me/v2/bot/user/all/richmenu', () =>
      HttpResponse.json({ richMenuId: 'richmenu-current' })))
    expect(await client().getDefault()).toBe('richmenu-current')
  })

  it('คืน null เมื่อ LINE ตอบ 404 — ยังไม่เคยตั้ง default ไม่ใช่ error', async () => {
    server.use(http.get('https://api.line.me/v2/bot/user/all/richmenu', () =>
      HttpResponse.json({ message: 'no default richmenu' }, { status: 404 })))
    expect(await client().getDefault()).toBeNull()
  })

  it('400 ยังเป็น LineValidationError เหมือนเดิม ไม่ถูกกลืนเป็น null', async () => {
    server.use(http.get('https://api.line.me/v2/bot/user/all/richmenu', () =>
      HttpResponse.json({ message: 'bad' }, { status: 400 })))
    await expect(client().getDefault()).rejects.toBeInstanceOf(LineValidationError)
  })
})

describe('getAlias', () => {
  it('คืน richMenuId ที่ alias ชี้อยู่', async () => {
    server.use(http.get('https://api.line.me/v2/bot/richmenu/alias/tab-a', () =>
      HttpResponse.json({ richMenuAliasId: 'tab-a', richMenuId: 'richmenu-a' })))
    expect(await client().getAlias('tab-a')).toBe('richmenu-a')
  })

  it('คืน null เมื่อยังไม่มี alias ตัวนั้น', async () => {
    server.use(http.get('https://api.line.me/v2/bot/richmenu/alias/tab-a', () =>
      HttpResponse.json({ message: 'not found' }, { status: 404 })))
    expect(await client().getAlias('tab-a')).toBeNull()
  })
})

describe('404 จาก endpoint อื่น', () => {
  it('เป็น LineNotFoundError ไม่ใช่ LineValidationError', async () => {
    server.use(http.delete('https://api.line.me/v2/bot/richmenu/richmenu-gone', () =>
      HttpResponse.json({ message: 'not found' }, { status: 404 })))
    await expect(client().deleteRichMenu('richmenu-gone')).rejects.toBeInstanceOf(LineNotFoundError)
  })
})
