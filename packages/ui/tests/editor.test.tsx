import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TEMPLATES } from '@fosivo/line-rich-menu-core/browser'
import { describe, expect, it, vi } from 'vitest'
import { emptyActionForm } from '../src/action-form.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { RichMenuEditor, emptyDraft, type RichMenuDraft } from '../src/pages/RichMenuEditor.js'

function setup(overrides: Partial<React.ComponentProps<typeof RichMenuEditor>> = {}) {
  const onSave = vi.fn(async () => {})
  const onCancel = vi.fn()
  const toast = vi.fn()
  render(
    <PortProvider value={createStubPort({ t: (k) => k, toast })}>
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

  // ปุ่ม Save draft มีสองชุด (หัว/ท้ายฟอร์ม) จาก testid เดียวกัน — ไล่ทั้งคู่เพื่อพิสูจน์ว่าทั้งสองชุด
  // บันทึกร่างเหมือนกันจริง ไม่ใช่แค่ชุดที่ทดสอบไว้
  //
  // A6 — เดิม assert ด้วย expect.anything() ซึ่งผ่านได้กับค่าอะไรก็ตามที่ไม่ใช่ null/undefined จึงไม่ได้
  // พิสูจน์อะไรเลยว่า draft ที่ onSave ได้รับหน้าตาเป็นอย่างไร — เทียบกับ emptyDraft() ทั้งก้อนแทน
  it('บันทึกร่างได้แม้ยังกรอกไม่ครบ — ร่างคือร่าง ไม่ว่าจะกดปุ่มหัวหรือท้ายฟอร์ม', async () => {
    const { onSave } = setup()
    for (const button of screen.getAllByTestId('save-draft')) {
      onSave.mockClear()
      fireEvent.click(button)
      await waitFor(() => expect(onSave).toHaveBeenCalledWith(emptyDraft(), false))
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
  it('publish โดยยังไม่มี template ไม่ได้ และบอกว่าติดตรงไหน ไม่ว่าจะกดปุ่มหัวหรือท้ายฟอร์ม', async () => {
    const { onSave } = setup()
    for (const button of screen.getAllByTestId('save-publish')) {
      fireEvent.click(button)
      await waitFor(() => expect(screen.getByText('editor.error.noTemplate')).toBeInTheDocument())
    }
    expect(onSave).not.toHaveBeenCalled()
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

  // A3 — MainSettings รับ prop errors มาตั้งแต่ fix round ของ Task 9 แต่ RichMenuEditor ไม่เคยส่งอะไร
  // เข้าไปเลย issue ที่ไม่ใช่ของช่อง (เช่น path "name") จึงตกไปอยู่ที่แบนเนอร์รวมแทนที่จะขึ้นที่ช่องชื่อ
  //
  // t('editor.untitled') ถูกบังคับให้คืนค่าว่างเปล่าเพื่อให้ name ผิด schema (min 1) จริง — ปกติ title
  // ว่างจะถูกแทนด้วยคำนี้เสมอ ทำให้ name ไม่มีทางว่างได้ผ่านโค้ดจริง (จงใจ ไม่ใช่บั๊ก) จึงต้องปลอมจุดนี้
  // เพื่อพิสูจน์ทางเดินของ error แม้ path นี้แทบไม่มีทางเกิดจากการกรอกฟอร์มปกติ
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
  })
})
