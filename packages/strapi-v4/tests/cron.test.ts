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
      // ไม่มี members ก็คือ scheduler โยน "adapter did not wire it in" ทันทีที่งาน link-members
      // แรกเข้ามา (ดูคอมเมนต์ที่ SchedulerOps.members ใน core/server/scheduler.ts) — tick.ts ของ v4
      // ต้องส่งตัวจริงเข้าไป ไม่ใช่ปล่อยว่างไว้
      members: emptyRepo() as never,
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

describe('runTick', () => {
  /**
   * Task 6 ต่อสาย `members: services.members` เข้า ops ของ scheduler — Task 4 (core) ตั้งใจ
   * โยน "adapter did not wire it in" ทันทีถ้างาน link-members เข้ามาแต่ ops.members เป็น
   * undefined (ดูคอมเมนต์ที่ SchedulerOps.members ใน core/server/scheduler.ts) เทสต์นี้พิสูจน์
   * ว่า v4 ปิดช่องว่างนั้นแล้วจริง ๆ ไม่ใช่แค่ typecheck ผ่านเพราะ tick.ts ใส่คีย์ไว้เฉย ๆ —
   * รัน end-to-end ผ่าน core จริง (ไม่ mock createScheduler) แล้วเช็คว่า bulkLink/update ถูกเรียก
   * id ที่ระดับ service เป็น string เสมอไม่ว่า adapter จะเก็บเป็นตัวเลขจริงหรือไม่ (สเปก §6.2)
   * จึงใช้ string เหมือน v5 ทุกประการ ไม่ต้องแปลงอะไรเพิ่มในเทสต์นี้
   */
  it('งาน link-members วิ่งได้จริงเมื่อ services.members ถูกต่อสายเข้า ops — ไม่โยน adapter-not-wired', async () => {
    const dueRows = [{
      id: 'sc1', richMenuId: 'm1', runAt: '2020-01-01T00:00:00.000Z',
      op: 'link-members' as const, state: 'pending' as const,
      lockedBy: null, lockedAt: null, lastError: null, cursor: null,
    }]
    const memberRows = [
      { id: 'mem1', channelId: 'ch1', lineUserId: `U${'a'.repeat(32)}`, displayName: null, linkedRichMenuId: null, linkedAt: null },
    ]
    const bulkLinkCalls: unknown[] = []
    const updateCalls: unknown[] = []

    const services = {
      channels: {
        withSecrets: () => ({ findOne: async (id: string) => ({ id, channelAccessToken: `token-${id}` }) }),
        // (Task 19 item 5) scheduler ถาม pointer ตัวนี้ก่อนทุกชุด — ของปลอมต้องตอบด้วย **ค่าเดียว
        // กับที่เมนูถืออยู่** ไม่ใช่ค่ากลาง ๆ ไม่งั้นเทสต์ happy path นี้จะพิสูจน์แค่ว่า "ไม่พัง"
        findOne: async (id: string) => ({ id, memberRichMenuId: 'line-rm-1' }),
      },
      clientFor: () => ({ bulkLink: async (richMenuId: string, userIds: string[]) => { bulkLinkCalls.push({ richMenuId, userIds }) } }),
      schedules: {
        findMany: async (params?: { filters?: { state?: string } }) =>
          params?.filters?.state === 'pending' ? dueRows : [],
        update: async () => undefined,
      },
      lock: { claim: async () => true, release: async () => undefined },
      // เมนูของจริงมี lineRichMenuId เสมอเมื่อ publish แล้ว — ของปลอมเดิมไม่มีฟิลด์นี้ ทำให้
      // เทสต์นี้ปักค่า 'm1' (id ของแถวในฐานข้อมูล) ไว้เป็นสิ่งที่ส่งให้ LINE ซึ่งเป็นบั๊กจริงใน
      // scheduler ไม่ใช่พฤติกรรมที่ต้องการ — สิ่งที่ต้องเดินทางไปถึง bulkLink คือ id ที่ LINE ออกให้
      menus: { findOne: async (id: string) => (id === 'm1' ? { channelId: 'ch1', lineRichMenuId: 'line-rm-1' } : null) },
      members: {
        findMany: async () => memberRows,
        update: async (id: string, patch: unknown) => { updateCalls.push({ id, patch }) },
      },
      audit: { write: async () => undefined, around: async (_ctx: unknown, fn: () => Promise<unknown>) => fn() },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    }
    const strapi = { log: { debug: vi.fn(), error: vi.fn() } } as unknown as StrapiV4

    const report = await runTick(strapi, services as never)

    expect(report).toMatchObject({ due: 1, claimed: 1, done: 1, failed: 0 })
    expect(bulkLinkCalls).toEqual([{ richMenuId: 'line-rm-1', userIds: [`U${'a'.repeat(32)}`] }])
    expect(updateCalls).toHaveLength(1)
  })
  /**
   * (Task 19 item 5) ครึ่งที่พิสูจน์ว่า adapter **ต่อสาย `memberRichMenuIdOf` เข้ากับ channel จริง**
   * ไม่ใช่แค่ใส่คีย์ไว้ให้ typecheck ผ่าน — pointer ที่ไม่ตรงต้องทำให้งานหยุดก่อนยิง LINE สักครั้ง
   * ถ้า adapter ต่อสายผิด channel หรือคืนค่าคงที่ ด่านนี้จะเขียวไม่ได้
   */
  it('channel ไม่ได้ชี้มาที่เมนูนี้แล้ว → งาน link-members หยุดโดยไม่ยิง LINE เลย', async () => {
    const dueRows = [{
      id: 'sc1', richMenuId: 'm1', runAt: '2020-01-01T00:00:00.000Z',
      op: 'link-members' as const, state: 'pending' as const,
      lockedBy: null, lockedAt: null, lastError: null, cursor: null,
    }]
    const bulkLinkCalls: unknown[] = []
    const pointerReads: string[] = []

    const services = {
      channels: {
        withSecrets: () => ({ findOne: async (id: string) => ({ id, channelAccessToken: `token-${id}` }) }),
        // ผู้ดูแลกดปิดไปแล้ว — pointer เป็น null ขณะที่แถวงานยังค้างอยู่ในตาราง
        findOne: async (id: string) => { pointerReads.push(id); return { id, memberRichMenuId: null } },
      },
      clientFor: () => ({ bulkLink: async (...args: unknown[]) => { bulkLinkCalls.push(args) } }),
      schedules: {
        findMany: async (params?: { filters?: { state?: string } }) =>
          params?.filters?.state === 'pending' ? dueRows : [],
        update: async () => undefined,
      },
      lock: { claim: async () => true, release: async () => undefined },
      menus: { findOne: async (id: string) => (id === 'm1' ? { channelId: 'ch1', lineRichMenuId: 'line-rm-1' } : null) },
      members: {
        findMany: async () => [
          { id: 'mem1', channelId: 'ch1', lineUserId: `U${'a'.repeat(32)}`, displayName: null, linkedRichMenuId: null, linkedAt: null },
        ],
        update: async () => undefined,
      },
      audit: { write: async () => undefined, around: async (_ctx: unknown, fn: () => Promise<unknown>) => fn() },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    }
    const strapi = { log: { debug: vi.fn(), error: vi.fn() } } as unknown as StrapiV4

    const report = await runTick(strapi, services as never)

    expect(report).toMatchObject({ due: 1, claimed: 1, done: 1, failed: 0 })
    expect(bulkLinkCalls).toEqual([])
    // อ่าน pointer ของ channel ที่เมนูสังกัดจริง ไม่ใช่ channel อื่นหรือค่าคงที่
    expect(pointerReads).toEqual(['ch1'])
  })
})
