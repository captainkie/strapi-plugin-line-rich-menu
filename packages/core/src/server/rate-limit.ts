import { PublishRateLimitedError } from './errors.js'

export interface RateLimiterOptions {
  capacity: number
  refillPerMinute: number
  /** ฉีดเข้ามาในเทสต์ได้ ไม่งั้นเทสต์ต้องนอนรอจริง */
  now?: () => number
}

export interface RateLimiter {
  /** โยน `PublishRateLimitedError` เมื่อถังหมด */
  take(key: string): void
  tryTake(key: string): boolean
}

interface Bucket { tokens: number; updatedAt: number }

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  // ดันขึ้นเป็นค่าต่ำสุดแทนการเชื่อค่าที่ส่งมา — `capacity: 0` จาก config ที่พิมพ์ผิด
  // แปลว่าไม่มีใคร publish ได้อีกเลยจนกว่าจะมีคนไปแก้ไฟล์ ซึ่งเป็นความล้มเหลวที่เงียบเกินไป
  const capacity = Math.max(1, Math.floor(options.capacity))
  const refillPerMs = Math.max(1, Math.floor(options.refillPerMinute)) / 60_000
  const now = options.now ?? Date.now

  // in-memory ต่อ process โดยตั้งใจ — สเปก §10 เลือกไม่พึ่ง Redis ทั้งโปรเจกต์
  // ผลคือระบบที่รันหลาย instance จะได้เพดานเท่ากับ capacity × จำนวน instance
  // ซึ่งยังห่างจาก rate limit จริงของ LINE มาก และ LineClient มี backoff รับอีกชั้น
  const buckets = new Map<string, Bucket>()

  function refill(key: string): Bucket {
    const at = now()
    const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: at }
    const gained = (at - bucket.updatedAt) * refillPerMs
    const next: Bucket = { tokens: Math.min(capacity, bucket.tokens + gained), updatedAt: at }
    buckets.set(key, next)
    return next
  }

  return {
    tryTake(key) {
      const bucket = refill(key)
      if (bucket.tokens < 1) return false
      bucket.tokens -= 1
      return true
    },
    take(key) {
      const bucket = refill(key)
      if (bucket.tokens < 1) {
        throw new PublishRateLimitedError(Math.ceil((1 - bucket.tokens) / refillPerMs))
      }
      bucket.tokens -= 1
    },
  }
}
