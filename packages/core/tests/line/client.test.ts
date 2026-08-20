import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { LineClient } from '../../src/line/client.js'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// สร้าง client ตรงนี้ (module scope) ตั้งใจ — ก่อน beforeAll ข้างบนจะรัน server.listen() เสียอีก
// ถ้า client.ts กลับไป resolve globalThis.fetch ตอน constructor แทนที่จะ resolve ตอนเรียกจริง
// ชุดเทสต์นี้จะหลุดไปยิง LINE จริงและ fail แบบเงียบ ๆ (เห็น LineAuthError จาก 401 ของจริง) แทนที่จะ fail ด้วย unhandled request
const client = new LineClient({ accessToken: 'test-token' })

const payload = {
  size: { width: 2500, height: 1686 },
  selected: false,
  name: 'menu',
  chatBarText: 'menu',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message' as const, text: 'hi' } }],
}

describe('LineClient เส้นทางปกติ', () => {
  it('แนบ Authorization header ที่ถูกต้อง', async () => {
    let seen: string | null = null
    server.use(http.post('https://api.line.me/v2/bot/richmenu', ({ request }) => {
      seen = request.headers.get('authorization')
      return HttpResponse.json({ richMenuId: 'rm-1' })
    }))
    await client.createRichMenu(payload)
    expect(seen).toBe('Bearer test-token')
  })

  it('createRichMenu คืน richMenuId', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      HttpResponse.json({ richMenuId: 'rm-42' })))
    expect(await client.createRichMenu(payload)).toBe('rm-42')
  })

  it('validateRichMenu ผ่านเมื่อ LINE ตอบ 200', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu/validate', () =>
      new HttpResponse(null, { status: 200 })))
    await expect(client.validateRichMenu(payload)).resolves.toBeUndefined()
  })

  it('uploadContent ยิงไป api-data พร้อม Content-Type ของรูป', async () => {
    let contentType: string | null = null
    let bodyLength = 0
    server.use(http.post('https://api-data.line.me/v2/bot/richmenu/rm-1/content', async ({ request }) => {
      contentType = request.headers.get('content-type')
      bodyLength = (await request.arrayBuffer()).byteLength
      return new HttpResponse(null, { status: 200 })
    }))
    await client.uploadContent('rm-1', Buffer.from([1, 2, 3, 4]), 'image/png')
    expect(contentType).toBe('image/png')
    expect(bodyLength).toBe(4)
  })

  it('setDefault และ clearDefault ยิงถูกเส้น', async () => {
    const called: string[] = []
    server.use(
      http.post('https://api.line.me/v2/bot/user/all/richmenu/rm-1', () => {
        called.push('set'); return new HttpResponse(null, { status: 200 })
      }),
      http.delete('https://api.line.me/v2/bot/user/all/richmenu', () => {
        called.push('clear'); return new HttpResponse(null, { status: 200 })
      }),
    )
    await client.setDefault('rm-1')
    await client.clearDefault()
    expect(called).toEqual(['set', 'clear'])
  })

  it('listRichMenus คืนอาเรย์จากฟิลด์ richmenus', async () => {
    server.use(http.get('https://api.line.me/v2/bot/richmenu/list', () =>
      HttpResponse.json({ richmenus: [{ richMenuId: 'a' }, { richMenuId: 'b' }] })))
    expect(await client.listRichMenus()).toHaveLength(2)
  })

  // LINE ตอบ {} เมื่อยังไม่มีเมนูหรือ alias เลย — ไม่ใช่ { richmenus: [] }
  it('listRichMenus คืนอาเรย์ว่างเมื่อ LINE ไม่ส่งฟิลด์ richmenus มาเลย', async () => {
    server.use(http.get('https://api.line.me/v2/bot/richmenu/list', () => HttpResponse.json({})))
    expect(await client.listRichMenus()).toEqual([])
  })

  it('listAliases คืนอาเรย์ว่างเมื่อ LINE ไม่ส่งฟิลด์ aliases มาเลย', async () => {
    server.use(http.get('https://api.line.me/v2/bot/richmenu/alias/list', () => HttpResponse.json({})))
    expect(await client.listAliases()).toEqual([])
  })

  it('alias สร้าง อัปเดต ลบ และ list ได้', async () => {
    const calls: string[] = []
    server.use(
      http.post('https://api.line.me/v2/bot/richmenu/alias', () => {
        calls.push('create'); return HttpResponse.json({})
      }),
      http.post('https://api.line.me/v2/bot/richmenu/alias/tab-a', () => {
        calls.push('update'); return HttpResponse.json({})
      }),
      http.delete('https://api.line.me/v2/bot/richmenu/alias/tab-a', () => {
        calls.push('delete'); return HttpResponse.json({})
      }),
      http.get('https://api.line.me/v2/bot/richmenu/alias/list', () =>
        HttpResponse.json({ aliases: [{ richMenuAliasId: 'tab-a', richMenuId: 'rm-1' }] })),
    )
    await client.createAlias('tab-a', 'rm-1')
    await client.updateAlias('tab-a', 'rm-2')
    await client.deleteAlias('tab-a')
    expect(await client.listAliases()).toHaveLength(1)
    expect(calls).toEqual(['create', 'update', 'delete'])
  })

  it('getBotInfo คืนข้อมูล OA สำหรับปุ่ม Test connection', async () => {
    server.use(http.get('https://api.line.me/v2/bot/info', () =>
      HttpResponse.json({ userId: 'U1', basicId: '@abc', displayName: 'ร้านทดสอบ' })))
    expect((await client.getBotInfo()).displayName).toBe('ร้านทดสอบ')
  })

  it('ชี้ base URL ไป line-mock ได้', async () => {
    const local = new LineClient({ accessToken: 't', apiBaseUrl: 'http://127.0.0.1:4010' })
    server.use(http.post('http://127.0.0.1:4010/v2/bot/richmenu', () =>
      HttpResponse.json({ richMenuId: 'local-1' })))
    expect(await local.createRichMenu(payload)).toBe('local-1')
  })

  it('getRichMenu คืน richMenuId ของเมนูที่ระบุ', async () => {
    server.use(http.get('https://api.line.me/v2/bot/richmenu/rm-9', () =>
      HttpResponse.json({ richMenuId: 'rm-9' })))
    expect(await client.getRichMenu('rm-9')).toEqual({ richMenuId: 'rm-9' })
  })

  it('deleteRichMenu ยิง DELETE ไปที่ richMenuId ที่ระบุ', async () => {
    let hitUrl: string | null = null
    server.use(http.delete('https://api.line.me/v2/bot/richmenu/rm-9', ({ request }) => {
      hitUrl = request.url
      return HttpResponse.json({})
    }))
    await client.deleteRichMenu('rm-9')
    expect(hitUrl).toBe('https://api.line.me/v2/bot/richmenu/rm-9')
  })

  it('linkToUser ยิงไปที่ userId และ richMenuId ที่ระบุ', async () => {
    let hitUrl: string | null = null
    server.use(http.post('https://api.line.me/v2/bot/user/U123/richmenu/rm-9', ({ request }) => {
      hitUrl = request.url
      return HttpResponse.json({})
    }))
    await client.linkToUser('U123', 'rm-9')
    expect(hitUrl).toBe('https://api.line.me/v2/bot/user/U123/richmenu/rm-9')
  })

  it('ใช้ globalThis.fetch ตอนเรียก ไม่ใช่ตอนสร้าง — ไม่งั้นตัว interceptor ที่ติดตั้งทีหลังจะถูกข้าม', async () => {
    const originalFetch = globalThis.fetch
    let calledWith: string | null = null
    try {
      globalThis.fetch = ((input: string | URL | Request) => {
        calledWith = typeof input === 'string' ? input : input.toString()
        return Promise.resolve(new Response(null, { status: 200 }))
      }) as typeof fetch
      // client ถูกสร้างไปแล้วตอน module load (ก่อนบรรทัดนี้เยอะ) โดยไม่ได้ inject fetchImpl —
      // ถ้ามันเก็บ globalThis.fetch ไว้ตอน constructor สตับตัวนี้จะไม่มีวันถูกเรียก
      await client.clearDefault()
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(calledWith).toBe('https://api.line.me/v2/bot/user/all/richmenu')
  })
})
