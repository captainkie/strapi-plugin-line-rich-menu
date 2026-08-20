import { describe, expect, it } from 'vitest'
import {
  CoreError, ImageBombError, ImageProcessingError, ImageTooLargeError, LineAuthError,
  LineRateLimitError, LineServerError, LineValidationError, UnsupportedImageError,
  ValidationError, CryptoEnvelopeError, type ValidationIssue,
} from '../src/errors.js'

describe('error taxonomy', () => {
  it('ทุก error มี code ที่ใช้เป็นคีย์ i18n ได้ — เช็คทุกคลาส ไม่ใช่แค่บางตัว', () => {
    expect(new ValidationError('x').code).toBe('validation_failed')
    expect(new LineAuthError('x').code).toBe('line_auth_failed')
    expect(new LineRateLimitError(30).code).toBe('line_rate_limited')
    expect(new LineValidationError([]).code).toBe('line_rejected_payload')
    expect(new LineServerError(500).code).toBe('line_server_error')
    expect(new UnsupportedImageError('bmp').code).toBe('image_unsupported_format')
    expect(new ImageTooLargeError(2_000_000).code).toBe('image_too_large')
    expect(new ImageBombError(1_000_000_000).code).toBe('image_pixel_limit_exceeded')
    expect(new ImageProcessingError().code).toBe('image_processing_failed')
    expect(new CryptoEnvelopeError('x').code).toBe('crypto_envelope_invalid')
  })

  it('เป็นลูกของ CoreError และ Error ทั้งหมด', () => {
    const e = new ValidationError('x')
    expect(e).toBeInstanceOf(CoreError)
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('ValidationError')
  })

  it('error ของ rate limit พก retryAfterSeconds มาด้วย และ message บอกจำนวนวินาทีจริง', () => {
    const e = new LineRateLimitError(45)
    expect(e.retryAfterSeconds).toBe(45)
    expect(e.message).toBe('LINE rate limited, retry after 45s')
  })

  it('error ของรูปใหญ่เกินบอกขนาดจริงที่ได้ เพื่อให้ผู้ใช้รู้ว่าห่างแค่ไหน', () => {
    const e = new ImageTooLargeError(2_000_000)
    expect(e.actualBytes).toBe(2_000_000)
    expect(e.message).toBe('Image is 2000000 bytes after all compression attempts')
  })

  it('LineServerError พก status และ message บอก status code จริง', () => {
    const e = new LineServerError(503)
    expect(e.status).toBe(503)
    expect(e.message).toBe('LINE returned 503')
  })

  it('ImageBombError พกจำนวน pixel จริงใน message', () => {
    const e = new ImageBombError(999_999_999)
    expect(e.pixels).toBe(999_999_999)
    expect(e.message).toBe('Image declares 999999999 pixels which exceeds the safety limit')
  })

  it('UnsupportedImageError บอกฟอร์แมตที่ตรวจเจอจริงใน message', () => {
    expect(new UnsupportedImageError('bmp').message).toBe('Unsupported image format: bmp')
    expect(new UnsupportedImageError('bmp').detectedFormat).toBe('bmp')
  })

  it('UnsupportedImageError ที่ตรวจฟอร์แมตไม่ได้เลย บอกว่า unknown ไม่ใช่ undefined ดิบ ๆ', () => {
    expect(new UnsupportedImageError(undefined).message).toBe('Unsupported image format: unknown')
    expect(new UnsupportedImageError(undefined).detectedFormat).toBeUndefined()
  })

  // เหตุผลเดียวกับ CryptoEnvelopeError: ข้อความจาก upstream ไม่ควรถูกส่งต่อ (สเปก 11.7)
  it('ImageProcessingError ไม่พกข้อความดิบของ libvips ติดมาด้วย', () => {
    const e = new ImageProcessingError()
    expect(e.message).toBe('Image processing failed')
    expect(e.message).not.toMatch(/vips/i)
  })

  it('LineValidationError เก็บ message คงที่ และ details ว่างเป็นค่าเริ่มต้น', () => {
    const e = new LineValidationError()
    expect(e.message).toBe('LINE rejected the rich menu payload')
    expect(e.details).toEqual([])
    expect(new LineValidationError(['field: bad']).details).toEqual(['field: bad'])
  })

  it('ValidationError เก็บ issues ว่างเป็นค่าเริ่มต้นถ้าไม่ได้ส่งมา', () => {
    expect(new ValidationError('x').issues).toEqual([])
    const issues: ValidationIssue[] = [
      { path: 'areas.0.bounds', code: 'area_out_of_bounds', message: 'area falls outside the canvas' },
    ]
    expect(new ValidationError('x', issues).issues).toEqual(issues)
  })
})
