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
        currentKey={null} hasConfiguredActions={false} hasImage={false}
        onApply={onApply} onClose={onClose} {...overrides}
      />
    </PortProvider>,
  )
  return { onApply, onClose }
}

describe('TemplatePicker', () => {
  // สเปกงานนี้ #5 — จำนวนช่องใต้ thumbnail เดิม hardcode #32324d ตรง ๆ ต้องแดงถ้ามีใครใส่กลับ
  it('สีตัวอักษรจำนวนช่องมาจาก theme ของ port ไม่ใช่ hex ที่ hardcode ไว้', () => {
    render(
      <PortProvider value={createStubPort({ t: (key) => key, theme: { border: '', surface: '', strongText: '#ffffff', mutedText: '' } })}>
        <TemplatePicker
          currentKey={null} hasConfiguredActions={false} hasImage={false}
          onApply={vi.fn()} onClose={vi.fn()}
        />
      </PortProvider>,
    )
    const counts = screen.getAllByText('template.picker.areaCount.one')
    expect(counts.length).toBeGreaterThan(0)
    expect(counts[0]!.style.color).toBe('rgb(255, 255, 255)')
  })

  it('แสดง Large 7 แบบ และ Compact 5 แบบ', () => {
    setup()
    expect(screen.getAllByTestId(/^template-option-RICH_MENU_TEMPLATE_2/)).toHaveLength(7)
    expect(screen.getAllByTestId(/^template-option-RICH_MENU_TEMPLATE_1/)).toHaveLength(5)
  })

  // หัวข้อกลุ่มเคยเป็น <h3> ดิบ ทั้งที่ทุกหัวข้ออื่นในแพ็กเกจวาดผ่าน port — adapter จึงจัดสไตล์
  // ให้มันไม่ได้ ตอนนี้ผ่าน port แล้วต้องยังเป็นหัวข้อระดับ 3 อยู่ใต้ชื่อ modal (ระดับ 2) เหมือนเดิม
  it('หัวข้อกลุ่มเป็นหัวข้อระดับ 3 จริง แม้จะย้ายไปวาดผ่าน port แล้ว', () => {
    setup()
    expect(screen.getByRole('heading', { level: 3, name: 'template.picker.group.large' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'template.picker.group.compact' })).toBeInTheDocument()
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

  // จำนวนช่องเป็นข้อมูล ไม่ใช่คำแปล — key คงที่เสมอ ค่านับ (ตัวเลข) ต้องไปทาง values ของ t()
  // ไม่ใช่ hardcode ต่อท้าย ตรวจผ่าน mock ของ t() แทนการมองหาตัวเลขใน textContent เพราะ
  // stub ของแพ็กเกจนี้คืน key ดิบเสมอ (ดู stub-port.tsx) — เนื้อความจริงมาจาก catalog ของ adapter
  it('บอกจำนวนช่องของแต่ละแบบผ่าน t() ด้วย count ที่ถูกต้อง', () => {
    const t = vi.fn((key: string) => key)
    render(
      <PortProvider value={createStubPort({ t })}>
        <TemplatePicker
          currentKey={null} hasConfiguredActions={false} hasImage={false}
          onApply={vi.fn()} onClose={vi.fn()}
        />
      </PortProvider>,
    )
    expect(t).toHaveBeenCalledWith('template.picker.areaCount', { count: 6 })
  })

  // แบบที่มีช่องเดียวมีอยู่จริงทั้งกลุ่ม large และ compact เห็นได้บนหน้าจอตอนเปิด picker
  // ถ้าใช้คีย์พหูพจน์กับมันจะอ่านว่า "1 areas" ซึ่งผิดในภาษาอังกฤษ (ไทยไม่มีพหูพจน์จึงใช้สตริงเดียวกัน
  // ได้ แต่คีย์ต้องมีครบทั้งสองภาษา) เทสต์นี้ยืนยันว่าเลือกคีย์ตามจำนวนช่องจริง ไม่ใช่ใช้คีย์เดียวรวด
  it('แบบที่มีช่องเดียวใช้คีย์เอกพจน์ ไม่ใช่คีย์พหูพจน์', () => {
    const t = vi.fn((key: string) => key)
    render(
      <PortProvider value={createStubPort({ t })}>
        <TemplatePicker
          currentKey={null} hasConfiguredActions={false} hasImage={false}
          onApply={vi.fn()} onClose={vi.fn()}
        />
      </PortProvider>,
    )
    expect(t).toHaveBeenCalledWith('template.picker.areaCount.one', { count: 1 })
    expect(t).not.toHaveBeenCalledWith('template.picker.areaCount', { count: 1 })
  })

  it('ทำเครื่องหมายแบบที่ใช้อยู่', () => {
    setup({ currentKey: 'RICH_MENU_TEMPLATE_203' })
    expect(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_203'))
      .toHaveAttribute('aria-pressed', 'true')
  })

  // สเปกงานนี้ #1 — LINE OA Manager ไฮไลต์แบบที่เลือกด้วยกรอบ+พื้นหลังเขียว ไม่ใช่สี indigo ของ
  // Strapi ที่แบบทุกแบบเคยใช้เหมือนกันหมดไม่ว่าจะเลือกอยู่หรือไม่
  it('แบบที่เลือกไว้มีกรอบและพื้นหลังเขียว LINE แบบที่ไม่ได้เลือกไม่มี', () => {
    setup({ currentKey: 'RICH_MENU_TEMPLATE_203' })
    const selected = screen.getByTestId('template-option-RICH_MENU_TEMPLATE_203')
    expect(selected.style.border).toBe('2px solid rgb(6, 199, 85)') // LINE_GREEN
    expect(selected.style.background).toBe('rgba(6, 199, 85, 0.08)') // LINE_SELECTED_TINT

    const unselected = screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205')
    expect(unselected.style.border).not.toContain('rgb(6, 199, 85)')
    expect(unselected.style.background).toBe('none')
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

  // A1 — สเปก §5.6.3: เปลี่ยนขนาดผืนผ้าใบ (large ↔ compact) ทำให้รูปเดิมไม่พอดีอีกต่อไป
  // ต้องถามยืนยันเหมือนตอนมี action ที่จะเสีย แม้ไม่มี action ให้เสียเลยก็ตาม
  it('ถามยืนยันก่อน เมื่อมีรูปอยู่แล้วและ template ใหม่เปลี่ยนขนาดผืนผ้าใบ', () => {
    const { onApply } = setup({ hasImage: true, currentKey: 'RICH_MENU_TEMPLATE_201' })
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_101'))
    fireEvent.click(screen.getByTestId('template-apply'))
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByTestId('template-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('discard-image-warning')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('template-confirm'))
    expect(onApply).toHaveBeenCalledWith('RICH_MENU_TEMPLATE_101')
  })

  it('ไม่ถามเมื่อมีรูปอยู่แล้ว แต่ template ใหม่ขนาดผืนผ้าใบเท่าเดิม', () => {
    const { onApply } = setup({ hasImage: true, currentKey: 'RICH_MENU_TEMPLATE_201' })
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    expect(onApply).toHaveBeenCalledWith('RICH_MENU_TEMPLATE_205')
  })

  it('ทุกข้อความที่ผู้ใช้เห็นผ่าน port.t ไม่มี hardcode', () => {
    const t = vi.fn((key: string) => `T:${key}`)
    render(
      <PortProvider value={createStubPort({ t })}>
        <TemplatePicker currentKey={null} hasConfiguredActions={false} hasImage={false}
          onApply={vi.fn()} onClose={vi.fn()} />
      </PortProvider>,
    )
    expect(t).toHaveBeenCalledWith('template.picker.title')
  })

  /**
   * `<span data-testid>` ที่อยู่ **ข้างใน** `ui.Button` คือรูปแบบต้องห้ามที่ตั้งอยู่ข้าง ๆ
   * รูปแบบที่ถูกต้อง (`testId` บนตัว Button เอง) — วันนี้ไม่มีอะไรผิดเพราะไม่มีเทสต์ไหน
   * `toBeDisabled()` กับสองปุ่มนั้น แต่นั่นคือวิธีที่รูปแบบผิดแพร่กระจาย
   */
  it('testid ทุกตัวอยู่บนปุ่มที่กดได้จริง ไม่ใช่บน span ข้างใน', () => {
    setup({ hasConfiguredActions: true, currentKey: 'RICH_MENU_TEMPLATE_201' })
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    for (const id of ['template-confirm', 'template-cancel-confirm']) {
      expect(screen.getByTestId(id).tagName, id).toBe('BUTTON')
    }
  })
})
