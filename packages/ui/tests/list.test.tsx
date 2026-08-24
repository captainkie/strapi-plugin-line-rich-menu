import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ENDPOINTS } from '../src/api.js'
import { MESSAGES } from '../src/i18n/index.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { RichMenuList } from '../src/pages/RichMenuList.js'

// รูปทรงเดียวกับที่ `GET /menus` คืนจริงหลังงานนี้ — คอลัมน์ Image/Action/Display period
// ของหน้ารายการอ่านจาก `size`/`areas`/`imageUrl`/`startAt`/`endAt` ไม่ใช่จากการยิงรายตัว
const menus = [
  {
    id: '1', title: 'เมนูหลัก', status: 'published' as const, channelId: 'c1', aliasId: 'main',
    updatedAt: '2026-08-20', size: 'large' as const, imageUrl: '/uploads/main.png',
    startAt: '2026-08-22T00:00:00.000Z', endAt: '2026-08-31T23:59:00.000Z',
    audience: 'all' as const, lineRichMenuId: 'line-rm-1',
    areas: [
      { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: 'message' as const, text: 'สวัสดี' } },
      { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: 'uri' as const, uri: 'https://example.com' } },
    ],
  },
  {
    id: '2', title: 'ร่าง', status: 'draft' as const, channelId: 'c1', aliasId: null,
    updatedAt: '2026-08-19', size: 'compact' as const, imageUrl: null,
    startAt: null, endAt: null, audience: 'members' as const, lineRichMenuId: null,
    areas: [],
  },
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

  /**
   * สเปกงานนี้ #1 — หน้ารายการเดิมเป็นแค่ ชื่อ/สถานะ/ปุ่มแก้ไข เรียงกันลงมา ซึ่งบอกไม่ได้เลยว่า
   * เมนูแต่ละอันหน้าตายังไงหรือทำอะไรได้ ต้องเป็นตารางแบบ LINE OA Manager: รูป ชื่อ action
   * ช่วงเวลา สถานะ
   */
  it('เป็นตารางที่มีหัวคอลัมน์ครบ ไม่ใช่รายการชื่อเรียงลงมา', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('menu-table')).toBeInTheDocument())
    const headers = screen.getAllByRole('columnheader').map((el) => el.textContent)
    expect(headers).toContain('list.column.image')
    expect(headers).toContain('list.column.title')
    expect(headers).toContain('list.column.action')
    expect(headers).toContain('editor.displayPeriod')
    expect(headers).toContain('list.column.status')
  })

  // Task 11 — สเปก "List table gains an Audience column"
  it('ตารางมีคอลัมน์ audience', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('menu-table')).toBeInTheDocument())
    expect(screen.getAllByRole('columnheader').map((e) => e.textContent)).toContain('list.column.audience')
  })

  it('คอลัมน์รูปวาดภาพย่อจากผังจริงของเมนู และใช้รูปที่อัปโหลดไว้เป็นพื้นหลัง', async () => {
    setup()
    await waitFor(() => expect(screen.getAllByTestId('menu-thumbnail')).toHaveLength(2))
    const [withImage, withoutImage] = screen.getAllByTestId('menu-thumbnail')
    expect(withImage!.dataset['hasImage']).toBe('true')
    expect(withImage!.style.backgroundImage).toContain('/uploads/main.png')
    // ผังช่องต้องถูกวาดจริง ไม่ใช่กล่องเปล่า — สองช่องของเมนูแรกคือสอง <rect>
    expect(withImage!.querySelectorAll('rect')).toHaveLength(2)
    // เมนูที่ยังไม่มีรูปยังต้องมีภาพย่อ (ผังอย่างเดียว) ไม่ใช่ช่องว่าง
    expect(withoutImage!.dataset['hasImage']).toBe('false')
  })

  it('คอลัมน์ action บอกทั้งป้ายช่อง ชนิด และค่าของมัน', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('menu-row-1')).toBeInTheDocument())
    const row = screen.getByTestId('menu-row-1')
    expect(row.textContent).toContain('A : action.type.message - สวัสดี')
    expect(row.textContent).toContain('B : action.type.uri - https://example.com')
  })

  it('คอลัมน์ช่วงเวลาแสดงช่วงจริง และบอกตรง ๆ เมื่อไม่ได้ตั้งเวลา', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('menu-row-1')).toBeInTheDocument())
    expect(screen.getByTestId('menu-row-1').textContent).toContain('2026/08/22')
    expect(screen.getByTestId('menu-row-2').textContent).toContain('list.period.none')
  })

  // สเปกงานนี้ #3 — กดจากหน้ารายการเพื่อดูเมนูที่สร้างไว้แล้ว โดยไม่ต้องเข้าหน้าแก้ไข
  it('กดชื่อเมนูแล้วเปิดพรีวิว พร้อมรายละเอียดของเมนูนั้น', async () => {
    // mock ตอบตาม url เหมือนของจริง — modal ยิง `GET /menus/:id` ของมันเอง ไม่ได้ใช้แถวในรายการ
    setup(vi.fn(async (url: string) => (
      url === `${ENDPOINTS.menu('1')}`
        ? { ...menus[0], name: 'เมนูหลัก', chatBarText: '', chatBarMode: 'default', selected: true }
        : menus
    )) as never)
    await waitFor(() => expect(screen.getByTestId('preview-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('preview-1'))
    await waitFor(() => expect(screen.getByTestId('preview-action-0')).toBeInTheDocument())
    expect(screen.getByTestId('preview-action-0').textContent).toBe('A : action.type.message - สวัสดี')
    expect(screen.getByTestId('preview-status').textContent).toBe('status.published')
  })

  // ขนาดที่แคตตาล็อกไม่รู้จักต้องกลายเป็นข้อความผิดพลาดในกรอบพรีวิว ไม่ใช่หน้าแอดมินขาวทั้งหน้า
  it('ตอบกลับที่ผิดรูปทำให้พรีวิวขึ้น error ไม่ใช่ทำให้ทั้งหน้าพัง', async () => {
    setup(vi.fn(async (url: string) => (
      url === `${ENDPOINTS.menu('1')}` ? { ...menus[0], size: 'gigantic' } : menus
    )) as never)
    await waitFor(() => expect(screen.getByTestId('preview-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('preview-1'))
    await waitFor(() => expect(screen.getByText('preview.loadFailed')).toBeInTheDocument())
    // รายการเบื้องหลังยังอยู่ครบ ไม่ได้ถูกถอดไปพร้อมกัน
    expect(screen.getByTestId('menu-table')).toBeInTheDocument()
  })

  it('กรองตาม channel ที่เลือก', async () => {
    const { get } = setup()
    await waitFor(() => expect(get).toHaveBeenCalledWith(`${ENDPOINTS.menus}?channel=c1`))
  })

  it('บอกว่ายังไม่มีเมนู แทนที่จะแสดงตารางเปล่า', async () => {
    setup(vi.fn(async () => []))
    await waitFor(() => expect(screen.getByText('list.empty')).toBeInTheDocument())
  })

  // สเปกงานนี้ #2 — empty-state คือจุดที่โลโก้ LINE จริงช่วยได้จริง ต้องแดงถ้ามีใครลบ
  // <LineMark/> ออกจากที่นี่ทิ้ง (เช่นตอน refactor empty-state กลับไปเป็น ui.Typography เปล่า ๆ)
  // Task 22 item 1 — LineMark วาด <img> จาก data URI ของโลโก้จริงแล้ว ไม่ใช่ <svg> ที่วาดเองอีกต่อไป
  it('empty-state มีโลโก้ LINE อยู่ด้วย ไม่ใช่แค่ข้อความ', async () => {
    setup(vi.fn(async () => []))
    await waitFor(() => expect(screen.getByText('list.empty')).toBeInTheDocument())
    expect(document.querySelector('img')).toBeInTheDocument()
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

/** t() ที่ lookup คำแปลจริงจาก MESSAGES — identity `(k) => k` พิสูจน์ได้แค่ว่าโค้ดเรียกคีย์ถูก
 * ไม่พิสูจน์ว่าคำแปลจริงพูดถึงโควตา 3 ครั้ง/ชม. จริงไหม (เหมือน realT ใน audience-toggle.test.tsx) */
function realT(locale: 'en' | 'th') {
  return (key: string, values?: Record<string, string | number>): string => {
    const template = MESSAGES[locale][key] ?? key
    return values === undefined
      ? template
      : Object.entries(values).reduce((s, [name, value]) => s.replaceAll(`{${name}}`, String(value)), template)
  }
}

function setupUnlinkAll({
  post = vi.fn(async () => undefined),
  t = (k: string) => k,
}: { post?: ReturnType<typeof vi.fn>; t?: (key: string, values?: Record<string, string | number>) => string } = {}) {
  const get = vi.fn(async () => menus)
  const base = createStubPort({ t })
  const port = { ...base, http: { ...base.http, get, post } as typeof base.http }
  render(<PortProvider value={port}><RichMenuList channelId="c1" /></PortProvider>)
  return { get, post }
}

/**
 * Task 12 — ปุ่ม "เลิกผูกทุกคน" ต่อแถว, กล่องยืนยันที่ต้องบอกโควตา 3 ครั้ง/ชม. เป็นคำพูด, และ
 * POST ไปที่ /menus/:id/audience/unlink-all ของแถวนั้นเท่านั้นหลังยืนยัน
 */
describe('RichMenuList — unlink-all (Task 12)', () => {
  it('เมนูที่ยัง draft (ไม่มี lineRichMenuId) ปิดปุ่มเลิกผูกทุกคนไว้', async () => {
    setupUnlinkAll()
    await waitFor(() => expect(screen.getByTestId('unlink-all-2')).toBeInTheDocument())
    expect(screen.getByTestId('unlink-all-2')).toBeDisabled()
    expect(screen.getByTestId('unlink-all-1')).not.toBeDisabled()
  })

  it('กดปุ่มเลิกผูกทุกคนเปิดกล่องยืนยันก่อน ไม่ยิง POST ทันที', async () => {
    const { post } = setupUnlinkAll()
    await waitFor(() => expect(screen.getByTestId('unlink-all-1')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('unlink-all-1'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })

  /**
   * หัวใจของ non-negotiable ของ task นี้ — โควตาจริงคือ 3 ครั้ง/ชม./account และคำขอที่สี่ล้มโดย
   * LINE ไม่บอกเหตุผล ต้องยืนยันด้วยคำแปลจริงทั้งสองภาษา ไม่ใช่แค่เช็คว่าโค้ดเรียกคีย์ถูก (ดู
   * คอมเมนต์เดียวกันใน audience-toggle.test.tsx สำหรับเหตุผลที่ identity t() พิสูจน์เรื่องนี้ไม่ได้)
   */
  it('เนื้อหากล่องยืนยันบอกโควตา 3 ครั้งต่อชั่วโมงจริง ทั้งไทยและอังกฤษ', async () => {
    for (const locale of ['en', 'th'] as const) {
      const { unmount } = render(
        <PortProvider value={(() => {
          const base = createStubPort({ t: realT(locale) })
          return {
            ...base,
            http: { ...base.http, get: vi.fn(async () => menus), post: vi.fn(async () => undefined) } as typeof base.http,
          }
        })()}
        >
          <RichMenuList channelId="c1" />
        </PortProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('unlink-all-1')).not.toBeDisabled())
      fireEvent.click(screen.getByTestId('unlink-all-1'))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
      const body = screen.getByRole('dialog').textContent ?? ''
      expect(body).toContain('3')
      expect(body).toMatch(locale === 'th' ? /ชั่วโมง/ : /hour/i)
      unmount()
    }
  })

  it('กดยกเลิกในกล่องปิดกล่องโดยไม่ยิง POST', async () => {
    const { post } = setupUnlinkAll()
    await waitFor(() => expect(screen.getByTestId('unlink-all-1')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('unlink-all-1'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByText('common.cancel'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('กดยืนยันแล้วยิง POST ไปที่ unlink-all ของแถวนั้น แล้วโชว์ผลว่าส่งคำสั่งแล้ว', async () => {
    const { post } = setupUnlinkAll()
    await waitFor(() => expect(screen.getByTestId('unlink-all-1')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('unlink-all-1'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('confirm-unlink-all'))

    await waitFor(() => expect(post).toHaveBeenCalledWith(ENDPOINTS.menuAudienceUnlinkAll('1')))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByTestId('unlink-all-result-1')).toBeInTheDocument()
  })

  it('ยืนยันล้มเหลว ขึ้น error ในกล่อง ไม่เงียบ และไม่โชว์ผลว่าส่งสำเร็จ', async () => {
    const post = vi.fn(async () => { throw new Error('boom') })
    setupUnlinkAll({ post })
    await waitFor(() => expect(screen.getByTestId('unlink-all-1')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('unlink-all-1'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('confirm-unlink-all'))

    await waitFor(() => expect(screen.getByText('audience.actionFailed')).toBeInTheDocument())
    expect(screen.queryByTestId('unlink-all-result-1')).not.toBeInTheDocument()
  })
})

/**
 * Task 21 item 1 + 2 — regression ต้องขับผ่าน `RichMenuList` จริง ไม่ใช่ `<AudienceToggle>` เดี่ยว ๆ
 * (`audience-toggle.test.tsx` ยังเขียวมาตลอดแม้บั๊กนี้ยังอยู่ เพราะมัน render component โดยไม่มี
 * parent ที่ทำลาย state) — บั๊กจริงคือ: `onChanged` ของ AudienceToggle บวก token ที่เป็นส่วนหนึ่งของ
 * `key` ของตัวมันเอง ทำให้ React unmount+remount ตัวมันเองในคอมมิตเดียวกับที่มันเพิ่งตั้ง `sentAt` —
 * ข้อความ "sent at HH:mm" จึงไม่เคยขึ้นจอเลยสักครั้ง ไม่ใช่แค่ขึ้นแล้วหายเร็ว
 */
describe('RichMenuList — audience toggle ผ่านตารางจริง (Task 21)', () => {
  const membersMenu = {
    id: '9', title: 'เมนูสมาชิก', status: 'published' as const, channelId: 'c1', aliasId: null,
    updatedAt: '2026-08-20', size: 'large' as const, imageUrl: null, startAt: null, endAt: null,
    audience: 'members' as const, lineRichMenuId: 'line-rm-9', areas: [],
  }

  it('activate ผ่านตารางจริง — ข้อความ "ส่งคำสั่งแล้วเมื่อ" ต้องขึ้นจริง ไม่ถูก remount ทำลายทิ้งในคอมมิตเดียวกัน', async () => {
    const get = vi.fn(async (url: string) => (
      url.startsWith(ENDPOINTS.channelAudience('c1'))
        ? { defaultRichMenuId: null, memberRichMenuId: null, memberCount: 3 }
        : [membersMenu]
    ))
    const post = vi.fn(async () => undefined)
    const base = createStubPort({ t: (k) => k })
    const port = { ...base, http: { ...base.http, get, post } as typeof base.http }
    render(<PortProvider value={port}><RichMenuList channelId="c1" /></PortProvider>)

    await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled())
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('confirm-activate'))

    await waitFor(() => expect(post).toHaveBeenCalledWith(ENDPOINTS.menuAudienceActivate('9')))
    await waitFor(() => expect(screen.getByTestId('audience-result')).toBeInTheDocument())
  })

  // item 2 — ปิดใช้งานไม่เคยรายงานอะไรเลยมาก่อน แม้จะ async/unconfirmable เหมือน activate ทุกประการ
  it('deactivate ผ่านตารางจริงก็ต้องขึ้น "ส่งคำสั่งแล้วเมื่อ" เหมือนกัน (item 2)', async () => {
    const get = vi.fn(async (url: string) => (
      url.startsWith(ENDPOINTS.channelAudience('c1'))
        ? { defaultRichMenuId: null, memberRichMenuId: 'line-rm-9', memberCount: 3 }
        : [membersMenu]
    ))
    const post = vi.fn(async () => undefined)
    const base = createStubPort({ t: (k) => k })
    const port = { ...base, http: { ...base.http, get, post } as typeof base.http }
    render(<PortProvider value={port}><RichMenuList channelId="c1" /></PortProvider>)

    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked())
    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => expect(post).toHaveBeenCalledWith(ENDPOINTS.menuAudienceDeactivate('9')))
    await waitFor(() => expect(screen.getByTestId('audience-result')).toBeInTheDocument())
  })

  /**
   * ยืนยันว่าการลด fan-out (Task 21 item 3 — ไม่ remount แถวที่กดเอง) ไม่ได้ทำลาย correctness
   * เดิมที่การ remount มีไว้เพื่อรักษา: แถวอื่นที่ pointer ถูกแย่งไปโดยอ้อม (activate แถว B ปิดแถว A
   * ที่เคย active อยู่ไปด้วยในตัว เพราะ channel.memberRichMenuId ชี้ได้ทีละอัน) ต้องยัง remount แล้ว
   * อ่านสถานะใหม่ ไม่ใช่ค้างโชว์ "เปิดอยู่" ผิด ๆ
   */
  it('แถวอื่นที่ pointer ถูกแย่งไปโดยอ้อม ยัง remount แล้วอ่านสถานะใหม่เหมือนเดิม (ลด fan-out ไม่ทำลาย correctness)', async () => {
    const rowA = { ...membersMenu, id: 'a', lineRichMenuId: 'line-rm-a' }
    const rowB = { ...membersMenu, id: 'b', lineRichMenuId: 'line-rm-b' }
    let memberRichMenuId: string | null = 'line-rm-a'
    const get = vi.fn(async (url: string) => (
      url.startsWith(ENDPOINTS.channelAudience('c1'))
        ? { defaultRichMenuId: null, memberRichMenuId, memberCount: 3 }
        : [rowA, rowB]
    ))
    const post = vi.fn(async (url: string) => {
      if (url === ENDPOINTS.menuAudienceActivate('b')) memberRichMenuId = 'line-rm-b'
    })
    const base = createStubPort({ t: (k) => k })
    const port = { ...base, http: { ...base.http, get, post } as typeof base.http }
    render(<PortProvider value={port}><RichMenuList channelId="c1" /></PortProvider>)

    await waitFor(() => expect(screen.getAllByRole('switch')[0]).toBeChecked())
    expect(screen.getAllByRole('switch')[1]).not.toBeChecked()

    fireEvent.click(screen.getAllByRole('switch')[1]!)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('confirm-activate'))

    await waitFor(() => expect(screen.getAllByRole('switch')[1]).toBeChecked())
    await waitFor(() => expect(screen.getAllByRole('switch')[0]).not.toBeChecked())
  })
})
