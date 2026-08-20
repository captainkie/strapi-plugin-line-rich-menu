export abstract class CoreError extends Error {
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/**
 * รายละเอียดรายฟิลด์ของการตรวจ payload
 *
 * ชั้น core ไม่ใช่คนตัดสินภาษาของผู้ใช้ (สเปก 11.7 และ 12) — `code` คือสิ่งที่ UI เอาไปแปล
 * ส่วน `message` เป็นอังกฤษไว้ให้ log กับนักพัฒนาอ่าน ไม่ใช่ข้อความสำหรับผู้ใช้ปลายทาง
 */
export interface ValidationIssue {
  /** ตำแหน่งในโครงสร้าง payload เช่น 'areas.0.bounds' หรือ '(root)' */
  path: string
  /** คีย์คงที่สำหรับแปล เช่น 'area_out_of_bounds' หรือ code ของ zod อย่าง 'too_small' */
  code: string
  /** อังกฤษเสมอ สำหรับ log และนักพัฒนา */
  message: string
}

export class ValidationError extends CoreError {
  readonly code = 'validation_failed'
  constructor(message: string, readonly issues: readonly ValidationIssue[] = []) {
    super(message)
  }
}

export class LineAuthError extends CoreError {
  readonly code = 'line_auth_failed'
}

export class LineRateLimitError extends CoreError {
  readonly code = 'line_rate_limited'
  constructor(readonly retryAfterSeconds: number) {
    super(`LINE rate limited, retry after ${retryAfterSeconds}s`)
  }
}

/** LINE ปฏิเสธ payload — ข้อความจาก LINE เก็บไว้ใน details ไม่ส่งต่อขึ้น UI ดิบ ๆ */
export class LineValidationError extends CoreError {
  readonly code = 'line_rejected_payload'
  constructor(readonly details: readonly string[] = []) {
    super('LINE rejected the rich menu payload')
  }
}

export class LineServerError extends CoreError {
  readonly code = 'line_server_error'
  constructor(readonly status: number) {
    super(`LINE returned ${status}`)
  }
}

export class UnsupportedImageError extends CoreError {
  readonly code = 'image_unsupported_format'
  constructor(readonly detectedFormat: string | undefined) {
    super(`Unsupported image format: ${detectedFormat ?? 'unknown'}`)
  }
}

export class ImageTooLargeError extends CoreError {
  readonly code = 'image_too_large'
  constructor(readonly actualBytes: number) {
    super(`Image is ${actualBytes} bytes after all compression attempts`)
  }
}

export class ImageBombError extends CoreError {
  readonly code = 'image_pixel_limit_exceeded'
  constructor(readonly pixels: number) {
    super(`Image declares ${pixels} pixels which exceeds the safety limit`)
  }
}

/**
 * sharp/libvips ล้มระหว่างประมวลผลรูปที่ผ่านการตรวจ metadata มาแล้ว
 * เช่นไฟล์ที่หัวสมบูรณ์แต่เนื้อขาดกลางคัน ซึ่ง `.metadata()` อ่านผ่านแต่ decode ไม่ได้
 *
 * ไม่พก message เดิมติดมาด้วย ด้วยเหตุผลเดียวกับ CryptoEnvelopeError ใน crypto.ts:
 * ข้อความจาก upstream ('VipsJpeg: ...') อาจสะท้อนข้อมูลที่ไม่ควรหลุด และสเปก 11.7
 * มีอยู่เพื่อไม่ให้ adapter ส่งข้อความดิบจาก upstream ขึ้น UI
 */
export class ImageProcessingError extends CoreError {
  readonly code = 'image_processing_failed'
  constructor() {
    super('Image processing failed')
  }
}

export class CryptoEnvelopeError extends CoreError {
  readonly code = 'crypto_envelope_invalid'
}
