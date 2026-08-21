import { describe, expect, it, vi } from 'vitest'
import { LineServerError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import { MenuNotReadyError } from '../../src/server/errors.js'
import {
  clearChannelDefault, deleteOrphan, reconcileChannel, setMenuAsDefault, swapMenuAlias,
} from '../../src/server/menu-ops.js'
import type { AuditRow, Repo, RichMenuRow } from '../../src/server/types.js'

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function menuRow(overrides: Partial<RichMenuRow> = {}): RichMenuRow {
  return {
    id: '1', name: 'เมนูหลัก', channelId: '10', size: 'large',
    chatBarText: 'เปิดเมนู', chatBarMode: 'custom', selected: true,
    templateKey: null, areas: [],
    imageFileId: null, areaImages: [],
    normalizedFileId: 900, normalizedMime: 'image/jpeg', normalizedSize: { width: 2500, height: 1686 },
    aliasId: null, status: 'published', lineRichMenuId: 'richmenu-a',
    publishedAt: '2026-08-20T00:00:00.000Z', lastError: null,
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

function repos(seed: RichMenuRow[]) {
  const rows = [...seed]
  const auditRows: AuditRow[] = []
  const menus: Repo<RichMenuRow> = {
    async findMany(params) {
      const filters = params?.filters ?? {}
      return rows.filter((row) => Object.entries(filters).every(
        ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
      ))
    },
    async findOne(id) { return rows.find((row) => row.id === id) ?? null },
    async create(data) { const row = { id: '99', ...data } as RichMenuRow; rows.push(row); return row },
    async update(id, data) {
      const index = rows.findIndex((row) => row.id === id)
      rows[index] = { ...rows[index]!, ...data }
      return rows[index]!
    },
    async delete() {},
  }
  const audit: Repo<AuditRow> = {
    async findMany() { return auditRows },
    async findOne() { return null },
    async create(data) { const row = { id: String(auditRows.length + 1), ...data } as AuditRow; auditRows.push(row); return row },
    async update() { throw new Error('append-only') },
    async delete() { throw new Error('append-only') },
  }
  return { rows, auditRows, menus, audit: createAuditWriter({ repo: audit, logger: silent }) }
}

function client(overrides: Record<string, unknown> = {}) {
  return {
    setDefault: vi.fn(async () => {}),
    clearDefault: vi.fn(async () => {}),
    getDefault: vi.fn(async () => null as string | null),
    getAlias: vi.fn(async () => null as string | null),
    createAlias: vi.fn(async () => {}),
    updateAlias: vi.fn(async () => {}),
    listRichMenus: vi.fn(async () => [] as { richMenuId: string }[]),
    ...overrides,
  } as never
}

describe('setMenuAsDefault', () => {
  it('ตั้ง default บน LINE แล้วเขียน audit ที่บอกว่าจากอะไรเป็นอะไร', async () => {
    const { menus, audit, auditRows } = repos([menuRow()])
    const line = client({ getDefault: vi.fn(async () => 'richmenu-old') })

    await setMenuAsDefault({ client: line, menus, audit }, { menuId: '1', actorId: '3' })

    expect((line as unknown as { setDefault: ReturnType<typeof vi.fn> }).setDefault)
      .toHaveBeenCalledWith('richmenu-a')
    expect(auditRows[0]).toMatchObject({
      action: 'set-default', result: 'success', actorId: '3', channelId: '10',
      before: { defaultRichMenuId: 'richmenu-old' },
      after: { defaultRichMenuId: 'richmenu-a' },
    })
  })

  it('เมนูที่ยังไม่ publish ตั้ง default ไม่ได้', async () => {
    const { menus, audit } = repos([menuRow({ status: 'draft', lineRichMenuId: null })])
    await expect(setMenuAsDefault({ client: client(), menus, audit }, { menuId: '1', actorId: null }))
      .rejects.toBeInstanceOf(MenuNotReadyError)
  })

  it('LINE ล้ม → ยังมีแถว audit ที่บอกว่าล้มด้วย code อะไร', async () => {
    const { menus, audit, auditRows } = repos([menuRow()])
    const line = client({ setDefault: vi.fn(async () => { throw new LineServerError(503) }) })

    await expect(setMenuAsDefault({ client: line, menus, audit }, { menuId: '1', actorId: '3' }))
      .rejects.toBeInstanceOf(LineServerError)

    expect(auditRows[0]).toMatchObject({ action: 'set-default', result: 'failure', errorCode: 'line_server_error' })
  })
})

describe('clearChannelDefault', () => {
  it('ล้าง default แล้วเขียน audit', async () => {
    const { menus, audit, auditRows } = repos([menuRow()])
    const line = client({ getDefault: vi.fn(async () => 'richmenu-a') })

    await clearChannelDefault({ client: line, menus, audit }, { channelId: '10', actorId: '3' })

    expect((line as unknown as { clearDefault: ReturnType<typeof vi.fn> }).clearDefault).toHaveBeenCalled()
    expect(auditRows[0]).toMatchObject({
      action: 'clear-default', result: 'success', richMenuId: null, channelId: '10',
      before: { defaultRichMenuId: 'richmenu-a' }, after: { defaultRichMenuId: null },
    })
  })
})

describe('swapMenuAlias', () => {
  it('ยังไม่มี alias นั้นบน LINE → สร้างใหม่', async () => {
    const { menus, audit } = repos([menuRow({ aliasId: 'tab-a' })])
    const line = client()
    await swapMenuAlias({ client: line, menus, audit }, { menuId: '1', actorId: '3' })
    expect((line as unknown as { createAlias: ReturnType<typeof vi.fn> }).createAlias)
      .toHaveBeenCalledWith('tab-a', 'richmenu-a')
  })

  it('มี alias อยู่แล้ว → ชี้ใหม่ ไม่ใช่สร้างซ้ำ', async () => {
    const { menus, audit, auditRows } = repos([menuRow({ aliasId: 'tab-a' })])
    const line = client({ getAlias: vi.fn(async () => 'richmenu-previous') })

    await swapMenuAlias({ client: line, menus, audit }, { menuId: '1', actorId: '3' })

    expect((line as unknown as { updateAlias: ReturnType<typeof vi.fn> }).updateAlias)
      .toHaveBeenCalledWith('tab-a', 'richmenu-a')
    expect(auditRows[0]).toMatchObject({
      action: 'swap-alias',
      before: { aliasId: 'tab-a', richMenuId: 'richmenu-previous' },
      after: { aliasId: 'tab-a', richMenuId: 'richmenu-a' },
    })
  })

  it('เมนูที่ไม่มี alias สลับไม่ได้', async () => {
    const { menus, audit } = repos([menuRow({ aliasId: null })])
    await expect(swapMenuAlias({ client: client(), menus, audit }, { menuId: '1', actorId: null }))
      .rejects.toBeInstanceOf(MenuNotReadyError)
  })
})

describe('reconcileChannel', () => {
  it('รายงานเมนูบน LINE ที่ไม่มีใน DB และเมนูใน DB ที่หายไปจาก LINE — ไม่ลบอะไรเลย', async () => {
    const { menus, audit } = repos([
      menuRow({ id: '1', lineRichMenuId: 'richmenu-a' }),
      menuRow({ id: '2', lineRichMenuId: 'richmenu-gone' }),
    ])
    const line = client({
      listRichMenus: vi.fn(async () => [{ richMenuId: 'richmenu-a' }, { richMenuId: 'richmenu-stray' }]),
    })

    const report = await reconcileChannel({ client: line, menus, audit }, { channelId: '10' })

    expect(report).toEqual({ orphans: ['richmenu-stray'], missing: ['richmenu-gone'] })
  })
})

describe('deleteOrphan', () => {
  it('ยืนยันซ้ำว่ายังกำพร้าจริงก่อนลบ แล้วเขียน audit ว่าลบสำเร็จ', async () => {
    const { menus, audit, auditRows } = repos([menuRow({ id: '1', lineRichMenuId: 'richmenu-a' })])
    const line = client({
      listRichMenus: vi.fn(async () => [{ richMenuId: 'richmenu-a' }, { richMenuId: 'richmenu-stray' }]),
      deleteRichMenu: vi.fn(async () => {}),
    })

    await deleteOrphan(
      { client: line, menus, audit },
      { channelId: '10', lineRichMenuId: 'richmenu-stray', actorId: '3' },
    )

    expect((line as unknown as { deleteRichMenu: ReturnType<typeof vi.fn> }).deleteRichMenu)
      .toHaveBeenCalledWith('richmenu-stray')
    expect(auditRows[0]).toMatchObject({
      action: 'delete', result: 'success', actorId: '3', channelId: '10',
      before: { lineRichMenuId: 'richmenu-stray' }, after: null,
    })
  })

  // หัวใจของ task นี้ — รายงานที่ผู้ใช้เห็นอาจเก่าไปหลายนาทีแล้ว เมนูนี้ "มีชีวิต" อยู่จริง
  // (แถวใน DB อ้างถึงมัน) ถ้า deleteOrphan เชื่อ id ที่ client ส่งมาโดยไม่เรียก reconcileChannel
  // ใหม่ ผู้ใช้ที่มีสิทธิ์ publish จะลบเมนูที่กำลังใช้งานอยู่ได้ด้วยการเดา id — เอาการตรวจซ้ำออกเมื่อไหร่
  // เทสต์นี้ต้องแดงทันที
  it('ปฏิเสธ id ที่ตรวจซ้ำแล้วไม่ใช่กำพร้า และไม่ยิง DELETE ให้ LINE เด็ดขาด', async () => {
    const { menus, audit } = repos([menuRow({ id: '1', lineRichMenuId: 'richmenu-live' })])
    const line = client({
      listRichMenus: vi.fn(async () => [{ richMenuId: 'richmenu-live' }]),
      deleteRichMenu: vi.fn(async () => {}),
    })

    await expect(deleteOrphan(
      { client: line, menus, audit },
      { channelId: '10', lineRichMenuId: 'richmenu-live', actorId: '3' },
    )).rejects.toBeInstanceOf(MenuNotReadyError)

    expect((line as unknown as { deleteRichMenu: ReturnType<typeof vi.fn> }).deleteRichMenu).not.toHaveBeenCalled()
  })

  it('id ที่ไม่เคยอยู่บน LINE เลยก็ถูกปฏิเสธเหมือนกัน', async () => {
    const { menus, audit } = repos([])
    const line = client({ listRichMenus: vi.fn(async () => []) })

    await expect(deleteOrphan(
      { client: line, menus, audit },
      { channelId: '10', lineRichMenuId: 'richmenu-nowhere', actorId: null },
    )).rejects.toBeInstanceOf(MenuNotReadyError)
  })

  it('LINE ล้ม → ยังมีแถว audit ที่บอกว่าล้มด้วย code อะไร', async () => {
    const { menus, audit, auditRows } = repos([menuRow({ id: '1', lineRichMenuId: 'richmenu-a' })])
    const line = client({
      listRichMenus: vi.fn(async () => [{ richMenuId: 'richmenu-a' }, { richMenuId: 'richmenu-stray' }]),
      deleteRichMenu: vi.fn(async () => { throw new LineServerError(503) }),
    })

    await expect(deleteOrphan(
      { client: line, menus, audit },
      { channelId: '10', lineRichMenuId: 'richmenu-stray', actorId: '3' },
    )).rejects.toBeInstanceOf(LineServerError)

    expect(auditRows[0]).toMatchObject({
      action: 'delete', result: 'failure', errorCode: 'line_server_error',
      before: { lineRichMenuId: 'richmenu-stray' },
    })
  })
})
