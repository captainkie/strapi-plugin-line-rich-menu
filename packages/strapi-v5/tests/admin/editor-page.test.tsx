// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { ENDPOINTS, PortProvider, createStubPort } from '@fosivo/line-rich-menu-ui'
import { EditorPage } from '../../admin/src/pages/Editor.js'

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
  const menuDetail = {
    id: 'menu-1',
    name: 'เมนูเดิม',
    channelId: 'ch0000000000000000000001',
    size: 'large' as const,
    chatBarText: 'เมนู',
    chatBarMode: 'default' as const,
    selected: true,
    templateKey: 'RICH_MENU_TEMPLATE_207',
    areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message' as const, text: 'hi' } }],
    imageFileId: 42,
    aliasId: null,
    startAt: null,
    endAt: null,
  }

  function setup() {
    const put = vi.fn(async () => ({ id: 'menu-1' }))
    const get = vi.fn(async (url: string) => (url === ENDPOINTS.menu('menu-1') ? menuDetail : []))
    const port = createStubPort({
      t: (key: string) => key,
      http: { ...createStubPort().http, get: get as never, put: put as never },
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
    return { put }
  }

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
