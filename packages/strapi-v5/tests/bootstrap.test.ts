import { describe, expect, it, vi } from 'vitest'
import { backfillLegacyAudience, bootstrap } from '../server/src/bootstrap.js'
import { UID } from '../server/src/content-types/index.js'
import type { StrapiV5 } from '../server/src/strapi.js'

type Row = { id: number; audience: string | null }

/**
 * query engine ปลอมที่ **ไม่ใจกว้าง** — รองรับเฉพาะรูป where ที่โค้ดจริงส่งมา แล้วโยนทิ้งเมื่อเจอ
 * operator อื่น
 *
 * ของปลอมที่ใจกว้างกว่าของจริงเคยปล่อยบั๊กทั้งตัวผ่านชุดเทสต์นี้มาแล้ว (ดูคอมเมนต์ที่ `applyPopulate`
 * ใน repo.test.ts) ที่นี่ราคาของความใจกว้างคือ: backfill ที่เขียน where ผิดรูปจะ "ทำงาน" กับของปลอม
 * แล้วไม่ทำอะไรเลยกับ `@strapi/database` ตัวจริง โดยที่ไม่มีเทสต์ไหนแดง
 */
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = (row as unknown as Record<string, unknown>)[key]
    if (condition !== null && typeof condition === 'object') {
      const operators = Object.keys(condition as Record<string, unknown>)
      if (operators.length === 1 && operators[0] === '$null') {
        return (value === null) === (condition as { $null: boolean }).$null
      }
      throw new Error(`ของปลอมนี้ไม่ได้ทำ operator ${JSON.stringify(condition)} ไว้`)
    }
    return value === condition
  })
}

/**
 * `rows` ถูกแก้ในที่จริง ๆ ไม่ใช่แค่บันทึกว่ามีการเรียก — เทสต์กลุ่มนี้จึงพูดถึง **ผลกับข้อมูล**
 * ("แถว 'members' ยังเป็น 'members' อยู่ไหม") ได้ตรง ๆ แทนที่จะพูดได้แค่ว่าโค้ดส่งอาร์กิวเมนต์อะไรไป
 */
function fakeStrapi(rows: Row[]) {
  const updateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = rows.filter((row) => matches(row, where))
      for (const row of hit) Object.assign(row, data)
      return { count: hit.length }
    },
  )
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const query = vi.fn(() => ({ updateMany }))
  const subscribe = vi.fn()
  const registerMany = vi.fn(async () => {})
  const strapi = {
    log,
    // scheduler ปิดไว้เพื่อให้ `registerCron` จบโดยไม่ต้องมี `cron` ในของปลอม — เทสต์ชุดนี้
    // ไม่ได้พูดถึง cron และการต้องประกอบมันขึ้นมาจะทำให้ของปลอมโตกว่าที่พิสูจน์อะไรได้จริง
    config: { get: <T>() => ({ scheduler: { enabled: false } }) as unknown as T },
    db: { query, lifecycles: { subscribe } },
    admin: { services: { permission: { actionProvider: { registerMany } } } },
  } as unknown as StrapiV5
  return { strapi, rows, log, query, updateMany, registerMany, subscribe }
}

const messageOf = (call: unknown[] | undefined): string => String(call?.[0])

/**
 * Task 16 ครึ่งที่สอง — ครึ่งแรกคือการแปลงตอนอ่านใน repo.ts (repo.test.ts) สองครึ่งนี้ปิดคนละช่อง
 * (backfill ซ่อมแถวที่มีอยู่, การแปลงตอนอ่านครอบแถวที่มาถึงทีหลัง) จึงต้องแดงคนละดวงเสมอ —
 * ไฟล์นี้ไม่แตะ repo เลยสักบรรทัด และ repo.test.ts ไม่แตะ bootstrap เลยสักบรรทัด
 */
describe('backfillLegacyAudience', () => {
  it("เติม 'all' ให้เฉพาะแถวที่เป็น NULL — 'members' และ 'all' เดิมต้องไม่ถูกแตะ", async () => {
    const { strapi, rows } = fakeStrapi([
      { id: 1, audience: null },
      { id: 2, audience: 'members' },
      { id: 3, audience: 'all' },
      { id: 4, audience: null },
    ])

    await backfillLegacyAudience(strapi)

    expect(rows).toEqual([
      { id: 1, audience: 'all' },
      { id: 2, audience: 'members' },
      { id: 3, audience: 'all' },
      { id: 4, audience: 'all' },
    ])
  })

  it('ยิงไปที่ uid ของเมนู ไม่ใช่ content type อื่นของปลั๊กอิน', async () => {
    const { strapi, query } = fakeStrapi([{ id: 1, audience: null }])
    await backfillLegacyAudience(strapi)
    expect(query).toHaveBeenCalledWith(UID.menu)
  })

  it('log จำนวนแถวที่แก้จริง — backfill ที่เงียบแยกไม่ออกจาก backfill ที่ไม่เจออะไร', async () => {
    const { strapi, log } = fakeStrapi([
      { id: 1, audience: null },
      { id: 2, audience: 'members' },
      { id: 3, audience: null },
    ])

    await backfillLegacyAudience(strapi)

    expect(log.info).toHaveBeenCalledTimes(1)
    // 'updated 2 ' ไม่ใช่แค่ '2' — เลข 2 ลอย ๆ ไปตรงกับอะไรก็ได้ในข้อความ
    expect(messageOf(log.info.mock.calls[0])).toContain('updated 2 ')
    expect(log.error).not.toHaveBeenCalled()
  })

  it('บูตรอบสองแก้ 0 แถว และรายงานว่า 0 — ไม่ใช่เงียบไปเฉย ๆ', async () => {
    const { strapi, rows, log } = fakeStrapi([
      { id: 1, audience: null },
      { id: 2, audience: 'members' },
    ])

    await backfillLegacyAudience(strapi)
    const afterFirst = structuredClone(rows)
    await backfillLegacyAudience(strapi)

    expect(rows).toEqual(afterFirst)
    expect(messageOf(log.info.mock.calls[0])).toContain('updated 1 ')
    expect(messageOf(log.info.mock.calls[1])).toContain('updated 0 ')
  })

  it('ล้มแล้วต้องไม่ล้มการบูต และ log ต้องบอกว่า *ผลคืออะไร* ไม่ใช่แค่ว่ามันล้ม', async () => {
    const { strapi, log, updateMany } = fakeStrapi([{ id: 1, audience: null }])
    updateMany.mockRejectedValue(new Error('SQLITE_BUSY: database is locked'))

    await expect(backfillLegacyAudience(strapi)).resolves.toBeUndefined()

    expect(log.info).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledTimes(1)
    const [message, cause] = log.error.mock.calls[0]!
    // อาการที่ผู้ใช้จะเจอจริง ต้องอยู่ในข้อความ ไม่ใช่แค่ชื่อ error ของ knex
    expect(String(message)).toContain('validation_failed')
    expect(String(message)).toContain('Boot continues')
    // ต้นเหตุจริงต้องยังติดไปด้วย — ผ่าน createScrubbedLogger จึงเหลือรูป { name, message }
    expect(cause).toMatchObject({ message: 'SQLITE_BUSY: database is locked' })
  })
})

describe('bootstrap', () => {
  /**
   * ด่านต่อสาย — ไม่ใช่ด่านซ้ำกับข้างบน `backfillLegacyAudience` ที่ถูกต้องทุกประการแต่ไม่มีใคร
   * เรียก คือรูปแบบความล้มเหลวที่ชุดเทสต์ข้างบนมองไม่เห็นเลยสักตัว
   */
  it('เรียก backfill จริงตอนบูต ไม่ใช่ประกาศฟังก์ชันทิ้งไว้เฉย ๆ', async () => {
    const { strapi, rows, registerMany, subscribe } = fakeStrapi([{ id: 1, audience: null }])

    await bootstrap({ strapi })

    expect(rows[0]!.audience).toBe('all')
    // สามอย่างที่ bootstrap เคยทำอยู่แล้วต้องไม่หายไปเพราะการเพิ่มของใหม่
    expect(registerMany).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('backfill ที่ล้มต้องไม่กันการลงทะเบียนสิทธิ์/lifecycle และต้องไม่โยนออกไปหา Strapi', async () => {
    const { strapi, updateMany, registerMany, subscribe } = fakeStrapi([{ id: 1, audience: null }])
    updateMany.mockRejectedValue(new Error('relation "rich_menus" does not exist'))

    await expect(bootstrap({ strapi })).resolves.toBeUndefined()

    expect(registerMany).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })
})
