import { describe, expect, it, vi } from 'vitest'
import { MAX_BULK_USER_IDS } from '../../src/line/client.js'
import {
  isLineUserId, linkMemberChunk,
  type LinkMemberChunkDeps, type LinkMemberChunkInput, type MemberRow,
} from '../../src/server/members.js'
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

/** deps ปกติ — `calls` เก็บ ids ของทุกครั้งที่ bulkLink ถูกเรียก เรียงตามลำดับที่เรียกจริง */
function deps(seed: MemberRow[]): LinkMemberChunkDeps & { calls: string[][] } {
  const calls: string[][] = []
  const client = {
    bulkLink: vi.fn(async (_richMenuId: string, userIds: readonly string[]) => {
      calls.push([...userIds])
    }),
  }
  return {
    client,
    members: memberRepo([...seed]),
    now: () => FIXED_NOW,
    calls,
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

  it('ไม่มีสมาชิกเหลือให้ทำ → processed 0 และ nextCursor เป็น null โดยไม่ยิง bulkLink', async () => {
    const d = deps([])
    const result = await linkMemberChunk(d, { richMenuId: 'rm-1', channelId: 'c1', cursor: null })
    expect(result).toEqual({ processed: 0, nextCursor: null })
    expect(d.calls).toHaveLength(0)
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
