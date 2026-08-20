export abstract class CoreError extends Error {
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends CoreError {
  readonly code = 'validation_failed'
  constructor(message: string, readonly issues: readonly string[] = []) {
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

export class CryptoEnvelopeError extends CoreError {
  readonly code = 'crypto_envelope_invalid'
}
