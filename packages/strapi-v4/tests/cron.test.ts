import { describe, expect, it, vi } from 'vitest'
import { registerCron, runTick } from '../src/server/tick.js'
import type { Services } from '../src/server/container.js'
import type { StrapiV4 } from '../src/server/strapi.js'

function fakeStrapi(pluginConfig: Record<string, unknown>) {
  const add = vi.fn()
  const strapi = {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {
      get: <T>(path: string, fallback?: T) => {
        if (path === 'plugin.line-rich-menu') return pluginConfig as unknown as T
        if (path === 'server.app.keys') return ['app-key-one'] as unknown as T
        return fallback as T
      },
    },
    cron: { add },
  } as unknown as StrapiV4
  return { strapi, add }
}

describe('registerCron', () => {
  it('ลงทะเบียนงานตาม cron expression ที่ config กำหนด', () => {
    const { strapi, add } = fakeStrapi({ scheduler: { enabled: true, cron: '*/5 * * * *', lockTtlMs: 60000 } })
    registerCron(strapi)
    expect(add).toHaveBeenCalledTimes(1)
    expect(Object.keys(add.mock.calls[0]![0] as object)).toEqual(['*/5 * * * *'])
  })

  it('ไม่ลงทะเบียนเลยเมื่อปิด scheduler — คนที่รันหลาย instance ยิง /schedules/tick เอง (สเปก §10)', () => {
    const { strapi, add } = fakeStrapi({ scheduler: { enabled: false, cron: '* * * * *', lockTtlMs: 60000 } })
    registerCron(strapi)
    expect(add).not.toHaveBeenCalled()
  })

  it('งานที่ลงทะเบียนไว้ต้องไม่โยน error ออกไปหา cron runner ถ้า tick ล้ม', async () => {
    const { strapi, add } = fakeStrapi({ scheduler: { enabled: true, cron: '* * * * *', lockTtlMs: 60000 } })
    registerCron(strapi)
    const job = Object.values(add.mock.calls[0]![0] as Record<string, () => Promise<void>>)[0]!
    // ไม่มี db.connection ในของปลอมชุดนี้ → getServices จะโยน ซึ่งเป็นเคสที่ต้องถูกกลืนและ log
    await expect(job()).resolves.toBeUndefined()
    expect((strapi.log.error as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
  })
})

/**
 * I1 — `tick.ts` เคยยิง `strapi.log` ตรง ๆ สองจุด ข้าม `createScrubbedLogger` ที่ container.ts
 * ประกอบไว้ให้ สเปก §11.2 บังคับว่าการกรองต้องครอบทุก log level ไม่ใช่แค่ตอน error
 */
describe('runTick — log ต้องผ่าน services.logger ที่ scrub แล้ว ไม่ใช่ strapi.log ตรง ๆ', () => {
  function emptyRepo() {
    return { findMany: vi.fn(async () => []), findOne: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
  }

  function fakeServices(): Services {
    return {
      config: {} as never,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      channels: { withSecrets: () => ({ findOne: vi.fn(), findDefault: vi.fn() }) } as never,
      menus: emptyRepo() as never,
      schedules: emptyRepo() as never,
      audit: { write: vi.fn(), around: vi.fn() } as never,
      limiter: {} as never,
      store: {} as never,
      lock: { claim: vi.fn(), release: vi.fn() },
      clientFor: vi.fn(),
    }
  }

  it('รายงานที่จบปกติ log ผ่าน services.logger.debug ไม่ใช่ strapi.log.debug', async () => {
    const strapi = { log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as unknown as StrapiV4
    const services = fakeServices()

    const report = await runTick(strapi, services)

    expect(report).toEqual({ due: 0, claimed: 0, done: 0, failed: 0 })
    expect(services.logger.debug).toHaveBeenCalledWith('line-rich-menu: scheduler tick finished', report)
    expect(strapi.log.debug).not.toHaveBeenCalled()
  })
})
