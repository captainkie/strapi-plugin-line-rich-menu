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

/**
 * client หนึ่งตัวต่อหนึ่ง channel — ของปลอมชุดเดิมมี client ตัวเดียวใช้ร่วมกันทั้งไฟล์ ซึ่งแปลว่า
 * "งานของ channel นี้ยิงด้วย token ของ channel ไหน" เป็นคำถามที่ถามไม่ได้เลย และนั่นคือเหตุผล
 * เดียวที่ scheduler ซึ่งรันทุกงานด้วย client ตัวแรกตัวเดียวผ่านมาได้ทั้งชุด
 */
function fakeLine() {
  return {
    setDefault: vi.fn(async () => {}),
    clearDefault: vi.fn(async () => {}),
    getDefault: vi.fn(async () => null as string | null),
    getAlias: vi.fn(async () => null as string | null),
    createAlias: vi.fn(async () => {}),
    updateAlias: vi.fn(async () => {}),
    listRichMenus: vi.fn(async () => []),
  }
}

function harness(schedules: ScheduleRow[], menus: RichMenuRow[], claim = async () => true) {
  const auditRows: AuditRow[] = []
  const lock = { claim: vi.fn(claim), release: vi.fn(async () => {}) }
  const lines = new Map<string, ReturnType<typeof fakeLine>>()
  // จำไว้ต่อ channel เพื่อให้เทสต์หยิบ "client ของ channel นั้น" กลับมาตรวจได้หลัง tick จบ
  // channel ที่ไม่เคยถูกขอเลยจะได้ของใหม่เอี่ยมที่ไม่มีการเรียกใด ๆ ซึ่งก็เป็นคำตอบที่ถูกต้อง
  const lineFor = (channelId: string) => {
    const existing = lines.get(channelId)
    if (existing !== undefined) return existing
    const created = fakeLine()
    lines.set(channelId, created)
    return created
  }
  const clientFor = vi.fn(async (channelId: string) => lineFor(channelId) as never)
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
      menus: listRepo(menus),
      audit: createAuditWriter({ repo: auditRepo, logger: silent }),
      clientFor,
    },
    logger: silent,
    now: () => NOW,
    owner: 'worker-a',
  })
  // `line` คือ client ของ channel '10' ซึ่งเป็น channel ของ `menuRow()` ตัวปริยาย
  return { scheduler, lock, line: lineFor('10'), lineFor, clientFor, auditRows }
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

  it('ไม่มีเมนูตาม id ที่ schedule ชี้ → งานนั้น failed ไม่ใช่รันด้วย channel ของใครก็ได้', async () => {
    const { scheduler, lock, clientFor } = harness([scheduleRow({ richMenuId: 'ไม่มีจริง' })], [menuRow()])
    const report = await scheduler.tick()
    expect(report).toEqual({ due: 1, claimed: 1, done: 0, failed: 1 })
    expect(lock.release).toHaveBeenCalledWith('s1', 'worker-a', 'failed', 'menu_not_found')
    expect(clientFor).not.toHaveBeenCalled()
  })
})

/**
 * ตารางเวลาเป็นตารางเดียวของทั้งระบบ แต่ token เป็นของแต่ละ OA — รอบหนึ่งของ tick จึงมีงานของ
 * หลาย channel ปนกันเสมอตั้งแต่ลูกค้ามี OA ตัวที่สอง
 *
 * เดิม `createScheduler` เลือกงานจาก `state` อย่างเดียวโดยไม่มีเงื่อนไข channel เลย และ
 * `ScheduleRow` ก็ไม่ได้พก channel มาด้วย ส่วน v4 adapter วนทีละ channel แล้วประกอบ client
 * ให้รอบละตัว ผลคือรอบแรกของลูปคว้างานที่ถึงเวลา **ทั้งตาราง** ไปรันด้วย token ของ channel แรก
 * แล้ว lock ก็กันไม่ให้รอบของเจ้าของจริงหยิบซ้ำ — end user ของ OA หนึ่งเสียเมนูเพราะตารางเวลา
 * ของ OA อีกตัว ส่วนแถว audit บอกชื่อ OA ที่ไม่ได้ถูกแตะ
 */
describe('tick กับหลาย channel', () => {
  it('งานของแต่ละ channel ยิงด้วย client ของ channel ตัวเอง ไม่ใช่ของตัวแรกที่เจอ', async () => {
    const { scheduler, lineFor } = harness(
      [
        scheduleRow({ id: 's-a', richMenuId: '1' }),
        scheduleRow({ id: 's-b', richMenuId: '2', runAt: '2026-08-21T11:30:00.000Z' }),
      ],
      [
        menuRow({ id: '1', channelId: '10', lineRichMenuId: 'richmenu-a' }),
        menuRow({ id: '2', channelId: '20', lineRichMenuId: 'richmenu-b', aliasId: 'tab-b' }),
      ],
    )

    const report = await scheduler.tick()

    expect(report).toEqual({ due: 2, claimed: 2, done: 2, failed: 0 })
    expect(lineFor('10').setDefault.mock.calls).toEqual([['richmenu-a']])
    expect(lineFor('20').setDefault.mock.calls).toEqual([['richmenu-b']])
  })

  // เคสที่เจ็บที่สุดตามสเปก §10: `endAt` ของ channel B ยิง clear-default ด้วย token ของ A
  // → end user ของ A เสียเมนูทั้ง OA ส่วนของ B ไม่ถูกแตะเลย
  it('clear-default ของ channel B ต้องไม่ไปล้าง default ของ channel A', async () => {
    const { scheduler, lineFor } = harness(
      [
        // s-a ถึงเวลาก่อน จึงเป็น channel แรกที่รอบนี้ประกอบ client ให้ — ลำดับนี้สำคัญ:
        // มันคือลำดับที่ทำให้ clear-default ของ B ไปลงที่ token ของ A ได้จริงเมื่อโค้ดพัง
        scheduleRow({ id: 's-a', richMenuId: '1', op: 'set-default' }),
        scheduleRow({ id: 's-b', richMenuId: '2', op: 'clear-default', runAt: '2026-08-21T11:30:00.000Z' }),
      ],
      [
        menuRow({ id: '1', channelId: '10', lineRichMenuId: 'richmenu-a' }),
        menuRow({ id: '2', channelId: '20', lineRichMenuId: 'richmenu-b' }),
      ],
    )

    await scheduler.tick()

    expect(lineFor('10').clearDefault).not.toHaveBeenCalled()
    expect(lineFor('20').clearDefault).toHaveBeenCalledTimes(1)
  })

  it('swap-alias ของแต่ละ channel ไปลง client ของ channel ตัวเอง', async () => {
    const { scheduler, lineFor } = harness(
      [
        scheduleRow({ id: 's-a', richMenuId: '1', op: 'swap-alias' }),
        scheduleRow({ id: 's-b', richMenuId: '2', op: 'swap-alias', runAt: '2026-08-21T11:30:00.000Z' }),
      ],
      [
        menuRow({ id: '1', channelId: '10', aliasId: 'tab-a', lineRichMenuId: 'richmenu-a' }),
        menuRow({ id: '2', channelId: '20', aliasId: 'tab-b', lineRichMenuId: 'richmenu-b' }),
      ],
    )

    await scheduler.tick()

    expect(lineFor('10').createAlias.mock.calls).toEqual([['tab-a', 'richmenu-a']])
    expect(lineFor('20').createAlias.mock.calls).toEqual([['tab-b', 'richmenu-b']])
  })

  it('แถว audit ของแต่ละงานบันทึก channel ที่ถูกแตะจริง', async () => {
    const { scheduler, auditRows } = harness(
      [
        scheduleRow({ id: 's-a', richMenuId: '1' }),
        scheduleRow({ id: 's-b', richMenuId: '2', runAt: '2026-08-21T11:30:00.000Z' }),
      ],
      [
        menuRow({ id: '1', channelId: '10', lineRichMenuId: 'richmenu-a' }),
        menuRow({ id: '2', channelId: '20', lineRichMenuId: 'richmenu-b' }),
      ],
    )

    await scheduler.tick()

    expect(auditRows.map((row) => row.channelId)).toEqual(['10', '20'])
  })

  // ประกอบ client หนึ่งครั้ง = ถอดรหัส access token หนึ่งครั้ง งานสิบแถวของ OA เดียวกัน
  // ในรอบเดียวจึงต้องไม่ถอดสิบครั้ง
  it('ประกอบ client ครั้งเดียวต่อ channel ต่อหนึ่งรอบ ไม่ใช่ครั้งเดียวต่อหนึ่งแถว', async () => {
    const { scheduler, clientFor } = harness(
      [
        scheduleRow({ id: 's1', richMenuId: '1' }),
        scheduleRow({ id: 's2', richMenuId: '1', runAt: '2026-08-21T11:30:00.000Z' }),
        scheduleRow({ id: 's3', richMenuId: '2', runAt: '2026-08-21T11:40:00.000Z' }),
      ],
      [
        menuRow({ id: '1', channelId: '10', lineRichMenuId: 'richmenu-a' }),
        menuRow({ id: '2', channelId: '20', lineRichMenuId: 'richmenu-b' }),
      ],
    )

    await scheduler.tick()

    expect(clientFor.mock.calls).toEqual([['10'], ['20']])
  })
})
