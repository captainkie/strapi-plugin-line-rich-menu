import { describe, expect, it, vi } from 'vitest'
import { UID } from '../src/server/content-types/index.js'
import { createAuditRepo, createChannelRepo, createMenuRepo, createScheduleRepo } from '../src/server/repo.js'
import type { StrapiV4 } from '../src/server/strapi.js'

function fakeStrapi(responses: Record<string, unknown>) {
  const calls: { method: string; uid: string; args: unknown[] }[] = []
  const entityService = {
    findMany: vi.fn(async (uid: string, params?: unknown) => {
      calls.push({ method: 'findMany', uid, args: [params] })
      return (responses['findMany'] as unknown[]) ?? []
    }),
    findOne: vi.fn(async (uid: string, id: number | string, params?: unknown) => {
      calls.push({ method: 'findOne', uid, args: [id, params] })
      return responses['findOne'] ?? null
    }),
    create: vi.fn(async (uid: string, params: { data: unknown }) => {
      calls.push({ method: 'create', uid, args: [params] })
      return responses['create'] ?? responses['findOne']
    }),
    update: vi.fn(async (uid: string, id: number | string, params: { data: unknown }) => {
      calls.push({ method: 'update', uid, args: [id, params] })
      return responses['update'] ?? responses['findOne']
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
  updatedAt: '2026-08-20T09:00:00.000Z',
}

describe('createChannelRepo', () => {
  it('แปลง id ที่เป็นตัวเลขเป็นสตริงที่ขอบ', async () => {
    const { strapi } = fakeStrapi({ findOne: { id: 10, name: 'ร้าน', channelId: '1650000000', channelAccessToken: 'v1.a.b.c', channelSecret: null, accessTokenLast4: 'WXYZ', isDefault: true } })
    const row = await createChannelRepo(strapi).findOne('10')
    expect(row).toEqual({
      id: '10', name: 'ร้าน', channelId: '1650000000',
      channelAccessToken: 'v1.a.b.c', channelSecret: null, accessTokenLast4: 'WXYZ', isDefault: true,
    })
  })

  it('ยิงไปที่ uid ของปลั๊กอิน ไม่ใช่ uid อื่น', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createChannelRepo(strapi).findMany({ filters: { isDefault: true } })
    expect(calls[0]!.uid).toBe(UID.channel)
    expect(calls[0]!.args[0]).toMatchObject({ filters: { isDefault: true } })
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
      updatedAt: '2026-08-20T09:00:00.000Z',
    })
  })

  it('populate relation ที่ต้องใช้ ไม่งั้น id ของ channel และรูปจะไม่กลับมา', async () => {
    const { strapi, calls } = fakeStrapi({ findOne: menuEntity })
    await createMenuRepo(strapi).findOne('7')
    expect(calls[0]!.args[1]).toMatchObject({ populate: ['channel', 'image', 'normalizedImage'] })
  })

  it('เขียนกลับด้วยชื่อฟิลด์ของฐานข้อมูล', async () => {
    const { strapi, calls } = fakeStrapi({ findOne: menuEntity })
    await createMenuRepo(strapi).update('7', {
      channelId: '10',
      normalizedFileId: 900,
      normalizedSize: { width: 1200, height: 810 },
      publishedAt: '2026-08-21T00:00:00.000Z',
      status: 'published',
    })
    expect(calls[0]!.args[1]).toEqual({
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
      data: { richMenu: 7, runAt: '2026-08-21T11:00:00.000Z', op: 'clear-default', state: 'pending' },
    })
  })
})

describe('createAuditRepo', () => {
  it('เขียนตัวเลขลงคอลัมน์ตัวเลข ไม่ใช่สตริง', async () => {
    const { strapi, calls } = fakeStrapi({ create: { id: 1 } })
    await createAuditRepo(strapi).create({
      actorId: '3', action: 'publish', richMenuId: '7', channelId: '10',
      before: null, after: null, result: 'success', errorCode: null,
    })
    expect(calls[0]!.args[0]).toEqual({
      data: {
        actorId: 3, action: 'publish', richMenuId: 7, channelId: 10,
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

  function toEntity(row: { id: number; richMenu: number; [key: string]: unknown }) {
    return { ...row, richMenu: { id: row.richMenu } }
  }

  const entityService = {
    findMany: async (_uid: string, params?: { filters?: Record<string, unknown> }) => {
      const filters = params?.filters ?? {}
      return [...rows.values()]
        .filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value))
        .map(toEntity)
    },
    findOne: async (_uid: string, id: number | string) => {
      const row = rows.get(Number(id))
      return row === undefined ? null : toEntity(row)
    },
    create: async (_uid: string, params: { data: Record<string, unknown> }) => {
      const id = autoId++
      const row = { id, ...params.data } as { id: number; richMenu: number; [key: string]: unknown }
      rows.set(id, row)
      return toEntity(row)
    },
    update: async (_uid: string, id: number | string, params: { data: Record<string, unknown> }) => {
      const existing = rows.get(Number(id))
      if (existing === undefined) throw new Error(`no row ${String(id)}`)
      const next = { ...existing, ...params.data } as typeof existing
      rows.set(Number(id), next)
      return toEntity(next)
    },
    delete: async (_uid: string, id: number | string) => {
      rows.delete(Number(id))
      return null
    },
  }
  return { entityService } as unknown as StrapiV4
}

/** จำลองสิ่งที่ Task 16 จะทำ: ล้าง pending แถวเดิมของเมนูนี้ แล้วสร้างใหม่ตามค่าที่ไม่ใช่ null */
async function writeDisplayPeriod(
  strapi: StrapiV4,
  menuId: string,
  period: { startAt: string | null; endAt: string | null },
) {
  const repo = createScheduleRepo(strapi)
  const existing = await repo.findMany({ filters: { richMenuId: menuId, state: 'pending' } })
  await Promise.all(existing.map((row) => repo.delete(row.id)))
  if (period.startAt !== null) {
    await repo.create({ richMenuId: menuId, runAt: period.startAt, op: 'set-default', state: 'pending' })
  }
  if (period.endAt !== null) {
    await repo.create({ richMenuId: menuId, runAt: period.endAt, op: 'clear-default', state: 'pending' })
  }
}

/** จำลองสิ่งที่ Task 16 จะทำตอนอ่านฟอร์มกลับ */
async function readDisplayPeriod(strapi: StrapiV4, menuId: string) {
  const repo = createScheduleRepo(strapi)
  const schedules = await repo.findMany({ filters: { richMenuId: menuId, state: 'pending' } })
  return {
    startAt: schedules.find((s) => s.op === 'set-default')?.runAt ?? null,
    endAt: schedules.find((s) => s.op === 'clear-default')?.runAt ?? null,
  }
}

describe('round trip: ช่วงเวลาแสดงผล (startAt/endAt) ผ่าน schedule rows', () => {
  it('ตั้งไว้ทั้งสองค่า อ่านกลับมาต้องได้ทั้งสองค่าเป๊ะ', async () => {
    const strapi = statefulScheduleStrapi()
    const period = { startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z' }
    await writeDisplayPeriod(strapi, '7', period)
    expect(await readDisplayPeriod(strapi, '7')).toEqual(period)
  })

  it('ตั้งไว้แค่ startAt — endAt ต้องอ่านกลับมาเป็น null ไม่ใช่ undefined หรือค่าค้าง', async () => {
    const strapi = statefulScheduleStrapi()
    const period = { startAt: '2026-09-01T00:00:00.000Z', endAt: null }
    await writeDisplayPeriod(strapi, '7', period)
    expect(await readDisplayPeriod(strapi, '7')).toEqual(period)
  })

  it('ตั้งไว้แค่ endAt — startAt ต้องอ่านกลับมาเป็น null ไม่ใช่ undefined หรือค่าค้าง', async () => {
    const strapi = statefulScheduleStrapi()
    const period = { startAt: null, endAt: '2026-09-30T00:00:00.000Z' }
    await writeDisplayPeriod(strapi, '7', period)
    expect(await readDisplayPeriod(strapi, '7')).toEqual(period)
  })

  it('ไม่ตั้งค่าไหนเลย — อ่านกลับมาต้องเป็น null ทั้งคู่ ไม่ใช่โยน หรือคืนของเมนูอื่น', async () => {
    const strapi = statefulScheduleStrapi()
    await writeDisplayPeriod(strapi, '7', { startAt: null, endAt: null })
    expect(await readDisplayPeriod(strapi, '7')).toEqual({ startAt: null, endAt: null })
  })

  it('เขียนทับค่าที่ตั้งไว้เดิม (แก้ startAt จากมีเป็นไม่มี) ต้องไม่เหลือแถวเก่าให้อ่านย้อนกลับมา', async () => {
    const strapi = statefulScheduleStrapi()
    await writeDisplayPeriod(strapi, '7', { startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z' })
    await writeDisplayPeriod(strapi, '7', { startAt: null, endAt: '2026-09-30T00:00:00.000Z' })
    expect(await readDisplayPeriod(strapi, '7')).toEqual({ startAt: null, endAt: '2026-09-30T00:00:00.000Z' })
  })

  it('เมนูอื่นมี schedule ของตัวเอง ไม่ปนกับเมนูนี้', async () => {
    const strapi = statefulScheduleStrapi()
    await writeDisplayPeriod(strapi, '7', { startAt: '2026-09-01T00:00:00.000Z', endAt: null })
    await writeDisplayPeriod(strapi, '8', { startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z' })
    expect(await readDisplayPeriod(strapi, '7')).toEqual({ startAt: '2026-09-01T00:00:00.000Z', endAt: null })
    expect(await readDisplayPeriod(strapi, '8')).toEqual({
      startAt: '2026-10-01T00:00:00.000Z', endAt: '2026-10-31T00:00:00.000Z',
    })
  })
})
