import { describe, expect, it } from 'vitest'
import { combineDisplayAt, splitDisplayAt } from '../src/datetime.js'

describe('splitDisplayAt', () => {
  it('คืนคู่ว่างเมื่อ input เป็นสตริงว่าง', () => {
    expect(splitDisplayAt('')).toEqual({ date: null, time: '' })
  })

  it('คืนคู่ว่างเมื่อ parse ไม่ขึ้น — ข้อมูลเก่าที่ผิดรูปแบบไม่ทำให้ฟอร์มพัง', () => {
    expect(splitDisplayAt('not a date')).toEqual({ date: null, time: '' })
  })

  it('แยกวันที่และเวลา (padded) จาก ISO string', () => {
    const { date, time } = splitDisplayAt('2026-09-01T09:05:00.000Z')
    expect(date).toBeInstanceOf(Date)
    expect(time).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('combineDisplayAt', () => {
  it('คืนสตริงว่างเมื่อยังไม่มีวันที่ — เวลาอย่างเดียวไม่มีความหมาย', () => {
    expect(combineDisplayAt(null, '09:05')).toBe('')
    expect(combineDisplayAt(null, '')).toBe('')
  })

  it('รวมวันที่กับเวลาเป็น ISO datetime string ที่ Date parse กลับได้', () => {
    const date = new Date(2026, 8, 1) // เดือน 0-index — กันยายน
    const iso = combineDisplayAt(date, '09:05')
    expect(iso).not.toBe('')
    const roundTrip = new Date(iso)
    expect(roundTrip.getFullYear()).toBe(2026)
    expect(roundTrip.getMonth()).toBe(8)
    expect(roundTrip.getDate()).toBe(1)
    expect(roundTrip.getHours()).toBe(9)
    expect(roundTrip.getMinutes()).toBe(5)
  })

  it('เวลาว่างถือเป็นเที่ยงคืน (00:00) ของวันนั้น', () => {
    const date = new Date(2026, 8, 1)
    const iso = combineDisplayAt(date, '')
    const roundTrip = new Date(iso)
    expect(roundTrip.getHours()).toBe(0)
    expect(roundTrip.getMinutes()).toBe(0)
  })
})

describe('split แล้ว combine กลับ ต้องได้ค่าเดิม (round trip)', () => {
  it('ISO string ที่ผ่าน splitDisplayAt แล้ว combineDisplayAt กลับ ต้องเป็นวินาทีเดียวกัน', () => {
    const original = '2026-09-01T09:05:00.000Z'
    const { date, time } = splitDisplayAt(original)
    const roundTripped = combineDisplayAt(date, time)
    expect(new Date(roundTripped).getTime()).toBe(new Date(original).getTime())
  })

  it('สตริงว่าง round-trip กลับเป็นสตริงว่างเสมอ', () => {
    const { date, time } = splitDisplayAt('')
    expect(combineDisplayAt(date, time)).toBe('')
  })
})
