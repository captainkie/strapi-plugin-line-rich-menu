import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ENDPOINTS } from '../src/api.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { RichMenuList } from '../src/pages/RichMenuList.js'

const menus = [
  { id: '1', title: 'เมนูหลัก', status: 'published' as const, channelId: 'c1', aliasId: 'main', updatedAt: '2026-08-20' },
  { id: '2', title: 'ร่าง', status: 'draft' as const, channelId: 'c1', aliasId: null, updatedAt: '2026-08-19' },
]

function setup(get = vi.fn(async () => menus)) {
  const base = createStubPort({ t: (k) => k })
  // http.get<T> เป็น generic — mock ที่ผูก return type เป็น array คงที่ต้อง cast ทั้งก้อน http
  // ที่จุดประกอบเข้า port เท่านั้น (เหมือน image-field.test.tsx/channels.test.tsx) ไม่งั้น TS ปฏิเสธ
  // เพราะ generic <T> อาจถูกเรียกด้วย type อื่นที่ไม่ใช่ array คงที่นี้ก็ได้
  const port = { ...base, http: { ...base.http, get } as typeof base.http }
  render(<PortProvider value={port}><RichMenuList channelId="c1" /></PortProvider>)
  return { get, port }
}

describe('RichMenuList', () => {
  it('แสดงสถานะกำลังโหลดก่อน แล้วค่อยแสดงรายการ', async () => {
    setup()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('เมนูหลัก')).toBeInTheDocument())
  })

  it('แสดงสถานะของแต่ละเมนู', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('status-1').textContent).toContain('status.published'))
    expect(screen.getByTestId('status-2').textContent).toContain('status.draft')
  })

  it('กรองตาม channel ที่เลือก', async () => {
    const { get } = setup()
    await waitFor(() => expect(get).toHaveBeenCalledWith(`${ENDPOINTS.menus}?channel=c1`))
  })

  it('บอกว่ายังไม่มีเมนู แทนที่จะแสดงตารางเปล่า', async () => {
    setup(vi.fn(async () => []))
    await waitFor(() => expect(screen.getByText('list.empty')).toBeInTheDocument())
  })

  // S1 (STANDING-CORRECTIONS) — Alert primitive วาด role="status" ไม่ใช่ "alert"
  // ต้องเช็คข้อความจาก key ที่โค้ดส่งให้ t() จริง ไม่ใช่ getByRole('alert') ที่ไม่ match อะไรเลย
  it('แจ้งเตือนเมื่อโหลดไม่สำเร็จ ไม่ใช่ค้างที่ spinner', async () => {
    setup(vi.fn(async () => { throw new Error('boom') }))
    await waitFor(() => expect(screen.getByText('list.loadFailed')).toBeInTheDocument())
  })

  it('ยังไม่เลือก channel ก็ไม่ยิงคำขอ', () => {
    const get = vi.fn()
    const base = createStubPort({ t: (k) => k })
    render(
      <PortProvider value={{ ...base, http: { ...base.http, get } }}>
        <RichMenuList channelId={null} />
      </PortProvider>,
    )
    expect(get).not.toHaveBeenCalled()
    expect(screen.getByText('list.pickChannel')).toBeInTheDocument()
  })

  // S2 — testId ต้องอยู่บน ui.Button จริง ไม่ใช่ <span> ข้างใน ไม่งั้น disabled/click จับต้องอะไรไม่ได้จริง
  it('กดแก้ไขแล้วนำทางไปหน้า editor ของเมนูนั้น', async () => {
    const push = vi.fn()
    const base = createStubPort({ t: (k) => k })
    render(
      <PortProvider value={{ ...base, http: { ...base.http, get: async () => menus } as typeof base.http, nav: { ...base.nav, push } }}>
        <RichMenuList channelId="c1" />
      </PortProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('edit-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edit-1'))
    expect(push).toHaveBeenCalledWith('/rich-menus/1')
  })
})
