import { compose, normalize } from '../image/pipeline.js'
import { COMPACT, LARGE } from '../templates.js'
import type { RichMenuSize, RichMenuSizeName } from '../types.js'
import { MenuNotReadyError } from './errors.js'
import type { AreaRecord } from './types.js'

/**
 * ปลั๊กอินไม่เก็บไฟล์เอง (สเปก §7.3) — อ่านและเขียนผ่าน upload provider ของ Strapi
 * adapter เป็นคน implement ตัวนี้ ชั้น service จึงไม่รู้ว่าเบื้องหลังเป็น local / S3 / Cloudinary
 */
export interface ImageStore {
  read(fileId: number): Promise<Buffer>
  write(input: { buffer: Buffer; mime: 'image/jpeg' | 'image/png'; filename: string }): Promise<{ id: number }>
  /**
   * url ของไฟล์สำหรับ "เอาไปแสดง" ไม่ใช่ "เอาไปประมวลผล" — `read()` คืนไบต์ ซึ่งเป็นสิ่งที่
   * publish ต้องการ แต่หน้าจอต้องการ url ให้ `<img>` ไปโหลดเอง
   *
   * ก่อนหน้านี้ไม่มีเมธอดนี้ และผลของมันคือดีเฟกต์ที่มองเห็นได้: `GET /menus/:id` คืนแค่
   * `imageFileId` เปิดเมนูเก่าที่มีรูปขึ้นมาแก้ ฟอร์มจึงขึ้นว่า "ยังไม่มีรูป" เสมอ (ดูคอมเมนต์ยาว
   * ที่ `saved` ใน pages/Editor.tsx ของทั้งสองอะแดปเตอร์ ซึ่งเป็นการชดเชยผลข้างเคียงของ
   * ช่องว่างนี้ ไม่ใช่ฟีเจอร์) และหน้ารายการกับพรีวิวก็วาดรูปที่ผู้ใช้อัปโหลดไว้ไม่ได้เลย
   *
   * คืน `null` เมื่อไฟล์ถูกลบไปจาก Media Library แล้ว ซึ่งเกิดขึ้นได้ตามปกติ — ไม่ใช่ข้อผิดพลาด
   * ที่ควรทำให้ทั้งรายการล้ม ต่างจาก `read()` ที่โยน `MenuNotReadyError` เพราะที่นั่นคือเส้นทาง
   * publish ซึ่งเดินต่อโดยไม่มีไบต์ไม่ได้
   */
  url(fileId: number): Promise<string | null>
}

export interface ImageSourceInput {
  sizeName: RichMenuSizeName
  imageFileId: number | null
  areaImages: readonly { index: number; fileId: number }[]
  areas: readonly AreaRecord[]
}

export interface PreparedImage {
  normalizedFileId: number
  normalizedMime: 'image/jpeg' | 'image/png'
  /** ขั้นบันไดที่รูป *ลงจริง* — `payload.size` ต้องมาจากค่านี้ ไม่ใช่จากที่ฟอร์มเชื่อ */
  normalizedSize: RichMenuSize
}

export function canvasFor(sizeName: RichMenuSizeName): RichMenuSize {
  return sizeName === 'large' ? LARGE : COMPACT
}

/**
 * ลายนิ้วมือของ "สิ่งที่ทำให้ผลของ normalize เปลี่ยน" เท่านั้น
 * `action` ของแต่ละช่องไม่อยู่ในนี้โดยตั้งใจ — แก้ข้อความปุ่มไม่ควรทำให้ต้องบีบรูปใหม่ 5 วินาที
 */
export function imageFingerprint(input: ImageSourceInput): string {
  return JSON.stringify([
    input.sizeName,
    input.imageFileId,
    [...input.areaImages].sort((a, b) => a.index - b.index).map((a) => [a.index, a.fileId]),
    input.areas.map((a) => [a.bounds.x, a.bounds.y, a.bounds.width, a.bounds.height]),
  ])
}

export async function prepareImage(
  deps: { store: ImageStore },
  input: ImageSourceInput,
  menuId: string,
): Promise<PreparedImage> {
  const canvas = canvasFor(input.sizeName)

  let source: Buffer
  if (input.areaImages.length > 0) {
    const parts = await Promise.all(input.areaImages.map(async (part) => {
      const area = input.areas[part.index]
      if (area === undefined) throw new MenuNotReadyError('no_areas')
      return { bounds: area.bounds, image: await deps.store.read(part.fileId) }
    }))
    source = await compose(parts, canvas)
  } else if (input.imageFileId !== null) {
    source = await deps.store.read(input.imageFileId)
  } else {
    throw new MenuNotReadyError('no_image')
  }

  const normalized = await normalize(source, input.sizeName)
  const extension = normalized.mime === 'image/png' ? 'png' : 'jpg'
  const { id } = await deps.store.write({
    buffer: normalized.buffer,
    mime: normalized.mime,
    filename: `rich-menu-${menuId}-${normalized.width}x${normalized.height}.${extension}`,
  })

  return {
    normalizedFileId: id,
    normalizedMime: normalized.mime,
    normalizedSize: { width: normalized.width, height: normalized.height },
  }
}
