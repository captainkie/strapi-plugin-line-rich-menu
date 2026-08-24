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

// publish แล้วแต่ประกาศไว้ว่าเป็นเมนูของทุกคน — activate เส้นนี้จะโดน 409 menu_not_members_audience
// เปล่า ๆ (assertMembersAudience ตั้งแต่ Task 13) ซึ่งเป็นความล้มเหลวที่รู้ล่วงหน้าตัวที่สอง
const allAudienceMenu: RichMenuSummary = { ...publishedMenu, id: 'm3', audience: 'all' }

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

  /**
   * Task 14b item 2 — กฎที่เขียนไว้แล้วสำหรับกรณี draft (สี่บรรทัดถัดไป) ไม่เคยถูกขยายมาถึง
   * ความล้มเหลวที่รู้ล่วงหน้าตัวที่สองที่ Task 13 เพิ่มเข้ามา: เมนู `audience: 'all'` กดเปิดไปก็ได้
   * 409 `menu_not_members_audience` กลับมาเสมอ แล้วขึ้น toast `audience.actionFailed` ที่ไม่ได้
   * บอกอะไรเลยสักคำเรื่อง audience — ผู้ใช้ไม่มีทางรู้ว่าต้องไปแก้อะไรที่ไหน
   */
  describe('เมนูที่ audience เป็น all (Task 14b item 2)', () => {
    it('ปิดสวิตช์ไว้ กดเปิดใช้งานไม่ได้ — ไม่ปล่อยให้ยิงคำขอที่รู้อยู่แล้วว่าต้องได้ 409', async () => {
      const post = vi.fn()
      const { get } = setup({ menu: allAudienceMenu, post })
      // รอให้ audience โหลดเสร็จก่อน — ไม่งั้นจะพิสูจน์แค่ "ยังโหลดไม่เสร็จ" ซึ่งเป็นคนละเหตุผล
      // กับที่ describe นี้ตั้งใจจับ และจะเขียวต่อไปแม้ gate ของ audience จะถูกถอดออกทั้งอัน
      await waitFor(() => expect(get).toHaveBeenCalled())
      expect(screen.getByRole('switch')).toBeDisabled()

      // ยิง event ตรงเข้า input ข้าม attribute disabled ไปเลย — handler ต้องกันเองด้วย
      // (แพทเทิร์นเดียวกับเทสต์ของเมนู draft ข้างล่าง)
      fireEvent.click(screen.getByRole('switch'))
      expect(post).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // สวิตช์ที่ปิดโดยไม่บอกเหตุผลคือทางตันของตัวมันเอง — เหตุผลต้องอยู่ตรงที่ผู้ใช้กำลังมองอยู่
    it('บอกเหตุผลที่กดไม่ได้ พร้อมวิธีแก้ ไม่ใช่ปิดเงียบ ๆ', async () => {
      setup({ menu: allAudienceMenu, t: realT('en') })
      await waitFor(() => expect(screen.getByRole('switch')).toBeDisabled())
      expect(screen.getByText(MESSAGES.en['audience.notMembersMenu']!)).toBeInTheDocument()
    })

    it('เมนูที่ audience เป็น members ไม่ขึ้นข้อความนั้น และสวิตช์ยังกดได้ตามปกติ', async () => {
      setup({ t: realT('en') })
      await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
      expect(screen.queryByText(MESSAGES.en['audience.notMembersMenu']!)).not.toBeInTheDocument()
    })

    /**
     * Task 14b item 1 — แถวที่ pointer ตรงกับแถวนี้ (`active`) แต่ `audience` ยังเป็น 'all' คือ
     * "ประกาศว่าทุกคน แต่ยัง live อยู่กับสมาชิกจริง" ซึ่งไม่เคยมีเทสต์ไหนเรนเดอร์มาก่อน — สามเทสต์
     * ด้านบนทั้งหมดจับคู่ `allAudienceMenu` กับ `noOneActive` (pointer ไม่ตรง) เท่านั้น เทสต์นี้
     * ต้องเปิดทาง "ปิด" ไว้: สวิตช์ต้องกดได้ (ไม่ใช่ปิดตายทั้งสองทิศทาง) และห้ามขึ้นข้อความ
     * "เปิดให้สมาชิกไม่ได้" เพราะผู้ใช้กำลังจะปิด ไม่ใช่เปิด — ข้อความเดิมจะเป็นคำแนะนำผิดทิศทาง
     */
    it('แต่ pointer ของแถวนี้ตรงกับ channel (active) — สวิตช์กดได้เพื่อปิด และไม่ขึ้นเหตุผลเดิม', async () => {
      setup({
        menu: allAudienceMenu,
        audience: { defaultRichMenuId: null, memberRichMenuId: 'line-rm-1', memberCount: 3 },
        t: realT('en'),
      })
      await waitFor(() => expect(screen.getByRole('switch')).toBeChecked())
      expect(screen.getByRole('switch')).not.toBeDisabled()
      expect(screen.queryByText(MESSAGES.en['audience.notMembersMenu']!)).not.toBeInTheDocument()
    })
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

  /**
   * Task 21 item 3 — โหลด audience ไม่สำเร็จตอน mount (ไม่มีใครกดอะไรเลย) ต้องขึ้นข้อความคนละคีย์
   * กับตอนที่ผู้ใช้กด activate/deactivate แล้วล้ม — ก่อนหน้านี้ทั้งสองกรณีใช้ 'audience.actionFailed'
   * ("ทำรายการไม่สำเร็จ") ตัวเดียวกันหมด ทำให้แถวที่ยังไม่ได้ถูกแตะเลยขึ้น alert แดงราวกับผู้ใช้
   * เพิ่งกดอะไรพังไป
   */
  it('โหลด audience ไม่สำเร็จตอน mount ต้องขึ้นข้อความว่าโหลดไม่สำเร็จ ไม่ใช่ "ทำรายการไม่สำเร็จ" (item 3)', async () => {
    const get = vi.fn(async () => { throw new Error('boom') })
    const base = createStubPort({ t: (k: string) => k })
    const port = { ...base, http: { ...base.http, get, post: vi.fn(async () => undefined) } as typeof base.http }
    render(<PortProvider value={port}><AudienceToggle menu={publishedMenu} /></PortProvider>)
    await waitFor(() => expect(screen.getByText('audience.loadFailed')).toBeInTheDocument())
    expect(screen.queryByText('audience.actionFailed')).not.toBeInTheDocument()
  })

  /**
   * Task 21 item 4 — เดิมทั้งปุ่มยืนยันและยกเลิกในกล่องยืนยันไม่มี `disabled={busy}` เลย: กดยืนยัน
   * สามครั้งยิง POST activate สามครั้งจริง เทสต์นี้ค้าง promise ของ post ไว้กลางอากาศ (ยังไม่ resolve)
   * เพื่อจับสถานะ "กำลังยิงคำขออยู่" แล้วพิสูจน์ทั้งสองอย่าง: ปุ่มถูกปิด และคลิกซ้ำไม่ยิง POST ซ้ำ
   */
  it('ปุ่มยืนยันและยกเลิกถูกปิดระหว่างคำขอค้างอยู่ กันกดยืนยันซ้ำ (item 4)', async () => {
    // เก็บ resolver ไว้ใน object แทน `let` ตรง ๆ — `let` ที่ถูกเขียนทับเฉพาะข้างใน closure ของ
    // Promise executor ทำให้ TS narrow ตอนอ่านค่านอก closure ผิดไปเป็น `never` (control flow
    // analysis ไม่ตามเข้าไปในนั้น) property บน object ไม่โดนปัญหานี้
    const deferred: { resolve: (() => void) | undefined } = { resolve: undefined }
    const post = vi.fn(() => new Promise<undefined>((resolve) => { deferred.resolve = () => resolve(undefined) }))
    setup({ audience: { ...noOneActive, memberCount: 5 } as ChannelAudience, post })
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('confirm-activate'))

    await waitFor(() => expect(screen.getByTestId('confirm-activate')).toBeDisabled())
    expect(screen.getByText('common.cancel')).toBeDisabled()

    // คลิกซ้ำระหว่างที่ปุ่มถูกปิดอยู่ — ต้องไม่ยิง POST เพิ่ม (การเช็ค busy ในตัว handler เอง
    // ไม่พึ่ง attribute disabled ของ primitive อย่างเดียว เหมือนแพทเทิร์นของสวิตช์ด้านบนในไฟล์นี้)
    fireEvent.click(screen.getByTestId('confirm-activate'))
    expect(post).toHaveBeenCalledTimes(1)

    deferred.resolve?.()
    await waitFor(() => expect(screen.getByTestId('audience-result')).toBeInTheDocument())
  })

  /**
   * Task 21 item 5 — เมนู draft (ยังไม่ publish เลย) เดิมสวิตช์ถูกปิดโดยไม่มีข้อความอธิบายอะไรเลย
   * เพราะเงื่อนไขเดิม (`isMembersMenu || active`) เป็นจริงสำหรับ draftMenu ที่สืบทอด audience:
   * 'members' มา จึงไม่เข้าเงื่อนไขที่โชว์ข้อความ — ต้องมีคำอธิบายคนละคีย์จาก audience.notMembersMenu
   * (ห้ามใช้ตัวเดียวกัน เพราะ draftMenu.audience คือ 'members' อยู่แล้ว ไม่ใช่ 'all')
   */
  it('เมนูที่ยังไม่ publish บอกเหตุผลว่ายังไม่ได้เผยแพร่ ไม่ใช่ปิดเงียบ ๆ (item 5)', async () => {
    setup({ menu: draftMenu, t: realT('en') })
    await waitFor(() => expect(screen.getByRole('switch')).toBeDisabled())
    expect(screen.getByText(MESSAGES.en['audience.notPublishedMenu']!)).toBeInTheDocument()
    expect(screen.queryByText(MESSAGES.en['audience.notMembersMenu']!)).not.toBeInTheDocument()
  })
})
