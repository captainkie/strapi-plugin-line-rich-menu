import { describe, expect, it } from 'vitest'
import {
  CoreError, ImageTooLargeError, LineRateLimitError, ValidationError,
} from '../src/errors.js'

describe('error taxonomy', () => {
  it('ทุก error มี code ที่ใช้เป็นคีย์ i18n ได้', () => {
    expect(new ValidationError('x').code).toBe('validation_failed')
    expect(new LineRateLimitError(30).code).toBe('line_rate_limited')
    expect(new ImageTooLargeError(2_000_000).code).toBe('image_too_large')
  })

  it('เป็นลูกของ CoreError และ Error ทั้งหมด', () => {
    const e = new ValidationError('x')
    expect(e).toBeInstanceOf(CoreError)
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('ValidationError')
  })

  it('error ของ rate limit พก retryAfterSeconds มาด้วย', () => {
    expect(new LineRateLimitError(45).retryAfterSeconds).toBe(45)
  })

  it('error ของรูปใหญ่เกินบอกขนาดจริงที่ได้ เพื่อให้ผู้ใช้รู้ว่าห่างแค่ไหน', () => {
    expect(new ImageTooLargeError(2_000_000).actualBytes).toBe(2_000_000)
  })
})
