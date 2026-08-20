import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  LineAuthError, LineRateLimitError, LineServerError, LineValidationError,
} from '../../src/errors.js'
import { LineClient } from '../../src/line/client.js'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const payload = {
  size: { width: 2500, height: 843 },
  selected: false,
  name: 'm',
  chatBarText: 'm',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'message' as const, text: 'hi' } }],
}

function makeClient(sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})) {
  return { client: new LineClient({ accessToken: 'secret-token-value', sleep }), sleep }
}

describe('retry และ backoff', () => {
  it('ลองใหม่เมื่อเจอ 500 แล้วสำเร็จในครั้งถัดไป', async () => {
    let hits = 0
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () => {
      hits++
      return hits < 3 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ richMenuId: 'rm-ok' })
    }))
    const { client } = makeClient()
    expect(await client.createRichMenu(payload)).toBe('rm-ok')
    expect(hits).toBe(3)
  })

  it('backoff เพิ่มเป็นเท่าตัว 500ms แล้ว 1000ms', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      new HttpResponse(null, { status: 503 })))
    const { client, sleep } = makeClient()
    await expect(client.createRichMenu(payload)).rejects.toBeInstanceOf(LineServerError)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000])
  })

  it('เคารพ Retry-After ตอนเจอ 429', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      new HttpResponse(null, { status: 429, headers: { 'retry-after': '7' } })))
    const { client, sleep } = makeClient()
    await expect(client.createRichMenu(payload)).rejects.toBeInstanceOf(LineRateLimitError)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([7000, 7000])
  })

  it('ไม่ลองใหม่เมื่อเจอ 401 — credential ผิดลองกี่ครั้งก็ผิด', async () => {
    let hits = 0
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () => {
      hits++
      return new HttpResponse(null, { status: 401 })
    }))
    const { client } = makeClient()
    await expect(client.createRichMenu(payload)).rejects.toBeInstanceOf(LineAuthError)
    expect(hits).toBe(1)
  })

  it('ไม่ลองใหม่เมื่อเจอ 400 และเก็บรายละเอียดไว้ใน details', async () => {
    let hits = 0
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () => {
      hits++
      return HttpResponse.json(
        { message: 'invalid', details: [{ property: 'areas[0].bounds', message: 'out of range' }] },
        { status: 400 },
      )
    }))
    const { client } = makeClient()
    try {
      await client.createRichMenu(payload)
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect(e).toBeInstanceOf(LineValidationError)
      expect((e as LineValidationError).details).toEqual(['areas[0].bounds: out of range'])
    }
    expect(hits).toBe(1)
  })

  it('detail ที่ไม่มี property ต้องได้แค่ message ล้วน ๆ ไม่มี ": " นำหน้า', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      HttpResponse.json({ message: 'invalid', details: [{ message: 'bad thing' }] }, { status: 400 })))
    const { client } = makeClient()
    try {
      await client.createRichMenu(payload)
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect((e as LineValidationError).details).toEqual(['bad thing'])
    }
  })

  it('หลาย detail ต้องแมปมาครบทุกอัน ไม่ใช่แค่อันแรก', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      HttpResponse.json({
        message: 'invalid',
        details: [{ property: 'a', message: 'x' }, { property: 'b', message: 'y' }],
      }, { status: 400 })))
    const { client } = makeClient()
    try {
      await client.createRichMenu(payload)
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect((e as LineValidationError).details).toEqual(['a: x', 'b: y'])
    }
  })

  it('ไม่มี details แต่มี message ระดับบนสุด — ต้องใช้ message นั้นแทนไม่ใช่ปล่อยว่าง', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      HttpResponse.json({ message: 'something went wrong overall' }, { status: 400 })))
    const { client } = makeClient()
    try {
      await client.createRichMenu(payload)
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect((e as LineValidationError).details).toEqual(['something went wrong overall'])
    }
  })

  it('body ของ error ที่ parse เป็น JSON ไม่ได้เลย — ต้องได้ details ว่างเปล่า ไม่ใช่ throw ซ้อน', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      new HttpResponse('not json at all {{{', { status: 400 })))
    const { client } = makeClient()
    try {
      await client.createRichMenu(payload)
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect(e).toBeInstanceOf(LineValidationError)
      expect((e as LineValidationError).details).toEqual([])
    }
  })

  it('retry-after ที่ไม่ใช่ตัวเลข ต้อง fallback เป็น 1 วินาที ไม่ใช่ NaN', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      new HttpResponse(null, { status: 429, headers: { 'retry-after': 'not-a-number' } })))
    const { client } = makeClient()
    try {
      await client.createRichMenu(payload)
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect(e).toBeInstanceOf(LineRateLimitError)
      expect((e as LineRateLimitError).retryAfterSeconds).toBe(1)
    }
  })

  // ยามกัน token รั่ว — ข้อบังคับจาก spec 13.2 ข้อ 2 และ 3
  it('access token ต้องไม่ปรากฏใน message ของ error ทุกชนิด', async () => {
    const statuses = [400, 401, 429, 500]
    for (const status of statuses) {
      server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
        new HttpResponse(null, { status })))
      const { client } = makeClient()
      try {
        await client.createRichMenu(payload)
      } catch (e) {
        const dump = JSON.stringify({ message: (e as Error).message, ...(e as object) })
        expect(dump, `status ${status} ทำ token รั่ว`).not.toContain('secret-token-value')
      }
    }
  })

  it('maxAttempts ที่ต่ำกว่า 1 ต้องถูกยกเป็น 1 ไม่ใช่โยน undefined ออกมา', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      new HttpResponse(null, { status: 500 })))
    const client = new LineClient({ accessToken: 'secret-token-value', maxAttempts: 0, sleep: vi.fn(async () => {}) })
    await expect(client.createRichMenu(payload)).rejects.toBeInstanceOf(LineServerError)
  })

  it('fetchImpl ที่ฉีดเข้ามาต้องชนะ globalThis.fetch เสมอ แม้ global จะถูกสลับทีหลัง', async () => {
    const originalFetch = globalThis.fetch
    let injectedCalled = false
    let globalCalled = false
    const injectedFetch = (async () => {
      injectedCalled = true
      return new Response(JSON.stringify({ richMenuId: 'rm-injected' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    const globalStub = (async () => {
      globalCalled = true
      return new Response(JSON.stringify({ richMenuId: 'rm-global' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const client = new LineClient({ accessToken: 'secret-token-value', fetchImpl: injectedFetch })
    globalThis.fetch = globalStub
    try {
      const richMenuId = await client.createRichMenu(payload)
      expect(richMenuId).toBe('rm-injected')
      expect(injectedCalled).toBe(true)
      expect(globalCalled).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
