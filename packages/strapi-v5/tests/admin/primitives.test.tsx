// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DesignSystemProvider } from '@strapi/design-system'
import { PortProvider, createStubPort } from '@fosivo/line-rich-menu-ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { primitives } from '../../admin/src/primitives.js'

afterEach(cleanup)

/**
 * ต่างจาก v4 ที่ใช้ `renderToStaticMarkup` — DS v2 วางอยู่บน Radix ซึ่ง `Modal` และ `Tooltip`
 * วาดผ่าน portal และ `Select`/`Radio` อาศัย pointer/ResizeObserver การ render บนเซิร์ฟเวอร์
 * จึงคืน markup ว่างสำหรับตัวที่สำคัญที่สุด testing-library บน jsdom เป็นวิธีเดียวที่มองเห็น
 * ของจริง (polyfill ที่ Radix ต้องการอยู่ที่ tests/setup-dom.ts)
 */
function draw(node: ReactNode) {
  return render(
    <DesignSystemProvider>
      <PortProvider value={createStubPort({ t: (key) => `TH:${key}` })}>{node}</PortProvider>
    </DesignSystemProvider>,
  )
}

/**
 * ชุดคีย์ที่ต้องมีอ่านจาก stub ของ packages/ui ไม่ได้พิมพ์ไว้ที่นี่ — `createStubPort().ui`
 * ถูกประกาศเป็น `UIPrimitives` ตรง ๆ จึงขาดคีย์ไม่ได้และเกินคีย์ก็ไม่ได้ รายการที่ hand-copy
 * เคยพังเงียบมาแล้วรอบหนึ่งตอน Plan 02 เปลี่ยน `Radio` เดี่ยวเป็น `RadioGroup` + `Radio`
 */
const REQUIRED = Object.keys(createStubPort().ui).sort()

describe('primitives', () => {
  it('จับคู่ครบทุกตัวที่ UIPrimitives ประกาศ', () => {
    expect(Object.keys(primitives).sort()).toEqual(REQUIRED)
  })

  it('ทุกตัวเป็น component ที่เรียกได้จริง ไม่ใช่ undefined', () => {
    for (const key of REQUIRED) {
      expect(primitives[key as keyof typeof primitives], key).toBeTypeOf('function')
    }
  })
})

describe('Typography', () => {
  // DS v2 เปลี่ยนพร็อพ polymorphic จาก `as` เป็น `tag` — ด่านนี้จับ "การกลืน `as` ทิ้ง"
  // ซึ่งทำให้ทั้งหน้าไม่มีหัวข้อสักตัว (พิสูจน์แล้วด้วยการตั้ง `tag="span"` ตายตัวแล้วดูมันแดง)
  // ไม่ได้จับการส่ง `as` ต่อไปตรง ๆ เพราะ styled-components v6 รู้จัก `as` ของมันเองและยังคืน
  // element ที่ขอ — เสียแค่ attribute `tag` หลุดลง DOM กับคลาสของ Box หายไป ดูคอมเมนต์ข้อ 2
  // ที่หัวไฟล์ primitives.tsx
  it('`as` ของ port ออกมาเป็น element จริงผ่าน `tag` ของ DS v2', () => {
    const { container } = draw(<primitives.Typography as="h2" variant="delta">หัวข้อ</primitives.Typography>)
    expect(container.querySelector('h2')).toHaveTextContent('หัวข้อ')
  })

  it('ไม่ระบุ `as` ก็ยังเป็น span เหมือน stub', () => {
    const { container } = draw(<primitives.Typography>ข้อความ</primitives.Typography>)
    expect(container.querySelector('span')).toHaveTextContent('ข้อความ')
  })
})

describe('TextInput', () => {
  it('type กับ autoComplete ไปถึง <input> จริง', () => {
    draw(
      <primitives.TextInput
        name="accessToken" value="secret" onChange={() => {}}
        label="Access token" type="password" autoComplete="off"
      />,
    )
    const input = screen.getByLabelText('Access token')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveValue('secret')
  })

  it('ไม่ระบุ type ก็ยังเป็น text', () => {
    draw(<primitives.TextInput name="name" value="" onChange={() => {}} label="ชื่อ" />)
    expect(screen.getByLabelText('ชื่อ')).toHaveAttribute('type', 'text')
  })

  // DS v2 ถอด label/error/hint ออกจากตัวอินพุตแล้วย้ายไป Field.* — ช่องที่ไม่ถูกครอบด้วย
  // Field.Root จะไม่มีชื่อใน accessibility tree เลย ไม่ใช่แค่ "ไม่สวย"
  it('ไม่มี label ก็ยังมีชื่อ — ใช้ name เป็นชื่อสำรอง', () => {
    draw(<primitives.TextInput name="startAt" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('startAt')).toBeInTheDocument()
  })

  it('error ที่ส่งมาถูกวาดออกมาให้อ่านได้ ไม่ใช่ถูกกลืน', () => {
    draw(<primitives.TextInput name="name" value="" onChange={() => {}} label="ชื่อ" error="ห้ามว่าง" />)
    expect(screen.getByText('ห้ามว่าง')).toBeInTheDocument()
  })

  it('hint ที่ส่งมาถูกวาดออกมาเช่นกัน', () => {
    draw(<primitives.TextInput name="name" value="" onChange={() => {}} label="ชื่อ" hint="ใช้ภายในเท่านั้น" />)
    expect(screen.getByText('ใช้ภายในเท่านั้น')).toBeInTheDocument()
  })
})

describe('DatePicker / TimePicker', () => {
  // สเปกงานนี้ #4 — ยืมปฏิทินของ DS v2 แทนวาดเอง (ต้องห่อ Field.Root เอง ต่างจาก v4 — ดูคอมเมนต์
  // ข้อ 1 ที่หัวไฟล์ primitives.tsx)
  it('DatePicker มีชื่อจาก label และวาดค่าที่ตั้งไว้ออกมาให้อ่านได้', () => {
    draw(
      <primitives.DatePicker name="startDate" value={new Date(2026, 7, 20)} onChange={() => {}} label="วันที่เริ่ม" />,
    )
    const input = screen.getByLabelText('วันที่เริ่ม')
    expect(input).toBeInTheDocument()
    expect((input as HTMLInputElement).value).not.toBe('')
  })

  it('DatePicker ไม่มี label ก็ยังมีชื่อ — ใช้ name เป็นชื่อสำรอง', () => {
    draw(<primitives.DatePicker name="startDate" value={null} onChange={() => {}} />)
    expect(screen.getByLabelText('startDate')).toBeInTheDocument()
  })

  it('DatePicker วาด error ที่ส่งมาให้อ่านได้ ไม่ใช่ถูกกลืน', () => {
    draw(
      <primitives.DatePicker name="startDate" value={null} onChange={() => {}} label="วันที่เริ่ม" error="ผิดพลาด" />,
    )
    expect(screen.getByText('ผิดพลาด')).toBeInTheDocument()
  })

  // ช่องนี้เป็น combobox ที่พิมพ์ข้อความตรง ๆ ได้ (ไม่ต้องเปิดปฏิทิน — การเปิด popover ของ Radix
  // ต้องพึ่ง pointer capture ที่ jsdom ไม่รองรับครบ) พิมพ์วันที่ตามรูปแบบที่ placeholder บอก
  // (MM/DD/YYYY) แล้ว blur พิสูจน์ว่า onChange ของ port ต่อสายถึง DS จริง ได้ Date ไม่ใช่ undefined
  // ดิบของ DS หรือสตริงที่ไม่ได้แปลง
  it('พิมพ์วันที่แล้ว blur — onChange ของ port ได้ Date ที่พาร์สแล้ว ไม่ใช่ path ที่ไม่เดินสาย', async () => {
    const onChange = vi.fn()
    draw(<primitives.DatePicker name="startDate" value={null} onChange={onChange} label="วันที่เริ่ม" />)
    const input = screen.getByLabelText('วันที่เริ่ม')
    fireEvent.change(input, { target: { value: '08/20/2026' } })
    fireEvent.blur(input)
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const received = onChange.mock.calls[0]![0] as Date | null
    expect(received).toBeInstanceOf(Date)
    expect(received?.getFullYear()).toBe(2026)
  })

  it('TimePicker มีชื่อจาก label และวาดค่าที่ตั้งไว้ออกมาให้อ่านได้', () => {
    draw(<primitives.TimePicker name="startTime" value="09:05" onChange={() => {}} label="เวลาเริ่ม" />)
    const input = screen.getByLabelText('เวลาเริ่ม')
    expect(input).toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('09:05')
  })

  it('TimePicker ไม่มี label ก็ยังมีชื่อ — ใช้ name เป็นชื่อสำรอง', () => {
    draw(<primitives.TimePicker name="startTime" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('startTime')).toBeInTheDocument()
  })

  it('TimePicker วาด error ที่ส่งมาให้อ่านได้', () => {
    draw(
      <primitives.TimePicker name="startTime" value="" onChange={() => {}} label="เวลาเริ่ม" error="ผิดพลาด" />,
    )
    expect(screen.getByText('ผิดพลาด')).toBeInTheDocument()
  })
})

describe('RadioGroup + Radio', () => {
  const group = (
    <primitives.RadioGroup name="mode" value="custom" onChange={() => {}} label="ป้ายแถบเมนู">
      <primitives.Radio value="default">ค่าเริ่มต้น</primitives.Radio>
      <primitives.Radio value="custom">กำหนดเอง</primitives.Radio>
    </primitives.RadioGroup>
  )

  it('label เป็นชื่อของกลุ่มใน accessibility tree ไม่ใช่ข้อความลอย ๆ ข้าง ๆ', () => {
    draw(group)
    expect(screen.getByRole('radiogroup', { name: 'ป้ายแถบเมนู' })).toBeInTheDocument()
  })

  it('มีสมาชิกสองตัวและตัวที่ตรงกับ value ของกลุ่มถูกเลือกอยู่ตัวเดียว', () => {
    draw(group)
    const items = screen.getAllByRole('radio')
    expect(items).toHaveLength(2)
    expect(items.filter((item) => item.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    expect(screen.getByRole('radio', { checked: true })).toHaveAttribute('value', 'custom')
  })

  it('Radio ที่วางไว้นอกกลุ่มพังทันที ไม่ใช่กลายเป็นปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น', () => {
    // DS v2 คือ Radix — `Radio.Item` นอก `Radio.Group` โยน error ของตัวเองอยู่แล้ว
    // ยามของเราทำให้ข้อความบอกทางแก้แทนที่จะบอกชื่อ context ภายในของ Radix
    expect(() => draw(<primitives.Radio value="a">A</primitives.Radio>)).toThrow(/RadioGroup/)
  })
})

describe('Select', () => {
  it('มีชื่อจาก label และแสดงค่าที่เลือกอยู่', () => {
    draw(
      <primitives.Select name="type" value="message" onChange={() => {}} label="ชนิด">
        <primitives.Option value="message">ข้อความ</primitives.Option>
        <primitives.Option value="uri">ลิงก์</primitives.Option>
      </primitives.Select>,
    )
    const trigger = screen.getByRole('combobox', { name: 'ชนิด' })
    expect(trigger).toHaveTextContent('ข้อความ')
  })
})

describe('Button / IconButton', () => {
  it('testId ลงบน <button> ที่กดได้จริง พร้อม disabled และ type', () => {
    draw(<primitives.Button testId="save" disabled type="submit" variant="danger">บันทึก</primitives.Button>)
    const button = screen.getByTestId('save')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('type', 'submit')
  })

  // `AreaList` ของ Plan 02 ส่ง glyph เป็นสตริงล้วน (`☰`, `⛶`) มาเป็นลูก — DS v1 ต้องห่อให้ก่อน
  // เพราะมัน cloneElement ส่วน v2 รับสตริงได้ตรง ๆ เทสต์นี้ตรึงไว้ว่ามันยังรับได้จริง
  it('รับลูกที่เป็นสตริงล้วนได้ และชื่อของปุ่มมาจาก label', () => {
    draw(<primitives.IconButton label="รายการ" testId="view-list" onClick={() => {}}>☰</primitives.IconButton>)
    const button = screen.getByTestId('view-list')
    expect(button).toHaveAccessibleName('รายการ')
    expect(within(button).getByText('☰')).toBeInTheDocument()
  })
})

describe('Modal', () => {
  it('เปิดแล้ววาดหัวข้อเป็น heading จริงใน dialog', () => {
    draw(
      <primitives.Modal open onClose={() => {}} title="เลือก template" footer={<span>ท้าย</span>}>
        เนื้อหา
      </primitives.Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'เลือก template' })).toBeInTheDocument()
    expect(within(dialog).getByText('เนื้อหา')).toBeInTheDocument()
    expect(within(dialog).getByText('ท้าย')).toBeInTheDocument()
  })

  it('ปิดอยู่แล้วไม่มี dialog ใน DOM เลย', () => {
    draw(<primitives.Modal open={false} onClose={() => {}} title="เลือก template">เนื้อหา</primitives.Modal>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Page', () => {
  // ยามคู่กับเทสต์ "จับคู่ครบทุกตัว" ข้างบน — completeness เช็คแค่ว่า key มีอยู่และเป็นฟังก์ชัน
  // ไม่เคยเรียกมันจริง `Page` ที่ลืมวาง `children` ไว้ (เช่น implement แล้วส่ง children ต่อผิดจุด)
  // จะยังผ่าน completeness ได้สบาย ๆ ทั้งที่หน้าจอทุกหน้าที่ห่อด้วย Page จะว่างเปล่า
  it('วาด title เป็น heading จริงและวาด children ให้ครบ ไม่ใช่กลืนทิ้ง', () => {
    draw(
      <primitives.Page title="หัวข้อหน้า">
        <span>เนื้อหาหน้า</span>
      </primitives.Page>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'หัวข้อหน้า' })).toBeInTheDocument()
    expect(screen.getByText('เนื้อหาหน้า')).toBeInTheDocument()
  })

  it('วาด actions ที่ส่งมาด้วย ไม่ใช่แค่ title กับ children', () => {
    draw(
      <primitives.Page title="หัวข้อ" actions={<button type="button">save</button>}>
        เนื้อหา
      </primitives.Page>,
    )
    expect(screen.getByRole('button', { name: 'save' })).toBeInTheDocument()
  })
})

describe('ข้อความที่ผู้ใช้เห็นซึ่ง DS v2 บังคับให้ adapter เป็นคนตั้ง', () => {
  // สเปก §12 — ห้าม hardcode ข้อความที่ผู้ใช้เห็น แม้แต่ aria-label ของปุ่มปิด Alert
  // `closeLabel` ของ Alert ใน DS v2 เป็นพร็อพ **บังคับ** ไม่ใช่ optional เหมือน v1
  /**
   * ถามด้วย `getByRole(..., { name })` ไม่ใช่ `getByLabelText` — DS v2 ไม่ได้ตั้งชื่อปุ่มปิด
   * ด้วย `aria-label` แบบ v1 แต่วางข้อความไว้ใน `VisuallyHidden` ข้างในปุ่ม ซึ่ง `getByLabelText`
   * มองไม่เห็นเพราะมันดูแค่ label/aria-label/aria-labelledby/title ไม่ได้คำนวณ accessible name
   * จริง ๆ การถามด้วย role + name จึงตรงกับสิ่งที่ screen reader อ่านออกมามากกว่า
   */
  it('closeLabel ของ Alert มาจาก port.t ไม่ใช่สตริงอังกฤษที่ฝังไว้', () => {
    draw(<primitives.Alert variant="danger" title="พัง">รายละเอียด</primitives.Alert>)
    expect(screen.getByRole('button', { name: 'TH:common.close' })).toBeInTheDocument()
  })

  it('ป้าย on/off ของ Toggle มาจาก port.t เช่นกัน', () => {
    draw(<primitives.Toggle name="outlines" checked onChange={() => {}} label="แสดงกรอบ" />)
    expect(screen.getByText('TH:common.on')).toBeInTheDocument()
    expect(screen.getByText('TH:common.off')).toBeInTheDocument()
  })

  it('closeLabel ของ Modal ก็มาจาก port.t', () => {
    draw(<primitives.Modal open onClose={() => {}} title="หัวข้อ">เนื้อหา</primitives.Modal>)
    expect(screen.getByRole('button', { name: 'TH:common.close' })).toBeInTheDocument()
  })
})
