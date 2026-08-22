import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ENDPOINTS, type ChannelAudience, type RichMenuSummary } from '../src/api.js'
import { MESSAGES } from '../src/i18n/index.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { AudienceToggle } from '../src/components/AudienceToggle.js'

const publishedMenu: RichMenuSummary = {
  id: 'm1', title: 'เมนูสมาชิก', status: 'published', channelId: 'c1', aliasId: null,
  updatedAt: '2026-08-20', size: 'large', imageUrl: null, startAt: null, endAt: null,
  audience: 'members', lineRichMenuId: 'line-rm-1', areas: [],
}

// เมนูที่ยังไม่ publish ไม่มี lineRichMenuId — activate เส้นนี้จะโดน 409 menu_not_ready เปล่า ๆ
const draftMenu: RichMenuSummary = { ...publishedMenu, id: 'm2', status: 'draft', lineRichMenuId: null }

const noOneActive: Pick<ChannelAudience, 'defaultRichMenuId' | 'memberRichMenuId'> = {
  defaultRichMenuId: 'line-rm-9', memberRichMenuId: null,
}

function setup({
  menu = publishedMenu,
  audience = { ...noOneActive, memberCount: 0 } as ChannelAudience,
  post = vi.fn(async () => undefined),
  onChanged = vi.fn(),
  t = (k: string) => k,
}: {
  menu?: RichMenuSummary
  audience?: ChannelAudience
  post?: ReturnType<typeof vi.fn>
  onChanged?: ReturnType<typeof vi.fn>
  t?: (key: string, values?: Record<string, string | number>) => string
} = {}) {
  const get = vi.fn(async () => audience)
  const base = createStubPort({ t })
  const port = { ...base, http: { ...base.http, get, post } as typeof base.http }
  render(<PortProvider value={port}><AudienceToggle menu={menu} onChanged={onChanged} /></PortProvider>)
  return { get, post, onChanged }
}

/** เปิดสวิตช์ → กล่องยืนยันโผล่ → กดยืนยัน → ยิง activate จนสำเร็จ */
async function activate(overrides: Parameters<typeof setup>[0] = {}) {
  const utils = setup({ audience: { ...noOneActive, memberCount: 5 } as ChannelAudience, ...overrides })
  await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
  fireEvent.click(screen.getByRole('switch'))
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  fireEvent.click(screen.getByTestId('confirm-activate'))
  await waitFor(() => expect(screen.getByTestId('audience-result')).toBeInTheDocument())
  return utils
}

/** t() ที่ lookup คำแปลจริงจาก MESSAGES แล้วแทน {placeholder} — identity `(k) => k` พิสูจน์ได้แค่
 * ว่าโค้ดเรียกคีย์ถูก ไม่พิสูจน์ว่าคำแปลจริงเขียนว่าอะไร ซึ่งเป็นเรื่องเดียวที่เทสต์ความซื่อสัตย์
 * ของข้อความ (ห้ามพูดว่า "ได้รับแล้ว") หรือเทสต์ที่ต้องอ่าน {count} ที่แทนแล้วต้องการจริง ๆ */
function realT(locale: 'en' | 'th') {
  return (key: string, values?: Record<string, string | number>): string => {
    const template = MESSAGES[locale][key] ?? key
    return values === undefined
      ? template
      : Object.entries(values).reduce((s, [name, value]) => s.replaceAll(`{${name}}`, String(value)), template)
  }
}

/** เปิดสวิตช์แค่ถึงกล่องยืนยัน ไม่กดยืนยันต่อ — ไว้ตรวจเนื้อหากล่องเฉย ๆ ต้องใช้ `realT` ไม่ใช่
 * identity `(k) => k` เพราะเทสต์ต้องอ่านค่า {count} ที่แทนแล้วจริง ๆ ในข้อความ ไม่ใช่ raw key */
async function openConfirm({ memberCount }: { memberCount: number }) {
  const utils = setup({ audience: { ...noOneActive, memberCount } as ChannelAudience, t: realT('th') })
  await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
  fireEvent.click(screen.getByRole('switch'))
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  return utils
}

describe('AudienceToggle', () => {
  it('เมนูที่ยังไม่ได้เป็นเมนูสมาชิก สวิตช์เริ่มปิด', async () => {
    setup({ audience: { ...noOneActive, memberCount: 0 } as ChannelAudience })
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
    expect(screen.getByRole('switch')).not.toBeChecked()
  })

  it('เมนูที่เป็นเมนูสมาชิกอยู่แล้ว (memberRichMenuId ตรงกับ lineRichMenuId ของแถวนี้) สวิตช์เริ่มเปิด', async () => {
    setup({ audience: { defaultRichMenuId: null, memberRichMenuId: 'line-rm-1', memberCount: 3 } })
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked())
  })

  // สเปกงานนี้ #1 — draft ไม่มี lineRichMenuId ให้ activate กดไปก็โดน 409 เปล่า ๆ ปิดสวิตช์ไว้ก่อน
  it('เมนูที่ยังไม่ publish ปิดสวิตช์ไว้ กดเปิดใช้งานไม่ได้', async () => {
    const post = vi.fn()
    setup({ menu: draftMenu, post })
    await waitFor(() => expect(screen.getByRole('switch')).toBeInTheDocument())
    expect(screen.getByRole('switch')).toBeDisabled()

    // trap ที่ทีมเตือนไว้ — ยืนยันเอง (ไม่ใช่แค่เดาจากคำเตือน) ด้วยเทสต์เปล่าแยกต่างหากก่อนเขียน
    // อันนี้: บน input ที่ disabled จริง `fireEvent.change` ถูก React เช็ค disabled แล้วไม่ยิง
    // onChange ให้ (จึงพิสูจน์อะไรไม่ได้ ถ้าใช้ตัวนี้) แต่ `fireEvent.click` ยัง "คลิก" element
    // ได้ตรง ๆ แล้วยิง onChange ให้จริง ข้าม `disabled` ของ input ไปเงียบ ๆ — ต้องใช้ click เพื่อให้
    // เทสต์นี้พิสูจน์อะไรจริง ๆ ไม่ใช่เขียวเฉย ๆ ไม่ว่า handler จะเช็ค canToggle เองหรือไม่ก็ตาม
    // (สอง assertion ด้านล่างพิสูจน์แยกกัน: attribute จริงด้านบน + logic-level guard ที่นี่)
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('กดสวิตช์ตอนเปิด (ยังไม่ active) เปิดกล่องยืนยันก่อน ไม่ยิง activate ทันที', async () => {
    const { post } = setup({ audience: { ...noOneActive, memberCount: 5 } as ChannelAudience })
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })

  it('กดยืนยันในกล่องแล้วยิง activate ไปยังเมนูแถวนี้', async () => {
    const { post, onChanged } = await activate()
    expect(post).toHaveBeenCalledWith(ENDPOINTS.menuAudienceActivate('m1'))
    expect(onChanged).toHaveBeenCalled()
  })

  it('กดสวิตช์ตอนเปิดอยู่แล้ว (active) ปิดทันทีโดยไม่ถามยืนยัน — สเปกถามยืนยันเฉพาะตอนเปิดเท่านั้น', async () => {
    const { post } = setup({ audience: { defaultRichMenuId: null, memberRichMenuId: 'line-rm-1', memberCount: 3 } })
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked())
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(post).toHaveBeenCalledWith(ENDPOINTS.menuAudienceDeactivate('m1')))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('กล่องยืนยันบอกจำนวนสมาชิกที่จะโดน', async () => {
    await openConfirm({ memberCount: 1042 })
    expect(screen.getByRole('dialog').textContent).toContain('1042')
  })

  /**
   * Task 11 fix round 1 — memberCount แพง (findMany ทั้งตาราง ไม่มี Repo.count()) endpoint
   * `channels/:id/audience` ถูกเรียกทุกครั้งที่ mount (การ์ด + สวิตช์ทุกแถว) แต่ตัวเลขนี้มีประโยชน์
   * แค่ตอนกล่องยืนยันกำลังจะเปิด — เทสต์นี้แยก URL สองแบบออกจากกันจริง ๆ (mount ต้องไม่มี `count=1`
   * เลยสักคำขอ ส่วนตอนกดสวิตช์ต้องมี) ไม่ใช่แค่เดาว่า "component เรียก http.get สองครั้ง"
   */
  it('ขอ memberCount เฉพาะตอนกำลังจะเปิดกล่องยืนยัน ไม่ใช่ทุกครั้งที่ mount', async () => {
    const get = vi.fn(async (url: string) => (
      url.includes('count=1') ? { ...noOneActive, memberCount: 7 } : { ...noOneActive, memberCount: null }
    ))
    // ต้องใช้ realT — เนื้อหากล่องยืนยัน (ที่มี {count} แทนแล้ว) เป็นสิ่งที่เทสต์นี้อ่านจริง
    // identity `(k) => k` จะทิ้งค่า count ไปเลย แล้ว assertion ท้ายเทสต์จะหา "7" ไม่เจอ
    const base = createStubPort({ t: realT('th') })
    const port = { ...base, http: { ...base.http, get, post: vi.fn(async () => undefined) } as typeof base.http }
    render(<PortProvider value={port}><AudienceToggle menu={publishedMenu} /></PortProvider>)

    await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
    expect(get.mock.calls.some(([url]) => String(url).includes('count=1'))).toBe(false)

    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining('count=1')))
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('7'))
  })

  /**
   * ข้อความต้องไม่อ้างสิ่งที่ยืนยันไม่ได้ — bulk/link ตอบ 202 เปล่า ๆ (สเปก "What we cannot know")
   *
   * มีทางเดียวเท่านั้นที่พิสูจน์เรื่องนี้ได้จริง: render ผ่าน `t()` ที่ lookup คำแปลจริงจาก
   * `MESSAGES` (ทั้งไทยและอังกฤษ) แล้วอ่านข้อความที่ *ออกจอจริง* — ไม่ใช่ identity `t: (k) => k`
   * ที่คืนคีย์ดิบ (`'audience.sent'`) เฉย ๆ เวอร์ชัน identity เคยอยู่ในไฟล์นี้และดูเหมือนพิสูจน์
   * เรื่องนี้ได้ (มัน assert `.not.toMatch(/received|ได้รับแล้ว/)` เหมือนกัน) แต่รีวิวจับได้ว่ามัน
   * เขียวอยู่ตลอดไม่ว่าคำแปลจริงจะเขียนว่าอะไร — ลองแก้ `en.json` ให้ `audience.sent` พูดว่า
   * "Members received this menu at {time}" ตรง ๆ ดู เทสต์แบบ identity จะยังเขียว เพราะมันไม่เคย
   * อ่านค่าจาก `en.json` เลยสักตัวอักษร มันแค่เช็คว่าโค้ดเรียก `t('audience.sent', ...)` ด้วยคีย์
   * ที่ถูกต้องเท่านั้น ถูกลบออกจากไฟล์นี้แล้วเพื่อไม่ให้มีเทสต์สองตัวคุ้มเรื่องเดียวกัน — ตัวจริงเขียว
   * ตัวปลอมก็เขียวตาม ๆ กันไป จนกว่าตัวจริงพังแล้วไม่มีใครสังเกตเพราะตัวปลอมยังเขียวอยู่
   */
  it('เนื้อหาคำแปลจริงทั้งไทยและอังกฤษก็ไม่อ้างว่าได้รับแล้ว', async () => {
    for (const locale of ['en', 'th'] as const) {
      const { unmount } = render(
        <PortProvider value={(() => {
          const base = createStubPort({ t: realT(locale) })
          return { ...base, http: { ...base.http, get: vi.fn(async () => ({ ...noOneActive, memberCount: 5 })), post: vi.fn(async () => undefined) } as typeof base.http }
        })()}
        >
          <AudienceToggle menu={publishedMenu} />
        </PortProvider>,
      )
      await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
      fireEvent.click(screen.getByRole('switch'))
      await waitFor(() => expect(screen.getByTestId('confirm-activate')).toBeInTheDocument())
      fireEvent.click(screen.getByTestId('confirm-activate'))
      await waitFor(() => expect(screen.getByTestId('audience-result')).toBeInTheDocument())
      expect(screen.getByTestId('audience-result').textContent).not.toMatch(/received|ได้รับแล้ว/)
      unmount()
    }
  })

  it('activate ล้มเหลว ต้องขึ้น error ไม่ใช่เงียบ', async () => {
    const post = vi.fn(async () => { throw new Error('boom') })
    setup({ audience: { ...noOneActive, memberCount: 5 } as ChannelAudience, post })
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('confirm-activate'))
    await waitFor(() => expect(screen.getByText('audience.actionFailed')).toBeInTheDocument())
    expect(screen.queryByTestId('audience-result')).not.toBeInTheDocument()
  })
})
