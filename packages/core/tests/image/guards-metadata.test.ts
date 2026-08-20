import { describe, expect, it, vi } from 'vitest'
import { UnsupportedImageError } from '../../src/errors.js'

// guards.test.ts ใช้รูปจริงล้วน ซึ่งไม่มีทางทำให้ sharp คืน metadata ที่มี width แต่ไม่มี height
// (ไฟล์ฟอร์แมตจริงมีสองค่านี้คู่กันเสมอ) การ์ด `if (!width || !height)` ใน guards.ts จึงมีอยู่
// สองครึ่ง — ครึ่ง `!width` ถูกคลุมแล้วผ่านรูปที่ metadata อ่านไม่ออก แต่ครึ่ง `!height` ยังไม่มีทาง
// พิสูจน์โดยไม่ mock sharp ตรง ๆ ตัดไฟล์นี้แยกจาก guards.test.ts เพราะ vi.mock ผูกกับทั้งไฟล์
// การ mock sharp ในไฟล์นี้จะไปกระทบเทสต์อื่นที่ต้องใช้ sharp จริงถ้าอยู่ไฟล์เดียวกัน
vi.mock('sharp', () => ({
  default: () => ({
    metadata: async () => ({ format: 'png', width: 100 }), // ไม่มี height เลย
  }),
}))

describe('inspectImage — ครึ่ง !height ของการ์ดขนาด (sharp ถูก mock)', () => {
  it('ปฏิเสธเมื่อ metadata มี width แต่ไม่มี height', async () => {
    const { inspectImage } = await import('../../src/image/guards.js')
    await expect(inspectImage(Buffer.alloc(1))).rejects.toBeInstanceOf(UnsupportedImageError)
  })
})
