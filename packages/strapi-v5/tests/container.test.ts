import { describe, expect, it, vi } from 'vitest'
import { SCHEDULE_ID_COLUMN, getServices } from '../server/src/container.js'
import type { StrapiV5 } from '../server/src/strapi.js'

/**
 * knex ปลอมที่บันทึกชื่อคอลัมน์ที่ถูกอ้างถึงใน `where` ตัวแรก — เทสต์ในไฟล์นี้ไม่ได้สนใจว่า
 * query คืนอะไร แต่สนใจว่า **มันยิงใส่คอลัมน์ไหน**
 */
function fakeKnex() {
  const wheres: [string, unknown][] = []
  const builder = {
    where(column: string, value: unknown) { wheres.push([column, value]); return builder },
    whereIn() { return builder },
    andWhere(group: (b: unknown) => void) {
      group({ whereNull: () => ({ orWhere: () => undefined }) })
      return builder
    },
    async update() { return 1 },
  }
  return { knex: () => builder, wheres }
}

function fakeStrapi(connection: unknown) {
  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {
      get: <T>(path: string, fallback?: T) => {
        if (path === 'plugin.line-rich-menu') return {} as unknown as T
        if (path === 'server.app.keys') return ['app-key-one-that-is-long-enough'] as unknown as T
        return fallback as T
      },
    },
    documents: () => ({}) as never,
    plugin: () => ({ service: () => ({}), contentType: () => ({}) }),
    db: { connection },
    dirs: { static: { public: '/tmp' } },
  } as unknown as StrapiV5
}

describe('getServices', () => {
  it('ประกอบครั้งเดียวต่อหนึ่ง instance แล้วจำไว้ — rate limiter ถือถังไว้ในตัวเอง', () => {
    const { knex } = fakeKnex()
    const strapi = fakeStrapi(knex)
    expect(getServices(strapi)).toBe(getServices(strapi))
  })

  // ไม่มี members ก็คือ scheduler โยน "adapter did not wire it in" ทันทีที่งาน link-members
  // แรกเข้ามา (ดูคอมเมนต์ที่ SchedulerOps.members ใน core/server/scheduler.ts) — tick.ts ของ v5
  // ต้องส่งตัวจริงเข้าไป ไม่ใช่ปล่อยว่างไว้
  it('services.members ถูกประกอบมาด้วย ไม่ใช่ undefined', () => {
    const { knex } = fakeKnex()
    const services = getServices(fakeStrapi(knex))
    expect(services.members).toBeDefined()
    expect(typeof services.members.findMany).toBe('function')
  })

  it('strapi คนละตัวได้ services คนละชุด ไม่ปนกัน', () => {
    const a = fakeStrapi(fakeKnex().knex)
    const b = fakeStrapi(fakeKnex().knex)
    expect(getServices(a)).not.toBe(getServices(b))
  })
})

/**
 * ด่านที่แพงที่สุดในไฟล์นี้ และเป็นข้อที่โน้ตส่งต่อของ Plan 03 มองข้าม
 *
 * `lock.ts` ใน core ย้ายมาใช้กับ v5 ได้จริงโดยไม่ต้องแก้สักบรรทัด — แต่ **การต่อสายเข้ากับมัน
 * ย้ายมาไม่ได้** เพราะ `ScheduleRow.id` ของ v5 คือ `documentId` ส่วน lock query ยิงผ่าน knex
 * ตรง ๆ ซึ่งมองเห็นแค่คอลัมน์ในตาราง ค่าเริ่มต้นของ `ScheduleLockColumns.id` คือ `'id'` ซึ่งเป็น
 * primary key ตัวเลข การส่ง documentId เข้าไปเทียบกับคอลัมน์นั้นได้ผลลัพธ์เดียวเสมอคือ
 * `affected === 0` แปลว่า **claim ไม่เคยสำเร็จเลยสักครั้ง** ทุกงานที่ตั้งเวลาไว้จะถูกข้ามเงียบ ๆ
 * ทุกนาที โดยที่ `tick` รายงาน `{ due: n, claimed: 0 }` ซึ่งอ่านเหมือนระบบทำงานปกติ
 *
 * บน sqlite `where id = 'kx91...'` ไม่ error ด้วยซ้ำ — มันแค่ไม่ตรงอะไรเลย
 */
describe('scheduler lock', () => {
  it('claim ยิงใส่คอลัมน์ document_id ไม่ใช่ id', async () => {
    const { knex, wheres } = fakeKnex()
    const services = getServices(fakeStrapi(knex))
    await services.lock.claim('kx91p2m4c7v0b8n3q5r6t7y8', 'host:1')
    expect(wheres[0]).toEqual([SCHEDULE_ID_COLUMN, 'kx91p2m4c7v0b8n3q5r6t7y8'])
    expect(SCHEDULE_ID_COLUMN).toBe('document_id')
  })

  it('release ยิงใส่คอลัมน์เดียวกัน', async () => {
    const { knex, wheres } = fakeKnex()
    const services = getServices(fakeStrapi(knex))
    await services.lock.release('kx91p2m4c7v0b8n3q5r6t7y8', 'host:1', 'done', null)
    expect(wheres[0]![0]).toBe(SCHEDULE_ID_COLUMN)
  })
})
