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
