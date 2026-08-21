/**
 * type ขั้นต่ำของ knex ที่ lock ตัวนี้ใช้จริง — ประกาศเองแทนการ `import type { Knex } from 'knex'`
 * เพราะ `core` ต้องไม่มี dependency ที่ผูกกับ Strapi หรือกับ ORM ตัวใดตัวหนึ่ง
 *
 * สังเกตว่า **ไม่มี `raw`** อยู่ใน interface นี้ — สเปก §11.3 บังคับว่าทุก query ต้องใช้ binding
 * เท่านั้น "ห้าม string interpolation แม้แต่ใน lock query" การไม่ประกาศ `raw` ทำให้กฎข้อนั้น
 * บังคับได้ตอนคอมไพล์ ไม่ใช่ตอนรีวิว
 */
export interface KnexWhereBuilder {
  whereNull(column: string): KnexWhereBuilder
  orWhere(column: string, operator: string, value: unknown): KnexWhereBuilder
}

export interface KnexQueryBuilder {
  where(column: string, value: unknown): KnexQueryBuilder
  whereIn(column: string, values: readonly unknown[]): KnexQueryBuilder
  andWhere(group: (builder: KnexWhereBuilder) => void): KnexQueryBuilder
  /** คืนจำนวนแถวที่ถูกแก้ — เท่ากันทุก dialect ที่ Strapi รองรับ */
  update(data: Record<string, unknown>): Promise<number>
}

export type KnexLike = (table: string) => KnexQueryBuilder

export interface ScheduleLockColumns {
  id: string
  state: string
  lockedBy: string
  lockedAt: string
  lastError: string
}

/** ต้องตรงกับ `collectionName` ของ content type `rich-menu-schedule` (Task 14) */
export const DEFAULT_SCHEDULE_TABLE = 'rich_menu_schedules'

const DEFAULT_COLUMNS: ScheduleLockColumns = {
  id: 'id', state: 'state', lockedBy: 'locked_by', lockedAt: 'locked_at', lastError: 'last_error',
}

export interface ScheduleLock {
  claim(scheduleId: string, owner: string): Promise<boolean>
  release(scheduleId: string, owner: string, state: 'done' | 'failed', lastError: string | null): Promise<void>
}

export function createScheduleLock(
  knex: KnexLike,
  options: { table?: string; ttlMs: number; now?: () => Date; columns?: Partial<ScheduleLockColumns> },
): ScheduleLock {
  const table = options.table ?? DEFAULT_SCHEDULE_TABLE
  const now = options.now ?? (() => new Date())
  const column = { ...DEFAULT_COLUMNS, ...options.columns }

  return {
    async claim(scheduleId, owner) {
      const at = now()
      // เส้นตายคำนวณใน JS ไม่ใช่ `NOW() - INTERVAL '5 minutes'` ตามตัวอย่างในสเปก §10 —
      // `INTERVAL` เป็นไวยากรณ์ของ Postgres และ acceptance gate ของแผนนี้รันบน sqlite
      // ส่ง Date เข้าไปเป็น binding แทน ทำงานเหมือนกันทุก dialect ที่ Strapi รองรับ
      const cutoff = new Date(at.getTime() - options.ttlMs)

      const affected = await knex(table)
        .where(column.id, scheduleId)
        .whereIn(column.state, ['pending', 'running'])
        .andWhere((builder) => { builder.whereNull(column.lockedBy).orWhere(column.lockedAt, '<', cutoff) })
        .update({ [column.lockedBy]: owner, [column.lockedAt]: at, [column.state]: 'running' })

      // === 1 ไม่ใช่ > 0 — ถ้าโดนมากกว่าหนึ่งแถวแปลว่าเงื่อนไขกว้างเกินไป ซึ่งเป็นบั๊ก
      // ที่ต้องไม่ถูกตีความว่า "ได้ lock แล้ว" (สเปก §10: "ตรวจ affected rows = 1")
      return affected === 1
    },

    async release(scheduleId, owner, state, lastError) {
      // `where lockedBy = owner` กันไม่ให้ worker ที่ถูกแย่ง lock ไปแล้วมาเขียนทับผลของคนที่ถืออยู่
      await knex(table)
        .where(column.id, scheduleId)
        .where(column.lockedBy, owner)
        .update({ [column.state]: state, [column.lastError]: lastError, [column.lockedBy]: null })
    },
  }
}
