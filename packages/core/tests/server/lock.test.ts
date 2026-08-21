import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE_TABLE, createScheduleLock } from '../../src/server/lock.js'
import type { KnexLike, KnexQueryBuilder, KnexWhereBuilder } from '../../src/server/lock.js'

interface Recorded { method: string; args: unknown[] }

function recordingKnex(affected: number) {
  const tables: string[] = []
  const calls: Recorded[] = []
  const knex: KnexLike = (table) => {
    tables.push(table)
    const group: KnexWhereBuilder = {
      whereNull(column) { calls.push({ method: 'whereNull', args: [column] }); return group },
      orWhere(column, operator, value) { calls.push({ method: 'orWhere', args: [column, operator, value] }); return group },
    }
    const builder: KnexQueryBuilder = {
      where(column, value) { calls.push({ method: 'where', args: [column, value] }); return builder },
      whereIn(column, values) { calls.push({ method: 'whereIn', args: [column, values] }); return builder },
      andWhere(fn) { calls.push({ method: 'andWhere', args: [] }); fn(group); return builder },
      async update(data) { calls.push({ method: 'update', args: [data] }); return affected },
    }
    return builder
  }
  return { knex, tables, calls }
}

const now = () => new Date('2026-08-21T12:00:00.000Z')

describe('createScheduleLock.claim', () => {
  it('แย่ง lock สำเร็จเมื่อ UPDATE โดน 1 แถว', async () => {
    const { knex } = recordingKnex(1)
    expect(await createScheduleLock(knex, { ttlMs: 300_000, now }).claim('7', 'worker-a')).toBe(true)
  })

  it('ไม่ได้ lock เมื่อ UPDATE ไม่โดนแถวไหนเลย', async () => {
    const { knex } = recordingKnex(0)
    expect(await createScheduleLock(knex, { ttlMs: 300_000, now }).claim('7', 'worker-a')).toBe(false)
  })

  it('ยิงคำสั่งเดียวไปที่ตารางที่ถูกต้อง พร้อมเงื่อนไขครบทั้งสี่ข้อ', async () => {
    const { knex, tables, calls } = recordingKnex(1)
    await createScheduleLock(knex, { ttlMs: 300_000, now }).claim('7', 'worker-a')

    expect(tables).toEqual([DEFAULT_SCHEDULE_TABLE])
    expect(calls.filter((c) => c.method === 'update')).toHaveLength(1)
    expect(calls).toContainEqual({ method: 'where', args: ['id', '7'] })
    expect(calls).toContainEqual({ method: 'whereIn', args: ['state', ['pending', 'running']] })
    expect(calls).toContainEqual({ method: 'whereNull', args: ['locked_by'] })
    expect(calls).toContainEqual({
      method: 'orWhere', args: ['locked_at', '<', new Date('2026-08-21T11:55:00.000Z')],
    })
    expect(calls.at(-1)).toEqual({
      method: 'update',
      args: [{ locked_by: 'worker-a', locked_at: now(), state: 'running' }],
    })
  })

  it('ค่าทุกตัวถูกส่งเป็น binding — ไม่มีคอลัมน์ไหนที่ประกอบมาจากสตริง', async () => {
    const { knex, calls } = recordingKnex(1)
    await createScheduleLock(knex, { ttlMs: 300_000, now }).claim("7'; DROP TABLE x;--", "owner' OR 1=1")

    const columns = calls
      .filter((c) => c.method === 'where' || c.method === 'whereIn' || c.method === 'whereNull' || c.method === 'orWhere')
      .map((c) => c.args[0])
    // ชื่อคอลัมน์ต้องมาจากตารางค่าคงที่เท่านั้น ค่าที่ผู้ใช้ควบคุมได้ไปอยู่ในตำแหน่ง binding
    expect(columns).toEqual(['id', 'state', 'locked_by', 'locked_at'])
    expect(calls).toContainEqual({ method: 'where', args: ['id', "7'; DROP TABLE x;--"] })
  })

  it('ไม่ได้ส่ง now มา → ใช้เวลาปัจจุบันจริงแทน default', async () => {
    const { knex, calls } = recordingKnex(1)
    const before = Date.now()
    await createScheduleLock(knex, { ttlMs: 1000 }).claim('7', 'worker-a')
    const after = Date.now()

    const update = calls.find((c) => c.method === 'update')!
    const lockedAt = (update.args[0] as { locked_at: Date }).locked_at
    expect(lockedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(lockedAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('เปลี่ยนชื่อตารางและคอลัมน์ได้ เผื่อ naming strategy ของ Strapi ต่างจากที่คาด', async () => {
    const { knex, tables, calls } = recordingKnex(1)
    await createScheduleLock(knex, {
      ttlMs: 1000, now, table: 'custom_schedules', columns: { lockedBy: 'lockedBy', lockedAt: 'lockedAt' },
    }).claim('7', 'worker-a')

    expect(tables).toEqual(['custom_schedules'])
    expect(calls).toContainEqual({ method: 'whereNull', args: ['lockedBy'] })
  })
})

describe('createScheduleLock.claim — สองคนแย่งแถวเดียวกันพร้อมกัน', () => {
  // recordingKnex ข้างบนแค่ return ค่า affected คงที่ — พิสูจน์รูปคำสั่งได้ แต่พิสูจน์
  // ไม่ได้ว่า claim ป้องกัน race จริง เพราะมันไม่มีสถานะแถวให้แข่งกันแก้
  // fake นี้จำลองแถวจริงหนึ่งแถว แล้วให้ update() ตัดสินผลจากเงื่อนไขกับสถานะแถวนั้น
  // เพื่อพิสูจน์คุณสมบัติที่ lock มีไว้ป้องกันจริง ๆ: ผู้แข่งสองคนแย่งแถวเดียวกัน ต้องชนะแค่คนเดียว
  interface FakeRow { id: string; state: string; locked_by: string | null; locked_at: Date | null }

  function raceableKnex(row: FakeRow): KnexLike {
    return (table) => {
      expect(table).toBe(DEFAULT_SCHEDULE_TABLE)
      let idWanted: string | undefined
      let statesWanted: string[] | undefined
      let nullColumn: string | undefined
      let expiry: { column: string; before: Date } | undefined
      const group: KnexWhereBuilder = {
        whereNull(column) { nullColumn = column; return group },
        orWhere(column, _operator, value) { expiry = { column, before: value as Date }; return group },
      }
      const builder: KnexQueryBuilder = {
        where(column, value) { if (column === 'id') idWanted = value as string; return builder },
        whereIn(column, values) { if (column === 'state') statesWanted = values as string[]; return builder },
        andWhere(fn) { fn(group); return builder },
        async update(data) {
          if (row.id !== idWanted) return 0
          if (statesWanted && !statesWanted.includes(row.state)) return 0
          const unlocked = nullColumn === 'locked_by' && row.locked_by === null
          const expired = expiry !== undefined && row.locked_at !== null && row.locked_at < expiry.before
          if (!unlocked && !expired) return 0
          // การเช็คเงื่อนไขกับการเขียนอยู่ในฟังก์ชันเดียวกันแบบ synchronous — จำลองว่า UPDATE
          // จริงเป็นหนึ่ง atomic operation ไม่มีช่องให้อีกฝ่ายแทรกระหว่างเช็คกับเขียน
          row.locked_by = data.locked_by as string
          row.locked_at = data.locked_at as Date
          row.state = data.state as string
          return 1
        },
      }
      return builder
    }
  }

  it('ผู้แข่งสองคนเรียก claim พร้อมกัน มีผู้ชนะแค่คนเดียว', async () => {
    const row: FakeRow = { id: '7', state: 'pending', locked_by: null, locked_at: null }
    const lock = createScheduleLock(raceableKnex(row), { ttlMs: 300_000, now })

    const [a, b] = await Promise.all([
      lock.claim('7', 'worker-a'),
      lock.claim('7', 'worker-b'),
    ])

    expect([a, b].filter(Boolean)).toHaveLength(1)
    // ผู้ชนะต้องเป็นคนที่แถวบันทึกไว้จริง ไม่ใช่แค่ตัวเลขบังเอิญตรงกัน
    expect(row.locked_by).toBe(a ? 'worker-a' : 'worker-b')
  })
})

describe('createScheduleLock.release', () => {
  it('ปลดล็อกเฉพาะแถวที่ตัวเองถืออยู่ และเขียนผลลัพธ์ลงไปพร้อมกัน', async () => {
    const { knex, calls } = recordingKnex(1)
    await createScheduleLock(knex, { ttlMs: 1000, now }).release('7', 'worker-a', 'failed', 'line_auth_failed')

    expect(calls).toContainEqual({ method: 'where', args: ['id', '7'] })
    expect(calls).toContainEqual({ method: 'where', args: ['locked_by', 'worker-a'] })
    expect(calls.at(-1)).toEqual({
      method: 'update',
      args: [{ state: 'failed', last_error: 'line_auth_failed', locked_by: null }],
    })
  })
})
