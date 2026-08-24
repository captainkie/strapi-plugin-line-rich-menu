import { describe, expect, it, vi } from 'vitest'
import { MAX_BULK_USER_IDS } from '../../src/line/client.js'
import {
  isLineUserId, linkMemberChunk, unlinkMemberChunk,
  type LinkMemberChunkDeps, type LinkMemberChunkInput, type MemberRow,
  type UnlinkMemberChunkDeps,
} from '../../src/server/members.js'
import { RowVanishedError } from '../../src/server/errors.js'
import type { ListParams, Repo } from '../../src/server/types.js'

const FIXED_NOW = new Date('2026-08-22T00:00:00.000Z')

function members(n: number): MemberRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${String(i).padStart(5, '0')}`,
    channelId: 'c1',
    lineUserId: `U${String(i).padStart(32, '0')}`,
    displayName: null,
    linkedRichMenuId: null,
    linkedAt: null,
  }))
}

/**
 * เลียนแบบ adapter จริง (Task 5/6) เท่าที่ linkMemberChunk ต้องใช้: `filters.channelId` เทียบเท่า
 * ตรง ๆ และ `idGreaterThan` คือ keyset — เทียบด้วย string compare ตรง ๆ เพราะ id ในเทสต์นี้
 * (`m00000`..`m0NNNN`) มีความยาวเท่ากันทุกตัว ลำดับ string จึงตรงกับลำดับตัวเลขพอดี
 *
 * ตั้งใจไม่รองรับ `start` (offset) เลย — ถ้าใครเพิ่มให้ทีหลัง (เช่นเพื่อเทสต์อื่น) ต้องกลับไปดู
 * เทสต์ "ลบสมาชิกระหว่างงานวิ่ง..." ด้านล่างใหม่ทันที เพราะตอนนี้เทสต์นั้นจับบั๊ก offset ได้
 * ส่วนหนึ่งจาก mock ไม่รู้จัก `start` (เสิร์ฟหน้าแรกซ้ำ) การเติม `start` เข้าไปโดยไม่เช็ค query shape
 * คู่กัน (ดู `queries` ใน `deps`) จะทำให้เทสต์นั้นจับบั๊กจริงไม่ได้อีกต่อไปแบบไม่มีใครรู้ตัว
 */
function memberRepo(rows: MemberRow[]): Repo<MemberRow> {
  return {
    async findMany(params?: ListParams) {
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
    async create(data) { const row = { id: String(rows.length + 1), ...data } as MemberRow; rows.push(row); return row },
    async update(id, data) {
      const index = rows.findIndex((row) => row.id === id)
      rows[index] = { ...rows[index]!, ...data }
      return rows[index]!
    },
    async delete(id) {
      const index = rows.findIndex((row) => row.id === id)
      if (index >= 0) rows.splice(index, 1)
    },
  }
}

/**
 * deps ปกติ — `calls` เก็บ ids ของทุกครั้งที่ bulkLink ถูกเรียก, `queries` เก็บ ListParams
 * ที่ `findMany` ได้รับจริง เรียงตามลำดับที่เรียก ทั้งคู่ใช้ยืนยัน "เรียกยังไง" ไม่ใช่แค่ "ได้อะไรกลับมา"
 * — คนละอย่างกัน: mock ที่ไม่สมบูรณ์ (เช่นไม่รู้จัก `start`) ยังทำให้ assertion บนผลลัพธ์ผ่านได้
 * ทั้งที่ query ที่ยิงจริงผิด (ดูคอมเมนต์บน `memberRepo`)
 */
function deps(seed: MemberRow[]): LinkMemberChunkDeps & {
  calls: string[][]
  queries: ListParams[]
  /** richMenuId ที่ `bulkLink` ได้รับจริงในแต่ละชุด — ของปลอมเดิมรับเป็น `_richMenuId` แล้วทิ้ง
   * ซึ่งเป็นรูปเดียวกับที่ทำให้บั๊ก "ส่ง id ของแถวในฐานข้อมูลไปให้ LINE" รอดมาสามรอบรีวิว */
  linkTargets: string[]
  /** ข้อความ debug ที่โค้ดเขียนจริง — แถวที่หายไประหว่างงานวิ่งต้องมีที่ลง ไม่ใช่หายเงียบ */
  debugLogs: { message: string; meta: Record<string, unknown> }[]
} {
  const calls: string[][] = []
  const queries: ListParams[] = []
  const linkTargets: string[] = []
  const debugLogs: { message: string; meta: Record<string, unknown> }[] = []
  const repo = memberRepo([...seed])
  const client = {
    bulkLink: vi.fn(async (richMenuId: string, userIds: readonly string[]) => {
      linkTargets.push(richMenuId)
      calls.push([...userIds])
    }),
  }
  return {
    client,
    members: {
      ...repo,
      async findMany(params) {
        queries.push(params ?? {})
        return repo.findMany(params)
      },
    },
    now: () => FIXED_NOW,
    logger: {
      debug: (message: unknown, meta?: unknown) => {
        debugLogs.push({ message: String(message), meta: (meta ?? {}) as Record<string, unknown> })
      },
      info: () => {}, warn: () => {}, error: () => {},
    },
    calls,
    queries,
    linkTargets,
    debugLogs,
  }
}

/** ids ที่ deps ตัวนี้เห็นผ่าน bulkLink ทั้งหมด รวมทุก chunk ที่วิ่งผ่าน deps ตัวเดียวกัน */
function idsSentBy(d: { calls: string[][] }): string[] {
  return d.calls.flat()
}

/** deps ที่บันทึกทุก patch ที่ `members.update` ได้รับ ไว้ใน `updates` ให้เทสต์ตรวจสอบ */
function depsRecording(seed: MemberRow[], updates: Record<string, unknown>[]): LinkMemberChunkDeps {
  const base = deps(seed)
  return {
    ...base,
    members: {
      ...base.members,
      async update(id, data) {
        updates.push(data as Record<string, unknown>)
        return base.members.update(id, data)
      },
    },
  }
}

/**
 * วิ่ง linkMemberChunk ซ้ำจน nextCursor เป็น null บน deps ตัวเดียว (จำลอง scheduler ที่วิ่งหลายรอบ)
 * เรียก `onChunk` ด้วย ids ของแต่ละรอบ — ใช้เทสต์เรื่องขนาด chunk และการไม่ตกหล่น
 */
async function drain(
  seed: MemberRow[],
  onChunk: (ids: readonly string[]) => void,
): Promise<{ processed: number }> {
  const d = deps(seed)
  const input: Omit<LinkMemberChunkInput, 'cursor'> = { richMenuId: 'rm-1', channelId: 'c1' }
  let cursor: string | null = null
  let processed = 0
  for (;;) {
    const before = d.calls.length
    const result = await linkMemberChunk(d, { ...input, cursor })
    if (result.processed === 0) break
    onChunk(d.calls[before]!)
    processed += result.processed
    if (result.nextCursor === null) break
    cursor = result.nextCursor
  }
  return { processed }
}

describe('linkMemberChunk', () => {
  it('ส่งทีละ 500 ไม่เกินนั้น และไม่ตกหล่นสักคน', async () => {
    const sent: string[][] = []
    const { processed } = await drain(members(1001), (ids) => { sent.push([...ids]) })
    expect(sent.map((s) => s.length)).toEqual([500, 500, 1])
    expect(processed).toBe(1001)
    expect(new Set(sent.flat()).size).toBe(1001)
  })

  it('เดินต่อจาก cursor ไม่ใช่เริ่มใหม่', async () => {
    const all = members(1001)
    const first = await linkMemberChunk(deps(all), { richMenuId: 'rm-1', channelId: 'c1', cursor: null })
    expect(first.processed).toBe(500)
    const second = await linkMemberChunk(deps(all), { richMenuId: 'rm-1', channelId: 'c1', cursor: first.nextCursor })
    expect(second.processed).toBe(500)
    expect(second.nextCursor).not.toBe(first.nextCursor)
  })

  /**
   * เหตุผลที่ cursor เป็น id ไม่ใช่ offset — ลบคนกลางทางแล้ว offset จะข้ามคนถัดไปเงียบ ๆ
   * เพราะทุกแถวหลังจากนั้นเลื่อนขึ้นหนึ่งตำแหน่ง
   */
  it('ลบสมาชิกระหว่างงานวิ่งแล้วต้องไม่ข้ามใคร', async () => {
    const all = members(600)
    const seen: string[] = []
    const d1 = deps(all)
    const first = await linkMemberChunk(d1, { richMenuId: 'rm-1', channelId: 'c1', cursor: null })
    seen.push(...idsSentBy(d1))
    const shrunk = all.filter((m) => m.id !== 'm00010') // ลบคนที่อยู่ในชุดแรกไปแล้ว
    const d2 = deps(shrunk)
    await linkMemberChunk(d2, { richMenuId: 'rm-1', channelId: 'c1', cursor: first.nextCursor })
    seen.push(...idsSentBy(d2))
    const expected = shrunk.map((m) => m.lineUserId)
    expect(expected.every((u) => seen.includes(u))).toBe(true)

    // ยืนยันกลไก ไม่ใช่แค่ผลลัพธ์ — assertion บนสุดผ่านได้แม้ code ถูกเขียนใหม่เป็น offset paging
    // ถ้า mock ดันไม่รองรับ `start` (มันไม่รองรับจริง ๆ ในไฟล์นี้) เพราะงั้น "start ไม่ถูกส่งเลย และ
    // idGreaterThan ถูกส่งด้วยค่าที่ถูกต้อง" ต้องเช็คตรง ๆ ที่ query ไม่ใช่เดาจากผลลัพธ์ที่ได้กลับมา
    expect(d2.queries[0]).toMatchObject({ idGreaterThan: first.nextCursor })
    expect(d2.queries[0]).not.toHaveProperty('start')
  })

  it('บันทึก linkedRichMenuId/linkedAt ให้ทุกคนที่ส่งสำเร็จ', async () => {
    const all = members(3)
    const updates: Record<string, unknown>[] = []
    await linkMemberChunk(depsRecording(all, updates), { richMenuId: 'rm-1', channelId: 'c1', cursor: null })
    expect(updates).toHaveLength(3)
    expect(updates[0]).toMatchObject({ linkedRichMenuId: 'rm-1' })
    expect(typeof (updates[0] as { linkedAt: unknown }).linkedAt).toBe('string')
  })

  it('channel อื่นไม่ปนกัน — filters.channelId คัดก่อน keyset', async () => {
    const other: MemberRow = {
      id: 'm-other', channelId: 'c2', lineUserId: `U${'9'.repeat(32)}`,
      displayName: null, linkedRichMenuId: null, linkedAt: null,
    }
    const d = deps([...members(2), other])
    const result = await linkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1', cursor: null })
    expect(result.processed).toBe(2)
    expect(idsSentBy(d)).not.toContain(other.lineUserId)
  })

  /**
   * (Task 19 item 3) สมาชิกหนึ่งคนถูกลบไประหว่างที่งานกำลังวิ่ง — ไดรเวอร์ของทั้งสอง Strapi คืน
   * `null` ไม่ใช่ throw แล้ว `toRow(null)` ระเบิดเป็น TypeError เดิมทั้งงานถูกทำเครื่องหมาย failed
   * cursor ค้างที่เดิม และ chunk ที่เหลือ (อาจเป็นหมื่นคน) ไม่เคยได้วิ่งเลย — คนหนึ่งคนที่หายไป
   * ทำให้ทุกคนที่เหลือไม่ได้เมนู
   *
   * ไม่เช็คแค่ "ไม่ throw" — ต้องพิสูจน์ว่าคนที่เหลือ**ยังถูกเขียนค่ากลับจริง** และแถวที่หายไปถูก
   * นับและบันทึกไว้ ไม่ใช่หายเงียบ
   */
  it('สมาชิกที่หายไปกลางชุด ถูกข้ามและนับไว้ — คนที่เหลือยังถูกเขียนค่ากลับครบ', async () => {
    const d = deps(members(3))
    const written: string[] = []
    const inner = d.members.update.bind(d.members)
    d.members.update = async (id, data) => {
      if (id === 'm00001') throw new RowVanishedError('plugin::line-rich-menu.line-member', id)
      written.push(id)
      return inner(id, data)
    }

    const result = await linkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1', cursor: null })

    expect(result).toMatchObject({ processed: 3, vanished: 1 })
    // คนที่เหลือทั้งสองคนต้องถูกเขียน ไม่ใช่หยุดที่คนแรกที่พัง
    expect(written).toEqual(['m00000', 'm00002'])
    // และต้องมีร่องรอย ไม่ใช่ข้ามเงียบ ๆ (ruling ข้อ 3 บอกไว้ตรง ๆ ว่า "log at debug with a count")
    expect(d.debugLogs).toHaveLength(1)
    expect(d.debugLogs[0]!.meta).toMatchObject({ vanished: 1 })
  })

  /**
   * ครึ่งที่ทำให้ข้อข้างบนไม่กลายเป็นการกลืน error ทั้งหมด — DB ล่มหรือสิทธิ์ไม่พอต้องยังทำให้งาน
   * ล้มเหมือนเดิม การจับด้วย `try` ก้อนเดียวรอบทั้ง chunk (ทางที่ ruling ห้ามไว้) จะทำให้ด่านนี้แดง
   */
  it('error อื่นที่ไม่ใช่ RowVanishedError ยังทำให้งานล้มเหมือนเดิม ไม่ถูกกลืนรวมไปด้วย', async () => {
    const d = deps(members(3))
    d.members.update = async () => { throw new Error('database is down') }

    await expect(linkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1', cursor: null }))
      .rejects.toThrow(/database is down/)
  })

  // ของปลอมเดิมรับ richMenuId แล้วทิ้ง — รูปเดียวกับที่ทำให้ Task 9 Critical รอดสามรอบรีวิว
  it('ส่ง richMenuId ที่ผู้เรียกให้มาไปถึง bulkLink จริง ไม่ใช่ค่าอื่น', async () => {
    const d = deps(members(2))
    await linkMemberChunk(d, { richMenuId: 'rm-line-9', channelId: 'c1', cursor: null })
    expect(d.linkTargets).toEqual(['rm-line-9'])
  })

  it('ไม่มีสมาชิกเหลือให้ทำ → processed 0 และ nextCursor เป็น null โดยไม่ยิง bulkLink', async () => {
    const d = deps([])
    const result = await linkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1', cursor: null })
    expect(result).toEqual({ processed: 0, nextCursor: null, vanished: 0 })
    expect(d.calls).toHaveLength(0)
  })
})

/** สมาชิกที่ "ถือเมนูอยู่จริง" — จุดตั้งต้นของทุกเทสต์ unlink (link เริ่มจากคนที่ยังไม่ถือ) */
function linked(n: number, richMenuId = 'rm-1', channelId = 'c1'): MemberRow[] {
  return members(n).map((row) => ({
    ...row, channelId, linkedRichMenuId: richMenuId, linkedAt: '2026-08-01T00:00:00.000Z',
  }))
}

function unlinkDeps(seed: MemberRow[]): UnlinkMemberChunkDeps & {
  rows: MemberRow[]; calls: string[][]; queries: ListParams[]
  debugLogs: { message: string; meta: Record<string, unknown> }[]
} {
  const rows = seed.map((row) => ({ ...row }))
  const calls: string[][] = []
  const queries: ListParams[] = []
  const debugLogs: { message: string; meta: Record<string, unknown> }[] = []
  const repo = memberRepo(rows)
  return {
    logger: {
      debug: (message: unknown, meta?: unknown) => {
        debugLogs.push({ message: String(message), meta: (meta ?? {}) as Record<string, unknown> })
      },
      info: () => {}, warn: () => {}, error: () => {},
    },
    debugLogs,
    client: { bulkUnlink: vi.fn(async (userIds: readonly string[]) => { calls.push([...userIds]) }) },
    members: {
      ...repo,
      async findMany(params) {
        queries.push(params ?? {})
        return repo.findMany(params)
      },
    },
    rows,
    calls,
    queries,
  }
}

describe('unlinkMemberChunk', () => {
  it('ยิง bulkUnlink ชุดเดียวไม่เกินเพดาน แล้วล้าง linkedRichMenuId/linkedAt ของแถวที่ปลดแล้ว', async () => {
    const d = unlinkDeps(linked(MAX_BULK_USER_IDS + 1))
    const result = await unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' })

    expect(result.processed).toBe(MAX_BULK_USER_IDS)
    expect(d.calls).toHaveLength(1)
    expect(d.calls[0]).toHaveLength(MAX_BULK_USER_IDS)
    expect(d.rows[0]).toMatchObject({ linkedRichMenuId: null, linkedAt: null })
    // แถวที่ยังไม่ถึงคิว (เกินเพดาน) ต้องยังถือเมนูอยู่ ไม่ถูกล้างเหมาทั้งตาราง
    expect(d.rows[MAX_BULK_USER_IDS]).toMatchObject({ linkedRichMenuId: 'rm-1' })
  })

  it('ปลดเฉพาะคนที่ถือเมนูนี้ใน channel นี้ — เมนูอื่นและ channel อื่นไม่ถูกแตะ', async () => {
    const otherMenu: MemberRow = {
      id: 'm-other-menu', channelId: 'c1', lineUserId: `U${'8'.repeat(32)}`,
      displayName: null, linkedRichMenuId: 'rm-9', linkedAt: '2026-08-01T00:00:00.000Z',
    }
    const otherChannel: MemberRow = {
      id: 'm-other-channel', channelId: 'c2', lineUserId: `U${'9'.repeat(32)}`,
      displayName: null, linkedRichMenuId: 'rm-1', linkedAt: '2026-08-01T00:00:00.000Z',
    }
    const d = unlinkDeps([...linked(2), otherMenu, otherChannel])

    const result = await unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' })

    expect(result.processed).toBe(2)
    expect(d.calls[0]).not.toContain(otherMenu.lineUserId)
    expect(d.calls[0]).not.toContain(otherChannel.lineUserId)
    // เช็คที่ query ด้วย ไม่ใช่แค่ผลลัพธ์ — repo ของ adapter ที่เมิน filter ตัวใดตัวหนึ่งจะให้ผล
    // ถูกโดยบังเอิญได้ถ้าข้อมูลในเทสต์บังเอิญไม่ชน (ดูคอมเมนต์บน `deps` ของ linkMemberChunk)
    expect(d.queries[0]?.filters).toEqual({ channelId: 'c1', linkedRichMenuId: 'rm-1' })
  })

  it('วิ่งซ้ำบน repo เดิมไปต่อจากที่ค้างได้เองโดยไม่มี cursor — ไม่มี query ไหนพก idGreaterThan', async () => {
    const d = unlinkDeps(linked(MAX_BULK_USER_IDS + 1))

    const first = await unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' })
    const second = await unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' })
    const third = await unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' })

    expect([first.processed, second.processed, third.processed]).toEqual([MAX_BULK_USER_IDS, 1, 0])
    // ชุดที่สองต้องเป็น "คนที่เหลือ" ไม่ใช่คนเดิมชุดแรกซ้ำ ทั้งที่ไม่มีใครบอกตำแหน่งให้เลย
    expect(d.calls[1]).toEqual([d.rows[MAX_BULK_USER_IDS]!.lineUserId])
    expect(d.queries.every((query) => query.idGreaterThan === undefined && query.start === undefined)).toBe(true)
  })

  it('bulkUnlink ล้ม → ไม่มีแถวไหนถูกล้าง คนกลุ่มนั้นยังหาเจอในรอบถัดไป', async () => {
    const d = unlinkDeps(linked(3))
    d.client.bulkUnlink = vi.fn(async () => { throw new Error('line down') })

    await expect(unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' })).rejects.toThrow('line down')
    expect(d.rows.every((row) => row.linkedRichMenuId === 'rm-1')).toBe(true)
  })

  /** (Task 19 item 3) คู่ขนานกับฝั่ง link — แถวที่หายไประหว่างทางต้องไม่ทำให้งานปลดทั้งงานล้ม */
  it('สมาชิกที่หายไปกลางชุด ถูกข้ามและนับไว้ — คนที่เหลือยังถูกล้างค่าครบ', async () => {
    const d = unlinkDeps(linked(3))
    const written: string[] = []
    const inner = d.members.update.bind(d.members)
    d.members.update = async (id, data) => {
      if (id === 'm00001') throw new RowVanishedError('plugin::line-rich-menu.line-member', id)
      written.push(id)
      return inner(id, data)
    }

    const result = await unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' })

    expect(result).toMatchObject({ processed: 3 })
    expect(written).toEqual(['m00000', 'm00002'])
    expect(d.debugLogs).toHaveLength(1)
    expect(d.debugLogs[0]!.meta).toMatchObject({ vanished: 1 })
  })

  it('error อื่นที่ไม่ใช่ RowVanishedError ยังทำให้งานปลดล้มเหมือนเดิม', async () => {
    const d = unlinkDeps(linked(3))
    d.members.update = async () => { throw new Error('database is down') }

    await expect(unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' }))
      .rejects.toThrow(/database is down/)
  })

  it('ไม่มีใครถือเมนูนี้แล้ว → processed 0, lastId null และไม่ยิง bulkUnlink', async () => {
    const d = unlinkDeps(linked(2, 'rm-9'))
    const result = await unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' })
    expect(result).toEqual({ processed: 0, lastId: null })
    expect(d.calls).toHaveLength(0)
  })

  // lastId ไม่ใช่ cursor — มันคือสัญญาณให้ผู้เรียกที่วนลูป (scheduler) รู้ว่าชุดถัดไปเป็นแถวเดิมซ้ำ
  // แปลว่า repo ไม่เคยล้างค่าให้จริง ต้องล้มงานทิ้ง ไม่ใช่วนต่อจนค้างทั้ง process
  it('lastId คือ id ของแถวสุดท้ายในชุดที่เพิ่งทำ', async () => {
    const d = unlinkDeps(linked(3))
    const result = await unlinkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1' })
    expect(result.lastId).toBe('m00002')
  })
})

describe('isLineUserId', () => {
  it('ยอมเฉพาะ U + hex 32 ตัว', () => {
    expect(isLineUserId(`U${'a'.repeat(32)}`)).toBe(true)
    expect(isLineUserId(`U${'a'.repeat(31)}`)).toBe(false)
    expect(isLineUserId(`X${'a'.repeat(32)}`)).toBe(false)
    expect(isLineUserId(`U${'A'.repeat(32)}`)).toBe(false) // LINE ใช้ตัวพิมพ์เล็ก
  })
})

// ยืนยันว่า members.ts อ้างเพดานเดียวกับ LINE client จริง ๆ ไม่ใช่เลข 500 ที่จดไว้อีกที่แยกกัน —
// ถ้าใครเปลี่ยน MAX_BULK_USER_IDS แล้วลืม members.ts เทสต์นี้ต้องเป็นตัวที่ฟ้อง
it('chunk size ผูกกับ MAX_BULK_USER_IDS ของ LINE client ตัวเดียวกัน ไม่ประกาศแยก', () => {
  expect(MAX_BULK_USER_IDS).toBe(500)
})
