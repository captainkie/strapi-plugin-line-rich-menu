import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { RichMenuEditor, emptyDraft } from '../src/pages/RichMenuEditor.js'

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

  it('ปุ่มเปลี่ยน template เปลี่ยนคำจาก Select เป็น Change เมื่อเลือกแล้ว', () => {
    setup()
    expect(screen.getByTestId('open-template-picker').textContent).toContain('common.select')
    chooseTemplate()
    expect(screen.getByTestId('open-template-picker').textContent).toContain('common.change')
  })

  it('เลือกช่องบน canvas แล้ว accordion ของช่องนั้นกางออก', () => {
    setup()
    chooseTemplate()
    fireEvent.click(screen.getAllByRole('button', { name: /^B/ })[0]!)
    expect(screen.getByTestId('area-body-1')).toBeInTheDocument()
  })

  it('สลับ outline ได้', () => {
    setup()
    chooseTemplate()
    expect(screen.getAllByText(/×/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('editor.showOutlines'))
    expect(screen.queryByText('2500×843')).not.toBeInTheDocument()
  })

  it('แถบแชทใน preview อัปเดตตามที่พิมพ์ทันที', () => {
    setup()
    fireEvent.click(screen.getByLabelText('chatBar.mode.custom'))
    fireEvent.change(screen.getByLabelText('chatBar.text'), { target: { value: 'ทดสอบ' } })
    expect(screen.getByTestId('preview-chat-bar').textContent).toContain('ทดสอบ')
  })

  it('บันทึกร่างได้แม้ยังกรอกไม่ครบ — ร่างคือร่าง', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.anything(), false))
  })

  // S1 (STANDING-CORRECTIONS.md) — stub-port's Alert renders role="status", not role="alert".
  // Assert the translation key the code actually passes to t() instead.
  it('publish โดยยังไม่มี template ไม่ได้ และบอกว่าติดตรงไหน', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
    await waitFor(() => expect(screen.getByText('editor.error.noTemplate')).toBeInTheDocument())
    expect(onSave).not.toHaveBeenCalled()
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
})
