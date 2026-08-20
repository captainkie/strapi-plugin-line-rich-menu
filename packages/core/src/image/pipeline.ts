import sharp from 'sharp'
import { ImageProcessingError, ImageTooLargeError, ValidationError } from '../errors.js'
import { SIZE_LADDER } from '../templates.js'
import type { Bounds, RichMenuSize, RichMenuSizeName } from '../types.js'
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

  // inspectImage อ่านแค่ metadata — ไฟล์ที่หัวสมบูรณ์แต่เนื้อขาดจะผ่านด่านนั้นไปได้
  // แล้วมาระเบิดตอน decode จริงตรงนี้ ถ้าไม่ห่อไว้ ข้อความดิบของ libvips จะทะลุขึ้น UI
  try {
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
  } catch {
    throw new ImageProcessingError()
  }

  throw new ImageTooLargeError(smallest)
}

export interface AreaImage {
  bounds: Bounds
  image: Buffer
}

/**
 * วางรูปของแต่ละช่องลงบนผืนผ้าใบขนาดเต็ม
 * พื้นหลังเป็นขาวทึบ ไม่ใช่โปร่งใส เพราะถ้าโปร่งใสแล้วถูกแปลงเป็น JPEG ทีหลังจะกลายเป็นดำ
 */
/** invariant เดียวกับที่ schema.ts บังคับกับ payload ก่อนส่งให้ LINE */
function isWithinCanvas(bounds: Bounds, size: RichMenuSize): boolean {
  return bounds.x >= 0
    && bounds.y >= 0
    && bounds.width > 0
    && bounds.height > 0
    && bounds.x + bounds.width <= size.width
    && bounds.y + bounds.height <= size.height
}

export async function compose(parts: readonly AreaImage[], size: RichMenuSize): Promise<Buffer> {
  // compose ไม่ได้เดินผ่าน schema จึงต้องบังคับ invariant เดียวกันเอง
  // ไม่งั้น bounds ที่ล้นกรอบจะโผล่เป็น composite error ดิบ ๆ ของ sharp แทนที่จะเป็น ValidationError
  parts.forEach((part, index) => {
    if (!isWithinCanvas(part.bounds, size)) {
      throw new ValidationError('area bounds fall outside the target canvas', [{
        path: `parts.${index}.bounds`,
        code: 'area_out_of_bounds',
        message: 'area falls outside the canvas',
      }])
    }
  })

  const layers = await Promise.all(
    parts.map(async (part) => {
      await inspectImage(part.image)
      try {
        const resized = await sharp(part.image)
          .resize(part.bounds.width, part.bounds.height, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer()
        return { input: resized, left: part.bounds.x, top: part.bounds.y }
      } catch {
        throw new ImageProcessingError()
      }
    }),
  )

  try {
    return await sharp({
      create: {
        width: size.width,
        height: size.height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(layers)
      .png()
      .toBuffer()
  } catch {
    throw new ImageProcessingError()
  }
}
