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
