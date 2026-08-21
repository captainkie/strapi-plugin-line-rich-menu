import { describe, expect, it } from 'vitest'
import { PublishRateLimitedError } from '../../src/server/errors.js'
import { createRateLimiter } from '../../src/server/rate-limit.js'

function clock(start = 0) {
  let value = start
  return { now: () => value, advance: (ms: number) => { value += ms } }
}

describe('createRateLimiter', () => {
  it('ปล่อยผ่านได้เท่ากับ capacity แล้วบล็อกตัวถัดไป', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 3, refillPerMinute: 3, now: time.now })
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(false)
  })

  it('take โยน PublishRateLimitedError พร้อมเวลาที่ต้องรอจริง', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 60, now: time.now })
    limiter.take('ch1')
    try {
      limiter.take('ch1')
      throw new Error('ควรจะโยนไปแล้ว')
    } catch (error) {
      expect(error).toBeInstanceOf(PublishRateLimitedError)
      // 60 ต่อนาที = 1 ต่อวินาที → ต้องรอราว 1000 ms
      expect((error as PublishRateLimitedError).retryAfterMs).toBeGreaterThan(900)
      expect((error as PublishRateLimitedError).retryAfterMs).toBeLessThanOrEqual(1000)
    }
  })

  it('เติมคืนตามเวลาที่ผ่านไป', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 60, now: time.now })
    limiter.take('ch1')
    limiter.take('ch1')
    expect(limiter.tryTake('ch1')).toBe(false)
    time.advance(1000)
    expect(limiter.tryTake('ch1')).toBe(true)
  })

  it('ไม่เติมเกิน capacity ต่อให้ทิ้งไว้นานแค่ไหน', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 60, now: time.now })
    time.advance(60 * 60 * 1000)
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(false)
  })

  it('แต่ละ channel มีถังของตัวเอง', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 1, now: time.now })
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch2')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(false)
  })

  it('config ที่ตั้งผิดถูกดันขึ้นเป็นค่าต่ำสุด แทนที่จะล็อกทุกคนออกถาวร', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 0, refillPerMinute: 0, now: time.now })
    expect(limiter.tryTake('ch1')).toBe(true)
    time.advance(60_000)
    expect(limiter.tryTake('ch1')).toBe(true)
  })
})
