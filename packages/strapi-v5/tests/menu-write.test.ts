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

/**
 * `memberRichMenuId` คือ pointer เมนูสมาชิกของ channel ที่เมนูนี้สังกัด — `saveMenu` อ่านมันเมื่อ
 * คำขอพก `audience` มาด้วย (Task 14b item 3) ค่าเริ่มต้น `null` คือ "channel นี้ยังไม่มีเมนูสมาชิก"
 * ซึ่งเป็นสถานะของทุกเทสต์ในไฟล์นี้ยกเว้น describe ของ item 3 เองที่ส่งค่าจริงเข้ามา
 */
function fakeServices(
  menus: Repo<RichMenuRow>, source: Buffer, schedules?: Repo<ScheduleRow>,
  memberRichMenuId: string | null = null,
): Services {
  return {
    config: {} as never,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    // `saveMenu` (item 4) เรียก `channels.findOne` ก่อนเขียนเสมอ — ต้อง resolve สำเร็จเพื่อให้
    // เทสต์เดินต่อไปถึงส่วนที่ไฟล์นี้ตั้งใจพิสูจน์
    channels: { findOne: async () => ({ memberRichMenuId }) } as never,
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
  audience: 'all',
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
 * Task 13 fix round 3 (task-13-findings-2.md) — Critical: `menuInputSchema` เคย `.default('all')`
 * ทำให้ `input.audience` มีค่าเสมอแม้ caller ไม่ส่งมา แล้ว `saveMenu` เขียนมันลง patch แบบไม่มีเงื่อนไข
 * ผลคือแก้เมนูสมาชิกผ่าน editor (ตอนนั้น PUT body ไม่มีคีย์ `audience` เลย) รีเซ็ต audience
 * เป็น 'all' เงียบ ๆ ทุกครั้ง แม้เมนูยัง live กับสมาชิกจริงอยู่ — เทสต์เดิมใน describe ก่อนหน้าไม่มีทาง
 * จับได้ เพราะทุกที่ที่เรียก saveMenu ส่ง `audience: 'all'` มาชัดเจนเสมอ (baseInput) ไม่เคยจำลอง body
 * ที่ไม่มีคีย์นี้เลย ซึ่งเป็นรูปทรงเดียวที่เกิดขึ้นจริงตอนแก้ไขผ่านฟอร์ม — ตรรกะเหมือน v4 ทุกไบต์
 * (ดู packages/strapi-v4/tests/menu-write.test.ts) รันซ้ำที่นี่เพราะ patch ทั้งสอง adapter แยกกัน
 */
describe('saveMenu — audience: ไม่ส่งฟิลด์มาต้องแปลว่า "ไม่เปลี่ยน" ไม่ใช่ "ตั้งเป็น all" (Task 13 fix round 3)', () => {
  // Task 14b item 1 เปลี่ยน *ผู้ส่ง* body รูปนี้ ไม่ใช่เปลี่ยนกฎ: editor ส่ง `audience` มาทุกครั้งแล้ว
  // body ที่ไม่มีคีย์นี้จึงเป็นของผู้เรียก API อื่น (สคริปต์/integration) ซึ่งยังต้องหมายถึง "ไม่เปลี่ยน"
  // เหมือนเดิม — assertion ไม่ถูกแก้ แก้แค่ชื่อกับคอมเมนต์ให้เลิกอ้างผู้ส่งที่ไม่ใช่แล้ว
  it('แก้เมนูสมาชิกด้วย body ที่ละคีย์ audience ไว้ (partial update ของผู้เรียก API) — audience เดิมต้องรอด', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    const created = await saveMenu(services, { ...baseInput, audience: 'members' }, null, null)
    expect(created.audience).toBe('members') // sanity check ก่อนพิสูจน์ค่าที่ต้องรอด

    // destructure คีย์ออกจริง ๆ ไม่ใช่ตั้งเป็น undefined ตรง ๆ — ต้องได้ object ที่ไม่มีคีย์ audience
    // เลย เหมือน partial update จริงของผู้เรียก API ไม่ใช่แค่ค่าที่บังเอิญเป็น undefined
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

/**
 * Task 14b item 3 — เมื่อฟอร์มตั้ง `audience` ได้แล้ว (item 1) มันก็ **ล้าง** ได้ด้วย: สลับเมนู
 * สมาชิกที่ยัง live อยู่กลับเป็น 'all' จะพาไปลงสถานะเดียวกับที่ 409 `menu_not_members_audience`
 * (Task 13) มีไว้กันไม่ให้เกิด แต่มาทางประตูใหม่ — ดูคอมเมนต์เต็มที่ `MenuActiveForMembersError`
 *
 * ตรรกะเองอยู่ที่ `assertAudienceChangeAllowed` ใน core และมีเทสต์ของตัวเองที่นั่น
 * (`packages/core/tests/server/menu-ops.test.ts`) ไฟล์นี้พิสูจน์คนละเรื่อง: `saveMenu` ของ
 * **adapter ตัวนี้** เรียกด่านนั้นจริง ด้วย channel ของแถวเดิมจริง และปฏิเสธ **ก่อน** เขียนอะไรลง
 * repo — ด่านที่ปฏิเสธหลังเขียนไปแล้วคือด่านที่ไม่ได้ป้องกันอะไรเลย
 */
describe('saveMenu — ถอดป้าย members ออกจากเมนูที่ยัง live กับสมาชิกไม่ได้ (Task 14b item 3)', () => {
  /** เมนูสมาชิกที่ publish แล้วและมี id ฝั่ง LINE — สถานะเดียวที่ activate ทำให้เกิดได้ */
  async function liveMemberMenu(menus: Repo<RichMenuRow>, services: Services): Promise<RichMenuRow> {
    const created = await saveMenu(services, { ...baseInput, audience: 'members' }, null, null)
    expect(created.audience).toBe('members') // sanity — เทสต์ทั้ง describe นี้ตั้งอยู่บนค่านี้
    return menus.update(created.id, { status: 'published', lineRichMenuId: 'line-rm-1' })
  }

  it("channel ชี้มาที่เมนูนี้อยู่ → PUT ที่ส่ง audience: 'all' ถูกปฏิเสธด้วย menu_active_for_members", async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg(), undefined, 'line-rm-1')
    const live = await liveMemberMenu(menus, services)

    await expect(saveMenu(services, { ...baseInput, audience: 'all' }, live, null))
      .rejects.toMatchObject({ code: 'menu_active_for_members' })

    // ปฏิเสธจริง ไม่ใช่ปฏิเสธหลังเขียนไปแล้ว — `services.transaction` ปลอมของไฟล์นี้รัน fn ตรง ๆ
    // ไม่ rollback อะไรให้เลย (ดูคอมเมนต์ที่ fakeServices) ค่าที่ถูกเขียนไปก่อนปฏิเสธจะค้างอยู่จริง
    expect((await menus.findOne(live.id))!.audience).toBe('members')
  })

  // เมื่อ editor ส่ง `audience` มาทุกครั้งแล้ว (item 1) การแก้ชื่อเมนูสมาชิกที่ active อยู่จะพก
  // `audience: 'members'` มาด้วยเสมอ — ถ้าด่านนี้ดูแค่ "มีคีย์ audience ไหม" แทนที่จะดูว่า
  // **ค่ามันเปลี่ยนไปจาก members หรือเปล่า** เมนูสมาชิกที่ใช้งานอยู่จะแก้อะไรไม่ได้เลยสักอย่าง
  it('แก้ชื่อเมนูสมาชิกที่ active อยู่ (ส่ง audience: members มาด้วย) — ยังบันทึกได้ตามปกติ', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg(), undefined, 'line-rm-1')
    const live = await liveMemberMenu(menus, services)

    const updated = await saveMenu(
      services, { ...baseInput, name: 'เมนูสมาชิก (แก้ชื่อ)', audience: 'members' }, live, null)
    expect(updated.name).toBe('เมนูสมาชิก (แก้ชื่อ)')
    expect(updated.audience).toBe('members')
  })

  it('channel ยังไม่มีเมนูสมาชิกเลย — เปลี่ยน audience เป็น all ได้ตามปกติ', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg(), undefined, null)
    const live = await liveMemberMenu(menus, services)

    const updated = await saveMenu(services, { ...baseInput, audience: 'all' }, live, null)
    expect(updated.audience).toBe('all')
  })

  it('channel ชี้ไปที่เมนูสมาชิกตัวอื่น — เมนูนี้ถอดป้ายได้ ไม่ใช่ถูกล็อกไปด้วย', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg(), undefined, 'line-rm-somebody-else')
    const live = await liveMemberMenu(menus, services)

    const updated = await saveMenu(services, { ...baseInput, audience: 'all' }, live, null)
    expect(updated.audience).toBe('all')
  })
})
const OTHER_CHANNEL = 'ch0000000000000000000002'

/**
 * ===================== Task 17 — สองประตูที่เหลือของสมการสามฝ่าย =====================
 *
 * `audience` ของเมนู, `channel.memberRichMenuId` และ `lineRichMenuId` ต้องตรงกันเสมอ ตรรกะของทั้งสอง
 * ด่านอยู่ที่ `assertChannelChangeAllowed` / `assertDisplayPeriodAllowed` ใน core และมีเทสต์ของ
 * ตัวเองที่นั่น (`packages/core/tests/server/menu-ops.test.ts`) — ไฟล์นี้พิสูจน์คนละเรื่องเหมือน
 * describe ของ item 3 ข้างบน: `saveMenu` ของ **adapter ตัวนี้** เรียกด่านนั้นจริง ด้วยค่าจริงจากแถว
 * เดิม และปฏิเสธ **ก่อน** เขียนอะไรลง repo
 */
describe('saveMenu — ย้าย channel ของเมนูที่ขึ้น LINE แล้วไม่ได้ (Task 17 / deferred item 3)', () => {
  it('เมนูที่มี lineRichMenuId แล้ว + channelId ใหม่ → ถูกปฏิเสธด้วย menu_channel_locked และไม่เขียนอะไรเลย', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    const created = await saveMenu(services, baseInput, null, null)
    const published = await menus.update(created.id, { status: 'published', lineRichMenuId: 'line-rm-1' })

    await expect(saveMenu(services, { ...baseInput, channelId: OTHER_CHANNEL }, published, null))
      .rejects.toMatchObject({ code: 'menu_channel_locked' })

    expect((await menus.findOne(published.id))!.channelId).toBe(baseInput.channelId)
  })

  // ฟอร์มส่ง channelId เดิมกลับมาทุกครั้งที่กด Save — ถ้าด่านนี้ดูแค่ "มีคีย์ channelId ไหม"
  // เมนูที่ publish แล้วจะแก้อะไรไม่ได้เลยสักอย่าง ซึ่งแย่กว่าปัญหาที่มันตั้งใจแก้
  it('เมนูเดียวกัน + channelId เดิม (การกด Save ธรรมดา) — บันทึกได้ตามปกติ', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    const created = await saveMenu(services, baseInput, null, null)
    const published = await menus.update(created.id, { status: 'published', lineRichMenuId: 'line-rm-1' })

    const updated = await saveMenu(services, { ...baseInput, name: 'ชื่อใหม่' }, published, null)
    expect(updated.name).toBe('ชื่อใหม่')
  })

  it('ร่างที่ยังไม่เคยขึ้น LINE — ย้าย channel ได้จริง และค่าใหม่ถูกเขียนลงแถว', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    // เขียน `lineRichMenuId: null` ลงแถวชัด ๆ — แถวจริงในฐานข้อมูลมีคอลัมน์นี้เป็น null เสมอ
    // ส่วน repo ปลอมของไฟล์นี้เก็บเฉพาะคีย์ที่ patch ส่งมา ค่าจึงเป็น `undefined` ถ้าไม่ตั้งเอง
    // ซึ่งไม่ใช่สถานะที่เกิดได้จริง (`RichMenuRow.lineRichMenuId` เป็น `string | null` และ repo
    // ทั้งสองตัวแม็ปคอลัมน์นี้ทุกครั้ง) — ด่านนี้ตั้งใจ fail closed กับค่าที่ไม่ใช่ null
    const created = await saveMenu(services, baseInput, null, null)
    const draft = await menus.update(created.id, { lineRichMenuId: null })

    const moved = await saveMenu(services, { ...baseInput, channelId: OTHER_CHANNEL }, draft, null)
    expect(moved.channelId).toBe(OTHER_CHANNEL)
  })
})

describe('saveMenu — เมนูสมาชิกมีช่วงเวลาแสดงผลไม่ได้ (Task 17 item 5)', () => {
  const START = '2026-09-01T00:00:00.000Z'
  const END = '2026-09-30T00:00:00.000Z'

  it('สร้างเมนู members พร้อมช่วงเวลา → ถูกปฏิเสธ และไม่มีแถวเมนูเกิดขึ้นเลย', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())

    await expect(saveMenu(
      services, { ...baseInput, audience: 'members', startAt: START, endAt: END }, null, null,
    )).rejects.toMatchObject({ code: 'menu_display_period_not_allowed' })

    expect(menus.rows).toHaveLength(0)
  })

  // คู่ที่พิสูจน์ว่านี่คือยาม ไม่ใช่การปิดฟีเจอร์ช่วงเวลาแสดงผล (สเปก §5.7) ทิ้ง
  it('เมนูของทุกคนพร้อมช่วงเวลาเดียวกัน — บันทึกได้ และแถว schedule ถูกเขียนจริง', async () => {
    const schedules = fakeRepo<ScheduleRow>()
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg(), schedules)

    const saved = await saveMenu(
      services, { ...baseInput, audience: 'all', startAt: START, endAt: END }, null, null)

    await expect(readDisplayPeriod(schedules, saved.id)).resolves.toEqual({ startAt: START, endAt: END })
  })

  it('เมนูสมาชิกที่ไม่มีช่วงเวลา — บันทึกได้ตามปกติ (นี่คือเมนูสมาชิกทุกตัว)', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())

    const saved = await saveMenu(services, { ...baseInput, audience: 'members' }, null, null)
    expect(saved.audience).toBe('members')
  })

  /**
   * ผู้เรียก API ที่ละคีย์ `audience` ไว้ ("ไม่ส่งมา" = "ไม่เปลี่ยน") แต่ส่งช่วงเวลามาบนเมนูที่เป็น
   * members อยู่แล้ว — ถ้าด่านนี้อ่านแค่ `input.audience` มันจะเห็น `undefined` แล้วปล่อยผ่าน
   */
  it('เมนู members เดิม + body ที่ละคีย์ audience แต่ส่งช่วงเวลามา → ถูกปฏิเสธ', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    const member = await saveMenu(services, { ...baseInput, audience: 'members' }, null, null)

    // destructure คีย์ออกจริง ๆ ไม่ใช่ตั้งเป็น undefined — ต้องได้ object ที่ไม่มีคีย์ audience เลย
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { audience: _omitted, ...withoutAudience } = { ...baseInput, audience: 'members' as const }
    await expect(saveMenu(
      services, { ...withoutAudience, startAt: START, endAt: null } as MenuInput, member, null,
    )).rejects.toMatchObject({ code: 'menu_display_period_not_allowed' })
  })

  /**
   * คู่ของเคสข้างบน — เปลี่ยนเป็น 'all' พร้อมตั้งช่วงเวลาในคำขอเดียวต้อง **ผ่าน** เพราะ audience
   * ผลลัพธ์คือ 'all' ถ้าด่านนี้อ่าน audience ของแถวเดิมแทนผลลัพธ์ เคสนี้จะถูกปฏิเสธผิด ๆ
   * (channel ไม่ได้ชี้มาที่เมนูนี้ — `assertAudienceChangeAllowed` จึงไม่เกี่ยว)
   */
  it('เปลี่ยนเป็น all พร้อมตั้งช่วงเวลาในคำขอเดียว — ผ่าน เพราะด่านอ่าน audience ผลลัพธ์', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg())
    const member = await saveMenu(services, { ...baseInput, audience: 'members' }, null, null)

    const updated = await saveMenu(
      services, { ...baseInput, audience: 'all', startAt: START, endAt: END }, member, null)
    expect(updated.audience).toBe('all')
  })
})
