import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ENDPOINTS, type ChannelAudience, type RichMenuSummary } from '../src/api.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { CurrentMenuCard } from '../src/components/CurrentMenuCard.js'

// รูปทรงเดียวกับที่ `GET /menus` คืนจริงหลังงานนี้ — `lineRichMenuId` คือกุญแจที่การ์ดนี้ใช้
// resolve `defaultRichMenuId`/`memberRichMenuId` (id ฝั่ง LINE) กลับเป็นชื่อเมนู
const menus: RichMenuSummary[] = [
  {
    id: '1', title: 'เมนูหลัก', status: 'published', channelId: 'c1', aliasId: null,
    updatedAt: '2026-08-20', size: 'large', imageUrl: null, startAt: null, endAt: null,
    audience: 'all', lineRichMenuId: 'line-rm-9', areas: [],
  },
  {
    id: '2', title: 'เมนูสมาชิก', status: 'published', channelId: 'c1', aliasId: null,
    updatedAt: '2026-08-20', size: 'large', imageUrl: null, startAt: null, endAt: null,
    audience: 'members', lineRichMenuId: 'line-rm-1', areas: [],
  },
]

function renderCard(
  audience: Pick<ChannelAudience, 'defaultRichMenuId' | 'memberRichMenuId'>,
  get = vi.fn(async (url: string) => (
    url === ENDPOINTS.channelAudience('c1') ? { ...audience, memberCount: 0 } : menus
  )),
) {
  const base = createStubPort({ t: (k) => k })
  // http.get<T> เป็น generic — cast ทั้งก้อน http ที่จุดประกอบเข้า port เท่านั้น (แพทเทิร์นเดียวกับ
  // list.test.tsx/image-field.test.tsx เพราะ mock แบบนี้ผูก return type ไว้แน่นอนตาม url ไม่ใช่ตาม T)
  const port = { ...base, http: { ...base.http, get } as typeof base.http }
  render(<PortProvider value={port}><CurrentMenuCard channelId="c1" /></PortProvider>)
  return { get }
}

describe('CurrentMenuCard', () => {
  it('การ์ดบนสุดบอกทั้งเมนูของทุกคนและของสมาชิก', async () => {
    renderCard({ defaultRichMenuId: 'line-rm-9', memberRichMenuId: 'line-rm-1' })
    await waitFor(() => expect(screen.getByTestId('current-all')).toHaveTextContent('เมนูหลัก'))
    expect(screen.getByTestId('current-members')).toHaveTextContent('เมนูสมาชิก')
  })

  it('ยังไม่ได้ตั้งเมนูของสมาชิก บอกตรง ๆ ไม่ใช่ช่องว่าง', async () => {
    renderCard({ defaultRichMenuId: 'line-rm-9', memberRichMenuId: null })
    await waitFor(() => expect(screen.getByTestId('current-members')).toHaveTextContent('list.currentMenu.none'))
  })

  // เมนูที่เคยเป็น default/member แล้วถูกลบทิ้งไปทีหลัง — id ฝั่ง LINE ที่ channel ยังจำได้
  // ไม่มีในรายการที่โหลดมาแล้วอีกต่อไป ต้องบอกตรง ๆ เหมือนกรณี id เป็น null เอง ไม่ใช่ id ดิบ
  it('id ที่ resolve เป็นชื่อไม่ได้ (เมนูถูกลบไปแล้ว) บอกว่ายังไม่ได้ตั้ง ไม่ใช่ id ดิบ', async () => {
    renderCard({ defaultRichMenuId: 'line-rm-deleted', memberRichMenuId: null })
    await waitFor(() => expect(screen.getByTestId('current-all')).toHaveTextContent('list.currentMenu.none'))
  })

  it('โหลดล้มเหลว ต้องขึ้น error ไม่ใช่ค้างที่ spinner', async () => {
    const get = vi.fn(async () => { throw new Error('boom') })
    const base = createStubPort({ t: (k) => k })
    const port = { ...base, http: { ...base.http, get } as typeof base.http }
    render(<PortProvider value={port}><CurrentMenuCard channelId="c1" /></PortProvider>)
    await waitFor(() => expect(screen.getByText('list.loadFailed')).toBeInTheDocument())
  })

  it('ยิงทั้ง audience และ menus ของ channel ที่ถูกต้อง', async () => {
    const { get } = renderCard({ defaultRichMenuId: 'line-rm-9', memberRichMenuId: 'line-rm-1' })
    await waitFor(() => expect(screen.getByTestId('current-all')).toHaveTextContent('เมนูหลัก'))
    expect(get).toHaveBeenCalledWith(ENDPOINTS.channelAudience('c1'))
    expect(get).toHaveBeenCalledWith(`${ENDPOINTS.menus}?channel=c1`)
  })

  /**
   * Task 21 item 3 — เดิมสองคำขอนี้ผูกกันด้วย `Promise.all` เดียว: audience ล้มเฉย ๆ (menus โหลดได้
   * ปกติ) ก็ยังขึ้นข้อความ 'list.loadFailed' ("โหลดรายการ rich menu ไม่สำเร็จ") ทั้งที่รายการเมนู
   * ไม่ได้พังจริง — เทสต์นี้ตรวจว่าตอนนี้แยกกันแล้ว: audience ล้มอย่างเดียวต้องขึ้นข้อความคนละคีย์
   * ('audience.loadFailed') ไม่ใช่ข้อความที่อ้างว่ารายการเมนูพัง
   */
  it('เฉพาะ audience โหลดไม่สำเร็จ (menus โหลดได้ปกติ) ต้องบอกเหตุผลที่ตรง ไม่ใช่ "โหลดรายการ rich menu ไม่สำเร็จ"', async () => {
    const get = vi.fn(async (url: string) => {
      if (url === ENDPOINTS.channelAudience('c1')) throw new Error('boom')
      return menus
    })
    const base = createStubPort({ t: (k) => k })
    const port = { ...base, http: { ...base.http, get } as typeof base.http }
    render(<PortProvider value={port}><CurrentMenuCard channelId="c1" /></PortProvider>)
    await waitFor(() => expect(screen.getByText('audience.loadFailed')).toBeInTheDocument())
    expect(screen.queryByText('list.loadFailed')).not.toBeInTheDocument()
  })

  it('เฉพาะ menus โหลดไม่สำเร็จ (audience โหลดได้ปกติ) ยังขึ้น "โหลดรายการ rich menu ไม่สำเร็จ" เหมือนเดิม', async () => {
    const get = vi.fn(async (url: string) => {
      if (url === ENDPOINTS.channelAudience('c1')) return { defaultRichMenuId: null, memberRichMenuId: null, memberCount: 0 }
      throw new Error('boom')
    })
    const base = createStubPort({ t: (k) => k })
    const port = { ...base, http: { ...base.http, get } as typeof base.http }
    render(<PortProvider value={port}><CurrentMenuCard channelId="c1" /></PortProvider>)
    await waitFor(() => expect(screen.getByText('list.loadFailed')).toBeInTheDocument())
    expect(screen.queryByText('audience.loadFailed')).not.toBeInTheDocument()
  })
})
