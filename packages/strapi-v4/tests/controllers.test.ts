import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  LineAuthError, PublishAlreadyRunningError, PublishRateLimitedError, ValidationError,
} from '@fosivo/line-rich-menu-core'
import { UID } from '../src/server/content-types/index.js'
import { controllers } from '../src/server/controllers/index.js'
import { toHttpError } from '../src/server/http-error.js'
import { PERMISSION } from '../src/server/permissions.js'
import { admin } from '../src/server/routes/admin.js'
import type { AdminContext } from '../src/server/http-error.js'
import type { StrapiV4 } from '../src/server/strapi.js'

// เฉพาะเทสต์ของ deleteOrphan ที่ต้องยิงจริงไปยัง services.clientFor() (LINE) — ที่เหลือในไฟล์นี้
// ไม่แตะ LINE เลย onUnhandledRequest: 'error' ทำให้ request ที่ไม่ได้ mock ไว้ (เช่น DELETE ที่ไม่ควร
// ถูกยิงตอน id ไม่ใช่กำพร้าจริง) ทำให้เทสต์ fail แทนที่จะเงียบผ่าน
const lineServer = setupServer()
beforeAll(() => lineServer.listen({ onUnhandledRequest: 'error' }))
afterEach(() => lineServer.resetHandlers())
afterAll(() => lineServer.close())

const TOKEN = 'aBcDeFgH1234567890-channel-access-token-WXYZ'

function ctx(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    request: { body: undefined },
    query: {},
    params: {},
    state: { user: { id: 3 } },
    status: 200,
    body: undefined,
    set: vi.fn(),
    ...overrides,
  } as AdminContext
}

function deepContains(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle)
  if (Array.isArray(value)) return value.some((v) => deepContains(v, needle))
  if (value !== null && typeof value === 'object') return Object.values(value).some((v) => deepContains(v, needle))
  return false
}

/**
 * เทียบ filter กับแถวหนึ่งแถวแบบเดียวกับที่ `entityService` ของ v4 ทำ
 *
 * relation ถูกเก็บเป็นเลข FK ดิบ ๆ เหมือนคอลัมน์จริงในตาราง (ดู `statefulScheduleStrapi` ใน
 * repo.test.ts ที่ทำแบบเดียวกัน) — `mapFilters` ของแต่ละ repo แปลง `channelId`/`richMenuId`
 * ในชั้น service เป็นชื่อ relation กับเลขให้แล้วก่อนถึงตรงนี้ จึงเทียบค่าตรง ๆ ได้
 */
function matchesFilters(row: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([key, want]) => {
    const value = row[key]
    const actual = value !== null && typeof value === 'object' && 'id' in (value as object)
      ? (value as { id: unknown }).id
      : value
    return actual === want
  })
}

/**
 * strapi ปลอมที่มีเฉพาะสิ่งที่ controller เดินผ่านจริง
 *
 * `findMany` เคย **ทิ้ง `filters` ทั้งก้อน** แล้วคืนทั้งตาราง ซึ่งแปลว่า `assertChannelIdFree`,
 * `clearOtherDefaults`, `reconcileChannel`, `assertAliasFree` และ `readDisplayPeriod` ทุกตัว
 * ทำงานกับทั้งตารางในเทสต์ชุดนี้ ไม่มี assertion ไหนเปลี่ยนเพราะแต่ละเทสต์ seed ไว้ไม่เกินหนึ่งแถว
 * เท่านั้นเอง — ของปลอมที่ใจกว้างกว่าระบบที่มันยืนแทน ทำให้ข้อบกพร่องข้ามแถวมองไม่เห็นทั้งหมด
 */
function fakeStrapi(seed: { channels?: unknown[]; menus?: unknown[] } = {}) {
  const rows: Record<string, Record<string, unknown>[]> = {
    'plugin::line-rich-menu.line-channel': (seed.channels ?? []) as Record<string, unknown>[],
    'plugin::line-rich-menu.rich-menu': (seed.menus ?? []) as Record<string, unknown>[],
    'plugin::line-rich-menu.rich-menu-schedule': [],
    'plugin::line-rich-menu.rich-menu-audit': [],
  }
  let next = 100
  return {
    rows,
    strapi: {
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      config: {
        get: <T>(path: string, fallback?: T) => (path === 'server.app.keys' ? (['app-key-one'] as unknown as T) : (fallback as T)),
      },
      dirs: { static: { public: '/tmp' } },
      plugin: () => ({ service: () => ({ upload: async () => [{ id: 900 }] }), contentType: () => ({}) }),
      db: { connection: () => ({}) },
      admin: { services: { permission: { actionProvider: { registerMany: async () => {} } } } },
      cron: { add: vi.fn() },
      entityService: {
        findMany: async (uid: string, params?: { filters?: Record<string, unknown> }) =>
          (rows[uid] ?? []).filter((row) => matchesFilters(row, params?.filters ?? {})),
        findOne: async (uid: string, id: number | string) => (rows[uid] ?? []).find((r) => r['id'] === Number(id)) ?? null,
        create: async (uid: string, params: { data: Record<string, unknown> }) => {
          const row = { id: next++, ...params.data }
          rows[uid]!.push(row)
          return row
        },
        update: async (uid: string, id: number | string, params: { data: Record<string, unknown> }) => {
          const row = (rows[uid] ?? []).find((r) => r['id'] === Number(id))!
          Object.assign(row, params.data)
          return row
        },
        delete: async (uid: string, id: number | string) => {
          rows[uid] = (rows[uid] ?? []).filter((r) => r['id'] !== Number(id))
          return null
        },
      },
    } as never,
  }
}

describe('channels controller', () => {
  it('สร้าง channel แล้วคืน DTO ที่ไม่มี token ไม่ว่าจะซอกไหน', async () => {
    const { strapi } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    const context = ctx({ request: { body: { name: 'ร้าน', channelId: '1650000000', channelAccessToken: TOKEN } } })

    await controller.create(context)

    expect(context.body).toMatchObject({ name: 'ร้าน', accessTokenPreview: '••••••••WXYZ' })
    expect(deepContains(context.body, TOKEN)).toBe(false)
  })

  it('list ไม่มี token และไม่มี ciphertext', async () => {
    const { strapi } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    await controller.create(ctx({ request: { body: { name: 'ร้าน', channelId: '1650000000', channelAccessToken: TOKEN } } }))

    const context = ctx()
    await controller.find(context)

    expect(deepContains(context.body, TOKEN)).toBe(false)
    expect(deepContains(context.body, 'v1.')).toBe(false)
  })

  /**
   * เทสต์นี้เป็นไปไม่ได้เลยตอนที่ `findMany` ทิ้ง filters: `assertChannelIdFree` จะเห็นทั้งตาราง
   * แล้วสรุปว่า channelId ถูกใช้ไปแล้ว → ลูกค้าที่มี OA ตัวที่สองสร้าง channel ตัวที่สองไม่ได้เลย
   */
  it('สร้าง channel ตัวที่สองด้วย channelId คนละตัวได้ — ไม่ใช่ชนกับตัวแรกทุกครั้ง', async () => {
    const { strapi } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    await controller.create(ctx({ request: { body: { name: 'ร้าน A', channelId: '1650000000', channelAccessToken: TOKEN } } }))

    const context = ctx({ request: { body: { name: 'ร้าน B', channelId: '1660000000', channelAccessToken: TOKEN } } })
    await controller.create(context)

    expect(context.status).toBe(200)
    expect(context.body).toMatchObject({ name: 'ร้าน B', channelId: '1660000000' })
  })

  it('channelId ที่ซ้ำกับ channel ที่มีอยู่ยังถูกปฏิเสธด้วย 400 เหมือนเดิม', async () => {
    const { strapi } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    await controller.create(ctx({ request: { body: { name: 'ร้าน A', channelId: '1650000000', channelAccessToken: TOKEN } } }))

    const context = ctx({ request: { body: { name: 'ร้าน B', channelId: '1650000000', channelAccessToken: TOKEN } } })
    await controller.create(context)

    expect(context.status).toBe(400)
    expect(context.body).toMatchObject({ error: { code: 'validation_failed', issues: [{ path: 'channelId' }] } })
  })

  it('body ที่มีฟิลด์แปลกปลอมถูกปฏิเสธด้วย 400 ไม่ใช่ 500', async () => {
    const { strapi } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    const context = ctx({ request: { body: { name: 'ร้าน', channelId: '1', channelAccessToken: TOKEN, isSuperAdmin: true } } })

    await controller.create(context)

    expect(context.status).toBe(400)
    expect(context.body).toMatchObject({ error: { code: 'validation_failed' } })
  })
})

describe('channels controller > deleteOrphan', () => {
  async function seedChannel() {
    const { strapi } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    const createCtx = ctx({ request: { body: { name: 'ร้าน', channelId: '1650000000', channelAccessToken: TOKEN } } })
    await controller.create(createCtx)
    return { controller, channelId: (createCtx.body as { id: string }).id }
  }

  it('ลบเมนูกำพร้าที่ตรวจซ้ำแล้วยังกำพร้าจริง — คืน 204 และยิง DELETE ด้วย id ฝั่ง LINE', async () => {
    const { controller, channelId } = await seedChannel()
    let deletedId: string | null = null
    lineServer.use(
      http.get('https://api.line.me/v2/bot/richmenu/list', () =>
        HttpResponse.json({ richmenus: [{ richMenuId: 'richmenu-stray' }] })),
      http.delete('https://api.line.me/v2/bot/richmenu/:id', ({ params }) => {
        deletedId = params['id'] as string
        return new HttpResponse(null, { status: 200 })
      }),
    )

    const context = ctx({ params: { id: channelId, lineRichMenuId: 'richmenu-stray' } })
    await controller.deleteOrphan(context)

    expect(context.status).toBe(204)
    expect(context.body).toBeNull()
    expect(deletedId).toBe('richmenu-stray')
  })

  // หัวใจของ task นี้ที่ระดับ controller — id ที่ client ส่งมาไม่อยู่ในผลลัพธ์ reconcile ที่เรียกใหม่จริง
  // ต้องตอบ 409 (menu_not_ready) ไม่ใช่ 500 และห้ามยิง DELETE ให้ LINE เด็ดขาด — onUnhandledRequest:
  // 'error' ของ lineServer ทำให้การยิง DELETE โดยไม่ได้ตั้งใจ (ถ้าการตรวจซ้ำหลุดไป) ทำให้เทสต์นี้ fail เอง
  it('id ที่ตรวจซ้ำแล้วไม่ใช่กำพร้าจริง — คืน 409 ไม่ยิง DELETE ให้ LINE', async () => {
    const { controller, channelId } = await seedChannel()
    lineServer.use(
      http.get('https://api.line.me/v2/bot/richmenu/list', () => HttpResponse.json({ richmenus: [] })),
    )

    const context = ctx({ params: { id: channelId, lineRichMenuId: 'richmenu-guessed' } })
    await controller.deleteOrphan(context)

    expect(context.status).toBe(409)
    expect(context.body).toMatchObject({ error: { code: 'menu_not_ready' } })
  })
})

describe('menus controller > reconcile', () => {
  /**
   * reconcile ของ channel หนึ่งต้องนับเฉพาะเมนูของ channel นั้น — เมนูของ channel อื่นที่บังเอิญ
   * ถือ lineRichMenuId เดียวกันต้องไม่ทำให้มัน "รู้จัก" id นั้น ตอนที่ `findMany` ทิ้ง filters
   * เมนูของทุก channel ถูกนับรวมกันหมด id ที่กำพร้าจริงจึงหายไปจากรายงานเงียบ ๆ
   */
  it('reconcile นับเฉพาะเมนูของ channel ที่ถาม ไม่ใช่ทั้งตาราง', async () => {
    const { strapi, rows } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    const createCtx = ctx({ request: { body: { name: 'ร้าน A', channelId: '1650000000', channelAccessToken: TOKEN } } })
    await controller.create(createCtx)
    const channelId = (createCtx.body as { id: string }).id

    // เมนูของ channel **อื่น** (id 999) ที่ชี้ id เดียวกับที่อยู่บน LINE ของ channel A
    rows['plugin::line-rich-menu.rich-menu']!.push({
      id: 500, channel: 999, status: 'published', lineRichMenuId: 'richmenu-stray', areas: [], areaImages: [],
    })

    lineServer.use(
      http.get('https://api.line.me/v2/bot/richmenu/list', () =>
        HttpResponse.json({ richmenus: [{ richMenuId: 'richmenu-stray' }] })),
    )

    const context = ctx({ params: { id: channelId } })
    await controllers.menus({ strapi }).reconcile(context)

    expect(context.body).toMatchObject({ orphans: ['richmenu-stray'], missing: [] })
  })
})

describe('toHttpError', () => {
  it('แปลง code ของ core เป็นสถานะ HTTP ที่ตรงความหมาย และไม่ส่ง message ดิบขึ้นไป', () => {
    const cases: [unknown, number, string][] = [
      [new ValidationError('x', [{ path: 'name', code: 'too_small', message: 'too small' }]), 400, 'validation_failed'],
      [new PublishRateLimitedError(1500), 429, 'publish_rate_limited'],
      [new PublishAlreadyRunningError('7'), 409, 'publish_already_running'],
      [new LineAuthError('LINE ปฏิเสธ credential'), 502, 'line_auth_failed'],
      [new Error('unexpected'), 500, 'internal_error'],
    ]
    for (const [error, status, code] of cases) {
      const context = ctx()
      toHttpError(context, error)
      expect(context.status).toBe(status)
      expect(context.body).toMatchObject({ error: { code } })
      expect(JSON.stringify(context.body)).not.toContain('LINE ปฏิเสธ')
    }
  })

  it('429 ตั้ง Retry-After เป็นวินาที', () => {
    const context = ctx()
    toHttpError(context, new PublishRateLimitedError(1500))
    expect(context.set).toHaveBeenCalledWith('Retry-After', '2')
  })

  it('ส่ง issues ของ ValidationError ต่อไปให้ฟอร์มชี้ช่องที่ผิดได้', () => {
    const context = ctx()
    toHttpError(context, new ValidationError('x', [{ path: 'channelId', code: 'channel_id_taken', message: 'taken' }]))
    expect(context.body).toMatchObject({
      error: { code: 'validation_failed', issues: [{ path: 'channelId', code: 'channel_id_taken' }] },
    })
  })
})

/**
 * คู่ขนานกับ describe ชื่อเดียวกันใน packages/strapi-v5/tests/controllers.test.ts
 *
 * ต้องมีทั้งสองฝั่ง ไม่ใช่ฝั่งเดียว: `toSummary` เป็นโค้ดคนละก้อนกันในสองอะแดปเตอร์ (คนละ
 * entityService/documents API) ส่วนหน้าจอที่กินผลของมันเป็นก้อน**เดียวกัน** — `RichMenuList`
 * ใน packages/ui ด่านที่มีอยู่ฝั่งเดียวจะปล่อยให้ฝั่งที่ไม่มีเงียบไปทั้งที่หน้าจอพังเหมือนกัน
 * ซึ่งเป็นรูปแบบเดียวกับที่ Task 20 item 3 เจอมาแล้วกับด่านกัน token หลุด
 */
describe('menus controller > find — DTO ที่หน้ารายการต้องใช้', () => {
  const menuRow = {
    id: 1,
    name: 'เมนูหลัก',
    size: 'large',
    status: 'draft',
    channel: { id: 7 },
    areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'message', text: 'สวัสดี' } }],
    image: { id: 42 },
    updatedAt: '2026-08-22T00:00:00.000Z',
  }

  it('คืน size, areas, imageUrl และช่วงเวลาแสดงผลมาพร้อมกับแถว', async () => {
    const { strapi, rows } = fakeStrapi({ menus: [{ ...menuRow }] })
    // `store.url()` ของ v4 ถาม entityService ตรง ๆ ที่ uid ของ upload — ตัวจริงก็เส้นทางนี้
    rows['plugin::upload.file'] = [{ id: 42, url: '/uploads/main.png' }]
    rows['plugin::line-rich-menu.rich-menu-schedule'] = [
      { id: 11, richMenu: { id: 1 }, runAt: '2026-08-22T00:00:00.000Z', op: 'set-default', state: 'pending' },
      { id: 12, richMenu: { id: 1 }, runAt: '2026-08-31T23:59:00.000Z', op: 'clear-default', state: 'pending' },
    ]

    const context = ctx()
    await controllers.menus({ strapi }).find(context)

    const [row] = context.body as Record<string, unknown>[]
    expect(row).toMatchObject({
      id: '1',
      title: 'เมนูหลัก',
      size: 'large',
      imageUrl: '/uploads/main.png',
      startAt: '2026-08-22T00:00:00.000Z',
      endAt: '2026-08-31T23:59:00.000Z',
    })
    expect(row!['areas']).toEqual(menuRow.areas)
  })

  it('ไฟล์ที่ถูกลบจาก Media Library แล้วให้ imageUrl เป็น null ไม่ใช่ทำให้ทั้งรายการล้ม', async () => {
    const { strapi } = fakeStrapi({ menus: [{ ...menuRow }] })

    const context = ctx()
    await controllers.menus({ strapi }).find(context)

    expect((context.body as Record<string, unknown>[])[0]).toMatchObject({ id: '1', imageUrl: null })
  })

  it('รายละเอียดของเมนูเดียวก็มี imageUrl ด้วย — พรีวิวที่ไม่มีรูปที่อัปโหลดไว้ก็ไม่ใช่พรีวิว', async () => {
    const { strapi, rows } = fakeStrapi({ menus: [{ ...menuRow }] })
    rows['plugin::upload.file'] = [{ id: 42, url: '/uploads/main.png' }]

    const context = ctx({ params: { id: '1' } })
    await controllers.menus({ strapi }).findOne(context)

    expect(context.body).toMatchObject({ imageUrl: '/uploads/main.png' })
  })
})

/**
 * Task 10 — activate/deactivate/sync/audience/verify (คู่ขนานกับ Task 9 ของ strapi-v5)
 *
 * `fakeStrapi()` ที่ใช้ทั้งไฟล์ด้านบนก็คัด filters จริงอยู่แล้ว (ผ่าน `matchesFilters`) แต่ `db`
 * ของมันเป็น `{ connection: () => ({}) }` เปล่า ๆ — ไม่มี `.where()/.whereIn()/.andWhere()/.update()`
 * ให้ `createScheduleLock` ยิงผ่าน ไม่มีเทสต์เดิมตัวไหนพา schedule ผ่าน scheduler ทั้งเป็น ๆ
 * (runTick จริง) จึงไม่เคยต้องการมัน งานนี้ต้อง แยก fakeMembersStrapi ไว้ต่างหากที่มี knex ปลอม
 * ให้ lock เรียกได้จริง (เหมือน `statefulScheduleStrapi` ใน repo.test.ts ที่ทำแบบเดียวกันสำหรับ
 * entityService — ไม่แตะ `rows` เดียวกัน เพราะ lock query จริงยิงผ่าน raw knex คนละทางกับ
 * entityService)
 */
function fakeMembersStrapi(rows: Record<string, Record<string, unknown>[]> = {}) {
  const table = (uid: string) => (rows[uid] ??= [])
  let next = 100
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
      get: <T>(path: string, fallback?: T) => (path === 'server.app.keys' ? (['app-key-one'] as unknown as T) : (fallback as T)),
    },
    dirs: { static: { public: '/tmp' } },
    plugin: () => ({ service: () => ({ upload: async () => [{ id: 900 }] }), contentType: () => ({}) }),
    db: { connection: () => knexBuilder() },
    admin: { services: { permission: { actionProvider: { registerMany: async () => {} } } } },
    cron: { add: vi.fn() },
    entityService: {
      findMany: async (uid: string, params?: { filters?: Record<string, unknown> }) =>
        table(uid).filter((row) => matchesFilters(row, params?.filters ?? {})),
      findOne: async (uid: string, id: number | string) =>
        table(uid).find((row) => row['id'] === Number(id)) ?? null,
      create: async (uid: string, params: { data: Record<string, unknown> }) => {
        const row = { id: next++, ...params.data }
        table(uid).push(row)
        return row
      },
      update: async (uid: string, id: number | string, params: { data: Record<string, unknown> }) => {
        const row = table(uid).find((candidate) => candidate['id'] === Number(id))!
        Object.assign(row, params.data)
        return row
      },
      delete: async (uid: string, id: number | string) => {
        rows[uid] = table(uid).filter((row) => row['id'] !== Number(id))
        return null
      },
    },
  } as unknown as StrapiV4
}

/** สร้าง channel จริงผ่าน controller เพื่อให้ token ถูกปิดผนึกจริง — withSecrets().findOne ต้องถอดได้ */
async function seedAudienceChannel(strapi: StrapiV4, suffix: string): Promise<string> {
  const context = ctx({
    request: { body: { name: 'ร้าน', channelId: `1650000${suffix}`, channelAccessToken: 'a-token-long-enough-1234' } },
  })
  await controllers.channels({ strapi }).create(context)
  return (context.body as { id: string }).id
}

function audienceMenuFixture(id: number, channelId: number, over: Record<string, unknown> = {}) {
  return {
    id, name: 'เมนูสมาชิก', size: 'large', chatBarText: '', chatBarMode: 'default',
    selected: true, templateKey: null, areas: [], areaImages: [],
    status: 'draft', lineRichMenuId: null, channel: channelId,
    updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  }
}

describe('members controller — activate / sync', () => {
  it('activate ต้องการเมนูที่ publish แล้ว — draft ตอบ 409 ไม่ใช่ 500', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '01')
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId))]

    const context = ctx({ params: { id: '1' } })
    await controllers.members({ strapi }).activate(context)

    expect(context.status).toBe(409)
    expect(context.body).toMatchObject({ error: { code: 'menu_not_ready' } })
  })

  it('activate ตั้ง memberRichMenuId ของ channel และสร้างงาน link-members', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '02')
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.schedule] = []
    // ไม่มีสมาชิกเลย — linkMemberChunk คืนทันทีโดยไม่มี network call จริงเกิดขึ้นระหว่าง runTick
    rows[UID.member] = []

    const context = ctx({ params: { id: '1' } })
    await controllers.members({ strapi }).activate(context)

    const channelRow = () => rows[UID.channel]!.find((r) => r['id'] === Number(channelId))!
    const scheduleRows = () => rows[UID.schedule]!

    expect(channelRow()['memberRichMenuId']).toBe('line-rm-1')
    expect(scheduleRows()).toContainEqual(expect.objectContaining({ op: 'link-members', cursor: null }))
  })

  /**
   * ตาม ruling ของ task-4/9 ledger — งานที่ตายกลางทาง (exception ระหว่างวิ่ง ไม่ใช่ crash) ปล่อย
   * แถวเป็น 'failed' พร้อม cursor ที่ทำไปแล้ว กดปุ่มซ้ำต้อง "ไปต่อ" ไม่ใช่ "เริ่มใหม่" เทสต์นี้คือ
   * ด่านที่พิสูจน์ข้อนั้นโดยตรง ไม่ใช่แค่ผลลัพธ์ปลายทางเดียวกันโดยบังเอิญ
   */
  it('activate ใช้แถว link-members ที่ failed เดิมซ้ำ พร้อม cursor เดิม — ไม่สร้างแถวใหม่ cursor:null', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '03')
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.schedule] = [{
      id: 50, richMenu: 1, op: 'link-members', state: 'failed',
      cursor: 'm00499', runAt: '2020-01-01T00:00:00.000Z', lockedBy: null, lockedAt: null,
      lastError: 'line_server_error',
    }]
    rows[UID.member] = []

    const context = ctx({ params: { id: '1' } })
    await controllers.members({ strapi }).activate(context)

    const linkRows = rows[UID.schedule]!.filter((r) => r['op'] === 'link-members')
    expect(linkRows).toHaveLength(1)
    expect(linkRows[0]).toMatchObject({ id: 50, cursor: 'm00499', state: 'pending' })
  })

  /**
   * รอบเต็ม activate → deactivate ด้วยสมาชิกจริง — คู่ขนานกับด่านเดียวกันของ strapi-v5 ที่จับ
   * บั๊ก "ส่ง id ของแถวในฐานข้อมูลไปให้ LINE แทน id ของ LINE" ได้ (ดู task-9-findings.md) เทสต์
   * activate/sync ตัวอื่นในไฟล์นี้ seed สมาชิกเป็นศูนย์เสมอ ตัวนี้เป็นตัวเดียวที่ seed จริงแล้ว
   * เดินสองปุ่มติดกัน พิสูจน์ว่า id ที่เดินทางไปกลับคือ id ฝั่ง LINE ทั้งขาไปและขากลับ
   */
  it('รอบเต็ม: activate ผูกด้วย id ของ LINE แล้ว deactivate ปลดคนกลุ่มเดิมได้จริง', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '05')
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.schedule] = []
    rows[UID.member] = [
      { id: 1, channel: Number(channelId), lineUserId: `U${'a'.repeat(32)}`, linkedRichMenuId: null, linkedAt: null },
      { id: 2, channel: Number(channelId), lineUserId: `U${'b'.repeat(32)}`, linkedRichMenuId: null, linkedAt: null },
    ]

    const calls: { url: string; body: string }[] = []
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: init?.body === undefined ? '' : String(init.body) })
      return new Response('{}', { status: 202 })
    })

    await controllers.members({ strapi }).activate(ctx({ params: { id: '1' } }))

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://api.line.me/v2/bot/richmenu/bulk/link')
    expect((JSON.parse(calls[0]!.body) as { richMenuId: string }).richMenuId).toBe('line-rm-1')
    expect(rows[UID.member]!.map((row) => row['linkedRichMenuId'])).toEqual(['line-rm-1', 'line-rm-1'])

    await controllers.members({ strapi }).deactivate(ctx({ params: { id: '1' } }))
    fetchSpy.mockRestore()

    // กรองตาม endpoint ไม่ใช่อ่านตามลำดับ: lock ของจริงเขียน state 'done' ผ่าน knex ตรง ๆ ส่วน
    // knex ปลอมในไฟล์นี้ไม่เขียนอะไรกลับลงตาราง entityService แถวผูกจึงยังเป็น 'pending' อยู่แล้ว
    // ถูกหยิบมาวิ่งซ้ำในติ๊กของ deactivate — ข้อจำกัดของของปลอม ไม่ใช่พฤติกรรมของระบบจริง (กลไก
    // lock มีเทสต์ของตัวเองแยกต่างหาก) สิ่งที่เทสต์นี้ถามคือ id ที่เดินทางไปกลับ
    const unlinkCalls = calls.filter((call) => call.url.endsWith('/bulk/unlink'))
    expect(unlinkCalls).toHaveLength(1)
    expect((JSON.parse(unlinkCalls[0]!.body) as { userIds: string[] }).userIds.sort()).toEqual(
      [`U${'a'.repeat(32)}`, `U${'b'.repeat(32)}`].sort(),
    )
    expect(rows[UID.member]!.every((row) => row['linkedRichMenuId'] === null)).toBe(true)
  })

  it('มีงาน link-members ที่ยังไม่จบอยู่แล้ว — ไม่สร้างแถวที่สอง cursor:null มาวิ่งซ้อน', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '06')
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.schedule] = [{
      id: 60, richMenu: 1, op: 'link-members', state: 'running',
      cursor: 'mem0499', runAt: '2026-01-01T00:00:00.000Z', lockedBy: 'host:1', lockedAt: '2026-01-01T00:00:00.000Z',
      lastError: null,
    }]
    rows[UID.member] = []

    await controllers.members({ strapi }).activate(ctx({ params: { id: '1' } }))

    expect(rows[UID.schedule]!.filter((row) => row['op'] === 'link-members')).toHaveLength(1)
    expect(rows[UID.schedule]![0]).toMatchObject({ id: 60, cursor: 'mem0499' })
  })

  // scheduler ไม่เคยหยิบแถว 'failed' ซ้ำเอง — แถวที่ไม่ถูกปลุกคือคนกลุ่มหลัง cursor ของมันที่ไม่มี
  // ใครไปผูกให้อีกเลย การปลุกแค่แถวแรกที่ repo คืนมาจึงทิ้งงานค้างไว้เงียบ ๆ ตามจำนวนแถวที่เหลือ
  it('ปลุกแถว link-members ที่ล้มไว้ทุกแถว ไม่ใช่แถวแรกที่เจอ', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '07')
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.schedule] = [
      { id: 71, richMenu: 1, op: 'link-members', state: 'failed', cursor: 'mem0499', runAt: '2026-01-01T00:00:00.000Z', lockedBy: null, lockedAt: null, lastError: 'line_server_error' },
      { id: 72, richMenu: 1, op: 'link-members', state: 'failed', cursor: 'mem0999', runAt: '2026-01-01T00:00:00.000Z', lockedBy: null, lockedAt: null, lastError: 'line_server_error' },
    ]
    rows[UID.member] = []

    await controllers.members({ strapi }).activate(ctx({ params: { id: '1' } }))

    const linkRows = rows[UID.schedule]!.filter((row) => row['op'] === 'link-members')
    expect(linkRows).toHaveLength(2)
    // cursor ของแต่ละแถวต้องไม่ถูกแตะ — แต่ละแถวไปต่อจากตำแหน่งของตัวเอง
    expect(linkRows.map((row) => [row['id'], row['cursor'], row['lastError']])).toEqual([
      [71, 'mem0499', null], [72, 'mem0999', null],
    ])
  })

  it('sync ทำงานเหมือน activate ทุกประการ — เมนูที่ active อยู่แล้วก็ยังตั้ง memberRichMenuId ได้', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '04')
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.schedule] = []
    rows[UID.member] = []

    await controllers.members({ strapi }).sync(ctx({ params: { id: '1' } }))

    const channelRow = rows[UID.channel]!.find((r) => r['id'] === Number(channelId))!
    expect(channelRow['memberRichMenuId']).toBe('line-rm-1')
  })
})

describe('members controller — deactivate', () => {
  it('deactivate ล้าง memberRichMenuId', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '10')
    ;(rows[UID.channel]![0] as Record<string, unknown>)['memberRichMenuId'] = 'line-rm-1'
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.member] = []

    await controllers.members({ strapi }).deactivate(ctx({ params: { id: '1' } }))

    const channelRow = rows[UID.channel]!.find((r) => r['id'] === Number(channelId))!
    expect(channelRow['memberRichMenuId']).toBeNull()
  })

  it('เมนูไม่มีอยู่จริงตอบ 404 menu_not_found', async () => {
    const strapi = fakeMembersStrapi({})
    const context = ctx({ params: { id: '999' } })
    await controllers.members({ strapi }).deactivate(context)
    expect(context.status).toBe(404)
  })

  it('memberRichMenuId เป็น null อยู่แล้ว (ปิดไปแล้ว) — สำเร็จโดยไม่ยิง LINE เลย', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '11')
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const context = ctx({ params: { id: '1' } })
    await controllers.members({ strapi }).deactivate(context)

    expect(context.status).toBe(204)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  /**
   * ต้องพิสูจน์สามอย่างพร้อมกัน — ใครที่ยัง linked อยู่กับเมนูนี้ถูกปลดจริง (ไม่ใช่แค่ channel
   * ถูกล้าง) คนที่ linked กับเมนูอื่นอยู่ (line-rm-9) ต้องไม่ถูกแตะเลย และแถว audit ของงานสมาชิก
   * ต้องถูกเขียนจริง — ข้อสุดท้ายคือด่านที่ Task 8 ไม่มี (enum ของ rich-menu-audit ขาด
   * 'unlink-members' ทำให้ Strapi จริงปฏิเสธแถวนี้เงียบ ๆ ผ่าน persistQuietly โดยไม่มีเทสต์ไหนจับได้
   * เพราะไม่เคยมีใครเช็ค rows[UID.audit] เลย — ดู content-types.test.ts สำหรับด่านที่ตรวจ enum เอง)
   */
  it('ปลด LINE user ทุกคนที่ยัง linked กับเมนูนี้ ไม่แตะคนที่ linked กับเมนูอื่น และเขียนแถว audit จริง', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '12')
    ;(rows[UID.channel]![0] as Record<string, unknown>)['memberRichMenuId'] = 'line-rm-1'
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.member] = [
      { id: 1, channel: Number(channelId), lineUserId: `U${'a'.repeat(32)}`, linkedRichMenuId: 'line-rm-1', linkedAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, channel: Number(channelId), lineUserId: `U${'b'.repeat(32)}`, linkedRichMenuId: 'line-rm-1', linkedAt: '2026-01-01T00:00:00.000Z' },
      { id: 3, channel: Number(channelId), lineUserId: `U${'c'.repeat(32)}`, linkedRichMenuId: 'line-rm-9', linkedAt: '2026-01-01T00:00:00.000Z' },
    ]

    const calls: { url: string; body: string }[] = []
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: init?.body === undefined ? '' : String(init.body) })
      return new Response('{}', { status: 202 })
    })

    const context = ctx({ params: { id: '1' } })
    await controllers.members({ strapi }).deactivate(context)
    fetchSpy.mockRestore()

    expect(context.status).toBe(204)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://api.line.me/v2/bot/richmenu/bulk/unlink')
    expect((JSON.parse(calls[0]!.body) as { userIds: string[] }).userIds.sort()).toEqual(
      [`U${'a'.repeat(32)}`, `U${'b'.repeat(32)}`].sort(),
    )

    const byId = (id: number) => rows[UID.member]!.find((m) => m['id'] === id)!
    expect(byId(1)['linkedRichMenuId']).toBeNull()
    expect(byId(2)['linkedRichMenuId']).toBeNull()
    expect(byId(3)['linkedRichMenuId']).toBe('line-rm-9')

    const channelRow = rows[UID.channel]!.find((r) => r['id'] === Number(channelId))!
    expect(channelRow['memberRichMenuId']).toBeNull()

    const auditRows = rows[UID.audit] ?? []
    // richMenuId ต้องเป็น id ฝั่ง LINE ตรง ๆ ('line-rm-1') ไม่ใช่ NaN — ก่อนแก้ Task 10 คอลัมน์
    // integer เดิมบังคับ Number('line-rm-1') ที่ repo.ts ได้ NaN แล้ว Strapi จริงปฏิเสธทั้งแถว
    expect(auditRows).toContainEqual(
      expect.objectContaining({ action: 'unlink-members', result: 'success', richMenuId: 'line-rm-1' }),
    )
  })

  /**
   * หัวใจของงานนี้ — deactivate ต้อง "ตั้งงาน" ไม่ใช่ "ปลดเอง" ระบบนี้ออกแบบมาสำหรับสมาชิก
   * เกินหมื่นคน คำขอเดียวที่วนปลดทั้งหมดคือคำขอที่ proxy timeout หรือ restart ตัดกลางทางได้
   * แล้วไม่มีใครทำงานที่เหลือต่อ ส่วนแถวงานที่ค้างอยู่ในตาราง cron รอบถัดไปหยิบต่อได้เสมอ
   */
  it('ตั้งงาน unlink-members ไว้ในตาราง (cursor: null) ไม่ใช่ปลดเองในคำขอ', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '13')
    ;(rows[UID.channel]![0] as Record<string, unknown>)['memberRichMenuId'] = 'line-rm-1'
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.member] = []

    await controllers.members({ strapi }).deactivate(ctx({ params: { id: '1' } }))

    // cursor: null และต้องไม่มีใครมาเติมทีหลังด้วย — งาน unlink ไม่มี cursor โดยเจตนา ชุดงานของมัน
    // คือ "คนที่ยังถือเมนูนี้อยู่" ซึ่งหดเองทุกคนที่ปลดสำเร็จ (ดู unlinkMemberChunk ใน core)
    expect(rows[UID.schedule]).toContainEqual(
      expect.objectContaining({ op: 'unlink-members', cursor: null, richMenu: 1 }),
    )
  })

  /**
   * รอบก่อนล้มกลางทาง (LINE ล่ม) — memberRichMenuId ถูกล้างไปตั้งแต่รอบนั้นแล้วตามสเปก
   * ("เมนูที่กดปิดต้องอ่านว่าปิด") แต่ยังมีคนถือเมนูค้างอยู่จริง ถ้าเงื่อนไขตั้งงานผูกกับ
   * memberRichMenuId การกดปิดซ้ำจะไม่ทำอะไรเลย และไม่มีทางอื่นในหน้าจอที่ปลดคนกลุ่มนั้นได้อีก
   */
  it('กดปิดซ้ำหลังรอบก่อนล้ม ยังตั้งงานปลดได้ ทั้งที่ memberRichMenuId ถูกล้างไปแล้ว', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '14')
    rows[UID.menu] = [audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' })]
    rows[UID.member] = [{
      id: 1, channel: Number(channelId), lineUserId: `U${'a'.repeat(32)}`,
      linkedRichMenuId: 'line-rm-1', linkedAt: '2026-01-01T00:00:00.000Z',
    }]

    const calls: string[] = []
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      calls.push(String(url))
      return new Response('{}', { status: 202 })
    })

    await controllers.members({ strapi }).deactivate(ctx({ params: { id: '1' } }))
    fetchSpy.mockRestore()

    expect(calls).toEqual(['https://api.line.me/v2/bot/richmenu/bulk/unlink'])
    expect(rows[UID.member]![0]!['linkedRichMenuId']).toBeNull()
  })

  /**
   * ปิดเมนูเก่า A ขณะที่ B เป็นเมนูสมาชิกที่ใช้อยู่ — ถ้า deactivate ล้าง pointer แบบไม่ถามว่า
   * ชี้ที่ใคร B จะถูกปิดตามไปด้วยทั้งที่ไม่มีใครสั่ง: หน้าจออ่านว่าปิด สมาชิกใหม่ไม่ถูกผูกกับ B อีก
   * และงานปลดของ A ก็ไม่แมตช์ใครเพราะไม่มีใครถือ A — B จึงค้างอยู่บน LINE โดยไม่มีใครรื้อ
   */
  it('ปิดเมนูเก่าไม่ล้าง memberRichMenuId ของเมนูที่ใช้อยู่ แต่ยังตั้งงานปลดของเมนูเก่า', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '15')
    ;(rows[UID.channel]![0] as Record<string, unknown>)['memberRichMenuId'] = 'line-rm-2'
    rows[UID.menu] = [
      audienceMenuFixture(1, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-1' }),
      audienceMenuFixture(2, Number(channelId), { status: 'published', lineRichMenuId: 'line-rm-2' }),
    ]
    rows[UID.member] = [
      { id: 1, channel: Number(channelId), lineUserId: `U${'a'.repeat(32)}`, linkedRichMenuId: 'line-rm-1', linkedAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, channel: Number(channelId), lineUserId: `U${'b'.repeat(32)}`, linkedRichMenuId: 'line-rm-2', linkedAt: '2026-01-01T00:00:00.000Z' },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 202 }))
    await controllers.members({ strapi }).deactivate(ctx({ params: { id: '1' } }))
    fetchSpy.mockRestore()

    const channelRow = rows[UID.channel]!.find((row) => row['id'] === Number(channelId))!
    expect(channelRow['memberRichMenuId']).toBe('line-rm-2')
    // งานของเมนูเก่ายังต้องถูกตั้งและวิ่ง — คนที่ถือ A อยู่ต้องถูกปลด ส่วนคนที่ถือ B ต้องไม่ถูกแตะ
    expect(rows[UID.schedule]).toContainEqual(expect.objectContaining({ op: 'unlink-members' }))
    const byId = (id: number) => rows[UID.member]!.find((row) => row['id'] === id)!
    expect(byId(1)['linkedRichMenuId']).toBeNull()
    expect(byId(2)['linkedRichMenuId']).toBe('line-rm-2')
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
    const context = ctx({ params: { id: channelId } })
    await controllers.members({ strapi }).audience(context)

    expect(context.body).toEqual({ defaultRichMenuId: 'line-rm-9', memberRichMenuId: 'line-rm-1', memberCount: 0 })
    fetchSpy.mockRestore()
  })

  it('channel ไม่มีเมนูสมาชิกเลย — memberRichMenuId เป็น null', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '21')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }))
    const context = ctx({ params: { id: channelId } })
    await controllers.members({ strapi }).audience(context)

    expect(context.body).toEqual({ defaultRichMenuId: null, memberRichMenuId: null, memberCount: 0 })
    fetchSpy.mockRestore()
  })

  // Task 11 — กล่องยืนยันก่อนกด activate ต้องบอกจำนวนสมาชิกที่จะโดน นับจากแถว line-member
  // จริงของ channel นี้ ไม่ใช่ค่าคงที่หรือความยาวของอะไรอื่น
  it('นับจำนวนสมาชิกของ channel นี้จริง ไม่ใช่ของ channel อื่น', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '22')
    const otherChannelId = await seedAudienceChannel(strapi, '23')
    rows[UID.member] = [
      { id: 1, channel: Number(channelId), lineUserId: `U${'a'.repeat(32)}`, linkedRichMenuId: null, linkedAt: null },
      { id: 2, channel: Number(channelId), lineUserId: `U${'b'.repeat(32)}`, linkedRichMenuId: null, linkedAt: null },
      { id: 3, channel: Number(otherChannelId), lineUserId: `U${'c'.repeat(32)}`, linkedRichMenuId: null, linkedAt: null },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }))
    const context = ctx({ params: { id: channelId } })
    await controllers.members({ strapi }).audience(context)

    expect((context.body as { memberCount: number }).memberCount).toBe(2)
    fetchSpy.mockRestore()
  })
})

describe('members controller — verify', () => {
  it('verify คืน richMenuId ที่ user ถืออยู่จริงจาก LINE ด้วยการเรียกครั้งเดียว', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '30')
    rows[UID.member] = [{
      id: 1, channel: Number(channelId), lineUserId: `U${'a'.repeat(32)}`,
      linkedRichMenuId: null, linkedAt: null,
    }]

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ richMenuId: 'line-rm-1' }), { status: 200 }))
    const context = ctx({ params: { id: '1' } })
    await controllers.members({ strapi }).verify(context)

    expect(context.body).toEqual({ richMenuId: 'line-rm-1' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  it('user ไม่ได้ผูกเมนูไหนบน LINE เลย (404 จาก LINE) — คืน richMenuId: null ไม่ใช่โยน', async () => {
    const rows: Record<string, Record<string, unknown>[]> = {}
    const strapi = fakeMembersStrapi(rows)
    const channelId = await seedAudienceChannel(strapi, '31')
    rows[UID.member] = [{
      id: 1, channel: Number(channelId), lineUserId: `U${'a'.repeat(32)}`,
      linkedRichMenuId: null, linkedAt: null,
    }]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }))
    const context = ctx({ params: { id: '1' } })
    await controllers.members({ strapi }).verify(context)
    fetchSpy.mockRestore()

    expect(context.body).toEqual({ richMenuId: null })
  })

  it('member ไม่มีอยู่จริงตอบ 404 member_not_found', async () => {
    const strapi = fakeMembersStrapi({})
    const context = ctx({ params: { id: '999' } })
    await controllers.members({ strapi }).verify(context)
    expect(context.status).toBe(404)
    expect((context.body as { error: { code: string } }).error.code).toBe('member_not_found')
  })
})

/**
 * สเปก §11.4 — คู่ขนานกับ describe ชื่อเดียวกันใน packages/strapi-v5/tests/controllers.test.ts
 * เจาะจงเส้นใหม่ 5 เส้นของ task นี้แยกจาก matrix กว้าง ๆ ใน rbac.test.ts เพื่อให้ regression ที่แคบ
 * กว่าอ่านชัดกว่า "หนึ่งใน N เส้นทั้งหมดผิด"
 *
 * `expect(route, ...).toBeDefined()` ต้องมาก่อนเช็ค policy เสมอ — ไม่งั้นถ้าเผลอลบ route ออกจาก
 * ตารางไปทั้งแถว `.find()` จะคืน undefined แล้ว `route!.config` ข้างล่างจะ throw เป็น TypeError
 * ที่อ่านไม่ออกว่าจริง ๆ แล้ว "route หายไป" ไม่ใช่ "permission ผิด"
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
      // เช็คชื่อ policy ด้วย ไม่ใช่แค่ actions — policy ตัวอื่นที่บังเอิญมี config.actions รูปเดียวกัน
      // ผ่านด่านนี้ได้ทั้งที่ไม่ได้บังคับสิทธิ์อะไรเลย ชื่อคือตัวที่บอกว่าใครเป็นคนบังคับ
      expect(policies[0]!.name).toBe('admin::hasPermissions')
      expect(policies[0]!.config.actions).toEqual([PERMISSION.publish])
    }
  })
})
