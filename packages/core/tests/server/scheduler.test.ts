import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LineServerError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import type { MemberRow } from '../../src/server/members.js'
import { createScheduler } from '../../src/server/scheduler.js'
import type { TickReport } from '../../src/server/scheduler.js'
import type { AuditRow, ListParams, Repo, RichMenuRow, ScheduleRow } from '../../src/server/types.js'

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const NOW = new Date('2026-08-21T12:00:00.000Z')

function scheduleRow(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 's1', richMenuId: '1', runAt: '2026-08-21T11:00:00.000Z', op: 'set-default',
    state: 'pending', lockedBy: null, lockedAt: null, lastError: null, cursor: null,
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
 * I3 — `due > 0 && claimed === 0` แยกไม่ออกจากรายงานตัวเลขเฉย ๆ ว่าเป็น "ชนกันจริง" หรือ
 * "lock พังเงียบ ๆ" (เช่นชื่อคอลัมน์ผิดหลัง migration) ทั้งสองเคสสมควรมีบรรทัด log ให้คนมาดู
 * เพราะเคสหลังไม่มี error โผล่เลยนอกจากตัวเลขนี้ที่นิ่งอยู่ทุกนาที (ดูรายละเอียดที่ lock.ts)
 *
 * `beforeEach` เคลียร์ `silent.warn` เอง — `silent` เป็นอ็อบเจกต์ระดับโมดูลที่ทุก `describe`
 * ในไฟล์นี้ใช้ร่วมกัน (รวมถึง 'แย่ง lock ไม่ได้ = ข้ามไป ไม่ใช่ทำซ้ำ' ด้านบนซึ่งมี due=1,claimed=0
 * เหมือนกันและตอนนี้ก็ยิง warn ด้วย) vitest ไม่ล้าง mock ให้อัตโนมัติระหว่างเทสต์ ถ้าไม่เคลียร์เอง
 * เคส "ไม่ warn" ข้างล่างจะเห็นการเรียกที่ค้างมาจากเทสต์ก่อนหน้าในไฟล์แล้วแดงผิดเหตุผล
 */
describe('tick — warn เมื่อ due > 0 แต่ claim ไม่ติดสักงานเดียว', () => {
  beforeEach(() => { silent.warn.mockClear() })

  it('due > 0 แต่ claim ไม่ติดสักงานเดียว → ต้อง warn', async () => {
    const { scheduler } = harness([scheduleRow()], [menuRow()], async () => false)
    const report = await scheduler.tick()

    expect(report).toEqual({ due: 1, claimed: 0, done: 0, failed: 0 })
    expect(silent.warn).toHaveBeenCalledWith(
      'line-rich-menu: schedules are due but none could be claimed — total lock contention or a broken lock',
      report,
    )
  })

  it('claim ติดอย่างน้อยหนึ่งงาน → ไม่ warn แม้จะมีงานอื่นแย่ง lock ไม่ได้', async () => {
    let calls = 0
    const claim = async () => { calls += 1; return calls === 1 }
    const { scheduler } = harness(
      [scheduleRow({ id: 's1' }), scheduleRow({ id: 's2', runAt: '2026-08-21T11:30:00.000Z' })],
      [menuRow()],
      claim,
    )
    await scheduler.tick()
    expect(silent.warn).not.toHaveBeenCalled()
  })

  it('ไม่มีงานถึงเวลาเลย (due = 0) → ไม่ warn', async () => {
    const { scheduler } = harness([scheduleRow({ runAt: '2026-08-21T13:00:00.000Z' })], [menuRow()])
    await scheduler.tick()
    expect(silent.warn).not.toHaveBeenCalled()
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

/**
 * 'link-members' ต่างจากอีกสาม op ตรงที่หนึ่งแถว schedule วนหลาย chunk ภายในติ๊กเดียว (Task 2:
 * `linkMemberChunk` เพจแบบ keyset 500 ต่อชุด) — ฮาร์เนสข้างบน (`harness`/`fakeLine`) ไม่รู้จัก
 * ทั้ง `ops.members` และ `client.bulkLink` เลย จึงแยกฮาร์เนสเฉพาะของ describe นี้ ไม่แก้ของเดิม
 * เพื่อไม่ให้กระทบเทสต์ของ op อื่นทั้งไฟล์โดยไม่จำเป็น
 */
describe('tick — link-members วนหลาย chunk พร้อม cursor ที่ resume ได้', () => {
  function membersFor(n: number, channelId = '10'): MemberRow[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `m${String(i).padStart(5, '0')}`,
      channelId,
      lineUserId: `U${String(i).padStart(32, '0')}`,
      displayName: null,
      linkedRichMenuId: null,
      linkedAt: null,
    }))
  }

  // เลียนแบบ keyset paging ของ adapter จริง (`idGreaterThan` คือ `WHERE id > ?` ไม่ใช่ offset) —
  // ต้องรองรับให้ตรงกับที่ `linkMemberChunk` ยิงจริง ไม่งั้นเทสต์ cursor/resume ข้างล่างจับบั๊กไม่ได้
  function memberRepoFor(rows: MemberRow[]): Repo<MemberRow> {
    return {
      async findMany(params) {
        const filters = params?.filters ?? {}
        let result = rows.filter((row) => Object.entries(filters).every(
          ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
        ))
        if (params?.idGreaterThan !== undefined) {
          const cursor = params.idGreaterThan
          result = result.filter((row) => row.id > cursor)
        }
        result = [...result].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        if (params?.limit !== undefined) result = result.slice(0, params.limit)
        return result
      },
      async findOne(id) { return rows.find((row) => row.id === id) ?? null },
      async create(data) { const row = { id: 'new', ...data } as MemberRow; rows.push(row); return row },
      async update(id, data) {
        const index = rows.findIndex((row) => row.id === id)
        rows[index] = { ...rows[index]!, ...data }
        return rows[index]!
      },
      async delete() {},
    }
  }

  /**
   * `failOnChunk` จำลอง process ที่ตายกลางทาง: `client.bulkLink` โยน error บนการเรียกครั้งที่ N
   * พอดี — ก่อนหน้านั้นทุกชุดต้องผ่านและเขียน cursor ไปแล้วจริง ๆ (ดู `released` ที่คืนกลับ)
   */
  async function tickWith(options: {
    members: number
    op: 'link-members'
    onScheduleUpdate?: (data: Partial<ScheduleRow>) => void
    startCursor?: string | null
    failOnChunk?: number
  }): Promise<{
    report: TickReport
    sentChunks: string[][]
    released: { state: string; error: string | null } | undefined
    /** ListParams ที่ ops.members.findMany ได้รับจริง เรียงตามลำดับ — ยืนยัน "ยิง query ยังไง" ไม่ใช่แค่ผลลัพธ์ */
    queries: ListParams[]
    /** cursor ที่ค้างอยู่บนแถว schedule หลัง tick จบ (ไม่ว่า done หรือ failed) */
    cursorPersisted: string | null
  }> {
    const memberRows = membersFor(options.members)
    const memberRepo = memberRepoFor(memberRows)
    const sentChunks: string[][] = []
    const queries: ListParams[] = []
    let bulkLinkCalls = 0

    const line = {
      ...fakeLine(),
      bulkLink: vi.fn(async (_richMenuId: string, userIds: readonly string[]) => {
        bulkLinkCalls += 1
        if (options.failOnChunk === bulkLinkCalls) throw new LineServerError(503)
        sentChunks.push([...userIds])
      }),
    }

    const scheduleRows: ScheduleRow[] = [
      scheduleRow({ id: 's1', op: options.op, cursor: options.startCursor ?? null }),
    ]

    let released: { state: string; error: string | null } | undefined
    const lock = {
      claim: vi.fn(async () => true),
      release: vi.fn(async (_id: string, _owner: string, state: 'done' | 'failed', error: string | null) => {
        released = { state, error }
      }),
    }

    const auditRows: AuditRow[] = []
    const auditRepo: Repo<AuditRow> = {
      async findMany() { return auditRows },
      async findOne() { return null },
      async create(data) { const row = { id: String(auditRows.length + 1), ...data } as AuditRow; auditRows.push(row); return row },
      async update() { throw new Error('append-only') },
      async delete() { throw new Error('append-only') },
    }

    const schedules: Repo<ScheduleRow> = {
      async findMany(params) {
        const filters = params?.filters ?? {}
        return scheduleRows.filter((row) => Object.entries(filters).every(
          ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
        ))
      },
      async findOne(id) { return scheduleRows.find((row) => row.id === id) ?? null },
      async create(data) { const row = { id: 'new', ...data } as ScheduleRow; scheduleRows.push(row); return row },
      async update(id, data) {
        options.onScheduleUpdate?.(data)
        const index = scheduleRows.findIndex((row) => row.id === id)
        scheduleRows[index] = { ...scheduleRows[index]!, ...data }
        return scheduleRows[index]!
      },
      async delete() {},
    }

    const scheduler = createScheduler({
      schedules,
      lock,
      ops: {
        menus: listRepo([menuRow({ id: '1', channelId: '10' })]),
        audit: createAuditWriter({ repo: auditRepo, logger: silent }),
        clientFor: async () => line as never,
        // ห่อ findMany ไว้บันทึก query ทุกครั้งที่ยิงจริง — เหมือน `deps()` ใน members.test.ts:
        // assertion บนผลลัพธ์อย่างเดียวผ่านได้แม้ query ที่ยิงจริงผิด (เช่น cursor ไม่ถูกส่ง)
        members: {
          ...memberRepo,
          async findMany(params) {
            queries.push(params ?? {})
            return memberRepo.findMany(params)
          },
        },
      },
      logger: silent,
      now: () => NOW,
      owner: 'worker-a',
    })

    const report = await scheduler.tick()
    return { report, sentChunks, released, queries, cursorPersisted: scheduleRows[0]!.cursor }
  }

  it('งาน link-members เดินครบทุกชุดในหนึ่ง tick', async () => {
    const { report, sentChunks } = await tickWith({ members: 1001, op: 'link-members' })
    expect(report).toMatchObject({ due: 1, claimed: 1, done: 1, failed: 0 })
    expect(sentChunks.map((c) => c.length)).toEqual([500, 500, 1])
  })

  it('เขียน cursor ลงแถวงานหลังจบแต่ละชุด ไม่ใช่ตอนจบทั้งงาน', async () => {
    const writes: (string | null)[] = []
    await tickWith({
      members: 1001, op: 'link-members',
      onScheduleUpdate: (d) => writes.push(d.cursor ?? null),
    })
    expect(writes.length).toBeGreaterThanOrEqual(2)
  })

  /**
   * ตายกลางทางแล้วรอบถัดไปต้องต่อ ไม่ใช่เริ่มใหม่ตั้งแต่คนแรก — ต้องเช็คกลไก ไม่ใช่แค่ผลลัพธ์:
   * "ไม่ใช่คนแรก" อย่างเดียวผ่านได้แม้ cursor ที่ใช้จริงเป็นค่าอื่นที่ผิดก็ตาม (ดู probe ท้ายไฟล์
   * ในรายงาน — เดิม assertion นี้จับได้แค่โดยบังเอิญผ่าน chunk-count ของเทสต์ข้างบน ไม่ใช่จับเอง)
   * เช็คสองชั้น: (1) query แรกของรอบ resume พก idGreaterThan เป็น cursor ที่ให้ไปจริง ๆ ไม่ใช่ค่าอื่น
   * (2) คนแรกที่ถูกส่งคือคนถัดจาก cursor นั้นพอดี ('m00499' → ลำดับที่ 500 → id ตัวเลข 500)
   */
  it('tick รอบถัดไปเริ่มจาก cursor ที่ค้างไว้ ไม่ใช่แค่ "ไม่ใช่คนแรก"', async () => {
    const { sentChunks, queries } = await tickWith({ members: 1001, op: 'link-members', startCursor: 'm00499' })
    expect(queries[0]).toMatchObject({ idGreaterThan: 'm00499' })
    expect(sentChunks[0]![0]).toBe(`U${String(500).padStart(32, '0')}`)
  })

  // ชื่อเทสต์นี้สัญญาว่าเช็ค "cursor ที่ทำไปแล้ว" — ต้องเช็คค่าจริง ไม่ใช่แค่พูดถึงในชื่อ เพราะทั้งหมด
  // ที่การเขียน cursor ทีละ chunk มีไว้เพื่อคือให้ตอบคำถามนี้ได้หลัง crash: "ทำไปถึงไหนแล้ว"
  it('งานล้มกลางทางปล่อย lock เป็น failed พร้อม cursor ที่ทำไปแล้ว', async () => {
    // 600 คน, ชุดละ 500 — ชุดแรก (0..499) ผ่านและเขียน cursor='m00499' ก่อน ชุดที่สอง (500..599) ถึงจะล้ม
    const { report, released, cursorPersisted } = await tickWith({ members: 600, op: 'link-members', failOnChunk: 2 })
    expect(report.failed).toBe(1)
    expect(released).toMatchObject({ state: 'failed' })
    expect(cursorPersisted).toBe('m00499')
  })

  it('ไม่มี ops.members แล้วมีงาน link-members เข้ามา → พังทันที ไม่ใช่ข้ามงานไปเงียบ ๆ', async () => {
    const scheduleRows: ScheduleRow[] = [scheduleRow({ id: 's1', op: 'link-members', cursor: null })]
    const lock = { claim: vi.fn(async () => true), release: vi.fn(async () => {}) }
    const auditRows: AuditRow[] = []
    const auditRepo: Repo<AuditRow> = {
      async findMany() { return auditRows },
      async findOne() { return null },
      async create(data) { const row = { id: '1', ...data } as AuditRow; auditRows.push(row); return row },
      async update() { throw new Error('append-only') },
      async delete() { throw new Error('append-only') },
    }
    const scheduler = createScheduler({
      schedules: listRepo(scheduleRows),
      lock,
      ops: {
        menus: listRepo([menuRow({ id: '1', channelId: '10' })]),
        audit: createAuditWriter({ repo: auditRepo, logger: silent }),
        clientFor: async () => fakeLine() as never,
        // members ไม่ถูกระบุโดยตั้งใจ — จำลอง adapter ที่ลืม wire
      },
      logger: silent,
      now: () => NOW,
      owner: 'worker-a',
    })

    const report = await scheduler.tick()
    expect(report).toEqual({ due: 1, claimed: 1, done: 0, failed: 1 })
    expect(lock.release).toHaveBeenCalledWith('s1', 'worker-a', 'failed', expect.any(String))
  })
})

/**
 * 'unlink-members' คู่ตรงข้ามของ 'link-members' — วนหลาย chunk ในติ๊กเดียวเหมือนกัน แต่**ไม่มี
 * cursor** เพราะชุดงานของมันหดเองทุกแถวที่ปลดสำเร็จ (เหตุผลเต็มอยู่ที่ `unlinkMemberChunk`)
 * เทสต์ในนี้จึงตรวจสองอย่างที่ของ link ตรวจไม่ได้: "ไม่เขียน cursor เลยสักครั้ง" กับ "repo ที่ไม่เคย
 * ล้างค่าให้ต้องทำให้งานล้ม ไม่ใช่วนค้าง"
 */
describe('tick — unlink-members วนจนหมดโดยไม่มี cursor', () => {
  function linkedMembers(n: number, richMenuId = 'richmenu-a', channelId = '10'): MemberRow[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `m${String(i).padStart(5, '0')}`,
      channelId,
      lineUserId: `U${String(i).padStart(32, '0')}`,
      displayName: null,
      linkedRichMenuId: richMenuId,
      linkedAt: '2026-08-01T00:00:00.000Z',
    }))
  }

  function memberRepoFor(rows: MemberRow[], clears = true): Repo<MemberRow> {
    return {
      async findMany(params) {
        const filters = params?.filters ?? {}
        let result = rows.filter((row) => Object.entries(filters).every(
          ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
        ))
        result = [...result].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        if (params?.limit !== undefined) result = result.slice(0, params.limit)
        return result
      },
      async findOne(id) { return rows.find((row) => row.id === id) ?? null },
      async create(data) { const row = { id: 'new', ...data } as MemberRow; rows.push(row); return row },
      // `clears: false` เลียนแบบ repo ที่แม็ปคอลัมน์ผิดจน update ไม่โดนแถวไหนเลย — เขียนสำเร็จ
      // ทุกครั้งแต่ค่าไม่เคยเปลี่ยน ซึ่งเป็นรูปเดียวที่ทำให้ลูป "จนกว่าชุดจะว่าง" ไม่มีวันจบ
      async update(id, data) {
        const index = rows.findIndex((row) => row.id === id)
        if (clears) rows[index] = { ...rows[index]!, ...data }
        return rows[index]!
      },
      async delete() {},
    }
  }

  function unlinkHarness(options: {
    members: MemberRow[]
    menu?: RichMenuRow
    wireMembers?: boolean
    clears?: boolean
    bulkUnlink?: (userIds: readonly string[]) => Promise<void>
  }) {
    const memberRows = options.members
    const sentChunks: string[][] = []
    const line = {
      ...fakeLine(),
      bulkUnlink: vi.fn(async (userIds: readonly string[]) => {
        sentChunks.push([...userIds])
        await options.bulkUnlink?.(userIds)
      }),
    }
    const scheduleRows: ScheduleRow[] = [scheduleRow({ id: 's1', op: 'unlink-members', cursor: null })]
    const scheduleUpdates: Partial<ScheduleRow>[] = []
    const schedules = listRepo(scheduleRows)
    const auditRows: AuditRow[] = []
    const auditRepo: Repo<AuditRow> = {
      async findMany() { return auditRows },
      async findOne() { return null },
      async create(data) { const row = { id: String(auditRows.length + 1), ...data } as AuditRow; auditRows.push(row); return row },
      async update() { throw new Error('append-only') },
      async delete() { throw new Error('append-only') },
    }
    let released: { state: string; error: string | null } | undefined
    const scheduler = createScheduler({
      schedules: {
        ...schedules,
        async update(id, data) { scheduleUpdates.push(data); return schedules.update(id, data) },
      },
      lock: {
        claim: vi.fn(async () => true),
        release: vi.fn(async (_id: string, _owner: string, state: 'done' | 'failed', error: string | null) => {
          released = { state, error }
        }),
      },
      ops: {
        menus: listRepo([options.menu ?? menuRow({ id: '1', channelId: '10' })]),
        audit: createAuditWriter({ repo: auditRepo, logger: silent }),
        clientFor: async () => line as never,
        ...(options.wireMembers === false
          ? {}
          : { members: memberRepoFor(memberRows, options.clears ?? true) }),
      },
      logger: silent,
      now: () => NOW,
      owner: 'worker-a',
    })
    return {
      tick: () => scheduler.tick(),
      sentChunks, memberRows, auditRows, scheduleUpdates,
      released: () => released,
    }
  }

  it('ปลดครบทุกชุดในหนึ่งติ๊ก แล้วแถวงานจบเป็น done', async () => {
    const h = unlinkHarness({ members: linkedMembers(1001) })
    const report = await h.tick()

    expect(report).toMatchObject({ due: 1, claimed: 1, done: 1, failed: 0 })
    expect(h.sentChunks.map((chunk) => chunk.length)).toEqual([500, 500, 1])
    expect(h.memberRows.every((row) => row.linkedRichMenuId === null)).toBe(true)
  })

  // ด่านหลักของความไม่สมมาตรกับ link-members — ถ้ามีใครมา "แก้ให้เหมือนกัน" ภายหลัง ต้องเจอที่นี่
  it('ไม่เขียน cursor ลงแถวงานเลยสักครั้ง ต่างจาก link-members', async () => {
    const h = unlinkHarness({ members: linkedMembers(1001) })
    await h.tick()
    expect(h.scheduleUpdates).toEqual([])
  })

  it('ปลดเฉพาะคนที่ถือเมนูของงานนี้ — คนที่ถือเมนูอื่นไม่ถูกแตะ', async () => {
    const rows = [...linkedMembers(2), ...linkedMembers(1, 'richmenu-z').map((row) => ({ ...row, id: 'm-other' }))]
    const h = unlinkHarness({ members: rows })
    await h.tick()

    expect(h.sentChunks).toHaveLength(1)
    expect(h.sentChunks[0]).toHaveLength(2)
    expect(h.memberRows.find((row) => row.id === 'm-other')?.linkedRichMenuId).toBe('richmenu-z')
  })

  it('เมนูที่ยังไม่เคยขึ้น LINE — ไม่มีใครถือได้อยู่แล้ว จบเป็น done โดยไม่ยิง LINE', async () => {
    const h = unlinkHarness({
      members: linkedMembers(3),
      menu: menuRow({ id: '1', channelId: '10', status: 'draft', lineRichMenuId: null }),
    })
    const report = await h.tick()

    expect(report).toMatchObject({ done: 1, failed: 0 })
    expect(h.sentChunks).toHaveLength(0)
  })

  it('ไม่มี ops.members แล้วมีงาน unlink-members เข้ามา → พังทันที ไม่ใช่ข้ามงานไปเงียบ ๆ', async () => {
    const h = unlinkHarness({ members: linkedMembers(1), wireMembers: false })
    const report = await h.tick()

    expect(report).toMatchObject({ failed: 1, done: 0 })
    expect(h.released()).toMatchObject({ state: 'failed' })
  })

  /**
   * ไม่มี cursor แปลว่าเงื่อนไขจบลูปคือ "ชุดว่าง" อย่างเดียว — repo ที่ update ไม่เคยโดนแถวไหน
   * (แม็ปคอลัมน์ผิด) ทำให้เงื่อนไขนั้นไม่มีวันจริง ถ้าไม่มีด่านนี้ tick จะค้างทั้ง process เงียบ ๆ
   * ไม่มี error ให้ใครเห็น เทสต์นี้จะ "ค้างจนหมดเวลา" แทนที่จะแดง ถ้าด่านนั้นถูกถอดออก
   */
  it('repo ที่ไม่เคยล้าง linkedRichMenuId → งานล้ม ไม่ใช่วนไม่รู้จบ', async () => {
    const h = unlinkHarness({ members: linkedMembers(3), clears: false })
    const report = await h.tick()

    expect(report).toMatchObject({ failed: 1 })
    expect(h.released()).toMatchObject({ state: 'failed' })
  })

  it('เขียน audit unlink-members success พร้อมจำนวนที่ปลดได้จริง', async () => {
    const h = unlinkHarness({ members: linkedMembers(501) })
    await h.tick()

    expect(h.auditRows).toHaveLength(1)
    expect(h.auditRows[0]).toMatchObject({
      action: 'unlink-members', richMenuId: 'richmenu-a', channelId: '10',
      result: 'success', after: { unlinked: 501 },
    })
  })

  it('LINE ล้มกลางทาง → audit failure พร้อม errorCode และงานจบเป็น failed', async () => {
    let calls = 0
    const h = unlinkHarness({
      members: linkedMembers(501),
      bulkUnlink: async () => {
        calls += 1
        if (calls === 2) throw new LineServerError(503)
      },
    })
    const report = await h.tick()

    expect(report).toMatchObject({ failed: 1 })
    expect(h.auditRows[0]).toMatchObject({ action: 'unlink-members', result: 'failure' })
    expect(h.auditRows[0]?.errorCode).not.toBeNull()
    // ชุดแรกที่สำเร็จไปแล้วต้องยังถูกล้างไว้ — งานที่ตั้งใหม่ทีหลังจึงเริ่มจากคนที่เหลือเองโดยไม่ต้องมี cursor
    expect(h.memberRows[0]?.linkedRichMenuId).toBeNull()
  })
})
