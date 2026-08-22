import { describe, expect, it } from 'vitest'
import { saveMenu } from '../src/server/menu-write.js'
import type { Services } from '../src/server/container.js'
import type { MenuInput } from '../src/server/validation.js'
import type { ImageStore, ListParams, Repo, RichMenuRow, ScheduleRow } from '@fosivo/line-rich-menu-core'

/** repo ในหน่วยความจำที่รองรับเฉพาะ filter แบบเท่ากับ ซึ่งเป็นทั้งหมดที่ `saveMenu` ใช้จริง */
function fakeRepo<T extends { id: string }>(seed: T[] = []): Repo<T> & { rows: T[] } {
  const rows = [...seed]
  let next = seed.length + 1
  return {
    rows,
    async findMany(params?: ListParams) {
      const filters = params?.filters ?? {}
      return rows.filter((row) => Object.entries(filters).every(
        ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
      ))
    },
    async findOne(id) { return rows.find((row) => row.id === id) ?? null },
    async create(data) {
      const row = { id: String(next++), ...data } as T
      rows.push(row)
      return row
    },
    async update(id, data) {
      const index = rows.findIndex((row) => row.id === id)
      if (index < 0) throw new Error('missing')
      rows[index] = { ...rows[index]!, ...data }
      return rows[index]!
    },
    async delete(id) {
      const index = rows.findIndex((row) => row.id === id)
      if (index >= 0) rows.splice(index, 1)
    },
  }
}

/**
 * `prepareImage` เรียก sharp จริงเพื่อ normalize (ไม่ใช่ของปลอม) — ต้องป้อนไบต์ที่เป็นรูปจริง
 * ไม่งั้น sharp จะโยน `UnsupportedImageError` ก่อนถึงจุดที่เทสต์นี้อยากพิสูจน์เลยด้วยซ้ำ
 */
async function realJpeg(): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp({ create: { width: 2500, height: 1686, channels: 3, background: { r: 20, g: 120, b: 210 } } })
    .jpeg({ quality: 85 })
    .toBuffer()
}

function fakeStore(source: Buffer): ImageStore {
  let nextId = 900
  return {
    async read() { return source },
    // เส้นทางเขียนไม่เคยอ่าน url — มีไว้ให้ครบสัญญาของ `ImageStore`
    async url() { return null },
    async write() { return { id: nextId++ } },
  }
}

function fakeServices(menus: Repo<RichMenuRow>, source: Buffer): Services {
  return {
    config: {} as never,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    channels: {} as never,
    menus,
    schedules: fakeRepo<ScheduleRow>(),
    // menu-write.ts ไม่แตะ members เลย (ไม่ใช่ path ของ link-members) — ใส่ไว้ให้ตรงกับ Services เฉย ๆ
    members: {} as never,
    audit: {} as never,
    limiter: {} as never,
    store: fakeStore(source),
    lock: {} as never,
    clientFor: () => ({}) as never,
  }
}

const baseInput: MenuInput = {
  name: 'เมนูหลัก',
  channelId: '10',
  size: 'large',
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom',
  selected: true,
  templateKey: null,
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
  imageFileId: 11,
  areaImages: [],
  aliasId: null,
  startAt: null,
  endAt: null,
}

/**
 * I5 — เคลียร์รูปที่ normalize ไว้เมื่อผู้ใช้ลบรูปต้นทางทิ้ง
 *
 * `menu-write.ts:107-115` เดิม: การล้าง `imageFileId` ทำให้ `changed` เป็น true (fingerprint
 * รวม `imageFileId` ด้วย) แต่การ์ด `saved.imageFileId !== null || saved.areaImages.length > 0`
 * กลายเป็น false พอดี — `prepareImage` จึงไม่ถูกเรียก และ `normalizedFileId`/`Mime`/`Size` เก่า
 * ยังค้างอยู่ใน DB ทั้งที่รูปต้นทางถูกลบไปแล้ว publish รอบถัดไปจึงยังส่งรูปที่ผู้ใช้เพิ่งลบให้ LINE
 */
describe('saveMenu — ลบรูปทิ้งต้องเคลียร์ผลลัพธ์ normalize เดิมด้วย (I5)', () => {
  it('สร้างเมนูพร้อมรูป → normalize เกิดจริง', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())

    const saved = await saveMenu(services, baseInput, null, null)

    expect(saved.normalizedFileId).not.toBeNull()
    expect(saved.normalizedMime).toBe('image/jpeg')
    expect(saved.normalizedSize).toEqual({ width: 2500, height: 1686 })
  })

  it('ลบรูปออกจากเมนูที่เคย normalize แล้ว → normalizedFileId/Mime/Size ต้องกลับเป็น null ทั้งสามฟิลด์', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    const created = await saveMenu(services, baseInput, null, null)
    expect(created.normalizedFileId).not.toBeNull() // sanity check ก่อนเทสต์ค่าที่ต้องเปลี่ยน

    const updated = await saveMenu(
      services,
      { ...baseInput, imageFileId: null, areaImages: [] },
      created,
      null,
    )

    expect(updated.imageFileId).toBeNull()
    expect(updated.normalizedFileId).toBeNull()
    expect(updated.normalizedMime).toBeNull()
    expect(updated.normalizedSize).toBeNull()
  })

  it('แก้ข้อความปุ่ม (ไม่แตะรูป) ไม่ทำให้ normalize รันใหม่ — fingerprint ไม่เปลี่ยน', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    const created = await saveMenu(services, baseInput, null, null)

    const updated = await saveMenu(
      services,
      { ...baseInput, chatBarText: 'ข้อความใหม่' },
      created,
      null,
    )

    expect(updated.normalizedFileId).toBe(created.normalizedFileId)
    expect(updated.normalizedMime).toBe(created.normalizedMime)
  })
})
