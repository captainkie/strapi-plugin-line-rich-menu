import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineMark } from '../src/components/LineMark.js'

describe('LineMark', () => {
  it('วาดสี่เหลี่ยมมนสีเขียว LINE เป็นพื้นหลัง — ไม่ใช่สี Strapi', () => {
    const { container } = render(<LineMark />)
    const rect = container.querySelector('rect')
    expect(rect).toHaveAttribute('fill', '#06C755')
  })

  // เป็นของตกแต่งเสมอ (ทั้งไอคอนเมนูและ empty-state มีข้อความ/label ของตัวเองอยู่ข้างๆ) —
  // ต้องไม่มีชื่อของตัวเองใน accessibility tree ไม่งั้น screen reader จะได้ยินซ้ำสองรอบ
  it('เป็นของตกแต่ง — aria-hidden ไว้เสมอ', () => {
    const { container } = render(<LineMark />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('ขนาดดีฟอลต์ 24 แต่ปรับได้ผ่านพร็อพ size', () => {
    const { container: withDefault } = render(<LineMark />)
    expect(withDefault.querySelector('svg')).toHaveAttribute('width', '24')

    const { container: withCustom } = render(<LineMark size={40} />)
    expect(withCustom.querySelector('svg')).toHaveAttribute('width', '40')
    expect(withCustom.querySelector('svg')).toHaveAttribute('height', '40')
  })

  it('ไม่มีข้อความ "LINE" หรือ path ที่ล้อกับโลโก้จริงของ LINE — วาดฟองแชทเรขาคณิตล้วน', () => {
    const { container } = render(<LineMark />)
    // มีแค่สอง element วาดภาพ (rect พื้นหลัง + path ฟองแชท) ไม่มี <text> หรือ <image> ที่อาจ
    // ใช้ฝังโลโก้จริงเข้ามา
    expect(container.querySelectorAll('rect, path')).toHaveLength(2)
    expect(container.querySelector('text')).not.toBeInTheDocument()
    expect(container.querySelector('image')).not.toBeInTheDocument()
  })
})
