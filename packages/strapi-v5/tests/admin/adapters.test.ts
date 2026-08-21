import { describe, expect, it, vi } from 'vitest'
import { makeHttp, makeNav, makeT, makeToast, type FetchClient } from '../../admin/src/adapters.js'

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
  /**
   * v4 ไม่มี type `danger` จึงต้องจับคู่ลง `warning` ส่วน v5 มีครบทั้งสี่ (`info` `warning`
   * `danger` `success`) — การจับคู่จึงหายไปทั้งอัน `danger` ต้องเดินทางถึงปลายทางเป็น `danger`
   * ถ้าใครยก makeToast ของ v4 มาทั้งดุ้น ข้อผิดพลาดจะเงียบสนิท: ผู้ใช้เห็นแถบสีส้มแทนสีแดง
   */
  it('ส่ง type ต่อโดยไม่แปลง — v5 มี danger จริง', () => {
    const toggle = vi.fn()
    makeToast(toggle)({ type: 'danger', message: 'ปล่อยเมนูไม่สำเร็จ' })
    expect(toggle).toHaveBeenCalledWith({ type: 'danger', message: 'ปล่อยเมนูไม่สำเร็จ' })
  })

  /**
   * `message` ของ v5 เป็นสตริงที่แปลแล้ว ไม่ใช่ descriptor `{ id, defaultMessage }` ของ
   * react-intl แบบ v4 — ข้อความจากฝั่ง ui ผ่าน `port.t` มาแล้วจึงส่งต่อได้ตรง ๆ
   * ถ้าส่ง descriptor ไป Strapi 5 จะวาด `[object Object]` ในกล่องแจ้งเตือน
   */
  it('message เป็นสตริง ไม่ใช่ descriptor ของ react-intl', () => {
    const toggle = vi.fn<(n: { type: string; message: unknown }) => void>()
    makeToast(toggle)({ type: 'success', message: 'บันทึกแล้ว' })
    expect(typeof toggle.mock.calls[0]![0].message).toBe('string')
  })

  it('type อื่นก็ส่งต่อตรง ๆ เช่นกัน', () => {
    const toggle = vi.fn()
    makeToast(toggle)({ type: 'warning', message: 'ระวัง' })
    expect(toggle).toHaveBeenCalledWith({ type: 'warning', message: 'ระวัง' })
  })
})

describe('makeNav', () => {
  it('เติม prefix ของที่ปลั๊กอินถูก mount ไว้ให้ path ที่ ui ไม่รู้จัก', () => {
    const navigate = vi.fn()
    makeNav(navigate, () => null).push('/rich-menus/new')
    expect(navigate).toHaveBeenCalledWith('/plugins/line-rich-menu/rich-menus/new')
  })

  it('ไม่เติมซ้ำถ้า path เต็มมาแล้ว', () => {
    const navigate = vi.fn()
    makeNav(navigate, () => null).push('/plugins/line-rich-menu/rich-menus/1')
    expect(navigate).toHaveBeenCalledWith('/plugins/line-rich-menu/rich-menus/1')
  })

  // router v6 ให้ `useNavigate()` ที่เป็นฟังก์ชันตรง ๆ ไม่ใช่ `history` ที่มีเมธอด `push`
  // การรับฟังก์ชันเข้ามาแทนอ็อบเจกต์ทำให้ไฟล์นี้ยังไม่รู้จัก router ตัวไหนเลย
  it('รับฟังก์ชัน navigate ไม่ใช่อ็อบเจกต์ history', () => {
    expect(() => makeNav(() => {}, () => null)).not.toThrow()
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
