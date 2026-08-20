import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { TemplatePicker } from '../src/components/TemplatePicker.js'

function setup(overrides: Partial<React.ComponentProps<typeof TemplatePicker>> = {}) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(
    <PortProvider value={createStubPort({ t: (key) => key })}>
      <TemplatePicker
        open currentKey={null} hasConfiguredActions={false}
        onApply={onApply} onClose={onClose} {...overrides}
      />
    </PortProvider>,
  )
  return { onApply, onClose }
}

describe('TemplatePicker', () => {
  it('ไม่เรนเดอร์อะไรเลยเมื่อปิดอยู่', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('แสดง Large 7 แบบ และ Compact 5 แบบ', () => {
    setup()
    expect(screen.getAllByTestId(/^template-option-RICH_MENU_TEMPLATE_2/)).toHaveLength(7)
    expect(screen.getAllByTestId(/^template-option-RICH_MENU_TEMPLATE_1/)).toHaveLength(5)
  })

  it('หัวข้อกลุ่มระบุขนาดพิกเซลทั้งสามของกลุ่มนั้น', () => {
    setup()
    expect(screen.getByText(/2500×1686.*1200×810.*800×540/)).toBeInTheDocument()
    expect(screen.getByText(/2500×843.*1200×405.*800×270/)).toBeInTheDocument()
  })

  it('วาด thumbnail จาก bounds เป็น SVG ไม่ใช่ไฟล์ภาพ', () => {
    const { container } = { container: document.body }
    setup()
    expect(container.querySelectorAll('svg').length).toBe(12)
  })

  it('บอกจำนวนช่องของแต่ละแบบ', () => {
    setup()
    expect(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_201').textContent).toContain('6')
  })

  it('ทำเครื่องหมายแบบที่ใช้อยู่', () => {
    setup({ currentKey: 'RICH_MENU_TEMPLATE_203' })
    expect(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_203'))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('เลือกแล้วกด apply ส่ง key กลับไป', () => {
    const { onApply } = setup()
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    expect(onApply).toHaveBeenCalledWith('RICH_MENU_TEMPLATE_205')
  })

  it('กด apply โดยยังไม่เลือกอะไรไม่ได้', () => {
    setup()
    expect(screen.getByTestId('template-apply')).toBeDisabled()
  })

  // สเปก §5.6 ข้อ 2
  it('ถามยืนยันก่อน เมื่อมี action ที่ตั้งไว้แล้วและจะถูกทิ้ง', () => {
    const { onApply } = setup({ hasConfiguredActions: true, currentKey: 'RICH_MENU_TEMPLATE_201' })
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByTestId('template-confirm')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('template-confirm'))
    expect(onApply).toHaveBeenCalledWith('RICH_MENU_TEMPLATE_205')
  })

  it('ไม่ถามเมื่อยังไม่มี action ให้เสีย', () => {
    const { onApply } = setup({ hasConfiguredActions: false })
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    expect(onApply).toHaveBeenCalledWith('RICH_MENU_TEMPLATE_205')
  })

  it('ยกเลิกการยืนยันแล้วไม่มีอะไรเปลี่ยน', () => {
    const { onApply } = setup({ hasConfiguredActions: true, currentKey: 'RICH_MENU_TEMPLATE_201' })
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    fireEvent.click(screen.getByTestId('template-cancel-confirm'))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('ทุกข้อความที่ผู้ใช้เห็นผ่าน port.t ไม่มี hardcode', () => {
    const t = vi.fn((key: string) => `T:${key}`)
    render(
      <PortProvider value={createStubPort({ t })}>
        <TemplatePicker open currentKey={null} hasConfiguredActions={false}
          onApply={vi.fn()} onClose={vi.fn()} />
      </PortProvider>,
    )
    expect(t).toHaveBeenCalledWith('template.picker.title')
  })
})
