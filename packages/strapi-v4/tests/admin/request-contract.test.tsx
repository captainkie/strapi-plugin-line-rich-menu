// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelSettings, ENDPOINTS, PortProvider, createStubPort } from '@fosivo/line-rich-menu-ui'
import { EditorPage } from '../../src/admin/pages/Editor.js'
import { channelCreateSchema, menuInputSchema } from '../../src/server/validation.js'

/**
 * ด่านนี้เกิดจากความล้มเหลวจริง ไม่ใช่จากการเดา: ฟอร์ม "เพิ่ม channel" ส่งคีย์ `accessToken`
 * ขณะที่ `channelCreateSchema` ต้องการ `channelAccessToken` และเป็น `.strict()` — คำขอจึงตกสองต่อ
 * (คีย์ที่ต้องมีหายไป บวกคีย์ที่ไม่รู้จักเกินมา) แปลว่าปลั๊กอินสร้าง channel ไม่ได้เลยแม้แต่ครั้งเดียว
 * และไม่มีอะไรในปลั๊กอินทำงานได้ถ้าไม่มี channel
 *
 * ทั้งสองฝั่งเขียวมาตลอดเพราะไม่มีเทสต์ไหนเอา **body จริงที่ฟอร์มส่ง** ไปเจอ **schema จริงที่
 * เซิร์ฟเวอร์ใช้** เลยสักตัว: ฝั่ง UI ยิงใส่ stub ที่รับทุกอย่าง ส่วนฝั่งเซิร์ฟเวอร์พิมพ์ body
 * ที่ถูกต้องขึ้นมาเองด้วยมือ ไฟล์นี้คือจุดเดียวที่สองครึ่งนั้นมาเจอกัน — ไม่รับ body ที่พิมพ์เอง
 * แต่ขับฟอร์มจริงแล้วดัก body ที่มันส่งออกไปจริง ๆ
 *
 * ต้องอยู่ในแพ็กเกจนี้ (ไม่ใช่ packages/ui) เพราะ schema เป็นของ adapter — ui ไม่รู้จักและไม่ควรรู้จัก
 */

afterEach(cleanup)

describe('body ที่ฟอร์ม channel ส่ง ต้องผ่าน channelCreateSchema ของเซิร์ฟเวอร์จริง', () => {
  it('กรอกครบทุกช่องแล้วกดบันทึก — body ที่ออกไปผ่าน schema ได้โดยไม่มี issue', async () => {
    const post = vi.fn(async () => ({}))
    const port = createStubPort({
      t: (key: string) => key,
      http: { ...createStubPort().http, get: async () => [] as never, post: post as never },
    })
    render(<PortProvider value={port}><ChannelSettings /></PortProvider>)

    await waitFor(() => expect(screen.getByTestId('add-channel')).not.toBeNull())
    fireEvent.click(screen.getByTestId('add-channel'))
    fireEvent.change(screen.getByLabelText('channel.name'), { target: { value: 'ร้านใหม่' } })
    fireEvent.change(screen.getByLabelText('channel.channelId'), { target: { value: '1660000000' } })
    fireEvent.change(screen.getByLabelText('channel.channelSecret'), { target: { value: 'channel-secret' } })
    fireEvent.change(screen.getByLabelText('channel.accessToken'), { target: { value: 'channel-access-token' } })
    fireEvent.click(screen.getByTestId('save-channel'))

    await waitFor(() => expect(post).toHaveBeenCalledWith(ENDPOINTS.channels, expect.anything()))
    const [url, body] = post.mock.calls[0] as unknown as [string, unknown]
    expect(url).toBe(ENDPOINTS.channels)

    const parsed = channelCreateSchema.safeParse(body)
    // พิมพ์ issue ออกมาทั้งชุดเวลาแดง — "expected true, got false" ไม่บอกว่าคีย์ไหนผิด
    expect(parsed.success ? [] : parsed.error.issues).toEqual([])
    expect(parsed.success).toBe(true)
  })
})

describe('body ที่หน้า editor ส่ง ต้องผ่าน menuInputSchema ของเซิร์ฟเวอร์จริง', () => {
  it('เลือก template กรอก action แล้วกดบันทึกร่าง — body ที่ออกไปผ่าน schema ได้โดยไม่มี issue', async () => {
    const post = vi.fn(async () => ({ id: '1' }))
    const port = createStubPort({
      t: (key: string) => key,
      http: { ...createStubPort().http, get: async () => [] as never, post: post as never },
    })
    render(
      <MemoryRouter initialEntries={['/plugins/line-rich-menu/menus/new?channel=10']}>
        <Route path="/plugins/line-rich-menu/menus/new">
          <PortProvider value={port}><EditorPage /></PortProvider>
        </Route>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('editor.title'), { target: { value: 'เมนูใหม่' } })
    // 207 มีช่องเดียว — น้อยที่สุดที่ยังทำให้ `areas` ผ่าน min(1) ได้ โดยไม่ต้องกรอกซ้ำหลายช่อง
    fireEvent.click(screen.getByTestId('open-template-picker'))
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_207'))
    fireEvent.click(screen.getByTestId('template-apply'))
    fireEvent.click(screen.getByTestId('area-header-0'))
    fireEvent.change(screen.getByLabelText('action.field.text'), { target: { value: 'สวัสดี' } })

    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)

    await waitFor(() => expect(post).toHaveBeenCalledWith(ENDPOINTS.menus, expect.anything()))
    const [url, body] = post.mock.calls[0] as unknown as [string, unknown]
    expect(url).toBe(ENDPOINTS.menus)

    const parsed = menuInputSchema.safeParse(body)
    expect(parsed.success ? [] : parsed.error.issues).toEqual([])
    expect(parsed.success).toBe(true)
  })

  /**
   * Task 20 item 1 (ui-core H2) repro ตรง ๆ: เลือก template แล้วกด "Save draft" ทันทีโดยไม่กรอก
   * action เลย — ก่อนแก้ `menuInputSchema` (เข้ม, `min(1)` ทุก action field) จุดนี้ปฏิเสธ body จริง
   * ที่ฟอร์มส่งออกไป ทำให้ปุ่มที่สองใช้บันทึกงานค้างไม่ได้เลยสักครั้ง แม้ฟอร์มฝั่ง UI จะยอมให้กดผ่าน
   * ก็ตาม (ปุ่ม Save draft ตั้งใจข้าม validateRichMenu — ดู `action-form.ts`) ทดสอบทั้งคู่ (ฝั่งฟอร์ม
   * ไม่บล็อกปุ่ม + ฝั่ง schema จริงไม่ปฏิเสธ body จริง) ไม่ใช่แค่ยิง object ที่พิมพ์เองใส่ schema
   */
  it('เลือก template แล้วกด Save draft ทันทีโดยไม่กรอก action เลย — body ที่ออกไปยังต้องผ่าน schema', async () => {
    const post = vi.fn(async () => ({ id: '1' }))
    const port = createStubPort({
      t: (key: string) => key,
      http: { ...createStubPort().http, get: async () => [] as never, post: post as never },
    })
    render(
      <MemoryRouter initialEntries={['/plugins/line-rich-menu/menus/new?channel=10']}>
        <Route path="/plugins/line-rich-menu/menus/new">
          <PortProvider value={port}><EditorPage /></PortProvider>
        </Route>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('editor.title'), { target: { value: 'เมนูใหม่' } })
    fireEvent.click(screen.getByTestId('open-template-picker'))
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_207'))
    fireEvent.click(screen.getByTestId('template-apply'))
    // ไม่แตะ action เลย — เจตนาให้ text ของ area 0 ยังเป็น '' ตามค่าเริ่มต้นของ emptyActionForm()

    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)

    await waitFor(() => expect(post).toHaveBeenCalledWith(ENDPOINTS.menus, expect.anything()))
    const [, body] = post.mock.calls[0] as unknown as [string, unknown]

    const parsed = menuInputSchema.safeParse(body)
    expect(parsed.success ? [] : parsed.error.issues).toEqual([])
    expect(parsed.success).toBe(true)
  })
})
