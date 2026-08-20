import { describe, expect, it } from 'vitest'
import { ImageBombError, UnsupportedImageError } from '../../src/errors.js'
import { MAX_INPUT_PIXELS, MAX_OUTPUT_BYTES, inspectImage } from '../../src/image/guards.js'
import { fakeImage, pngBomb, solidJpeg, transparentPng } from '../fixtures/make-fixtures.js'

describe('ยามความปลอดภัยของรูป', () => {
  it('ค่าคงที่ตรงกับข้อจำกัดของ LINE', () => {
    expect(MAX_OUTPUT_BYTES).toBe(1_048_576)
    expect(MAX_INPUT_PIXELS).toBe(100_000_000)
  })

  it('อ่านข้อมูล JPEG ที่ถูกต้องได้', async () => {
    const facts = await inspectImage(await solidJpeg(800, 600))
    expect(facts).toMatchObject({ format: 'jpeg', width: 800, height: 600, hasAlpha: false })
  })

  it('ตรวจเจอ alpha ใน PNG โปร่งใส', async () => {
    const facts = await inspectImage(await transparentPng(400, 300))
    expect(facts).toMatchObject({ format: 'png', hasAlpha: true })
  })

  it('ปฏิเสธไฟล์ที่ไม่ใช่รูป โดยดูเนื้อในไม่ใช่ชื่อไฟล์', async () => {
    await expect(inspectImage(fakeImage())).rejects.toBeInstanceOf(UnsupportedImageError)
  })

  it('ปฏิเสธรูปฟอร์แมตอื่นที่ LINE ไม่รับ', async () => {
    const sharp = (await import('sharp')).default
    const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
      .webp().toBuffer()
    await expect(inspectImage(webp)).rejects.toBeInstanceOf(UnsupportedImageError)
  })

  it('ปฏิเสธ decompression bomb ก่อนที่จะ decode พิกเซล', async () => {
    await expect(inspectImage(pngBomb())).rejects.toBeInstanceOf(ImageBombError)
  })

  it('bomb ต้องถูกปฏิเสธเร็ว ไม่ใช่ค้างจน process ตาย', async () => {
    const bomb = pngBomb()
    const started = process.hrtime.bigint()
    await expect(inspectImage(bomb)).rejects.toBeInstanceOf(ImageBombError)
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
    expect(elapsedMs).toBeLessThan(2000)
  })
})
