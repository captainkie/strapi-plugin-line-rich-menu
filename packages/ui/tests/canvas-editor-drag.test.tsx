import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasEditor } from '../src/components/CanvasEditor.js'

const SIZE = { width: 2500, height: 1686 }
const BOUNDS = [
  { x: 0, y: 0, width: 1250, height: 1686 },
  { x: 1250, y: 0, width: 1250, height: 1686 },
]

// jsdom คืนศูนย์ทั้งหมดจาก getBoundingClientRect ซึ่งทำให้คำนวณอัตราส่วนไม่ได้
// จึงต้องปลอมกล่องขนาด 1000x674 px บนจอ เทียบกับผืนผ้าใบ 2500x1686 → 1 px บนจอ = 2.5 หน่วย
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 674, width: 1000, height: 674,
    toJSON: () => ({}),
  } as DOMRect)
})

function setup(onBoundsChange = vi.fn()) {
  render(
    <CanvasEditor
      size={SIZE}
      bounds={BOUNDS}
      showOutlines
      activeIndex={0}
      onSelect={vi.fn()}
      onBoundsChange={onBoundsChange}
      snap={10}
    />,
  )
  return { onBoundsChange }
}

describe('CanvasEditor — ลากและปรับขนาด', () => {
  it('ไม่มีมือจับให้เห็นเลยถ้าไม่ได้ส่ง onBoundsChange มา — layout สำเร็จรูปต้องแก้ไม่ได้', () => {
    render(
      <CanvasEditor size={SIZE} bounds={BOUNDS} showOutlines activeIndex={0} onSelect={vi.fn()} />,
    )
    expect(screen.queryAllByTestId(/resize-handle/)).toHaveLength(0)
  })

  it('มีมือจับปรับขนาดหนึ่งอันต่อหนึ่งช่องเมื่อแก้ไขได้', () => {
    setup()
    expect(screen.getAllByTestId(/resize-handle/)).toHaveLength(BOUNDS.length)
  })

  it('ลากช่องแล้วแจ้ง bounds ใหม่ โดยแปลงพิกเซลบนจอกลับเป็นหน่วยของผืนผ้าใบ', () => {
    const { onBoundsChange } = setup()
    const area = screen.getAllByRole('button')[0]!
    fireEvent.pointerDown(area, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(area, { clientX: 140, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
    // เลื่อน 40 px บนจอ × 2.5 = 100 หน่วย
    expect(onBoundsChange).toHaveBeenLastCalledWith(0, { x: 100, y: 0, width: 1250, height: 1686 })
  })

  it('ดูดเข้าหาเส้นกริดตามค่า snap', () => {
    const { onBoundsChange } = setup()
    const area = screen.getAllByRole('button')[0]!
    fireEvent.pointerDown(area, { clientX: 100, clientY: 100, pointerId: 1 })
    // 7 px × 2.5 = 17.5 หน่วย → ดูดลงเป็น 20
    fireEvent.pointerMove(area, { clientX: 107, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
    const [, next] = onBoundsChange.mock.calls.at(-1)!
    expect(next.x).toBe(20)
  })

  it('ลากออกนอกผืนผ้าใบไม่ได้ — ค่าถูกหนีบไว้ที่ขอบ', () => {
    const { onBoundsChange } = setup()
    const area = screen.getAllByRole('button')[0]!
    fireEvent.pointerDown(area, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(area, { clientX: -500, clientY: -500, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
    const [, next] = onBoundsChange.mock.calls.at(-1)!
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
  })

  it('ปรับขนาดแล้วเปลี่ยนแค่ความกว้างความสูง ไม่ขยับจุดเริ่ม', () => {
    const { onBoundsChange } = setup()
    const handle = screen.getAllByTestId(/resize-handle/)[0]!
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 674, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 460, clientY: 674, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    const [, next] = onBoundsChange.mock.calls.at(-1)!
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
    expect(next.width).toBe(1150)
  })

  it('ย่อจนติดลบไม่ได้ — ความกว้างอย่างน้อยเท่ากับหนึ่งช่องกริด', () => {
    const { onBoundsChange } = setup()
    const handle = screen.getAllByTestId(/resize-handle/)[0]!
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 674, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: -900, clientY: -900, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    const [, next] = onBoundsChange.mock.calls.at(-1)!
    expect(next.width).toBeGreaterThanOrEqual(10)
    expect(next.height).toBeGreaterThanOrEqual(10)
  })

  // jsdom's fireEvent.pointerDown/pointerUp never synthesise the follow-up `click` a real browser
  // fires after a quick tap, so this test cannot reproduce the actual bug (tap-without-drag on the
  // handle selecting the area). It only pins that *if* a click reaches the handle, it must not bubble
  // to the area's onSelect. The real-browser sequence has to be checked by hand in the playground.
  it('คลิกที่มือจับปรับขนาดเฉยๆ (ไม่ผ่าน onPointerDown) ต้องไม่เลือกช่อง — click ต้องไม่บับเบิลขึ้นไปที่ role="button"', () => {
    const onSelect = vi.fn()
    render(
      <CanvasEditor
        size={SIZE} bounds={BOUNDS} showOutlines activeIndex={null}
        onSelect={onSelect} onBoundsChange={vi.fn()}
      />,
    )
    const handle = screen.getAllByTestId(/resize-handle/)[0]!
    fireEvent.click(handle)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('การกด Enter เพื่อเลือกช่องยังทำงานเหมือนเดิมแม้จะแก้ไขได้', () => {
    const onSelect = vi.fn()
    render(
      <CanvasEditor
        size={SIZE} bounds={BOUNDS} showOutlines activeIndex={null}
        onSelect={onSelect} onBoundsChange={vi.fn()}
      />,
    )
    fireEvent.keyDown(screen.getAllByRole('button')[1]!, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
