import { fireEvent, render, screen, within } from '@testing-library/react'
import { DEFAULT_CHAT_BAR_TEXT, TEMPLATES } from '@fosivo/line-rich-menu-core/browser'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { ChatBarSettings } from '../src/components/ChatBarSettings.js'
import { MainSettings } from '../src/components/MainSettings.js'
import { Preview } from '../src/components/Preview.js'

const port = createStubPort({ t: (k) => k })
const wrap = (node: React.ReactNode) => render(<PortProvider value={port}>{node}</PortProvider>)
const template = TEMPLATES['RICH_MENU_TEMPLATE_201']!

describe('MainSettings', () => {
  const value = { title: '', startAt: '', endAt: '', audience: 'all' as const }

  it('จำกัดชื่อไว้ 30 ตัว — คนละตัวกับ name ใน payload ที่ยอมได้ 300', () => {
    wrap(<MainSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('editor.title')).toHaveAttribute('maxlength', '30')
  })

  it('มีตัวนับตัวอักษรของชื่อ', () => {
    wrap(<MainSettings value={{ ...value, title: 'เมนู' }} onChange={vi.fn()} />)
    expect(screen.getByText('4/30')).toBeInTheDocument()
  })

  it('บอกว่าชื่อนี้ใช้จัดการภายใน ผู้ใช้ปลายทางไม่เห็น', () => {
    wrap(<MainSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByText('editor.title.hint')).toBeInTheDocument()
  })

  // สเปกงานนี้ #4 — เจ้าของขอปฏิทินจริงแทนช่องพิมพ์สตริงอิสระ "YYYY-MM-DD HH:mm" เดิม รูปทรงตาม
  // LINE ตรง ๆ (docs/files/example-ui/): วันที่ + เวลาแยกกันคนละช่องต่อฝั่ง (สี่ช่องรวม)
  it('ช่วงเวลาแสดงผลมีสี่ช่อง (วันที่/เวลา × เริ่ม/สิ้นสุด) อยู่ในฟอร์มเดียวกัน ไม่ใช่หน้าแยก', () => {
    wrap(<MainSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('editor.displayPeriod.startDate')).toBeInTheDocument()
    expect(screen.getByLabelText('editor.displayPeriod.startTime')).toBeInTheDocument()
    expect(screen.getByLabelText('editor.displayPeriod.endDate')).toBeInTheDocument()
    expect(screen.getByLabelText('editor.displayPeriod.endTime')).toBeInTheDocument()
  })

  // ยามสำคัญของงานนี้ — ต้องเป็นปฏิทินจริง (input type=date/time ของ stub ซึ่งจับคู่กับ DatePicker/
  // TimePicker ของ DS จริงในสอง adapter) ไม่ใช่ TextInput ที่พิมพ์สตริงตายตัวเหมือนเดิม
  it('ช่องวันที่/เวลาเป็นปฏิทินจริง ไม่ใช่ช่องพิมพ์สตริงอิสระแบบเดิม', () => {
    wrap(<MainSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('editor.displayPeriod.startDate')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('editor.displayPeriod.endDate')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('editor.displayPeriod.startTime')).toHaveAttribute('type', 'time')
    expect(screen.getByLabelText('editor.displayPeriod.endTime')).toHaveAttribute('type', 'time')
  })

  it('มี "~" คั่นระหว่างสองแถว ตามที่ LINE เองใช้', () => {
    wrap(<MainSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByText('~')).toBeInTheDocument()
  })

  it('ค่า ISO ที่ตั้งไว้เดิมแยกกลับเป็นวันที่ + เวลาในสองช่องถูกต้อง ไม่ใช่ช่องว่างเปล่า', () => {
    wrap(
      <MainSettings
        value={{ ...value, startAt: '2026-08-20T09:05:00.000Z' }}
        onChange={vi.fn()}
      />,
    )
    const dateInput = screen.getByLabelText('editor.displayPeriod.startDate') as HTMLInputElement
    const timeInput = screen.getByLabelText('editor.displayPeriod.startTime') as HTMLInputElement
    expect(dateInput.value).not.toBe('')
    expect(timeInput.value).toMatch(/^\d{2}:\d{2}$/)
    // ฝั่งที่ยังไม่ตั้ง (endAt ว่าง) ต้องว่างจริง ไม่ใช่ค้างค่าของฝั่งเริ่ม
    expect((screen.getByLabelText('editor.displayPeriod.endDate') as HTMLInputElement).value).toBe('')
  })

  it('เลือกวันที่แล้ว startAt กลายเป็น ISO datetime string เดียว ไม่ใช่แค่สตริงวันที่ดิบ', () => {
    const onChange = vi.fn()
    wrap(<MainSettings value={value} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('editor.displayPeriod.startDate'), { target: { value: '2026-08-20' } })
    expect(onChange).toHaveBeenCalledWith({ ...value, startAt: expect.stringMatching(/^2026-08-\d{2}T\d{2}:\d{2}:00\.000Z$/) })
  })

  it('ตั้งวันที่ไว้แล้วเปลี่ยนแค่เวลา ต้องคงวันที่เดิมไว้ ไม่ใช่ล้างวันที่ทิ้ง', () => {
    const onChange = vi.fn()
    wrap(<MainSettings value={{ ...value, startAt: '2026-08-20T00:00:00.000Z' }} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('editor.displayPeriod.startTime'), { target: { value: '14:30' } })
    const [nextValue] = onChange.mock.calls[0] as [{ startAt: string }]
    expect(nextValue.startAt).not.toBe('')
    const roundTrip = new Date(nextValue.startAt)
    expect(roundTrip.getHours()).toBe(14)
    expect(roundTrip.getMinutes()).toBe(30)
  })

  it('ปุ่ม clear ล้างช่วงเวลาทั้งคู่ (ทั้งวันที่และเวลา) แต่ไม่แตะชื่อ', () => {
    const onChange = vi.fn()
    wrap(
      <MainSettings
        value={{ ...value, title: 'เมนู', startAt: '2026-08-20T00:00:00.000Z', endAt: '2026-08-26T23:59:00.000Z' }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('clear-period'))
    expect(onChange).toHaveBeenCalledWith({ ...value, title: 'เมนู', startAt: '', endAt: '' })
  })

  /**
   * Task 14b item 1 — ก่อนหน้านี้ไม่มีอะไรใน `packages/ui/src` เขียน `audience` เลยสักจุด
   * (Task 14 พบตอนเขียนคู่มือ: ทางเดียวที่จะได้เมนูสมาชิกคือ POST เองด้วยมือ) กลุ่มนี้จึงเป็น
   * ทางเข้าเดียวของแนวคิดหลักของฟีเจอร์ทั้งอัน
   *
   * ต้องเป็น "กลุ่ม" ที่มีชื่อของตัวเองจริง ๆ (role=radiogroup ที่ accessible name ตรงกับ label)
   * ไม่ใช่ radio สองตัวลอย ๆ — เหตุผลเดียวกับที่ `ChatBarSettings` ทดสอบเรื่องนี้ไว้ (ดู
   * คอมเมนต์ที่ `UIPrimitives.RadioGroup` ใน port.ts): คนใช้ screen reader ต้องรู้ว่าตัวเลือก
   * สองตัวนี้คู่กัน ไม่ใช่ได้ยินสวิตช์สองตัวที่ไม่รู้ว่าเกี่ยวอะไรกัน
   */
  describe('กลุ่มเป้าหมาย (Task 14b item 1)', () => {
    it('เป็นกลุ่มที่มีชื่อของตัวเอง มีสองตัวเลือก — ทุกคน กับ สมาชิก', () => {
      wrap(<MainSettings value={value} onChange={vi.fn()} />)
      const group = screen.getByRole('radiogroup', { name: 'editor.audience' })
      expect(within(group).getAllByRole('radio')).toHaveLength(2)
      expect(within(group).getByLabelText('audience.all')).toBeInTheDocument()
      expect(within(group).getByLabelText('audience.members')).toBeInTheDocument()
    })

    it('ตัวเลือกที่ตรงกับค่าปัจจุบันถูกติ๊กไว้ตัวเดียว ไม่ใช่ทุกตัวหรือไม่มีเลย', () => {
      wrap(<MainSettings value={{ ...value, audience: 'members' }} onChange={vi.fn()} />)
      expect(screen.getByLabelText('audience.members')).toBeChecked()
      expect(screen.getByLabelText('audience.all')).not.toBeChecked()
    })

    // ยามหลักของงานนี้: ค่าที่ผู้ใช้เลือกต้องไหลออกไปทาง onChange จริง ไม่ใช่ radio ที่กดแล้วสวย
    // แต่ไม่มีอะไรเกิดขึ้น (ซึ่งเป็นสิ่งที่จะได้ถ้า `set('audience', ...)` ไม่ถูกต่อไว้)
    it('เลือก "สมาชิก" แล้วรายงาน audience: members กลับไป โดยไม่แตะฟิลด์อื่น', () => {
      const onChange = vi.fn()
      wrap(<MainSettings value={{ ...value, title: 'เมนู' }} onChange={onChange} />)
      fireEvent.click(screen.getByLabelText('audience.members'))
      expect(onChange).toHaveBeenCalledWith({ ...value, title: 'เมนู', audience: 'members' })
    })

    it('เลือกกลับมาที่ "ทุกคน" แล้วรายงาน audience: all', () => {
      const onChange = vi.fn()
      wrap(<MainSettings value={{ ...value, audience: 'members' }} onChange={onChange} />)
      fireEvent.click(screen.getByLabelText('audience.all'))
      expect(onChange).toHaveBeenCalledWith({ ...value, audience: 'all' })
    })

    // ปุ่ม clear ล้าง "ช่วงเวลาแสดงผล" ไม่ใช่ทั้งฟอร์ม — มันสร้าง object ใหม่จาก `...value` เอง
    // (ไม่ผ่าน `set`) ฟิลด์ใหม่ทุกตัวจึงมีสิทธิ์หล่นหายตรงนี้โดยไม่มีอะไรเตือน
    it('ปุ่ม clear ไม่แตะกลุ่มเป้าหมาย', () => {
      const onChange = vi.fn()
      wrap(<MainSettings value={{ ...value, audience: 'members', startAt: '2026-08-20T00:00:00.000Z' }} onChange={onChange} />)
      fireEvent.click(screen.getByTestId('clear-period'))
      expect(onChange).toHaveBeenCalledWith({ ...value, audience: 'members', startAt: '', endAt: '' })
    })
  })

  it('ส่ง error มาครบสามฟิลด์ ต้องขึ้นครบทั้งสาม ไม่ใช่แค่ title', () => {
    wrap(
      <MainSettings
        value={value}
        onChange={vi.fn()}
        errors={{ title: 'ชื่อห้ามว่าง', startAt: 'รูปแบบวันที่ไม่ถูกต้อง', endAt: 'ต้องอยู่หลังวันเริ่ม' }}
      />,
    )
    expect(screen.getByText('ชื่อห้ามว่าง')).toBeInTheDocument()
    expect(screen.getByText('รูปแบบวันที่ไม่ถูกต้อง')).toBeInTheDocument()
    expect(screen.getByText('ต้องอยู่หลังวันเริ่ม')).toBeInTheDocument()
  })
})

describe('ChatBarSettings', () => {
  const value = { mode: 'default' as const, text: '', selected: true }

  it('มีสองสวิตช์แยกกัน — ข้อความบนแถบ กับ สถานะตอนเปิดแชท', () => {
    wrap(<ChatBarSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('chatBar.mode.default')).toBeInTheDocument()
    expect(screen.getByLabelText('chatBar.mode.custom')).toBeInTheDocument()
    expect(screen.getByLabelText('chatBar.behavior.shown')).toBeInTheDocument()
    expect(screen.getByLabelText('chatBar.behavior.collapsed')).toBeInTheDocument()
  })

  it('ช่องข้อความถูกปิดไว้จนกว่าจะเลือกโหมด custom', () => {
    wrap(<ChatBarSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('chatBar.text')).toBeDisabled()
  })

  it('เปิดใช้ได้เมื่อเลือก custom และจำกัดที่ 14 ตัว', () => {
    wrap(<ChatBarSettings value={{ ...value, mode: 'custom' }} onChange={vi.fn()} />)
    const input = screen.getByLabelText('chatBar.text')
    expect(input).not.toBeDisabled()
    expect(input).toHaveAttribute('maxlength', '14')
  })

  it('มีตัวนับตัวอักษร — 14 ตัวหมดเร็วมากโดยเฉพาะภาษาไทย', () => {
    wrap(<ChatBarSettings value={{ mode: 'custom', text: 'เมนูหลัก', selected: true }} onChange={vi.fn()} />)
    expect(screen.getByText('8/14')).toBeInTheDocument()
  })

  it('เก็บโหมดที่ผู้ใช้เลือกไว้ ไม่ใช่เก็บแต่ข้อความ', () => {
    const onChange = vi.fn()
    wrap(<ChatBarSettings value={value} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('chatBar.mode.custom'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'custom', text: '', selected: true })
  })

  // ตัวเลือกสองชุดนี้เคยเป็น radio สี่ตัวเรียงกันที่จับกลุ่มกันด้วย attribute `name` เท่านั้น —
  // คนใช้ screen reader จึงได้ยิน radio สี่ตัวลอย ๆ โดยไม่มีอะไรบอกว่าตัวไหนอยู่ชุดเดียวกัน
  // เทสต์นี้ยึดทั้งสองด้าน: กลุ่มต้องมีอยู่จริงใน accessibility tree และต้องมีชื่อของตัวเอง
  it('ตัวเลือกแต่ละชุดเป็นกลุ่มที่มีชื่อของตัวเอง ไม่ใช่ radio ลอย ๆ สี่ตัว', () => {
    wrap(<ChatBarSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByRole('radiogroup', { name: 'chatBar.mode' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'chatBar.behavior' })).toBeInTheDocument()
  })

  // ช่องข้อความไม่ใช่ตัวเลือกของกลุ่ม "โหมด" — ถ้ามันหลุดเข้าไปอยู่ในกลุ่ม ผู้ใช้ screen reader
  // จะได้ยินว่ากลุ่มนี้มีสามตัวเลือก ทั้งที่มีจริงแค่สอง
  it('กลุ่มโหมดมีสมาชิกแค่สองตัว ช่องข้อความไม่นับเป็นตัวเลือกของกลุ่ม', () => {
    wrap(<ChatBarSettings value={value} onChange={vi.fn()} />)
    const group = within(screen.getByRole('radiogroup', { name: 'chatBar.mode' }))
    expect(group.getAllByRole('radio')).toHaveLength(2)
    expect(group.queryByLabelText('chatBar.text')).not.toBeInTheDocument()
  })

  it('เลือกสมาชิกในกลุ่มพฤติกรรมแล้วรายงานค่าของสมาชิกตัวนั้น ไม่ใช่ค่าของกลุ่มเดิม', () => {
    const onChange = vi.fn()
    wrap(<ChatBarSettings value={value} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('chatBar.behavior.collapsed'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'default', text: '', selected: false })
  })

  it('สมาชิกที่ตรงกับค่าปัจจุบันถูกติ๊กไว้ตัวเดียว ไม่ใช่ทุกตัวหรือไม่มีเลย', () => {
    wrap(<ChatBarSettings value={{ mode: 'custom', text: 'ร้านค้า', selected: true }} onChange={vi.fn()} />)
    expect(screen.getByLabelText('chatBar.mode.custom')).toBeChecked()
    expect(screen.getByLabelText('chatBar.mode.default')).not.toBeChecked()
    expect(screen.getByLabelText('chatBar.behavior.shown')).toBeChecked()
    expect(screen.getByLabelText('chatBar.behavior.collapsed')).not.toBeChecked()
  })
})

describe('Preview', () => {
  it('แสดง label ของแถบแชทตามที่พิมพ์ แบบเรียลไทม์', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="ทดสอบ" expanded />)
    expect(screen.getByTestId('preview-chat-bar').textContent).toContain('ทดสอบ')
  })

  it('ยุบเมนูเมื่อ expanded เป็นเท็จ', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded={false} />)
    expect(screen.queryByTestId('preview-menu')).not.toBeInTheDocument()
  })

  it('แสดงเมนูเมื่อ expanded เป็นจริง', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
    expect(screen.getByTestId('preview-menu')).toBeInTheDocument()
  })

  // สเปกงานนี้ #3 — ต้องทั้งพิสูจน์ว่าตัวเลือก "Default behavior" มีผลจริง (ยุบเมนูได้) และคนที่
  // เลือก Collapsed ไม่เสีย canvas ที่กำลังแก้อยู่ไปทั้งอัน (แตะแถบแชทดึงกลับมาได้) — สองข้อความนี้
  // ต้องแดงทั้งคู่ถ้ามีใครผูก radio ทิ้งอีกครั้ง (ตัด expanded ออกจากพรีวิว) หรือลืมต่อ onClick
  describe('แถบแชทสลับกาง/ยุบเมนูได้ — Collapsed ไม่ใช่การเสีย canvas ถาวร', () => {
    it('เริ่มยุบไว้ (expanded=false) แตะแถบแชทแล้วเมนูกลับมา', () => {
      wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded={false} />)
      expect(screen.queryByTestId('preview-menu')).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('preview-chat-bar'))
      expect(screen.getByTestId('preview-menu')).toBeInTheDocument()
    })

    it('เริ่มกางไว้ (expanded=true) แตะแถบแชทแล้วเมนูยุบ', () => {
      wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
      expect(screen.getByTestId('preview-menu')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('preview-chat-bar'))
      expect(screen.queryByTestId('preview-menu')).not.toBeInTheDocument()
    })

    // ยังไม่มีผังให้แก้เลย (bounds ว่าง) — ไม่มีอะไรให้กาง แตะแล้วต้องไม่มีอะไรเกิดขึ้น
    it('ไม่มี template เลือกไว้ (bounds ว่าง) แตะแถบแชทแล้วไม่มีอะไรเกิดขึ้น', () => {
      wrap(<Preview size={template.size} bounds={[]} chatBarText="เมนู" expanded />)
      expect(screen.queryByTestId('preview-menu')).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('preview-chat-bar'))
      expect(screen.queryByTestId('preview-menu')).not.toBeInTheDocument()
    })

    // เชฟรอนต้องชี้ไปทิศทางที่แตะแล้วจะเกิดอะไรขึ้น — ชี้ลงตอนกางอยู่ (แตะแล้วยุบ) ชี้ขึ้นตอนยุบอยู่
    // (แตะแล้วกาง) ไม่ใช่ทิศทางตายตัว
    it('เชฟรอนในแถบแชทชี้ลงตอนกาง ชี้ขึ้นตอนยุบ', () => {
      wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
      const bar = screen.getByTestId('preview-chat-bar')
      expect(bar.textContent).toContain('▾')
      fireEvent.click(bar)
      expect(bar.textContent).toContain('▴')
    })

    // การเปลี่ยนค่า expanded จากภายนอก (เช่นผู้ใช้เปลี่ยน radio ในหน้า editor) ต้องรีเซ็ตพรีวิวกลับไป
    // ที่สถานะนั้นเสมอ แม้ผู้ใช้จะเคยแตะแถบแชทเองมาก่อนหน้านี้แล้วก็ตาม — ไม่งั้นตัวเลือกจะ "ค้าง"
    // ที่ค่าที่ผู้ใช้แตะไว้ล่าสุด ไม่ใช่ค่าที่ radio บอก ซึ่งเท่ากับตัวเลือกไม่ได้สาธิตตัวเองจริง
    //
    // ต้องเปลี่ยนค่า prop จริง ๆ ไม่ใช่ rerender ด้วยค่าเดิม — useEffect ที่ยิงตอน dependency
    // เปลี่ยนจะไม่ทำงานถ้าค่าเท่าเดิม (สมเหตุสมผลตามหลัก React) การส่งซ้ำค่าเดิมจึงไม่นับเป็น
    // "เปลี่ยน radio" เทสต์นี้เลยไล่ true → (แตะเอง=false) → rerender false (ยังไม่เห็นผลต่าง เพราะ
    // สถานะภายในเท่ากับ prop อยู่แล้ว) → rerender true (prop เปลี่ยนจริง) → เมนูต้องกลับมา
    it('เปลี่ยน expanded จากภายนอกรีเซ็ตพรีวิวกลับไปที่ค่านั้นเสมอ แม้เคยแตะเองมาก่อน', () => {
      const rerenderWith = (expanded: boolean) => (
        <PortProvider value={port}>
          <Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded={expanded} />
        </PortProvider>
      )
      const { rerender } = wrap(
        <Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />,
      )
      expect(screen.getByTestId('preview-menu')).toBeInTheDocument()

      // ผู้ใช้แตะเองให้ยุบ ทั้งที่ radio ยังบอกว่า Shown อยู่
      fireEvent.click(screen.getByTestId('preview-chat-bar'))
      expect(screen.queryByTestId('preview-menu')).not.toBeInTheDocument()

      // ผู้ใช้เลือก "Collapsed" — ค่า prop เปลี่ยนจริง (true → false)
      rerender(rerenderWith(false))
      expect(screen.queryByTestId('preview-menu')).not.toBeInTheDocument()

      // ผู้ใช้เลือก "Shown" กลับ — ค่า prop เปลี่ยนจริงอีกครั้ง (false → true) ต้องรีเซ็ตเมนูให้กลับมา
      // แม้ระหว่างทางจะเคยถูกแตะยุบเองไปแล้วก็ตาม
      rerender(rerenderWith(true))
      expect(screen.getByTestId('preview-menu')).toBeInTheDocument()
    })
  })

  // สเปกงานนี้ #2 — เจ้าของ: "menu bar label ให้อยู่ตรงกลางด้วย ตอนนี้มันชิดซ้าย"
  // ต้องอยู่กึ่งกลางทั้งสองสถานะ ไม่ใช่แค่ตอนกางหรือแค่ตอนยุบ
  it('label ของแถบแชทอยู่กึ่งกลาง ทั้งตอนเมนูกางและยุบ', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
    expect(screen.getByTestId('preview-chat-bar-label').style.textAlign).toBe('center')
    fireEvent.click(screen.getByTestId('preview-chat-bar'))
    expect(screen.getByTestId('preview-chat-bar-label').style.textAlign).toBe('center')
  })

  // สเปกงานนี้ #2 — ตาม docs/files/example-ui/: ตอนเมนูกางแถบเป็นแถบเปล่าธรรมดา ไม่มีเม็ดมนพื้นสี
  // (เม็ดมนเป็นของสถานะ "ยุบ" ที่ผู้ใช้กำลังพิมพ์อยู่เท่านั้น)
  it('เม็ดมนพื้นช่องพิมพ์ข้อความหายไปตอนเมนูกาง และกลับมาตอนยุบ', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
    expect(screen.getByTestId('preview-chat-bar-label').style.background).toBe('')
    fireEvent.click(screen.getByTestId('preview-chat-bar'))
    expect(screen.getByTestId('preview-chat-bar-label').style.background).toContain('242, 242, 243')
  })

  /**
   * Task 20 item 9 (ui-core M2) — เดิมเทสต์นี้ยืนยันว่าใช้ `t('chatBar.defaultLabel')` (คำแปลของ
   * แอดมิน Strapi) ซึ่งเป็นตัวบั๊กเอง: LINE แสดง "Menu" เสมอไม่ว่าแอดมินตั้งภาษาอะไรไว้ (ดูคอมเมนต์
   * เต็มที่ DEFAULT_CHAT_BAR_TEXT ใน schema.ts) ตอนนี้ตรวจกับค่าคงที่ตัวเดียวกับที่ publish จริงส่ง
   * ให้ LINE (`resolveChatBarText` ใน packages/core/src/server/payload.ts) ไม่ใช่คำแปล
   */
  it('ข้อความแถบแชทว่าง ใช้ DEFAULT_CHAT_BAR_TEXT (ค่าเดียวกับที่ publish จริงส่งให้ LINE) ไม่ใช่คำแปลของแอดมิน', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="" expanded />)
    expect(screen.getByTestId('preview-chat-bar').textContent).toContain(DEFAULT_CHAT_BAR_TEXT)
  })

  // เจตนาแยกจากเทสต์ข้างบน — ยืนยันว่าพรีวิวไม่ผูกกับ t() เลยสำหรับกรณีนี้ แม้ t() จะถูกปลอมให้
  // คืนคำแปลอื่น (ยาวกว่า/ภาษาอื่น) พรีวิวก็ต้องยังโชว์ "Menu" เพราะ LINE ไม่สนภาษาของแอดมิน
  it('ต่อให้ t() ถูกปลอมให้คืนคำแปลอื่นของ chatBar.defaultLabel พรีวิวก็ยังไม่ใช้ค่านั้น', () => {
    render(
      <PortProvider value={createStubPort({ t: (key) => (key === 'chatBar.defaultLabel' ? 'เมนูภาษาไทยที่ยาวกว่านี้มาก' : key) })}>
        <Preview size={template.size} bounds={template.bounds} chatBarText="" expanded />
      </PortProvider>,
    )
    const text = screen.getByTestId('preview-chat-bar').textContent
    expect(text).toContain(DEFAULT_CHAT_BAR_TEXT)
    expect(text).not.toContain('เมนูภาษาไทยที่ยาวกว่านี้มาก')
  })

  it('ข้อความแถบแชทไม่ว่าง แสดงข้อความนั้น ไม่ใช่ label default', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
    const text = screen.getByTestId('preview-chat-bar').textContent
    expect(text).toContain('เมนู')
    expect(text).not.toContain('chatBar.defaultLabel')
  })

  // canvas ในกรอบโทรศัพท์นี้คือตัวควบคุมจริงตามผัง §5.7 (ช่องเดียว ไม่ใช่พรีวิวคู่กับ canvas แยก)
  // ช่องทุกช่องจึงต้องกดได้และ tab เข้าถึงได้ เคยมีช่วงที่มันถูก aria-hidden ตอนยังเป็นภาพประกอบ
  // เทสต์นี้อยู่ตรงนี้เพื่อกันไม่ให้ใครใส่กลับ ซึ่งจะเท่ากับเอา editor ออกจากมือคนใช้ screen reader
  it('ช่องในกรอบโทรศัพท์กดเลือกได้ เพราะเป็น canvas ตัวจริงไม่ใช่ภาพประกอบ', () => {
    const onSelect = vi.fn()
    wrap(
      <Preview
        size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded
        activeIndex={null} onSelect={onSelect}
      />,
    )
    const menu = screen.getByTestId('preview-menu')
    expect(within(menu).getAllByRole('button')).toHaveLength(template.bounds.length)
    fireEvent.click(within(menu).getAllByRole('button')[0]!)
    expect(onSelect).toHaveBeenCalledWith(0)
  })

  // สเปกงานนี้ #5 — CanvasEditor เองไม่แตะ usePort (ต้อง render ได้โดยไม่มี PortProvider ครอบ)
  // Preview จึงเป็นคนดึงสีจากธีมของ Strapi (usePort().theme) แล้วส่งต่อลงไปให้ ต้องแดงถ้ามีใครลืม
  // ส่งต่อ (เช่นลบพร็อพ theme ตอนเรียก CanvasEditor ใน Preview.tsx ทิ้ง) แล้วเงียบ ๆ กลับไปใช้ค่า
  // ดีฟอลต์ธีมสว่างเสมอไม่ว่า Strapi จะอยู่ธีมไหน
  it('ส่งสีจากธีมของ Strapi ต่อให้ CanvasEditor จริง ไม่ใช่ใช้ค่าดีฟอลต์เสมอ', () => {
    const darkPort = createStubPort({
      t: (k) => k,
      theme: { border: '#4a4a6a', surface: '#32324d', strongText: '#ffffff', mutedText: '#a5a5ba' },
    })
    render(
      <PortProvider value={darkPort}>
        <Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />
      </PortProvider>,
    )
    expect(screen.getByTestId('rich-menu-canvas').style.backgroundColor).toBe('rgb(50, 50, 77)') // #32324d
  })

  // ผู้เรียกที่ต้องการแค่ภาพ (ไม่ส่ง onSelect) ต้องยังได้ภาพเหมือนเดิม ไม่ใช่ canvas ที่กดแล้วพัง
  it('ไม่ส่ง onSelect มา ก็ยังวาดได้ตามปกติ', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
    expect(screen.getByTestId('preview-menu')).toBeInTheDocument()
  })

  // ส่วนนี้เพิ่มหลัง Task 17 (กรอบ iPhone) — ครอบคลุมเฉพาะส่วนที่มีความหมาย (เนื้อหา/การเข้าถึง
  // ได้) ไม่ใช่สี/ขนาดพิกเซลของกรอบ ซึ่งจะพังทุกครั้งที่มีคน restyle ใหม่โดยไม่ได้พิสูจน์พฤติกรรม
  // อะไรเพิ่มเลย (ดูคอมเมนต์ในสเปกของงานนี้)
  describe('กรอบ iPhone', () => {
    it('ชื่อบัญชีของหัวแชทแสดงอยู่จริง — ไม่ใช่ของตกแต่งที่ซ่อนจาก screen reader', () => {
      wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
      const name = screen.getByText('preview.accountName')
      expect(name).toBeInTheDocument()
      expect(name).not.toHaveAttribute('aria-hidden')
    })

    // ตัวชิ้นแต่งของกรอบ (bezel, dynamic island, status bar, chevron, แบต ฯลฯ) ต้องถูกซ่อนจาก
    // screen reader ทุกชิ้น ไม่งั้นคนใช้ screen reader จะได้ยินรายละเอียดของกรอบมือถือปลอม
    // ปนอยู่กับเนื้อหาจริง — ไม่ใช้ testId ตามที่สเปกงานนี้บอกไว้ตรง ๆ ("New decorative elements
    // need no test ids") จึงนับจาก attribute aria-hidden ที่ต้องมีอยู่จริงแทน
    it('ชิ้นตกแต่งของกรอบ (bezel/island/status bar ฯลฯ) ถูก aria-hidden ไว้ทุกชิ้น', () => {
      const { container } = wrap(
        <Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />,
      )
      expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
    })

    // ยามสำคัญที่สุดของ Task 17 ส่วนนี้: ชิ้นตกแต่งรอบข้าง (status bar/หัวแชท/วอลเปเปอร์) ต้อง
    // เป็น sibling ของ preview-menu ไม่ใช่บรรพบุรุษที่ aria-hidden ทับลงมา — getByRole ของ
    // testing-library กรอง element ที่ inaccessible (ตัวเองหรือบรรพบุรุษมี aria-hidden) ออกโดย
    // ค่าเริ่มต้นอยู่แล้ว ถ้าใครห่อ preview-menu ไว้ใต้กรอบที่ aria-hidden โดยไม่ได้ตั้งใจ เทสต์นี้
    // (และเทสต์ลากช่องด้านบนที่ query ผ่าน role เหมือนกัน) จะหาไม่เจอทันที ไม่ใช่แค่ผ่านลอย ๆ
    it('เมนูใน preview-menu ยังกดถึงได้จริงผ่าน role — ไม่มีบรรพบุรุษไหน aria-hidden ทับอยู่', () => {
      wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
      const menu = screen.getByTestId('preview-menu')
      expect(menu).not.toHaveAttribute('aria-hidden')
      expect(within(menu).getAllByRole('button')).toHaveLength(template.bounds.length)
    })
  })
})
