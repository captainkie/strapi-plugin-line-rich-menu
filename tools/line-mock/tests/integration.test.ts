import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  LineClient, normalize, plan, sizeNameFor, validateRichMenu,
} from '@fosivo/line-rich-menu-core'
import { createServer } from '../src/server.js'

let baseUrl = ''
const app = createServer()

beforeAll(async () => {
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (typeof address === 'object' && address) baseUrl = `http://127.0.0.1:${address.port}`
})
afterAll(() => app.close())

async function sourceImage(): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 1000, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

/**
 * เทสต์เดียวที่เดินสามโมดูลต่อกันจริง: validateRichMenu → normalize → publish
 *
 * ทุกโมดูลมีเทสต์เดี่ยวที่ผ่านหมดอยู่แล้ว แต่ไม่มีตัวไหนพิสูจน์ว่าประกอบกันแล้วยังถูกต้อง —
 * นี่คือจุดเดียวที่ "size trap" ของสเปก 4.1 จะโผล่ให้เห็น: `normalize` เลือกพิกเซลเองจาก
 * SIZE_LADDER (อาจลดขั้นถ้าบีบไม่ลง 1 MB) ส่วน payload.size ที่ส่งให้ LINE (ทั้งตอน validate/create
 * และตอนอัปรูป) ต้องคำนวณให้ตรงกับผลจริงของ normalize ไม่ใช่เดาไว้ก่อนแยกจากกัน ไม่งั้นรูปที่อัป
 * กับเมนูที่ LINE ถือ (`payload.size`) จะกลายเป็นคนละขนาด
 *
 * ทางที่ถูกคือเรียก normalize ก่อนเสมอ (ตอนอัปโหลด ตามสเปก 4.3 — ไม่ใช่ตอน publish) แล้วใช้
 * width/height ที่มันคืนมาเป็น payload.size ตรง ๆ `sizeNameFor` (ข้อ E) มีไว้ให้ฝั่งเรียกยืนยัน
 * ว่าพิกเซลที่ได้ยังตรงกับ `RichMenuSizeName` ที่ผู้ใช้ตั้งไว้ใน DB โดยไม่ต้อง hardcode ตารางเอง
 */
describe('integration: validateRichMenu → normalize → publish ผ่าน tools/line-mock', () => {
  it('ขนาดรูปที่อัปจริงตรงกับ size ที่ประกาศไว้ตอน create เป๊ะ', async () => {
    const client = new LineClient({ accessToken: 'anything', apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })

    // 1) normalize ก่อนเสมอ (ตามสเปก 4.3) — ได้พิกเซลจริงที่จะใช้เป็น payload.size
    const image = await normalize(await sourceImage(), 'compact')
    expect(sizeNameFor({ width: image.width, height: image.height })).toBe('compact')

    const payload = {
      size: { width: image.width, height: image.height },
      selected: false,
      name: 'integration menu',
      chatBarText: 'menu',
      areas: [{
        bounds: { x: 0, y: 0, width: image.width, height: image.height },
        action: { type: 'message' as const, text: 'hi' },
      }],
    }

    // 2) validateRichMenu ของ core (zod) ต้องผ่านก่อนแตะ network เลย
    const validated = validateRichMenu(payload)

    // ยืนยันลำดับขั้นตามที่ publish/machine.ts วางแผนไว้จริง — validate → create → uploadImage
    const steps = plan({ setAsDefault: false })
    expect(steps.map((s) => s.kind)).toEqual(['validate', 'create', 'uploadImage'])

    // 3) publish จริงกับ line-mock ตามลำดับของ plan()
    await client.validateRichMenu(validated)
    const id = await client.createRichMenu(validated)
    await client.uploadContent(id, image.buffer, image.mime)

    const stored = (await fetch(`${baseUrl}/v2/bot/richmenu/${id}`, {
      headers: { authorization: 'Bearer anything' },
    }).then((r) => r.json())) as { image?: { width: number; height: number } }

    // การยืนยันเดียวที่เป็นประเด็นของข้อ E: รูปที่อัปจริงต้องมีขนาดตรงกับ size ที่ menu ประกาศไว้เป๊ะ
    expect(stored.image).toBeDefined()
    expect(stored.image?.width).toBe(payload.size.width)
    expect(stored.image?.height).toBe(payload.size.height)
  })

  it('ทำเหมือนกันกับ large เพื่อยืนยันว่าไม่ใช่แค่ compact ที่ตรง', async () => {
    const client = new LineClient({ accessToken: 'anything', apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })

    const image = await normalize(await sourceImage(), 'large')
    expect(sizeNameFor({ width: image.width, height: image.height })).toBe('large')

    const payload = {
      size: { width: image.width, height: image.height },
      selected: false,
      name: 'integration menu (large)',
      chatBarText: 'menu',
      areas: [{
        bounds: { x: 0, y: 0, width: image.width, height: image.height },
        action: { type: 'message' as const, text: 'hi' },
      }],
    }
    const validated = validateRichMenu(payload)

    await client.validateRichMenu(validated)
    const id = await client.createRichMenu(validated)
    await client.uploadContent(id, image.buffer, image.mime)

    const stored = (await fetch(`${baseUrl}/v2/bot/richmenu/${id}`, {
      headers: { authorization: 'Bearer anything' },
    }).then((r) => r.json())) as { image?: { width: number; height: number } }

    expect(stored.image?.width).toBe(payload.size.width)
    expect(stored.image?.height).toBe(payload.size.height)
  })
})
