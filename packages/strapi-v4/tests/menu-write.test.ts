import { describe, expect, it } from 'vitest'
import { readDisplayPeriod, saveMenu } from '../src/server/menu-write.js'
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

/**
 * Task 22 / review H-1 — `saveMenu` ต้องอ่าน default ของบัญชีจาก LINE จริงก่อนยอมให้ติดป้าย
 * `'members'` ทับเมนูที่ publish แล้ว ของปลอมชิ้นนี้จึงต้องทำได้สามอย่าง: ตอบค่า default,
 * **ล้มเหลว** (เพื่อพิสูจน์ว่าด่าน fail closed จริง) และ **นับว่าถูกถามกี่ครั้ง**
 *
 * ตัวนับไม่ใช่ของแถม — ครึ่งหนึ่งของสเปกของด่านนี้คือ "ห้ามยิงไปหา LINE ตอนที่คำตอบเปลี่ยนอะไร
 * ไม่ได้" ซึ่งการดูแค่ว่า saveMenu โยนหรือไม่โยนมองไม่เห็นเลย `channelIds` เก็บไว้พิสูจน์อีกข้อ
 * ที่ดูจากผลลัพธ์ไม่ออก: adapter ต้องถาม channel ของ**แถวเดิม** ไม่ใช่ channel ที่ body ส่งมา
 */
interface LineDouble {
  /** ค่าที่ `GET /v2/bot/user/all/richmenu` ตอบกลับ — `null` = บัญชียังไม่เคยตั้ง default */
  accountDefault?: string | null
  /** ตั้งไว้แล้วการอ่านจะโยนตัวนี้ออกมาแทนที่จะตอบ (เส้นทาง fail closed) */
  failWith?: unknown
  /** ทุกครั้งที่ถูกถามจะ push หนึ่งช่อง — ความยาวคือจำนวน round trip ที่จ่ายไปจริง */
  reads?: number[]
  /** channel id ที่ถูกอ่าน secret ออกมาใช้ยิงคำถาม — ต้องเป็นของแถวเดิมเสมอ */
  channelIds?: string[]
}

/**
 * `memberRichMenuId` คือ pointer เมนูสมาชิกของ channel ที่เมนูนี้สังกัด — `saveMenu` อ่านมันเมื่อ
 * คำขอพก `audience` มาด้วย (Task 14b item 3) ค่าเริ่มต้น `null` คือ "channel นี้ยังไม่มีเมนูสมาชิก"
 * ซึ่งเป็นสถานะของทุกเทสต์ในไฟล์นี้ยกเว้น describe ของ item 3 เองที่ส่งค่าจริงเข้ามา
 */

function fakeServices(
  menus: Repo<RichMenuRow>, source: Buffer, memberRichMenuId: string | null = null,
  // Task 17 — describe ของช่วงเวลาแสดงผลด้านล่างต้องอ่านแถว schedule ที่ `writeDisplayPeriod`
  // เขียนกลับมาจริง ๆ ไม่ใช่แค่ดูว่า saveMenu ไม่ throw (แพทเทิร์นเดียวกับฝั่ง strapi-v5)
  schedules?: Repo<ScheduleRow>,
  line: LineDouble = {},
): Services {
  return {
    config: {} as never,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    // `withSecrets()` เป็นช่องที่ Task 22 ใช้ — ต้องได้ access token จริงถึงจะถาม LINE ได้
    // (ช่องเดียวกับที่ `controllers/members.ts:audience` ใช้อ่านค่า default อยู่แล้ว)
    channels: {
      findOne: async () => ({ memberRichMenuId }),
      withSecrets: () => ({
        findOne: async (id: string) => { line.channelIds?.push(id); return { memberRichMenuId } },
      }),
    } as never,
    menus,
    schedules: schedules ?? fakeRepo<ScheduleRow>(),
    // menu-write.ts ไม่แตะ members เลย (ไม่ใช่ path ของ link-members) — ใส่ไว้ให้ตรงกับ Services เฉย ๆ
    members: {} as never,
    audit: {} as never,
    limiter: {} as never,
    store: fakeStore(source),
    lock: {} as never,
    clientFor: () => ({
      getDefault: async () => {
        line.reads?.push(1)
        if (line.failWith !== undefined) throw line.failWith
        return line.accountDefault ?? null
      },
    }) as never,
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
 * ผลคือแก้เมนูสมาชิกผ่าน editor (ตอนนั้น PUT body ไม่มีคีย์ `audience` เลย) รีเซ็ต audience
 * เป็น 'all' เงียบ ๆ ทุกครั้ง แม้เมนูยัง live กับสมาชิกจริงอยู่ — เทสต์เดิมใน describe ก่อนหน้าไม่มีทาง
 * จับได้ เพราะทุกที่ที่เรียก saveMenu ส่ง `audience: 'all'` มาชัดเจนเสมอ (baseInput) ไม่เคยจำลอง body
 * ที่ไม่มีคีย์นี้เลย ซึ่งเป็นรูปทรงเดียวที่เกิดขึ้นจริงตอนแก้ไขผ่านฟอร์ม
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

    // destructure คีย์ออกจริง ๆ ไม่ใช่ตั้งเป็น undefined ตรง ๆ —ต้องได้ object ที่ไม่มีคีย์ audience
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
    const services = fakeServices(menus, await realJpeg(), 'line-rm-1')
    const live = await liveMemberMenu(menus, services)

    await expect(saveMenu(services, { ...baseInput, audience: 'all' }, live, null))
      .rejects.toMatchObject({ code: 'menu_active_for_members' })

    // ปฏิเสธจริง ไม่ใช่ปฏิเสธหลังเขียนไปแล้ว — v4 ไม่มี transaction ห่อ `saveMenu` (ดูไฟล์ต้นทาง)
    // การเช็คหลังเขียนจึงทิ้งค่าที่ถูกเขียนไปแล้วค้างไว้จริง ไม่ใช่แค่ทฤษฎี
    expect((await menus.findOne(live.id))!.audience).toBe('members')
  })

  // เมื่อ editor ส่ง `audience` มาทุกครั้งแล้ว (item 1) การแก้ชื่อเมนูสมาชิกที่ active อยู่จะพก
  // `audience: 'members'` มาด้วยเสมอ — ถ้าด่านนี้ดูแค่ "มีคีย์ audience ไหม" แทนที่จะดูว่า
  // **ค่ามันเปลี่ยนไปจาก members หรือเปล่า** เมนูสมาชิกที่ใช้งานอยู่จะแก้อะไรไม่ได้เลยสักอย่าง
  it('แก้ชื่อเมนูสมาชิกที่ active อยู่ (ส่ง audience: members มาด้วย) — ยังบันทึกได้ตามปกติ', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg(), 'line-rm-1')
    const live = await liveMemberMenu(menus, services)

    const updated = await saveMenu(
      services, { ...baseInput, name: 'เมนูสมาชิก (แก้ชื่อ)', audience: 'members' }, live, null)
    expect(updated.name).toBe('เมนูสมาชิก (แก้ชื่อ)')
    expect(updated.audience).toBe('members')
  })

  it('channel ยังไม่มีเมนูสมาชิกเลย — เปลี่ยน audience เป็น all ได้ตามปกติ', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg(), null)
    const live = await liveMemberMenu(menus, services)

    const updated = await saveMenu(services, { ...baseInput, audience: 'all' }, live, null)
    expect(updated.audience).toBe('all')
  })

  it('channel ชี้ไปที่เมนูสมาชิกตัวอื่น — เมนูนี้ถอดป้ายได้ ไม่ใช่ถูกล็อกไปด้วย', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg(), 'line-rm-somebody-else')
    const live = await liveMemberMenu(menus, services)

    const updated = await saveMenu(services, { ...baseInput, audience: 'all' }, live, null)
    expect(updated.audience).toBe('all')
  })
})
const OTHER_CHANNEL = '20'

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
    const services = fakeServices(menus, await realJpeg(), null, schedules)

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

/**
 * ===================== Task 22 / review H-1 — ครึ่งที่เหลือของ class เดิม =====================
 *
 * Task 17 ปิดทุกประตูที่ **ทำให้เมนูสมาชิกเป็น default ของบัญชี** แต่ไม่ได้ปิดประตูที่ **ทำให้
 * default ของบัญชีกลายเป็นเมนูสมาชิก** ซึ่งลงเอยที่สถานะเดียวกันเป๊ะ: แถวอ่านว่า `members` ขณะที่
 * `lineRichMenuId` ของมันคือสิ่งที่ LINE เสิร์ฟให้ผู้ติดตามทุกคน เดินได้จาก UI ล้วน ๆ —
 * Save and publish ด้วย Audience = Everyone (editor ส่ง `setAsDefault: true`) → เปิดกลับมา สลับเป็น
 * Members → Save
 *
 * ตรรกะอยู่ที่ `assertNotAccountDefault` ใน core และมีเทสต์ของตัวเองที่นั่น
 * (`packages/core/tests/server/menu-ops.test.ts`) — ไฟล์นี้พิสูจน์คนละเรื่อง เหมือน describe ของ
 * Task 17 ข้างบน: `saveMenu` ของ **adapter ตัวนี้** เรียกด่านนั้นจริง ด้วยค่าจริงจากแถวเดิม
 * ผ่านช่อง `withSecrets()` จริง และปฏิเสธ **ก่อน** เขียนอะไรลง repo
 */
describe('saveMenu — ติดป้าย members ทับเมนูที่เป็น default ของบัญชีไม่ได้ (Task 22 / review H-1)', () => {
  const DEFAULT_ID = 'line-rm-default-for-everyone'

  /** ผลลัพธ์ของการกด "Save and publish" ครั้งแรกใน editor: เมนู Everyone ที่ขึ้น LINE แล้ว */
  async function publishedAllMenu(
    menus: Repo<RichMenuRow> & { rows: RichMenuRow[] }, services: Services,
  ): Promise<RichMenuRow> {
    const created = await saveMenu(services, { ...baseInput, audience: 'all' }, null, null)
    return menus.update(created.id, { status: 'published', lineRichMenuId: DEFAULT_ID })
  }

  it('เมนูที่ LINE เสิร์ฟให้ทุกคนอยู่ + สลับเป็น Members → menu_is_account_default และแถวไม่ถูกแตะ', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const reads: number[] = []
    const channelIds: string[] = []
    const services = fakeServices(menus, await realJpeg(), null, undefined, { accountDefault: DEFAULT_ID, reads, channelIds })
    const published = await publishedAllMenu(menus, services)

    await expect(saveMenu(services, { ...baseInput, audience: 'members' }, published, null))
      .rejects.toMatchObject({ code: 'menu_is_account_default' })

    // ปฏิเสธจริง ไม่ใช่ปฏิเสธหลังเขียนไปแล้ว
    expect((await menus.findOne(published.id))!.audience).toBe('all')
    // ถามผ่าน `withSecrets()` ของ channel ที่แถว**เดิม**สังกัด ไม่ใช่ค่าที่ body ส่งมา
    expect(channelIds).toEqual([baseInput.channelId])
    expect(reads).toHaveLength(1)
  })

  /**
   * คู่ที่พิสูจน์ว่านี่คือยาม ไม่ใช่การห้ามติดป้าย Members บนเมนูที่ publish แล้วทั้งหมด — เมนูที่
   * publish โดยไม่ตั้ง default คือเมนูสมาชิกทุกตัวที่เกิดขึ้นถูกวิธี ถ้าเคสนี้ถูกปฏิเสธไปด้วย
   * ฟีเจอร์ทั้งฟีเจอร์จะสร้างเมนูสมาชิกจาก editor ไม่ได้เลย และเทสต์ฝั่งปฏิเสธจะยังเขียวทุกข้อ
   */
  it('เมนูที่ publish แล้วแต่ default ของบัญชีเป็นตัวอื่น — ติดป้าย members ได้ และค่าถูกเขียนลงแถวจริง', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const reads: number[] = []
    const services = fakeServices(menus, await realJpeg(), null, undefined, { accountDefault: 'line-rm-somebody-else', reads })
    const published = await publishedAllMenu(menus, services)

    const updated = await saveMenu(services, { ...baseInput, audience: 'members' }, published, null)
    expect(updated.audience).toBe('members')
    expect((await menus.findOne(published.id))!.audience).toBe('members')
    expect(reads).toHaveLength(1)
  })

  /**
   * บั๊กต้นเรื่องคือ "ไม่เคยถาม" ซึ่งมีผลเท่ากับ "ปล่อยผ่านทุกครั้ง" — ปล่อยผ่านตอนที่ถามไม่ได้
   * คือการเอาบั๊กเดิมกลับมาทั้งดุ้นในนาทีที่ LINE ล่ม ซึ่งเป็นนาทีที่ไม่มีใครมองอยู่
   */
  it('อ่าน default จาก LINE ไม่สำเร็จ → menu_default_unknown และแถวไม่ถูกแตะ (fail closed)', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const services = fakeServices(menus, await realJpeg(), null, undefined, { failWith: new Error('LINE ล่ม') })
    const published = await publishedAllMenu(menus, services)

    await expect(saveMenu(services, { ...baseInput, audience: 'members' }, published, null))
      .rejects.toMatchObject({ code: 'menu_default_unknown' })

    expect((await menus.findOne(published.id))!.audience).toBe('all')
  })

  /**
   * ครึ่งของสเปกที่ดูจากผลลัพธ์ไม่ออก: การกด Save ธรรมดาต้องไม่จ่าย round trip ไปหา LINE เพิ่ม
   * ทุกครั้ง ด่านนี้เพิ่งเติมการอ่านเข้าไปในเส้นทางที่เมื่อก่อนไม่มีเลย ถ้ามันยิงทุกครั้ง ทุกการ
   * แก้ชื่อปุ่มจะช้าลงและพังได้เมื่อ LINE ล่ม ทั้งที่ไม่มีอะไรให้ตรวจ
   */
  it('กด Save ธรรมดาบนเมนู Everyone (audience เดิม) — ไม่ยิงไปหา LINE เลยสักครั้ง', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const reads: number[] = []
    const services = fakeServices(menus, await realJpeg(), null, undefined, { accountDefault: DEFAULT_ID, reads })
    const published = await publishedAllMenu(menus, services)

    const updated = await saveMenu(
      services, { ...baseInput, audience: 'all', name: 'ชื่อใหม่' }, published, null)
    expect(updated.name).toBe('ชื่อใหม่')
    expect(reads).toHaveLength(0)
  })

  it('กด Save ธรรมดาบนเมนู Members ที่เป็นอยู่แล้ว — ไม่ยิงไปหา LINE เลยสักครั้ง', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const reads: number[] = []
    const services = fakeServices(menus, await realJpeg(), null, undefined, { accountDefault: DEFAULT_ID, reads })
    const created = await saveMenu(services, { ...baseInput, audience: 'members' }, null, null)
    const published = await menus.update(created.id, { status: 'published', lineRichMenuId: DEFAULT_ID })

    const updated = await saveMenu(
      services, { ...baseInput, audience: 'members', name: 'ชื่อใหม่' }, published, null)
    expect(updated.name).toBe('ชื่อใหม่')
    expect(reads).toHaveLength(0)
  })

  it('ร่างที่ยังไม่เคยขึ้น LINE — ตั้ง Members ได้ และไม่ยิงไปหา LINE เลย', async () => {
    const menus = fakeRepo<RichMenuRow>()
    const reads: number[] = []
    const services = fakeServices(menus, await realJpeg(), null, undefined, { accountDefault: DEFAULT_ID, reads })
    const created = await saveMenu(services, { ...baseInput, audience: 'all' }, null, null)
    const draft = await menus.update(created.id, { lineRichMenuId: null })

    const updated = await saveMenu(services, { ...baseInput, audience: 'members' }, draft, null)
    expect(updated.audience).toBe('members')
    expect(reads).toHaveLength(0)
  })
})
