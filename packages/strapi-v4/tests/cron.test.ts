import { describe, expect, it, vi } from 'vitest'
import { registerCron } from '../src/server/tick.js'
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
