import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineMark } from '../src/components/LineMark.js'

describe('LineMark', () => {
  // Task 22 item 1 — โลโก้จริงของ LINE ตัวนี้ฝัง inline เป็น base64 data URI (ดูคอมเมนต์เต็มที่หัว
  // LineMark.tsx) ไม่ใช่รูปทรงวาดเองอีกต่อไป ต้องแดงถ้ามีใครสลับ src กลับไปเป็น URL ภายนอกหรือ path
  // ไฟล์ธรรมดา (ทั้งสองอย่างพังตอน build เพราะ webpack ของ v4 กับ Vite ของ v5 จัดการ asset ไม่เหมือนกัน)
  it('วาด <img> จาก data URI ของโลโก้จริง — ไม่ใช่ URL ภายนอกหรือ path ไฟล์', () => {
    const { container } = render(<LineMark />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/))
  })

  // เป็นของตกแต่งเสมอ (ทั้งไอคอนเมนูและ empty-state มีข้อความ/label ของตัวเองอยู่ข้างๆ) —
  // ต้องไม่มีชื่อของตัวเองใน accessibility tree ไม่งั้น screen reader จะได้ยินซ้ำสองรอบ
  it('เป็นของตกแต่ง — alt ว่างและ aria-hidden ไว้เสมอ', () => {
    const { container } = render(<LineMark />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('aria-hidden', 'true')
  })

  it('ขนาดดีฟอลต์ 24 แต่ปรับได้ผ่านพร็อพ size', () => {
    const { container: withDefault } = render(<LineMark />)
    const defaultImg = withDefault.querySelector('img')
    expect(defaultImg).toHaveAttribute('width', '24')
    expect(defaultImg).toHaveAttribute('height', '24')

    const { container: withCustom } = render(<LineMark size={40} />)
    const customImg = withCustom.querySelector('img')
    expect(customImg).toHaveAttribute('width', '40')
    expect(customImg).toHaveAttribute('height', '40')
  })

  // ยืนยันว่า data URI ที่ฝังไว้ decode ออกมาเป็น PNG จริง ไม่ใช่สตริงเพี้ยน/ตัดครึ่งกลาง — ถ้ามีใคร
  // แก้ base64 ตรงนี้ด้วยมือแล้วพิมพ์ผิดสักตัว ไฟล์ที่ decode ได้จะไม่ใช่ PNG ที่ถูกต้องอีกต่อไป
  it('data URI decode ออกมาเป็นไฟล์ PNG ที่ถูกต้อง (magic bytes ตรง)', () => {
    const { container } = render(<LineMark />)
    const src = container.querySelector('img')!.getAttribute('src')!
    const base64 = src.slice(src.indexOf(',') + 1)
    const bytes = Buffer.from(base64, 'base64')
    // ลายเซ็นไฟล์ PNG มาตรฐาน 8 ไบต์แรก
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  })
})
