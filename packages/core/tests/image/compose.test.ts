import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { ImageProcessingError, UnsupportedImageError, ValidationError } from '../../src/errors.js'
import { compose, normalize } from '../../src/image/pipeline.js'
import { fakeImage, solidJpeg, truncatedJpeg } from '../fixtures/make-fixtures.js'

// compose ทำงานบนผืนผ้าใบ 2500x1686 จริงและเทสต์สุดท้ายเรียก normalize (mozjpeg) ต่อ —
// เผื่อ CI runner ช้ากว่าเครื่อง dev ด้วยเพดานเดียวกับ pipeline.test.ts (ดูเหตุผลที่นั่น)
vi.setConfig({ testTimeout: 15_000 })

const SIZE = { width: 2500, height: 1686 }

async function colourBlock(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer()
}

describe('compose', () => {
  it('ได้ผืนผ้าใบขนาดตามที่ขอ', async () => {
    const out = await compose([{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, image: await solidJpeg(100, 100) }], SIZE)
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(2500)
    expect(meta.height).toBe(1686)
  })

  it('วางแต่ละช่องตรงพิกัดที่กำหนด', async () => {
    const out = await compose(
      [
        { bounds: { x: 0, y: 0, width: 1250, height: 1686 }, image: await colourBlock(255, 0, 0) },
        { bounds: { x: 1250, y: 0, width: 1250, height: 1686 }, image: await colourBlock(0, 0, 255) },
      ],
      SIZE,
    )
    const raw = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => {
      const i = (y * raw.info.width + x) * raw.info.channels
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]]
    }
    expect(px(100, 100)).toEqual([255, 0, 0])
    expect(px(2400, 100)).toEqual([0, 0, 255])
  })

  it('ช่องที่ไม่ได้ใส่รูปเป็นพื้นขาว ไม่ใช่โปร่งใสที่กลายเป็นดำตอนแปลง JPEG', async () => {
    const out = await compose([{ bounds: { x: 0, y: 0, width: 100, height: 100 }, image: await colourBlock(255, 0, 0) }], SIZE)
    const raw = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    const i = (1000 * raw.info.width + 2000) * raw.info.channels
    expect([raw.data[i], raw.data[i + 1], raw.data[i + 2]]).toEqual([255, 255, 255])
  })

  it('ปฏิเสธไฟล์ที่ไม่ใช่รูปในช่องใดช่องหนึ่ง', async () => {
    await expect(
      compose([{ bounds: { x: 0, y: 0, width: 100, height: 100 }, image: fakeImage() }], SIZE),
    ).rejects.toBeInstanceOf(UnsupportedImageError)
  })

  it('ผลลัพธ์ผ่าน normalize แล้วไม่เกิน 1 MB', async () => {
    const out = await compose([{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, image: await solidJpeg(500, 500) }], SIZE)
    const normalized = await normalize(out, 'large')
    expect(normalized.bytes).toBeLessThanOrEqual(1_048_576)
  })

  // compose ไม่ได้เดินผ่าน schema.ts เลย จึงต้องบังคับ invariant เดียวกันเอง (isWithinCanvas)
  // ไม่งั้น bounds ที่ล้นกรอบจะโผล่เป็น composite error ดิบของ sharp แทน ValidationError ที่แปลได้
  it('ปฏิเสธช่องที่ bounds ล้นออกนอกผืนผ้าใบด้วย ValidationError code area_out_of_bounds', async () => {
    try {
      await compose(
        [{ bounds: { x: 2400, y: 0, width: 200, height: 100 }, image: await solidJpeg(100, 100) }],
        SIZE,
      )
      expect.unreachable('compose ต้องโยน ValidationError')
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      const err = e as ValidationError
      expect(err.issues[0]).toMatchObject({ path: 'parts.0.bounds', code: 'area_out_of_bounds' })
    }
  })

  it('ปฏิเสธ bounds ที่ตำแหน่งติดลบเช่นกัน แม้ width/height จะพอดีกรอบ', async () => {
    await expect(
      compose([{ bounds: { x: -10, y: 0, width: 100, height: 100 }, image: await solidJpeg(100, 100) }], SIZE),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  // หัวไฟล์สมบูรณ์ (ผ่าน inspectImage) แต่เนื้อขาดกลางคัน — decode จริงตอน resize ถึงจะล้ม
  // ต้องได้ ImageProcessingError ที่ห่อ error ดิบของ libvips ไว้ เหมือนที่ normalize ทำ
  it('ปฏิเสธด้วย ImageProcessingError เมื่อรูปในช่องหัวสมบูรณ์แต่เนื้อขาดกลางคัน', async () => {
    await expect(
      compose([{ bounds: { x: 0, y: 0, width: 100, height: 100 }, image: await truncatedJpeg() }], SIZE),
    ).rejects.toBeInstanceOf(ImageProcessingError)
  })
})
