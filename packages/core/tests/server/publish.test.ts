import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { LineNotFoundError, LineServerError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import {
  MenuNotFoundError, MenuNotReadyError, PublishAlreadyRunningError, PublishRateLimitedError,
} from '../../src/server/errors.js'
import { createRateLimiter } from '../../src/server/rate-limit.js'
import { reconcileChannel } from '../../src/server/menu-ops.js'
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

/**
 * LINE จำลองที่จำสถานะจริง เพื่อให้ assert ได้ว่า compensation คืนสถานะครบ
 *
 * ของเดิม **ไปถึงสาขา "คืนค่าไม่สำเร็จ" ไม่ได้เลยโดยโครงสร้าง**: `clearDefault` กับ `deleteAlias`
 * ไม่เคยดู `failures` จึงสั่งให้ล้มไม่ได้ ส่วน `setDefault`/`updateAlias` ดู แต่การสั่งให้ล้ม
 * ทำให้ขั้น **เดินหน้า** ล้มไปด้วย การคืนค่าจึงไม่เคยถูกเดินถึง — นั่นคือเหตุผลเดียวที่ C4 มองไม่เห็น
 *
 * ตอนนี้ทุก endpoint นับจำนวนครั้งที่ถูกเรียก และ `failAt` รับคีย์แบบ `setDefault#2` ได้ ซึ่ง
 * แปลว่า "ล้มเฉพาะการเรียกครั้งที่สอง" — สำหรับ `setDefault`/`updateAlias` ครั้งที่หนึ่งคือขั้นเดินหน้า
 * ครั้งที่สองคือการคืนค่า จึงสั่งให้ **เฉพาะการคืนค่า** ล้มได้จริงเป็นครั้งแรก
 */
function fakeLine(initial: { defaultId?: string | null; aliases?: Record<string, string> } = {}) {
  const calls: string[] = []
  const state = {
    menus: new Set<string>(initial.defaultId ? [initial.defaultId] : []),
    aliases: new Map<string, string>(Object.entries(initial.aliases ?? {})),
    defaultId: initial.defaultId ?? null,
  }
  let counter = 0
  const failures = new Map<string, Error>()
  const applied = new Map<string, Error>()
  const seen = new Map<string, number>()

  /** บันทึกการเรียกหนึ่งครั้งแล้วคืน error ที่ถูกสั่งไว้สำหรับ "ครั้งนี้" ถ้ามี */
  function record(call: string): Error | null {
    calls.push(call)
    const nth = (seen.get(call) ?? 0) + 1
    seen.set(call, nth)
    return failures.get(`${call}#${nth}`) ?? failures.get(call) ?? null
  }

  /**
   * "LINE รับคำสั่งไปแล้ว แต่ผู้เรียกได้ error" — เรียกหลังเปลี่ยนสถานะแล้ว จึงจำลอง socket ที่ตาย
   * หลัง LINE apply การเปลี่ยนแปลงไปเรียบร้อย ซึ่ง `client.ts` ไม่มี try/catch รอบ `await fetchImpl`
   * เลยส่งต่อออกมาเป็น error ตรง ๆ ของเดิมไม่มีวิธีแสดงเคสนี้เลย จึงแยก "ล้มก่อน" กับ "ล้มหลัง"
   * ออกจากกันไม่ได้ และ C5 ก็มองไม่เห็นทั้งชุด
   */
  function afterEffect(call: string): void {
    const nth = seen.get(call) ?? 0
    const f = applied.get(`${call}#${nth}`) ?? applied.get(call)
    if (f) throw f
  }

  return {
    calls,
    state,
    failAt: (call: string, error: Error) => failures.set(call, error),
    failAfter: (call: string, error: Error) => applied.set(call, error),
    client: {
      async validateRichMenu() { const f = record('validate'); if (f) throw f },
      async createRichMenu() {
        const f = record('create'); if (f) throw f
        const id = `richmenu-new-${++counter}`
        state.menus.add(id)
        return id
      },
      async uploadContent() { const f = record('upload'); if (f) throw f },
      async createAlias(aliasId: string, richMenuId: string) {
        const f = record('createAlias'); if (f) throw f
        state.aliases.set(aliasId, richMenuId)
        afterEffect('createAlias')
      },
      async updateAlias(aliasId: string, richMenuId: string) {
        const f = record('updateAlias'); if (f) throw f
        state.aliases.set(aliasId, richMenuId)
        afterEffect('updateAlias')
      },
      async deleteAlias(aliasId: string) {
        const f = record('deleteAlias'); if (f) throw f
        state.aliases.delete(aliasId)
      },
      async setDefault(id: string) {
        const f = record('setDefault'); if (f) throw f
        state.defaultId = id
        afterEffect('setDefault')
      },
      async clearDefault() {
        const f = record('clearDefault'); if (f) throw f
        state.defaultId = null
      },
      async deleteRichMenu(id: string) {
        // คีย์แบบเจาะจง id มีไว้ให้สั่ง `deleteOld` ล้มได้โดยที่การลบเมนูที่เพิ่งสร้าง
        // (ซึ่งเป็น deleteRichMenu เหมือนกัน) ยังทำงาน — ไม่งั้นแยกไม่ออกว่าเมนูใหม่ค้าง
        // เพราะ compensation พัง หรือเพราะเราสั่งให้ API ตัวนั้นล้มทั้งตัว
        // เรียก record() ก่อนเสมอ ไม่ใช่หลัง ?? — ไม่งั้นการเรียกที่ถูกสั่งให้ล้มด้วยคีย์เจาะจง id
        // จะหายไปจาก `calls` ทั้งที่มันเกิดขึ้นจริง
        const generic = record('deleteRichMenu')
        const f = failures.get(`deleteRichMenu:${id}`) ?? generic
        if (f) throw f
        state.menus.delete(id)
      },
      async getDefault() { return state.defaultId },
      async getAlias(aliasId: string) { return state.aliases.get(aliasId) ?? null },
      // มีไว้ให้ `reconcileChannel` เดินบน store เดียวกับที่ publish เพิ่งแตะ — ผลของ publish
      // ที่ล้มจึงถูกตรวจด้วยสายตาของรายงานที่ผู้ใช้เห็นจริง ไม่ใช่แค่ของเทสต์เอง
      async listRichMenus() { return [...state.menus].map((richMenuId) => ({ richMenuId })) },
    },
  }
}

function imageStore(): ImageStore & { write: ReturnType<typeof vi.fn> } {
  return {
    async read() { return Buffer.from('normalized-bytes') },
    // publish อ่านไบต์ ไม่เคยอ่าน url — มีไว้ให้ครบสัญญาของ `ImageStore` เท่านั้น
    async url() { return null },
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
    // (I7) เมนูใหม่ถูกลบสำเร็จตามปกติ — ไม่มีอะไรถูกทิ้งไว้ และทั้งสองขาคืนค่าสำเร็จ (ไม่มีอะไรต้องคืนเลย)
    expect(audit.rows[0]!.after).toEqual({ defaultRestored: true, aliasRestored: true, keptMenuId: null })
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

  /**
   * re-publish ที่ล้ม เคยเขียน `lineRichMenuId: null` ทับ โดยอ้างว่า "เมนูตัวนั้นถูกลบไปแล้ว" —
   * จริงกับเมนูที่รอบนี้เพิ่งสร้าง แต่ไม่จริงกับเมนูเวอร์ชันก่อนหน้า ซึ่งยังอยู่บน LINE และยังเป็น
   * default อยู่ ผลคือเมนูที่ลูกค้าใช้งานอยู่จริงไม่มีแถวไหนอ้างถึงอีก
   */
  it('re-publish ล้ม → แถวยังชี้เมนูเวอร์ชันก่อนหน้าที่ยังอยู่บน LINE ไม่ใช่ถูกเคลียร์เป็น null', async () => {
    const line = fakeLine({ defaultId: 'richmenu-old' })
    line.failAt('upload', new LineServerError(500))
    const menus = menuRepo([menuRow({ status: 'published', lineRichMenuId: 'richmenu-old' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    expect(menus.rows[0]!.status).toBe('failed')
    expect(menus.rows[0]!.lineRichMenuId).toBe('richmenu-old')
    // และ id ที่แถวชี้อยู่ต้องเป็นเมนูที่ยังมีจริงบน LINE ไม่ใช่ id ที่ถูกลบไปแล้ว
    expect(line.state.menus.has('richmenu-old')).toBe(true)
    expect(line.state.defaultId).toBe('richmenu-old')
  })

  /**
   * ความเสียหายจริงของบั๊กนี้ไม่ได้อยู่ที่คอลัมน์ในตาราง แต่อยู่ที่รายงานที่ผู้ใช้เห็น: เมนูที่ยังเป็น
   * default อยู่จะถูกรายงานเป็น "กำพร้า" แล้วหน้า ChannelSettings ยื่นปุ่มลบให้กด — และ
   * `deleteOrphan` ก็จะเห็นด้วย เพราะตามนิยามของมันเองมันกำพร้าจริง
   */
  it('re-publish ล้มแล้ว reconcile ต้องไม่รายงานเมนูที่ยังเป็น default ว่าเป็นกำพร้า', async () => {
    const line = fakeLine({ defaultId: 'richmenu-old' })
    line.failAt('upload', new LineServerError(500))
    const menus = menuRepo([menuRow({ status: 'published', lineRichMenuId: 'richmenu-old' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    const report = await reconcileChannel(d as never, { channelId: '10' })
    expect(report.orphans).toEqual([])
  })

  /**
   * เคสที่น่าจะเกิดที่สุด ไม่ใช่เคสพิสดาร: `setDefault(ใหม่)` สำเร็จ แล้ว `deleteOld(เก่า)` ล้มด้วย 500
   * การคืนค่าเรียก `setDefault(เก่า)` ซึ่งมีโอกาสสูงมากที่จะล้มด้วยเหตุผลเดียวกับที่ `deleteOld`
   * เพิ่งล้ม แล้วถูกกลืนเงียบ จากนั้น `deleteRichMenu(ใหม่)` สำเร็จ → **default บน LINE ชี้เมนูที่
   * ไม่มีอยู่แล้ว และ end user ทุกคนเปิดแชทมาไม่เห็นเมนูเลย**
   */
  it('คืน default ไม่สำเร็จ → ห้ามลบเมนูใหม่ทิ้ง เพราะ LINE ยังชี้มันอยู่', async () => {
    const line = fakeLine({ defaultId: 'richmenu-old' })
    line.failAt('deleteRichMenu:richmenu-old', new LineServerError(500))
    // ครั้งที่สองของ setDefault คือการคืนค่า (ครั้งแรกคือขั้นเดินหน้าซึ่งต้องสำเร็จ ไม่งั้นไม่มีอะไรให้คืน)
    line.failAt('setDefault#2', new LineServerError(500))
    const menus = menuRepo([menuRow({ status: 'published', lineRichMenuId: 'richmenu-old' })])
    const { deps: d, audit } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    // สิ่งที่ห้ามเกิดเด็ดขาด: default ชี้ id ที่ไม่มีอยู่ในชุดเมนูบน LINE
    expect(line.state.defaultId).toBe('richmenu-new-1')
    expect(line.state.menus.has(line.state.defaultId!)).toBe(true)
    // และแถวต้องชี้ตัวที่ LINE ใช้อยู่จริง ไม่ใช่เมนูเก่าที่ไม่ได้เป็น default แล้ว
    expect(menus.rows[0]!.lineRichMenuId).toBe('richmenu-new-1')
    // (I7) แถว audit ต้องบอกได้ว่าคืน default ไม่สำเร็จ และเมนูตัวไหนถูกจงใจปล่อยทิ้งไว้บน LINE
    expect(audit.rows[0]!.after).toEqual({
      defaultRestored: false, aliasRestored: true, keptMenuId: 'richmenu-new-1',
    })
  })

  /**
   * เวอร์ชัน alias แย่กว่าเพราะลามออกนอก publish รอบนี้: alias ที่ชี้เมนูที่ถูกลบไปแล้วทำให้
   * `richmenuswitch` ของเมนู **อื่น** ที่ไม่เกี่ยวอะไรด้วยเลยพังตามไปด้วย
   */
  it('คืน alias ไม่สำเร็จ → ห้ามลบเมนูใหม่ทิ้ง เพราะ alias ยังชี้มันอยู่', async () => {
    const line = fakeLine({ aliases: { 'tab-a': 'richmenu-previous' } })
    line.state.menus.add('richmenu-previous')
    line.state.menus.add('richmenu-old')
    // ต้องให้ `upsertAlias` **สำเร็จ** แล้วขั้นถัดจากมันล้ม ไม่งั้นไม่มีการคืน alias ให้ล้มตั้งแต่แรก
    // (`deleteOld` เป็นขั้นเดียวที่อยู่หลัง upsertAlias เมื่อไม่ได้ตั้ง default)
    line.failAt('deleteRichMenu:richmenu-old', new LineServerError(500))
    // upsertAlias ของเมนูที่มี alias อยู่แล้วคือ updateAlias — ครั้งที่หนึ่งเดินหน้า ครั้งที่สองคืนค่า
    line.failAt('updateAlias#2', new LineServerError(500))
    const menus = menuRepo([menuRow({ aliasId: 'tab-a', status: 'published', lineRichMenuId: 'richmenu-old' })])
    const { deps: d, audit } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })).rejects.toThrow()

    // ไม่ได้เรียกร้องว่า alias ต้องกลับไปถูกที่ (การคืนค่าล้มไปแล้ว) แต่เรียกร้องว่าปลายทางของมัน
    // ต้องยังมีอยู่จริงบน LINE — alias ที่ชี้เมนูที่ถูกลบไปแล้วจะพัง `richmenuswitch` ของเมนู **อื่น**
    // ที่ไม่เกี่ยวกับ publish รอบนี้เลย
    expect(line.state.aliases.get('tab-a')).toBe('richmenu-new-1')
    expect(line.state.menus.has('richmenu-new-1')).toBe(true)
    // เมนูที่จงใจปล่อยค้างไว้ต้องโผล่ใน reconcile ให้ผู้ใช้เก็บกวาดได้ ไม่ใช่หายไปเงียบ ๆ
    const report = await reconcileChannel(d as never, { channelId: '10' })
    expect(report.orphans).toContain('richmenu-new-1')
    // (I7) และแถว audit เองก็ต้องบอกได้เหมือนกัน โดยไม่ต้องไปงมใน logger.error
    expect(audit.rows[0]!.after).toEqual({
      defaultRestored: true, aliasRestored: false, keptMenuId: 'richmenu-new-1',
    })
  })

  it('upload ล้มก่อนถึงขั้นที่ต้องคืนอะไรเลย → ยังลบเมนูใหม่ทิ้งตามปกติ ไม่ใช่ปล่อยค้างทุกครั้ง', async () => {
    const line = fakeLine()
    line.failAt('upload', new LineServerError(500))
    const menus = menuRepo([menuRow()])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    expect(line.state.menus.size).toBe(0)
  })

  /**
   * `client.ts` ไม่มี try/catch รอบ `await fetchImpl` — socket ที่ตายหลัง LINE รับคำสั่งไปแล้ว
   * จึงโผล่เป็น error ตรง ๆ ทั้งที่ผลถูก apply ไปแล้วจริง compensation ที่ไล่จากขั้นที่ *สำเร็จ*
   * จะเห็นว่า `setDefault` ไม่เคยเกิด ไม่คืนค่าอะไรเลย แล้วลบเมนูใหม่ทิ้ง → ปลายทางเดียวกับ C4 เป๊ะ
   */
  it('LINE รับ setDefault ไปแล้วแต่ socket ตายก่อนได้ response → ต้องคืน default ไม่ใช่ปล่อยชี้เมนูที่ถูกลบ', async () => {
    const line = fakeLine({ defaultId: 'richmenu-old' })
    line.failAfter('setDefault#1', new LineServerError(500))
    const menus = menuRepo([menuRow({ status: 'published', lineRichMenuId: 'richmenu-old' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    expect(line.state.defaultId).toBe('richmenu-old')
    expect(line.state.menus.has(line.state.defaultId!)).toBe(true)
    expect(line.state.menus.has('richmenu-new-1')).toBe(false)
  })

  /**
   * เวอร์ชัน alias แย่กว่า: alias ที่เพิ่งถูกสร้างขึ้นจะไม่มีใครมาเก็บกวาดอีกเลย ไม่มีแถวไหนใน DB
   * รู้จักมัน และ reconcile ก็ดูแต่เมนู ไม่ได้ดู alias
   */
  it('LINE รับ createAlias ไปแล้วแต่ socket ตายก่อนได้ response → alias ที่เกิดจริงต้องถูกลบ', async () => {
    const line = fakeLine()
    line.failAfter('createAlias#1', new LineServerError(500))
    const menus = menuRepo([menuRow({ aliasId: 'tab-a' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })).rejects.toThrow()

    expect(line.state.aliases.has('tab-a')).toBe(false)
    expect(line.state.menus.size).toBe(0)
  })

  /**
   * ด้านกลับของการไล่จากขั้นที่ "พยายาม": ตอนนี้ `deleteAlias` ถูกเรียกทุกครั้งที่ `createAlias` ล้ม
   * รวมถึงครั้งที่ alias ยังไม่ทันเกิด ซึ่ง LINE ตอบ 404 — ถ้านับว่าเป็นการคืนค่าที่ล้ม เมนูใหม่จะถูก
   * ปล่อยค้างทุกครั้งที่ createAlias ล้ม ทั้งที่ไม่มีอะไรต้องคืนเลย
   */
  it('createAlias ล้มก่อน alias จะเกิด → deleteAlias ได้ 404 ซึ่งคือผลลัพธ์ที่ต้องการ เมนูใหม่ยังถูกลบตามปกติ', async () => {
    const line = fakeLine()
    line.failAt('createAlias', new LineServerError(500))
    line.failAt('deleteAlias', new LineNotFoundError('alias not found'))
    const menus = menuRepo([menuRow({ aliasId: 'tab-a' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })).rejects.toThrow()

    expect(line.calls).toContain('deleteAlias')
    expect(line.state.menus.size).toBe(0)
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

/**
 * I4 — `status: 'publishing'` เดิมถูกเขียนแล้วไม่มีใครอ่านมันอีกเลย สองคำขอ publish ของเมนูเดียวกัน
 * จึงเดินพร้อมกันได้เต็มที่ ตัวที่สอง `create` ทับ `lineRichMenuId` ที่ตัวแรกเพิ่งเขียนไว้ แล้วเมนู
 * ของตัวแรกกลายเป็นขยะที่ไม่มีแถวไหนอ้างถึงอีกเลยบน LINE — rate limiter ที่มี capacity 3 ก็ไม่ได้
 * serialise อะไร และปุ่มฝั่ง editor ปิดตัวเองได้ แต่ route ไม่มีการ์ดเลย
 */
describe('publishMenu — กันการ publish ซ้อนของเมนูเดียวกัน (I4)', () => {
  it('เมนูที่ status publishing อยู่แล้วและยังไม่หมดเวลา → ปฏิเสธทันที ไม่แตะ LINE ไม่มีแถว audit', async () => {
    const line = fakeLine()
    // now() ของ deps() คือ 2026-08-21T00:00:00.000Z — ห่างจาก updatedAt แค่ 1 นาที ยังไม่หมดเวลา (TTL 5 นาที)
    const menus = menuRepo([menuRow({ status: 'publishing', updatedAt: '2026-08-20T23:59:00.000Z' })])
    const { deps: d, audit } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false }))
      .rejects.toBeInstanceOf(PublishAlreadyRunningError)

    expect(line.calls).toEqual([])
    expect(audit.rows).toEqual([])
    // สถานะเดิมต้องไม่ถูกแตะเลย — คำขอที่ถูกปฏิเสธไม่ควรมีผลข้างเคียงอะไรกับแถวนี้
    expect(menus.rows[0]!.status).toBe('publishing')
  })

  it('เมนูที่ status publishing ค้างนานเกิน TTL (process เดิมตายไปแล้ว) → publish ใหม่ต้องผ่านได้ตามปกติ', async () => {
    const line = fakeLine()
    // ห่างจาก now() ทั้งวัน — เกิน TTL 5 นาทีไปมาก แปลว่า publish รอบก่อนตายไปแล้วแน่ ๆ
    const menus = menuRepo([menuRow({ status: 'publishing', updatedAt: '2026-08-20T00:00:00.000Z' })])
    const { deps: d } = deps(line, menus)

    const outcome = await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })

    expect(outcome.status).toBe('published')
    expect(menus.rows[0]!.status).toBe('published')
  })

  it('publish ตัวที่สองมาถึงระหว่างที่ตัวแรกยังไม่จบ → ถูกปฏิเสธ ไม่ใช่ทับ id ของตัวแรก', async () => {
    const line = fakeLine()
    let releaseGate: (() => void) | null = null
    const originalValidate = line.client.validateRichMenu
    // กันให้ตัวแรกค้างอยู่ที่ขั้น validate (หลังเขียน status: 'publishing' ไปแล้ว) จนกว่าเทสต์
    // จะปล่อยเอง — จำลอง "publish ตัวแรกยังไม่จบ" แบบกำหนดจังหวะได้เป๊ะ ไม่ใช่เดา race
    line.client.validateRichMenu = () => new Promise((resolve) => {
      releaseGate = () => { resolve(originalValidate()) }
    })
    // `updatedAt` ต้องอยู่ใกล้ now() ของ deps() (ห่างกันไม่ถึง TTL 5 นาที) ไม่ใช่ค่า default ของ
    // menuRow() ที่เก่ากว่าหนึ่งวัน — of ปลอมตัวนี้ไม่ได้จำลองพฤติกรรมจริงของ Strapi ที่แตะ
    // `updatedAt` ทุกครั้งที่ `update()` จึงต้องตั้งค่าตั้งต้นให้ "สด" เอง ไม่งั้น publish ตัวที่สอง
    // จะเห็น status: 'publishing' ที่ดูเหมือนค้างมานานเกิน TTL แล้วเดินผ่านการ์ดไปเงียบ ๆ
    const menus = menuRepo([menuRow({ updatedAt: '2026-08-20T23:59:30.000Z' })])
    const { deps: d } = deps(line, menus)

    const first = publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })
    // ไม่ใช้ sleep เดาเวลา — รอจนกว่า repo จะเห็นสถานะ publishing ที่ตัวแรกเขียนจริง ๆ ด้วย vi.waitFor
    await vi.waitFor(() => {
      if (menus.rows[0]!.status !== 'publishing') throw new Error('ยังไม่ถึงสถานะ publishing')
    })

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false }))
      .rejects.toBeInstanceOf(PublishAlreadyRunningError)
    // ตัวที่สองต้องไม่แตะ LINE เลย — ตัวแรกยังค้างอยู่ที่ validate หนึ่งครั้งเท่านั้น
    expect(line.calls).toEqual([])

    releaseGate!()
    const outcome = await first
    expect(outcome.status).toBe('published')
    expect(menus.rows[0]!.status).toBe('published')
    expect(menus.rows[0]!.lineRichMenuId).toBe('richmenu-new-1')
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
          // `#1` = ล้มเฉพาะการเรียกครั้งแรก ซึ่งคือขั้น **เดินหน้า** เสมอ — property นี้พูดถึง
          // "ขั้นเดินหน้าล้มแล้วต้องไม่เหลืออะไรค้าง" ไม่ใช่ "LINE ล่มทั้งตัวจนแม้แต่การคืนค่าก็ล้ม"
          // กรณีหลังเป็นคนละข้อกำหนดและมีคำตอบตรงข้าม (C4: ปล่อยเมนูค้างดีกว่าให้ LINE ชี้เมนูที่
          // ถูกลบ) จึงมีเทสต์ของตัวเองแยกไว้ ถ้าใช้คีย์รวมตรงนี้ property จะไปทับข้อกำหนดนั้น
          line.failAt(
            scenario.failStep === 'deleteOld' ? 'deleteRichMenu:richmenu-old' : `${scenario.failStep}#1`,
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
            // เดิม property นี้เฝ้าแต่สถานะฝั่ง LINE ไม่เคยดูแถวใน DB เลย — C2 จึงมองไม่เห็น
            // ทั้งที่ทุก scenario ที่ `hadPrevious` เดินผ่านมันทุกรอบ ข้อกำหนดคือ "แถวต้องชี้สิ่งที่
            // ยังอยู่จริงบน LINE" ซึ่งหลัง publish ที่ล้มก็คือค่าเดิมก่อนเริ่มเสมอ
            const pointer = menus.rows[0]!.lineRichMenuId
            expect(pointer).toBe(scenario.hadPrevious ? 'richmenu-old' : null)
            if (pointer !== null) expect(line.state.menus.has(pointer)).toBe(true)
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
