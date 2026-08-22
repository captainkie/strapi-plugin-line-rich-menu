import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider, usePort } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'

function Probe() {
  const port = usePort()
  return <span>{port.t('probe.key')}</span>
}

describe('UIPort', () => {
  it('component ที่อยู่ใน PortProvider เห็น port ที่ฉีดเข้าไป', () => {
    const port = createStubPort({ t: (key) => `แปลแล้ว:${key}` })
    render(<PortProvider value={port}><Probe /></PortProvider>)
    expect(screen.getByText('แปลแล้ว:probe.key')).toBeInTheDocument()
  })

  it('เรียก usePort นอก provider ต้องพังทันทีพร้อมบอกวิธีแก้ ไม่ใช่คืน undefined เงียบ ๆ', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/PortProvider/)
    spy.mockRestore()
  })

  /**
   * เดิมบรรทัดนี้เป็น `expect(Object.keys(port.ui).length).toBeGreaterThanOrEqual(15)` ซึ่ง
   * ไม่ได้พิสูจน์ชื่อของมันเลย: stub มี 16 ตัว การลบทิ้งหนึ่งตัวยังผ่าน และการเพิ่มตัวใหม่เข้า
   * `UIPrimitives` โดยลืม implement ในสอง adapter ก็ยังผ่าน — ยามที่เขียวโดยไม่ได้บังคับอะไร
   *
   * รายการเต็มที่เรียงแล้วบังคับทั้งสองทิศ และเมื่อรายการเปลี่ยน มันจะเปลี่ยนแบบที่เห็นใน diff
   */
  it('stub port มีครบทุกอย่างที่ UIPort ประกาศไว้', () => {
    const port = createStubPort()
    expect(Object.keys(port.ui).sort()).toEqual([
      'Alert', 'Button', 'Checkbox', 'DatePicker', 'Divider', 'Flex', 'IconButton', 'Loader',
      'Modal', 'Option', 'Page', 'Radio', 'RadioGroup', 'Select', 'TextInput', 'Textarea',
      'TimePicker', 'Toggle', 'Tooltip', 'Typography',
    ])
    for (const method of ['get', 'post', 'put', 'del'] as const) {
      expect(typeof port.http[method]).toBe('function')
    }
    expect(typeof port.toast).toBe('function')
    expect(typeof port.nav.push).toBe('function')
    expect(typeof port.t).toBe('function')
  })

  it('stub port รับ override เฉพาะบางส่วนได้ โดยไม่ต้องประกอบใหม่ทั้งก้อน', () => {
    const toast = vi.fn()
    const port = createStubPort({ toast })
    port.toast({ type: 'success', message: 'ok' })
    expect(toast).toHaveBeenCalledOnce()
    expect(typeof port.t).toBe('function')
  })

  it('t() ค่าเริ่มต้นแทน {name} ด้วยค่าจาก values', () => {
    const port = createStubPort()
    expect(port.t('hello {name}', { name: 'World' })).toBe('hello World')
  })

  it('t() ค่าเริ่มต้นคืน key เดิมเมื่อไม่มี values', () => {
    const port = createStubPort()
    expect(port.t('hello {name}')).toBe('hello {name}')
  })

  it('t() ค่าเริ่มต้นคืน key เดิมเมื่อ values ไม่มีอะไรตรงกับ placeholder ใน key', () => {
    const port = createStubPort()
    expect(port.t('template.picker.areaCount', { count: 6 })).toBe('template.picker.areaCount')
  })

  it('t() ค่าเริ่มต้นแทน {name} ทุกจุดที่ซ้ำกันในข้อความเดียว ไม่ใช่แค่จุดแรก', () => {
    const port = createStubPort()
    expect(port.t('{name} ของ {name}', { name: 'เมนู' })).toBe('เมนู ของ เมนู')
  })

  it('ui.Button ใส่ testId แล้วออกมาเป็น data-testid บน <button> จริง', () => {
    const port = createStubPort()
    render(<port.ui.Button testId="my-button">click</port.ui.Button>)
    expect(screen.getByTestId('my-button').tagName).toBe('BUTTON')
  })

  it('ui.Button ที่มี testId ยัง disabled ได้จริงบน element เดียวกัน', () => {
    const port = createStubPort()
    render(<port.ui.Button testId="my-button" disabled>click</port.ui.Button>)
    expect(screen.getByTestId('my-button')).toBeDisabled()
  })

  it('ui.Typography วาด element ตาม `as` ที่ระบุ และเป็น span เมื่อไม่ได้ระบุ', () => {
    const port = createStubPort()
    render(
      <>
        <port.ui.Typography as="h2">หัวข้อ</port.ui.Typography>
        <port.ui.Typography>ข้อความ</port.ui.Typography>
      </>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'หัวข้อ' })).toBeInTheDocument()
    expect(screen.getByText('ข้อความ').tagName).toBe('SPAN')
  })

  // stub เคยรับ alignItems/justifyContent/wrap มาแล้วทิ้ง — ผังสองคอลัมน์ของสเปก §5.7 จึงไม่เคย
  // ถูกวาดเป็นสองคอลัมน์เลย ทั้งในเทสต์และใน playground เทสต์นี้ยึด prop ทั้งสามไว้กับ style จริง
  it('ui.Flex วาด alignItems/justifyContent/wrap ที่รับมาจริง ไม่ใช่รับแล้วทิ้ง', () => {
    const port = createStubPort()
    render(
      <port.ui.Flex alignItems="flex-start" justifyContent="space-between" wrap="wrap" gap={4}>
        <span data-testid="flex-child">x</span>
      </port.ui.Flex>,
    )
    const box = screen.getByTestId('flex-child').parentElement!
    expect(box).toHaveStyle({
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    })
  })

  // สเปกงานนี้ #1 (Task 21) — `ui.Flex` เดิมไม่มีทางบอกได้เลยว่า "ลูกตัวนี้กินพื้นที่ที่เหลือ"
  // ก่อนหน้านี้จุดเรียกที่ต้องการผลแบบนี้ทำไม่ได้เลยนอกจากวาด style ดิบทับ ui.Flex ซึ่งรั่ว
  // รายละเอียด flexbox เข้าไปใน component ที่ไม่ควรรู้จักมัน — เทสต์นี้ยึดว่า `grow` ที่รับมา
  // ต้องลงเอยเป็น `flex-grow` จริงบน element เดียวกับที่ alignItems/justifyContent/wrap ลง
  // (ไม่ใช่แค่รับพร็อพแล้วทิ้งเหมือนที่เทสต์ด้านบนเคยจับได้กับสามพร็อพนั้นมาก่อน)
  it('ui.Flex วาด grow ที่รับมาเป็น flex-grow จริง ไม่ใช่รับแล้วทิ้ง', () => {
    const port = createStubPort()
    render(
      <port.ui.Flex grow={1}>
        <span data-testid="flex-grow-child">x</span>
      </port.ui.Flex>,
    )
    const box = screen.getByTestId('flex-grow-child').parentElement!
    expect(box).toHaveStyle({ flexGrow: '1' })
  })

  it('ui.Flex ไม่ระบุ grow เลย ต้องไม่ลง flex-grow: 0 มาแทน (ค่าเริ่มต้นของ CSS ต้องเป็นของจริง)', () => {
    const port = createStubPort()
    render(
      <port.ui.Flex>
        <span data-testid="flex-no-grow-child">x</span>
      </port.ui.Flex>,
    )
    const box = screen.getByTestId('flex-no-grow-child').parentElement!
    expect(box.style.flexGrow).toBe('')
  })

  // สมาชิกไม่ได้ประกาศ `name` เอง — กลุ่มเป็นคนแจกให้ ถ้า adapter ตัวไหนลืมส่งต่อ radio จะกลาย
  // เป็นสี่ตัวที่ไม่ได้อยู่กลุ่มเดียวกันในสายตาเบราว์เซอร์ ติ๊กพร้อมกันได้หมดโดยไม่มี error ใดฟ้อง
  it('ui.RadioGroup แจก name ของกลุ่มลงไปถึงสมาชิกทุกตัว', () => {
    const port = createStubPort()
    render(
      <port.ui.RadioGroup name="g" value="a" onChange={() => {}} label="กลุ่ม">
        <port.ui.Radio value="a">A</port.ui.Radio>
        <port.ui.Radio value="b">B</port.ui.Radio>
      </port.ui.RadioGroup>,
    )
    expect(screen.getByLabelText('A')).toHaveAttribute('name', 'g')
    expect(screen.getByLabelText('B')).toHaveAttribute('name', 'g')
  })

  it('ui.Radio ที่วางไว้นอก ui.RadioGroup พังทันที ไม่ใช่กลายเป็น radio ที่กดแล้วไม่มีอะไรเกิดขึ้น', () => {
    const port = createStubPort()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<port.ui.Radio value="a">A</port.ui.Radio>)).toThrow(/RadioGroup/)
    spy.mockRestore()
  })

  it('ui.IconButton ใส่ testId แล้วออกมาเป็น data-testid บน <button> จริง', () => {
    const port = createStubPort()
    render(<port.ui.IconButton label="icon" testId="my-icon-button">✕</port.ui.IconButton>)
    expect(screen.getByTestId('my-icon-button').tagName).toBe('BUTTON')
  })
})
