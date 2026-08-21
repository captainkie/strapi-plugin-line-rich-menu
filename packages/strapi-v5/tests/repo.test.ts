import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { UID } from '../server/src/content-types/index.js'
import {
  createAuditRepo, createChannelRepo, createImageStore, createMenuRepo, createScheduleRepo,
} from '../server/src/repo.js'
import type { DocumentParams, StrapiV5 } from '../server/src/strapi.js'

type Call = { uid: string; method: string; params: unknown }

/**
 * `documents()` ของ Strapi 5 คืน relation มาก็ต่อเมื่อถูกขอด้วย `populate` เท่านั้น เหมือนกับ
 * `entityService` ของ v4 ทุกประการ และกติกานี้ใช้กับ **ขาเขียนด้วย** ไม่ใช่แค่ขาอ่าน
 *
 * ตัวช่วยนี้คัดลอกมาจาก `packages/strapi-v4/tests/repo.test.ts` โดยตั้งใจ และคัดลอกมา
 * **ก่อน** ที่ repo จะถูกเขียน ไม่ใช่หลัง เพราะของปลอมที่ใจกว้างกว่าของจริงเคยทำให้บั๊กที่ทำให้
 * `prepareImage` ไม่เคยทำงานเลยสักครั้ง ผ่าน 608 เทสต์ไปได้ทั้งชุด แล้วไปโผล่บน Strapi ตัวจริง
 * เป็น `imageFileId: null` ทุกแถวและเมนูที่ publish ไม่ได้เลย
 *
 * ต่างจากของ v4 ตรงที่ relation ของ v5 ระบุตัวได้ทั้ง `documentId` และ `id` — ต้องนับทั้งสองแบบ
 * เป็น relation ไม่งั้น relation ที่มีแต่ `documentId` จะรอดมาโดยไม่ถูกขอ
 */
function applyPopulate(entity: unknown, params: { populate?: unknown } | undefined): unknown {
  if (entity === null || typeof entity !== 'object' || Array.isArray(entity)) return entity
  const populate = params?.populate
  const asked = Array.isArray(populate) ? populate as string[] : []
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entity as Record<string, unknown>)) {
    const isRelation = value !== null && typeof value === 'object' && !Array.isArray(value)
      && ('id' in value || 'documentId' in value)
    if (isRelation && !asked.includes(key)) continue
    out[key] = value
  }
  return out
}

/**
 * strapi ปลอมที่บันทึกทุกการเรียก `documents()` ไว้ — เทสต์กลุ่มนี้พิสูจน์ **รูปทรงของคำขอ**
 * ที่ repo ยิงออกไป ไม่ใช่พฤติกรรมของฐานข้อมูล เพราะสิ่งที่แตกต่างจริงระหว่าง v4 กับ v5 อยู่ตรงนั้น
 */
function fakeStrapi(results: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const api = (uid: string) => ({
    findMany: vi.fn(async (params?: DocumentParams) => {
      calls.push({ uid, method: 'findMany', params })
      return ((results['findMany'] as unknown[] | undefined) ?? []).map((row) => applyPopulate(row, params))
    }),
    findOne: vi.fn(async (params: DocumentParams) => {
      calls.push({ uid, method: 'findOne', params })
      return applyPopulate(results['findOne'] ?? null, params)
    }),
    create: vi.fn(async (params: DocumentParams) => {
      calls.push({ uid, method: 'create', params })
      return applyPopulate(results['create'] ?? {}, params)
    }),
    update: vi.fn(async (params: DocumentParams) => {
      calls.push({ uid, method: 'update', params })
      return applyPopulate(results['update'] ?? {}, params)
    }),
    delete: vi.fn(async (params: DocumentParams) => {
      calls.push({ uid, method: 'delete', params })
      return { documentIds: ['x'] }
    }),
  })
  const strapi = { documents: (uid: string) => api(uid) } as unknown as StrapiV5
  return { strapi, calls }
}

const menuEntity = {
  documentId: 'mn0000000000000000000001',
  // primary key ของแถว ที่ไม่ควรมีใครหยิบไปใช้แทน documentId
  id: 7,
  name: 'เมนูหลัก',
  channel: { documentId: 'ch0000000000000000000001', id: 10 },
  size: 'large',
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom',
  selected: true,
  templateKey: 'RICH_MENU_TEMPLATE_201',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
  // ไฟล์ของ upload plugin ยังใช้ id เป็นตัวเลขใน Strapi 5 — media ไม่ใช่ document
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

describe('documents() repo — รูปทรงของคำขอ', () => {
  it('findOne ส่ง documentId เป็นสตริง ไม่ใช่ตัวเลขที่แปลงมา', async () => {
    const { strapi, calls } = fakeStrapi()
    await createChannelRepo(strapi).findOne('kx91p2m4c7v0b8n3q5r6t7y8')
    expect(calls[0]).toEqual({
      uid: UID.channel,
      method: 'findOne',
      params: { documentId: 'kx91p2m4c7v0b8n3q5r6t7y8' },
    })
  })

  it('delete ก็ส่ง documentId ทางเดียวกัน — ไม่มี positional argument แบบ entityService', async () => {
    const { strapi, calls } = fakeStrapi()
    await createChannelRepo(strapi).delete('abc123')
    expect(calls[0]!.params).toEqual({ documentId: 'abc123' })
  })

  it('update วาง documentId กับ data ไว้ในอ็อบเจกต์เดียวกัน', async () => {
    const { strapi, calls } = fakeStrapi({ update: { documentId: 'abc123', name: 'ใหม่' } })
    await createChannelRepo(strapi).update('abc123', { name: 'ใหม่' })
    expect(calls[0]!.params).toEqual({ documentId: 'abc123', data: { name: 'ใหม่' } })
  })

  it('limit/start/sort ถูกส่งต่อโดยไม่แปลงเป็น pagination — Document Service รับ offset ตรง ๆ', async () => {
    const { strapi, calls } = fakeStrapi()
    await createChannelRepo(strapi).findMany({ limit: 1 })
    expect(calls[0]!.params).toEqual({ limit: 1 })

    await createChannelRepo(strapi).findMany({ start: 20, limit: 10, sort: 'name:asc' })
    expect(calls[1]!.params).toEqual({ start: 20, limit: 10, sort: 'name:asc' })
  })

  it('ไม่มีพารามิเตอร์เลยก็ไม่ส่งคีย์ที่เป็น undefined ไปให้ Document Service', async () => {
    const { strapi, calls } = fakeStrapi()
    await createChannelRepo(strapi).findMany()
    expect(calls[0]!.params).toEqual({})
  })
})

describe('channel repo', () => {
  it('อ่าน documentId มาเป็น id ของชั้น service', async () => {
    const { strapi } = fakeStrapi({
      findOne: {
        documentId: 'ch0000000000000000000001', id: 7,
        name: 'ร้าน', channelId: '1650000000',
        channelAccessToken: 'v1.iv.tag.ct', channelSecret: null,
        accessTokenLast4: 'ABCD', isDefault: true,
      },
    })
    const row = await createChannelRepo(strapi).findOne('ch0000000000000000000001')
    expect(row).toEqual({
      id: 'ch0000000000000000000001',
      name: 'ร้าน',
      channelId: '1650000000',
      channelAccessToken: 'v1.iv.tag.ct',
      channelSecret: null,
      accessTokenLast4: 'ABCD',
      isDefault: true,
    })
  })

  // `id: 7` ที่ติดมาด้วยคือ primary key ของแถว ไม่ใช่ตัวระบุที่ชั้น service ใช้ — ถ้าหยิบผิดตัว
  // ทุกอย่างจะ "ทำงาน" ในเทสต์ที่มีแถวเดียว แล้วพังตอนมีสองแถวขึ้นไปในแอปจริง
  it('ไม่หยิบคอลัมน์ id มาใช้แทน documentId เด็ดขาด', async () => {
    const { strapi } = fakeStrapi({
      findOne: { documentId: 'ch0000000000000000000001', id: 7, name: '', channelId: '', accessTokenLast4: '', isDefault: false },
    })
    expect((await createChannelRepo(strapi).findOne('ch0000000000000000000001'))!.id).not.toBe('7')
  })

  it('ไม่มีแถวคืน null ไม่ใช่แถวเปล่าที่ทุกฟิลด์เป็น undefined', async () => {
    const { strapi } = fakeStrapi({ findOne: null })
    expect(await createChannelRepo(strapi).findOne('ch0000000000000000000001')).toBeNull()
  })

  it('ยิงไปที่ uid ของปลั๊กอิน ไม่ใช่ uid อื่น', async () => {
    const { strapi, calls } = fakeStrapi()
    await createChannelRepo(strapi).findMany({ filters: { isDefault: true } })
    expect(calls[0]!.uid).toBe(UID.channel)
    expect(calls[0]!.params).toEqual({ filters: { isDefault: true } })
  })
})

describe('menu repo', () => {
  it('อ่านทุกฟิลด์ที่ชั้น service ประกาศไว้ ครบทั้งแถว', async () => {
    const { strapi } = fakeStrapi({ findOne: menuEntity })
    const row = await createMenuRepo(strapi).findOne('mn0000000000000000000001')
    expect(row).toEqual({
      id: 'mn0000000000000000000001',
      name: 'เมนูหลัก',
      // relation ของ channel อ่านผ่าน documentId ของ relation ไม่ใช่ id
      channelId: 'ch0000000000000000000001',
      size: 'large',
      chatBarText: 'เปิดเมนู',
      chatBarMode: 'custom',
      selected: true,
      templateKey: 'RICH_MENU_TEMPLATE_201',
      areas: menuEntity.areas,
      // ไฟล์ของ upload plugin ยังใช้ id เป็นตัวเลขใน Strapi 5 — media จึงยังเป็น number
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

  it('เขียน relation ของ channel ด้วย set ของ documentId ไม่ใช่ตัวเลข', async () => {
    const { strapi, calls } = fakeStrapi({ create: { documentId: 'mn1', channel: { documentId: 'ch1' } } })
    await createMenuRepo(strapi).create({ name: 'ใหม่', channelId: 'ch0000000000000000000001' })
    const data = (calls[0]!.params as { data: Record<string, unknown> }).data
    expect(data['channel']).toEqual({ set: ['ch0000000000000000000001'] })
  })

  it('กรองด้วย channelId แปลงเป็นเงื่อนไขบน documentId ของ relation', async () => {
    const { strapi, calls } = fakeStrapi()
    await createMenuRepo(strapi).findMany({ filters: { channelId: 'ch0000000000000000000001' } })
    expect((calls[0]!.params as { filters: unknown }).filters).toEqual({
      channel: { documentId: 'ch0000000000000000000001' },
    })
  })

  it('populate ครบสามตัวที่ toRow อ่าน — ไม่งั้น channelId จะเป็น null ทุกแถว', async () => {
    const { strapi, calls } = fakeStrapi()
    await createMenuRepo(strapi).findMany()
    expect((calls[0]!.params as { populate: string[] }).populate.sort())
      .toEqual(['channel', 'image', 'normalizedImage'])
  })

  /**
   * สองข้อนี้ดูค่าที่ **คืนกลับมา** ไม่ใช่ค่าที่ส่งเข้าไป เพราะนั่นคือจุดที่บั๊กจริงของ v4 อยู่:
   * `saveMenu` ตัดสินใจว่าจะ normalize รูปหรือไม่จาก row ที่ `create`/`update` คืนมา
   * ถ้า relation ไม่ติดมา `imageFileId` จะเป็น null เสมอ แล้ว `prepareImage` จะไม่ถูกเรียกเลย
   * เมนูทุกอันจึงมี `normalizedFileId` เป็น null ตลอดกาลและ publish ส่งรูปไม่ได้ — โดยที่แถวใน
   * ฐานข้อมูลถูกต้องทุกฟิลด์ จึงไม่มีอะไรใน log บอกเลย
   */
  it('create คืน row ที่มี relation ครบ — ขาเขียนต้องขอ populate ด้วย', async () => {
    const { strapi, calls } = fakeStrapi({ create: menuEntity })
    const row = await createMenuRepo(strapi).create({ name: 'เมนูหลัก', channelId: 'ch0000000000000000000001', imageFileId: 11 })
    expect({ channelId: row.channelId, imageFileId: row.imageFileId, normalizedFileId: row.normalizedFileId })
      .toEqual({ channelId: 'ch0000000000000000000001', imageFileId: 11, normalizedFileId: 900 })
    expect((calls[0]!.params as { populate: string[] }).populate.sort())
      .toEqual(['channel', 'image', 'normalizedImage'])
  })

  it('update คืน row ที่มี relation ครบเช่นกัน', async () => {
    const { strapi, calls } = fakeStrapi({ update: menuEntity })
    const row = await createMenuRepo(strapi).update('mn0000000000000000000001', { imageFileId: 11 })
    expect({ channelId: row.channelId, imageFileId: row.imageFileId, normalizedFileId: row.normalizedFileId })
      .toEqual({ channelId: 'ch0000000000000000000001', imageFileId: 11, normalizedFileId: 900 })
    expect(calls[0]!.params).toEqual({
      documentId: 'mn0000000000000000000001',
      populate: ['channel', 'image', 'normalizedImage'],
      data: { image: 11 },
    })
  })

  it('publishedAt ของชั้น service คือคอลัมน์ linePublishedAt', async () => {
    const { strapi, calls } = fakeStrapi({ update: {} })
    await createMenuRepo(strapi).update('mn1', { publishedAt: '2026-08-20T10:00:00.000Z' })
    const data = (calls[0]!.params as { data: Record<string, unknown> }).data
    expect(data['linePublishedAt']).toBe('2026-08-20T10:00:00.000Z')
    expect(data['publishedAt']).toBeUndefined()
  })

  it('normalizedSize ที่เป็น null เขียนลงทั้งสองคอลัมน์เป็น null ไม่ใช่ปล่อยค้าง', async () => {
    const { strapi, calls } = fakeStrapi({ update: {} })
    await createMenuRepo(strapi).update('mn1', { normalizedSize: null, normalizedFileId: null, normalizedMime: null })
    expect((calls[0]!.params as { data: unknown }).data).toEqual({
      normalizedImage: null, normalizedMime: null, normalizedWidth: null, normalizedHeight: null,
    })
  })

  it('ค่าที่ยังไม่มีกลายเป็น null / [] ไม่ใช่ undefined — ชั้น service ประกาศไว้แบบนั้น', async () => {
    const { strapi } = fakeStrapi({
      findOne: {
        documentId: 'mn1', name: 'x', size: 'large', chatBarText: 'x',
        chatBarMode: 'default', selected: false, status: 'draft',
      },
    })
    const row = await createMenuRepo(strapi).findOne('mn1')
    expect(row).toEqual({
      id: 'mn1', name: 'x', channelId: '', size: 'large', chatBarText: 'x',
      chatBarMode: 'default', selected: false, status: 'draft',
      areas: [], areaImages: [], imageFileId: null, normalizedFileId: null,
      normalizedMime: null, normalizedSize: null, aliasId: null,
      lineRichMenuId: null, publishedAt: null, lastError: null, templateKey: null,
      updatedAt: '',
    })
  })
})

describe('audit repo', () => {
  it('เขียน id เป็นสตริงตามที่คอลัมน์ของ v5 เป็น — ไม่มี Number() ที่ไหนเลย', async () => {
    const { strapi, calls } = fakeStrapi({ create: {} })
    await createAuditRepo(strapi).create({
      actorId: '7', action: 'publish', richMenuId: 'mn1', channelId: 'ch1',
      before: null, after: null, result: 'success', errorCode: null,
    })
    expect((calls[0]!.params as { data: unknown }).data).toEqual({
      actorId: 7, action: 'publish', richMenuId: 'mn1', channelId: 'ch1',
      before: null, after: null, result: 'success', errorCode: null,
    })
  })

  // `Number(null)` คือ 0 ซึ่งจะกลายเป็น "actor คนที่ id 0" — คนที่ไม่มีอยู่จริงแต่ดูเหมือนมี
  it('actorId ที่เป็น null อยู่รอดเป็น null ไม่กลายเป็น 0', async () => {
    const { strapi, calls } = fakeStrapi({ create: {} })
    await createAuditRepo(strapi).create({
      actorId: null, action: 'set-default', richMenuId: null, channelId: 'ch1',
      before: null, after: null, result: 'success', errorCode: null,
    })
    const data = (calls[0]!.params as { data: Record<string, unknown> }).data
    expect(data['actorId']).toBeNull()
    expect(data['richMenuId']).toBeNull()
  })

  it('อ่านกลับมา actorId เป็นสตริง ส่วน documentId ของเมนู/แชนแนลไม่ถูกแปลงอะไรเลย', async () => {
    const { strapi } = fakeStrapi({
      findOne: {
        documentId: 'au0000000000000000000001', id: 3, actorId: 7, action: 'publish',
        richMenuId: 'mn0000000000000000000001', channelId: 'ch0000000000000000000001',
        before: null, after: { status: 'published' }, result: 'success', errorCode: null,
      },
    })
    expect(await createAuditRepo(strapi).findOne('au0000000000000000000001')).toEqual({
      id: 'au0000000000000000000001', actorId: '7', action: 'publish',
      richMenuId: 'mn0000000000000000000001', channelId: 'ch0000000000000000000001',
      before: null, after: { status: 'published' }, result: 'success', errorCode: null,
    })
  })
})

describe('schedule repo', () => {
  it('กรองด้วย richMenuId แปลงเป็นเงื่อนไขบน documentId ของ relation', async () => {
    const { strapi, calls } = fakeStrapi()
    await createScheduleRepo(strapi).findMany({ filters: { richMenuId: 'mn1', state: 'pending' } })
    expect((calls[0]!.params as { filters: unknown }).filters).toEqual({
      state: 'pending',
      richMenu: { documentId: 'mn1' },
    })
  })

  it('เขียน relation ของ richMenu ด้วย set ของ documentId และขอ populate มาพร้อมกัน', async () => {
    const { strapi, calls } = fakeStrapi({ create: {} })
    await createScheduleRepo(strapi).create({
      richMenuId: 'mn0000000000000000000001', runAt: '2026-09-01T00:00:00.000Z',
      op: 'set-default', state: 'pending',
    })
    expect(calls[0]!.params).toEqual({
      populate: ['richMenu'],
      data: {
        richMenu: { set: ['mn0000000000000000000001'] },
        runAt: '2026-09-01T00:00:00.000Z',
        op: 'set-default',
        state: 'pending',
      },
    })
  })
})

/**
 * ของปลอมด้านบนตอบค่าคงที่ จึงพิสูจน์ได้แค่ "ขาออกแปลงถูก" หรือ "ขาเข้าแปลงถูก" ทีละข้าง
 * ส่วนบั๊กที่แพงที่สุดของชั้นนี้คือฟิลด์ที่แปลงไปทางเดียวแล้วไม่แปลงกลับ ซึ่งโผล่ตอน save ครั้งที่สอง
 * เท่านั้น — ต้องมี store ที่จำสถานะจริงถึงจะจับได้
 *
 * เก็บ relation เป็น documentId ดิบ ๆ เหมือนคอลัมน์ FK จริงในตาราง แล้วห่อเป็น
 * `{ documentId, id }` (relation) หรือ `{ id }` (media) **เฉพาะตอนที่ถูกขอด้วย populate**
 * ตามกติกาเดียวกับ applyPopulate ข้างบน
 */
function statefulStrapi(options: { prefix: string; relations?: readonly string[]; media?: readonly string[] }) {
  const relations = options.relations ?? []
  const media = options.media ?? []
  let auto = 0
  const rows = new Map<string, Record<string, unknown>>()

  // `{ set: [id] }` คือรูปทรงที่ Document Service รับ — เก็บลง "คอลัมน์" เป็นค่าเดี่ยวเหมือนของจริง
  const columnValue = (value: unknown): unknown => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const set = (value as { set?: unknown }).set
      if (Array.isArray(set)) return set[0] ?? null
    }
    return value
  }

  const store = (data: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      out[key] = relations.includes(key) ? columnValue(value) : value
    }
    return out
  }

  const toEntity = (row: Record<string, unknown>, params?: DocumentParams): Record<string, unknown> => {
    const asked = params?.populate ?? []
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (relations.includes(key)) {
        if (!asked.includes(key)) continue
        // `id: 99` ตั้งใจให้ไม่ตรงกับ documentId เลย — ถ้า toRow หยิบผิดตัว เทสต์จะแดงทันที
        out[key] = value === null ? null : { documentId: value, id: 99 }
        continue
      }
      if (media.includes(key)) {
        if (!asked.includes(key)) continue
        out[key] = value === null ? null : { id: value }
        continue
      }
      out[key] = value
    }
    return out
  }

  const matches = (row: Record<string, unknown>, filters: Record<string, unknown>): boolean =>
    Object.entries(filters).every(([key, value]) => {
      if (value !== null && typeof value === 'object') {
        return row[key] === (value as { documentId?: unknown }).documentId
      }
      return row[key] === value
    })

  const documents = {
    findMany: async (params?: DocumentParams) =>
      [...rows.values()]
        .filter((row) => matches(row, params?.filters ?? {}))
        .map((row) => toEntity(row, params)),
    findOne: async (params: DocumentParams & { documentId: string }) => {
      const row = rows.get(params.documentId)
      return row === undefined ? null : toEntity(row, params)
    },
    create: async (params: DocumentParams & { data: unknown }) => {
      auto += 1
      const documentId = `${options.prefix}${String(auto).padStart(24 - options.prefix.length, '0')}`
      const row = { documentId, id: auto, ...store(params.data as Record<string, unknown>) }
      rows.set(documentId, row)
      return toEntity(row, params)
    },
    update: async (params: DocumentParams & { documentId: string; data: unknown }) => {
      const existing = rows.get(params.documentId)
      if (existing === undefined) throw new Error(`no document ${params.documentId}`)
      const next = { ...existing, ...store(params.data as Record<string, unknown>) }
      rows.set(params.documentId, next)
      return toEntity(next, params)
    },
    delete: async (params: DocumentParams & { documentId: string }) => {
      rows.delete(params.documentId)
      return { documentIds: [params.documentId] }
    },
  }

  return { documents: () => documents } as unknown as StrapiV5
}

describe('round trip ผ่าน store ที่จำสถานะจริง', () => {
  it('เมนู: เขียนแล้วอ่านกลับได้ค่าเดิมทุกฟิลด์ที่ชื่อคอลัมน์ไม่ตรงกับชั้น service', async () => {
    const menus = createMenuRepo(statefulStrapi({
      prefix: 'mn', relations: ['channel'], media: ['image', 'normalizedImage'],
    }))
    const created = await menus.create({
      name: 'เมนูหลัก',
      channelId: 'ch0000000000000000000001',
      size: 'large',
      chatBarText: 'เปิดเมนู',
      chatBarMode: 'custom',
      selected: true,
      areas: [],
      imageFileId: 11,
      areaImages: [],
      status: 'draft',
    })
    expect({ channelId: created.channelId, imageFileId: created.imageFileId })
      .toEqual({ channelId: 'ch0000000000000000000001', imageFileId: 11 })

    const readBack = await menus.findOne(created.id)
    expect(readBack).toEqual(created)
  })

  it('เมนู: publishedAt/normalizedSize ที่เขียนไปต้องอ่านกลับมาได้ — ไม่ใช่แปลงไปทางเดียว', async () => {
    const menus = createMenuRepo(statefulStrapi({
      prefix: 'mn', relations: ['channel'], media: ['image', 'normalizedImage'],
    }))
    const created = await menus.create({ name: 'x', channelId: 'ch1', status: 'draft' })

    const updated = await menus.update(created.id, {
      publishedAt: '2026-08-21T10:00:00.000Z',
      status: 'published',
      normalizedFileId: 900,
      normalizedMime: 'image/jpeg',
      normalizedSize: { width: 1200, height: 810 },
    })
    expect({
      publishedAt: updated.publishedAt,
      normalizedFileId: updated.normalizedFileId,
      normalizedSize: updated.normalizedSize,
    }).toEqual({
      publishedAt: '2026-08-21T10:00:00.000Z',
      normalizedFileId: 900,
      normalizedSize: { width: 1200, height: 810 },
    })
    expect(await menus.findOne(created.id)).toEqual(updated)

    // ลบผลของ normalize ทิ้งแล้วต้องกลับไปเป็น null จริง ๆ ไม่ใช่ค้างค่าเดิมไว้
    const cleared = await menus.update(created.id, {
      normalizedFileId: null, normalizedMime: null, normalizedSize: null,
    })
    expect({ normalizedFileId: cleared.normalizedFileId, normalizedSize: cleared.normalizedSize })
      .toEqual({ normalizedFileId: null, normalizedSize: null })
  })

  it('เมนู: ย้าย channel ด้วย set เขียนทับของเดิม ไม่ใช่สะสมเพิ่ม', async () => {
    const menus = createMenuRepo(statefulStrapi({
      prefix: 'mn', relations: ['channel'], media: ['image', 'normalizedImage'],
    }))
    const created = await menus.create({ name: 'x', channelId: 'ch0000000000000000000001', status: 'draft' })
    const moved = await menus.update(created.id, { channelId: 'ch0000000000000000000002' })
    expect(moved.channelId).toBe('ch0000000000000000000002')
    expect((await menus.findOne(created.id))!.channelId).toBe('ch0000000000000000000002')
  })

  /**
   * §5.7/§10: ช่วงเวลาแสดงผล (startAt/endAt) ในฟอร์มไม่มีคอลัมน์ของตัวเอง — มันคือแถว
   * rich-menu-schedule ที่ op เป็น 'set-default' / 'clear-default' ตัว `writeDisplayPeriod`
   * เป็นของ Task 5 แต่กลไกที่มันพึ่งคือ repo ตัวนี้ทั้งหมด — กรองด้วย richMenuId แล้วอ่าน
   * richMenuId กลับมาได้ตรงเดิม เทสต์สองข้อนี้จึงพิสูจน์กลไกนั้นตรง ๆ
   */
  it('schedule: กรองด้วย richMenuId แล้วได้เฉพาะของเมนูนั้น และอ่าน richMenuId กลับมาได้', async () => {
    const schedules = createScheduleRepo(statefulStrapi({ prefix: 'sc', relations: ['richMenu'] }))
    await schedules.create({ richMenuId: 'mn1', runAt: '2026-09-01T00:00:00.000Z', op: 'set-default', state: 'pending' })
    await schedules.create({ richMenuId: 'mn1', runAt: '2026-09-30T00:00:00.000Z', op: 'clear-default', state: 'pending' })
    await schedules.create({ richMenuId: 'mn2', runAt: '2026-10-01T00:00:00.000Z', op: 'set-default', state: 'pending' })

    const mine = await schedules.findMany({ filters: { richMenuId: 'mn1', state: 'pending' } })
    expect(mine.map((row) => [row.richMenuId, row.op, row.runAt])).toEqual([
      ['mn1', 'set-default', '2026-09-01T00:00:00.000Z'],
      ['mn1', 'clear-default', '2026-09-30T00:00:00.000Z'],
    ])
  })

  it('schedule: ลบแถวของเมนูหนึ่งไม่แตะของอีกเมนู', async () => {
    const schedules = createScheduleRepo(statefulStrapi({ prefix: 'sc', relations: ['richMenu'] }))
    const mine = await schedules.create({ richMenuId: 'mn1', runAt: '2026-09-01T00:00:00.000Z', op: 'set-default', state: 'pending' })
    await schedules.create({ richMenuId: 'mn2', runAt: '2026-10-01T00:00:00.000Z', op: 'set-default', state: 'pending' })

    await schedules.delete(mine.id)
    expect(await schedules.findMany({ filters: { richMenuId: 'mn1' } })).toEqual([])
    expect((await schedules.findMany({ filters: { richMenuId: 'mn2' } })).map((row) => row.richMenuId)).toEqual(['mn2'])
  })
})

describe('ImageStore', () => {
  /**
   * นี่คือความต่างข้อที่สองที่แท้จริงระหว่าง v4 กับ v5 และเป็นข้อที่ Plan 03 บันทึกส่งมาไว้แล้ว
   *
   * upload service ของ v4 อ่าน `{ path, name, type, size }` (formidable v1/v2)
   * ส่วนของ v5 อ่าน `{ filepath, originalFilename, mimetype, size }` (formidable v3) —
   * ยืนยันจาก `enhanceAndValidateFile` ใน @strapi/upload@5.52.1 ซึ่งอ่าน `file.originalFilename`,
   * `file.mimetype`, `file.size` และ `file.filepath` ตรง ๆ
   *
   * ถ้าส่งรูปทรงของ v4 ไป upload จะ "สำเร็จ" แต่ได้ไฟล์ชื่อ `unamed` ที่ไม่มีนามสกุลและ
   * mime เป็น `application/octet-stream` ซึ่งทำให้ LINE ปฏิเสธรูปตอน publish โดยที่ log
   * ของ Strapi ไม่มีอะไรผิดปกติเลย
   */
  it('write ส่งไฟล์ตามรูปทรงของ formidable v3 และส่งเป็นอาเรย์', async () => {
    const uploads: { data: unknown; files: Record<string, unknown>[] }[] = []
    const upload = vi.fn(async (args: { data: unknown; files: Record<string, unknown>[] }) => {
      uploads.push(args)
      return [{ id: 42 }]
    })
    const strapi = {
      plugin: () => ({ service: () => ({ upload }) }),
    } as unknown as StrapiV5

    const result = await createImageStore(strapi).write({
      buffer: Buffer.from('jpeg-bytes'), mime: 'image/jpeg', filename: 'menu.jpg',
    })

    expect(result).toEqual({ id: 42 })
    const arg = uploads[0]!
    expect(arg.data).toEqual({ fileInfo: { name: 'menu.jpg', alternativeText: null, caption: null } })
    expect(arg.files).toHaveLength(1)

    // เทียบทั้งอ็อบเจกต์ ไม่ใช่ toMatchObject — คีย์ของ v4 (`path`/`name`/`type`) ที่หลุดติดมา
    // ต้องทำให้เทสต์แดง ไม่ใช่ผ่านเงียบ ๆ
    const { filepath, ...rest } = arg.files[0]!
    expect(rest).toEqual({
      originalFilename: 'menu.jpg',
      mimetype: 'image/jpeg',
      size: Buffer.from('jpeg-bytes').length,
    })
    expect(typeof filepath).toBe('string')
    expect(String(filepath).endsWith('menu.jpg')).toBe(true)
  })

  it('ลบโฟลเดอร์ชั่วคราวทิ้งแม้ upload จะโยน', async () => {
    const paths: string[] = []
    const upload = vi.fn(async (arg: { files: { filepath: string }[] }) => {
      paths.push(arg.files[0]!.filepath)
      throw new Error('provider down')
    })
    const strapi = { plugin: () => ({ service: () => ({ upload }) }) } as unknown as StrapiV5

    await expect(createImageStore(strapi).write({
      buffer: Buffer.from('x'), mime: 'image/png', filename: 'a.png',
    })).rejects.toThrow('provider down')

    expect(existsSync(paths[0]!)).toBe(false)
  })

  it('upload ที่ไม่คืนไฟล์เลยต้องโยน ไม่ใช่คืน id ที่เป็น undefined', async () => {
    const upload = vi.fn(async () => [])
    const strapi = { plugin: () => ({ service: () => ({ upload }) }) } as unknown as StrapiV5
    await expect(createImageStore(strapi).write({
      buffer: Buffer.from('x'), mime: 'image/png', filename: 'a.png',
    })).rejects.toThrow('upload returned no file')
  })

  it('read อ่านผ่าน upload service ไม่ใช่ documents() — ไฟล์ไม่ใช่ document', async () => {
    const findOne = vi.fn(async () => ({ url: 'https://cdn.example.com/menu.jpg' }))
    const strapi = { plugin: () => ({ service: () => ({ findOne }) }) } as unknown as StrapiV5

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    )
    const buffer = await createImageStore(strapi).read(9)
    expect(findOne).toHaveBeenCalledWith(9)
    expect([...buffer]).toEqual([1, 2, 3])
    fetchSpy.mockRestore()
  })

  it('read ของ provider แบบ local อ่านจากดิสก์ ไม่ใช่ fetch url สัมพัทธ์', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'line-rich-menu-test-'))
    try {
      await writeFile(join(directory, 'menu.jpg'), Buffer.from([7, 8, 9]))
      const strapi = {
        plugin: () => ({ service: () => ({ findOne: async () => ({ url: '/menu.jpg' }) }) }),
        dirs: { static: { public: directory } },
      } as unknown as StrapiV5

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      expect([...await createImageStore(strapi).read(9)]).toEqual([7, 8, 9])
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('ไฟล์ที่ไม่มี url ต้องโยน ไม่ใช่คืนบัฟเฟอร์ว่าง', async () => {
    const strapi = {
      plugin: () => ({ service: () => ({ findOne: async () => null }) }),
    } as unknown as StrapiV5
    await expect(createImageStore(strapi).read(9)).rejects.toThrow('upload file 9 has no url')
  })

  it('provider ที่ตอบไม่ 2xx ต้องโยนพร้อมสถานะ ไม่ใช่ปล่อยบัฟเฟอร์เสียไปให้ sharp', async () => {
    const strapi = {
      plugin: () => ({ service: () => ({ findOne: async () => ({ url: 'https://cdn.example.com/menu.jpg' }) }) }),
    } as unknown as StrapiV5
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    await expect(createImageStore(strapi).read(9)).rejects.toThrow('failed to read upload file 9: 503')
    fetchSpy.mockRestore()
  })
})
