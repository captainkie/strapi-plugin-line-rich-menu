import { describe, expect, it } from 'vitest'
import type { ImageStore, ListParams, Repo, RichMenuRow, ScheduleRow } from '@fosivo/line-rich-menu-core'
import { ValidationError } from '@fosivo/line-rich-menu-core'
import { readDisplayPeriod, saveMenu, writeDisplayPeriod } from '../server/src/menu-write.js'
import type { Services } from '../server/src/container.js'
import type { MenuInput } from '../server/src/validation.js'

/**
 * Task 20 item 7 (strapi-v5 M4) — `menu-write.ts` มีเทสต์เป็นศูนย์ในแพ็กเกจนี้ก่อนไฟล์นี้ ทั้งที่
 * doc comment ของมันเองอ้างว่า "เทสต์ของ repo (`tests/repo.test.ts`) เรียกตรง ๆ" ซึ่งเป็นเท็จ
 * (`repo.test.ts` ทดสอบแค่กลไก schedule repo ผ่าน `describe('round trip ...')` ไม่เคยเรียกคู่ฟังก์ชัน
 * นี้เลย) — คอมเมนต์ที่อ้างเทสต์ที่ไม่มีอยู่จริงแย่กว่าไม่มีคอมเมนต์เลย เพราะมันหยุดคนถัดไปที่มาเช็คดู
 * ไฟล์นี้แก้ทั้งสองทาง คือเพิ่ม coverage จริง (ตามที่รีวิวบอกว่าควรเลือก) ไม่ใช่แค่แก้ถ้อยคำ
 *
 * ตรรกะของ `saveMenu`/`assertAliasFree` เหมือน v4 ทุกไบต์ (`diff` เป็นค่าว่าง ตามที่รีวิวยืนยันไว้)
 * สิ่งที่ยังไม่เคยถูกพิสูจน์คือคู่ฟังก์ชันนี้ *รันบน repo ของ v5 จริง* — documentId เป็นสตริง,
 * เขียน relation ด้วย `{set:[...]}`, populate-on-write — จุดที่ v4 กับ v5 ต่างกัน
 */

/** repo ในหน่วยความจำที่รองรับเฉพาะ filter แบบเท่ากับ ซึ่งเป็นทั้งหมดที่ menu-write.ts ใช้จริง */
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
 * (แพทเทิร์นเดียวกับ packages/strapi-v4/tests/menu-write.test.ts)
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

function fakeServices(menus: Repo<RichMenuRow>, source: Buffer, schedules?: Repo<ScheduleRow>): Services {
  return {
    config: {} as never,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    // `saveMenu` (item 4) เรียก `channels.findOne` ก่อนเขียนเสมอ — ต้อง resolve สำเร็จเพื่อให้
    // เทสต์เดินต่อไปถึงส่วนที่ไฟล์นี้ตั้งใจพิสูจน์ ค่าที่คืนไม่ถูกใช้ต่อ (ดูคอมเมนต์ที่ saveMenu)
    channels: { findOne: async () => ({}) } as never,
    menus,
    schedules: schedules ?? fakeRepo<ScheduleRow>(),
    // menu-write.ts ไม่แตะ members เลย (ไม่ใช่ path ของ link-members) — ใส่ไว้ให้ตรงกับ Services เฉย ๆ
    members: {} as never,
    audit: {} as never,
    limiter: {} as never,
    store: fakeStore(source),
    lock: {} as never,
    // ของปลอมที่ "ไม่ได้เป็น transaction จริง" โดยตั้งใจ — `strapi.db.transaction` จริงถูกอ่านซอร์ส
    // และพิสูจน์ atomicity แยกไว้แล้วที่ controllers.test.ts (item 5) ไฟล์นี้ทดสอบ*ตรรกะ*ของ
    // saveMenu ไม่ใช่ความถูกต้องของ transaction primitive เอง — รัน fn ตรง ๆ ก็พอ
    transaction: async (fn) => fn(),
    clientFor: () => ({}) as never,
  }
}

const baseInput: MenuInput = {
  name: 'เมนูหลัก',
  channelId: 'ch0000000000000000000001',
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
 * I5 — เคลียร์รูปที่ normalize ไว้เมื่อผู้ใช้ลบรูปต้นทางทิ้ง (พอร์ตจาก packages/strapi-v4/tests/
 * menu-write.test.ts — ตรรกะเหมือนกันไบต์ต่อไบต์ แต่รันผ่าน repo ของ v5 จริงที่นี่)
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
 * `assertAliasFree` ไม่ได้ export จากไฟล์นี้ (ตั้งใจ — เป็น implementation detail ของ saveMenu)
 * จึงพิสูจน์ผ่านพฤติกรรมของ saveMenu เอง ซึ่งเป็นวิธีเดียวกับที่ผู้ใช้จริงเจอ: กด save สองครั้ง
 * ด้วย alias เดียวกัน — v5 ไม่เคยมีเทสต์นี้เลยมาก่อน (รีวิวชี้ไว้ตรง ๆ ว่าเป็นช่องว่าง)
 */
describe('saveMenu — alias ต้องไม่ซ้ำภายใน channel เดียวกัน (assertAliasFree)', () => {
  it('เมนูสองใบใน channel เดียวกันใช้ aliasId เดียวกันไม่ได้ — ปฏิเสธด้วย alias_id_taken ที่ path aliasId', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    await saveMenu(services, { ...baseInput, aliasId: 'tab-a' }, null, null)

    await expect(saveMenu(services, { ...baseInput, aliasId: 'tab-a' }, null, null))
      .rejects.toMatchObject({
        issues: [{ path: 'aliasId', code: 'alias_id_taken' }],
      })
  })

  it('aliasId เดียวกันใช้ได้ข้าม channel — assertAliasFree กันแค่ภายใน channel เดียวกัน', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    await saveMenu(services, { ...baseInput, channelId: 'ch0000000000000000000001', aliasId: 'tab-a' }, null, null)

    await expect(saveMenu(services, { ...baseInput, channelId: 'ch0000000000000000000002', aliasId: 'tab-a' }, null, null))
      .resolves.toMatchObject({ aliasId: 'tab-a' })
  })

  it('บันทึกเมนูเดิมซ้ำด้วย alias เดิมของตัวเองไม่ถือว่าเป็นของซ้ำ (exceptId)', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    const created = await saveMenu(services, { ...baseInput, aliasId: 'tab-a' }, null, null)

    await expect(saveMenu(services, { ...baseInput, aliasId: 'tab-a', chatBarText: 'ข้อความใหม่' }, created, null))
      .resolves.toMatchObject({ aliasId: 'tab-a' })
  })
})

describe('ValidationError ที่ assertAliasFree โยน มี path/code ที่ฟอร์มฝั่ง UI ใช้ชี้ช่องได้', () => {
  it('เป็น ValidationError จริง ไม่ใช่ error ชนิดอื่นที่บังเอิญมีรูปทรงคล้ายกัน', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    await saveMenu(services, { ...baseInput, aliasId: 'tab-a' }, null, null)

    await expect(saveMenu(services, { ...baseInput, aliasId: 'tab-a' }, null, null))
      .rejects.toBeInstanceOf(ValidationError)
  })
})

/**
 * `writeDisplayPeriod`/`readDisplayPeriod` — คู่ round trip ที่ doc comment ของ `menu-write.ts`
 * อ้างว่า repo.test.ts เรียกตรง ๆ (เท็จ — ดูคอมเมนต์หัวไฟล์) เขียนเป็นแถว schedule สอง op
 * (`set-default`/`clear-default`) แทนคอลัมน์บนเมนูตรง ๆ — พิสูจน์ทั้ง round trip และ
 * "แทนที่ของเดิมทั้งหมดทุกครั้งที่ save" (ไม่ใช่สะสมแถว pending เก่าไว้เรื่อย ๆ)
 */
describe('writeDisplayPeriod / readDisplayPeriod — round trip และความหมาย replace-all', () => {
  it('เขียนแล้วอ่านกลับได้ค่าเดิม', async () => {
    const schedules = fakeRepo<ScheduleRow>()
    await writeDisplayPeriod(schedules, 'menu-1', {
      startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z',
    })

    await expect(readDisplayPeriod(schedules, 'menu-1')).resolves.toEqual({
      startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z',
    })
  })

  it('เขียนแค่ startAt (endAt เป็น null) — อ่านกลับมาต้องไม่มีแถว clear-default หลงเหลือ', async () => {
    const schedules = fakeRepo<ScheduleRow>()
    await writeDisplayPeriod(schedules, 'menu-1', { startAt: '2026-09-01T00:00:00.000Z', endAt: null })

    await expect(readDisplayPeriod(schedules, 'menu-1')).resolves.toEqual({
      startAt: '2026-09-01T00:00:00.000Z', endAt: null,
    })
  })

  it('เขียนทับซ้ำด้วยช่วงเวลาใหม่ — แถว pending เก่าต้องถูกลบทิ้ง ไม่ใช่สะสมเพิ่ม', async () => {
    const schedules = fakeRepo<ScheduleRow>()
    await writeDisplayPeriod(schedules, 'menu-1', {
      startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z',
    })
    await writeDisplayPeriod(schedules, 'menu-1', {
      startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z',
    })

    const pending = await schedules.findMany({ filters: { richMenuId: 'menu-1', state: 'pending' } })
    expect(pending).toHaveLength(2) // ไม่ใช่ 4 — ของเดิมถูกลบก่อนเขียนใหม่ ไม่ใช่เขียนเพิ่ม
    await expect(readDisplayPeriod(schedules, 'menu-1')).resolves.toEqual({
      startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z',
    })
  })

  it('เขียนช่วงเวลาว่างทั้งคู่ทับของเดิม — ล้าง schedule ที่ตั้งไว้ก่อนหน้าทั้งหมด', async () => {
    const schedules = fakeRepo<ScheduleRow>()
    await writeDisplayPeriod(schedules, 'menu-1', {
      startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z',
    })
    await writeDisplayPeriod(schedules, 'menu-1', { startAt: null, endAt: null })

    await expect(readDisplayPeriod(schedules, 'menu-1')).resolves.toEqual({ startAt: null, endAt: null })
    expect(await schedules.findMany({ filters: { richMenuId: 'menu-1', state: 'pending' } })).toHaveLength(0)
  })

  it('menu อื่นไม่ถูกแตะ — ล้าง/เขียนช่วงเวลาของเมนูหนึ่งไม่กระทบตารางเมนูอื่น', async () => {
    const schedules = fakeRepo<ScheduleRow>()
    await writeDisplayPeriod(schedules, 'menu-1', {
      startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z',
    })
    await writeDisplayPeriod(schedules, 'menu-2', {
      startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z',
    })
    await writeDisplayPeriod(schedules, 'menu-1', { startAt: null, endAt: null })

    await expect(readDisplayPeriod(schedules, 'menu-2')).resolves.toEqual({
      startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z',
    })
  })

  it('saveMenu เขียนช่วงเวลาแสดงผลให้จริงตอน save — ไม่ใช่แค่ฟังก์ชันคู่นี้เรียกตรงได้เฉย ๆ', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const schedules = fakeRepo<ScheduleRow>()
    const services = fakeServices(menus, await realJpeg(), schedules)

    const saved = await saveMenu(
      services,
      { ...baseInput, startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z' },
      null,
      null,
    )

    await expect(readDisplayPeriod(schedules, saved.id)).resolves.toEqual({
      startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z',
    })
  })
})
