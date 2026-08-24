import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LineServerError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import { RowVanishedError } from '../../src/server/errors.js'
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
    publishedAt: null, lastError: null, updatedAt: '2026-08-20T00:00:00.000Z', audience: 'all',
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
  const lock = { claim: vi.fn(claim), heartbeat: vi.fn(async () => true), release: vi.fn(async () => {}) }
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
      // op อื่นไม่แตะ pointer นี้เลย — ตอบว่า "ยังชี้อยู่" ไว้ ไม่ใช่ค่ากลาง ๆ ที่ไม่มีความหมาย
      memberRichMenuIdOf: async () => 'richmenu-a',
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

  /**
   * Task 17 / final review BLOCKER — ด่านชั้นสุดท้ายของ `set-default`
   *
   * ทางเขียนถูกปิดแล้ว (`assertDisplayPeriodAllowed` ใน `saveMenu` ไม่ให้เมนูสมาชิกมีช่วงเวลา
   * แสดงผลตั้งแต่แรก) แต่ฐานข้อมูลที่อัปเกรดมาจากก่อนหน้านั้นมีแถว `set-default` ของเมนูสมาชิก
   * ค้างอยู่ได้จริง — ถ้า scheduler ไม่มีด่านของตัวเอง แถวเหล่านั้นจะยัดเมนูสมาชิกให้ผู้ติดตาม
   * ทุกคนตามเวลาที่ตั้งไว้ โดยไม่มีใครกดอะไรเลย
   *
   * ต้องล้มเป็นงาน failed พร้อม code ที่อ่านออก **และไม่ยิง LINE เลย** — ไม่ใช่ทำให้ tick ทั้งรอบ
   * ล้ม (งานของเมนูอื่นในรอบเดียวกันต้องเดินต่อ) และไม่ใช่เงียบ ๆ ข้ามไป
   */
  it('แถว set-default ที่ค้างอยู่ของเมนูสมาชิก → failed ด้วย menu_not_all_audience และไม่แตะ LINE', async () => {
    const { scheduler, lock, line } = harness(
      [scheduleRow({ id: 's1', op: 'set-default' })],
      [menuRow({ audience: 'members' })],
    )

    const report = await scheduler.tick()

    expect(report).toEqual({ due: 1, claimed: 1, done: 0, failed: 1 })
    expect(lock.release).toHaveBeenCalledWith('s1', 'worker-a', 'failed', 'menu_not_all_audience')
    expect(line.setDefault).not.toHaveBeenCalled()
  })

  // คู่ที่พิสูจน์ว่าด่านข้างบนเป็นยาม ไม่ใช่การปิด op นี้ทิ้ง — เมนูของทุกคนยังตั้ง default ตามเวลาได้
  it('แถวเดียวกันบนเมนู audience: all → done และตั้ง default จริง', async () => {
    const { scheduler, lock, line } = harness(
      [scheduleRow({ id: 's1', op: 'set-default' })],
      [menuRow({ audience: 'all' })],
    )

    const report = await scheduler.tick()

    expect(report).toEqual({ due: 1, claimed: 1, done: 1, failed: 0 })
    expect(lock.release).toHaveBeenCalledWith('s1', 'worker-a', 'done', null)
    expect(line.setDefault).toHaveBeenCalledWith('richmenu-a')
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
    menu?: RichMenuRow
    onScheduleUpdate?: (data: Partial<ScheduleRow>) => void
    startCursor?: string | null
    failOnChunk?: number
    /** id ของสมาชิกที่ "หายไป" ระหว่างงานวิ่ง — repo คืน RowVanishedError เหมือนของจริง (Task 19 item 3) */
    vanishedMemberId?: string
    /**
     * จำลองการกดปิดระหว่างงานกำลังวิ่ง (Task 19 item 5) — pointer ของ channel เลิกชี้มาที่เมนูนี้
     * หลังผ่านการเช็คไปแล้ว N ครั้ง (เช็คเกิดก่อนทุกชุด: 0 = ปิดไปก่อนชุดแรกจะได้วิ่งเลย)
     */
    deactivateAfterChecks?: number
    /**
     * (review-19 M2) จำลอง heartbeat ที่คืน `true` สำเร็จ N ครั้งแรก แล้วคืน `false` ตั้งแต่ครั้งที่
     * N+1 เป็นต้นไป — จำลอง "แถวถูกแย่งไปแล้ว" กลางทาง งานต้องหยุดที่นั่น ไม่ใช่วนต่อ
     */
    keepClaimFailsAfter?: number
  }): Promise<{
    report: TickReport
    sentChunks: string[][]
    released: { state: string; error: string | null } | undefined
    /** ListParams ที่ ops.members.findMany ได้รับจริง เรียงตามลำดับ — ยืนยัน "ยิง query ยังไง" ไม่ใช่แค่ผลลัพธ์ */
    queries: ListParams[]
    /** cursor ที่ค้างอยู่บนแถว schedule หลัง tick จบ (ไม่ว่า done หรือ failed) */
    cursorPersisted: string | null
    /**
     * richMenuId ที่ `bulkLink` ได้รับจริงในแต่ละชุด — ของปลอมเดิมรับเป็น `_richMenuId` แล้วทิ้ง
     * ทำให้ "ส่ง id ของแถวในฐานข้อมูลไปให้ LINE" ผ่านทุกเทสต์มาตลอด ต้องเก็บไว้ถึงจะถามได้
     */
    linkTargets: string[]
    /** แถวสมาชิกหลัง tick — ค่า `linkedRichMenuId` ที่ประทับลงไปคือสิ่งที่ unlink ใช้หาคนทีหลัง */
    memberRows: MemberRow[]
    /** แถว audit ที่งานนี้เขียนจริง — เดิม link-members ไม่เคยเขียนสักแถว (Task 19 item 7) */
    auditRows: AuditRow[]
    /** จำนวนครั้งที่งานถาม pointer ของ channel — ต้องเป็น "ก่อนทุกชุด" ไม่ใช่ครั้งเดียวตอนเริ่ม */
    pointerChecks: () => number
    /** ครั้งที่งานต่ออายุ claim ของตัวเอง — (scheduleId, owner) ที่ heartbeat ได้รับจริง */
    heartbeats: [string, string][]
  }> {
    const memberRows = membersFor(options.members)
    const memberRepo = memberRepoFor(memberRows)
    const sentChunks: string[][] = []
    const linkTargets: string[] = []
    const queries: ListParams[] = []
    let bulkLinkCalls = 0
    let pointerChecks = 0

    const line = {
      ...fakeLine(),
      bulkLink: vi.fn(async (richMenuId: string, userIds: readonly string[]) => {
        bulkLinkCalls += 1
        linkTargets.push(richMenuId)
        if (options.failOnChunk === bulkLinkCalls) throw new LineServerError(503)
        sentChunks.push([...userIds])
      }),
    }

    const scheduleRows: ScheduleRow[] = [
      scheduleRow({ id: 's1', op: options.op, cursor: options.startCursor ?? null }),
    ]

    let released: { state: string; error: string | null } | undefined
    let heartbeatCalls = 0
    const lock = {
      claim: vi.fn(async () => true),
      // (Task 19 item 4) นับจริงว่างานต่ออายุ claim กี่ครั้ง — จำนวนต้องผูกกับจำนวนชุดที่วิ่งจบ
      // (review-19 M2) `keepClaimFailsAfter` จำลองแถวที่ถูกแย่งไปกลางทาง — คืน `true` สำเร็จ N
      // ครั้งแรก แล้วคืน `false` ตั้งแต่ครั้งที่ N+1
      heartbeat: vi.fn(async (id: string, owner: string) => {
        void id; void owner
        heartbeatCalls += 1
        return options.keepClaimFailsAfter === undefined || heartbeatCalls <= options.keepClaimFailsAfter
      }),
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
        menus: listRepo([options.menu ?? menuRow({ id: '1', channelId: '10' })]),
        audit: createAuditWriter({ repo: auditRepo, logger: silent }),
        clientFor: async () => line as never,
        memberRichMenuIdOf: async () => {
          pointerChecks += 1
          return options.deactivateAfterChecks !== undefined
            && pointerChecks > options.deactivateAfterChecks
            ? null
            : 'richmenu-a'
        },
        // ห่อ findMany ไว้บันทึก query ทุกครั้งที่ยิงจริง — เหมือน `deps()` ใน members.test.ts:
        // assertion บนผลลัพธ์อย่างเดียวผ่านได้แม้ query ที่ยิงจริงผิด (เช่น cursor ไม่ถูกส่ง)
        members: {
          ...memberRepo,
          async findMany(params) {
            queries.push(params ?? {})
            return memberRepo.findMany(params)
          },
          async update(id, data) {
            if (id === options.vanishedMemberId) {
              throw new RowVanishedError('plugin::line-rich-menu.line-member', id)
            }
            return memberRepo.update(id, data)
          },
        },
      },
      logger: silent,
      now: () => NOW,
      owner: 'worker-a',
    })

    const report = await scheduler.tick()
    return {
      report, sentChunks, released, queries, linkTargets, memberRows, auditRows,
      heartbeats: lock.heartbeat.mock.calls as [string, string][],
      pointerChecks: () => pointerChecks,
      cursorPersisted: scheduleRows[0]!.cursor,
    }
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

  /**
   * แถว schedule ชี้เมนูด้วย id ของฐานข้อมูล ('1') ส่วน LINE รู้จักเมนูเดียวกันด้วย id ของมันเอง
   * ('richmenu-a') — ค่าที่ต้องเดินทางไปถึง bulkLink และไปประทับบน linkedRichMenuId คือของ LINE
   * เพราะฝั่ง unlink เลือกคนจาก `linkedRichMenuId = menu.lineRichMenuId` ถ้าสองฝั่งใช้คนละค่า
   * งานปลดจะไม่แมตช์ใครที่งานผูกทำไว้เลยสักคน และ LINE เองก็ปฏิเสธ id ที่ตัวเองไม่เคยออก
   */
  it('ส่ง lineRichMenuId ของเมนูให้ LINE และประทับค่าเดียวกันลงแถวสมาชิก ไม่ใช่ id ของแถวในฐานข้อมูล', async () => {
    const { linkTargets, memberRows } = await tickWith({ members: 3, op: 'link-members' })

    expect(linkTargets).toEqual(['richmenu-a'])
    expect(memberRows.map((row) => row.linkedRichMenuId)).toEqual(['richmenu-a', 'richmenu-a', 'richmenu-a'])
  })

  it('เมนูถูก unpublish ไปแล้ว (lineRichMenuId เป็น null) → ไม่ยิง LINE เลย และงานจบเป็น done', async () => {
    const { report, linkTargets, memberRows } = await tickWith({
      members: 3, op: 'link-members',
      menu: menuRow({ id: '1', channelId: '10', status: 'draft', lineRichMenuId: null }),
    })

    expect(report).toMatchObject({ done: 1, failed: 0 })
    expect(linkTargets).toEqual([])
    expect(memberRows.every((row) => row.linkedRichMenuId === null)).toBe(true)
  })

  /**
   * (Task 19 item 7) ก่อนหน้านี้ 'link-members' เป็น op เดียวที่ไม่เขียนแถว audit เลย — ปฏิบัติการที่
   * แตะ LINE หนักที่สุดในผลิตภัณฑ์เป็นสิ่งเดียวที่ไม่มีร่องรอย ทำให้บั๊กอื่นทุกตัวของกลไก enrolment
   * มองไม่เห็นจากภายนอก ตรวจให้ครบทั้งค่าที่ต้องอยู่ในแถว ไม่ใช่แค่ "มีแถว"
   */
  it('เขียน audit link-members success พร้อมจำนวนที่ผูกได้จริง และ complete: true', async () => {
    const { auditRows } = await tickWith({ members: 1001, op: 'link-members' })

    expect(auditRows).toHaveLength(1)
    // richMenuId ที่ปักไว้คือ id ฝั่ง LINE ('richmenu-a') ไม่ใช่ id ของแถวเมนู ('1') — ธรรมเนียม
    // เดียวกับ unlink-members (เหตุผลเต็มที่ AuditRow.richMenuId ใน types.ts)
    expect(auditRows[0]).toMatchObject({
      action: 'link-members', richMenuId: 'richmenu-a', channelId: '10',
      result: 'success', after: { linked: 1001, complete: true },
    })
    expect(auditRows[0]?.errorCode).toBeNull()
  })

  /**
   * หัวใจของ item 7: enrolment ที่ทำได้ครึ่งเดียวต้อง**แยกออก**จาก enrolment ที่จบครบได้จากแถว audit
   * เพียงแถวเดียว ตัวเลขคนอย่างเดียวตอบไม่ได้ ("500 คน" คือทั้งหมดที่มี หรือแค่ที่ทำทันก่อนล้ม?)
   * `complete` คือค่าที่ตอบคำถามนั้น และ `linked` บนแถว failure มาได้ทางเดียวคือผ่าน `auditAfter`
   * บนตัว error (audit.ts:auditAfterOf) เพราะ `around` ไม่มีทางอื่นเห็นความคืบหน้าของ run() ที่โยน
   */
  it('งานที่ล้มกลางทางเขียน audit failure ที่แยกออกจากงานที่จบครบ — linked เท่าที่ทำได้ + complete: false', async () => {
    // 600 คน ชุดละ 500: ชุดแรกผ่าน (500 คน) ชุดที่สองล้ม
    const { auditRows } = await tickWith({ members: 600, op: 'link-members', failOnChunk: 2 })

    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]).toMatchObject({
      action: 'link-members', richMenuId: 'richmenu-a', channelId: '10',
      result: 'failure', after: { linked: 500, complete: false },
    })
    expect(auditRows[0]?.errorCode).not.toBeNull()
  })

  /**
   * (Task 19 item 3) คนเดียวที่ถูกลบไประหว่างงานวิ่งเคยทำให้ **ทั้งงาน** ล้ม: `members.update` คืน
   * null จากไดรเวอร์ → `toRow(null)` เป็น TypeError → แถวงานถูกทำเครื่องหมาย failed cursor ค้างที่
   * เดิม และ chunk ที่เหลือไม่เคยได้วิ่งเลย ที่ระดับนี้ต้องเช็คสิ่งที่หน่วยย่อยเช็คไม่ได้ — ว่า
   * **chunk ต่อ ๆ ไปยังได้วิ่งจริง** ไม่ใช่แค่ว่าฟังก์ชันเดียวไม่ throw
   */
  it('สมาชิกหนึ่งคนหายไปกลางทาง ไม่ทำให้ chunk ที่เหลือหยุดวิ่ง — งานยังจบครบและ audit บันทึกไว้', async () => {
    const { report, sentChunks, auditRows, cursorPersisted } = await tickWith({
      members: 1001, op: 'link-members', vanishedMemberId: 'm00000',
    })

    expect(report).toMatchObject({ done: 1, failed: 0 })
    // ทั้งสามชุดต้องได้วิ่ง — เดิมหยุดที่ชุดแรก
    expect(sentChunks.map((c) => c.length)).toEqual([500, 500, 1])
    expect(cursorPersisted).toBeNull()
    expect(auditRows[0]).toMatchObject({
      action: 'link-members', result: 'success', after: { linked: 1001, vanished: 1, complete: true },
    })
  })

  /**
   * (Task 19 item 5) สองแท็บ: แท็บหนึ่งกดเปิดแล้วคำขอค้างอยู่ระหว่างไล่ chunk อีกแท็บกดปิด งาน
   * unlink ปลดคนที่ผูกไปแล้วออก แต่งาน link ที่ยังวิ่งอยู่เดินหน้าผูกคนที่เหลือต่อจนจบ — สมาชิก
   * กลุ่มหลังจึงถือเมนูที่ channel ไม่ได้ชี้ไปแล้ว และไม่มีงานไหนตามเก็บ เพราะงานปลดจบไปก่อนที่
   * คนกลุ่มนั้นจะถูกผูกด้วยซ้ำ
   *
   * `deactivateAfterChecks: 1` = ผ่านการเช็คครั้งแรก (ชุดแรกวิ่ง) แล้ว pointer หายไปก่อนชุดที่สอง
   */
  it('channel เลิกชี้มาที่เมนูนี้ระหว่างงานวิ่ง → หยุดที่ท้ายชุดปัจจุบัน ไม่ผูกคนที่เหลือต่อ', async () => {
    const { report, sentChunks, auditRows, cursorPersisted } = await tickWith({
      members: 1001, op: 'link-members', deactivateAfterChecks: 1,
    })

    // ชุดแรกวิ่งไปแล้วก่อนจะกดปิด ชุดที่สองกับสามต้องไม่เกิดขึ้นเลย
    expect(sentChunks.map((c) => c.length)).toEqual([500])
    // หยุด "อย่างสะอาด" — งานจบเป็น done ไม่ใช่ failed ที่จะถูกปลุกซ้ำในอนาคต
    expect(report).toMatchObject({ done: 1, failed: 0 })
    // และแยกออกจากงานที่จบครบได้จริงในแถว audit (item 7 คือสิ่งที่ทำให้ข้อนี้มองเห็นได้เลย)
    expect(auditRows[0]).toMatchObject({
      action: 'link-members', result: 'success', after: { linked: 500, complete: false },
    })
    expect(cursorPersisted).toBe('m00499')
  })

  it('กดปิดก่อนงานได้วิ่งชุดแรกเลย → ไม่ยิง LINE สักครั้ง และ audit บอกว่าไม่ครบ', async () => {
    const { sentChunks, auditRows, report } = await tickWith({
      members: 1001, op: 'link-members', deactivateAfterChecks: 0,
    })

    expect(sentChunks).toEqual([])
    expect(report).toMatchObject({ done: 1, failed: 0 })
    expect(auditRows[0]).toMatchObject({ result: 'success', after: { linked: 0, complete: false } })
  })

  /**
   * "เช็คก่อนทุกชุด" ไม่ใช่ "เช็คครั้งเดียวตอนเริ่ม" — อย่างหลังทำให้ทุกด่านข้างบนเขียวได้เหมือนกัน
   * ทั้งที่ยังปล่อยให้ชุดที่ 2..N วิ่งต่อหลังการกดปิด ซึ่งคือช่องที่ ruling บอกให้ **ปิด** ไม่ใช่
   * ทำให้แคบลง ต้องนับจำนวนครั้งที่ถามจริง ไม่ใช่ถามว่าถามหรือเปล่า
   */
  it('ถาม pointer ก่อนทุกชุด ไม่ใช่ครั้งเดียวตอนเริ่มงาน', async () => {
    const { sentChunks, pointerChecks } = await tickWith({ members: 1001, op: 'link-members' })

    expect(sentChunks).toHaveLength(3)
    expect(pointerChecks()).toBe(3)
  })

  /**
   * (Task 19 item 4) งานที่วนหลายชุดในหนึ่ง `run()` ต้องต่ออายุ claim ของตัวเองทุกจบชุด ไม่งั้น
   * tick นาทีถัดไปจะ claim แถวเดิมซ้ำแล้ววิ่งซ้อน — cursor ถอยหลังได้ และตัวหนึ่งจบแล้วปล่อย lock
   * ขณะที่อีกตัวยังวิ่งอยู่ ต้องนับจำนวนครั้งจริง ไม่ใช่ถามว่าเรียกหรือเปล่า: การต่ออายุครั้งเดียว
   * ตอนเริ่มงานไม่ได้แก้อะไรเลยกับงานที่กินเวลาสิบนาที
   */
  it('ต่ออายุ claim ทุกจบชุด ด้วย scheduleId/owner ของตัวเอง ไม่ใช่ครั้งเดียวตอนเริ่มงาน', async () => {
    const { sentChunks, heartbeats } = await tickWith({ members: 1001, op: 'link-members' })

    expect(sentChunks).toHaveLength(3)
    expect(heartbeats).toEqual([['s1', 'worker-a'], ['s1', 'worker-a'], ['s1', 'worker-a']])
  })

  /**
   * (review-19 M2) `heartbeat` คืน `false` แปลว่าอีก worker แย่ง claim ไปแล้ว — เดิมโค้ด log แล้ว
   * เดินหน้าต่อ เขียน cursor ทับผลของเจ้าของใหม่ไปเรื่อย ๆ ทุกชุดที่เหลือ ตอนนี้ต้องหยุดทันทีที่ชุด
   * ที่พบว่าเสีย claim ไป — ชุดที่สี่ไม่ควรได้วิ่งเลย และงานต้องจบแบบ "ไม่ครบ" ไม่ใช่ "ครบ"
   */
  it('(M2) เสีย claim กลางทาง (heartbeat คืน false) → หยุดลูปทันที ไม่วิ่งชุดถัดไป', async () => {
    // 1501 คน = สี่ชุด (500,500,500,1) — เลือกจำนวนนี้เพื่อให้ชุดที่ heartbeat ล้มไม่ใช่ชุดสุดท้าย
    // ของงานพอดี (ถ้าใช้ 1001/สามชุด ชุดที่ 3 จะเป็นชุดสุดท้ายอยู่แล้วโดยธรรมชาติ แยกไม่ออกว่า
    // งานหยุดเพราะเสีย claim หรือเพราะจบงานปกติ)
    const { report, sentChunks, auditRows, cursorPersisted } = await tickWith({
      members: 1501, op: 'link-members', keepClaimFailsAfter: 2,
    })

    // heartbeat ครั้งที่ 1-2 (ท้ายชุดที่ 1, 2) ผ่าน ครั้งที่ 3 (ท้ายชุดที่ 3) ไม่ผ่าน — แต่ตอนนั้น
    // ชุดที่ 3 วิ่งไปแล้วก่อนจะรู้ตัว งานจึงหยุดหลังชุดที่ 3 ไม่ใช่ก่อนมัน และชุดที่ 4 (คนสุดท้าย)
    // ต้องไม่เกิดขึ้นเลย — นี่คือด่านที่พิสูจน์ว่า "หยุดทันที" ไม่ใช่ "log แล้ววิ่งจนจบงานอยู่ดี"
    expect(sentChunks.map((c) => c.length)).toEqual([500, 500, 500])
    // จบแบบ "ไม่ครบ" — เจ้าของใหม่อาจทำต่อหรือไม่ก็ได้ ความพยายามครั้งนี้ตอบแทนไม่ได้
    expect(report).toMatchObject({ done: 1, failed: 0 })
    expect(auditRows[0]).toMatchObject({
      action: 'link-members', result: 'success', after: { linked: 1500, complete: false },
    })
    // cursor ที่ค้างไว้ต้องเป็นตำแหน่งท้ายชุดที่ 3 ไม่ใช่ null — งานยังไม่จบจริง แค่หยุดเพราะเสีย claim
    expect(cursorPersisted).toBe('m01499')
  })

  // คู่ที่พิสูจน์ว่า "หยุดทันที" หมายถึงไม่วิ่งชุดถัดไปจริง ๆ ไม่ใช่แค่ complete: false ที่อาจเกิดจาก
  // เหตุอื่น — ตัดที่ชุดที่ 1 (heartbeat แรกไม่ผ่าน) ต้องเหลือแค่ชุดเดียว ไม่ใช่สามชุดเหมือนงานปกติ
  it('(M2) เสีย claim หลังชุดแรก → ชุดที่สองและสามไม่เกิดขึ้นเลย', async () => {
    const { sentChunks, pointerChecks } = await tickWith({
      members: 1001, op: 'link-members', keepClaimFailsAfter: 0,
    })

    expect(sentChunks.map((c) => c.length)).toEqual([500])
    // pointer ถูกถามก่อนชุดแรกเท่านั้น (เช็คก่อนชุดที่สองไม่มีวันเกิดเพราะลูปหยุดไปก่อนแล้ว)
    expect(pointerChecks()).toBe(1)
  })

  it('ไม่มี ops.members แล้วมีงาน link-members เข้ามา → พังทันที ไม่ใช่ข้ามงานไปเงียบ ๆ', async () => {
    const scheduleRows: ScheduleRow[] = [scheduleRow({ id: 's1', op: 'link-members', cursor: null })]
    const lock = { claim: vi.fn(async () => true), heartbeat: vi.fn(async () => true), release: vi.fn(async () => {}) }
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
        memberRichMenuIdOf: async () => 'richmenu-a',
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
    /** (review-19 M2) เหมือนของ tickWith — คืน true สำเร็จ N ครั้งแรก แล้วคืน false ตั้งแต่ครั้งที่ N+1 */
    keepClaimFailsAfter?: number
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
    let heartbeatCalls = 0
    const heartbeat = vi.fn(async () => {
      heartbeatCalls += 1
      return options.keepClaimFailsAfter === undefined || heartbeatCalls <= options.keepClaimFailsAfter
    })
    const scheduler = createScheduler({
      schedules: {
        ...schedules,
        async update(id, data) { scheduleUpdates.push(data); return schedules.update(id, data) },
      },
      lock: {
        claim: vi.fn(async () => true),
        heartbeat,
        release: vi.fn(async (_id: string, _owner: string, state: 'done' | 'failed', error: string | null) => {
          released = { state, error }
        }),
      },
      ops: {
        menus: listRepo([options.menu ?? menuRow({ id: '1', channelId: '10' })]),
        audit: createAuditWriter({ repo: auditRepo, logger: silent }),
        clientFor: async () => line as never,
        memberRichMenuIdOf: async () => 'richmenu-a',
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
      sentChunks, memberRows, auditRows, scheduleUpdates, heartbeat,
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

  // งานปลดวนหลายชุดในหนึ่ง run() เหมือนงานผูก จึงหมดอายุ claim ระหว่างทางได้เหมือนกันเป๊ะ (item 4)
  it('ต่ออายุ claim ทุกจบชุดเหมือน link-members', async () => {
    const h = unlinkHarness({ members: linkedMembers(501) })
    await h.tick()

    expect(h.sentChunks).toHaveLength(2)
    expect(h.heartbeat.mock.calls).toEqual([['s1', 'worker-a'], ['s1', 'worker-a']])
  })

  /**
   * (review-19 M2) มิเรอร์เทสต์ของฝั่ง link — heartbeat คืน `false` แปลว่าอีก worker แย่ง claim
   * ไปแล้ว ต้องหยุดลูปทันทีแล้วคืนจำนวนที่ปลดไปได้จริง ไม่ใช่วนต่อไปเรื่อย ๆ ('unlink-members'
   * ไม่มี cursor ให้เขียนทับก็จริง แต่ยังยิง bulkUnlink/`members.update` ต่อได้ขณะที่อีก worker
   * อาจกำลังทำแถวเดียวกันอยู่พร้อมกัน ซึ่งไม่ใช่พฤติกรรมที่ควรปล่อยให้เกิด)
   */
  it('(M2) เสีย claim กลางทาง (heartbeat คืน false) → หยุดลูปทันที ไม่วิ่งชุดถัดไป', async () => {
    const h = unlinkHarness({ members: linkedMembers(1001), keepClaimFailsAfter: 1 })
    const report = await h.tick()

    // heartbeat ครั้งที่ 1 (ท้ายชุดที่ 1) ผ่าน ครั้งที่ 2 (ท้ายชุดที่ 2) ไม่ผ่าน → ชุดที่ 3 (คนสุดท้าย)
    // ต้องไม่เกิดขึ้นเลย
    expect(h.sentChunks).toHaveLength(2)
    expect(report).toMatchObject({ done: 1, failed: 0 })
    expect(h.auditRows[0]).toMatchObject({
      action: 'unlink-members', result: 'success', after: { unlinked: 1000 },
    })
  })

  it('เขียน audit unlink-members success พร้อมจำนวนที่ปลดได้จริง', async () => {
    const h = unlinkHarness({ members: linkedMembers(501) })
    await h.tick()

    expect(h.auditRows).toHaveLength(1)
    // richMenuId ที่ปักไว้ตรงนี้คือ id ฝั่ง LINE ('richmenu-a') ไม่ใช่ id ของแถวเมนู ('1') —
    // ตั้งใจตามธรรมเนียมของงานระดับสมาชิก เหตุผลเต็มอยู่ที่ AuditRow.richMenuId ใน types.ts
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
