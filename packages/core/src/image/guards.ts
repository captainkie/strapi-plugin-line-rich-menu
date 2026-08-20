import sharp, { type Metadata } from 'sharp'
import { ImageBombError, UnsupportedImageError } from '../errors.js'

/** ~100 ล้านพิกเซล ประมาณ 400 MB ถ้า decode เป็น RGBA — เกินนี้ถือว่าจงใจโจมตี */
export const MAX_INPUT_PIXELS = 100_000_000
export const MAX_OUTPUT_BYTES = 1_048_576

export interface ImageFacts {
  format: 'jpeg' | 'png'
  width: number
  height: number
  hasAlpha: boolean
}

/**
 * อ่าน metadata อย่างเดียว ยังไม่ decode พิกเซล
 * ทำให้ปฏิเสธ decompression bomb ได้ก่อนที่หน่วยความจำจะถูกจอง
 */
export async function inspectImage(input: Buffer): Promise<ImageFacts> {
  let metadata: Metadata
  try {
    metadata = await sharp(input, { limitInputPixels: false }).metadata()
  } catch {
    throw new UnsupportedImageError(undefined)
  }

  const { format, width, height } = metadata
  if (format !== 'jpeg' && format !== 'png') throw new UnsupportedImageError(format)
  if (!width || !height) throw new UnsupportedImageError(format)
  if (width * height > MAX_INPUT_PIXELS) throw new ImageBombError(width * height)

  return { format, width, height, hasAlpha: metadata.hasAlpha === true }
}
