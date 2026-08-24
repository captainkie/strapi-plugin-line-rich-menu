import { describe, expect, it, vi } from 'vitest'
import { registerCron, runTick } from '../server/src/tick.js'
import type { Services } from '../server/src/container.js'
import type { StrapiV5 } from '../server/src/strapi.js'

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
  } as unknown as StrapiV5
  return { strapi, add }
}

/**
 * (Task 19 item 4) ตัวบันทึกการต่ออายุ claim — งานที่วนหลายชุดใน `run()` เดียวต้องเรียกทุกจบชุด
 * ไม่งั้น tick นาทีถัดไป claim แถวเดิมซ้ำแล้ววิ่งซ้อนกับตัวเอง
 */
function recordingHeartbeat() {
  const calls: [string, string][] = []
  return {
    calls,
    fn: async (scheduleId: string, owner: string) => { calls.push([scheduleId, owner]); return true },
  }
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
      members: emptyRepo() as never,
      audit: { write: vi.fn(), around: vi.fn() } as never,
      limiter: {} as never,
      store: {} as never,
      lock: { claim: vi.fn(), heartbeat: vi.fn(), release: vi.fn() },
      clientFor: vi.fn(),
      // ไม่ถูกเรียกในเทสต์ชุดนี้ (runTick ไม่แตะ saveMenu) — ใส่ไว้ให้ตรงกับ Services เฉย ๆ
      transaction: async (fn) => fn(),
    }
  }

  it('รายงานที่จบปกติ log ผ่าน services.logger.debug ไม่ใช่ strapi.log.debug', async () => {
    const strapi = { log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as unknown as StrapiV5
    const services = fakeServices()

    const report = await runTick(strapi, services)

    expect(report).toEqual({ due: 0, claimed: 0, done: 0, failed: 0 })
    expect(services.logger.debug).toHaveBeenCalledWith('line-rich-menu: scheduler tick finished', report)
    expect(strapi.log.debug).not.toHaveBeenCalled()
  })
})

describe('runTick', () => {
  /**
   * ฉบับร่างเดิมของเทสต์นี้ให้ `schedules.findMany` คืน `[]` เสมอ แปลว่าไม่มีงานถึงกำหนดเลย
   * สักงาน — `createScheduler.tick()` จะไม่เรียก `clientFor` เลยในเคสนั้น (ดู
   * packages/core/src/server/scheduler.ts: client ถูกประกอบตอนเดินงานที่ due เท่านั้น)
   * asserting `clients` มีสองรายการพร้อมกับ `report.due === 0` จึงเป็นข้อเรียกร้องที่ขัดกันเอง
   * ไม่มีทางเขียว — นี่คือกรณี "fixture พิสูจน์สิ่งที่มันอ้างไม่ได้" (STANDING-CORRECTIONS S5)
   * ไม่ใช่ product ผิด เพราะพฤติกรรม "client ต่อ channel ต่องาน" มีเทสต์ระดับ core ปกป้องอยู่แล้ว
   * ที่ scheduler.test.ts describe('tick กับหลาย channel') ด้วยฟิกซ์เจอร์ที่มีงานถึงกำหนดจริง
   *
   * แก้ตรงนี้โดยให้มีสอง schedule ที่ถึงกำหนดจริง คนละเมนู คนละ channel — พิสูจน์ว่าการต่อสาย
   * ของ v5 adapter (tick.ts → container.ts) ส่ง channel ของแต่ละงานลงไปที่ `services.clientFor`
   * จริง ไม่ใช่ยิงด้วย channel เดียวซ้ำทุกงาน
   */
  it('ประกอบ client ตาม channel ของแต่ละงาน ไม่ใช่ channel เริ่มต้นของระบบ', async () => {
    const clients: string[] = []
    const menuByRichMenuId: Record<string, { channelId: string }> = {
      m1: { channelId: 'ch1' },
      m2: { channelId: 'ch2' },
    }
    const dueRows = [
      { id: 's1', richMenuId: 'm1', runAt: '2020-01-01T00:00:00.000Z', op: 'clear-default' as const, state: 'pending' as const, lockedBy: null, lockedAt: null, lastError: null },
      { id: 's2', richMenuId: 'm2', runAt: '2020-01-01T00:00:00.000Z', op: 'clear-default' as const, state: 'pending' as const, lockedBy: null, lockedAt: null, lastError: null },
    ]
    const heartbeat = recordingHeartbeat()
    const services = {
      channels: {
        withSecrets: () => ({
          findOne: async (id: string) => ({ id, channelAccessToken: `token-${id}` }),
        }),
      },
      clientFor: (channel: { channelAccessToken: string }) => {
        clients.push(channel.channelAccessToken)
        return {} as never
      },
      schedules: {
        findMany: async (params?: { filters?: { state?: string } }) =>
          params?.filters?.state === 'pending' ? dueRows : [],
      },
      // (Task 19 item 4) งานที่วนหลายชุดต่ออายุ claim ทุกจบชุด — บันทึกไว้เพื่อพิสูจน์ว่า
      // adapter เดินผ่าน lock ตัวจริงของ services ไม่ใช่ของที่ scheduler ประกอบเอง
      lock: { claim: async () => true, heartbeat: heartbeat.fn, release: async () => undefined },
      menus: { findOne: async (id: string) => menuByRichMenuId[id] ?? null },
      audit: { write: async () => undefined, around: async (_ctx: unknown, fn: () => Promise<unknown>) => fn() },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    }
    const strapi = { log: { debug: vi.fn(), error: vi.fn() } } as unknown as StrapiV5

    const report = await runTick(strapi, services as never)

    // ระบบที่มีหลาย OA จะยิงเมนูของ OA หนึ่งด้วย token ของอีก OA หนึ่งถ้าข้อนี้ผิด
    expect(clients).toEqual(['token-ch1', 'token-ch2'])
    // claim สำเร็จทั้งคู่ — การที่ op หลังจากนั้นจะ done หรือ failed ไม่ใช่สิ่งที่เทสต์นี้ตรวจ
    // (นั่นเป็นหน้าที่ของ scheduler.test.ts ฝั่ง core) เทสต์นี้ตรวจแค่ว่า client ไหนถูกขอ
    expect(report.due).toBe(2)
    expect(report.claimed).toBe(2)
  })

  /**
   * Task 5 ต่อสาย `members: services.members` เข้า ops ของ scheduler — Task 4 (core) ตั้งใจ
   * โยน "adapter did not wire it in" ทันทีถ้างาน link-members เข้ามาแต่ ops.members เป็น
   * undefined (ดูคอมเมนต์ที่ SchedulerOps.members ใน core/server/scheduler.ts) เทสต์นี้พิสูจน์
   * ว่า v5 ปิดช่องว่างนั้นแล้วจริง ๆ ไม่ใช่แค่ typecheck ผ่านเพราะ tick.ts ใส่คีย์ไว้เฉย ๆ —
   * รัน end-to-end ผ่าน core จริง (ไม่ mock createScheduler) แล้วเช็คว่า bulkLink/update ถูกเรียก
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

    const heartbeat = recordingHeartbeat()
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
      // (Task 19 item 4) งานที่วนหลายชุดต่ออายุ claim ทุกจบชุด — บันทึกไว้เพื่อพิสูจน์ว่า
      // adapter เดินผ่าน lock ตัวจริงของ services ไม่ใช่ของที่ scheduler ประกอบเอง
      lock: { claim: async () => true, heartbeat: heartbeat.fn, release: async () => undefined },
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
    const strapi = { log: { debug: vi.fn(), error: vi.fn() } } as unknown as StrapiV5

    const report = await runTick(strapi, services as never)

    expect(report).toMatchObject({ due: 1, claimed: 1, done: 1, failed: 0 })
    expect(bulkLinkCalls).toEqual([{ richMenuId: 'line-rm-1', userIds: [`U${'a'.repeat(32)}`] }])
    expect(updateCalls).toHaveLength(1)
    // (Task 19 item 4) หนึ่งชุด = ต่ออายุ claim หนึ่งครั้ง ด้วย scheduleId/owner ของงานนั้นจริง ๆ
    expect(heartbeat.calls).toEqual([['sc1', expect.any(String)]])
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
    // (review-19 M1) งานที่หยุดเพราะ pointer ขยับตั้งงาน unlink-members แถวใหม่ไว้กวาดคนที่อาจ
    // ผูกไปแล้วก่อนจะรู้ตัว — บันทึกไว้พิสูจน์ว่า adapter ต่อสาย schedules.create ของจริงเข้ามาด้วย
    const createdRows: Record<string, unknown>[] = []

    const heartbeat = recordingHeartbeat()
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
        create: async (data: Record<string, unknown>) => { createdRows.push(data); return { id: 'new', ...data } },
      },
      // (Task 19 item 4) งานที่วนหลายชุดต่ออายุ claim ทุกจบชุด — บันทึกไว้เพื่อพิสูจน์ว่า
      // adapter เดินผ่าน lock ตัวจริงของ services ไม่ใช่ของที่ scheduler ประกอบเอง
      lock: { claim: async () => true, heartbeat: heartbeat.fn, release: async () => undefined },
      // (review-19 M1) `id` ต้องมีด้วย — งานที่หยุดกลางทางตั้งงาน unlink-members ใหม่โดยอ้าง
      // `menu.id` (ไม่ใช่ `lineRichMenuId`) เป็น `richMenuId` ของแถว schedule ตามธรรมเนียมเดิม
      menus: { findOne: async (id: string) => (id === 'm1' ? { id: 'm1', channelId: 'ch1', lineRichMenuId: 'line-rm-1' } : null) },
      members: {
        findMany: async () => [
          { id: 'mem1', channelId: 'ch1', lineUserId: `U${'a'.repeat(32)}`, displayName: null, linkedRichMenuId: null, linkedAt: null },
        ],
        update: async () => undefined,
      },
      audit: { write: async () => undefined, around: async (_ctx: unknown, fn: () => Promise<unknown>) => fn() },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    }
    const strapi = { log: { debug: vi.fn(), error: vi.fn() } } as unknown as StrapiV5

    const report = await runTick(strapi, services as never)

    expect(report).toMatchObject({ due: 1, claimed: 1, done: 1, failed: 0 })
    expect(bulkLinkCalls).toEqual([])
    // อ่าน pointer ของ channel ที่เมนูสังกัดจริง ไม่ใช่ channel อื่นหรือค่าคงที่
    expect(pointerReads).toEqual(['ch1'])
    // (review-19 M1) หยุดตั้งแต่เช็คแรก (ยังไม่ทันวิ่งชุดไหนเลย) ก็ยังต้องตั้งงาน unlink-members
    // สำรองไว้ — เป็น idempotent sweep ที่จบด้วยชุดว่างทันทีถ้าไม่มีอะไรให้กวาดจริง ไม่ใช่ต้นทุนที่แพง
    expect(createdRows).toEqual([expect.objectContaining({ richMenuId: 'm1', op: 'unlink-members', state: 'pending' })])
  })
})
