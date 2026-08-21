import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThemeProvider, lightTheme } from '@strapi/design-system'
import { PortProvider, createStubPort } from '@fosivo/line-rich-menu-ui'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { primitives } from '../../src/admin/primitives.js'

/**
 * `renderToStaticMarkup` เตือนทุกครั้งที่เจอ `useLayoutEffect` ซึ่ง DS v1 ใช้ในเกือบทุก component
 * ที่นี่ไม่ได้ทำ hydration ให้พังได้ตามที่คำเตือนนั้นพูดถึง (แอดมินของ Strapi เป็น client-side ล้วน)
 * จึงกรองทิ้งเฉพาะข้อความนี้ข้อความเดียว — อย่างอื่นที่ React บ่นยังทะลุออกมาเหมือนเดิมทั้งหมด
 */
const SILENCED = 'Warning: useLayoutEffect does nothing on the server'
const realConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith(SILENCED)) return
    realConsoleError(...args)
  }
})
afterAll(() => { console.error = realConsoleError })

/**
 * ชุดคีย์ที่ต้องมี **ไม่ได้พิมพ์ไว้ที่นี่** — อ่านจาก stub ของ `packages/ui` แทน
 *
 * `createStubPort().ui` ถูกประกาศเป็น `UIPrimitives` ตรง ๆ ใน stub-port.tsx object literal
 * ที่ผูกกับ interface แบบนั้นจะขาดคีย์ไม่ได้ (TS ฟ้อง) และเกินคีย์ก็ไม่ได้ (excess property check)
 * คีย์ของมันจึงคือคีย์ของ `UIPrimitives` เป๊ะ ๆ ตลอดเวลา
 *
 * รายการที่ hand-copy ไว้ในเทสต์เป็นสิ่งที่พังเงียบมาแล้วรอบหนึ่ง: ตอน Plan 02 เปลี่ยน `Radio`
 * เดี่ยวเป็น `RadioGroup` + `Radio` รายการที่พิมพ์ไว้ยังเขียวอยู่ทั้งที่ adapter ขาด `RadioGroup`
 * ซึ่งเป็น runtime error ของ React ไม่ใช่ compile error
 */
const REQUIRED = Object.keys(createStubPort().ui).sort()

function draw(node: ReactNode): string {
  return renderToStaticMarkup(
    <ThemeProvider theme={lightTheme}>
      <PortProvider value={createStubPort({ t: (key) => `TH:${key}` })}>{node}</PortProvider>
    </ThemeProvider>,
  )
}

describe('primitives', () => {
  it('จับคู่ครบทุกตัวที่ UIPrimitives ประกาศ', () => {
    expect(Object.keys(primitives).sort()).toEqual(REQUIRED)
  })

  it('ชุดที่อ่านมาเป็นชุดหลัง Plan 02 จริง — RadioGroup มา Radio เดี่ยวไป', () => {
    expect(REQUIRED).toContain('RadioGroup')
    expect(REQUIRED).toContain('Radio')
  })

  it('ทุกตัวเป็น component ที่เรียกได้จริง ไม่ใช่ undefined', () => {
    for (const key of REQUIRED) {
      expect(primitives[key as keyof typeof primitives], key).toBeTypeOf('function')
    }
  })
})

describe('Typography', () => {
  // ไม่มี `as` แปลว่าหน้าจอไม่มีหัวข้อเลย คนใช้ screen reader ที่ไล่หน้าด้วยรายการหัวข้อได้หน้าเปล่า
  it('`as` ออกมาเป็น element จริง ไม่ใช่ถูกกลืน', () => {
    const html = draw(<primitives.Typography as="h2" variant="delta">หัวข้อ</primitives.Typography>)
    expect(html).toMatch(/<h2[^>]*>หัวข้อ<\/h2>/)
  })

  it('ไม่ระบุ `as` ก็ยังเป็น span เหมือน stub', () => {
    expect(draw(<primitives.Typography>ข้อความ</primitives.Typography>)).toMatch(/<span[^>]*>ข้อความ<\/span>/)
  })
})

describe('TextInput', () => {
  // token ของ LINE ที่ไม่มี autocomplete จะถูกเบราว์เซอร์เสนอให้ "บันทึกรหัสผ่าน" แล้วซิงก์ข้ามเครื่อง
  it('type กับ autoComplete ไปถึง <input> จริง', () => {
    const html = draw(
      <primitives.TextInput
        name="accessToken" value="secret" onChange={() => {}}
        label="Access token" type="password" autoComplete="off"
      />,
    )
    expect(html).toContain('type="password"')
    // เทียบแบบไม่สนตัวพิมพ์: React 18 ปล่อย `autoComplete` ออกมาตามตัวสะกดที่รับมา ส่วนชื่อ
    // attribute ของ HTML ไม่สนตัวพิมพ์อยู่แล้ว เบราว์เซอร์จึงอ่านมันเป็น `autocomplete` ตามที่ต้องการ
    expect(html.toLowerCase()).toContain('autocomplete="off"')
    expect(html).toContain('value="secret"')
  })

  it('ไม่ระบุ type ก็ยังเป็น text', () => {
    const html = draw(<primitives.TextInput name="name" value="" onChange={() => {}} label="ชื่อ" />)
    expect(html).toContain('type="text"')
  })

  /**
   * `label` ของ port เป็น optional แต่ TextInput ของ DS v1 `throw` ทันทีถ้าไม่มีทั้ง `label`
   * และ `aria-label` — adapter จึงต้องมีชื่อสำรองให้เสมอ ไม่งั้นทั้งหน้าขาวตอน render
   */
  it('ไม่มี label ก็ไม่พังทั้งหน้า — ใช้ name เป็นชื่อสำรอง', () => {
    const html = draw(<primitives.TextInput name="startAt" value="" onChange={() => {}} />)
    expect(html).toContain('aria-label="startAt"')
  })
})

describe('DatePicker / TimePicker', () => {
  // สเปกงานนี้ #4 — ยืมปฏิทินของ DS v1 (DatePickerField ห่อ Field ให้เองครบ) แทนวาดเอง
  it('DatePicker วาด label ออกมาให้อ่านได้', () => {
    const html = draw(
      <primitives.DatePicker name="startDate" value={new Date(2026, 7, 20)} onChange={() => {}} label="วันที่เริ่ม" />,
    )
    expect(html).toContain('วันที่เริ่ม')
  })

  it('DatePicker ไม่มี label ก็ไม่พังทั้งหน้า — ใช้ name เป็นชื่อสำรอง เหมือน TextInput', () => {
    const html = draw(<primitives.DatePicker name="startDate" value={null} onChange={() => {}} />)
    expect(html).toContain('aria-label="startDate"')
  })

  it('DatePicker วาด error ที่ส่งมาให้อ่านได้ ไม่ใช่ถูกกลืน', () => {
    const html = draw(
      <primitives.DatePicker name="startDate" value={null} onChange={() => {}} label="วันที่เริ่ม" error="ผิดพลาด" />,
    )
    expect(html).toContain('ผิดพลาด')
  })

  // ค่าที่แสดงจริงของ TimePicker (`textValue`) มาจาก `useLayoutEffect` ภายใน DS v1 ซึ่งไม่ทำงานบน
  // renderToStaticMarkup (ดูคอมเมนต์ `SILENCED` ที่หัวไฟล์) — เทสต์นี้จึงเช็คได้แค่ label กับว่า
  // `name` ไปถึง <input> จริง ไม่ใช่ค่าที่แสดงบนจอ (ต้องพิสูจน์ทางอื่นถ้าจะเช็คค่าแสดงจริง)
  it('TimePicker วาด label และส่ง name ไปถึง <input> จริง', () => {
    const html = draw(
      <primitives.TimePicker name="startTime" value="09:05" onChange={() => {}} label="เวลาเริ่ม" />,
    )
    expect(html).toContain('เวลาเริ่ม')
    expect(html).toContain('name="startTime"')
  })

  it('TimePicker ไม่มี label ก็ไม่พังทั้งหน้า — ใช้ name เป็นชื่อสำรอง', () => {
    const html = draw(<primitives.TimePicker name="startTime" value="" onChange={() => {}} />)
    expect(html).toContain('aria-label="startTime"')
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
    const html = draw(group)
    const legend = /<legend[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/legend>/.exec(html)

    expect(legend, 'ต้องมี <legend> ที่มี id').not.toBeNull()
    expect(legend![2]).toContain('ป้ายแถบเมนู')
    expect(html).toContain(`aria-labelledby="${legend![1]!}"`)
    expect(html).toContain('role="radiogroup"')
  })

  it('สมาชิกได้ name ของกลุ่ม และตัวที่ตรงกับ value ของกลุ่มถูกเลือกอยู่ตัวเดียว', () => {
    const html = draw(group)
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html.match(/name="mode"/g)).toHaveLength(2)
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(/value="custom"[^>]*aria-checked="true"|aria-checked="true"[^>]*value="custom"/.test(html)).toBe(true)
  })

  it('Radio ที่วางไว้นอกกลุ่มพังทันที ไม่ใช่กลายเป็นปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น', () => {
    expect(() => draw(<primitives.Radio value="a">A</primitives.Radio>)).toThrow(/RadioGroup/)
  })
})

describe('Button / IconButton', () => {
  it('testId ลงบน <button> ที่กดได้จริง พร้อม disabled และ type', () => {
    const html = draw(
      <primitives.Button testId="save" disabled type="submit" variant="danger">บันทึก</primitives.Button>,
    )
    expect(html).toMatch(/<button[^>]*data-testid="save"/)
    expect(html).toMatch(/<button[^>]*disabled/)
    expect(html).toMatch(/<button[^>]*type="submit"/)
  })

  /**
   * `IconButton` ของ DS v1 ทำ `cloneElement` กับลูกของมัน — ลูกที่เป็นสตริง (ซึ่ง `AreaList`
   * ของ Plan 02 ส่งมาจริง: `☰` กับ `⛶`) ทำให้ React โยนทิ้งทันที adapter จึงต้องห่อให้ก่อน
   */
  it('รับลูกที่เป็นสตริงล้วนได้ — AreaList ส่ง glyph มาตรง ๆ ไม่ได้ห่อ element ให้', () => {
    const html = draw(
      <primitives.IconButton label="รายการ" testId="view-list" onClick={() => {}}>☰</primitives.IconButton>,
    )
    expect(html).toContain('☰')
    expect(html).toContain('data-testid="view-list"')
    expect(html).toContain('รายการ')
  })
})

describe('Page', () => {
  // ยามคู่กับเทสต์ "จับคู่ครบทุกตัว" ข้างบน — completeness เช็คแค่ว่า key มีอยู่และเป็นฟังก์ชัน
  // ไม่เคยเรียกมันจริง `Page` ที่ลืมวาง `children` ไว้ (เช่น implement แล้วส่ง children ต่อผิดจุด)
  // จะยังผ่าน completeness ได้สบาย ๆ ทั้งที่หน้าจอทุกหน้าที่ห่อด้วย Page จะว่างเปล่า
  it('วาด title เป็น heading จริงและวาด children ให้ครบ ไม่ใช่กลืนทิ้ง', () => {
    const html = draw(
      <primitives.Page title="หัวข้อหน้า">
        <span>เนื้อหาหน้า</span>
      </primitives.Page>,
    )
    expect(html).toMatch(/<h1[^>]*>หัวข้อหน้า<\/h1>/)
    expect(html).toContain('เนื้อหาหน้า')
  })

  it('วาด actions ที่ส่งมาด้วย ไม่ใช่แค่ title กับ children', () => {
    const html = draw(
      <primitives.Page title="หัวข้อ" actions={<button type="button">save</button>}>
        เนื้อหา
      </primitives.Page>,
    )
    expect(html).toContain('>save<')
  })
})

describe('ข้อความที่ผู้ใช้เห็นซึ่ง DS v1 บังคับให้ adapter เป็นคนตั้ง', () => {
  // สเปก §12 — ห้าม hardcode ข้อความที่ผู้ใช้เห็น แม้แต่ aria-label ของปุ่มปิด Alert
  it('closeLabel ของ Alert มาจาก port.t ไม่ใช่สตริงอังกฤษที่ฝังไว้', () => {
    const html = draw(<primitives.Alert variant="danger" title="พัง">รายละเอียด</primitives.Alert>)
    expect(html).toContain('aria-label="TH:common.close"')
  })

  it('ป้าย on/off ของ Toggle มาจาก port.t เช่นกัน', () => {
    const html = draw(
      <primitives.Toggle name="outlines" checked onChange={() => {}} label="แสดงกรอบ" />,
    )
    expect(html).toContain('TH:common.on')
    expect(html).toContain('TH:common.off')
  })
})
