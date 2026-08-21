import { describe, expect, it, vi } from 'vitest'
import { LineAuthError } from '../../src/errors.js'
import { createAuditWriter, errorCodeOf } from '../../src/server/audit.js'
import { REDACTED } from '../../src/server/scrub.js'
import type { AuditRow, Repo } from '../../src/server/types.js'

function fakeRepo(): Repo<AuditRow> & { rows: AuditRow[]; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } {
  const rows: AuditRow[] = []
  return {
    rows,
    async findMany() { return rows },
    async findOne() { return null },
    async create(data) {
      const row = { id: String(rows.length + 1), ...data } as AuditRow
      rows.push(row)
      return row
    },
    update: vi.fn(async () => { throw new Error('audit rows are append-only') }),
    delete: vi.fn(async () => { throw new Error('audit rows are append-only') }),
  }
}

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const context = { actorId: '3', action: 'publish' as const, richMenuId: '9', channelId: '1' }

describe('createAuditWriter', () => {
  it('เขียนแถวพร้อม before/after ที่ผ่าน scrub แล้ว', async () => {
    const repo = fakeRepo()
    await createAuditWriter({ repo, logger: silent }).write({
      ...context,
      before: { status: 'draft', channelAccessToken: 'plain-token' },
      after: { status: 'published' },
      result: 'success',
    })
    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]!.before).toEqual({ status: 'draft', channelAccessToken: REDACTED })
    expect(repo.rows[0]!.after).toEqual({ status: 'published' })
    expect(repo.rows[0]!.errorCode).toBeNull()
  })

  it('around เขียน success พร้อม after ที่ได้จากผลลัพธ์', async () => {
    const repo = fakeRepo()
    const writer = createAuditWriter({ repo, logger: silent })

    const value = await writer.around(
      { ...context, before: { status: 'draft' } },
      async () => ({ lineRichMenuId: 'richmenu-1' }),
      (result) => ({ lineRichMenuId: result.lineRichMenuId }),
    )

    expect(value).toEqual({ lineRichMenuId: 'richmenu-1' })
    expect(repo.rows[0]!.result).toBe('success')
    expect(repo.rows[0]!.after).toEqual({ lineRichMenuId: 'richmenu-1' })
  })

  it('around เขียน failure พร้อม error code แล้วโยน error เดิมต่อ ไม่ใช่ตัวใหม่', async () => {
    const repo = fakeRepo()
    const writer = createAuditWriter({ repo, logger: silent })
    const thrown = new LineAuthError('LINE ปฏิเสธ credential')

    await expect(writer.around(context, async () => { throw thrown }))
      .rejects.toBe(thrown)

    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]!.result).toBe('failure')
    expect(repo.rows[0]!.errorCode).toBe('line_auth_failed')
    // error ธรรมดาที่ไม่มี auditAfter ติดมา ต้องยังได้ after: null เหมือนพฤติกรรมเดิม
    expect(repo.rows[0]!.after).toBeNull()
  })

  /**
   * I7 — error ที่พก `auditAfter` ติดมา (เช่นผลของ compensation ใน publish.ts) ต้องไปโผล่ใน
   * `after` ของแถว failure แทนที่จะเป็น null เสมอ — นี่คือกลไกเดียวที่ทำให้แถว audit ตอบได้ว่า
   * "compensation คืนอะไรสำเร็จบ้าง" โดยที่ audit.ts ไม่ต้องรู้อะไรเกี่ยวกับ publish โดยเฉพาะ
   */
  it('around เขียน failure โดยเอา auditAfter จาก error มาเป็น after เมื่อมี', async () => {
    const repo = fakeRepo()
    const writer = createAuditWriter({ repo, logger: silent })
    const thrown = Object.assign(new LineAuthError('LINE ปฏิเสธ credential'), {
      auditAfter: { defaultRestored: true, aliasRestored: false, keptMenuId: 'richmenu-new-1' },
    })

    await expect(writer.around(context, async () => { throw thrown })).rejects.toBe(thrown)

    expect(repo.rows[0]!.after).toEqual({
      defaultRestored: true, aliasRestored: false, keptMenuId: 'richmenu-new-1',
    })
    // scrub ต้องยังทำงานกับ auditAfter เหมือน after ทุกก้อนอื่น
    expect(repo.rows[0]!.errorCode).toBe('line_auth_failed')
  })

  it('error ที่ไม่มี code ยังได้แถว audit — ไม่ใช่เงียบหาย', async () => {
    const repo = fakeRepo()
    const writer = createAuditWriter({ repo, logger: silent })
    await expect(writer.around(context, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(repo.rows[0]!.errorCode).toBe('unknown_error')
  })

  it('ไม่เคยเรียก update หรือ delete ของ repo เลย — append-only', async () => {
    const repo = fakeRepo()
    const writer = createAuditWriter({ repo, logger: silent })
    await writer.write({ ...context, result: 'success' })
    await writer.around(context, async () => 'ok')
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.delete).not.toHaveBeenCalled()
  })

  it('audit ที่เขียนไม่ลงต้องไม่กลบ error จริงของงาน และต้องถูก log ไว้', async () => {
    const repo = fakeRepo()
    repo.create = async () => { throw new Error('table is gone') }
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const writer = createAuditWriter({ repo, logger })

    await expect(writer.around(context, async () => { throw new LineAuthError('nope') }))
      .rejects.toThrow(LineAuthError)

    expect(logger.error).toHaveBeenCalled()
  })
})

describe('errorCodeOf', () => {
  it('อ่าน code จาก typed error ของ core', () => {
    expect(errorCodeOf(new LineAuthError('x'))).toBe('line_auth_failed')
  })
  it('คืน unknown_error สำหรับอย่างอื่นทั้งหมด', () => {
    expect(errorCodeOf(new Error('x'))).toBe('unknown_error')
    expect(errorCodeOf('a string')).toBe('unknown_error')
    expect(errorCodeOf(null)).toBe('unknown_error')
  })
})
