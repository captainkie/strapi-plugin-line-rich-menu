import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyActionForm } from '../src/action-form.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { AreaList } from '../src/components/AreaList.js'

const areas = [emptyActionForm(), emptyActionForm(), emptyActionForm()]

function setup(overrides: Partial<React.ComponentProps<typeof AreaList>> = {}) {
  const props = {
    areas, activeIndex: null, view: 'list' as const,
    onViewChange: vi.fn(), onSelect: vi.fn(), onChange: vi.fn(),
    aliasOptions: [], ...overrides,
  }
  render(
    <PortProvider value={createStubPort({ t: (k) => k })}>
      <AreaList {...props} />
    </PortProvider>,
  )
  return props
}

describe('AreaList', () => {
  // สเปกงานนี้ #5 — เดิม hardcode #dcdce4 ตรง ๆ ต้องแดงถ้ามีใครใส่ hex กลับเข้าไป
  it('เส้นขอบการ์ดของแต่ละช่องมาจาก theme ของ port ไม่ใช่ hex ที่ hardcode ไว้', () => {
    render(
      <PortProvider value={createStubPort({ t: (k) => k, theme: { border: '#4a4a6a', surface: '', strongText: '', mutedText: '' } })}>
        <AreaList
          areas={areas} activeIndex={null} view="list"
          onViewChange={() => {}} onSelect={() => {}} onChange={() => {}} aliasOptions={[]}
        />
      </PortProvider>,
    )
    expect(screen.getByTestId('area-header-0').closest('section')?.style.border)
      .toContain('rgb(74, 74, 106)') // #4a4a6a
  })

  /**
   * สเปกงานนี้ #5 — `<button>` ไม่ได้รับสีตัวอักษรจาก parent เอง user-agent stylesheet ตั้ง
   * `color: buttontext` (ดำ) ให้เสมอ ผลคือป้าย A/B/C เป็นดำบนพื้นเข้มของธีมมืด แทบมองไม่เห็น
   * (ดูภาพ issue-2.png ที่เจ้าของแนบมา) สีต้องมาจาก `theme.strongText` ของธีมที่ใช้อยู่จริง
   */
  it('ป้าย A B C ใช้สีตัวอักษรจาก theme ไม่ปล่อยให้ตกไปที่ค่าดำของเบราว์เซอร์', () => {
    render(
      <PortProvider value={createStubPort({
        t: (k) => k,
        theme: { border: '#4a4a6a', surface: '', strongText: '#eaeaef', mutedText: '' },
      })}>
        <AreaList
          areas={areas} activeIndex={null} view="list"
          onViewChange={() => {}} onSelect={() => {}} onChange={() => {}} aliasOptions={[]}
        />
      </PortProvider>,
    )
    expect(screen.getByTestId('area-header-0').style.color).toBe('rgb(234, 234, 239)') // #eaeaef
  })

  /**
   * สเปกงานนี้ #4 — ช่องที่เลือกอยู่ต้องมองออกจากคอลัมน์ขวาว่าเป็นช่องไหน โดยเฉพาะโหมด expanded
   * ที่ทุกช่องกางพร้อมกัน จึงไม่มี "ช่องที่กางอยู่" ให้ใช้เป็นสัญญาณ
   *
   * สีต้องเป็นเขียว LINE ตัวเดียวกับที่ `CanvasEditor` ไฮไลต์ช่องบนผืนผ้าใบ — ความเชื่อมโยง
   * "ช่องเขียวบน canvas = การ์ดเขียวใบนี้" คือทั้งหมดของฟีเจอร์นี้ ถ้าสองข้างใช้คนละสีก็ไม่เหลืออะไร
   */
  it('ช่องที่เลือกอยู่ไฮไลต์ด้วยเขียว LINE ตัวเดียวกับบนผืนผ้าใบ', () => {
    setup({ activeIndex: 1 })
    const selected = screen.getByTestId('area-section-1')
    expect(selected.dataset['selected']).toBe('true')
    expect(selected.style.border).toBe('2px solid rgb(6, 199, 85)') // LINE_GREEN
    expect(selected.style.background).toBe('rgba(6, 199, 85, 0.08)') // LINE_SELECTED_TINT
    expect(screen.getByTestId('area-header-1').style.color).toBe('rgb(6, 199, 85)')
  })

  it('ช่องที่ไม่ได้เลือกยังเป็นเส้นขอบธรรมดาของธีม ไม่ใช่เขียวทั้งแถว', () => {
    setup({ activeIndex: 1 })
    for (const index of [0, 2]) {
      const other = screen.getByTestId(`area-section-${index}`)
      expect(other.dataset['selected']).toBe('false')
      expect(other.style.border).not.toContain('rgb(6, 199, 85)')
      expect(other.style.background).toBe('none')
    }
  })

  // โหมด expanded กางทุกช่องอยู่แล้ว การไฮไลต์จึงต้องไม่ผูกกับ "ช่องไหนกางอยู่"
  it('โหมด expanded ก็ยังบอกได้ว่าช่องไหนถูกเลือก', () => {
    setup({ activeIndex: 2, view: 'expanded' })
    expect(screen.getByTestId('area-section-2').style.border).toBe('2px solid rgb(6, 199, 85)')
    expect(screen.getByTestId('area-section-0').style.border).not.toContain('rgb(6, 199, 85)')
  })

  it('มีหัวข้อหนึ่งอันต่อหนึ่งช่อง ติดป้าย A B C', () => {
    setup()
    for (const letter of ['A', 'B', 'C']) {
      expect(screen.getByRole('button', { name: new RegExp(letter) })).toBeInTheDocument()
    }
  })

  it('โหมด list พับทุกช่องไว้ ยกเว้นช่องที่เลือกอยู่', () => {
    setup({ activeIndex: 1 })
    expect(screen.getAllByTestId(/^area-body-/)).toHaveLength(1)
    expect(screen.getByTestId('area-body-1')).toBeInTheDocument()
  })

  it('โหมด expanded กางทุกช่องพร้อมกัน', () => {
    setup({ view: 'expanded' })
    expect(screen.getAllByTestId(/^area-body-/)).toHaveLength(3)
  })

  it('สลับโหมดได้จากหัวหมวด', () => {
    const { onViewChange } = setup()
    fireEvent.click(screen.getByTestId('view-expanded'))
    expect(onViewChange).toHaveBeenCalledWith('expanded')
  })

  it('กดหัวข้อช่องแล้วแจ้ง index กลับไป', () => {
    const { onSelect } = setup()
    fireEvent.click(screen.getByTestId('area-header-2'))
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  // สเปก §5.6 ข้อ 4 — error ต้องอยู่ที่ช่องของมัน ไม่ใช่รวมบนหัวฟอร์ม
  it('แสดง error ที่หัวข้อของช่องนั้น แม้ช่องจะพับอยู่', () => {
    setup({ errors: { 2: 'ต้องกรอก URI' } })
    expect(screen.getByTestId('area-header-2').textContent).toContain('ต้องกรอก URI')
  })

  it('ไม่มี error ก็ไม่มีเครื่องหมายอะไร', () => {
    setup()
    expect(screen.queryByTestId('area-error-0')).not.toBeInTheDocument()
  })
})

describe('ปุ่มเพิ่ม/ลบช่อง', () => {
  it('ปุ่มลบอยู่นอก <button> ของ accordion — ปุ่มซ้อนปุ่มเป็น HTML ที่ใช้ไม่ได้', () => {
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <AreaList
          areas={[emptyActionForm(), emptyActionForm()]}
          activeIndex={null}
          view="list"
          onViewChange={() => {}}
          onSelect={() => {}}
          onChange={() => {}}
          onAdd={() => {}}
          onRemove={() => {}}
          aliasOptions={[]}
        />
      </PortProvider>,
    )
    const remove = screen.getByTestId('area-remove-0')
    expect(remove.closest('[data-testid="area-header-0"]')).toBeNull()
  })

  /**
   * ปุ่มเพิ่มถูก disable ที่ 20 ช่องอยู่แล้ว (เพดานของ LINE เอง — สเปก §2.2) แต่ไม่มีคำอธิบายว่า
   * ทำไมกดไม่ได้ — ผู้ใช้เห็นปุ่มเทาแล้วเดาเอาเองว่าเกิดอะไรขึ้น ข้อความนี้ตอบคำถามนั้นตรง ๆ
   */
  it('ครบ 20 ช่องแล้วมีข้อความบอกเพดานโผล่ข้างปุ่มเพิ่ม', () => {
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <AreaList
          areas={Array.from({ length: 20 }, () => emptyActionForm())}
          activeIndex={null}
          view="list"
          onViewChange={() => {}}
          onSelect={() => {}}
          onChange={() => {}}
          onAdd={() => {}}
          aliasOptions={[]}
        />
      </PortProvider>,
    )
    expect(screen.getByText('editor.layout.limit')).toBeInTheDocument()
  })

  it('ยังไม่ครบ 20 ช่อง ไม่มีข้อความเพดานโผล่มา', () => {
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <AreaList
          areas={Array.from({ length: 19 }, () => emptyActionForm())}
          activeIndex={null}
          view="list"
          onViewChange={() => {}}
          onSelect={() => {}}
          onChange={() => {}}
          onAdd={() => {}}
          aliasOptions={[]}
        />
      </PortProvider>,
    )
    expect(screen.queryByText('editor.layout.limit')).toBeNull()
  })

  it('ไม่ส่ง onAdd/onRemove มาก็ไม่มีปุ่มไหนโผล่', () => {
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <AreaList
          areas={[emptyActionForm()]}
          activeIndex={null}
          view="list"
          onViewChange={() => {}}
          onSelect={() => {}}
          onChange={() => {}}
          aliasOptions={[]}
        />
      </PortProvider>,
    )
    expect(screen.queryByTestId('area-add')).toBeNull()
    expect(screen.queryByTestId('area-remove-0')).toBeNull()
  })
})
