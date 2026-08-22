import { describe, expect, it, vi } from 'vitest'
import { LineServerError, LineValidationError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import {
  MenuActiveForMembersError, MenuNotMembersAudienceError, MenuNotReadyError,
} from '../../src/server/errors.js'
import {
  assertAudienceChangeAllowed, assertMembersAudience, clearChannelDefault, deleteOrphan,
  reconcileChannel, setMenuAsDefault, swapMenuAlias, unlinkAllFromMenu,
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
    updatedAt: '2026-08-20T00:00:00.000Z', audience: 'all',
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
    validateBatch: vi.fn(async () => {}),
    batchControl: vi.fn(async () => 'req-1' as string | null),
    ...overrides,
  } as never
}

/**
 * Task 13 ruling — `assertMembersAudience` เป็นด่านเดียวที่ทั้งสอง adapter เรียกร่วมกันจาก
 * `activateOrSync` (controllers/members.ts) แทนเขียนเช็คนี้ซ้ำสองรอบ (ดูคอมเมนต์ที่ตัวฟังก์ชันเอง
 * ใน menu-ops.ts) — เทสต์ตรงนี้คือด่านเดียวที่พิสูจน์ตรรกะของมันเองแยกจากกลไกของ controller ทั้งคู่
 */
describe('assertMembersAudience', () => {
  it('เมนู audience: members ผ่านโดยไม่โยนอะไร', () => {
    expect(() => assertMembersAudience(menuRow({ audience: 'members' }))).not.toThrow()
  })

  it('เมนู audience: all โยน MenuNotMembersAudienceError พร้อม id ของเมนูนั้น', () => {
    const menu = menuRow({ id: 'm-42', audience: 'all' })
    try {
      assertMembersAudience(menu)
      throw new Error('ต้องโยนก่อนถึงบรรทัดนี้')
    } catch (error) {
      expect(error).toBeInstanceOf(MenuNotMembersAudienceError)
      expect((error as MenuNotMembersAudienceError).code).toBe('menu_not_members_audience')
      expect((error as MenuNotMembersAudienceError).menuId).toBe('m-42')
    }
  })
})

/**
 * Task 14b item 3 — ด่านตรงข้ามของ `assertMembersAudience` ข้างบน (ดูคอมเมนต์ที่ตัวฟังก์ชันเอง)
 * อยู่ใน core ด้วยเหตุผลเดียวกัน: สอง adapter ต้องเรียกด่านเดียวกันจริง ๆ ไม่ใช่ถือสำเนาคนละใบ
 * เทสต์ตรงนี้จึงเป็นที่เดียวที่พิสูจน์ตรรกะของมันแยกจากกลไก saveMenu ของทั้งคู่
 *
 * แต่ละ `it` จับเงื่อนไขเดียวที่ต่างจากเคสที่ปฏิเสธเพียงจุดเดียว ไม่ใช่กองรวมกันใน expect เดียว —
 * การลบเงื่อนไขไหนออกจากฟังก์ชันต้องทำให้ **แค่บางตัว** แดง ซึ่งเป็นสิ่งเดียวที่บอกได้ว่าเงื่อนไข
 * นั้นบังคับอะไรอยู่จริง
 */
describe('assertAudienceChangeAllowed', () => {
  const liveMemberMenu = menuRow({ id: 'm-live', audience: 'members', lineRichMenuId: 'richmenu-a' })

  it('ถอดป้าย members ออกจากเมนูที่เป็นเมนูสมาชิกของ channel อยู่จริง — โยน MenuActiveForMembersError', () => {
    try {
      assertAudienceChangeAllowed({
        menu: liveMemberMenu, next: 'all', memberRichMenuId: 'richmenu-a',
      })
      throw new Error('ต้องโยนก่อนถึงบรรทัดนี้')
    } catch (error) {
      expect(error).toBeInstanceOf(MenuActiveForMembersError)
      expect((error as MenuActiveForMembersError).code).toBe('menu_active_for_members')
      expect((error as MenuActiveForMembersError).menuId).toBe('m-live')
    }
  })

  // "ไม่ส่งฟิลด์มา" = "ไม่เปลี่ยน" ไม่ใช่ "ตั้งเป็น all" — กฎเดียวกับที่ Task 13 fix round 3/4
  // คุ้มครองไว้ที่ validation.ts/saveMenu ถ้าด่านนี้ตีความ undefined เป็นการถอดป้าย ผู้เรียก API ที่
  // ละคีย์นี้ไว้ (ยังมีจริง) จะแก้เมนูสมาชิกที่ active อยู่ไม่ได้เลย ทั้งที่ไม่ได้ขอเปลี่ยน audience
  it('ไม่ส่ง audience มาเลย (undefined) — ผ่าน ไม่ใช่ถูกตีความว่ากำลังถอดป้าย', () => {
    expect(() => assertAudienceChangeAllowed({
      menu: liveMemberMenu, next: undefined, memberRichMenuId: 'richmenu-a',
    })).not.toThrow()
  })

  it('ส่ง members มาบนเมนูสมาชิกที่ active อยู่ (บันทึกโดยไม่เปลี่ยนกลุ่มเป้าหมาย) — ผ่าน', () => {
    expect(() => assertAudienceChangeAllowed({
      menu: liveMemberMenu, next: 'members', memberRichMenuId: 'richmenu-a',
    })).not.toThrow()
  })

  it('เมนูที่ป้ายเดิมเป็น all อยู่แล้ว — ไม่มีอะไรให้ถอด ผ่านแม้ pointer จะชี้มาที่ id เดียวกัน', () => {
    expect(() => assertAudienceChangeAllowed({
      menu: menuRow({ audience: 'all', lineRichMenuId: 'richmenu-a' }),
      next: 'all',
      memberRichMenuId: 'richmenu-a',
    })).not.toThrow()
  })

  // เมนูสมาชิกของ channel อื่น (หรือเมนูสมาชิกเก่าที่ถูกแทนที่ไปแล้ว) ต้องแก้ได้ตามปกติ —
  // ถ้าด่านนี้ปฏิเสธทุกเมนูที่ audience เป็น members มันจะไม่ใช่ยาม แต่เป็นการล็อกฟิลด์นี้ถาวร
  it('เมนู members ที่ channel ไม่ได้ชี้มาหา — ถอดป้ายได้ตามปกติ', () => {
    expect(() => assertAudienceChangeAllowed({
      menu: liveMemberMenu, next: 'all', memberRichMenuId: 'richmenu-somebody-else',
    })).not.toThrow()
  })

  it('channel ยังไม่มีเมนูสมาชิกเลย (memberRichMenuId เป็น null) — ถอดป้ายได้', () => {
    expect(() => assertAudienceChangeAllowed({
      menu: liveMemberMenu, next: 'all', memberRichMenuId: null,
    })).not.toThrow()
  })

  /**
   * เมนูร่างที่ยังไม่เคยขึ้น LINE เป็นเมนูสมาชิกของใครไม่ได้ (activate ผ่าน `publishedMenuOrThrow`
   * เสมอ) — ถ้าไม่มี guard `lineRichMenuId === null` ในฟังก์ชัน เคสนี้จะไปจบที่การเทียบ
   * `null !== null` ซึ่งเป็นเท็จ แล้วปฏิเสธการแก้ร่างที่ไม่มีใครถืออยู่จริงบน channel ที่ยังว่าง
   */
  it('เมนูร่างที่ยังไม่เคย publish บน channel ที่ยังไม่มีเมนูสมาชิก — ถอดป้ายได้ ไม่ใช่โดน null === null จับ', () => {
    expect(() => assertAudienceChangeAllowed({
      menu: menuRow({ audience: 'members', status: 'draft', lineRichMenuId: null }),
      next: 'all',
      memberRichMenuId: null,
    })).not.toThrow()
  })
})

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

describe('unlinkAllFromMenu', () => {
  it('ผ่าน validateBatch ก่อนเสมอ แล้วค่อยยิง batchControl ตัวจริง ด้วย operation unlink ของเมนูนี้', async () => {
    const { menus, audit } = repos([menuRow({ lineRichMenuId: 'richmenu-a' })])
    const calls: string[] = []
    const line = client({
      validateBatch: vi.fn(async () => { calls.push('validate') }),
      batchControl: vi.fn(async (operations: unknown) => {
        calls.push('batch')
        expect(operations).toEqual([{ type: 'unlink', from: 'richmenu-a' }])
        return 'req-1'
      }),
    })

    await unlinkAllFromMenu({ client: line, menus, audit }, { menuId: '1', actorId: '3' })

    // ลำดับคือหัวใจของเทสต์นี้ — validate ไม่กินโควตา 3 ครั้ง/ชม. แต่ batch กิน สลับกันจะเสียโควตา
    // ไปกับ payload ที่ผิดโดยไม่มีทางรู้ล่วงหน้า
    expect(calls).toEqual(['validate', 'batch'])
    const validateBatchMock = (line as unknown as { validateBatch: ReturnType<typeof vi.fn> }).validateBatch
    expect(validateBatchMock).toHaveBeenCalledWith([{ type: 'unlink', from: 'richmenu-a' }])
  })

  it('เมนูที่ยังไม่ publish ปลดทุกคนไม่ได้ — ไม่ยิง LINE เลยสักครั้ง (validate หรือ batch)', async () => {
    const { menus, audit } = repos([menuRow({ status: 'draft', lineRichMenuId: null })])
    const line = client()

    await expect(unlinkAllFromMenu({ client: line, menus, audit }, { menuId: '1', actorId: null }))
      .rejects.toBeInstanceOf(MenuNotReadyError)

    expect((line as unknown as { validateBatch: ReturnType<typeof vi.fn> }).validateBatch).not.toHaveBeenCalled()
    expect((line as unknown as { batchControl: ReturnType<typeof vi.fn> }).batchControl).not.toHaveBeenCalled()
  })

  /**
   * richMenuId ของแถว audit ต้องเป็น id ฝั่ง LINE ('richmenu-a') ไม่ใช่ id แถวเมนูของเรา ('1') —
   * unlink-all เป็นงานระดับสมาชิกเหมือน unlink-members (ดูคอมเมนต์เต็มที่ AuditRow.richMenuId ใน
   * types.ts) เขียนผิดกลุ่มไปครั้งหนึ่งระหว่างพัฒนา task นี้แล้วเทสต์นี้จับได้ทันที (ดู task-12-report.md)
   */
  it('สำเร็จแล้วเขียน audit action unlink-all พร้อม request id ที่ได้จาก batchControl', async () => {
    const { menus, audit, auditRows } = repos([menuRow({ lineRichMenuId: 'richmenu-a' })])
    const line = client({ batchControl: vi.fn(async () => 'req-42') })

    const result = await unlinkAllFromMenu({ client: line, menus, audit }, { menuId: '1', actorId: '3' })

    expect(result).toEqual({ requestId: 'req-42' })
    expect(auditRows[0]).toMatchObject({
      action: 'unlink-all', result: 'success', actorId: '3', channelId: '10', richMenuId: 'richmenu-a',
      after: { requestId: 'req-42' },
    })
  })

  /**
   * ruling ของ Task 1 พิสูจน์ตรงนี้ — request id ที่หาไม่ได้ (header หาย) ต้องไม่ทำให้ปฏิบัติการนี้
   * ล้ม แค่ทำให้ progress อ่านไม่ได้เท่านั้น ถ้าเทสต์นี้ล้มแปลว่ามีใครเผลอเพิ่มเงื่อนไข throw เมื่อ
   * requestId เป็น null เข้าไปใน unlinkAllFromMenu ซึ่งขัดกับ ruling ตรง ๆ
   */
  it('batchControl คืน request id เป็น null (header หาย) — ยังถือว่าสำเร็จ ไม่โยน', async () => {
    const { menus, audit, auditRows } = repos([menuRow({ lineRichMenuId: 'richmenu-a' })])
    const line = client({ batchControl: vi.fn(async () => null) })

    const result = await unlinkAllFromMenu({ client: line, menus, audit }, { menuId: '1', actorId: '3' })

    expect(result).toEqual({ requestId: null })
    expect(auditRows[0]).toMatchObject({ action: 'unlink-all', result: 'success', after: { requestId: null } })
  })

  it('validateBatch ปฏิเสธ payload → ไม่ยิง batchControl ตัวจริง (ไม่เสียโควตา) และ audit บันทึกว่าล้ม', async () => {
    const { menus, audit, auditRows } = repos([menuRow({ lineRichMenuId: 'richmenu-a' })])
    const line = client({
      validateBatch: vi.fn(async () => { throw new LineValidationError(['operations: invalid']) }),
    })

    await expect(unlinkAllFromMenu({ client: line, menus, audit }, { menuId: '1', actorId: '3' }))
      .rejects.toBeInstanceOf(LineValidationError)

    expect((line as unknown as { batchControl: ReturnType<typeof vi.fn> }).batchControl).not.toHaveBeenCalled()
    expect(auditRows[0]).toMatchObject({ action: 'unlink-all', result: 'failure' })
  })

  it('LINE ล้มตอน batchControl ตัวจริง → ยังมีแถว audit ที่บอกว่าล้มด้วย code อะไร', async () => {
    const { menus, audit, auditRows } = repos([menuRow({ lineRichMenuId: 'richmenu-a' })])
    const line = client({ batchControl: vi.fn(async () => { throw new LineServerError(503) }) })

    await expect(unlinkAllFromMenu({ client: line, menus, audit }, { menuId: '1', actorId: '3' }))
      .rejects.toBeInstanceOf(LineServerError)

    expect(auditRows[0]).toMatchObject({ action: 'unlink-all', result: 'failure', errorCode: 'line_server_error' })
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
