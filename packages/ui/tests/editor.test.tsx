import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SIZE_LADDER, TEMPLATES } from '@fosivo/line-rich-menu-core/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyActionForm } from '../src/action-form.js'
import { PortProvider, type HttpClient, type UIPort } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { RichMenuEditor, emptyDraft, type RichMenuDraft } from '../src/pages/RichMenuEditor.js'

function setup(
  overrides: Partial<React.ComponentProps<typeof RichMenuEditor>> = {},
  // เพิ่มเข้ามาสำหรับเทสต์ publish รอบที่ต้องอัปโหลดรูปจริงผ่าน UI (fix round 1) — ต้องปลอม
  // http.post ให้คืนไฟล์ที่อัปสำเร็จ ค่าเริ่มต้นของ stub port (`async () => ({})`) ไม่ใช่ array
  // จึง `uploaded[0]` เป็น undefined เสมอ ทำให้ ImageField เข้า error path ทุกครั้ง
  portOverrides: Partial<UIPort> = {},
) {
  // ระบุ type ผ่าน generic ของ vi.fn ตรง ๆ (ไม่ใช่ตั้งชื่อพารามิเตอร์ที่ implementation ไม่ใช้ —
  // จะโดน no-unused-vars) — ไม่งั้น `onSave.mock.calls[0][0]` จะ infer เป็น tuple ว่างจาก
  // `async () => {}` เปล่า ๆ ทำให้เทสต์ที่อ่านค่า draft ที่ถูกส่งจริง (custom layout describe
  // ท้ายไฟล์) พังตอน typecheck ไม่ใช่ตอนรัน
  const onSave = vi.fn<(draft: RichMenuDraft, publish: boolean) => Promise<void>>(async () => {})
  const onCancel = vi.fn()
  const toast = vi.fn()
  render(
    <PortProvider value={createStubPort({ t: (k) => k, toast, ...portOverrides })}>
      <RichMenuEditor aliasOptions={[]} onSave={onSave} onCancel={onCancel} {...overrides} />
    </PortProvider>,
  )
  return { onSave, onCancel, toast }
}

function chooseTemplate(key = 'RICH_MENU_TEMPLATE_205') {
  fireEvent.click(screen.getByTestId('open-template-picker'))
  fireEvent.click(screen.getByTestId(`template-option-${key}`))
  fireEvent.click(screen.getByTestId('template-apply'))
}

function file(name = 'menu.png', type = 'image/png') {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

// jsdom ไม่ decode รูปจริง จึงต้องปลอมขนาดที่ Image จะรายงานกลับมา (แพทเทิร์นเดียวกับ
// image-field.test.tsx) — ต้อง unstub ท้ายเทสต์ ไม่งั้นหลุดข้ามเทสต์ถัดไปในไฟล์เดียวกัน
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RichMenuEditor', () => {
  it('เป็นฟอร์มเดียวเลื่อนยาว ไม่มีแท็บ', () => {
    setup()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('editor.mainSettings')).toBeInTheDocument()
    expect(screen.getByText('chatBar.title')).toBeInTheDocument()
  })

  // หน้านี้เคยไม่มี <h1>/<h2> สักตัว เพราะ Typography ของ port วาดเป็น <span> เสมอ — คนที่ไล่หน้า
  // ด้วยรายการหัวข้อของ screen reader (วิธีปกติที่สุดในการสำรวจหน้ายาว ๆ) จึงได้หน้าเปล่า
  // ทั้งที่ตาเห็นหัวข้ออยู่หลายอัน เทสต์นี้ยึดทั้งการมีอยู่และ "ระดับ" ไม่ใช่แค่ว่ามีข้อความนั้นบนจอ
  it('หัวข้อของแต่ละส่วนเป็นหัวข้อจริงและมีลำดับชั้นถูกต้อง ไม่ใช่ span ที่แค่ตัวโต', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'editor.heading' })).toBeInTheDocument()
    for (const name of ['editor.mainSettings', 'editor.actions', 'chatBar.title']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  // สเปกงานนี้ #6 — เดิม "Chat bar settings" อยู่นอกสองคอลัมน์ทั้งหมด (sibling ของแถวสองคอลัมน์ ไม่ใช่
  // ลูกของมัน) ผัง LINE OA Manager เองวางไว้ในคอลัมน์ขวา ใต้ Actions เทสต์นี้ยึดตำแหน่งจริงใน DOM —
  // ไม่ใช่แค่ "อยู่บนจอ" (ซึ่งเป็นจริงทั้งก่อนและหลังแก้) ต้องแดงถ้ามีใครย้ายกลับไปไว้นอกแถวสองคอลัมน์
  it('บล็อก "Chat bar settings" อยู่ในคอลัมน์ขวา ใต้ Actions ไม่ใช่นอกสองคอลัมน์', () => {
    setup()
    const actionsHeading = screen.getByRole('heading', { level: 2, name: 'editor.actions' })
    const chatBarHeading = screen.getByRole('heading', { level: 2, name: 'chatBar.title' })

    // DOCUMENT_POSITION_FOLLOWING (4) — chatBarHeading ต้องอยู่ "หลัง" actionsHeading ใน DOM order
    expect(actionsHeading.compareDocumentPosition(chatBarHeading) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()

    // ลำพังลำดับก่อนหลังยังไม่พอ (ผังเดิมก็ผ่านเงื่อนไขนี้ได้ เพราะ ChatBarSettings อยู่ "หลัง" แถว
    // สองคอลัมน์อยู่แล้วเหมือนกัน แค่ไม่ได้เป็นลูกของมัน) ต้องพิสูจน์ว่าอยู่ "ใน" แถวสองคอลัมน์เดียวกัน
    // กับสวิตช์ outline (ซึ่งอยู่คอลัมน์ซ้าย) จริง — หา "แถวสองคอลัมน์" จากบรรพบุรุษร่วมของสวิตช์นั้น
    // กับหัวข้อ Actions แทนการนับชั้นของ Flex ที่ผูกกับโครงสร้างภายในของ AreaList/ChatBarSettings เอง
    const outlinesToggle = screen.getByLabelText('editor.showOutlines')
    let twoColumnRow: Element | null = outlinesToggle
    while (twoColumnRow !== null && !twoColumnRow.contains(actionsHeading)) {
      twoColumnRow = twoColumnRow.parentElement
    }
    expect(twoColumnRow).not.toBeNull()
    expect(twoColumnRow!.contains(chatBarHeading)).toBe(true)
  })

  it('มีปุ่มบันทึกทั้งบนหัวและท้ายฟอร์ม', () => {
    setup()
    expect(screen.getAllByTestId('save-draft')).toHaveLength(2)
    expect(screen.getAllByTestId('save-publish')).toHaveLength(2)
  })

  it('ปุ่มเลือกรูปถูกปิดไว้จนกว่าจะเลือก template', () => {
    setup()
    expect(screen.getByTestId('image-input')).toBeDisabled()
  })

  it('เลือก template แล้วได้ช่องครบตามแบบ และปุ่มรูปเปิดใช้ได้', () => {
    setup()
    chooseTemplate('RICH_MENU_TEMPLATE_205')
    expect(screen.getAllByTestId(/^area-header-/)).toHaveLength(2)
    expect(screen.getByTestId('image-input')).not.toBeDisabled()
  })

  // picker ไม่มีพร็อพ `open` อีกแล้ว — การไม่อยู่บนจอคือการไม่ได้ถูก mount การันตีนี้จึงย้ายมาอยู่ที่นี่
  // แทนที่จะอยู่ในเทสต์ของ picker เอง
  it('picker ไม่อยู่บนจอจนกว่าจะกดเปิด', () => {
    setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('open-template-picker'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // picker เคยถูก mount ค้างไว้ตลอดอายุหน้า (open={picking}) — useState ข้างในจึงไม่เคยรีเซ็ต
  // ทางเดินที่พัง: ผู้ใช้ที่ตั้ง action ไว้แล้วเปิด picker เลือกแบบอื่น กด Apply จนได้กล่องยืนยัน
  // แล้ว "ปิด modal" แทนที่จะตอบ — `confirming` ค้างเป็น true พอเปิด picker ใหม่จะเจอกล่องยืนยัน
  // ทันทีโดยไม่มีตารางให้เลือกเลย และมันพูดถึง template ที่เขาเดินจากไปแล้ว คลิกเดียวทิ้งงานทั้งหมด
  it('ปิด modal ทิ้งกลางกล่องยืนยัน แล้วเปิดใหม่ ต้องได้ตารางสด ไม่ใช่กล่องยืนยันค้างจากรอบก่อน', () => {
    setup()
    chooseTemplate('RICH_MENU_TEMPLATE_205')
    fireEvent.click(screen.getByTestId('area-header-0'))
    fireEvent.change(screen.getByLabelText('action.field.label'), { target: { value: 'ปุ่ม' } })

    fireEvent.click(screen.getByTestId('open-template-picker'))
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_201'))
    fireEvent.click(screen.getByTestId('template-apply'))
    expect(screen.getByTestId('template-confirm')).toBeInTheDocument()

    fireEvent.click(screen.getByText('close'))
    fireEvent.click(screen.getByTestId('open-template-picker'))

    expect(screen.queryByTestId('template-confirm')).not.toBeInTheDocument()
    expect(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_201'))
      .toHaveAttribute('aria-pressed', 'false')
  })

  it('ปุ่มเปลี่ยน template เปลี่ยนคำจาก Select เป็น Change เมื่อเลือกแล้ว', () => {
    setup()
    expect(screen.getByTestId('open-template-picker').textContent).toContain('common.select')
    chooseTemplate()
    expect(screen.getByTestId('open-template-picker').textContent).toContain('common.change')
  })

  it('เลือกช่องบน canvas แล้ว accordion ของช่องนั้นกางออก', () => {
    setup()
    chooseTemplate()
    // ต้อง scope เข้า canvas ก่อน เพราะหัว accordion ของ AreaList ก็ match /^B/ เหมือนกัน และการกดมัน
    // ก็เรียก onSelect(1) ด้วย — ถ้า query ทั้งหน้า เทสต์นี้จะเขียวต่อไปแม้ลบ canvas ทิ้งทั้งอัน
    // getByRole (ไม่ใช่ getAllByRole()[0]) พิสูจน์ว่าใน scope นี้มีปุ่มช่อง B แค่ตัวเดียวจริง
    const canvas = within(screen.getByTestId('preview-menu'))
    fireEvent.click(canvas.getByRole('button', { name: /^B/ }))
    expect(screen.getByTestId('area-body-1')).toBeInTheDocument()
  })

  // ผัง §5.7 มี canvas ช่องเดียว วาดอยู่ในกรอบโทรศัพท์ ตอนหนึ่งหน้านี้เคยวาดสองตัว (ตัวแก้ไขได้
  // ตัวหนึ่ง กับตัวที่ Preview ฝังอีกตัว) ซึ่งเป็นต้นเหตุของทั้ง outline ที่สลับไม่ครบ, query ที่ชนกัน,
  // และช่องที่โผล่ซ้ำสองชุดใน accessibility tree — เทสต์นี้กันไม่ให้ตัวที่สองกลับมาเงียบ ๆ
  it('วาด canvas ตัวเดียว ไม่ใช่พรีวิวคู่กับ canvas แยก', () => {
    setup()
    chooseTemplate()
    expect(screen.getAllByTestId('rich-menu-canvas')).toHaveLength(1)
    // และตัวเดียวนั้นต้องอยู่ในกรอบโทรศัพท์ ไม่ใช่ลอยอยู่ข้าง ๆ
    expect(within(screen.getByTestId('preview-menu')).getByTestId('rich-menu-canvas'))
      .toBeInTheDocument()
  })

  // สวิตช์นี้ต้องคุม canvas ตัวเดียวกับที่ผู้ใช้กดเลือกช่อง — ตอนที่หน้านี้ยังวาด canvas สองตัว
  // (ตัวแก้ไขได้ กับตัวใน Preview) สวิตช์คุมได้แค่ตัวเดียว ป้ายขนาดของอีกตัวจึงค้างอยู่เสมอ
  // เทสต์นี้จับตรงนั้นได้เพราะเช็คทั้งขาปิดและขาเปิดกลับ ไม่ใช่แค่ว่ากดแล้วมีอะไรหายไปบ้าง
  it('สลับ outline ได้ทั้งขาปิดและขาเปิดกลับ', () => {
    setup()
    chooseTemplate()
    // ป้ายขนาดมีหนึ่งอันต่อหนึ่งช่อง จึงต้องนับเป็นชุด ไม่ใช่คาดว่าจะเจอชิ้นเดียว
    const labels = () => within(screen.getByTestId('preview-menu')).queryAllByText('2500×843')
    const shown = labels().length
    expect(shown).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('editor.showOutlines'))
    expect(labels()).toHaveLength(0)

    fireEvent.click(screen.getByLabelText('editor.showOutlines'))
    expect(labels()).toHaveLength(shown)
  })

  it('แถบแชทใน preview อัปเดตตามที่พิมพ์ทันที', () => {
    setup()
    fireEvent.click(screen.getByLabelText('chatBar.mode.custom'))
    fireEvent.change(screen.getByLabelText('chatBar.text'), { target: { value: 'ทดสอบ' } })
    expect(screen.getByTestId('preview-chat-bar').textContent).toContain('ทดสอบ')
  })

  // สเปกงานนี้ #3 — เดิม Preview รับ expanded={draft.bounds.length > 0} เสมอ ตัวเลือก "Default
  // behavior" (Shown/Collapsed) จึงไม่มีผลอะไรกับพรีวิวเลย อ่านเป็นของพัง เทสต์นี้ต้องแดงถ้ามีใคร
  // ผูก expanded กลับไปที่ bounds.length อีกครั้ง — ไม่ใช่แค่พิสูจน์ว่า Preview เองสลับได้ (ดูเทสต์
  // ของ Preview เองใน settings-and-preview.test.tsx) แต่พิสูจน์ว่า "สายไฟ" จาก radio ไปถึง Preview จริง
  it('เลือก "Collapsed" ในหน้า editor แล้วเมนูในพรีวิวยุบจริง เลือก "Shown" แล้วกางกลับ', () => {
    setup()
    chooseTemplate()
    expect(screen.getByTestId('preview-menu')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('chatBar.behavior.collapsed'))
    expect(screen.queryByTestId('preview-menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('chatBar.behavior.shown'))
    expect(screen.getByTestId('preview-menu')).toBeInTheDocument()
  })

  // ปุ่ม Save draft มีสองชุด (หัว/ท้ายฟอร์ม) จาก testid เดียวกัน — ไล่ทั้งคู่เพื่อพิสูจน์ว่าทั้งสองชุด
  // บันทึกร่างเหมือนกันจริง ไม่ใช่แค่ชุดที่ทดสอบไว้
  //
  // A6 — เดิม assert ด้วย expect.anything() ซึ่งผ่านได้กับค่าอะไรก็ตามที่ไม่ใช่ null/undefined จึงไม่ได้
  // พิสูจน์อะไรเลยว่า draft ที่ onSave ได้รับหน้าตาเป็นอย่างไร — เทียบกับ emptyDraft() ทั้งก้อนแทน
  //
  // title เป็น 'editor.untitled' ไม่ใช่ '' เหมือน emptyDraft() ดิบ — Task 20 item 2 (ui-core H1)
  // เติม fallback ให้ title ที่ *ส่งจริง* ไม่ใช่แค่ตรวจตอน publish (ดูคอมเมนต์ที่ `toSave` ใน
  // RichMenuEditor.tsx) เพราะ `menuInputSchema` ของทั้งสอง adapter บังคับ `name: min(1)` เสมอไม่ว่า
  // จะ publish หรือไม่ (item 1) — ถ้า title ยังว่างหลุดไปถึง onSave แม้ในโหมด draft ก็จะพังเงียบ ๆ
  // ที่เซิร์ฟเวอร์เหมือนกันทุกประการ ส่วนที่เหลือของ draft ยังไม่ครบและยังถูกส่งไปตามที่กรอกจริง
  // ('ร่างคือร่าง') — เฉพาะ title เท่านั้นที่ได้ fallback เพราะเป็นฟิลด์เดียวที่ adapter ไม่ผ่อนให้ว่าง
  it('บันทึกร่างได้แม้ยังกรอกไม่ครบ — ร่างคือร่าง ไม่ว่าจะกดปุ่มหัวหรือท้ายฟอร์ม (title ได้ fallback เสมอ)', async () => {
    const { onSave } = setup()
    for (const button of screen.getAllByTestId('save-draft')) {
      onSave.mockClear()
      fireEvent.click(button)
      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith({ ...emptyDraft(), title: 'editor.untitled' }, false))
    }
  })

  // A6 — ยังไม่มี assertion ไหนพิสูจน์ว่า draft ที่ onSave ได้รับพกฟิลด์ที่ผู้ใช้แก้ไปครบทุกตัว
  // (chatBar.mode, sizeName, bounds, image ฯลฯ) ซึ่งเป็น contract ที่ Task 14 กับ Plan 03 อาศัยต่อ
  it('draft ที่ส่งให้ onSave พกทุกฟิลด์ที่ผู้ใช้แก้ไปครบ ไม่ใช่แค่บางส่วน', async () => {
    const { onSave } = setup()
    fireEvent.change(screen.getByLabelText('editor.title'), { target: { value: 'เมนูใหม่' } })
    fireEvent.click(screen.getByLabelText('chatBar.mode.custom'))
    fireEvent.change(screen.getByLabelText('chatBar.text'), { target: { value: 'ร้านค้า' } })
    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      {
        ...emptyDraft(),
        title: 'เมนูใหม่',
        chatBar: { mode: 'custom', text: 'ร้านค้า', selected: true },
      },
      false,
    ))
  })

  // S1 (STANDING-CORRECTIONS.md) — stub-port's Alert renders role="status", not role="alert".
  // Assert the translation key the code actually passes to t() instead.
  //
  // ปุ่ม "Save" หัวฟอร์มกับท้ายฟอร์มใช้ testid "save-publish" เดียวกัน แต่ไม่เคยมีอะไรพิสูจน์ว่าทั้งคู่
  // publish จริง (ไม่ใช่แค่บันทึกร่าง) — ไล่ทั้งสองปุ่มเพื่อยืนยันว่าพฤติกรรมเหมือนกัน
  // ต้อง mount ใหม่ให้แต่ละปุ่ม ไม่ใช่วนกดสองปุ่มบน render เดียว — แบนเนอร์ที่ขึ้นจากการกดปุ่มแรก
  // ไม่เคยถูกลบออก (save() ตั้ง formError เป็นค่าเดิมซ้ำ) รอบสองจึงเจอแบนเนอร์ของรอบแรกค้างอยู่
  // และผ่านแม้ปุ่มท้ายฟอร์มจะไม่ได้ต่อกับอะไรเลย ซึ่งตรงกับสิ่งที่ชื่อเทสต์อ้างว่าพิสูจน์พอดี
  it('publish โดยยังไม่มี template ไม่ได้ และบอกว่าติดตรงไหน ไม่ว่าจะกดปุ่มหัวหรือท้ายฟอร์ม', async () => {
    for (const index of [0, 1]) {
      cleanup()
      const { onSave } = setup()
      fireEvent.click(screen.getAllByTestId('save-publish')[index]!)
      await waitFor(() => expect(screen.getByText('editor.error.noTemplate')).toBeInTheDocument())
      expect(onSave).not.toHaveBeenCalled()
    }
  })

  // A4 — applyTemplate เคลียร์ areaErrors ตอนเลือก template ใหม่อยู่แล้ว แต่ไม่เคยเคลียร์ formError
  // แบนเนอร์ "ยังไม่มี template" เลยค้างอยู่บนจอทั้งที่ผู้ใช้เพิ่งทำสิ่งที่มันขอไปแล้ว จนกว่าจะกด save รอบถัดไป
  it('แบนเนอร์ "ยังไม่มี template" หายไปทันทีที่เลือก template ไม่ต้องรอกด save รอบถัดไป', async () => {
    setup()
    fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
    await waitFor(() => expect(screen.getByText('editor.error.noTemplate')).toBeInTheDocument())
    chooseTemplate()
    expect(screen.queryByText('editor.error.noTemplate')).not.toBeInTheDocument()
  })

  // A2 — สเปก §5.5: mode ต้องแยกจาก text เสมอ เพื่อไม่ให้สับสนว่าใครเป็นคนพิมพ์ label ที่เห็น
  // เดิม publish จะเติม default label แทนข้อความว่างให้เงียบ ๆ ทั้งที่ mode ยังเป็น custom อยู่
  it('publish โดยเลือกโหมด custom แต่ไม่พิมพ์ข้อความไม่ได้ — ต้องบอกที่ช่องนั้น ไม่ใช่เติมให้เงียบๆ', async () => {
    const { onSave } = setup()
    chooseTemplate()
    fireEvent.click(screen.getByLabelText('chatBar.mode.custom'))
    fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
    await waitFor(() => expect(document.getElementById('chatBarText-error')).not.toBeNull())
    expect(document.getElementById('chatBarText-error')?.textContent).toBe('editor.error.emptyChatBarText')
    expect(onSave).not.toHaveBeenCalled()
  })

  // สเปกงานนี้ #4 — ไม่มีการตรวจลำดับ startAt/endAt อยู่ที่ไหนเลยก่อนหน้านี้ เมนูที่ endAt มาก่อน
  // (หรือเท่ากับ) startAt บันทึกผ่านได้เงียบ ๆ แล้วไม่แสดงให้ใครเห็นเลย — บล็อก**ทุกครั้งที่บันทึก**
  // ไม่ใช่แค่ตอน publish (ต่างจาก custom label ว่างข้างบนที่บล็อกแค่ตอน publish) เพราะพิสูจน์แล้วจาก
  // การกดจริงในเบราว์เซอร์ (ไม่ใช่แค่เทสต์นี้): schema ของ adapter ทั้งสองปฏิเสธคำขอเขียนทุกคำขอที่
  // ลำดับผิด ไม่ว่าจะเป็น draft หรือ publish (ไม่มีทางแยกกันที่ POST/PUT) ถ้าฟอร์มเช็คแค่ตอน publish
  // ผู้ใช้ที่กด "Save draft" ด้วยวันที่ผิดลำดับจะเจอ toast ทั่วไป "บันทึกไม่สำเร็จ" ที่ไม่บอกอะไรเลย
  // ว่าช่องไหนผิด แทนที่จะเห็น error ชี้เป้าที่ช่องนั้น
  describe('ช่วงเวลาแสดงผล — endAt ต้องอยู่หลัง startAt เสมอ ไม่ว่าจะบันทึกร่างหรือ publish', () => {
    it('บันทึกร่างที่ endAt มาก่อน startAt ก็ถูกบล็อกเหมือนกัน — ไม่ปล่อยให้ทับ error ทั่วไปจากเซิร์ฟเวอร์', async () => {
      const { onSave } = setup({
        initial: { ...emptyDraft(), startAt: '2026-09-30T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z' },
      })
      fireEvent.click(screen.getAllByTestId('save-draft')[0]!)
      await waitFor(() => expect(document.getElementById('endDate-error')).not.toBeNull())
      expect(document.getElementById('endDate-error')?.textContent).toBe('editor.error.displayPeriodOrder')
      expect(onSave).not.toHaveBeenCalled()
    })

    it('publish ที่ endAt มาก่อน startAt ไม่ได้ — error ขึ้นที่ช่องวันที่สิ้นสุด ไม่ใช่ปล่อยผ่านเงียบ ๆ', async () => {
      const { onSave } = setup({
        initial: { ...emptyDraft(), startAt: '2026-09-30T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z' },
      })
      chooseTemplate('RICH_MENU_TEMPLATE_105')
      fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
      await waitFor(() => expect(document.getElementById('endDate-error')).not.toBeNull())
      expect(document.getElementById('endDate-error')?.textContent).toBe('editor.error.displayPeriodOrder')
      expect(onSave).not.toHaveBeenCalled()
    })

    // การตัดสินใจของเจ้าของโปรดักต์ (ไม่ใช่ค่าที่ LINE เอกสารไว้ — ช่วงเวลาแสดงผลไม่ใช่แนวคิดของ
    // LINE เอง ดูคอมเมนต์ที่ isDisplayPeriodValid ใน packages/core): เท่ากันเป๊ะถือว่าไม่ผ่าน
    it('publish ที่ endAt เท่ากับ startAt เป๊ะ ก็ยังถูกบล็อกเหมือนกัน — ช่วงเวลายาวเป็นศูนย์ไม่แสดงเมนูให้ใครเลย', async () => {
      const { onSave } = setup({
        initial: { ...emptyDraft(), startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z' },
      })
      chooseTemplate('RICH_MENU_TEMPLATE_105')
      fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
      await waitFor(() => expect(document.getElementById('endDate-error')).not.toBeNull())
      expect(onSave).not.toHaveBeenCalled()
    })

    it('publish ที่ endAt อยู่หลัง startAt จริง ผ่านเงื่อนไขนี้ได้ — publish สำเร็จทั้งกระบวนการ', async () => {
      stubImageSize(2500, 843) // ขนาดของ RICH_MENU_TEMPLATE_105 (compact เดี่ยว — ดู templates.ts)
      const post = vi.fn(async () => [{ id: 1, url: '/uploads/a.png', width: 2500, height: 843 }])
      // 'chatBar.defaultLabel' ดิบยาว 21 ตัว เกินเพดาน chatBarText ของ schema (14) — ปลอมคำแปล
      // เฉพาะคีย์นี้เหมือนกับเทสต์ publish สำเร็จอื่น ๆ ในไฟล์นี้ (ดู 'fix round 1' ด้านล่าง)
      const t = (key: string) => (key === 'chatBar.defaultLabel' ? 'เมนู' : key)
      const { onSave } = setup(
        { initial: { ...emptyDraft(), startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z' } },
        { t, http: { ...createStubPort().http, post: post as unknown as HttpClient['post'] } },
      )
      chooseTemplate('RICH_MENU_TEMPLATE_105')
      fireEvent.click(screen.getByTestId('area-header-0'))
      fireEvent.change(
        within(screen.getByTestId('area-body-0')).getByLabelText('action.field.text'),
        { target: { value: 'ปุ่ม' } },
      )
      fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
      await waitFor(() => expect(screen.getByTestId('image-remove')).toBeInTheDocument())

      fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
      await waitFor(() => expect(onSave).toHaveBeenCalled())
      expect(onSave.mock.calls[0]![1]).toBe(true)
      expect(screen.queryByText('editor.error.displayPeriodOrder')).not.toBeInTheDocument()
    })
  })

  // A3 — MainSettings รับ prop errors มาตั้งแต่ fix round ของ Task 9 แต่ RichMenuEditor ไม่เคยส่งอะไร
  // เข้าไปเลย issue ที่ไม่ใช่ของช่อง (เช่น path "name") จึงตกไปอยู่ที่แบนเนอร์รวมแทนที่จะขึ้นที่ช่องชื่อ
  //
  // Task 20 item 2 (ui-core H1) — ก่อนแก้ คอมเมนต์เดิมตรงนี้อ้างว่า "title ว่างจะถูกแทนด้วยคำนี้เสมอ
  // ทำให้ name ไม่มีทางว่างได้ผ่านโค้ดจริง" ซึ่ง**เป็นจริงแค่ครึ่งเดียว**: ครึ่งที่ตรวจในเบราว์เซอร์
  // (`validateRichMenu`) ใช่ แต่ครึ่งที่ส่งจริงไป `onSave` ไม่ใช่ — `save()` เดิมเติม fallback แค่ตอน
  // เรียก validateRichMenu เท่านั้น ตัว draft ที่ส่งออกไปจริงยังว่างอยู่ นั่นคือช่องโหว่ที่ H1 รายงาน
  // (Title ว่างผ่านการเช็คฝั่งนี้ แต่ adapter ปฏิเสธเสมอเพราะ `name: min(1)`) ตอนนี้ `save()` เติม
  // fallback ที่ `toSave` ตัวเดียวแล้วใช้ทั้งตรวจและส่ง คอมเมนต์เดิมจึงเป็นจริงจริง ๆ แล้ว — เทสต์นี้ยัง
  // ต้องปลอม t('editor.untitled') ให้คืนค่าว่างเพื่อพิสูจน์ทางเดินของ error เหมือนเดิม (การเติม
  // fallback ไม่ได้ตัดทางเดิน error ทิ้ง แค่ทำให้ path นี้เกิดยากขึ้นในโลกจริง) ส่วนเทสต์คู่กันด้านล่าง
  // ('title ว่าง + t จริง ...') พิสูจน์ครึ่งที่ H1 รายงานโดยตรง: ค่าที่ onSave ได้รับต้องไม่ว่าง
  it('error ที่ path "name" จาก validateRichMenu ขึ้นที่ช่องชื่อใน MainSettings ไม่ใช่แบนเนอร์รวม', async () => {
    const t = (key: string) => (key === 'editor.untitled' ? '' : key)
    render(
      <PortProvider value={createStubPort({ t, toast: vi.fn() })}>
        <RichMenuEditor aliasOptions={[]} onSave={vi.fn(async () => {})} onCancel={vi.fn()} />
      </PortProvider>,
    )
    chooseTemplate()
    fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
    await waitFor(() => expect(document.getElementById('title-error')).not.toBeNull())
    expect(document.getElementById('title-error')?.textContent).toBe('validation.too_small')
    expect(screen.queryByText('editor.error.noTemplate')).not.toBeInTheDocument()
  })

  /**
   * Task 20 item 2 (ui-core H1) repro ตรง ๆ — ก่อนแก้ `onSave` ได้รับ `draft.title === ''` ดิบ
   * (fallback ถูกเติมแค่ใน `validateRichMenu` ซึ่งเป็น object คนละตัว) พิสูจน์ทั้งสองเส้นทางบันทึก
   * ไม่ใช่แค่ publish — save draft ก็ต้องได้ title เดียวกัน เพราะ `menuInputSchema` ของทั้งสอง adapter
   * บังคับ `name: min(1)` เสมอไม่ว่า publish หรือไม่ (item 1) title ว่างที่หลุดไปถึง onSave ในโหมด
   * draft จะพังเงียบ ๆ ที่เซิร์ฟเวอร์เหมือนกันทุกประการ
   */
  it('title ว่าง + t จริง (ไม่ได้ปลอมให้คืนค่าว่าง) — onSave ต้องได้ title ที่ถูกแทนแล้ว ไม่ใช่ค่าว่างดิบ', async () => {
    stubImageSize(2500, 1686) // ขนาดของ RICH_MENU_TEMPLATE_207 (large เดี่ยว — ดู templates.ts)
    const post = vi.fn(async () => [{ id: 1, url: '/uploads/a.png', width: 2500, height: 1686 }])
    // 'chatBar.defaultLabel' ดิบยาวเกินเพดาน chatBarText (14) — ปลอมเฉพาะคีย์นี้เหมือนเทสต์ publish
    // สำเร็จอื่น ๆ ในไฟล์นี้ (ดู 'fix round 1' ด้านบน) ไม่กระทบ 'editor.untitled' ที่เทสต์นี้ต้องการ
    const t = (key: string) => (key === 'chatBar.defaultLabel' ? 'เมนู' : key)
    const { onSave: onSavePublish } = setup(
      {},
      { t, http: { ...createStubPort().http, post: post as unknown as HttpClient['post'] } },
    )
    chooseTemplate('RICH_MENU_TEMPLATE_207')
    fireEvent.click(screen.getByTestId('area-header-0'))
    fireEvent.change(
      within(screen.getByTestId('area-body-0')).getByLabelText('action.field.text'),
      { target: { value: 'ปุ่ม' } },
    )
    fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
    await waitFor(() => expect(screen.getByTestId('image-remove')).toBeInTheDocument())
    fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
    await waitFor(() => expect(onSavePublish).toHaveBeenCalled())
    expect(onSavePublish.mock.calls[0]![0].title).toBe('editor.untitled')
    expect(onSavePublish.mock.calls[0]![0].title).not.toBe('')

    cleanup()

    const { onSave: onSaveDraft } = setup({}, { t })
    chooseTemplate('RICH_MENU_TEMPLATE_207')
    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalled())
    expect(onSaveDraft.mock.calls[0]![0].title).toBe('editor.untitled')
    expect(onSaveDraft.mock.calls[0]![0].title).not.toBe('')
  })

  // สเปก §5.6 ข้อ 4 — error ต้องโผล่ที่ช่องที่ผิด
  it('publish ที่ล้มเพราะ action ไม่ครบ แสดง error ที่ช่องนั้น ไม่ใช่รวมบนหัวฟอร์ม', async () => {
    setup()
    chooseTemplate('RICH_MENU_TEMPLATE_105')
    fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
    await waitFor(() => expect(screen.getByTestId('area-error-0')).toBeInTheDocument())
  })

  // S2 (STANDING-CORRECTIONS.md) — testId ต้องอยู่บน <button> จริงของ port ไม่ใช่ <span> ข้างใน
  // มิฉะนั้น toBeDisabled() นี้จะผ่านลอย ๆ โดยไม่ได้พิสูจน์อะไรเลยว่าฟอร์มล็อกจริงระหว่างบันทึก
  it('ระหว่างบันทึก ปุ่มบันทึก/ยกเลิกถูกปิดไว้กันกดซ้ำ', async () => {
    let resolveSave: () => void = () => {}
    const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve }))
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <RichMenuEditor aliasOptions={[]} onSave={onSave} onCancel={vi.fn()} />
      </PortProvider>,
    )
    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)
    await waitFor(() => expect(screen.getAllByTestId('save-draft')[0]).toBeDisabled())
    expect(screen.getAllByTestId('save-publish')[0]).toBeDisabled()
    expect(screen.getAllByTestId('cancel')[0]).toBeDisabled()
    resolveSave()
    await waitFor(() => expect(screen.getAllByTestId('save-draft')[0]).not.toBeDisabled())
  })

  // setup() สร้าง toast fixture ไว้ตั้งแต่ต้นแต่ไม่มี test ไหนใช้เลย — catch ที่กลืน onSave ที่ reject
  // ใน save() (RichMenuEditor.tsx) จึงไม่เคยถูกทดสอบ: บันทึกที่ล้มเหลวหน้าตาเหมือนบันทึกสำเร็จทุกอย่าง
  it('onSave ล้มเหลว ผู้ใช้ต้องได้รับแจ้งผ่าน toast ไม่ใช่ดูเหมือนบันทึกสำเร็จ', async () => {
    const onSave = vi.fn(async () => { throw new Error('boom') })
    const { toast } = setup({ onSave })
    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ type: 'danger', message: 'editor.saveFailed' }))
  })

  it('ยกเลิกแล้วเรียก onCancel', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getAllByTestId('cancel')[0]!)
    expect(onCancel).toHaveBeenCalled()
  })

  it('เปิดของเดิมมาแก้ได้ครบทุกค่า', () => {
    const initial = {
      ...emptyDraft(),
      title: 'เมนูเดิม',
      chatBar: { mode: 'custom' as const, text: 'ร้านค้า', selected: false },
    }
    setup({ initial })
    expect(screen.getByLabelText('editor.title')).toHaveValue('เมนูเดิม')
    expect(screen.getByLabelText('chatBar.text')).toHaveValue('ร้านค้า')
    expect(screen.getByLabelText('chatBar.behavior.collapsed')).toBeChecked()
  })

  // A1 — applyTemplate เปลี่ยน bounds/areas/sizeName ทุกครั้งแต่ไม่เคยแตะ draft.image เลย
  // ถ้าขนาดผืนผ้าใบเปลี่ยน (large ↔ compact) รูปเดิมค้างอยู่กับ canvas ใหม่ที่ไม่พอดี (สเปก §5.6.3)
  describe('เปลี่ยน template แล้วรูปเดิมที่อัปโหลดไว้', () => {
    function initialWithImage(templateKey: string): RichMenuDraft {
      const template = TEMPLATES[templateKey]!
      return {
        ...emptyDraft(),
        templateKey,
        sizeName: template.sizeName,
        bounds: [...template.bounds],
        areas: template.bounds.map(() => emptyActionForm()),
        image: { id: 1, url: '/uploads/a.png', width: template.size.width, height: template.size.height },
      }
    }

    it('ขนาดผืนผ้าใบเท่าเดิม (large → large อีกแบบ) — รูปเดิมยังอยู่ ไม่ต้องถาม', () => {
      setup({ initial: initialWithImage('RICH_MENU_TEMPLATE_207') })
      expect(screen.getByTestId('image-remove')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('open-template-picker'))
      fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_201'))
      fireEvent.click(screen.getByTestId('template-apply'))
      expect(screen.queryByTestId('template-confirm')).not.toBeInTheDocument()
      expect(screen.getByTestId('image-remove')).toBeInTheDocument()
    })

    it('ขนาดผืนผ้าใบเปลี่ยน (large → compact) — ต้องถามก่อน แล้วทิ้งรูปเดิม', () => {
      setup({ initial: initialWithImage('RICH_MENU_TEMPLATE_207') })
      fireEvent.click(screen.getByTestId('open-template-picker'))
      fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_101'))
      fireEvent.click(screen.getByTestId('template-apply'))
      expect(screen.getByTestId('template-confirm')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('template-confirm'))
      expect(screen.queryByTestId('image-remove')).not.toBeInTheDocument()
    })

    /**
     * Task 20 item 8 (ui-core M1) — repro ตรงจากรีวิว: เดิม `applyTemplate` อ่าน `prevSize` จาก
     * `prev.templateKey` ซึ่งโหมดปรับผังเอง (`moveBounds`) เคลียร์เป็น `null` ทันทีที่ผู้ใช้ขยับ
     * ช่องแรก ทั้งที่ผืนผ้าใบยังเป็นขนาดเดิม (large) — `canvasSizeChanged(null, x)` ตอบ `true`
     * เสมอ (templates.ts) เคสนี้ก่อนแก้จะแสดงคำเตือน "รูปจะถูกทิ้ง" และทิ้งรูปจริงทั้งที่ขนาด
     * ผืนผ้าใบไม่ได้เปลี่ยนเลย — ทดสอบผ่าน RichMenuEditor เต็มตัว ไม่ใช่แค่ TemplatePicker เดี่ยว ๆ
     * เพื่อพิสูจน์ว่า "สายไฟ" จาก moveBounds ไปถึง applyTemplate/TemplatePicker จริง ไม่ใช่แค่
     * ตรรกะของแต่ละไฟล์แยกกันถูกต้อง
     */
    it('ปรับผังเองแล้ว (templateKey ถูกเคลียร์ แต่ขนาดผืนผ้าใบเดิม) เลือก template ขนาดเดิม — รูปเดิมยังอยู่ ไม่ต้องถาม', () => {
      setup({ initial: initialWithImage('RICH_MENU_TEMPLATE_207') })
      expect(screen.getByTestId('image-remove')).toBeInTheDocument()

      fireEvent.click(screen.getByLabelText('editor.layout.custom'))
      const area = within(screen.getByTestId('preview-menu')).getByRole('button', { name: /^A$/ })
      fireEvent.pointerDown(area, { clientX: 0, clientY: 0, pointerId: 1 })
      fireEvent.pointerMove(area, { clientX: 10, clientY: 0, pointerId: 1 })
      fireEvent.pointerUp(area, { pointerId: 1 })

      // RICH_MENU_TEMPLATE_201 เป็น large เหมือนกับ 207 เป๊ะ — ขนาดผืนผ้าใบไม่ได้เปลี่ยนจริง
      fireEvent.click(screen.getByTestId('open-template-picker'))
      fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_201'))
      fireEvent.click(screen.getByTestId('template-apply'))
      expect(screen.queryByTestId('template-confirm')).not.toBeInTheDocument()
      expect(screen.getByTestId('image-remove')).toBeInTheDocument()
    })
  })
})

// สเปกงานนี้ #4 — ปุ่ม "Design guide" มุมขวาบนของ Menu content เปิด modal ที่บอกข้อกำหนดของรูปจริง
describe('Design guide modal', () => {
  it('ไม่อยู่บนจอจนกว่าจะกดเปิด อยู่มุมขวาบนของหัวข้อ Menu content', () => {
    setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('open-design-guide'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('บอกรูปแบบไฟล์ที่ inspectImage() ยอมรับจริง (jpeg/png) ไม่ใช่แค่พิมพ์ตามสเปก', () => {
    setup()
    fireEvent.click(screen.getByTestId('open-design-guide'))
    expect(screen.getByText('editor.designGuide.formats')).toBeInTheDocument()
  })

  // ตัวเลขหกขนาดต้องมาจาก SIZE_LADDER ของ core ตรง ๆ ไม่ใช่พิมพ์ซ้ำ — เทสต์นี้เทียบกับค่าที่คำนวณ
  // จาก SIZE_LADDER เอง ถ้า ladder เปลี่ยนแล้วโค้ดยังพิมพ์ตัวเลขเก่าค้างไว้ เทสต์นี้ต้องแดง
  it('บอกทั้งหกขนาดผืนผ้าใบจาก SIZE_LADDER ของ core ตรง ๆ', () => {
    setup()
    fireEvent.click(screen.getByTestId('open-design-guide'))
    const dialog = screen.getByRole('dialog')
    const largeSizes = SIZE_LADDER.large.map((s) => `${s.width}×${s.height}`).join(' · ')
    const compactSizes = SIZE_LADDER.compact.map((s) => `${s.width}×${s.height}`).join(' · ')
    expect(within(dialog).getByText(new RegExp(largeSizes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
    expect(within(dialog).getByText(new RegExp(compactSizes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('บอกว่ามีเพดาน 1 MB แต่ resize ลดขั้นให้อัตโนมัติแทนการปฏิเสธไฟล์', () => {
    setup()
    fireEvent.click(screen.getByTestId('open-design-guide'))
    expect(screen.getByText('editor.designGuide.autoResize')).toBeInTheDocument()
  })

  it('บอกว่าตำแหน่งช่องที่แตะได้มาจาก template', () => {
    setup()
    fireEvent.click(screen.getByTestId('open-design-guide'))
    expect(screen.getByText('editor.designGuide.areasNote')).toBeInTheDocument()
  })

  // สเปกงานนี้ #8 — ลิงก์ไปหาไฟล์ที่ LINE โฮสต์เอง (ไม่ใช่ไฟล์ที่เราแจกต่อ) เปิดแท็บใหม่ปลอดภัย
  it('ปุ่มดาวน์โหลดลิงก์ไปที่ไฟล์ของ LINE เอง เปิดแท็บใหม่ ปลอดภัยจาก reverse tabnabbing', () => {
    setup()
    fireEvent.click(screen.getByTestId('open-design-guide'))
    const link = screen.getByTestId('design-guide-download')
    expect(link).toHaveAttribute(
      'href',
      'https://static.line-scdn.net/biz-app/16bd9ea9e03/manager/static/LINE_rich_menu_design_template.zip',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noreferrer')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('ปิดได้ด้วยปุ่ม Close', () => {
    setup()
    fireEvent.click(screen.getByTestId('open-design-guide'))
    fireEvent.click(screen.getByTestId('design-guide-close'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('custom layout (สเปก §5.2 · §17 "ขอบเขต v1.0 — จัดเต็ม")', () => {
  const enableCustomLayout = () => {
    fireEvent.click(screen.getByLabelText('editor.layout.custom'))
  }

  /**
   * เพียงพอที่จะยิง `moveBounds` (ซึ่งเคลียร์ templateKey ทิ้งเสมอไม่ว่าค่าจะเปลี่ยนจริงหรือไม่)
   * ไม่จำเป็นต้องให้ตำแหน่งขยับจริง — เทสต์กลุ่ม fix round 1 ด้านล่างสนใจแค่ผลข้างเคียงที่ว่า
   * templateKey กลายเป็น null ไม่ได้สนใจว่าช่อง A ขยับไปกี่ % (ดูเทสต์ pointer drag ด้านบนที่คุม
   * เรื่องขยับจริงไปแล้ว)
   */
  const dragAreaA = () => {
    const area = within(screen.getByTestId('preview-menu')).getByRole('button', { name: /^A$/ })
    fireEvent.pointerDown(area, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(area, { clientX: 10, clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
  }

  /** เติม action.field.text ให้ทุกช่องที่ template 205 ให้มา (2 ช่อง) — `type: 'message'` ที่
   * emptyActionForm() ตั้งไว้ต้องการ text อย่างน้อย 1 ตัวอักษร ไม่งั้น validateRichMenu ติด error
   * รายช่องก่อนจะไปถึง guard ที่กลุ่มเทสต์นี้ต้องการพิสูจน์จริง ๆ */
  const fillAllActions = () => {
    for (const index of [0, 1]) {
      fireEvent.click(screen.getByTestId(`area-header-${index}`))
      fireEvent.change(
        within(screen.getByTestId(`area-body-${index}`)).getByLabelText('action.field.text'),
        { target: { value: 'ปุ่ม' } },
      )
    }
  }

  /**
   * `CanvasEditor` ตัดสินว่าตัวเองแก้ไขได้หรือไม่จากการมีอยู่ของ `onBoundsChange` และวาดมือจับ
   * เฉพาะตอนแก้ไขได้ (ดู canvas-editor-drag.test.tsx) — การมี/ไม่มี `resize-handle-*` จึงเป็น
   * ตัวชี้ที่ตรงที่สุดว่าพร็อพเดินทางผ่าน `Preview` ไปถึงจริงหรือไม่
   *
   * ก่อน Plan 04 ไม่มีจุดเรียกไหนส่งมันมาเลย ทั้งความสามารถลาก/ปรับขนาดจึงถูกทดสอบไว้แต่
   * ไม่มีทางถูกใช้จากหน้าจอจริงแม้แต่ครั้งเดียว
   */
  it('สวิตช์ปิดอยู่ตอนเริ่ม — ผังสำเร็จรูปแก้ไม่ได้', () => {
    setup()
    chooseTemplate()
    expect(screen.queryAllByTestId(/^resize-handle-/)).toHaveLength(0)
  })

  it('เปิดสวิตช์แล้วมือจับโผล่ครบทุกช่อง', () => {
    setup()
    chooseTemplate()
    const areas = screen.getAllByTestId(/^area-header-/).length
    enableCustomLayout()
    expect(screen.getAllByTestId(/^resize-handle-/)).toHaveLength(areas)
  })

  /**
   * `CanvasEditor` ไม่มีการลากด้วยคีย์บอร์ด (`handleKeyDown` รับแค่ Enter/Space สำหรับ select เท่านั้น
   * ดู canvas-editor-drag.test.tsx ที่ทดสอบเฉพาะ pointer event) และ template 205 ที่ใช้เป็นค่าเริ่มต้น
   * ของ `chooseTemplate()` ให้ช่อง A กว้างเท่าผืนผ้าใบพอดี (2500/2500) ทำให้ขยับแนวนอนไม่ได้เลยไม่ว่า
   * จะลากด้วยกลไกไหน (`clampToCanvas` บังคับ x ให้เป็น 0 เสมอเมื่อ width == canvas width) — เทสต์นี้
   * จึงลาก A ด้วย pointer (กลไกที่ต่อสายจริงและถูกทดสอบไว้แล้ว) บน template 206 ที่ A กว้างครึ่งเดียว
   */
  it('ลากด้วย pointer แล้วช่องขยับจริง — ค่าไปถึง draft ไม่ใช่แค่ state ภายใน canvas', () => {
    setup()
    chooseTemplate('RICH_MENU_TEMPLATE_206')
    enableCustomLayout()
    // ต้อง scope ที่ `preview-menu` — ชื่อ "A" มีสองที่: ช่องบนผืนผ้าใบ กับหัว accordion ใน AreaList
    const area = within(screen.getByTestId('preview-menu')).getByRole('button', { name: /^A$/ })
    expect(area.style.left).toBe('0%')
    fireEvent.pointerDown(area, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(area, { clientX: 50, clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
    // `Preview` เป็น controlled — ถ้า bounds ไม่ถูกเขียนกลับลง draft ช่องจะเด้งกลับที่เดิมทันที
    expect(within(screen.getByTestId('preview-menu')).getByRole('button', { name: /^A$/ }).style.left)
      .not.toBe('0%')
  })

  it('เพิ่มช่องได้จนถึง 20 แล้วปุ่มถูกปิด — เพดานของ LINE เอง (สเปก §2.2)', () => {
    setup()
    chooseTemplate()
    enableCustomLayout()

    const before = screen.getAllByTestId(/^area-header-/).length
    fireEvent.click(screen.getByTestId('area-add'))
    expect(screen.getAllByTestId(/^area-header-/)).toHaveLength(before + 1)

    while (screen.getAllByTestId(/^area-header-/).length < 20) {
      fireEvent.click(screen.getByTestId('area-add'))
    }
    expect(screen.getAllByTestId(/^area-header-/)).toHaveLength(20)
    expect(screen.getByTestId('area-add')).toBeDisabled()
  })

  // เหลือศูนย์ช่องแล้ว payload จะถูก LINE ปฏิเสธด้วย "1–20 ช่อง" โดยที่ผู้ใช้ไม่รู้ว่าทำอะไรผิด
  it('ลบช่องได้ แต่ลบช่องสุดท้ายไม่ได้', () => {
    setup()
    chooseTemplate()
    enableCustomLayout()

    while (screen.getAllByTestId(/^area-header-/).length > 1) {
      fireEvent.click(screen.getAllByTestId(/^area-remove-/)[0]!)
    }
    expect(screen.getAllByTestId(/^area-header-/)).toHaveLength(1)
    expect(screen.getByTestId('area-remove-0')).toBeDisabled()
  })

  it('ลบช่องแล้ว action ของช่องที่เหลือไม่เลื่อนตำแหน่ง', () => {
    setup()
    chooseTemplate()
    enableCustomLayout()

    fireEvent.click(screen.getByTestId('area-header-1'))
    fireEvent.change(within(screen.getByTestId('area-body-1')).getByLabelText('action.field.label'), {
      target: { value: 'ช่องที่สอง' },
    })
    fireEvent.click(screen.getByTestId('area-remove-0'))
    fireEvent.click(screen.getByTestId('area-header-0'))
    expect(within(screen.getByTestId('area-body-0')).getByLabelText('action.field.label'))
      .toHaveValue('ช่องที่สอง')
  })

  it('ปุ่มเพิ่ม/ลบไม่โผล่เลยเมื่อสวิตช์ปิดอยู่', () => {
    setup()
    chooseTemplate()
    expect(screen.queryByTestId('area-add')).toBeNull()
    expect(screen.queryByTestId('area-remove-0')).toBeNull()
  })

  /**
   * ผังที่ถูกปรับเองแล้วไม่ตรงกับ template ที่เลือกไว้อีกต่อไป การเก็บชื่อ template ไว้จะทำให้
   * ตอนเปิดกลับมาแก้ ผู้ใช้เห็นชื่อ template ที่ไม่ตรงกับสิ่งที่อยู่บนผืนผ้าใบ แล้วอาจกดใช้ซ้ำ
   * โดยไม่รู้ว่ามันจะทับผังที่ตัวเองปรับไว้ทั้งหมด
   */
  it('เพิ่มช่องแล้ว templateKey ถูกล้าง — ผังไม่ใช่ของ template นั้นอีกแล้ว', async () => {
    const { onSave } = setup()
    chooseTemplate()
    enableCustomLayout()
    fireEvent.click(screen.getByTestId('area-add'))
    // testId ของปุ่มบันทึกร่างคือ `save-draft` (มีสองปุ่มบนจอ บนหัวและท้ายฟอร์ม — ดู
    // 'มีปุ่มบันทึกทั้งบนหัวและท้ายฟอร์ม' ด้านบนในไฟล์นี้) กดปุ่มแรกก็พอ
    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect((onSave.mock.calls[0]![0] as RichMenuDraft).templateKey).toBeNull()
  })

  describe('fix round 1 — templateKey เป็น null ต้องไม่ปิดทางไป publish', () => {
    /**
     * เดิม RichMenuEditor.tsx:185 เช็ค `draft.templateKey === null` ก่อน publish — ลากช่องเดียว
     * ทำให้ templateKey เป็น null (moveBounds/addArea/removeArea เคลียร์มันทิ้งเสมอ) แล้ว publish
     * จะติด "เลือก template ก่อนเผยแพร่" ตลอดไป ทั้งที่ผังมีจริงและถูกต้องสมบูรณ์ — ทางแก้เดียวที่
     * ข้อความนั้นชี้ให้ทำ (เปิด picker แล้วเลือก template) จะทับผังที่เพิ่งปรับเองทิ้งทั้งหมดด้วยซ้ำ
     */
    it('เปิดสวิตช์ปรับผังเอง ลากช่อง แนบรูป แล้ว publish ได้จริง — ไม่ติด "เลือก template ก่อน"', async () => {
      stubImageSize(2500, 1686)
      const post = vi.fn(async () => [{ id: 1, url: '/uploads/a.png', width: 2500, height: 1686 }])
      const t = (key: string) => (key === 'chatBar.defaultLabel' ? 'เมนู' : key)
      const { onSave } = setup({}, {
        t,
        http: { ...createStubPort().http, post: post as unknown as HttpClient['post'] },
      })
      chooseTemplate()
      enableCustomLayout()
      dragAreaA()
      fillAllActions()

      fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
      await waitFor(() => expect(screen.getByTestId('image-remove')).toBeInTheDocument())

      fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
      await waitFor(() => expect(onSave).toHaveBeenCalled())
      expect(onSave.mock.calls[0]![1]).toBe(true)
      expect((onSave.mock.calls[0]![0] as RichMenuDraft).templateKey).toBeNull()
      expect(screen.queryByText('editor.error.noTemplate')).not.toBeInTheDocument()
    })

    // เดิม RichMenuEditor.tsx:339 ปิด ImageField ด้วย `draft.templateKey === null` เหมือนกัน —
    // ลากช่องเดียวก็ปิดปุ่มอัปโหลดรูปทันที ทั้งที่ผู้ใช้กำลังแก้ผังอยู่และยังไม่มีรูปเลย
    it('ลากช่องแล้วช่องอัปโหลดรูปยังกดได้ ไม่ถูกปิดเพราะ templateKey เป็น null', () => {
      setup()
      chooseTemplate()
      enableCustomLayout()
      dragAreaA()
      expect(screen.getByTestId('image-input')).not.toBeDisabled()
    })

    // เพิ่มช่องแล้วลบช่อง (คนละปุ่มจาก dragAreaA แต่เคลียร์ templateKey ด้วยเหตุผลเดียวกัน) — ต้อง
    // publish ได้เหมือนกัน ไม่ใช่แค่ตัวลากที่ถูกทดสอบไปแล้วด้านบน
    it('เพิ่มช่องแล้วลบช่อง ก็ publish ได้จริงเหมือนกัน — templateKey เป็น null จากปุ่มไหนก็ตาม', async () => {
      stubImageSize(2500, 1686)
      const post = vi.fn(async () => [{ id: 1, url: '/uploads/a.png', width: 2500, height: 1686 }])
      const t = (key: string) => (key === 'chatBar.defaultLabel' ? 'เมนู' : key)
      const { onSave } = setup({}, {
        t,
        http: { ...createStubPort().http, post: post as unknown as HttpClient['post'] },
      })
      chooseTemplate()
      enableCustomLayout()
      fireEvent.click(screen.getByTestId('area-add'))
      fireEvent.click(screen.getByTestId('area-remove-2'))
      fillAllActions()

      fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
      await waitFor(() => expect(screen.getByTestId('image-remove')).toBeInTheDocument())

      fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
      await waitFor(() => expect(onSave).toHaveBeenCalled())
      expect(onSave.mock.calls[0]![1]).toBe(true)
      expect((onSave.mock.calls[0]![0] as RichMenuDraft).templateKey).toBeNull()
      expect(screen.queryByText('editor.error.noTemplate')).not.toBeInTheDocument()
    })
  })
})
