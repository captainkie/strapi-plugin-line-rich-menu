import { describe, expect, it, vi } from 'vitest'
import { controllers } from '../server/src/controllers/index.js'
import { UID } from '../server/src/content-types/index.js'
import { toHttpError } from '../server/src/http-error.js'
import { admin } from '../server/src/routes/admin.js'
import { PERMISSION } from '../server/src/permissions.js'
import type { AdminContext } from '../server/src/http-error.js'
import type { StrapiV5 } from '../server/src/strapi.js'

function makeCtx(over: Partial<AdminContext> = {}): AdminContext {
  return {
    request: { body: {} },
    query: {},
    params: {},
    state: { user: { id: 7 } },
    status: 200,
    body: undefined,
    set: vi.fn(),
    ...over,
  } as AdminContext
}

/** route table ไม่ต้องการ strapi จริง — controller factory ถูกเรียกเพื่อดูว่ามีเมธอดอยู่เท่านั้น */
const strapi = {} as StrapiV5

// Task 20 item 3 (strapi-v5 H1) — v4 มี `deepContains` + สองแอสเสิร์ชันนี้อยู่แล้วใน
// tests/controllers.test.ts (บรรทัด 34, 118, 129-130) แต่ v5 ไม่มีเลยสักบรรทัด: ไม่มีเทสต์ไหนใน
// v5 ตรวจ response body ของ channels เลยแม้แต่ตัวเดียว ทั้งที่ `toRow` ของ `createChannelRepo`
// (repo.ts) อ่าน channelAccessToken/channelSecret ทุกครั้งที่อ่านแถว — สิ่งเดียวที่กันไม่ให้มันหลุด
// ออกไปคือ `toChannelRecord` ใน packages/core ซึ่งเป็นฟังก์ชันร่วมกับ v4 แปลว่า regression ใน
// ฟังก์ชันร่วมนี้ตัวเดียวกัน มองไม่เห็นจาก v5 เลย ต่อให้ v4 แดงก็ตาม (พิสูจน์จริงในคอมมิตนี้ — ดูข้อความ
// commit สำหรับผล red/green ตอนปลูก leak ทดสอบใน toChannelRecord)
const TOKEN = 'aBcDeFgH1234567890-channel-access-token-WXYZ'

function deepContains(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle)
  if (Array.isArray(value)) return value.some((v) => deepContains(v, needle))
  if (value !== null && typeof value === 'object') return Object.values(value).some((v) => deepContains(v, needle))
  return false
}

describe('route ทุกเส้น (สเปก §11.4)', () => {
  it('เป็น type: admin ทั้งชุด ไม่มีข้อยกเว้น', () => {
    expect(admin.type).toBe('admin')
  })

  it('ทุกเส้นมี policy admin::hasPermissions พร้อม action ที่รู้จัก', () => {
    const known = new Set(Object.values(PERMISSION))
    for (const route of admin.routes) {
      const policies = route.config.policies as { name: string; config: { actions: string[] } }[]
      expect(policies, route.path).toHaveLength(1)
      expect(policies[0]!.name, route.path).toBe('admin::hasPermissions')
      expect(policies[0]!.config.actions, route.path).toHaveLength(1)
      // `as never` เพราะ `policies` ถูก cast เป็น `{ actions: string[] }[]` ข้างบน แต่ `known` เป็น
      // `Set<typeof PERMISSION[keyof typeof PERMISSION]>` — ปัญหาชนิดข้อมูลล้วน ๆ ไม่ใช่ของจริง
      // (rbac.test.ts ของ v4 เจอแบบเดียวกันแล้วแก้ด้วยวิธีเดียวกัน)
      expect(known.has(policies[0]!.config.actions[0]! as never), route.path).toBe(true)
    }
  })

  it('handler ทุกตัวที่ route อ้างถึงมีอยู่จริงใน controllers', () => {
    for (const route of admin.routes) {
      const [name, method] = route.handler.split('.')
      const factory = (controllers as Record<string, (deps: { strapi: StrapiV5 }) => Record<string, unknown>>)[name!]
      expect(factory, route.handler).toBeTypeOf('function')
      expect(factory!({ strapi })[method!], route.handler).toBeTypeOf('function')
    }
  })

  // path ที่ ui ยิงจริงถูกประกาศไว้ที่ packages/ui/src/api.ts — สองฝั่งต้องตรงกันเป๊ะ
  it('ครอบคลุมทุก path ที่ ENDPOINTS ประกาศ (เทียบแบบไม่สน :id)', () => {
    const declared = new Set(admin.routes.map((route) => `${route.method} ${route.path}`))
    for (const expected of [
      'GET /channels', 'POST /channels', 'PUT /channels/:id', 'POST /channels/:id/test',
      'GET /menus', 'GET /menus/:id', 'POST /menus', 'PUT /menus/:id', 'DELETE /menus/:id',
      'POST /menus/:id/publish', 'POST /menus/:id/default', 'DELETE /menus/:id/default',
      'POST /schedules/tick',
    ]) {
      expect(declared.has(expected), expected).toBe(true)
    }
  })
})

/**
 * strapi ปลอมที่มีเฉพาะสิ่งที่ `getServices` เดินผ่านจริง — controller ทุกตัวเรียก
 * `getServices(strapi)` เป็นบรรทัดแรกก่อนแตะ zod ด้วยซ้ำ การส่ง `{}` เข้าไปจึงได้ 500 จาก
 * `resolveEncryptionKey` ทุกครั้ง ซึ่งกลบสิ่งที่เทสต์ตั้งใจจะพิสูจน์ทั้งหมด
 *
 * `db.transaction` (Task 20 item 5, strapi-v5 M1) ปลอม rollback ด้วยการ snapshot ทุกตารางก่อนเรียก
 * `fn` แล้วคืนกลับถ้า `fn` throw — ไม่ใช่ knex transaction จริง (ของจริงพิสูจน์แล้วแยกต่างหากว่า
 * commit/rollback ถูกต้องจาก @strapi/database เอง ดูคอมเมนต์ที่ container.ts) แต่จำลอง**สัญญา**ที่
 * `saveMenu` พึ่งพา (all-or-nothing) ได้พอให้พิสูจน์ว่าโค้ดของเราเรียกมันถูกจุดจริง — ถ้า `saveMenu`
 * ลืมห่อ transaction กลับ เทสต์ atomicity ด้านล่างจะเห็นแถวกำพร้าเหลือค้างและแดงทันที
 *
 * `plugin('upload')` เพิ่ม `findOne` ที่คืน `null` เป็นค่าเริ่มต้น — จำลองไฟล์ที่ถูกลบจาก Media
 * Library (repro ตรงของ item 5/6) เทสต์อื่นในไฟล์นี้ไม่แตะรูปเลยจึงไม่ได้รับผลกระทบ
 */
function fakeStrapi(rows: Record<string, Record<string, unknown>[]> = {}) {
  const table = (uid: string) => (rows[uid] ??= [])
  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {
      get: <T>(path: string, fallback?: T) =>
        (path === 'server.app.keys' ? (['app-key-one-that-is-long-enough'] as unknown as T) : (fallback as T)),
    },
    dirs: { static: { public: '/tmp' } },
    plugin: (name: string) =>
      (name === 'upload'
        ? { service: () => ({ findOne: async () => null, upload: async () => [{ id: 900 }] }) }
        : { service: () => ({}), contentType: () => ({}) }),
    db: {
      connection: () => ({ where: () => ({}) }),
      transaction: async <T>(fn: () => Promise<T>): Promise<T> => {
        const snapshot = Object.fromEntries(
          Object.entries(rows).map(([uid, entries]) => [uid, entries.map((row) => ({ ...row }))]),
        )
        try {
          return await fn()
        } catch (error) {
          for (const uid of Object.keys(rows)) delete rows[uid]
          Object.assign(rows, snapshot)
          throw error
        }
      },
    },
    cron: { add: vi.fn() },
    admin: { services: { permission: { actionProvider: { registerMany: async () => {} } } } },
    documents: (uid: string) => ({
      findMany: async () => [...table(uid)],
      findOne: async ({ documentId }: { documentId: string }) =>
        table(uid).find((row) => row['documentId'] === documentId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { documentId: `doc${table(uid).length + 1}`, ...data }
        table(uid).push(row)
        return row
      },
      update: async ({ documentId, data }: { documentId: string; data: Record<string, unknown> }) => {
        const row = table(uid).find((candidate) => candidate['documentId'] === documentId)!
        Object.assign(row, data)
        return row
      },
      delete: async ({ documentId }: { documentId: string }) => {
        rows[uid] = table(uid).filter((row) => row['documentId'] !== documentId)
        return { documentId }
      },
    }),
  } as unknown as StrapiV5
}

describe('channels controller', () => {
  it('สร้าง channel แล้วคืน DTO ที่ไม่มี token ไม่ว่าจะซอกไหน', async () => {
    const context = makeCtx({
      request: { body: { name: 'ร้าน', channelId: 'ch0000000000000000000001', channelAccessToken: TOKEN } },
    })

    await controllers.channels({ strapi: fakeStrapi() }).create(context)

    expect(context.body).toMatchObject({ name: 'ร้าน', accessTokenPreview: '••••••••WXYZ' })
    expect(deepContains(context.body, TOKEN)).toBe(false)
  })

  it('list ไม่มี token และไม่มี ciphertext', async () => {
    const strapi = fakeStrapi()
    await controllers.channels({ strapi }).create(makeCtx({
      request: { body: { name: 'ร้าน', channelId: 'ch0000000000000000000001', channelAccessToken: TOKEN } },
    }))

    const context = makeCtx()
    await controllers.channels({ strapi }).find(context)

    expect(deepContains(context.body, TOKEN)).toBe(false)
    // 'v1.' คือ prefix ของ envelope ciphertext (ดู packages/core/src/crypto.ts) — หลุดออกมาก็แปลว่า
    // ciphertext ทั้งก้อนโดนส่งออกไปดิบ ๆ ไม่ใช่แค่ plaintext ของ token เอง
    expect(deepContains(context.body, 'v1.')).toBe(false)
  })
})

describe('guard แปลง error เป็น response ที่มี code เสมอ', () => {
  it('ZodError กลายเป็น 400 validation_failed พร้อม issues ไม่ใช่ 500 เปล่า ๆ', async () => {
    const ctx = makeCtx({ params: { id: 'doc1' }, request: { body: { nope: true } } })
    await controllers.menus({ strapi: fakeStrapi() }).update(ctx)
    expect(ctx.status).toBe(400)
    const body = ctx.body as { error: { code: string; issues: { path: string }[] } }
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues.length).toBeGreaterThan(0)
  })

  it('query ที่มีฟิลด์แปลกปลอมก็เป็น 400 ไม่ใช่ถูกเมิน (สเปก §11.3 .strict())', async () => {
    const ctx = makeCtx({ query: { nope: '1' } })
    await controllers.menus({ strapi: fakeStrapi() }).find(ctx)
    expect(ctx.status).toBe(400)
  })

  // สเปก §11.7 — UI แปล `code` เป็นข้อความเอง ชั้นนี้จึงห้ามส่ง message, stack หรืออะไรที่
  // สะท้อนสิ่งที่เซิร์ฟเวอร์รู้กลับไป
  it('body ที่ตอบกลับมีแต่ code กับ issues ไม่มี stack ไม่มีข้อความดิบ', async () => {
    const ctx = makeCtx({ params: { id: 'doc1' }, request: { body: { nope: true } } })
    await controllers.menus({ strapi: fakeStrapi() }).update(ctx)
    const serialised = JSON.stringify(ctx.body)
    expect(serialised).not.toContain('stack')
    expect(serialised).not.toContain('at Object')
  })

  it('id ที่ไม่มีอยู่ตอบ 404 menu_not_found ไม่ใช่ 500', async () => {
    const ctx = makeCtx({ params: { id: 'doesnotexist' } })
    await controllers.menus({ strapi: fakeStrapi() }).findOne(ctx)
    expect(ctx.status).toBe(404)
    expect((ctx.body as { error: { code: string } }).error.code).toBe('menu_not_found')
  })

  /**
   * Task 20 item 4 (strapi-v5 M2) repro ตรง ๆ จากรีวิว — `POST /menus` ด้วย `channelId` ที่ไม่มี
   * อยู่จริงเดิมตอบ 500 `internal_error` เพราะ `documents().create` โยน `@strapi/utils` ValidationError
   * ดิบที่ไม่มี `code` (ผ่าน relation write ของ Strapi 5 เอง) `toHttpError` จับไม่ได้ ผู้เรียกแยกไม่ออก
   * ว่าตัวเองผิดหรือเซิร์ฟเวอร์พัง ตอนนี้ `saveMenu` เช็ค channel ก่อนเขียน จึงได้ 404 channel_not_found
   * ที่ตรงความหมายแทน — ใช้ body ที่ผ่าน `menuInputSchema` ได้จริง (`areas: []` ผ่านได้ตั้งแต่ item 1)
   * เพื่อพิสูจน์ว่า field อื่นทั้งหมดถูกต้อง มีแค่ channelId เท่านั้นที่เป็นปัญหา
   */
  it('POST /menus ด้วย channelId ที่ไม่มีอยู่จริง ตอบ 404 channel_not_found ไม่ใช่ 500 internal_error', async () => {
    const ctx = makeCtx({
      request: {
        body: {
          name: 'เมนูหลัก', channelId: 'ch-does-not-exist', size: 'large',
          chatBarText: 'เมนู', chatBarMode: 'default', selected: true, templateKey: null,
          areas: [], imageFileId: null, areaImages: [], aliasId: null, startAt: null, endAt: null,
        },
      },
    })

    await controllers.menus({ strapi: fakeStrapi() }).create(ctx)

    expect(ctx.status).toBe(404)
    expect((ctx.body as { error: { code: string } }).error.code).toBe('channel_not_found')
  })
})

/**
 * Task 20 item 5 (strapi-v5 M1) — repro ตรงจากรีวิว: ไฟล์รูปที่เมนูอ้างถึงถูกลบไปจาก Media Library
 * แล้ว (พารามิเตอร์ `fileId: 42` ในเทสต์นี้คือไฟล์ที่ "หายไปแล้ว" — `plugin('upload')` ปลอมคืน
 * `findOne` เป็น `null` เสมอ) `saveMenu` ต้องล้มทั้งก้อน ไม่ใช่ commit แถวร่างแล้วค่อยพังที่ขั้นถัดไป
 * — พิสูจน์สองข้อ: (1) ไม่มีแถวกำพร้าเหลือค้างในตารางหลังบันทึกล้ม (2) บันทึกใหม่ด้วย alias เดิม
 * (ที่ไม่เคยสำเร็จจริงสักครั้ง) ต้องไม่โดนปฏิเสธด้วย `alias_id_taken` — ไม่ตรวจ status code ที่ได้ตรงนี้
 * เพราะการแปลง error ของ `store.read` ให้มี code ที่ถูกต้องเป็นคนละเรื่อง (item 6, strapi-v5 M3)
 */
describe('menus controller > create — atomicity ของ saveMenu (Task 20 item 5, strapi-v5 M1)', () => {
  async function seedChannel(strapi: StrapiV5) {
    const ctx = makeCtx({
      request: { body: { name: 'ร้าน', channelId: 'ch0000000000000000000001', channelAccessToken: 'a-token-long-enough' } },
    })
    await controllers.channels({ strapi }).create(ctx)
    return (ctx.body as { id: string }).id
  }

  function menuBody(channelId: string, aliasId: string) {
    return {
      name: 'เมนูหลัก', channelId, size: 'large' as const, chatBarText: '', chatBarMode: 'default' as const,
      selected: true, templateKey: null,
      areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
      imageFileId: null, areaImages: [{ index: 0, fileId: 42 }],
      aliasId, startAt: null, endAt: null,
    }
  }

  it('ไม่มีแถวร่างกำพร้าเหลือค้างในตารางหลังบันทึกล้ม — และลองใหม่ด้วย alias เดิมได้โดยไม่โดน alias_id_taken', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeStrapi(rows)
    const channelId = await seedChannel(strapi)

    const first = makeCtx({ request: { body: menuBody(channelId, 'tab-a') } })
    await controllers.menus({ strapi }).create(first)
    // ก่อนแก้ item 6 นี่คือ 500 (bare Error จาก store.read ไม่มี code) — เทสต์นี้สนใจแค่ atomicity
    // ไม่สนใจว่า status ที่ได้คือเลขอะไร แค่ต้องไม่ใช่ 2xx (บันทึกไม่สำเร็จจริง)
    expect(first.status).toBeGreaterThanOrEqual(400)

    expect(rows[UID.menu] ?? []).toHaveLength(0)

    const second = makeCtx({ request: { body: menuBody(channelId, 'tab-a') } })
    await controllers.menus({ strapi }).create(second)
    expect(second.status).toBeGreaterThanOrEqual(400)
    expect((second.body as { error: { code: string } }).error.code).not.toBe('alias_id_taken')

    // ยืนยันซ้ำว่ายังไม่มีแถวค้างแม้พยายามสองรอบ — ไม่ใช่แค่รอดรอบเดียว
    expect(rows[UID.menu] ?? []).toHaveLength(0)
  })
})

/**
 * Task 20 item 6 (strapi-v5 M3) — repro เดียวกับ item 5 (ไฟล์ที่เมนูอ้างถึงถูกลบไปจาก Media
 * Library — `plugin('upload')` ปลอมคืน `findOne` เป็น `null` เสมอ) แต่พิสูจน์คนละเรื่อง: item 5
 * ตรวจว่าไม่มีแถวกำพร้าเหลือค้าง ส่วนนี้ตรวจว่า status/code ที่ผู้เรียกเห็นถูกต้อง — ก่อนแก้
 * `ImageStore.read` โยน `Error` เปล่า ไม่มี `code` เลย จึงตกไปที่ 500 `internal_error` เสมอ
 * ทั้งที่เป็นสถานการณ์ปกติที่กู้คืนได้ (ลบไฟล์แล้วลองอัปโหลดใหม่) ไม่ใช่เซิร์ฟเวอร์พัง
 */
describe('menus controller > create — ไฟล์รูปที่ลบไปแล้วตอบ 409 ไม่ใช่ 500 (Task 20 item 6, strapi-v5 M3)', () => {
  it('imageFileId ที่ upload.findOne คืน null ตอบ 409 menu_not_ready ไม่ใช่ 500 internal_error', async () => {
    const strapi = fakeStrapi()
    const channelCtx = makeCtx({
      request: { body: { name: 'ร้าน', channelId: 'ch0000000000000000000001', channelAccessToken: 'a-token-long-enough' } },
    })
    await controllers.channels({ strapi }).create(channelCtx)
    const channelId = (channelCtx.body as { id: string }).id

    const ctx = makeCtx({
      request: {
        body: {
          name: 'เมนูหลัก', channelId, size: 'large', chatBarText: '', chatBarMode: 'default',
          selected: true, templateKey: null,
          areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
          imageFileId: null, areaImages: [{ index: 0, fileId: 42 }],
          aliasId: null, startAt: null, endAt: null,
        },
      },
    })

    await controllers.menus({ strapi }).create(ctx)

    expect(ctx.status).toBe(409)
    expect((ctx.body as { error: { code: string } }).error.code).toBe('menu_not_ready')
  })
})

/**
 * Task 20 item 10 (strapi-v5 L6) — `guard()` เดิมไม่ log อะไรเลยตอนจับ error ทั้งที่ผสมกับ M2/M3
 * (item 4, 6) แล้ว 500 `internal_error` ทุกตัวก่อนหน้านั้นไม่เหลือร่องรอยให้ operator เลย ทดสอบทั้ง
 * สองทาง: error ที่ไม่มี code จริง (บั๊กภายใน) ต้องถูก log และ error ที่มี code รู้จักแล้ว (ผู้ใช้ทำ
 * ผิดเอง) ต้องไม่ถูก log — ไม่งั้น log จะเต็มไปด้วย "ปัญหา" ที่ไม่ใช่ปัญหาจริง
 */
describe('guard — 500 ถูก log ผ่าน scrubbed logger เสมอ ไม่ใช่กลืนเงียบ ๆ (Task 20 item 10, strapi-v5 L6)', () => {
  it('error ที่ไม่มี code (บั๊กภายในจริง) ตอบ 500 และถูก log ผ่าน strapi.log.error', async () => {
    const strapi = fakeStrapi()
    const boom = new TypeError('cannot read properties of undefined')
    // จำลองบั๊กภายในจริง — documents() เองพังก่อนจะได้เรียก .findOne ด้วยซ้ำ
    ;(strapi as unknown as { documents: () => never }).documents = () => { throw boom }

    const ctx = makeCtx({ params: { id: 'doc1' } })
    await controllers.menus({ strapi }).findOne(ctx)

    expect(ctx.status).toBe(500)
    const logError = strapi.log.error as unknown as ReturnType<typeof vi.fn>
    expect(logError).toHaveBeenCalled()
    expect(logError.mock.calls[0]?.[0]).toContain('unhandled error')
  })

  it('error ที่มี code รู้จักแล้ว (เช่น 404 menu_not_found) ไม่ถูก log — ไม่ใช่ความผิดปกติของเซิร์ฟเวอร์', async () => {
    const strapi = fakeStrapi()
    const ctx = makeCtx({ params: { id: 'doesnotexist' } })
    await controllers.menus({ strapi }).findOne(ctx)

    expect(ctx.status).toBe(404)
    expect(strapi.log.error as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })
})

describe('toHttpError — error จาก @strapi/utils ที่ไม่มี code (Task 20 item 4, strapi-v5 M2)', () => {
  it('แม็ป error ตาม name ของ @strapi/utils เป็นสถานะ 4xx ที่ถูกต้อง แทนที่จะเป็น 500 internal_error เสมอ', () => {
    const cases: [{ name: string }, number, string][] = [
      [{ name: 'ValidationError' }, 400, 'validation_failed'],
      [{ name: 'YupValidationError' }, 400, 'validation_failed'],
      [{ name: 'PaginationError' }, 400, 'validation_failed'],
      [{ name: 'NotFoundError' }, 404, 'not_found'],
      [{ name: 'ForbiddenError' }, 403, 'forbidden'],
      [{ name: 'PolicyError' }, 403, 'forbidden'],
      [{ name: 'UnauthorizedError' }, 401, 'unauthorized'],
      [{ name: 'RateLimitError' }, 429, 'rate_limited'],
      [{ name: 'PayloadTooLargeError' }, 413, 'payload_too_large'],
    ]
    for (const [shape, status, code] of cases) {
      const ctx = makeCtx()
      // ข้อความนี้ต้องไม่หลุดออกไป (สเปก §11.7) — error ของ @strapi/utils ไม่ได้ผ่านการตรวจว่า
      // message/details ปลอดภัยจะส่งออกเหมือน ValidationError.issues ของ core
      const error = Object.assign(new Error('upstream message that must never reach the client'), shape)
      toHttpError(ctx, error)
      expect(ctx.status, shape.name).toBe(status)
      expect(ctx.body, shape.name).toEqual({ error: { code } })
      expect(JSON.stringify(ctx.body)).not.toContain('upstream message')
    }
  })

  // ด่านสำรองต้องไม่กลืน error ภายในจริงของเราเอง — TypeError ไม่ได้อยู่ใน STRAPI_UTILS_STATUS_BY_NAME
  // เลยสักตัว ต้องยังเป็น 500 internal_error เหมือนก่อนแก้ ไม่งั้นบั๊กจริงจะถูกรายงานเป็น "ผู้ใช้ผิด"
  it('error ที่ name ไม่รู้จัก (เช่น TypeError ของบั๊กภายในจริง) ยังคงเป็น 500 internal_error เหมือนเดิม', () => {
    const ctx = makeCtx()
    toHttpError(ctx, new TypeError('cannot read properties of undefined'))
    expect(ctx.status).toBe(500)
    expect(ctx.body).toEqual({ error: { code: 'internal_error' } })
  })
})

/**
 * หน้ารายการแบบ LINE OA Manager อ่านหกฟิลด์นี้จาก `GET /menus` — ถ้าปลายทางคืนแค่ชื่อกับสถานะ
 * เหมือนเดิม คอลัมน์ Image / Action / Display period จะว่างทั้งคอลัมน์โดยที่ไม่มีอะไรพัง
 * (React ไม่บ่นกับ `undefined`) และหน้าจอจะ "ทำงานอยู่" ทั้งที่ไม่มีข้อมูลให้ดูเลย
 *
 * ทางเลือกเดียวที่หลีกเลี่ยงฟิลด์พวกนี้ได้คือให้หน้ารายการยิง `GET /menus/:id` ทีละแถว ซึ่งเป็น
 * N+1 ที่รายการยี่สิบแถวกลายเป็นยี่สิบเอ็ดคำขอ — เป็นเหตุผลที่ข้อมูลต้องมากับรายการตั้งแต่แรก
 */
describe('menus controller > find — DTO ที่หน้ารายการต้องใช้', () => {
  const menuRow = {
    documentId: 'm1',
    name: 'เมนูหลัก',
    size: 'large',
    status: 'draft',
    channel: { documentId: 'c1' },
    areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'message', text: 'สวัสดี' } }],
    image: { id: 42 },
    updatedAt: '2026-08-22T00:00:00.000Z',
  }

  /** fake ตัวกลางคืน url ให้ทุกไฟล์ — ตัวจริงถาม upload plugin ตัวเดียวกันนี้ */
  const withUpload = (strapi: ReturnType<typeof fakeStrapi>, url: string | null) => ({
    ...strapi,
    plugin: (name: string) => (name === 'upload'
      ? { service: () => ({ findOne: async () => (url === null ? null : { url }), upload: async () => [{ id: 900 }] }) }
      : { service: () => ({}), contentType: () => ({}) }),
  }) as unknown as StrapiV5

  it('คืน size, areas, imageUrl และช่วงเวลาแสดงผลมาพร้อมกับแถว', async () => {
    const strapi = withUpload(fakeStrapi({
      [UID.menu]: [{ ...menuRow }],
      [UID.schedule]: [
        { documentId: 's1', richMenu: { documentId: 'm1' }, runAt: '2026-08-22T00:00:00.000Z', op: 'set-default', state: 'pending' },
        { documentId: 's2', richMenu: { documentId: 'm1' }, runAt: '2026-08-31T23:59:00.000Z', op: 'clear-default', state: 'pending' },
      ],
    }), '/uploads/main.png')

    const ctx = makeCtx()
    await controllers.menus({ strapi }).find(ctx)

    const [row] = ctx.body as Record<string, unknown>[]
    expect(row).toMatchObject({
      id: 'm1',
      title: 'เมนูหลัก',
      size: 'large',
      imageUrl: '/uploads/main.png',
      startAt: '2026-08-22T00:00:00.000Z',
      endAt: '2026-08-31T23:59:00.000Z',
    })
    expect(row!['areas']).toEqual(menuRow.areas)
  })

  it('ไฟล์ที่ถูกลบจาก Media Library แล้วให้ imageUrl เป็น null ไม่ใช่ทำให้ทั้งรายการล้ม', async () => {
    const strapi = withUpload(fakeStrapi({ [UID.menu]: [{ ...menuRow }] }), null)

    const ctx = makeCtx()
    await controllers.menus({ strapi }).find(ctx)

    const [row] = ctx.body as Record<string, unknown>[]
    expect(row).toMatchObject({ id: 'm1', imageUrl: null })
  })

  it('รายละเอียดของเมนูเดียวก็มี imageUrl ด้วย — พรีวิวที่ไม่มีรูปที่อัปโหลดไว้ก็ไม่ใช่พรีวิว', async () => {
    const strapi = withUpload(fakeStrapi({ [UID.menu]: [{ ...menuRow }] }), '/uploads/main.png')

    const ctx = makeCtx({ params: { id: 'm1' } })
    await controllers.menus({ strapi }).findOne(ctx)

    expect(ctx.body).toMatchObject({ imageUrl: '/uploads/main.png' })
  })
})

/**
 * Task 9 — activate/deactivate/sync/audience/verify
 *
 * `fakeStrapi()` ที่ใช้ทั้งไฟล์ด้านบนมี `documents().findMany` ที่**เมิน filters ทั้งหมด**
 * (คืนทั้งตารางเสมอ) — เทสต์เดิมไม่เคยพึ่งพฤติกรรม filter จริงเพราะไม่มีตัวไหนพา schedule/member
 * ผ่าน scheduler ทั้งเป็น ๆ งานนี้ต้อง (1) หาแถว link-members ที่ state:'failed' ของเมนูที่ระบุ
 * โดยเฉพาะ (ไม่ใช่แถวแรกในตารางเฉย ๆ) และ (2) ให้ scheduler จริงของ core คัด pending/running
 * ถูกต้อง — ต้อง fake ที่ filter จริง ไม่ใช่ตัวเดิม จึงแยก fakeMembersStrapi ไว้ต่างหาก
 * (knex ของ lock แยกเป็นอีกก้อนหนึ่งเหมือน container.test.ts — ไม่แตะ `rows` เดียวกับ documents()
 * เจตนา เพราะ lock query จริงยิงผ่าน raw knex คนละทางกับ document service สิ่งที่เทสต์พวกนี้
 * ตรวจคือผลลัพธ์ของ documents() table ไม่ใช่ internal ของ lock ซึ่ง container.test.ts คุมอยู่แล้ว)
 */
function matchesFilter(actual: unknown, want: unknown): boolean {
  if (want !== null && typeof want === 'object' && !Array.isArray(want)) {
    const spec = want as Record<string, unknown>
    if ('documentId' in spec) {
      return (actual as Record<string, unknown> | null | undefined)?.['documentId'] === spec['documentId']
    }
    if ('$gt' in spec) return typeof actual === 'string' && actual > String(spec['$gt'])
    return false
  }
  return actual === want
}

function fakeMembersStrapi(rows: Record<string, Record<string, unknown>[]> = {}) {
  const table = (uid: string) => (rows[uid] ??= [])
  const knexBuilder = (): unknown => {
    const builder = {
      where() { return builder },
      whereIn() { return builder },
      andWhere(group: (b: unknown) => void) {
        group({ whereNull: () => ({ orWhere: () => undefined }) })
        return builder
      },
      async update() { return 1 },
    }
    return builder
  }

  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {
      get: <T>(path: string, fallback?: T) =>
        (path === 'server.app.keys' ? (['app-key-one-that-is-long-enough'] as unknown as T) : (fallback as T)),
    },
    dirs: { static: { public: '/tmp' } },
    plugin: (name: string) =>
      (name === 'upload'
        ? { service: () => ({ findOne: async () => null, upload: async () => [{ id: 900 }] }) }
        : { service: () => ({}), contentType: () => ({}) }),
    db: {
      connection: () => knexBuilder(),
      transaction: async <T>(fn: () => Promise<T>): Promise<T> => {
        const snapshot = Object.fromEntries(
          Object.entries(rows).map(([uid, entries]) => [uid, entries.map((row) => ({ ...row }))]),
        )
        try {
          return await fn()
        } catch (error) {
          for (const uid of Object.keys(rows)) delete rows[uid]
          Object.assign(rows, snapshot)
          throw error
        }
      },
    },
    cron: { add: vi.fn() },
    admin: { services: { permission: { actionProvider: { registerMany: async () => {} } } } },
    documents: (uid: string) => ({
      findMany: async (params?: { filters?: Record<string, unknown>; sort?: string; limit?: number }) => {
        let result = table(uid).filter((row) =>
          Object.entries(params?.filters ?? {}).every(([key, want]) => matchesFilter(row[key], want)))
        if (params?.sort !== undefined) {
          const [field, dir] = params.sort.split(':')
          result = [...result].sort((a, b) => {
            const av = String(a[field!] ?? '')
            const bv = String(b[field!] ?? '')
            return dir === 'desc' ? (av < bv ? 1 : -1) : (av > bv ? 1 : -1)
          })
        }
        return params?.limit === undefined ? result : result.slice(0, params.limit)
      },
      findOne: async ({ documentId }: { documentId: string }) =>
        table(uid).find((row) => row['documentId'] === documentId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { documentId: `doc${table(uid).length + 1}`, ...data }
        table(uid).push(row)
        return row
      },
      update: async ({ documentId, data }: { documentId: string; data: Record<string, unknown> }) => {
        const row = table(uid).find((candidate) => candidate['documentId'] === documentId)!
        Object.assign(row, data)
        return row
      },
      delete: async ({ documentId }: { documentId: string }) => {
        rows[uid] = table(uid).filter((row) => row['documentId'] !== documentId)
        return { documentId }
      },
    }),
  } as unknown as StrapiV5
}

/** สร้าง channel จริงผ่าน controller เพื่อให้ token ถูกปิดผนึกจริง — withSecrets().findOne ต้องถอดได้ */
async function seedAudienceChannel(strapi: StrapiV5, suffix: string): Promise<string> {
  const ctx = makeCtx({
    request: { body: { name: 'ร้าน', channelId: `ch000000000000000000${suffix}`, channelAccessToken: 'a-token-long-enough-1234' } },
  })
  await controllers.channels({ strapi }).create(ctx)
  return (ctx.body as { id: string }).id
}

function audienceMenuFixture(id: string, channelId: string, over: Record<string, unknown> = {}) {
  return {
    documentId: id, name: 'เมนูสมาชิก', size: 'large', chatBarText: '', chatBarMode: 'default',
    selected: true, templateKey: null, areas: [], areaImages: [],
    status: 'draft', lineRichMenuId: null, channel: { documentId: channelId },
    updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  }
}

describe('members controller — activate / sync', () => {
  it('activate ต้องการเมนูที่ publish แล้ว — draft ตอบ 409 ไม่ใช่ 500', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '01')
    rows[UID.menu] = [audienceMenuFixture('m-draft', channelId)]

    const ctx = makeCtx({ params: { id: 'm-draft' } })
    await controllers.members({ strapi }).activate(ctx)

    expect(ctx.status).toBe(409)
    expect(ctx.body).toMatchObject({ error: { code: 'menu_not_ready' } })
  })

  it('activate ตั้ง memberRichMenuId ของ channel และสร้างงาน link-members', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '02')
    rows[UID.menu] = [audienceMenuFixture('m1', channelId, { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.schedule] = []
    // ไม่มีสมาชิกเลย — linkMemberChunk คืนทันทีโดยไม่มี network call จริงเกิดขึ้นระหว่าง runTick
    rows[UID.member] = []

    const ctx = makeCtx({ params: { id: 'm1' } })
    await controllers.members({ strapi }).activate(ctx)

    const channelRow = () => rows[UID.channel]!.find((r) => r['documentId'] === channelId)!
    const scheduleRows = () => rows[UID.schedule]!

    expect(channelRow()['memberRichMenuId']).toBe('line-rm-1')
    expect(scheduleRows()).toContainEqual(expect.objectContaining({ op: 'link-members', cursor: null }))
  })

  /**
   * ตาม ruling ของ task-4/9 ledger — งานที่ตายกลางทาง (exception ระหว่างวิ่ง ไม่ใช่ crash)
   * ปล่อยแถวเป็น 'failed' พร้อม cursor ที่ทำไปแล้ว กดปุ่มซ้ำต้อง "ไปต่อ" ไม่ใช่ "เริ่มใหม่"
   * เทสต์นี้คือด่านที่พิสูจน์ข้อนั้นโดยตรง ไม่ใช่แค่ผลลัพธ์ปลายทางเดียวกันโดยบังเอิญ
   */
  it('activate ใช้แถว link-members ที่ failed เดิมซ้ำ พร้อม cursor เดิม — ไม่สร้างแถวใหม่ cursor:null', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '03')
    rows[UID.menu] = [audienceMenuFixture('m1', channelId, { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.schedule] = [{
      documentId: 'sched1', richMenu: { documentId: 'm1' }, op: 'link-members', state: 'failed',
      cursor: 'm00499', runAt: '2020-01-01T00:00:00.000Z', lockedBy: null, lockedAt: null,
      lastError: 'line_server_error',
    }]
    rows[UID.member] = []

    const ctx = makeCtx({ params: { id: 'm1' } })
    await controllers.members({ strapi }).activate(ctx)

    const linkRows = rows[UID.schedule]!.filter((r) => r['op'] === 'link-members')
    expect(linkRows).toHaveLength(1)
    expect(linkRows[0]).toMatchObject({ documentId: 'sched1', cursor: 'm00499', state: 'pending' })
  })

  it('sync ทำงานเหมือน activate ทุกประการ — เมนูที่ active อยู่แล้วก็ยังตั้ง memberRichMenuId ได้', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '04')
    rows[UID.menu] = [audienceMenuFixture('m1', channelId, { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.schedule] = []
    rows[UID.member] = []

    const ctx = makeCtx({ params: { id: 'm1' } })
    await controllers.members({ strapi }).sync(ctx)

    const channelRow = rows[UID.channel]!.find((r) => r['documentId'] === channelId)!
    expect(channelRow['memberRichMenuId']).toBe('line-rm-1')
  })
})

describe('members controller — deactivate', () => {
  it('deactivate ล้าง memberRichMenuId', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '10')
    ;(rows[UID.channel]![0] as Record<string, unknown>)['memberRichMenuId'] = 'line-rm-1'
    rows[UID.menu] = [audienceMenuFixture('m1', channelId, { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.member] = []

    const ctx = makeCtx({ params: { id: 'm1' } })
    await controllers.members({ strapi }).deactivate(ctx)

    const channelRow = rows[UID.channel]!.find((r) => r['documentId'] === channelId)!
    expect(channelRow['memberRichMenuId']).toBeNull()
  })

  it('เมนูไม่มีอยู่จริงตอบ 404 menu_not_found', async () => {
    const strapi = fakeMembersStrapi({})
    const ctx = makeCtx({ params: { id: 'nope' } })
    await controllers.members({ strapi }).deactivate(ctx)
    expect(ctx.status).toBe(404)
  })

  it('memberRichMenuId เป็น null อยู่แล้ว (ปิดไปแล้ว) — สำเร็จโดยไม่ยิง LINE เลย', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '11')
    rows[UID.menu] = [audienceMenuFixture('m1', channelId, { status: 'published', lineRichMenuId: 'line-rm-1' })]

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const ctx = makeCtx({ params: { id: 'm1' } })
    await controllers.members({ strapi }).deactivate(ctx)

    expect(ctx.status).toBe(204)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  /**
   * ต้องพิสูจน์สองอย่างพร้อมกัน — ใครที่ยัง linked อยู่กับเมนูนี้ถูกปลดจริง (ไม่ใช่แค่ channel
   * ถูกล้าง) และคนที่ linked กับเมนูอื่นอยู่ (line-rm-9) ต้องไม่ถูกแตะเลย — เดียวกับที่ Task 3
   * เคยจับได้ว่า mock ตัวหนึ่งเคย "unlink ด้วยการล้างทั้งก้อน" ผิดความหมายของ bulk/unlink
   */
  it('ปลด LINE user ทุกคนที่ยัง linked กับเมนูนี้ ไม่แตะคนที่ linked กับเมนูอื่น', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '12')
    ;(rows[UID.channel]![0] as Record<string, unknown>)['memberRichMenuId'] = 'line-rm-1'
    rows[UID.menu] = [audienceMenuFixture('m1', channelId, { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.member] = [
      { documentId: 'mem1', channel: { documentId: channelId }, lineUserId: `U${'a'.repeat(32)}`, linkedRichMenuId: 'line-rm-1', linkedAt: '2026-01-01T00:00:00.000Z' },
      { documentId: 'mem2', channel: { documentId: channelId }, lineUserId: `U${'b'.repeat(32)}`, linkedRichMenuId: 'line-rm-1', linkedAt: '2026-01-01T00:00:00.000Z' },
      { documentId: 'mem3', channel: { documentId: channelId }, lineUserId: `U${'c'.repeat(32)}`, linkedRichMenuId: 'line-rm-9', linkedAt: '2026-01-01T00:00:00.000Z' },
    ]

    const calls: { url: string; body: string }[] = []
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: init?.body === undefined ? '' : String(init.body) })
      return new Response('{}', { status: 202 })
    })

    const ctx = makeCtx({ params: { id: 'm1' } })
    await controllers.members({ strapi }).deactivate(ctx)
    fetchSpy.mockRestore()

    expect(ctx.status).toBe(204)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://api.line.me/v2/bot/richmenu/bulk/unlink')
    expect((JSON.parse(calls[0]!.body) as { userIds: string[] }).userIds.sort()).toEqual(
      [`U${'a'.repeat(32)}`, `U${'b'.repeat(32)}`].sort(),
    )

    const byId = (id: string) => rows[UID.member]!.find((m) => m['documentId'] === id)!
    expect(byId('mem1')['linkedRichMenuId']).toBeNull()
    expect(byId('mem2')['linkedRichMenuId']).toBeNull()
    expect(byId('mem3')['linkedRichMenuId']).toBe('line-rm-9')

    const channelRow = rows[UID.channel]!.find((r) => r['documentId'] === channelId)!
    expect(channelRow['memberRichMenuId']).toBeNull()

    const auditRows = rows[UID.audit] ?? []
    expect(auditRows).toContainEqual(expect.objectContaining({ action: 'unlink-members', result: 'success' }))
  })
})

describe('members controller — audience', () => {
  it('audience คืนทั้ง default ของ LINE และเมนูของสมาชิก', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '20')
    ;(rows[UID.channel]![0] as Record<string, unknown>)['memberRichMenuId'] = 'line-rm-1'

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ richMenuId: 'line-rm-9' }), { status: 200 }))
    const ctx = makeCtx({ params: { id: channelId } })
    await controllers.members({ strapi }).audience(ctx)

    expect(ctx.body).toEqual({ defaultRichMenuId: 'line-rm-9', memberRichMenuId: 'line-rm-1' })
    fetchSpy.mockRestore()
  })

  it('channel ไม่มีเมนูสมาชิกเลย — memberRichMenuId เป็น null', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '21')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 404 }))
    const ctx = makeCtx({ params: { id: channelId } })
    await controllers.members({ strapi }).audience(ctx)

    expect(ctx.body).toEqual({ defaultRichMenuId: null, memberRichMenuId: null })
    fetchSpy.mockRestore()
  })
})

describe('members controller — verify', () => {
  it('verify คืน richMenuId ที่ user ถืออยู่จริงจาก LINE ด้วยการเรียกครั้งเดียว', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '30')
    rows[UID.member] = [{
      documentId: 'mem1', channel: { documentId: channelId }, lineUserId: `U${'a'.repeat(32)}`,
      linkedRichMenuId: null, linkedAt: null,
    }]

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ richMenuId: 'line-rm-1' }), { status: 200 }))
    const ctx = makeCtx({ params: { id: 'mem1' } })
    await controllers.members({ strapi }).verify(ctx)

    expect(ctx.body).toEqual({ richMenuId: 'line-rm-1' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  it('user ไม่ได้ผูกเมนูไหนบน LINE เลย (404 จาก LINE) — คืน richMenuId: null ไม่ใช่โยน', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '31')
    rows[UID.member] = [{
      documentId: 'mem1', channel: { documentId: channelId }, lineUserId: `U${'a'.repeat(32)}`,
      linkedRichMenuId: null, linkedAt: null,
    }]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }))
    const ctx = makeCtx({ params: { id: 'mem1' } })
    await controllers.members({ strapi }).verify(ctx)
    fetchSpy.mockRestore()

    expect(ctx.body).toEqual({ richMenuId: null })
  })

  it('member ไม่มีอยู่จริงตอบ 404 member_not_found', async () => {
    const strapi = fakeMembersStrapi({})
    const ctx = makeCtx({ params: { id: 'nope' } })
    await controllers.members({ strapi }).verify(ctx)
    expect(ctx.status).toBe(404)
    expect((ctx.body as { error: { code: string } }).error.code).toBe('member_not_found')
  })
})

/**
 * สเปก §11.4 — เทสต์นี้ล้อกับ `route ทุกเส้น` ด้านบนแต่เจาะจงเส้นใหม่ 5 เส้นของ task นี้เพื่อ
 * ให้ regression ที่แคบกว่าอ่านชัดกว่า "หนึ่งใน N เส้นทั้งหมดผิด"
 *
 * `expect(route, ...).toBeDefined()` ต้องมาก่อนเช็ค policy เสมอ — ไม่งั้นถ้าเผลอลบ route ออกจาก
 * ตารางไปทั้งแถว `.find()` จะคืน undefined แล้ว `route!.config` ข้างล่างจะ throw เป็น TypeError
 * ที่อ่านไม่ออกว่าจริง ๆ แล้ว "route หายไป" ไม่ใช่ "permission ผิด" — ยืนยันจริงว่าด่านนี้จับ route
 * ที่หายไปได้ (ไม่ใช่แค่ permission ผิด) ด้วยการลบ path หนึ่งออกจาก `admin.routes` ชั่วคราวแล้ว
 * รันเทสต์นี้แยก ดูรายงาน task-9 สำหรับผลจริง
 */
describe('members controller — เส้นใหม่ทั้งหมดต้องการสิทธิ์ publish (สเปก §11.4)', () => {
  it('ทุกเส้นใหม่ต้องการสิทธิ์ publish', () => {
    const paths = [
      '/menus/:id/audience/activate', '/menus/:id/audience/deactivate',
      '/menus/:id/audience/sync', '/channels/:id/audience', '/members/:id/verify',
    ]
    for (const path of paths) {
      const route = admin.routes.find((r) => r.path === path)
      expect(route, `${path} ไม่มีใน route table`).toBeDefined()
      const policies = route!.config.policies as { name: string; config: { actions: string[] } }[]
      expect(policies[0]!.config.actions).toEqual([PERMISSION.publish])
    }
  })
})
