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

// เมนูสำหรับสมาชิก: bulk/batch/per-user endpoints — ฉีด fetchImpl ตรง ๆ แทน msw เพราะแต่ละเทสต์
// สนใจ body/URL/header ของคำขอเดียวที่ยิงออกไป ไม่ใช่พฤติกรรม retry (นั่นคือหน้าที่ของ retry.test.ts)
function clientWith(fetchImpl: typeof fetch) {
  return new LineClient({ accessToken: 'test-token', fetchImpl })
}

describe('LineClient เมนูสำหรับสมาชิก (bulk/batch/per-user)', () => {
  it('bulkLink ยิง POST /v2/bot/richmenu/bulk/link พร้อม richMenuId และ userIds', async () => {
    const calls: { url: string; body: unknown }[] = []
    const client = clientWith(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response('{}', { status: 202 })
    })
    await client.bulkLink('rm-1', ['U1', 'U2'])
    expect(calls[0]!.url).toBe('https://api.line.me/v2/bot/richmenu/bulk/link')
    expect(calls[0]!.body).toEqual({ richMenuId: 'rm-1', userIds: ['U1', 'U2'] })
  })

  it('bulkLink ปฏิเสธเกิน 500 ก่อนยิง — LINE ตอบ 400 ที่อ่านไม่ออกว่าเกิดจากอะไร', async () => {
    const client = clientWith(async () => new Response('{}', { status: 202 }))
    const tooMany = Array.from({ length: 501 }, (_, i) => `U${i}`)
    await expect(client.bulkLink('rm-1', tooMany)).rejects.toThrow(/500/)
  })

  it('bulkUnlink ยิง POST /v2/bot/richmenu/bulk/unlink พร้อม userIds', async () => {
    const calls: { url: string; body: unknown }[] = []
    const client = clientWith(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response('{}', { status: 202 })
    })
    await client.bulkUnlink(['U1', 'U2'])
    expect(calls[0]!.url).toBe('https://api.line.me/v2/bot/richmenu/bulk/unlink')
    expect(calls[0]!.body).toEqual({ userIds: ['U1', 'U2'] })
  })

  it('getUserRichMenu คืน null เมื่อ LINE ตอบ 404 ไม่ใช่โยน', async () => {
    const client = clientWith(async () => new Response('{"message":"not found"}', { status: 404 }))
    expect(await client.getUserRichMenu('U1')).toBeNull()
  })

  it('getUserRichMenu คืน richMenuId ที่ user ผูกอยู่ ณ ตอนนี้', async () => {
    const client = clientWith(async () => new Response('{"richMenuId":"rm-9"}', { status: 200 }))
    expect(await client.getUserRichMenu('U1')).toBe('rm-9')
  })

  it('unlinkFromUser ยิง DELETE ไปที่ /v2/bot/user/{id}/richmenu', async () => {
    const seen: { url: string; method?: string }[] = []
    const client = clientWith(async (url, init) => {
      seen.push({ url: String(url), method: init?.method })
      return new Response('{}', { status: 200 })
    })
    await client.unlinkFromUser('U1')
    expect(seen[0]).toEqual({ url: 'https://api.line.me/v2/bot/user/U1/richmenu', method: 'DELETE' })
  })

  it('validateBatch ยิง POST /v2/bot/richmenu/validate/batch พร้อม operations เท่านั้น ไม่มี resumeRequestKey', async () => {
    const calls: { url: string; body: unknown }[] = []
    const client = clientWith(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(null, { status: 200 })
    })
    await client.validateBatch([{ type: 'link', from: 'U1', to: 'rm-1' }])
    expect(calls[0]!.url).toBe('https://api.line.me/v2/bot/richmenu/validate/batch')
    expect(calls[0]!.body).toEqual({ operations: [{ type: 'link', from: 'U1', to: 'rm-1' }] })
  })

  it('batchControl ยิง POST /v2/bot/richmenu/batch พร้อม operations และ resumeRequestKey แล้วคืน request id จาก header', async () => {
    const calls: { url: string; body: unknown }[] = []
    const client = clientWith(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response('{}', { status: 202, headers: { 'x-line-request-id': 'req-1' } })
    })
    const requestId = await client.batchControl(
      [{ type: 'unlink', from: 'U1' }, { type: 'unlinkAll' }],
      'resume-key-1',
    )
    expect(calls[0]!.url).toBe('https://api.line.me/v2/bot/richmenu/batch')
    expect(calls[0]!.body).toEqual({
      operations: [{ type: 'unlink', from: 'U1' }, { type: 'unlinkAll' }],
      resumeRequestKey: 'resume-key-1',
    })
    expect(requestId).toBe('req-1')
  })

  // batch ตอบ 202 เปล่า ๆ ได้จริงตามสเปกของ LINE — ต้องคืน null ไม่ใช่โยนหรือคืนสตริงว่าง
  it('batchControl คืน null เมื่อ LINE ไม่แนบ x-line-request-id มาด้วย', async () => {
    const client = clientWith(async () => new Response('{}', { status: 202 }))
    expect(await client.batchControl([{ type: 'unlinkAll' }], 'resume-key-2')).toBeNull()
  })

  it('batchProgress อ่าน requestId ผ่าน query string แล้วคืน phase ตรงตามที่ LINE ตอบ', async () => {
    let seenUrl = ''
    const client = clientWith(async (url) => {
      seenUrl = String(url)
      return new Response(JSON.stringify({ phase: 'ongoing' }), { status: 200 })
    })
    expect(await client.batchProgress('req-9')).toBe('ongoing')
    expect(seenUrl).toBe('https://api.line.me/v2/bot/richmenu/progress/batch?requestId=req-9')
  })
})
