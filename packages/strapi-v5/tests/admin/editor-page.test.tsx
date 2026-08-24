// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { ENDPOINTS, PortProvider, createStubPort } from '@fosivo/line-rich-menu-ui'
import { EditorPage } from '../../admin/src/pages/Editor.js'

/**
 * ไม่มี `globals: true` ใน vitest.config.ts ของแพ็กเกจนี้ auto-cleanup ของ testing-library จึงไม่
 * ถูกติดตั้งให้เอง — ต้องเรียกเองเหมือนที่ `tests/admin/request-contract.test.tsx` ของ strapi-v4 ทำ
 * ไม่งั้น render ของเทสต์ก่อนหน้าค้างอยู่ใน document แล้ว `getBy*` เจอสองตัวพร้อมกัน
 */
afterEach(cleanup)

/**
 * `menuDetail` + `setup` อยู่ระดับโมดูลเพราะมีสอง describe ใช้ร่วมกัน (Task 20 item 8 follow-up
 * ด้านล่าง กับ Task 14b item 1) — เป็นสถานะเมนูเดียวกันเป๊ะที่ทั้งคู่ต้องการ: เมนูเดิมที่มีรูป
 * มี template และเป็นเมนูของสมาชิก
 */
const menuDetail = {
  id: 'menu-1',
  name: 'เมนูเดิม',
  channelId: 'ch0000000000000000000001',
  size: 'large' as const,
  chatBarText: 'เมนู',
  chatBarMode: 'default' as const,
  selected: true,
  templateKey: 'RICH_MENU_TEMPLATE_207',
  // Task 14b item 1 — `GET /menus/:id` คืนคอลัมน์นี้มาตั้งแต่ Task 11 (`toDetail` คืนทั้งแถว)
  // แต่ไม่มีใครอ่านจนถึงตอนนี้ ตั้งเป็น 'members' เพราะนั่นคือค่าที่การหล่นหายจะเป็นอันตรายจริง
  //
  // Task 17 — ชนิดเป็น union ไม่ใช่ literal `as const` เพราะ describe ของ publish ด้านล่างต้อง
  // โหลดเมนูที่เป็น 'all' **มาจากเซิร์ฟเวอร์** ด้วย ไม่ใช่ไปถึง 'all' ด้วยการกดสลับเท่านั้น
  audience: 'members' as 'all' | 'members',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message' as const, text: 'hi' } }],
  imageFileId: 42,
  aliasId: null,
  startAt: null,
  endAt: null,
}

function setup(detail: typeof menuDetail = menuDetail) {
  const put = vi.fn(async () => ({ id: 'menu-1' }))
  const get = vi.fn(async (url: string) => (url === ENDPOINTS.menu('menu-1') ? detail : []))
  // Task 17 — ปุ่ม "บันทึกและเผยแพร่" ยิง `POST /menus/:id/publish` ต่อจาก PUT ทันที ก่อนหน้านี้
  // ไม่มีเทสต์ไหนในไฟล์นี้กด publish เลย `post` จึงไม่เคยถูกดัก — ซึ่งคือเหตุผลที่ `setAsDefault: true`
  // ตายตัวอยู่รอดมาได้ทุกรอบรีวิว
  const post = vi.fn(async (url: string) => (
    url === ENDPOINTS.upload ? [{ id: 900, url: '/uploads/menu.png' }] : {}
  ))
  const port = createStubPort({
    t: (key: string) => key,
    http: { ...createStubPort().http, get: get as never, put: put as never, post: post as never },
  })
  render(
    <MemoryRouter initialEntries={['/plugins/line-rich-menu/rich-menus/menu-1']}>
      <Routes>
        <Route
          path="/plugins/line-rich-menu/rich-menus/:id"
          element={<PortProvider value={port}><EditorPage /></PortProvider>}
        />
        {/* บันทึกสำเร็จแล้ว navigate(BASE) กลับไปที่ลิสต์ — ใส่ไว้กันแค่ "No routes matched"
            ขึ้นรก console เฉย ๆ ไม่มีอะไรให้ทดสอบที่หน้านี้ */}
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  )
  return { put, post }
}

/**
 * Task 20 item 8 follow-up (found during item 8's audit, fixed per team lead review) —
 * `EditorPage.save()`'s `canvasUnchanged` used to check `saved.templateKey === next.templateKey`
 * alongside `saved.size === next.sizeName`. `templateKey` is the same field
 * `moveBounds`/`addArea`/`removeArea` (RichMenuEditor.tsx) clear to `null` the instant a user
 * touches custom layout, while `sizeName` (the actual canvas) doesn't change — so editing an
 * *existing* menu that already has an image, nudging one area by hand, and saving without
 * touching the image field at all used to drop the image silently: no warning, no confirmation,
 * because the canvas size genuinely never changed. This is the fifth defect on this branch
 * traced to reading `templateKey` as "canvas identity" when the real answer is `size`/`bounds`
 * — the same root cause as item 8's `applyTemplate`/`TemplatePicker` bug, one layer up.
 *
 * These are written as the user story, not as a property test on `canvasUnchanged` in isolation —
 * they drive the real `EditorPage` in edit mode (loaded via a mocked `GET /menus/:id`) through the
 * real `RichMenuEditor`, exactly the path the bug lived on. v5 never had a test that drove
 * `EditorPage` in edit mode at all before this file.
 */
describe('EditorPage (แก้เมนูเดิม) — canvasUnchanged ต้องไม่อ่านจาก templateKey (Task 20 item 8 follow-up)', () => {
  it('ปรับผังเองด้วยมือ (ไม่แตะรูป) แล้วบันทึกร่าง — รูปเดิมต้องยังอยู่ ไม่ใช่หายไปเงียบ ๆ', async () => {
    const { put } = setup()
    await waitFor(() => expect(screen.getByLabelText('editor.title')).toHaveValue('เมนูเดิม'))

    fireEvent.click(screen.getByLabelText('editor.layout.custom'))
    const area = within(screen.getByTestId('preview-menu')).getByRole('button', { name: /^A$/ })
    fireEvent.pointerDown(area, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(area, { clientX: 10, clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })

    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)

    await waitFor(() => expect(put).toHaveBeenCalled())
    const [, body] = put.mock.calls[0] as unknown as [string, { imageFileId: number | null; templateKey: string | null }]
    // sanity — ยืนยันว่าเทสต์นี้กำลังพิสูจน์เคสที่ templateKey ถูกเคลียร์จริงจากการปรับผังเอง
    // ไม่ใช่บังเอิญผ่านเพราะยังไม่ได้แตะผังเลย
    expect(body.templateKey).toBeNull()
    expect(body.imageFileId).toBe(42)
  })

  it('เปลี่ยนไป template ขนาดต่างออกไปแล้วบันทึกร่าง — รูปเดิมต้องถูกทิ้งจริง เพราะไม่พอดีกับผืนผ้าใบใหม่', async () => {
    const { put } = setup()
    await waitFor(() => expect(screen.getByLabelText('editor.title')).toHaveValue('เมนูเดิม'))

    fireEvent.click(screen.getByTestId('open-template-picker'))
    // 101 เป็น compact — คนละขนาดกับ 207 (large) ของเมนูเดิม
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_101'))
    fireEvent.click(screen.getByTestId('template-apply'))
    // action ของช่องเดิมถูกตั้งไว้แล้ว (hasConfiguredActions=true) — เปลี่ยน template ต้องยืนยันก่อนเสมอ
    fireEvent.click(screen.getByTestId('template-confirm'))

    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)

    await waitFor(() => expect(put).toHaveBeenCalled())
    const [, body] = put.mock.calls[0] as unknown as [string, { imageFileId: number | null; size: string }]
    expect(body.size).toBe('compact')
    expect(body.imageFileId).toBeNull()
  })
})

/**
 * Task 14b item 1 — ครึ่งที่ `packages/ui` พิสูจน์ไม่ได้: ที่นั่นดักได้แค่ `draft` ที่ `onSave`
 * ได้รับ ส่วน **body ที่ออกไปทางสาย** ประกอบขึ้นที่ `EditorPage.save()` ของ adapter นี้ ซึ่งเป็น
 * จุดที่ฟิลด์หล่นหายได้เงียบที่สุด (ทั้งฟังก์ชันนั้นสร้าง object ใหม่ทีละคีย์ด้วยมือ)
 *
 * เคสที่อันตรายจริงคือเคสที่สอง: เปิดเมนูสมาชิกมาแก้ชื่อแล้วกด Save โดยไม่แตะช่องกลุ่มเป้าหมายเลย
 * ถ้า seed ไม่เกิดขึ้น (`audience: detail.audience` หายไปจาก useEffect) ฟอร์มจะเริ่มที่ 'all'
 * แล้วส่ง 'all' กลับไปเขียนทับ — คือ Critical ตัวเดียวกับ 5c8621e ที่กลับมาทางประตูใหม่ เพียงแต่
 * คราวนี้เซิร์ฟเวอร์ปฏิเสธให้ถ้าเมนูยัง active อยู่ (item 3) ซึ่งไม่ได้แปลว่าฝั่ง UI ถูก
 */
describe('EditorPage — กลุ่มเป้าหมายเดินทางครบทั้งขาเข้าและขาออก (Task 14b item 1)', () => {
  it('เปิดเมนูสมาชิกมาแก้ — ช่องกลุ่มเป้าหมายถูก seed จากแถวเดิม ไม่ใช่เริ่มที่ค่า default', async () => {
    setup()
    await waitFor(() => expect(screen.getByLabelText('audience.members')).toBeChecked())
    expect(screen.getByLabelText('audience.all')).not.toBeChecked()
  })

  it('แก้ชื่ออย่างเดียวแล้วบันทึก — body ที่ออกไปยังพก audience: members ไม่ใช่ถูกรีเซ็ตเป็น all', async () => {
    const { put } = setup()
    await waitFor(() => expect(screen.getByLabelText('audience.members')).toBeChecked())
    fireEvent.change(screen.getByLabelText('editor.title'), { target: { value: 'เมนูเดิม (แก้ชื่อ)' } })
    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)

    await waitFor(() => expect(put).toHaveBeenCalled())
    const [, body] = put.mock.calls[0] as unknown as [string, { name: string; audience: string }]
    expect(body.name).toBe('เมนูเดิม (แก้ชื่อ)') // sanity — พิสูจน์ว่า body นี้คือของการแก้ชื่อจริง
    expect(body.audience).toBe('members')
  })

  it('สลับมาที่ "ทุกคน" แล้วบันทึก — body ส่ง all จริง ไม่ใช่ค้างค่าเดิมของแถว', async () => {
    const { put } = setup()
    await waitFor(() => expect(screen.getByLabelText('audience.members')).toBeChecked())
    fireEvent.click(screen.getByLabelText('audience.all'))
    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)

    await waitFor(() => expect(put).toHaveBeenCalled())
    const [, body] = put.mock.calls[0] as unknown as [string, { audience: string }]
    expect(body.audience).toBe('all')
  })
})

/**
 * Task 17 / final review BLOCKER — ปุ่ม publish ปุ่มเดียวที่มีใน editor เคยส่ง `setAsDefault: true`
 * ตายตัว และสวิตช์สมาชิกทำงานได้ก็ต่อเมื่อเมนู publish แล้วเท่านั้น — เมนูสมาชิก**ทุกตัว**จึงถูก
 * ยัดให้ผู้ติดตามทุกคนก่อนจะได้เป็นของสมาชิก โดยไม่มีทางเลี่ยงเลย เซิร์ฟเวอร์ปฏิเสธค่านี้แล้ว
 * (409 `menu_not_all_audience`) แต่ถ้า UI ยังส่ง true ตายตัว ผลลัพธ์คือผู้ใช้เจอ error จากตัวเลือก
 * ที่ UI เลือกให้เอง ซึ่งไม่ใช่การแก้บั๊ก แต่คือการย้ายที่มันไปโผล่
 *
 * ขับผ่าน `EditorPage` จริงในโหมดแก้ไข แล้วอ่าน body ที่ออกไปจริง — ไม่ใช่ยืนยันค่าคงที่ในโค้ด
 */
/**
 * jsdom ไม่ decode รูปจริง — `ImageField` วัดขนาดผ่าน `Image.naturalWidth/Height` จึงต้องปลอมค่าไว้
 * (แพทเทิร์นเดียวกับ `packages/ui/tests/image-field.test.tsx`) ต้องปลอมเพราะปุ่ม publish ปฏิเสธ
 * ร่างที่ไม่มีรูป (`editor.error.noImage` ใน RichMenuEditor) — และหน้า editor ตอนเปิดเมนูเดิมมาแก้
 * ตั้ง `image: null` เสมอ (GET /menus/:id ไม่คืน url ของไฟล์ดิบมาให้) เส้นทาง publish จริงจึงต้อง
 * ผ่านการอัปโหลดรูปหนึ่งครั้งเสมอ ซึ่งคือสิ่งที่ผู้ใช้ทำจริงตอนกดปุ่มนี้
 */
function stubImageSize(width: number, height: number) {
  class StubImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = width
    naturalHeight = height
    set src(_v: string) { queueMicrotask(() => this.onload?.()) }
  }
  vi.stubGlobal('Image', StubImage)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} })
}

/** อัปโหลดรูปหนึ่งใบผ่านช่องจริงของฟอร์ม แล้วรอจน `draft.image` ถูกตั้งค่า */
async function attachImage(): Promise<void> {
  stubImageSize(2500, 1686)
  fireEvent.change(screen.getByTestId('image-input'), {
    target: { files: [new File([new Uint8Array([1, 2, 3])], 'menu.png', { type: 'image/png' })] },
  })
  await waitFor(() => expect(screen.getByTestId('image-remove')).toBeInTheDocument())
}

describe('EditorPage — publish ต้องตั้ง default ตามกลุ่มเป้าหมาย ไม่ใช่ true ตายตัว (Task 17)', () => {
  const checked = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).checked

  /**
   * ชั้นที่ไม่มีใครทดสอบมาก่อน และเป็นเหตุผลเดียวที่ blocker ตัวนี้เขียนลงไปได้
   *
   * เทสต์ของ `packages/ui` หยุดที่ callback `onSave(draft, publish)` ซึ่งอยู่**เหนือ** body ของ
   * HTTP ส่วนเทสต์ฝั่งเซิร์ฟเวอร์เริ่มที่ controller ซึ่งอยู่**ใต้**มัน ชั้นประกอบคำขอของหน้า
   * adapter ที่คั่นกลางเคยถูกคุ้มครองไว้แค่ปุ่มเดียว (`save-draft` กับ `put.mock.calls[0]`)
   * ไม่มีที่ไหนในทั้ง repo ที่บันทึกไว้ว่า **ผลิตภัณฑ์ส่งอะไรจริงตอนกด publish** — `setAsDefault`
   * โผล่แค่ใน `packages/core/tests/server/publish.test.ts` ในฐานะพารามิเตอร์ที่เทสต์เลือกเองได้
   * ตามใจ ผลคือ `setAsDefault: true` ตายตัวอยู่รอดมาได้ทุกรอบรีวิว และ fixture ของ acceptance
   * ก็ส่งค่าที่ editor สร้างไม่ได้โดยไม่มีอะไรค้าน
   *
   * ตารางนี้ตรึง body ทั้งก้อนของคำขอ publish จริง ทั้งสองทิศทาง และตรึงว่า `audience` ที่ PUT
   * ส่งไป กับ `setAsDefault` ที่ POST ส่งตาม มาจากค่าเดียวกัน — สองฟิลด์นี้ derive จาก draft
   * ตัวเดียวกัน ถ้าวันหนึ่งมันแยกจากกัน (เช่นตัวหนึ่งอ่านค่าที่ค้างอยู่) เมนูจะถูกบันทึกเป็นของ
   * สมาชิกแล้วถูกตั้งเป็น default ของทุกคนในคำขอถัดมาทันที ซึ่งคือ blocker ตัวเดิมเป๊ะ ๆ
   */
  const cases = [
    {
      title: 'เมนูสมาชิกที่โหลดมาจากเซิร์ฟเวอร์ กดบันทึกและเผยแพร่โดยไม่แตะช่องกลุ่มเป้าหมาย',
      detail: menuDetail,
      switchTo: null,
      audience: 'members',
      setAsDefault: false,
    },
    {
      // เคสที่พบบ่อยที่สุดจริง ๆ ของปุ่มนี้ — เมนูของทุกคนที่เผยแพร่โดยไม่แตะช่องกลุ่มเป้าหมายเลย
      // ต่างจากเคสข้างล่างตรงที่ค่า 'all' มาจากแถวจริง ไม่ได้มาจากการกดสลับ: seed ที่พังกับการกด
      // ที่ถูกต้อง จะยังเขียวถ้ามีแต่เคสข้างล่าง
      title: 'เมนูของทุกคนที่โหลดมาจากเซิร์ฟเวอร์ กดบันทึกและเผยแพร่โดยไม่แตะช่องกลุ่มเป้าหมาย',
      detail: { ...menuDetail, audience: 'all' as const },
      switchTo: null,
      audience: 'all',
      setAsDefault: true,
    },
    {
      title: 'สลับจากสมาชิกมาที่ "ทุกคน" แล้วกดบันทึกและเผยแพร่',
      detail: menuDetail,
      switchTo: 'audience.all',
      audience: 'all',
      setAsDefault: true,
    },
    {
      title: 'สลับจากทุกคนมาที่ "สมาชิก" แล้วกดบันทึกและเผยแพร่',
      detail: { ...menuDetail, audience: 'all' as const },
      switchTo: 'audience.members',
      audience: 'members',
      setAsDefault: false,
    },
  ] as const

  for (const scenario of cases) {
    it(`${scenario.title} → PUT audience: ${scenario.audience}, publish setAsDefault: ${scenario.setAsDefault}`, async () => {
      const { put, post } = setup(scenario.detail)
      await waitFor(() => expect(checked(`audience.${scenario.detail.audience}`)).toBe(true))
      if (scenario.switchTo !== null) fireEvent.click(screen.getByLabelText(scenario.switchTo))
      await attachImage()
      fireEvent.click(screen.getAllByTestId('save-publish')[0]!)

      const publishCalls = () => post.mock.calls.filter(([url]) => url === ENDPOINTS.menuPublish('menu-1'))
      await waitFor(() => expect(publishCalls()).toHaveLength(1))

      // body ทั้งก้อน ไม่ใช่คีย์เดียว — คีย์ที่งอกเพิ่มหรือถูกเปลี่ยนชื่อก็ต้องแดงเหมือนกัน
      // cast แบบเดียวกับ `put` ข้างล่าง — mock ถูกประกาศด้วยพารามิเตอร์เดียว (url) ทั้งที่ตอนรันจริง
      // ถูกเรียกด้วย (url, body) TS จึงมองไม่เห็น index 1 ทั้งที่มันมีอยู่จริง
      const [, publishBody] = publishCalls()[0] as unknown as [string, { setAsDefault: boolean }]
      expect(publishBody).toEqual({ setAsDefault: scenario.setAsDefault })

      // และ PUT ที่นำหน้ามันต้องประกาศ audience ตัวเดียวกับที่ setAsDefault ถูกคิดมาจาก
      const [, saved] = put.mock.calls[0] as unknown as [string, { audience: string }]
      expect(saved.audience, 'audience ที่บันทึกกับ setAsDefault ที่ตามไปต้องมาจากค่าเดียวกัน')
        .toBe(scenario.audience)
    })
  }
})
