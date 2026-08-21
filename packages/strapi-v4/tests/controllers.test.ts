import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LineAuthError, PublishRateLimitedError, ValidationError } from '@fosivo/line-rich-menu-core'
import { controllers } from '../src/server/controllers/index.js'
import { toHttpError } from '../src/server/http-error.js'
import type { AdminContext } from '../src/server/http-error.js'

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

/** strapi ปลอมที่มีเฉพาะสิ่งที่ controller เดินผ่านจริง */
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
        findMany: async (uid: string) => rows[uid] ?? [],
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

describe('toHttpError', () => {
  it('แปลง code ของ core เป็นสถานะ HTTP ที่ตรงความหมาย และไม่ส่ง message ดิบขึ้นไป', () => {
    const cases: [unknown, number, string][] = [
      [new ValidationError('x', [{ path: 'name', code: 'too_small', message: 'too small' }]), 400, 'validation_failed'],
      [new PublishRateLimitedError(1500), 429, 'publish_rate_limited'],
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
