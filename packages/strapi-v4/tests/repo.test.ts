import { describe, expect, it, vi } from 'vitest'
import type { RichMenuRow } from '@fosivo/line-rich-menu-core'
import { richMenu } from '../src/server/content-types/rich-menu.js'
import { UID } from '../src/server/content-types/index.js'
import type { ContentTypeSchema } from '../src/server/content-types/schema.js'
import { readDisplayPeriod, writeDisplayPeriod } from '../src/server/menu-write.js'
import {
  audienceValuesOf, createAuditRepo, createChannelRepo, createMemberRepo, createMenuRepo,
  createScheduleRepo,
} from '../src/server/repo.js'
import type { StrapiV4 } from '../src/server/strapi.js'

type PopulateParams = { populate?: unknown } | undefined

/**
 * `entityService` ของ Strapi 4 คืน relation มาก็ต่อเมื่อถูกขอด้วย `populate` เท่านั้น
 * และกติกานี้ใช้กับ **ขาเขียนด้วย** ไม่ใช่แค่ขาอ่าน
 *
 * ของปลอมตัวเดิมคืน relation ให้เสมอไม่ว่าจะขอหรือไม่ — เทสต์ทุกตัวที่ผ่านมันจึงพิสูจน์ได้แค่ว่า
 * `toRow` แปลงรูปทรงถูก ไม่ได้พิสูจน์ว่า repo ขอ populate จริง นั่นคือช่องที่ปล่อยให้
 * `create`/`update` ที่ลืมขอ populate ผ่าน 608 เทสต์ไปได้ทั้งชุด แล้วไปโผล่บน Strapi ตัวจริง
 * เป็น `channelId: "null"`, `imageFileId: null` และเมนูที่ไม่เคยถูก normalize เลยสักอัน
 */
function applyPopulate(entity: unknown, params: PopulateParams): unknown {
  if (entity === null || typeof entity !== 'object' || Array.isArray(entity)) return entity
  const asked = Array.isArray(params?.populate) ? params!.populate as string[] : []
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entity as Record<string, unknown>)) {
    const isRelation = value !== null && typeof value === 'object' && !Array.isArray(value) && 'id' in value
    if (isRelation && !asked.includes(key)) continue
    out[key] = value
  }
  return out
}

function fakeStrapi(responses: Record<string, unknown>) {
  const calls: { method: string; uid: string; args: unknown[] }[] = []
  const entityService = {
    findMany: vi.fn(async (uid: string, params?: PopulateParams) => {
      calls.push({ method: 'findMany', uid, args: [params] })
      return ((responses['findMany'] as unknown[]) ?? []).map((row) => applyPopulate(row, params))
    }),
    findOne: vi.fn(async (uid: string, id: number | string, params?: PopulateParams) => {
      calls.push({ method: 'findOne', uid, args: [id, params] })
      return applyPopulate(responses['findOne'] ?? null, params)
    }),
    create: vi.fn(async (uid: string, params: { data: unknown } & { populate?: unknown }) => {
      calls.push({ method: 'create', uid, args: [params] })
      return applyPopulate(responses['create'] ?? responses['findOne'], params)
    }),
    update: vi.fn(async (uid: string, id: number | string, params: { data: unknown } & { populate?: unknown }) => {
      calls.push({ method: 'update', uid, args: [id, params] })
      return applyPopulate(responses['update'] ?? responses['findOne'], params)
    }),
    delete: vi.fn(async (uid: string, id: number | string) => {
      calls.push({ method: 'delete', uid, args: [id] })
      return null
    }),
  }
  return { calls, strapi: { entityService } as unknown as StrapiV4, entityService }
}

const menuEntity = {
  id: 7,
  name: 'เมนูหลัก',
  channel: { id: 10 },
  size: 'large',
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom',
  selected: true,
  templateKey: 'RICH_MENU_TEMPLATE_201',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
  image: { id: 11 },
  areaImages: [],
  normalizedImage: { id: 900 },
  normalizedMime: 'image/jpeg',
  normalizedWidth: 2500,
  normalizedHeight: 1686,
  aliasId: 'tab-a',
  status: 'published',
  lineRichMenuId: 'richmenu-a',
  linePublishedAt: '2026-08-20T00:00:00.000Z',
  lastError: null,
  // 'members' ไม่ใช่ 'all' โดยตั้งใจ — Task 16 ทำให้ `toRow` แปลง null/undefined เป็น 'all'
  // ถ้าฟิกซ์เจอร์ตัวนี้เป็น 'all' ด้วย เทสต์ข้างล่างจะเขียวเท่ากันไม่ว่าการแปลงนั้นจะกลืนค่าจริงทิ้งหรือไม่
  audience: 'members',
  updatedAt: '2026-08-20T09:00:00.000Z',
}

describe('createChannelRepo', () => {
  it('แปลง id ที่เป็นตัวเลขเป็นสตริงที่ขอบ', async () => {
    const { strapi } = fakeStrapi({ findOne: { id: 10, name: 'ร้าน', channelId: '1650000000', channelAccessToken: 'v1.a.b.c', channelSecret: null, accessTokenLast4: 'WXYZ', isDefault: true } })
    const row = await createChannelRepo(strapi).findOne('10')
    expect(row).toEqual({
      id: '10', name: 'ร้าน', channelId: '1650000000',
      channelAccessToken: 'v1.a.b.c', channelSecret: null, accessTokenLast4: 'WXYZ', isDefault: true,
      memberRichMenuId: null,
    })
  })

  it('ยิงไปที่ uid ของปลั๊กอิน ไม่ใช่ uid อื่น', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createChannelRepo(strapi).findMany({ filters: { isDefault: true } })
    expect(calls[0]!.uid).toBe(UID.channel)
    expect(calls[0]!.args[0]).toMatchObject({ filters: { isDefault: true } })
  })

  // Task 8 ปิดช่องว่างฝั่ง v4 ของคอลัมน์นี้ (v5 ปิดไปแล้วที่ Task 7 — ดูคอมเมนต์ที่
  // ChannelRow.memberRichMenuId ใน core) — ต้องอ่านค่าที่ตั้งไว้จริงกลับมาได้ ไม่ใช่แค่ไม่พังตอน
  // เป็น undefined
  it('อ่าน memberRichMenuId ที่ตั้งไว้จริงกลับมาได้', async () => {
    const { strapi } = fakeStrapi({
      findOne: {
        id: 10, name: 'ร้าน', channelId: '1650000000', channelAccessToken: 'v1.a.b.c',
        channelSecret: null, accessTokenLast4: 'WXYZ', isDefault: true, memberRichMenuId: 'richmenu-member',
      },
    })
    const row = await createChannelRepo(strapi).findOne('10')
    expect(row!.memberRichMenuId).toBe('richmenu-member')
  })

  it('channel ที่ยังไม่ได้ตั้งเมนูสำหรับสมาชิก อ่าน memberRichMenuId เป็น null ไม่ใช่ undefined หลุดออกไป', async () => {
    const { strapi } = fakeStrapi({ findOne: { id: 10, name: 'ร้าน', channelId: '1650000000', channelAccessToken: 'v1.a.b.c', channelSecret: null, accessTokenLast4: 'WXYZ', isDefault: true } })
    const row = await createChannelRepo(strapi).findOne('10')
    expect(row!.memberRichMenuId).toBeNull()
  })
})

describe('createMenuRepo', () => {
  it('แปลง relation และคอลัมน์ที่ชื่อไม่ตรงกับชั้น service', async () => {
    const { strapi } = fakeStrapi({ findOne: menuEntity })
    expect(await createMenuRepo(strapi).findOne('7')).toEqual({
      id: '7',
      name: 'เมนูหลัก',
      channelId: '10',
      size: 'large',
      chatBarText: 'เปิดเมนู',
      chatBarMode: 'custom',
      selected: true,
      templateKey: 'RICH_MENU_TEMPLATE_201',
      areas: menuEntity.areas,
      imageFileId: 11,
      areaImages: [],
      normalizedFileId: 900,
      normalizedMime: 'image/jpeg',
      normalizedSize: { width: 2500, height: 1686 },
      aliasId: 'tab-a',
      status: 'published',
      lineRichMenuId: 'richmenu-a',
      publishedAt: '2026-08-20T00:00:00.000Z',
      lastError: null,
      audience: 'members',
      updatedAt: '2026-08-20T09:00:00.000Z',
    })
  })

  it('populate relation ที่ต้องใช้ ไม่งั้น id ของ channel และรูปจะไม่กลับมา', async () => {
    const { strapi, calls } = fakeStrapi({ findOne: menuEntity })
    await createMenuRepo(strapi).findOne('7')
    expect(calls[0]!.args[1]).toMatchObject({ populate: ['channel', 'image', 'normalizedImage'] })
  })

  it('เขียนกลับด้วยชื่อฟิลด์ของฐานข้อมูล และขอ populate มาพร้อมกัน', async () => {
    const { strapi, calls } = fakeStrapi({ findOne: menuEntity })
    await createMenuRepo(strapi).update('7', {
      channelId: '10',
      normalizedFileId: 900,
      normalizedSize: { width: 1200, height: 810 },
      publishedAt: '2026-08-21T00:00:00.000Z',
      status: 'published',
    })
    expect(calls[0]!.args[1]).toEqual({
      populate: ['channel', 'image', 'normalizedImage'],
      data: {
        channel: 10,
        normalizedImage: 900,
        normalizedWidth: 1200,
        normalizedHeight: 810,
        linePublishedAt: '2026-08-21T00:00:00.000Z',
        status: 'published',
      },
    })
  })

  /**
   * สองข้อนี้ดูค่าที่ **คืนกลับมา** ไม่ใช่ค่าที่ส่งเข้าไป เพราะนั่นคือจุดที่บั๊กจริงอยู่:
   * `saveMenu` ตัดสินใจว่าจะ normalize รูปหรือไม่จาก row ที่ `create`/`update` คืนมา
   * ถ้า relation ไม่ติดมา `imageFileId` จะเป็น null เสมอ แล้ว `prepareImage` จะไม่ถูกเรียกเลย
   * เมนูทุกอันจึงมี `normalizedFileId` เป็น null ตลอดกาลและ publish ส่งรูปไม่ได้ —
   * ทั้งหมดนี้เกิดขึ้นโดยที่แถวในฐานข้อมูลถูกต้องทุกฟิลด์ จึงไม่มีอะไรใน log บอกเลย
   * (เจอบน Strapi ตัวจริงใน examples/v4-app ไม่ใช่ที่นี่ — ของปลอมตัวเดิมคืน relation ให้เสมอ)
   */
  it('create คืน row ที่มี relation ครบ ไม่ใช่ channelId "null" กับ imageFileId null', async () => {
    const { strapi } = fakeStrapi({ create: menuEntity })
    const row = await createMenuRepo(strapi).create({ name: 'เมนูหลัก', channelId: '10', imageFileId: 11 })
    expect({ channelId: row.channelId, imageFileId: row.imageFileId, normalizedFileId: row.normalizedFileId })
      .toEqual({ channelId: '10', imageFileId: 11, normalizedFileId: 900 })
  })

  it('update คืน row ที่มี relation ครบเช่นกัน', async () => {
    const { strapi } = fakeStrapi({ update: menuEntity })
    const row = await createMenuRepo(strapi).update('7', { imageFileId: 11 })
    expect({ channelId: row.channelId, imageFileId: row.imageFileId, normalizedFileId: row.normalizedFileId })
      .toEqual({ channelId: '10', imageFileId: 11, normalizedFileId: 900 })
  })

  it('filter ด้วย channelId ถูกแปลงเป็น filter บน relation', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createMenuRepo(strapi).findMany({ filters: { channelId: '10' } })
    expect(calls[0]!.args[0]).toMatchObject({ filters: { channel: 10 } })
  })

  it('ค่าที่ยังไม่มีกลายเป็น null / [] ไม่ใช่ undefined — ชั้น service ประกาศไว้แบบนั้น', async () => {
    const { strapi } = fakeStrapi({ findOne: { id: 7, name: 'x', channel: { id: 10 }, size: 'large', chatBarText: 'x', chatBarMode: 'default', selected: false, status: 'draft' } })
    const row = await createMenuRepo(strapi).findOne('7')
    expect(row).toMatchObject({
      areas: [], areaImages: [], imageFileId: null, normalizedFileId: null,
      normalizedMime: null, normalizedSize: null, aliasId: null,
      lineRichMenuId: null, publishedAt: null, lastError: null, templateKey: null,
    })
  })
})

describe('createScheduleRepo', () => {
  it('แปลง relation richMenu เป็น richMenuId ทั้งขาอ่านและขาเขียน', async () => {
    const { strapi, calls } = fakeStrapi({
      findOne: {
        id: 3, richMenu: { id: 7 }, runAt: '2026-08-21T11:00:00.000Z', op: 'set-default',
        state: 'pending', lockedBy: null, lockedAt: null, lastError: null,
      },
    })
    const repo = createScheduleRepo(strapi)
    expect(await repo.findOne('3')).toMatchObject({ id: '3', richMenuId: '7', op: 'set-default' })

    await repo.create({ richMenuId: '7', runAt: '2026-08-21T11:00:00.000Z', op: 'clear-default', state: 'pending' })
    expect(calls[1]!.args[0]).toEqual({
      populate: ['richMenu'],
      data: { richMenu: 7, runAt: '2026-08-21T11:00:00.000Z', op: 'clear-default', state: 'pending' },
    })
  })
})

describe('createAuditRepo', () => {
  it('เขียนตัวเลขลงคอลัมน์ actorId/channelId ไม่ใช่สตริง', async () => {
    const { strapi, calls } = fakeStrapi({ create: { id: 1 } })
    await createAuditRepo(strapi).create({
      actorId: '3', action: 'publish', richMenuId: '7', channelId: '10',
      before: null, after: null, result: 'success', errorCode: null,
    })
    expect(calls[0]!.args[0]).toEqual({
      data: {
        actorId: 3, action: 'publish', richMenuId: '7', channelId: 10,
        before: null, after: null, result: 'success', errorCode: null,
      },
    })
  })

  it('actor ที่เป็น null (งานจาก cron) ยังเขียนได้ ไม่กลายเป็น NaN', async () => {
    const { strapi, calls } = fakeStrapi({ create: { id: 1 } })
    await createAuditRepo(strapi).create({
      actorId: null, action: 'set-default', richMenuId: null, channelId: '10',
      before: null, after: null, result: 'success', errorCode: null,
    })
    expect(calls[0]!.args[0]).toMatchObject({ data: { actorId: null, richMenuId: null } })
  })

  /**
   * Task 10 — repro ตรงของบั๊กที่เจอผ่านเทสต์รอบเต็มของ members controller: richMenuId ของงาน
   * ระดับสมาชิก (link-members/unlink-members) คือ id ฝั่ง LINE ซึ่งเป็นสตริงที่ไม่ใช่ตัวเลข ก่อนแก้
   * `numberOrNull` ที่นี่บังคับผ่าน `Number('line-rm-1')` ได้ `NaN` ซึ่ง Strapi จริงปฏิเสธคอลัมน์
   * integer แล้ว `persistQuietly` กลืน error ทิ้งไปเงียบ ๆ — แถวถูกเขียนแต่ไม่มีใครเห็นว่ามันหาย
   */
  it('richMenuId ที่เป็น id ฝั่ง LINE (ไม่ใช่ตัวเลข) เขียนผ่านตรง ๆ ไม่กลายเป็น NaN', async () => {
    const { strapi, calls } = fakeStrapi({ create: { id: 1 } })
    await createAuditRepo(strapi).create({
      actorId: null, action: 'unlink-members', richMenuId: 'line-rm-1', channelId: '10',
      before: null, after: { unlinked: 2 }, result: 'success', errorCode: null,
    })
    expect(calls[0]!.args[0]).toMatchObject({ data: { richMenuId: 'line-rm-1' } })
  })
})

describe('createMemberRepo', () => {
  it('แปลง relation channel ที่ populate มาเป็น channelId ของชั้น service', async () => {
    const { strapi } = fakeStrapi({
      findMany: [{
        id: 5, lineUserId: `U${'a'.repeat(32)}`,
        channel: { id: 10 }, displayName: null, linkedRichMenuId: null, linkedAt: null,
      }],
    })
    const rows = await createMemberRepo(strapi).findMany()
    expect(rows[0]).toMatchObject({ id: '5', channelId: '10' })
  })

  it('populate ขอ channel เสมอ — ไม่งั้น channelId จะหายไปทุกแถว', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createMemberRepo(strapi).findMany()
    expect((calls[0]!.args[0] as { populate: string[] }).populate).toEqual(['channel'])
  })

  it('กรองด้วย channelId แปลงเป็นเงื่อนไขบน relation ตัวเลข — แพทเทิร์นเดียวกับ menu/schedule', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createMemberRepo(strapi).findMany({ filters: { channelId: '10' } })
    expect(calls[0]!.args[0]).toMatchObject({ filters: { channel: 10 } })
  })

  /**
   * รูปทรงการเรียกจริงจาก `linkMemberChunk` (core/server/members.ts) — `idGreaterThan` เป็น
   * property ระดับบนสุดของ `ListParams`, **ไม่ได้อยู่ใน** `filters` (ดูคอมเมนต์ที่ ListParams
   * ใน core/server/types.ts ว่าทำไมถึงแยกกันโดยตั้งใจ) เทสต์นี้จึงเรียกด้วยรูปทรงนั้นตรง ๆ —
   * ถ้า mapFilters เห็นแต่ input.filters เฉย ๆ (ไม่ผ่านการรวมใน define()) มันจะไม่มีทางเห็น
   * ค่านี้เลย แล้ว findMany จะคืนสมาชิกทั้งชุดทุก chunk เงียบ ๆ — คือบั๊กที่ row-count assertion
   * ใด ๆ จับไม่ได้ เพราะจำนวนแถวที่ได้ยังดูสมเหตุสมผล
   */
  it('idGreaterThan (นอก filters) กลายเป็นเงื่อนไข $gt ตัวเลขของ id — keyset ไม่ใช่ offset', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createMemberRepo(strapi).findMany({
      filters: { channelId: '10' }, idGreaterThan: '5', sort: 'id:asc', limit: 500,
    })
    expect(calls[0]!.args[0]).toEqual({
      populate: ['channel'],
      filters: { channel: 10, id: { $gt: 5 } },
      sort: 'id:asc',
      limit: 500,
    })
  })

  it('ไม่มี idGreaterThan ก็ไม่มี id filter ติดมาเอง', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createMemberRepo(strapi).findMany({ filters: { channelId: '10' }, sort: 'id:asc' })
    expect(calls[0]!.args[0]).toMatchObject({ filters: { channel: 10 }, sort: 'id:asc' })
    expect((calls[0]!.args[0] as { filters: Record<string, unknown> }).filters['id']).toBeUndefined()
  })

  // ต่างจาก v5 ที่ต้องมี mapSort แปล `id:asc` -> `documentId:asc` เพราะ id ของชั้น service กับ id
  // ที่ entityService เรียงให้เป็นคนละคอลัมน์กัน — v4 ใช้ id ตัวเลขคอลัมน์เดียวทั้งกรองและเรียง
  // จึงไม่มีช่องว่างแบบนั้นให้ปิด `sort` จึงไม่ถูกแตะเลยไม่ว่าค่าจะเป็นอะไร
  it('sort ผ่านไปตามเดิมเสมอ ไม่มีการแปล', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createMemberRepo(strapi).findMany({ sort: 'lineUserId:asc' })
    expect((calls[0]!.args[0] as { sort: unknown }).sort).toBe('lineUserId:asc')
  })

  it('เขียน relation ของ channel ด้วยตัวเลขดิบครบทุกฟิลด์', async () => {
    const { strapi, calls } = fakeStrapi({ create: { id: 5 } })
    await createMemberRepo(strapi).create({
      channelId: '10', lineUserId: `U${'a'.repeat(32)}`, displayName: 'คุณเอ',
      linkedRichMenuId: 'richmenu-a', linkedAt: '2026-08-22T00:00:00.000Z',
    })
    expect(calls[0]!.args[0]).toEqual({
      populate: ['channel'],
      data: {
        channel: 10,
        lineUserId: `U${'a'.repeat(32)}`,
        displayName: 'คุณเอ',
        linkedRichMenuId: 'richmenu-a',
        linkedAt: '2026-08-22T00:00:00.000Z',
      },
    })
  })

  // ฟิลด์ที่ optional เหล่านี้หายไปทั้งคีย์ (undefined) ไม่ใช่ตั้งเป็น null ไว้ — จำลองแถวที่ยังไม่เคย
  // ตั้งค่าฟิลด์พวกนี้เลย พิสูจน์ว่า orNull ทำงานจริง ไม่ใช่แค่ null เข้า null ออกโดยบังเอิญ
  it('ฟิลด์ที่หายไปทั้งคีย์ (undefined) กลายเป็น null ไม่ใช่หลุดเป็น undefined ติดไปกับ row', async () => {
    const { strapi } = fakeStrapi({
      findOne: { id: 5, lineUserId: `U${'a'.repeat(32)}`, channel: { id: 10 } },
    })
    expect(await createMemberRepo(strapi).findOne('5')).toEqual({
      id: '5', channelId: '10', lineUserId: `U${'a'.repeat(32)}`,
      displayName: null, linkedRichMenuId: null, linkedAt: null,
    })
  })
})

/**
 * §5.7/§10: ช่วงเวลาแสดงผล (startAt/endAt) ในฟอร์มไม่มีคอลัมน์ของตัวเอง — มันคือแถว
 * rich-menu-schedule ที่ op เป็น 'set-default' (startAt) / 'clear-default' (endAt)
 * Task 16 จะเป็นคนเขียน/อ่านค่านี้จริง แต่กลไกที่มันพึ่งคือ createScheduleRepo ตัวนี้
 * เอง ดังนั้นจึงพิสูจน์ตรงนี้ว่า round trip ผ่าน repo ไม่เพี้ยน — ด้วย fake ที่จำสถานะจริง
 * ไม่ใช่ fake ที่ตอบค่าคงที่แบบด้านบน เพราะการ "เขียนแล้วอ่านกลับ" ต้องผ่าน store จริง ๆ
 * ถึงจะจับบั๊กที่เกิดเฉพาะตอน round trip ได้ (เช่น แปลงไปทางเดียวแต่ไม่แปลงกลับ)
 */
function statefulScheduleStrapi() {
  let autoId = 1
  // เก็บ `richMenu` เป็นเลข FK ดิบ ๆ เหมือนคอลัมน์จริงในตาราง — ไม่ใช่ object ที่ populate แล้ว
  // เพื่อให้ filter เทียบค่าตรง ๆ ได้เหมือน entityService จริง ส่วนตอนคืนออก (findOne/findMany)
  // ค่อยห่อเป็น `{ id }` เลียนแบบผลลัพธ์ตอน populate จริง
  const rows = new Map<number, { id: number; richMenu: number; [key: string]: unknown }>()

  // ห่อ FK เป็น `{ id }` ให้ **เฉพาะตอนที่ถูกขอด้วย populate** เหมือน entityService จริง —
  // ถ้าไม่ขอ คีย์นั้นหายไปเลย ไม่ใช่โผล่มาเป็นเลขดิบ
  function toEntity(
    row: { id: number; richMenu: number; [key: string]: unknown },
    params?: { populate?: unknown },
  ) {
    const asked = Array.isArray(params?.populate) ? params!.populate as string[] : []
    const { richMenu, ...rest } = row
    return asked.includes('richMenu') ? { ...rest, richMenu: { id: richMenu } } : rest
  }

  const entityService = {
    findMany: async (_uid: string, params?: { filters?: Record<string, unknown>; populate?: unknown }) => {
      const filters = params?.filters ?? {}
      return [...rows.values()]
        .filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value))
        .map((row) => toEntity(row, params))
    },
    findOne: async (_uid: string, id: number | string, params?: { populate?: unknown }) => {
      const row = rows.get(Number(id))
      return row === undefined ? null : toEntity(row, params)
    },
    create: async (_uid: string, params: { data: Record<string, unknown>; populate?: unknown }) => {
      const id = autoId++
      const row = { id, ...params.data } as { id: number; richMenu: number; [key: string]: unknown }
      rows.set(id, row)
      return toEntity(row, params)
    },
    update: async (_uid: string, id: number | string, params: { data: Record<string, unknown>; populate?: unknown }) => {
      const existing = rows.get(Number(id))
      if (existing === undefined) throw new Error(`no row ${String(id)}`)
      const next = { ...existing, ...params.data } as typeof existing
      rows.set(Number(id), next)
      return toEntity(next, params)
    },
    delete: async (_uid: string, id: number | string) => {
      rows.delete(Number(id))
      return null
    },
  }
  return { entityService } as unknown as StrapiV4
}

/**
 * ตัวช่วยสองตัวนี้เคยเป็นสำเนาที่นั่งอยู่ในไฟล์เทสต์นี้เอง — เทสต์จึงพิสูจน์ได้แค่ fixture ของตัวเอง
 * ไม่ใช่ของที่ปลั๊กอินใช้จริง ตอนนี้ import มาจาก `src/server/menu-write.ts` ตรง ๆ
 */
describe('round trip: ช่วงเวลาแสดงผล (startAt/endAt) ผ่าน schedule rows', () => {
  it('ตั้งไว้ทั้งสองค่า อ่านกลับมาต้องได้ทั้งสองค่าเป๊ะ', async () => {
    const schedules = createScheduleRepo(statefulScheduleStrapi())
    const period = { startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z' }
    await writeDisplayPeriod(schedules, '7', period)
    expect(await readDisplayPeriod(schedules, '7')).toEqual(period)
  })

  it('ตั้งไว้แค่ startAt — endAt ต้องอ่านกลับมาเป็น null ไม่ใช่ undefined หรือค่าค้าง', async () => {
    const schedules = createScheduleRepo(statefulScheduleStrapi())
    const period = { startAt: '2026-09-01T00:00:00.000Z', endAt: null }
    await writeDisplayPeriod(schedules, '7', period)
    expect(await readDisplayPeriod(schedules, '7')).toEqual(period)
  })

  it('ตั้งไว้แค่ endAt — startAt ต้องอ่านกลับมาเป็น null ไม่ใช่ undefined หรือค่าค้าง', async () => {
    const schedules = createScheduleRepo(statefulScheduleStrapi())
    const period = { startAt: null, endAt: '2026-09-30T00:00:00.000Z' }
    await writeDisplayPeriod(schedules, '7', period)
    expect(await readDisplayPeriod(schedules, '7')).toEqual(period)
  })

  it('ไม่ตั้งค่าไหนเลย — อ่านกลับมาต้องเป็น null ทั้งคู่ ไม่ใช่โยน หรือคืนของเมนูอื่น', async () => {
    const schedules = createScheduleRepo(statefulScheduleStrapi())
    await writeDisplayPeriod(schedules, '7', { startAt: null, endAt: null })
    expect(await readDisplayPeriod(schedules, '7')).toEqual({ startAt: null, endAt: null })
  })

  it('เขียนทับค่าที่ตั้งไว้เดิม (แก้ startAt จากมีเป็นไม่มี) ต้องไม่เหลือแถวเก่าให้อ่านย้อนกลับมา', async () => {
    const schedules = createScheduleRepo(statefulScheduleStrapi())
    await writeDisplayPeriod(schedules, '7', { startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z' })
    await writeDisplayPeriod(schedules, '7', { startAt: null, endAt: '2026-09-30T00:00:00.000Z' })
    expect(await readDisplayPeriod(schedules, '7')).toEqual({ startAt: null, endAt: '2026-09-30T00:00:00.000Z' })
  })

  it('เมนูอื่นมี schedule ของตัวเอง ไม่ปนกับเมนูนี้', async () => {
    const schedules = createScheduleRepo(statefulScheduleStrapi())
    await writeDisplayPeriod(schedules, '7', { startAt: '2026-09-01T00:00:00.000Z', endAt: null })
    await writeDisplayPeriod(schedules, '8', { startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z' })
    expect(await readDisplayPeriod(schedules, '7')).toEqual({ startAt: '2026-09-01T00:00:00.000Z', endAt: null })
    expect(await readDisplayPeriod(schedules, '8')).toEqual({
      startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z',
    })
  })
})

/**
 * Task 16 — แถวที่มีอยู่ก่อนคอลัมน์ `audience` ถูกเพิ่มเข้าตาราง ถือ `NULL` ตลอดไป
 *
 * `default: 'all'` บน content-type ไม่เคยกลายเป็น DEFAULT ของฐานข้อมูล Strapi ใส่ค่านั้นให้ตอน
 * *สร้างแถว* เท่านั้น (วัดบน SQLite และ PostgreSQL 16 ทั้ง Strapi 4 และ 5 — task-15-report.md
 * §"Step 2") เทสต์อื่นทั้งไฟล์ป้อน entity ที่ `audience` ถูกต้องอยู่แล้ว จึงไม่มีตัวไหนแตะเส้นนี้เลย
 *
 * นี่คือครึ่งขาอ่านของคู่ที่อีกครึ่งคือ `backfillLegacyAudience` (tests/bootstrap.test.ts) —
 * คนละไฟล์ คนละของปลอม โดยตั้งใจ ตัวไหนพังต้องแดงคนละดวง ไม่ใช่ให้อีกตัวปิดให้
 */
describe('createMenuRepo — audience ของแถวที่เก่ากว่าคอลัมน์', () => {
  const legacyEntity = (audience: unknown) => ({
    id: 7, name: 'เมนูเก่า', channel: { id: 10 }, size: 'large', chatBarText: 'x',
    chatBarMode: 'default', selected: true, status: 'published', audience,
  })

  it("แถวที่ audience เป็น null อ่านออกมาเป็น 'all' ไม่ใช่ null ที่หลุดผ่าน type ที่บอกว่าเป็นไปไม่ได้", async () => {
    const { strapi } = fakeStrapi({ findOne: legacyEntity(null) })
    expect((await createMenuRepo(strapi).findOne('7'))!.audience).toBe('all')
  })

  it('ขา findMany ต้องแปลงด้วย — หน้ารายการอ่านผ่านทางนี้ ไม่ใช่ findOne', async () => {
    const { strapi } = fakeStrapi({ findMany: [legacyEntity(null), legacyEntity('members')] })
    const rows = await createMenuRepo(strapi).findMany()
    expect(rows.map((row) => row.audience)).toEqual(['all', 'members'])
  })

  it("'members' ต้องไม่ถูกกลืนเป็น 'all' ระหว่างทาง — การแปลงนี้ครอบแค่ค่าที่ไม่มี", async () => {
    const { strapi } = fakeStrapi({ findOne: legacyEntity('members') })
    expect((await createMenuRepo(strapi).findOne('7'))!.audience).toBe('members')
  })

  /**
   * Task 16 fix round 1 — ตัวจริงของด่านนี้ เดินตาม `enum` ที่ประกาศไว้ใน content-types/rich-menu.ts
   * ตรง ๆ แทนที่จะเขียนรายการ `['all', 'members']` ซ้ำไว้ในเทสต์เอง เพื่อผูกเทสต์นี้เข้ากับ
   * ประกาศจริงของสคีมา — วันที่มีคนเพิ่มค่า audience ตัวที่สามเข้าไปใน `enum` เทสต์ข้อนี้จะเดิน
   * ทดสอบค่าใหม่นั้นเองโดยไม่ต้องมีใครมาแก้ไฟล์เทสต์เพิ่ม ถ้า `audienceOrAll` ยังไม่รู้จักค่านั้น
   * (เช่นเพราะยังเขียนเช็คแบบฮาร์ดโค้ดอยู่) เทสต์นี้จะแดงเอง
   */
  const declaredAudienceValues = richMenu.schema.attributes['audience']?.enum ?? []

  it('enum ของ audience ต้องประกาศไว้จริง ไม่ใช่ชุดว่าง — กันเทสต์ข้างล่างเขียวเปล่าเพราะไม่มีอะไรให้วน', () => {
    expect(declaredAudienceValues.length).toBeGreaterThan(0)
  })

  it.each(declaredAudienceValues)(
    "ค่าที่ประกาศไว้ใน enum ('%s') ต้องรอดผ่าน audienceOrAll มาไม่เปลี่ยน",
    async (value) => {
      const { strapi } = fakeStrapi({ findOne: legacyEntity(value) })
      expect((await createMenuRepo(strapi).findOne('7'))!.audience).toBe(value)
    },
  )

  // ตั้งชื่อเคสนี้ไว้ตรง ๆ ตามที่ finding ข้อ 2 ขอ — เดิม toMatchObject ในเทสต์อื่นของไฟล์นี้
  // (บรรทัด ~209) ไม่ได้ใส่ audience ไว้ในอ็อบเจกต์ที่เทียบเลย จึงไม่ได้พิสูจน์อะไรเกี่ยวกับ
  // undefined เลยสักนิด
  it("audience ที่เป็น undefined อ่านออกมาเป็น 'all' เหมือน null", async () => {
    const { strapi } = fakeStrapi({ findOne: legacyEntity(undefined) })
    expect((await createMenuRepo(strapi).findOne('7'))!.audience).toBe('all')
  })

  // ตัวแทนของแถวที่มาจาก restore/dump เก่า/เครื่องมืออื่นที่เขียนตารางตรง ๆ — Strapi ไม่สร้าง CHECK
  // constraint ให้คอลัมน์ enumeration เลย คอลัมน์นี้จึงรับสตริงอะไรก็ได้จริง ๆ ไม่ใช่แค่ทางทฤษฎี
  it("สตริงที่ไม่ใช่ enum เช่น 'Members' ต้องกลายเป็น 'all' ไม่ใช่เดินทะลุ cast ที่ไม่ได้เช็ค", async () => {
    const { strapi } = fakeStrapi({ findOne: legacyEntity('Members') })
    expect((await createMenuRepo(strapi).findOne('7'))!.audience).toBe('all')
  })
})

/**
 * Task 16 fix round 2 — พิสูจน์ว่า fallback ตอนอ่าน `enum` ของ `audience` จากสคีมาไม่ได้เลย
 * (attribute หายไปทั้งตัว หรือมีอยู่แต่ไม่มี `enum`) ไม่ทำให้ `'members'` ถูกปฏิเสธเงียบ ๆ เหมือนที่
 * `?? []` เดิมเคยทำ — ครอบ `audienceValuesOf` ตรง ๆ ไม่ผ่าน `createMenuRepo`/`fakeStrapi` เพราะ
 * `AUDIENCE_VALUES` ระดับโมดูลใน repo.ts ผูกกับ `richMenu.schema` จริงตายตัวตั้งแต่โหลดไฟล์ —
 * ไม่มีทางสับเปลี่ยนสคีมาที่ `createMenuRepo` เห็นได้จากเทสต์เลย `audienceValuesOf` ที่ export
 * มาคือจุดเดียวที่ยัดสคีมาปลอมเข้าไปพิสูจน์เส้นทาง fallback ได้จริง
 *
 * `audienceOrAllUsing` จำลองตรรกะของ `audienceOrAll` ใน repo.ts ทุกตัวอักษร (`typeof value ===
 * 'string' && values.includes(value) ? value : 'all'`) — ใช้ผลลัพธ์จริงจาก `audienceValuesOf`
 * ไม่ใช่ชุดค่าที่เทสต์เขียนเองแยกต่างหาก เพื่อพิสูจน์ว่าเส้นทางที่ `audienceOrAll` จริงจะเดินเมื่อ
 * สคีมาพังแบบนี้ ให้ผลลัพธ์แบบเดียวกับที่เทสต์นี้ตรวจ
 */
describe('audienceValuesOf — fallback ตอนอ่าน enum ของ audience จากสคีมาไม่ได้', () => {
  const audienceOrAllUsing = (values: readonly RichMenuRow['audience'][], value: unknown) =>
    typeof value === 'string' && values.includes(value as RichMenuRow['audience']) ? value : 'all'

  it("สคีมาที่ไม่มี attribute 'audience' เลย ต้องยังให้ 'members' รอดผ่าน audienceOrAll ไม่ใช่กลายเป็นชุดว่าง", () => {
    const schema: ContentTypeSchema = {
      kind: 'collectionType',
      collectionName: 'rich_menus',
      info: { singularName: 'rich-menu', pluralName: 'rich-menus', displayName: 'Rich menu' },
      attributes: { name: { type: 'string', required: true } },
    }
    const values = audienceValuesOf(schema)
    expect(audienceOrAllUsing(values, 'members')).toBe('members')
  })

  it("attribute 'audience' ที่ไม่มี key 'enum' ต้องยังให้ 'members' รอดผ่าน audienceOrAll ไม่ใช่กลายเป็นชุดว่าง", () => {
    const schema: ContentTypeSchema = {
      kind: 'collectionType',
      collectionName: 'rich_menus',
      info: { singularName: 'rich-menu', pluralName: 'rich-menus', displayName: 'Rich menu' },
      attributes: { audience: { type: 'enumeration', required: true, default: 'all' } },
    }
    const values = audienceValuesOf(schema)
    expect(audienceOrAllUsing(values, 'members')).toBe('members')
  })
})
