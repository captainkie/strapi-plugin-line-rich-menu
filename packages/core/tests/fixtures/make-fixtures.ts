import zlib from 'node:zlib'
import sharp from 'sharp'

/** รูปทึบสีเดียว — บีบง่ายมาก */
export async function solidJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 12, g: 90, b: 200 } } })
    .jpeg({ quality: 95 })
    .toBuffer()
}

/** noise เต็มเฟรม — บีบยากที่สุด ใช้ทดสอบว่าไล่ quality จริง */
export async function noisePng(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3)
  let seed = 1
  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    pixels[i] = seed & 0xff
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

/** PNG ที่มี alpha จริง */
export async function transparentPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.4 } } })
    .png()
    .toBuffer()
}

/**
 * PNG ที่ประกาศพิกเซลมหาศาลใน IHDR แต่ไฟล์เล็กนิดเดียว — decompression bomb ของจริง
 *
 * ห้ามสร้างด้วย sharp เพราะการสั่ง sharp วาดผืนผ้าใบ 25000x25000 จะจองหน่วยความจำ
 * ระดับกิกะไบต์ในเครื่องที่รันเทสต์เอง ซึ่งคือสิ่งที่เรากำลังจะทดสอบว่าต้องไม่เกิด
 * จึงประกอบ chunk เองให้ IHDR ประกาศขนาดใหญ่ ส่วน IDAT มีข้อมูลไม่กี่ไบต์
 */
export function pngBomb(width = 25000, height = 25000): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0)
    return Buffer.concat([length, typeBuf, data, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 0   // colour type: greyscale
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc(16))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ไฟล์ที่อ้างว่าเป็นรูปแต่เนื้อในไม่ใช่ */
export function fakeImage(): Buffer {
  return Buffer.from('นี่ไม่ใช่รูปภาพ แต่ตั้งชื่อว่า .png', 'utf8')
}
