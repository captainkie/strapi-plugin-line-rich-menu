import { describe, expect, it, vi } from 'vitest'
import { controllers } from '../server/src/controllers/index.js'
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
    plugin: () => ({ service: () => ({}), contentType: () => ({}) }),
    db: { connection: () => ({ where: () => ({}) }) },
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
})
