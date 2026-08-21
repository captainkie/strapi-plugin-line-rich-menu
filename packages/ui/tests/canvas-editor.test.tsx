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

  // สเปกงานนี้ #5 — ไม่ส่ง `theme` มา ต้องได้ค่าธีมสว่างของ Strapi เป๊ะเหมือนเดิมทุกประการ
  // (จุดเรียกเดิม/เทสต์ที่ render ตรง ๆ โดยไม่มี PortProvider ต้องไม่เปลี่ยนพฤติกรรม)
  it('ไม่ส่ง theme มา ใช้ค่าธีมสว่างดีฟอลต์ — พื้นหลังและตัวอักษรเหมือนเดิมก่อนมีสเปกงานนี้', () => {
    setup()
    expect(screen.getByTestId('rich-menu-canvas').style.backgroundColor).toBe('rgb(234, 234, 239)') // #eaeaef
    expect(screen.getAllByText('833×843')[0]!.style.color).toBe('rgb(102, 102, 135)') // #666687
  })

  // ส่ง `theme` มา ต้องเห็นผลจริงในพื้นหลัง placeholder และตัวอักษรของป้าย/ขนาด — พิสูจน์ว่าพร็อพ
  // เดินทางเข้ามาถึงจริง ไม่ใช่แค่ประกาศไว้เฉย ๆ (ดูที่ Preview ส่งต่อจาก usePort().theme)
  it('ส่ง theme มา พื้นหลังและตัวอักษรตามค่านั้นจริง — ไม่ใช่ค่าดีฟอลต์ที่ hardcode ไว้', () => {
    setup({ theme: { surface: '#111111', strongText: '#eeeeee', mutedText: '#cccccc' } })
    expect(screen.getByTestId('rich-menu-canvas').style.backgroundColor).toBe('rgb(17, 17, 17)')
    expect(screen.getAllByText('833×843')[0]!.style.color).toBe('rgb(204, 204, 204)')
  })

  it('ซ่อนกรอบและตัวเลขเมื่อปิด outline', () => {
    setup({ showOutlines: false })
    expect(screen.queryByText('833×843')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')[0]!.style.border).toBe('')
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

  it('กด Enter จาก element ลูกที่ซ้อนอยู่ข้างในช่อง ต้องไม่ถูกดักไปเลือกช่อง', () => {
    const { onSelect } = setup()
    const area = screen.getAllByRole('button')[0]!
    const nested = area.querySelector('span')!
    fireEvent.keyDown(nested, { key: 'Enter' })
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
    expect(screen.getAllByRole('button')[0]!).not.toHaveAttribute('data-invalid')
  })

  // Task 6 review: ช่องที่ทับกันได้ (LINE อนุญาต) ช่องหลังในลำดับ DOM จะทับมือจับของช่องก่อนหน้า
  // ช่องที่ active ต้องมี z-index สูงกว่า ผู้ใช้ถึงจะคลิกมือจับของมันได้เสมอ
  it('ช่องที่ active มี z-index สูงกว่าช่องที่ไม่ active', () => {
    setup({ activeIndex: 3 })
    const areas = screen.getAllByRole('button')
    const activeZ = Number(areas[3]!.style.zIndex)
    const inactiveZ = Number(areas[0]!.style.zIndex)
    expect(activeZ).toBeGreaterThan(inactiveZ)
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

  /**
   * ค่านี้มาจากเซิร์ฟเวอร์วันนี้ จึงเป็นการป้องกันเชิงลึก ไม่ใช่รูรั่วที่เปิดอยู่ — แต่ `")` ตัวเดียว
   * ในชื่อไฟล์ก็หลุดออกจาก token `url()` ได้แล้ว และ upload provider ที่ผู้ใช้เลือกเองเป็นคน
   * ตัดสินว่า url หน้าตาเป็นยังไง ไม่ใช่เรา
   */
  it('imageUrl ถูก escape ก่อนใส่ใน url() — `")` ไม่หลุดออกจาก token', () => {
    render(
      <CanvasEditor
        size={{ width: 2500, height: 1686 }}
        bounds={[{ x: 0, y: 0, width: 100, height: 100 }]}
        showOutlines={false}
        activeIndex={null}
        onSelect={() => {}}
        imageUrl={'/uploads/a").evil("b.jpg'}
      />,
    )
    const background = screen.getByTestId('rich-menu-canvas').style.backgroundImage
    // quote ในค่าถูกแปลงเป็น %22 แล้ว เหลือ `"` แค่คู่เปิด-ปิดของ token เท่านั้น
    expect(background).toContain('%22')
    expect(background.match(/"/g)).toHaveLength(2)
    // และยังเหลือ url( ชุดเดียว ไม่ใช่สองชุดที่เกิดจากการหลุดออกจาก token
    expect(background.match(/url\(/g)).toHaveLength(1)
  })
})
