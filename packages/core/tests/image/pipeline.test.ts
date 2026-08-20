import { describe, expect, it, vi } from 'vitest'
import { ImageTooLargeError } from '../../src/errors.js'
import { MAX_OUTPUT_BYTES } from '../../src/image/guards.js'
import { normalize } from '../../src/image/pipeline.js'
import { noisePng, solidJpeg, transparentPng } from '../fixtures/make-fixtures.js'

// เทสต์นี้ทำ mozjpeg บีบไฟล์ noise ที่บีบยากจริง ~4s บนเครื่องนี้ และ CI runner ช้ากว่านี้
// 5000ms default ของ Vitest จึงเป็น false-positive hang detector ไม่ใช่ performance bar —
// ยกเฉพาะไฟล์นี้เป็น 15000ms ด้วย vi.setConfig (per-file, ไม่กระทบเทสต์อื่นที่เร็วอยู่แล้ว ~100 ตัว)
vi.setConfig({ testTimeout: 15_000 })

describe('normalize', () => {
  it('ย่อรูปมือถือใหญ่ให้เป็น 2500x1686 และไม่เกิน 1 MB', async () => {
    const result = await normalize(await solidJpeg(4000, 3000), 'large')
    expect(result.width).toBe(2500)
    expect(result.height).toBe(1686)
    expect(result.bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
  })

  it('ทำ compact เป็น 2500x843', async () => {
    const result = await normalize(await solidJpeg(3000, 1000), 'compact')
    expect(result.width).toBe(2500)
    expect(result.height).toBe(843)
  })

  it('ขยายรูปที่เล็กกว่าเป้าให้ได้ขนาดที่ LINE รับ', async () => {
    const result = await normalize(await solidJpeg(600, 400), 'large')
    expect(result.width).toBe(2500)
    expect(result.height).toBe(1686)
  })

  it('รูปโปร่งใสยังคงเป็น PNG เมื่อบีบลงได้', async () => {
    const result = await normalize(await transparentPng(1000, 700), 'large')
    expect(result.mime).toBe('image/png')
    expect(result.bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
  })

  it('รูป noise ที่บีบยากยังต้องออกมาไม่เกิน 1 MB', async () => {
    const result = await normalize(await noisePng(3000, 2000), 'large')
    expect(result.bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
    expect(['image/jpeg', 'image/png']).toContain(result.mime)
  })

  it('ขนาดที่ได้ต้องเป็นหนึ่งในขนาดที่ LINE รับเสมอ', async () => {
    const allowed = new Set(['2500x1686', '1200x810', '800x540'])
    const result = await normalize(await noisePng(3000, 2000), 'large')
    expect(allowed.has(`${result.width}x${result.height}`)).toBe(true)
  })

  it('mime ที่คืนมาตรงกับเนื้อไฟล์จริง', async () => {
    const sharp = (await import('sharp')).default
    const result = await normalize(await solidJpeg(3000, 2000), 'large')
    const actual = (await sharp(result.buffer).metadata()).format
    expect(result.mime).toBe(actual === 'png' ? 'image/png' : 'image/jpeg')
  })

  it('โยน ImageTooLargeError พร้อมขนาดจริง เมื่อบีบทุกทางแล้วยังไม่ผ่าน', async () => {
    // จำลองโดยตั้งเพดานต่ำมากผ่าน option ภายใน
    try {
      await normalize(await noisePng(3000, 2000), 'large', { maxBytes: 500 })
      expect.unreachable('normalize ต้องโยน ImageTooLargeError')
    } catch (e) {
      expect(e).toBeInstanceOf(ImageTooLargeError)
      expect((e as ImageTooLargeError).actualBytes).toBeGreaterThan(500)
    }
  })
})
