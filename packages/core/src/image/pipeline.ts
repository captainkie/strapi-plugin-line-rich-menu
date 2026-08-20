import sharp from 'sharp'
import { ImageTooLargeError } from '../errors.js'
import { SIZE_LADDER } from '../templates.js'
import type { RichMenuSizeName } from '../types.js'
import { MAX_OUTPUT_BYTES, inspectImage } from './guards.js'

export interface NormalizedImage {
  buffer: Buffer
  mime: 'image/jpeg' | 'image/png'
  width: number
  height: number
  bytes: number
}

export interface NormalizeOptions {
  /** ใช้ในเทสต์เพื่อบังคับให้เดินเส้นทางที่บีบไม่ลง */
  maxBytes?: number
}

const JPEG_QUALITY_STEPS = [90, 80, 70, 60] as const

export async function normalize(
  input: Buffer,
  sizeName: RichMenuSizeName,
  options: NormalizeOptions = {},
): Promise<NormalizedImage> {
  const maxBytes = options.maxBytes ?? MAX_OUTPUT_BYTES
  const facts = await inspectImage(input)
  let smallest = Number.POSITIVE_INFINITY

  for (const size of SIZE_LADDER[sizeName]) {
    const resized = sharp(input).resize(size.width, size.height, { fit: 'cover', position: 'centre' })

    if (facts.hasAlpha) {
      const png = await resized.clone().png({ compressionLevel: 9, palette: true }).toBuffer()
      smallest = Math.min(smallest, png.length)
      if (png.length <= maxBytes) {
        return { buffer: png, mime: 'image/png', width: size.width, height: size.height, bytes: png.length }
      }
    }

    for (const quality of JPEG_QUALITY_STEPS) {
      const jpeg = await resized
        .clone()
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      smallest = Math.min(smallest, jpeg.length)
      if (jpeg.length <= maxBytes) {
        return { buffer: jpeg, mime: 'image/jpeg', width: size.width, height: size.height, bytes: jpeg.length }
      }
    }
  }

  throw new ImageTooLargeError(smallest)
}
