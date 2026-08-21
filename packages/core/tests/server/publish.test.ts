import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { LineNotFoundError, LineServerError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import { MenuNotFoundError, MenuNotReadyError, PublishRateLimitedError } from '../../src/server/errors.js'
import { createRateLimiter } from '../../src/server/rate-limit.js'
import { publishMenu } from '../../src/server/publish.js'
import type { ImageStore } from '../../src/server/images.js'
import type { AuditRow, Repo, RichMenuRow } from '../../src/server/types.js'

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function menuRow(overrides: Partial<RichMenuRow> = {}): RichMenuRow {
  return {
    id: '1', name: 'เมนูหลัก', channelId: '10', size: 'large',
    chatBarText: 'เปิดเมนู', chatBarMode: 'custom', selected: true,
    templateKey: 'RICH_MENU_TEMPLATE_201',
    areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
    imageFileId: 11, areaImages: [],
    normalizedFileId: 900, normalizedMime: 'image/jpeg',
    normalizedSize: { width: 2500, height: 1686 },
    aliasId: null, status: 'draft', lineRichMenuId: null, publishedAt: null, lastError: null,
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

function menuRepo(seed: RichMenuRow[]): Repo<RichMenuRow> & { rows: RichMenuRow[] } {
  const rows = [...seed]
  return {
    rows,
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
}

function auditRepo(): Repo<AuditRow> & { rows: AuditRow[] } {
  const rows: AuditRow[] = []
  return {
    rows,
    async findMany() { return rows },
    async findOne() { return null },
    async create(data) { const row = { id: String(rows.length + 1), ...data } as AuditRow; rows.push(row); return row },
    async update() { throw new Error('append-only') },
    async delete() { throw new Error('append-only') },
  }
}

/** LINE จำลองที่จำสถานะจริง เพื่อให้ assert ได้ว่า compensation คืนสถานะครบ */
function fakeLine(initial: { defaultId?: string | null; aliases?: Record<string, string> } = {}) {
  const calls: string[] = []
  const state = {
    menus: new Set<string>(initial.defaultId ? [initial.defaultId] : []),
    aliases: new Map<string, string>(Object.entries(initial.aliases ?? {})),
    defaultId: initial.defaultId ?? null,
  }
  let counter = 0
  const failures = new Map<string, Error>()
  return {
    calls, state, failAt: (call: string, error: Error) => failures.set(call, error),
    client: {
      async validateRichMenu() { calls.push('validate'); const f = failures.get('validate'); if (f) throw f },
      async createRichMenu() {
        calls.push('create')
        const f = failures.get('create'); if (f) throw f
        const id = `richmenu-new-${++counter}`
        state.menus.add(id)
        return id
      },
      async uploadContent() { calls.push('upload'); const f = failures.get('upload'); if (f) throw f },
      async createAlias(aliasId: string, richMenuId: string) {
        calls.push('createAlias')
        const f = failures.get('createAlias'); if (f) throw f
        state.aliases.set(aliasId, richMenuId)
      },
      async updateAlias(aliasId: string, richMenuId: string) {
        calls.push('updateAlias')
        const f = failures.get('updateAlias'); if (f) throw f
        state.aliases.set(aliasId, richMenuId)
      },
      async deleteAlias(aliasId: string) { calls.push('deleteAlias'); state.aliases.delete(aliasId) },
      async setDefault(id: string) {
        calls.push('setDefault')
        const f = failures.get('setDefault'); if (f) throw f
        state.defaultId = id
      },
      async clearDefault() { calls.push('clearDefault'); state.defaultId = null },
      async deleteRichMenu(id: string) {
        calls.push('deleteRichMenu')
        // คีย์แบบเจาะจง id มีไว้ให้สั่ง `deleteOld` ล้มได้โดยที่การลบเมนูที่เพิ่งสร้าง
        // (ซึ่งเป็น deleteRichMenu เหมือนกัน) ยังทำงาน — ไม่งั้นแยกไม่ออกว่าเมนูใหม่ค้าง
        // เพราะ compensation พัง หรือเพราะเราสั่งให้ API ตัวนั้นล้มทั้งตัว
        const f = failures.get(`deleteRichMenu:${id}`) ?? failures.get('deleteRichMenu')
        if (f) throw f
        state.menus.delete(id)
      },
      async getDefault() { return state.defaultId },
      async getAlias(aliasId: string) { return state.aliases.get(aliasId) ?? null },
    },
  }
}

function imageStore(): ImageStore & { write: ReturnType<typeof vi.fn> } {
  return {
    async read() { return Buffer.from('normalized-bytes') },
    write: vi.fn(async () => ({ id: 0 })),
  }
}

function deps(line: ReturnType<typeof fakeLine>, menus: Repo<RichMenuRow>, audit = auditRepo()) {
  return {
    audit,
    deps: {
      client: line.client as never,
      menus,
      audit: createAuditWriter({ repo: audit, logger: silent }),
      limiter: createRateLimiter({ capacity: 10, refillPerMinute: 60 }),
      store: imageStore(),
      logger: silent,
      now: () => new Date('2026-08-21T00:00:00.000Z'),
    },
  }
}

describe('publishMenu — เส้นทางที่สำเร็จ', () => {
  it('ยิงตามลำดับของ plan() เป๊ะ', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow({ aliasId: 'tab-a' })])
    const { deps: d } = deps(line, menus)

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })

    expect(line.calls).toEqual(['validate', 'create', 'upload', 'createAlias', 'setDefault'])
  })

  it('เขียน lineRichMenuId ลง DB ทันทีที่ create สำเร็จ ก่อนอัปรูป', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow()])
    const seenAtUpload: (string | null)[] = []
    const original = line.client.uploadContent
    line.client.uploadContent = async () => {
      seenAtUpload.push(menus.rows[0]!.lineRichMenuId)
      await original()
    }
    const { deps: d } = deps(line, menus)

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })

    expect(seenAtUpload).toEqual(['richmenu-new-1'])
  })

  it('ลบเมนูเวอร์ชันก่อนหน้าเป็นขั้นสุดท้าย และทน 404 ได้', async () => {
    const line = fakeLine()
    line.failAt('deleteRichMenu', new LineNotFoundError('gone'))
    const menus = menuRepo([menuRow({ lineRichMenuId: 'richmenu-old' })])
    const { deps: d } = deps(line, menus)

    const outcome = await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })

    expect(outcome.status).toBe('published')
    expect(menus.rows[0]!.status).toBe('published')
    expect(menus.rows[0]!.publishedAt).toBe('2026-08-21T00:00:00.000Z')
  })

  it('ไม่เรียก sharp เลย — publish อ่านรูปที่ normalize ไว้แล้วอย่างเดียว', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow()])
    const { deps: d } = deps(line, menus)

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })

    expect((d.store as { write: ReturnType<typeof vi.fn> }).write).not.toHaveBeenCalled()
  })

  it('เขียนแถว audit ที่สำเร็จ พร้อม before/after', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow()])
    const { deps: d, audit } = deps(line, menus)

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })

    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0]!.result).toBe('success')
    expect(audit.rows[0]!.action).toBe('publish')
    expect(audit.rows[0]!.actorId).toBe('3')
    expect(audit.rows[0]!.before).toMatchObject({ status: 'draft' })
    expect(audit.rows[0]!.after).toMatchObject({ status: 'published', lineRichMenuId: 'richmenu-new-1' })
  })
})

describe('publishMenu — เส้นทางที่ล้ม', () => {
  it('อัปรูปล้ม → ลบเมนูที่เพิ่งสร้าง สถานะเป็น failed และมีแถว audit ที่ล้ม', async () => {
    const line = fakeLine()
    line.failAt('upload', new LineServerError(500))
    const menus = menuRepo([menuRow()])
    const { deps: d, audit } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false }))
      .rejects.toBeInstanceOf(LineServerError)

    expect(line.state.menus.size).toBe(0)
    expect(menus.rows[0]!.status).toBe('failed')
    expect(menus.rows[0]!.lastError).toBe('line_server_error')
    expect(menus.rows[0]!.lineRichMenuId).toBeNull()
    expect(audit.rows[0]!.result).toBe('failure')
    expect(audit.rows[0]!.errorCode).toBe('line_server_error')
  })

  it('alias ถูกสร้างใหม่แล้ว setDefault ล้ม → alias ต้องหายไป ไม่ใช่ชี้เมนูที่ถูกลบ', async () => {
    const line = fakeLine()
    line.failAt('setDefault', new LineServerError(500))
    const menus = menuRepo([menuRow({ aliasId: 'tab-a' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    expect(line.state.aliases.has('tab-a')).toBe(false)
    expect(line.state.menus.size).toBe(0)
  })

  it('alias ที่มีอยู่ก่อน ถูกชี้กลับไปที่ปลายทางเดิม', async () => {
    const line = fakeLine({ aliases: { 'tab-a': 'richmenu-previous' } })
    line.failAt('setDefault', new LineServerError(500))
    const menus = menuRepo([menuRow({ aliasId: 'tab-a' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    expect(line.state.aliases.get('tab-a')).toBe('richmenu-previous')
  })

  it('default ที่มีอยู่ก่อน ถูกตั้งกลับหลัง deleteOld ล้ม', async () => {
    const line = fakeLine({ defaultId: 'richmenu-old' })
    line.failAt('deleteRichMenu', new LineServerError(500))
    const menus = menuRepo([menuRow({ lineRichMenuId: 'richmenu-old' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    expect(line.state.defaultId).toBe('richmenu-old')
  })

  it('ไม่มีเมนูตาม id → MenuNotFoundError โดยไม่แตะ LINE และไม่มีแถว audit', async () => {
    const line = fakeLine()
    const { deps: d, audit } = deps(line, menuRepo([]))

    await expect(publishMenu(d, { menuId: 'ไม่มีจริง', actorId: '3', setAsDefault: false }))
      .rejects.toBeInstanceOf(MenuNotFoundError)

    expect(line.calls).toEqual([])
    expect(audit.rows).toEqual([])
  })

  it('ยังไม่มีรูปที่ normalize แล้ว → MenuNotReadyError โดยไม่แตะ LINE และไม่มีแถว audit', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow({ normalizedFileId: null, normalizedMime: null })])
    const { deps: d, audit } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false }))
      .rejects.toBeInstanceOf(MenuNotReadyError)

    expect(line.calls).toEqual([])
    expect(audit.rows).toEqual([])
    expect(menus.rows[0]!.status).toBe('draft')
  })

  it('ถูก rate limit → ไม่แตะ LINE เลย และไม่สร้างแถว audit', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow()])
    const { deps: d, audit } = deps(line, menus)
    d.limiter = createRateLimiter({ capacity: 1, refillPerMinute: 1 })

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })
    line.calls.length = 0
    audit.rows.length = 0

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false }))
      .rejects.toBeInstanceOf(PublishRateLimitedError)

    expect(line.calls).toEqual([])
    expect(audit.rows).toEqual([])
  })
})

describe('property: ล้มที่ขั้นไหนก็ไม่ทิ้งสถานะกำพร้าไว้บน LINE', () => {
  it('default และ alias กลับไปเท่ากับก่อนเริ่มเสมอ และไม่มีเมนูใหม่ค้าง', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hadDefault: fc.boolean(),
          hadAlias: fc.boolean(),
          hadPrevious: fc.boolean(),
          useAlias: fc.boolean(),
          setAsDefault: fc.boolean(),
          failStep: fc.constantFrom(
            'validate', 'create', 'upload', 'createAlias', 'updateAlias', 'setDefault', 'deleteOld',
          ),
        }),
        async (scenario) => {
          const line = fakeLine({
            defaultId: scenario.hadDefault ? 'richmenu-old' : null,
            aliases: scenario.hadAlias ? { 'tab-a': 'richmenu-previous' } : {},
          })
          // `deleteOld` เป็นขั้นเดียวที่อยู่ *หลัง* setDefault จึงเป็นทางเดียวที่จะพิสูจน์ว่า
          // default ที่ตั้งไปแล้วถูกคืนกลับจริง ถ้าไม่มีเมนูเวอร์ชันก่อนหน้า plan ก็ไม่มีขั้นนี้
          // และสาขา "คืน default" ใน restorePriorState จะไม่เคยถูกเดินเลยทั้ง property
          if (scenario.hadPrevious) line.state.menus.add('richmenu-old')
          const before = {
            defaultId: line.state.defaultId,
            aliases: [...line.state.aliases.entries()].sort(),
            menus: [...line.state.menus].sort(),
          }
          const failCall = scenario.failStep === 'deleteOld' ? 'deleteRichMenu' : scenario.failStep
          line.failAt(
            scenario.failStep === 'deleteOld' ? 'deleteRichMenu:richmenu-old' : scenario.failStep,
            new LineServerError(500),
          )

          const menus = menuRepo([menuRow({
            aliasId: scenario.useAlias ? 'tab-a' : null,
            lineRichMenuId: scenario.hadPrevious ? 'richmenu-old' : null,
          })])
          const { deps: d } = deps(line, menus)

          const failed = await publishMenu(d, { menuId: '1', actorId: null, setAsDefault: scenario.setAsDefault })
            .then(() => false, () => true)

          const after = {
            defaultId: line.state.defaultId,
            aliases: [...line.state.aliases.entries()].sort(),
            menus: [...line.state.menus].sort(),
          }

          // `failStep` ที่สุ่มมาไม่ได้อยู่ใน plan ของทุก scenario — สั่งให้ createAlias ล้ม
          // ในเคสที่เมนูไม่มี alias เลย แปลว่าไม่มีอะไรล้ม แล้ว publish ก็สำเร็จตามปกติ
          // การยืนกรานว่า "สถานะต้องเท่าเดิมเสมอ" จึงเป็นการเรียกร้องให้ publish ที่สำเร็จ
          // ไม่เปลี่ยนอะไรเลย ซึ่งขัดกับหน้าที่ของมัน แยกสองขาไว้เพื่อให้ขาที่สำเร็จยัง
          // ถูกตรวจว่า *เปลี่ยนจริง* ไม่ใช่ปล่อยผ่านไปเฉย ๆ
          if (failed) {
            expect(after).toEqual(before)
            return
          }

          expect(line.calls).not.toContain(failCall)
          const aliases = new Map(before.aliases)
          if (scenario.useAlias) aliases.set('tab-a', 'richmenu-new-1')
          const remaining = new Set(before.menus)
          if (scenario.hadPrevious) remaining.delete('richmenu-old')
          remaining.add('richmenu-new-1')
          expect(after).toEqual({
            defaultId: scenario.setAsDefault ? 'richmenu-new-1' : before.defaultId,
            aliases: [...aliases.entries()].sort(),
            menus: [...remaining].sort(),
          })
        },
      ),
      { numRuns: 200 },
    )
  })
})
