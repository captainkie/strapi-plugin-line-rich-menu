import { fireEvent, render, screen } from '@testing-library/react'
import { TEMPLATES } from '@fosivo/line-rich-menu-core/browser'
import { describe, expect, it, vi } from 'vitest'
import { CanvasEditor } from '../src/components/CanvasEditor.js'

const template = TEMPLATES['RICH_MENU_TEMPLATE_201']!

function setup(overrides: Partial<React.ComponentProps<typeof CanvasEditor>> = {}) {
  const onSelect = vi.fn()
  render(
    <CanvasEditor
      size={template.size}
      bounds={template.bounds}
      showOutlines
      activeIndex={null}
      onSelect={onSelect}
      {...overrides}
    />,
  )
  return { onSelect }
}

describe('CanvasEditor', () => {
  it('วาดช่องครบตามจำนวน bounds', () => {
    setup()
    expect(screen.getAllByRole('button')).toHaveLength(template.bounds.length)
  })

  it('วางแต่ละช่องเป็นเปอร์เซ็นต์ของผืนผ้าใบ ไม่ใช่พิกเซลตายตัว', () => {
    setup()
    const first = screen.getAllByRole('button')[0]!
    // 833/2500 = 33.32%
    expect(first.style.width).toBe('33.32%')
    expect(first.style.left).toBe('0%')
  })

  it('เขียนขนาดพิกเซลจริงกำกับไว้เมื่อเปิด outline — คนเอาไปทำอาร์ตเวิร์กให้ตรงได้', () => {
    setup()
    expect(screen.getAllByText('833×843').length).toBeGreaterThan(0)
  })

  it('ซ่อนกรอบและตัวเลขเมื่อปิด outline', () => {
    setup({ showOutlines: false })
    expect(screen.queryByText('833×843')).not.toBeInTheDocument()
  })

  it('ติดป้าย A B C ตามลำดับช่อง', () => {
    setup()
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${letter}\\b`) })).toBeInTheDocument()
    }
  })

  it('คลิกช่องแล้วแจ้ง index กลับไป', () => {
    const { onSelect } = setup()
    fireEvent.click(screen.getAllByRole('button')[2]!)
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  // สเปก §5.6 ข้อ 1 — editor ต้องใช้ด้วยคีย์บอร์ดได้
  it.each([['Enter'], [' ']])('เลือกช่องด้วยปุ่ม %s ได้', (key) => {
    const { onSelect } = setup()
    fireEvent.keyDown(screen.getAllByRole('button')[1]!, { key })
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('ทุกช่องรับโฟกัสได้ตามลำดับ', () => {
    setup()
    for (const area of screen.getAllByRole('button')) {
      expect(area).toHaveAttribute('tabindex', '0')
    }
  })

  it('ปุ่มอื่นที่ไม่ใช่ Enter หรือ Space ต้องไม่เลือกช่อง', () => {
    const { onSelect } = setup()
    fireEvent.keyDown(screen.getAllByRole('button')[0]!, { key: 'a' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('บอกว่าช่องไหนถูกเลือกอยู่ผ่าน aria-pressed', () => {
    setup({ activeIndex: 3 })
    expect(screen.getAllByRole('button')[3]!).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button')[0]!).toHaveAttribute('aria-pressed', 'false')
  })

  // สเปก §5.6 ข้อ 4 — error ต้องโผล่ที่ช่องที่ผิด
  it('ทำเครื่องหมายช่องที่มี error และบอกผ่าน aria-label', () => {
    setup({ errors: { 2: 'ต้องกรอก URI' } })
    expect(screen.getAllByRole('button')[2]!).toHaveAttribute('data-invalid', 'true')
    expect(screen.getAllByRole('button')[2]!.getAttribute('aria-label')).toContain('ต้องกรอก URI')
  })

  it('แสดงรูปพื้นหลังเมื่อมี', () => {
    setup({ imageUrl: 'https://cdn.test/menu.png' })
    const canvas = screen.getByTestId('rich-menu-canvas')
    expect(canvas.style.backgroundImage).toContain('https://cdn.test/menu.png')
  })

  it('คงสัดส่วนของผืนผ้าใบไว้ ไม่ว่ากล่องข้างนอกจะกว้างเท่าไหร่', () => {
    setup()
    expect(screen.getByTestId('rich-menu-canvas').style.aspectRatio).toBe('2500 / 1686')
  })

  it('ไม่แตะ UIPort เลย — เรนเดอร์ได้โดยไม่มี PortProvider ครอบ', () => {
    // ทั้งชุดนี้ไม่เคยครอบ PortProvider เลย ถ้า CanvasEditor แอบเรียก usePort จะพังทุกเคส
    setup()
    expect(screen.getByTestId('rich-menu-canvas')).toBeInTheDocument()
  })
})
