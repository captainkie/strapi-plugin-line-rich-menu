import { describe, expect, it, vi } from 'vitest'
import { makeHttp, makeNav, makeT, makeToast, type FetchClient } from '../../src/admin/adapters.js'

describe('makeHttp', () => {
  it('แกะ .data ของ axios ออกให้ ui เห็นแค่ payload', async () => {
    const client = {
      get: vi.fn(async () => ({ data: [{ id: '1' }] })),
      post: vi.fn(async () => ({ data: { ok: true } })),
      put: vi.fn(async () => ({ data: { ok: true } })),
      del: vi.fn(async () => ({ data: null })),
    }
    const http = makeHttp(client as unknown as FetchClient)
    expect(await http.get('/x')).toEqual([{ id: '1' }])
    expect(await http.post('/x', { a: 1 })).toEqual({ ok: true })
    expect(await http.put('/x', { a: 1 })).toEqual({ ok: true })
    expect(await http.del('/x')).toBeNull()
  })

  it('ส่ง FormData ต่อโดยไม่แปลงร่าง — ไม่งั้นการอัปโหลดรูปพังทั้งฟีเจอร์', async () => {
    const post = vi.fn<(url: string, body?: unknown) => Promise<{ data: { id: number }[] }>>(
      async () => ({ data: [{ id: 1 }] }),
    )
    const body = new FormData()
    body.append('files', new Blob(['x']), 'a.png')

    const http = makeHttp({ get: vi.fn(), post, put: vi.fn(), del: vi.fn() } as unknown as FetchClient)
    await http.post('/upload', body)

    expect(post).toHaveBeenCalledWith('/upload', body)
    expect(post.mock.calls[0]![1]).toBeInstanceOf(FormData)
  })

  /**
   * ข้อกำหนดบน `HttpClient` ใน port.ts: non-2xx ต้อง reject ไม่ใช่ resolve เป็นค่าว่าง
   * axios reject ให้อยู่แล้ว หน้าที่ของ adapter คือ "ไม่กลืน" — จับตรงนี้ไว้เพราะการเผลอ
   * ใส่ try/catch ที่คืน `null` เข้าไปในภายหลังจะทำให้ทุกหน้าจอเงียบสนิทตอนเซิร์ฟเวอร์พัง
   */
  it('ไม่กลืนความล้มเหลวของ client — reject ทะลุขึ้นไปถึงผู้เรียกครบทั้งสี่เมธอด', async () => {
    const boom = new Error('403')
    const reject = vi.fn(async () => { throw boom })
    const http = makeHttp({ get: reject, post: reject, put: reject, del: reject } as unknown as FetchClient)

    await expect(http.get('/x')).rejects.toBe(boom)
    await expect(http.post('/x', {})).rejects.toBe(boom)
    await expect(http.put('/x', {})).rejects.toBe(boom)
    await expect(http.del('/x')).rejects.toBe(boom)
  })
})

describe('makeToast', () => {
  it('จับคู่ danger เป็น warning เพราะ v4 ไม่มีชนิด danger', () => {
    const toggle = vi.fn()
    const toast = makeToast(toggle)

    toast({ type: 'success', message: 'ok' })
    toast({ type: 'warning', message: 'careful' })
    toast({ type: 'danger', message: 'boom' })

    expect(toggle.mock.calls.map((call) => (call[0] as { type: string }).type))
      .toEqual(['success', 'warning', 'warning'])
  })

  it('ส่งข้อความที่แปลมาแล้วต่อครบทั้งก้อน ไม่ใช่แค่ชนิด', () => {
    const toggle = vi.fn()
    makeToast(toggle)({ type: 'danger', message: 'boom' })

    expect(toggle).toHaveBeenCalledTimes(1)
    expect(toggle.mock.calls[0]![0]).toEqual({
      type: 'warning',
      message: { id: 'line-rich-menu.toast', defaultMessage: 'boom' },
    })
  })
})

describe('makeNav', () => {
  it('เติม prefix ของปลั๊กอินให้ path ที่ ui ส่งมาแบบสัมพัทธ์', () => {
    const history = { push: vi.fn() }
    const Link = (() => null) as never
    makeNav(history, Link).push('/rich-menus/7')
    expect(history.push).toHaveBeenCalledWith('/plugins/line-rich-menu/rich-menus/7')
  })

  it('ไม่เติมซ้ำถ้า path เต็มมาแล้ว', () => {
    const history = { push: vi.fn() }
    makeNav(history, (() => null) as never).push('/plugins/line-rich-menu/rich-menus/7')
    expect(history.push).toHaveBeenCalledWith('/plugins/line-rich-menu/rich-menus/7')
  })

  it('ส่ง Link ของ router ต่อไปตามตัว — ui วาด <a> ผ่านตัวนี้ตัวเดียว', () => {
    const Link = (() => null) as never
    expect(makeNav({ push: vi.fn() }, Link).Link).toBe(Link)
  })
})

describe('makeT', () => {
  it('เติม namespace ของปลั๊กอินให้คีย์ และส่ง values ต่อ', () => {
    const formatMessage = vi.fn(() => 'แปลแล้ว')
    expect(makeT(formatMessage)('list.empty', { count: 2 })).toBe('แปลแล้ว')
    expect(formatMessage).toHaveBeenCalledWith(
      { id: 'line-rich-menu.list.empty', defaultMessage: 'list.empty' },
      { count: 2 },
    )
  })
})
