import { fireEvent, render, screen, within } from '@testing-library/react'
import { TEMPLATES } from '@fosivo/line-rich-menu-core/browser'
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
  const value = { title: '', startAt: '', endAt: '' }

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

  it('ช่วงเวลาแสดงผลอยู่ในฟอร์มเดียวกัน ไม่ใช่หน้าแยก', () => {
    wrap(<MainSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('editor.displayPeriod.start')).toBeInTheDocument()
    expect(screen.getByLabelText('editor.displayPeriod.end')).toBeInTheDocument()
  })

  it('ปุ่ม clear ล้างช่วงเวลาทั้งคู่ แต่ไม่แตะชื่อ', () => {
    const onChange = vi.fn()
    wrap(<MainSettings value={{ title: 'เมนู', startAt: '2026-08-20', endAt: '2026-08-26' }} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('clear-period'))
    expect(onChange).toHaveBeenCalledWith({ title: 'เมนู', startAt: '', endAt: '' })
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

  it('ข้อความแถบแชทว่าง ใช้ label default แทน', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="" expanded />)
    expect(screen.getByTestId('preview-chat-bar').textContent).toContain('chatBar.defaultLabel')
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

  // ผู้เรียกที่ต้องการแค่ภาพ (ไม่ส่ง onSelect) ต้องยังได้ภาพเหมือนเดิม ไม่ใช่ canvas ที่กดแล้วพัง
  it('ไม่ส่ง onSelect มา ก็ยังวาดได้ตามปกติ', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
    expect(screen.getByTestId('preview-menu')).toBeInTheDocument()
  })
})
