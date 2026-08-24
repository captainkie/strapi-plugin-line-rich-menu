import { describe, expect, it, vi } from 'vitest'
import { LineServerError, LineValidationError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import {
  MenuActiveForMembersError, MenuChannelLockedError, MenuDefaultUnknownError,
  MenuDisplayPeriodNotAllowedError, MenuIsAccountDefaultError, MenuNotAllAudienceError,
  MenuNotMembersAudienceError, MenuNotReadyError,
} from '../../src/server/errors.js'
import {
  assertAllAudience, assertAudienceChangeAllowed, assertChannelChangeAllowed,
  assertDisplayPeriodAllowed, assertMembersAudience, assertNotAccountDefault,
  assertNotChannelMemberMenu, clearChannelDefault, deleteOrphan, reconcileChannel,
  setMenuAsDefault, swapMenuAlias, unlinkAllFromMenu,
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

/**
 * Task 17 / final review BLOCKER — `assertAllAudience` คือคู่ตรงข้ามของ `assertMembersAudience`
 * ข้างบน (ดูคอมเมนต์ที่ตัวฟังก์ชันเอง) เทสต์ตรงนี้พิสูจน์ตรรกะของมันแยกจากผู้เรียกทั้งสามทาง
 * (`publishMenu` ที่ setAsDefault, `POST /menus/:id/default`, op `set-default` ของ scheduler)
 */
describe('assertAllAudience', () => {
  it('เมนู audience: all ผ่านโดยไม่โยนอะไร', () => {
    expect(() => assertAllAudience(menuRow({ audience: 'all' }))).not.toThrow()
  })

  it('เมนู audience: members โยน MenuNotAllAudienceError พร้อม id ของเมนูนั้น', () => {
    try {
      assertAllAudience(menuRow({ id: 'm-13', audience: 'members' }))
      throw new Error('ต้องโยนก่อนถึงบรรทัดนี้')
    } catch (error) {
      expect(error).toBeInstanceOf(MenuNotAllAudienceError)
      expect((error as MenuNotAllAudienceError).code).toBe('menu_not_all_audience')
      expect((error as MenuNotAllAudienceError).menuId).toBe('m-13')
    }
  })
})

/**
 * Task 17 / final review H1+H2 — `assertNotChannelMemberMenu` (ดูคอมเมนต์ที่ตัวฟังก์ชันเอง)
 *
 * แต่ละ `it` ต่างจากเคสที่ถูกปฏิเสธเพียงจุดเดียวเหมือนชุดของ `assertAudienceChangeAllowed` ข้างบน —
 * ยามที่ปฏิเสธทุกอย่างก็ผ่านเทสต์ "ต้องปฏิเสธ" ได้เหมือนกัน เคสที่ต้องผ่านจึงเป็นครึ่งที่บอกว่านี่คือ
 * ยาม ไม่ใช่การล็อกปุ่ม publish/delete ทิ้งถาวร
 */
describe('assertNotChannelMemberMenu', () => {
  const liveMemberMenu = menuRow({ id: 'm-live', audience: 'members', lineRichMenuId: 'richmenu-a' })

  it('publish ซ้ำบนเมนูที่ pointer ของ channel ชี้อยู่ — โยน MenuActiveForMembersError ที่บอกให้ปิดสวิตช์ก่อน publish', () => {
    try {
      assertNotChannelMemberMenu({
        menu: liveMemberMenu, memberRichMenuId: 'richmenu-a', operation: 'publish',
      })
      throw new Error('ต้องโยนก่อนถึงบรรทัดนี้')
    } catch (error) {
      expect(error).toBeInstanceOf(MenuActiveForMembersError)
      expect((error as MenuActiveForMembersError).code).toBe('menu_active_for_members')
      expect((error as MenuActiveForMembersError).menuId).toBe('m-live')
      expect((error as MenuActiveForMembersError).message)
        .toBe("rich menu m-live is currently the channel's member menu; "
          + 'turn the members toggle off before publishing it again')
    }
  })

  it('ลบแถวเมนูที่ pointer ของ channel ชี้อยู่ — ปฏิเสธด้วยข้อความของ delete ไม่ใช่ข้อความของ publish', () => {
    try {
      assertNotChannelMemberMenu({
        menu: liveMemberMenu, memberRichMenuId: 'richmenu-a', operation: 'delete',
      })
      throw new Error('ต้องโยนก่อนถึงบรรทัดนี้')
    } catch (error) {
      expect((error as MenuActiveForMembersError).message)
        .toBe("rich menu m-live is currently the channel's member menu; "
          + 'turn the members toggle off before deleting it')
    }
  })

  // ครึ่งที่พิสูจน์ว่านี่คือยาม ไม่ใช่การปิดปุ่มถาวร — "ปิดสวิตช์สมาชิกก่อน" ที่ข้อความบอกให้ทำ
  // คือการล้าง pointer ตัวนี้พอดี หลังจากนั้น publish/delete ต้องทำได้จริง
  it('ปิดสวิตช์แล้ว (pointer เป็น null) — publish ซ้ำและลบได้ตามปกติ', () => {
    expect(() => assertNotChannelMemberMenu({
      menu: liveMemberMenu, memberRichMenuId: null, operation: 'publish',
    })).not.toThrow()
    expect(() => assertNotChannelMemberMenu({
      menu: liveMemberMenu, memberRichMenuId: null, operation: 'delete',
    })).not.toThrow()
  })

  it('เมนูสมาชิกตัวอื่นของ channel เดียวกันถูก pointer ชี้อยู่ — เมนูนี้ยังทำได้ตามปกติ', () => {
    expect(() => assertNotChannelMemberMenu({
      menu: liveMemberMenu, memberRichMenuId: 'richmenu-somebody-else', operation: 'publish',
    })).not.toThrow()
  })

  /**
   * เมนูร่างที่ยังไม่เคยขึ้น LINE — ถ้าไม่มี guard `lineRichMenuId === null` ในฟังก์ชัน เคสนี้จะไป
   * จบที่ `null !== null` ซึ่งเป็นเท็จ แล้วปฏิเสธ **publish ครั้งแรกของทุกเมนู** บน channel ที่ยัง
   * ไม่มีเมนูสมาชิก ซึ่งคือทุก channel ที่เพิ่งตั้งค่าเสร็จ (บทเรียนเดียวกับด่านคู่ขนานของ
   * `assertAudienceChangeAllowed` ข้างบน)
   */
  it('เมนูที่ยังไม่เคยขึ้น LINE บน channel ที่ยังไม่มีเมนูสมาชิก — publish ครั้งแรกต้องไม่โดนจับด้วย null === null', () => {
    expect(() => assertNotChannelMemberMenu({
      menu: menuRow({ status: 'draft', lineRichMenuId: null }),
      memberRichMenuId: null,
      operation: 'publish',
    })).not.toThrow()
  })
})

/**
 * Task 17 / deferred item 3 — `assertChannelChangeAllowed` (ดูคอมเมนต์ที่ตัวฟังก์ชันเอง)
 */
describe('assertChannelChangeAllowed', () => {
  const published = menuRow({ id: 'm-pub', channelId: '10', lineRichMenuId: 'richmenu-a' })

  it('ย้ายเมนูที่มีตัวจริงอยู่บน LINE แล้วไป channel อื่น — โยน MenuChannelLockedError', () => {
    try {
      assertChannelChangeAllowed({ menu: published, next: '20' })
      throw new Error('ต้องโยนก่อนถึงบรรทัดนี้')
    } catch (error) {
      expect(error).toBeInstanceOf(MenuChannelLockedError)
      expect((error as MenuChannelLockedError).code).toBe('menu_channel_locked')
      expect((error as MenuChannelLockedError).menuId).toBe('m-pub')
    }
  })

  // ฟอร์มส่ง channelId เดิมกลับมาทุกครั้งที่กด Save — ถ้าด่านนี้ดูแค่ "มีคีย์ channelId ไหม"
  // เมนูที่ publish แล้วจะแก้ชื่อ/รูป/ปุ่มไม่ได้เลยสักอย่าง ซึ่งแย่กว่าปัญหาที่มันตั้งใจแก้
  it('ส่ง channelId เดิมกลับมา (การกด Save ธรรมดา) — ผ่าน', () => {
    expect(() => assertChannelChangeAllowed({ menu: published, next: '10' })).not.toThrow()
  })

  it('ไม่ส่ง channelId มาเลย (undefined = ไม่เปลี่ยน) — ผ่าน', () => {
    expect(() => assertChannelChangeAllowed({ menu: published, next: undefined })).not.toThrow()
  })

  it('ร่างที่ยังไม่เคยขึ้น LINE — ย้าย channel ได้ตามปกติ', () => {
    expect(() => assertChannelChangeAllowed({
      menu: menuRow({ status: 'draft', lineRichMenuId: null, channelId: '10' }), next: '20',
    })).not.toThrow()
  })

  // เงื่อนไขคือ "มีตัวจริงอยู่บน LINE" ไม่ใช่ `status === 'published'` — แถวที่ publish ล้มกลางทาง
  // แล้วถือ id ค้างไว้ก็ผูกอยู่กับบัญชี LINE ของ channel เดิมเหมือนกัน
  it('แถวที่ status เป็น failed แต่ยังถือ lineRichMenuId ค้างไว้ — ย้ายไม่ได้เหมือนกัน', () => {
    expect(() => assertChannelChangeAllowed({
      menu: menuRow({ status: 'failed', lineRichMenuId: 'richmenu-a', channelId: '10' }), next: '20',
    })).toThrow(MenuChannelLockedError)
  })
})

/**
 * Task 17 item 5 — `assertDisplayPeriodAllowed` (ดูคอมเมนต์ที่ตัวฟังก์ชันเอง)
 */
describe('assertDisplayPeriodAllowed', () => {
  const start = '2026-09-01T00:00:00.000Z'
  const end = '2026-09-30T00:00:00.000Z'

  it('เมนูสมาชิกที่มีเวลาเริ่ม — โยน MenuDisplayPeriodNotAllowedError', () => {
    try {
      assertDisplayPeriodAllowed({ audience: 'members', startAt: start, endAt: null })
      throw new Error('ต้องโยนก่อนถึงบรรทัดนี้')
    } catch (error) {
      expect(error).toBeInstanceOf(MenuDisplayPeriodNotAllowedError)
      expect((error as MenuDisplayPeriodNotAllowedError).code).toBe('menu_display_period_not_allowed')
    }
  })

  // `endAt` เพียงลำพังก็สร้างแถว `clear-default` ซึ่งไปล้าง default ของบัญชีทั้งบัญชีตามเวลา —
  // ไม่ใช่แค่ `startAt` ที่อันตราย ถ้าด่านนี้ดูแค่ startAt ครึ่งหนึ่งของปัญหาจะลอดผ่าน
  it('เมนูสมาชิกที่มีแค่เวลาสิ้นสุด — ปฏิเสธเหมือนกัน', () => {
    expect(() => assertDisplayPeriodAllowed({ audience: 'members', startAt: null, endAt: end }))
      .toThrow(MenuDisplayPeriodNotAllowedError)
  })

  it('เมนูสมาชิกที่ไม่มีช่วงเวลาเลย — ผ่าน (นี่คือเมนูสมาชิกปกติทุกตัว)', () => {
    expect(() => assertDisplayPeriodAllowed({ audience: 'members', startAt: null, endAt: null }))
      .not.toThrow()
  })

  it('เมนูของทุกคนที่มีช่วงเวลาแสดงผล — ผ่าน (ฟีเจอร์เดิมของสเปก §5.7 ต้องไม่ถูกปิดไปด้วย)', () => {
    expect(() => assertDisplayPeriodAllowed({ audience: 'all', startAt: start, endAt: end }))
      .not.toThrow()
  })
})

/**
 * Task 22 / review H-1 — `assertNotAccountDefault` (ดูคอมเมนต์ที่ตัวฟังก์ชันเอง)
 *
 * ทุกเทสต์ที่ปฏิเสธในไฟล์นี้มี**คู่ที่พิสูจน์ว่ามันยังผ่าน**เสมอ ไม่ใช่เพราะสวยงาม แต่เพราะด่านที่
 * ปฏิเสธทุกครั้งจะสอบผ่านเทสต์ฝั่งปฏิเสธได้ครบทุกข้อ แล้วพังการแก้เมนูธรรมดาทั้งหมดโดยไม่มีใครเห็น
 * — เกิดมาแล้วสองครั้งบนแบรนช์นี้ (Task 14b item 3 round 2 และ `assertChannelChangeAllowed`)
 *
 * นับจำนวนครั้งที่ thunk ถูกเรียกด้วยทุกเทสต์ ไม่ใช่แค่ดูว่าโยนหรือไม่โยน — ครึ่งหนึ่งของสเปกของ
 * ด่านนี้คือ "ห้ามยิงไปหา LINE ตอนที่คำตอบเปลี่ยนอะไรไม่ได้" ซึ่งการดูแค่ผลลัพธ์มองไม่เห็นเลย
 */
describe('assertNotAccountDefault', () => {
  /** เมนูของทุกคนที่ publish แล้ว — สถานะเริ่มต้นของทุกเมนูที่กด "Save and publish" ไป */
  const publishedAll = menuRow({ id: 'm-pub', audience: 'all', lineRichMenuId: 'richmenu-a' })

  /** thunk ปลอมที่นับการเรียก — `reads.calls` คือหลักฐานว่าจ่ายค่า round trip ไปกี่ครั้ง */
  function reader(result: string | null | (() => never)) {
    const calls: number[] = []
    return {
      calls,
      read: async () => {
        calls.push(1)
        if (typeof result === 'function') result()
        return result as string | null
      },
    }
  }

  it("เมนูที่เป็น default ของบัญชีอยู่ + ขอเปลี่ยนเป็น 'members' — โยน MenuIsAccountDefaultError", async () => {
    const reads = reader('richmenu-a')
    try {
      await assertNotAccountDefault({
        menu: publishedAll, next: 'members', readAccountDefault: reads.read,
      })
      throw new Error('ต้องโยนก่อนถึงบรรทัดนี้')
    } catch (error) {
      expect(error).toBeInstanceOf(MenuIsAccountDefaultError)
      expect((error as MenuIsAccountDefaultError).code).toBe('menu_is_account_default')
      expect((error as MenuIsAccountDefaultError).menuId).toBe('m-pub')
    }
    expect(reads.calls).toHaveLength(1)
  })

  /**
   * ครึ่งที่พิสูจน์ว่านี่คือยาม ไม่ใช่การห้ามติดป้าย members ถาวร — เมนูที่ publish แล้วแต่ไม่ใช่
   * default ของบัญชี คือเมนูสมาชิกทุกตัวที่เกิดขึ้นถูกวิธี (publish โดยไม่ตั้ง default) ถ้าเคสนี้
   * ถูกปฏิเสธไปด้วย ฟีเจอร์ทั้งฟีเจอร์จะสร้างเมนูสมาชิกจาก editor ไม่ได้เลย
   */
  it('เมนูที่ publish แล้วแต่ default ของบัญชีเป็นเมนูอื่น — ติดป้าย members ได้ตามปกติ', async () => {
    const reads = reader('richmenu-somebody-else')
    await expect(assertNotAccountDefault({
      menu: publishedAll, next: 'members', readAccountDefault: reads.read,
    })).resolves.toBeUndefined()
    expect(reads.calls).toHaveLength(1)
  })

  it('บัญชีที่ยังไม่เคยตั้ง default เลย (LINE ตอบ null) — ติดป้าย members ได้', async () => {
    const reads = reader(null)
    await expect(assertNotAccountDefault({
      menu: publishedAll, next: 'members', readAccountDefault: reads.read,
    })).resolves.toBeUndefined()
    expect(reads.calls).toHaveLength(1)
  })

  // ===== สามเงื่อนไขของ "จ่ายค่าอ่านเฉพาะตอนที่มันมีความหมายได้" — ทั้งสามข้อต้องไม่ยิงเลย =====

  it('ไม่ส่ง audience มาเลย (undefined = ไม่เปลี่ยน) — ผ่าน และไม่ยิงไปหา LINE เลย', async () => {
    const reads = reader('richmenu-a')
    await expect(assertNotAccountDefault({
      menu: publishedAll, next: undefined, readAccountDefault: reads.read,
    })).resolves.toBeUndefined()
    expect(reads.calls).toHaveLength(0)
  })

  it("ขอเปลี่ยนเป็น 'all' — ผ่าน และไม่ยิงไปหา LINE เลย", async () => {
    const reads = reader('richmenu-a')
    await expect(assertNotAccountDefault({
      menu: publishedAll, next: 'all', readAccountDefault: reads.read,
    })).resolves.toBeUndefined()
    expect(reads.calls).toHaveLength(0)
  })

  /**
   * เมนูสมาชิกที่กด Save ธรรมดา (ฟอร์มส่ง `audience: 'members'` เดิมกลับมาทุกครั้ง) — คำขอนี้ไม่ได้
   * ติดป้ายใหม่ ไม่มีอะไรให้ด่านนี้ตัดสิน และต้องไม่จ่าย round trip ไปยืนยันสิ่งที่ไม่ได้เปลี่ยน
   * ทุกครั้งที่แก้ชื่อปุ่ม
   */
  it("ป้ายเดิมเป็น 'members' อยู่แล้ว (กด Save ธรรมดา) — ผ่าน และไม่ยิงไปหา LINE เลย", async () => {
    const reads = reader('richmenu-a')
    await expect(assertNotAccountDefault({
      menu: menuRow({ audience: 'members', lineRichMenuId: 'richmenu-a' }),
      next: 'members',
      readAccountDefault: reads.read,
    })).resolves.toBeUndefined()
    expect(reads.calls).toHaveLength(0)
  })

  it('ร่างที่ยังไม่เคยขึ้น LINE — ตั้ง audience เป็น members ได้ และไม่ยิงไปหา LINE เลย', async () => {
    const reads = reader('richmenu-a')
    await expect(assertNotAccountDefault({
      menu: menuRow({ status: 'draft', audience: 'all', lineRichMenuId: null }),
      next: 'members',
      readAccountDefault: reads.read,
    })).resolves.toBeUndefined()
    expect(reads.calls).toHaveLength(0)
  })

  /**
   * เงื่อนไข "มีตัวจริงอยู่บน LINE" คือ `lineRichMenuId !== null` ไม่ใช่ `status === 'published'`
   * — กฎเดียวกับ `assertChannelChangeAllowed` ข้างบน แถวที่ publish ล้มกลางทางแล้วถือ id ค้างไว้
   * ยังเป็นตัวที่ default ของบัญชีชี้ถึงได้จริง ถ้าด่านนี้ดู status อย่างเดียว สถานะนั้นจะไม่มียาม
   */
  it('แถวที่ status เป็น failed แต่ยังถือ lineRichMenuId ที่เป็น default อยู่ — ปฏิเสธเหมือนกัน', async () => {
    const reads = reader('richmenu-a')
    await expect(assertNotAccountDefault({
      menu: menuRow({ status: 'failed', audience: 'all', lineRichMenuId: 'richmenu-a' }),
      next: 'members',
      readAccountDefault: reads.read,
    })).rejects.toBeInstanceOf(MenuIsAccountDefaultError)
    expect(reads.calls).toHaveLength(1)
  })

  // ===== fail closed =====

  /**
   * บั๊กต้นเรื่องคือ "ไม่เคยถาม" ซึ่งมีผลเท่ากับ "ปล่อยผ่านทุกครั้ง" ถ้าด่านนี้ปล่อยผ่านตอนที่ถาม
   * ไม่ได้ มันจะกลายเป็นบั๊กเดิมเป๊ะ ๆ ในนาทีที่ LINE ล่ม ซึ่งเป็นนาทีที่ไม่มีใครมองอยู่
   */
  it('อ่าน default จาก LINE ไม่สำเร็จ — ปฏิเสธด้วย menu_default_unknown ไม่ใช่ปล่อยผ่าน', async () => {
    const boom = new LineServerError(503)
    const reads = reader(() => { throw boom })
    try {
      await assertNotAccountDefault({
        menu: publishedAll, next: 'members', readAccountDefault: reads.read,
      })
      throw new Error('ต้องโยนก่อนถึงบรรทัดนี้')
    } catch (error) {
      expect(error).toBeInstanceOf(MenuDefaultUnknownError)
      expect((error as MenuDefaultUnknownError).code).toBe('menu_default_unknown')
      expect((error as MenuDefaultUnknownError).menuId).toBe('m-pub')
      // ต้นเหตุจริงต้องไม่หายไปกับการห่อ — ไม่งั้นคนดีบั๊กเหลือแค่ "อ่านไม่ได้" ที่ไม่บอกว่าทำไม
      expect((error as MenuDefaultUnknownError).reason).toBe(boom)
    }
    expect(reads.calls).toHaveLength(1)
  })

  /**
   * try ห่อเฉพาะ thunk ไม่ใช่ทั้งฟังก์ชัน — ถ้าห่อทั้งก้อน การปฏิเสธที่ถูกต้อง
   * (`MenuIsAccountDefaultError`) จะถูกจับกลับมาแปลงเป็น `menu_default_unknown` แล้ว operator จะ
   * ถูกบอกให้ไปแก้การเชื่อมต่อ LINE ทั้งที่ LINE ตอบมาเรียบร้อยและคำตอบคือ "ใช่ มันเป็น default"
   */
  it('การปฏิเสธที่ถูกต้องต้องไม่ถูกกลืนกลายเป็น menu_default_unknown', async () => {
    await expect(assertNotAccountDefault({
      menu: publishedAll, next: 'members', readAccountDefault: async () => 'richmenu-a',
    })).rejects.not.toBeInstanceOf(MenuDefaultUnknownError)
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

  /**
   * Task 17 / final review BLOCKER — เส้นทางที่สองที่ตั้ง default ได้: `POST /menus/:id/default`
   * และ op `set-default` ของ scheduler (ทั้งคู่ลงมาที่ฟังก์ชันนี้) ก่อนหน้านี้ทั้งสองทางเรียกแค่
   * `publishedMenuOrThrow` แล้วเดินต่อ ไม่เคยดู `audience` เลย
   *
   * เช็ค "ไม่แตะ LINE เลย" ด้วย ไม่ใช่แค่ว่ามัน throw — การปฏิเสธที่เกิด**หลัง**ยิง `setDefault`
   * ไปแล้วคือความเสียหายเดิมทุกประการ ต่างกันแค่มี exception ตามมา
   */
  it('เมนู audience: members ตั้งเป็น default ของบัญชีไม่ได้ และต้องไม่แตะ LINE เลย', async () => {
    const { menus, audit, auditRows } = repos([menuRow({ audience: 'members' })])
    const line = client({ getDefault: vi.fn(async () => 'richmenu-old') })

    await expect(setMenuAsDefault({ client: line, menus, audit }, { menuId: '1', actorId: '3' }))
      .rejects.toBeInstanceOf(MenuNotAllAudienceError)

    expect((line as unknown as { setDefault: ReturnType<typeof vi.fn> }).setDefault)
      .not.toHaveBeenCalled()
    // ถูกปฏิเสธก่อนแตะ LINE — ไม่มี action ที่แตะ LINE จึงไม่มีแถว audit (สเปก §13.2 ข้อ 8 นับ
    // เฉพาะสิ่งที่แตะ LINE จริง เหมือนที่ rate limit ของ publish ถูกวางไว้นอก audit.around)
    expect(auditRows).toHaveLength(0)
  })

  /**
   * คู่ที่พิสูจน์ว่าด่านข้างบนเป็นยาม ไม่ใช่การปิดเส้นทางนี้ทิ้ง — เมนูเดียวกันเป๊ะ ต่างกันแค่
   * `audience` ("เปลี่ยน audience เป็น all ก่อน" คือสิ่งที่ข้อความของ 409 บอกให้ทำพอดี)
   */
  it('เมนูเดียวกันที่ audience เป็น all — ตั้ง default ได้ตามปกติ', async () => {
    const { menus, audit } = repos([menuRow({ audience: 'all' })])
    const line = client({ getDefault: vi.fn(async () => 'richmenu-old') })

    await setMenuAsDefault({ client: line, menus, audit }, { menuId: '1', actorId: '3' })

    expect((line as unknown as { setDefault: ReturnType<typeof vi.fn> }).setDefault)
      .toHaveBeenCalledWith('richmenu-a')
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
