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
  audience: 'all',
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

/**
 * Task 13 fix round 3 (task-13-findings-2.md) — Critical: `menuInputSchema` เคย `.default('all')`
 * ทำให้ `input.audience` มีค่าเสมอแม้ caller ไม่ส่งมา แล้ว `saveMenu` เขียนมันลง patch แบบไม่มีเงื่อนไข
 * ผลคือแก้เมนูสมาชิกผ่าน editor (PUT body ไม่มีคีย์ `audience` เลย — ดู api.ts ของ ui) รีเซ็ต audience
 * เป็น 'all' เงียบ ๆ ทุกครั้ง แม้เมนูยัง live กับสมาชิกจริงอยู่ — เทสต์เดิมใน describe ก่อนหน้าไม่มีทาง
 * จับได้ เพราะทุกที่ที่เรียก saveMenu ส่ง `audience: 'all'` มาชัดเจนเสมอ (baseInput) ไม่เคยจำลอง body
 * ที่ไม่มีคีย์นี้เลย ซึ่งเป็นรูปทรงเดียวที่เกิดขึ้นจริงตอนแก้ไขผ่านฟอร์ม
 */
describe('saveMenu — audience: ไม่ส่งฟิลด์มาต้องแปลว่า "ไม่เปลี่ยน" ไม่ใช่ "ตั้งเป็น all" (Task 13 fix round 3)', () => {
  it('แก้เมนูสมาชิกด้วย body รูปทรงเดียวกับที่ editor ส่งจริง (ไม่มีคีย์ audience เลย) — audience เดิมต้องรอด', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    const created = await saveMenu(services, { ...baseInput, audience: 'members' }, null, null)
    expect(created.audience).toBe('members') // sanity check ก่อนพิสูจน์ค่าที่ต้องรอด

    // destructure คีย์ออกจริง ๆ ไม่ใช่ตั้งเป็น undefined ตรง ๆ —ต้องได้ object ที่ไม่มีคีย์ audience
    // เลย เหมือน body จริงของ PUT ที่ editor ส่ง ไม่ใช่แค่ค่าที่บังเอิญเป็น undefined
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { audience: _omitted, ...withoutAudience } = { ...baseInput, audience: 'members' as const }

    const updated = await saveMenu(services, withoutAudience, created, null)
    expect(updated.audience, 'ฟิลด์ที่ไม่ถูกส่งมาต้องแปลว่าไม่เปลี่ยน ไม่ใช่ถูกรีเซ็ตเป็น all เงียบ ๆ')
      .toBe('members')
  })

  it('สร้างเมนูใหม่โดยไม่ส่ง audience มาเลย — saveMenu เองไม่ยัด \'all\' ลง patch (ค่า default มาจากคอลัมน์ของ content-type แทน)', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { audience: _omitted, ...withoutAudience } = baseInput

    const created = await saveMenu(services, withoutAudience, null, null)

    // fakeRepo ไม่จำลอง default ของคอลัมน์ Strapi จริง (content-types/rich-menu.ts) — ค่าที่ได้ตรงนี้
    // จึงเป็น undefined ไม่ใช่ 'all' ถ้า saveMenu เขียนคีย์นี้เข้า patch เอง ด่านนี้จะแดงทันที
    // (การยืนยันว่าเมนูใหม่ยังได้ 'all' จริงบน Strapi จริงคือหน้าที่ของ acceptance.spec.ts — ดูด่าน
    // 'activate เมนูที่ audience เป็น all ถูกปฏิเสธ...' ที่ใช้เมนูแรกสุดของไฟล์ซึ่งไม่เคยส่ง audience)
    expect(created.audience).toBeUndefined()
  })
})
