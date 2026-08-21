import { describe, expect, it, vi } from 'vitest'
import { LineServerError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import { createScheduler } from '../../src/server/scheduler.js'
import type { AuditRow, Repo, RichMenuRow, ScheduleRow } from '../../src/server/types.js'

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const NOW = new Date('2026-08-21T12:00:00.000Z')

function scheduleRow(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 's1', richMenuId: '1', runAt: '2026-08-21T11:00:00.000Z', op: 'set-default',
    state: 'pending', lockedBy: null, lockedAt: null, lastError: null,
    ...overrides,
  }
}

function menuRow(overrides: Partial<RichMenuRow> = {}): RichMenuRow {
  return {
    id: '1', name: 'เมนูหลัก', channelId: '10', size: 'large',
    chatBarText: 'x', chatBarMode: 'custom', selected: true, templateKey: null, areas: [],
    imageFileId: null, areaImages: [],
    normalizedFileId: 900, normalizedMime: 'image/jpeg', normalizedSize: { width: 2500, height: 1686 },
    aliasId: 'tab-a', status: 'published', lineRichMenuId: 'richmenu-a',
    publishedAt: null, lastError: null, updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

function listRepo<T extends { id: string; state?: string }>(rows: T[]): Repo<T> {
  return {
    async findMany(params) {
      const filters = params?.filters ?? {}
      return rows.filter((row) => Object.entries(filters).every(
        ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
      ))
    },
    async findOne(id) { return rows.find((row) => row.id === id) ?? null },
    async create(data) { const row = { id: 'new', ...data } as T; rows.push(row); return row },
    async update(id, data) {
      const index = rows.findIndex((row) => row.id === id)
      rows[index] = { ...rows[index]!, ...data }
      return rows[index]!
    },
    async delete() {},
  }
}

function harness(schedules: ScheduleRow[], menus: RichMenuRow[], claim = async () => true) {
  const auditRows: AuditRow[] = []
  const lock = { claim: vi.fn(claim), release: vi.fn(async () => {}) }
  const line = {
    setDefault: vi.fn(async () => {}),
    clearDefault: vi.fn(async () => {}),
    getDefault: vi.fn(async () => null as string | null),
    getAlias: vi.fn(async () => null as string | null),
    createAlias: vi.fn(async () => {}),
    updateAlias: vi.fn(async () => {}),
    listRichMenus: vi.fn(async () => []),
  }
  const auditRepo: Repo<AuditRow> = {
    async findMany() { return auditRows },
    async findOne() { return null },
    async create(data) { const row = { id: String(auditRows.length + 1), ...data } as AuditRow; auditRows.push(row); return row },
    async update() { throw new Error('append-only') },
    async delete() { throw new Error('append-only') },
  }
  const scheduler = createScheduler({
    schedules: listRepo(schedules),
    lock,
    ops: {
      client: line as never,
      menus: listRepo(menus),
      audit: createAuditWriter({ repo: auditRepo, logger: silent }),
    },
    logger: silent,
    now: () => NOW,
    owner: 'worker-a',
  })
  return { scheduler, lock, line, auditRows }
}

describe('tick', () => {
  it('ทำเฉพาะงานที่ถึงเวลาแล้ว', async () => {
    const { scheduler, lock } = harness(
      [scheduleRow({ id: 's1' }), scheduleRow({ id: 's2', runAt: '2026-08-21T13:00:00.000Z' })],
      [menuRow()],
    )
    const report = await scheduler.tick()
    expect(report.due).toBe(1)
    expect(lock.claim).toHaveBeenCalledTimes(1)
    expect(lock.claim).toHaveBeenCalledWith('s1', 'worker-a')
  })

  it('แย่ง lock ไม่ได้ = ข้ามไป ไม่ใช่ทำซ้ำ', async () => {
    const { scheduler, line } = harness([scheduleRow()], [menuRow()], async () => false)
    const report = await scheduler.tick()
    expect(report.claimed).toBe(0)
    expect(line.setDefault).not.toHaveBeenCalled()
  })

  it('รวมแถวที่ค้างสถานะ running เข้ามาด้วย — worker ที่ตายกลางทางต้องถูกเก็บกวาด', async () => {
    const { scheduler, lock } = harness(
      [scheduleRow({ id: 's-stuck', state: 'running', lockedBy: 'worker-dead', lockedAt: '2026-08-21T11:00:00.000Z' })],
      [menuRow()],
    )
    await scheduler.tick()
    expect(lock.claim).toHaveBeenCalledWith('s-stuck', 'worker-a')
  })

  it('เลือก op ให้ถูกตัว', async () => {
    const { scheduler, line } = harness(
      [
        scheduleRow({ id: 's1', op: 'set-default' }),
        scheduleRow({ id: 's2', op: 'clear-default' }),
        scheduleRow({ id: 's3', op: 'swap-alias' }),
      ],
      [menuRow()],
    )
    await scheduler.tick()
    expect(line.setDefault).toHaveBeenCalledWith('richmenu-a')
    expect(line.clearDefault).toHaveBeenCalled()
    expect(line.createAlias).toHaveBeenCalledWith('tab-a', 'richmenu-a')
  })

  it('สำเร็จ → release เป็น done · ล้ม → release เป็น failed พร้อม error code', async () => {
    const { scheduler, lock, line } = harness(
      [scheduleRow({ id: 's1' }), scheduleRow({ id: 's2' })],
      [menuRow()],
    )
    line.setDefault.mockRejectedValueOnce(new LineServerError(503))

    const report = await scheduler.tick()

    expect(lock.release).toHaveBeenCalledWith('s1', 'worker-a', 'failed', 'line_server_error')
    expect(lock.release).toHaveBeenCalledWith('s2', 'worker-a', 'done', null)
    expect(report).toEqual({ due: 2, claimed: 2, done: 1, failed: 1 })
  })

  it('งานที่ล้มไม่หยุดงานที่เหลือในรอบเดียวกัน', async () => {
    const { scheduler, line } = harness(
      [scheduleRow({ id: 's1' }), scheduleRow({ id: 's2' })],
      [menuRow()],
    )
    line.setDefault.mockRejectedValueOnce(new LineServerError(503))
    await scheduler.tick()
    expect(line.setDefault).toHaveBeenCalledTimes(2)
  })

  it('ทุกงานที่รันมีแถว audit — cron ไม่มี actor จึงเป็น null ไม่ใช่ปลอมเป็นใครสักคน', async () => {
    const { scheduler, auditRows } = harness([scheduleRow()], [menuRow()])
    await scheduler.tick()
    expect(auditRows[0]).toMatchObject({ action: 'set-default', actorId: null, result: 'success' })
  })
})
