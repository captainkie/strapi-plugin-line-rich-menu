import { describe, expect, it, vi } from 'vitest'
import type { ListParams, MemberRow, Repo } from '@fosivo/line-rich-menu-core'
import { UID } from '../src/server/content-types/index.js'
import type { Services } from '../src/server/container.js'
import {
  linkNewMember, registerMemberLifecycles, unlinkDeletedMember, validateMemberWrite,
} from '../src/server/lifecycles.js'
import type { LifecycleEvent, LifecycleSubscriber, StrapiV4 } from '../src/server/strapi.js'

const UID_A = `U${'a'.repeat(32)}`

function memberRow(channelId: string, overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: 'm1', channelId, lineUserId: UID_A, displayName: null,
    linkedRichMenuId: null, linkedAt: null, ...overrides,
  }
}

/** repo ปลอมของ services.members สำหรับเทสต์ validateMemberWrite/linkNewMember โดยตรง — filter
 * ตาม channelId เหมือน createMemberRepo จริงของ v4 (mapFilters ใน repo.ts) */
function fakeMemberRepo(rows: MemberRow[] = []): Repo<MemberRow> {
  return {
    findMany: vi.fn(async (params?: ListParams) => {
      const channelId = params?.filters?.['channelId']
      return channelId === undefined ? rows : rows.filter((row) => row.channelId === channelId)
    }),
    findOne: vi.fn(async (id: string) => rows.find((row) => row.id === id) ?? null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}

/** Services ปลอมขั้นต่ำ — เทียบเท่า fakeServices ของ cron.test.ts แต่เพิ่ม channels ที่ linkNewMember/
 * unlinkDeletedMember ต้องใช้จริง ทุกฟิลด์ override ได้ทีละส่วนต่อเทสต์ */
function fakeServices(overrides: Partial<Services> = {}): Services {
  return {
    config: {} as never,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    channels: {
      findOne: vi.fn(),
      withSecrets: () => ({ findOne: vi.fn(), findDefault: vi.fn() }),
    } as never,
    menus: {} as never,
    schedules: {} as never,
    members: fakeMemberRepo(),
    audit: { write: vi.fn(async () => undefined), around: vi.fn() },
    limiter: {} as never,
    store: {} as never,
    lock: { claim: vi.fn(), release: vi.fn() },
    clientFor: vi.fn(),
    ...overrides,
  }
}

describe('validateMemberWrite', () => {
  it('ปฏิเสธ uid ที่ผิดรูปแบบก่อนบันทึก', async () => {
    await expect(validateMemberWrite(fakeMemberRepo(), { lineUserId: 'nope', channel: 'c1' }, null))
      .rejects.toThrow(/line user id/i)
  })

  it('ปฏิเสธ uid ซ้ำภายใน channel เดียวกัน แต่ยอมให้ซ้ำข้าม channel', async () => {
    const members = fakeMemberRepo([memberRow('c1', { id: 'm1', lineUserId: UID_A })])

    await expect(validateMemberWrite(members, { lineUserId: UID_A, channel: 'c1' }, null))
      .rejects.toThrow(/already/i)
    await expect(validateMemberWrite(members, { lineUserId: UID_A, channel: 'c2' }, null))
      .resolves.toBeUndefined()
  })

  it('แถวตัวเองไม่ถูกนับเป็นของซ้ำ เมื่อ exceptId ตรงกับ id ของแถวนั้น (beforeUpdate re-save โดยไม่เปลี่ยนอะไร)', async () => {
    const members = fakeMemberRepo([memberRow('c1', { id: 'm1', lineUserId: UID_A })])
    await expect(validateMemberWrite(members, { lineUserId: UID_A, channel: 'c1' }, 'm1'))
      .resolves.toBeUndefined()
  })

  it('ไม่เช็คอะไรเลยเมื่อคำขอไม่ได้แตะ lineUserId — beforeUpdate ที่แก้แค่ displayName', async () => {
    const members = fakeMemberRepo()
    await expect(validateMemberWrite(members, { displayName: 'ใหม่' }, null)).resolves.toBeUndefined()
    expect(members.findMany).not.toHaveBeenCalled()
  })

  /**
   * ตัวชี้ขาดของด่านนี้: payload ที่ไม่มี channel เลย (beforeUpdate ที่แก้แค่ lineUserId) ต้อง
   * ไม่ข้ามการเช็คซ้ำทั้งด่านเงียบ ๆ — อ่าน channel ของแถวเดิมจาก members.findOne(exceptId) มาใช้แทน
   * เพื่อให้ยังจับของซ้ำได้จริง ไม่ใช่แค่ "ไม่ throw" ที่เกิดจากข้ามการเช็คไปเฉย ๆ
   */
  it('payload ไม่มี channel เลย (update ที่แก้แค่ lineUserId) ยังเช็คซ้ำกับ channel ของแถวเดิมได้จริง', async () => {
    const members = fakeMemberRepo([
      memberRow('c1', { id: 'm1', lineUserId: `U${'b'.repeat(32)}` }), // คนอื่นถือ uid นี้อยู่แล้วใน c1
      memberRow('c1', { id: 'm2', lineUserId: UID_A }), // แถวที่กำลังแก้ (m2) — ค่าเดิมไม่เกี่ยว
    ])

    // m2 พยายามเปลี่ยน lineUserId ไปเป็นของ m1 โดยไม่ส่ง channel มาด้วยเลย — ต้องยังโดนจับว่าซ้ำ
    await expect(validateMemberWrite(members, { lineUserId: `U${'b'.repeat(32)}` }, 'm2'))
      .rejects.toThrow(/already/i)
    expect(members.findOne).toHaveBeenCalledWith('m2')

    // เปลี่ยนไปเป็น uid ที่ไม่ซ้ำใครใน c1 เลย — ต้องผ่าน ไม่ใช่ถูกปฏิเสธเพราะหา channel ไม่เจอ
    await expect(validateMemberWrite(members, { lineUserId: `U${'c'.repeat(32)}` }, 'm2'))
      .resolves.toBeUndefined()
  })

  /**
   * ด่านนี้ต้องไม่ถูกข้ามเงียบ ๆ เด็ดขาด — ถ้าเช็คซ้ำไม่ได้จริง ๆ (ไม่มีทางรู้ channel เลย) ต้อง
   * ปฏิเสธการเขียน ไม่ใช่ปล่อยผ่านแบบเดิม เพราะ "ปล่อยผ่านดีกว่าปฏิเสธของถูก" ใช้ไม่ได้กับด่าน
   * uniqueness — ข้อมูลซ้ำที่หลุดเข้าไปเงียบ ๆ แพงกว่าการเขียนที่ถูกปฏิเสธแล้วผู้ใช้แก้ไขใหม่ได้
   */
  it('payload ไม่มี channel และไม่มี exceptId (ไม่รู้ว่าแถวไหนเลย) — ปฏิเสธ ไม่ใช่ปล่อยผ่าน', async () => {
    const members = fakeMemberRepo()
    await expect(validateMemberWrite(members, { lineUserId: UID_A }, null))
      .rejects.toThrow(/uniqueness/i)
    expect(members.findOne).not.toHaveBeenCalled()
    expect(members.findMany).not.toHaveBeenCalled()
  })

  /**
   * ตัวจับใจความของ fix รอบนี้: exceptId มีค่าจริง แต่ `members.findOne(exceptId)` หาแถวไม่เจอ
   * (คืน null) — ที่ v4 มักเกิดจากแถวถูกลบไปพร้อมกัน หรือ where ของ query นั้นไม่ได้กรองด้วย id
   * เลย (bulk update) ไม่ใช่ id ผิดรูปแบบ documentId/primary key แบบ v5 — แต่ผลต้องจบที่เดียวกัน:
   * ปฏิเสธ ไม่ใช่ปล่อยผ่านเงียบ ๆ เหมือนที่เคยเป็น
   */
  it('exceptId มีค่าแต่หาแถวไม่เจอ (findOne คืน null) — ปฏิเสธ ไม่ใช่ปล่อยผ่านเหมือนที่เคยเป็น', async () => {
    const members = fakeMemberRepo() // ไม่มีแถวไหนเลย — findOne('99') จะคืน null เสมอ
    await expect(validateMemberWrite(members, { lineUserId: UID_A }, '99'))
      .rejects.toThrow(/uniqueness/i)
    expect(members.findOne).toHaveBeenCalledWith('99')
    expect(members.findMany).not.toHaveBeenCalled()
  })
})

function channelSummary(memberRichMenuId: string | null) {
  return {
    id: 'c1', name: 'ร้าน', channelId: '1650000000', accessTokenPreview: '••••••••abcd',
    isDefault: false, memberRichMenuId,
  }
}

function channelWithSecrets(memberRichMenuId: string | null) {
  return { ...channelSummary(memberRichMenuId), channelAccessToken: 'token', channelSecret: null }
}

describe('linkNewMember', () => {
  it('สมาชิกใหม่ได้ link ทันทีเมื่อ channel มีเมนูของสมาชิกอยู่ และบันทึก linkedRichMenuId/linkedAt', async () => {
    const linkCalls: unknown[] = []
    const updateCalls: unknown[] = []
    const services = fakeServices({
      channels: {
        findOne: async () => channelSummary('rm-1'),
        withSecrets: () => ({ findOne: async () => channelWithSecrets('rm-1'), findDefault: vi.fn() }),
      } as never,
      clientFor: (() => ({
        linkToUser: async (userId: string, richMenuId: string) => { linkCalls.push([userId, richMenuId]) },
      })) as never,
      members: {
        ...fakeMemberRepo(),
        update: vi.fn(async (id: string, patch: Partial<MemberRow>) => {
          updateCalls.push({ id, patch })
          return memberRow('c1', { id, ...patch })
        }),
      },
    })

    await linkNewMember(services, memberRow('c1'))

    expect(linkCalls).toEqual([[UID_A, 'rm-1']])
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]).toMatchObject({ id: 'm1', patch: { linkedRichMenuId: 'rm-1' } })
    expect((updateCalls[0] as { patch: { linkedAt: string } }).patch.linkedAt).toEqual(expect.any(String))
    expect(services.audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'link-members', result: 'success' }))
  })

  it('channel ที่ยังไม่มีเมนูของสมาชิก ไม่ยิงอะไรเลย — ไม่แตะ secret หรือ LINE', async () => {
    const linkCalls: unknown[] = []
    const withSecrets = vi.fn()
    const services = fakeServices({
      channels: { findOne: async () => channelSummary(null), withSecrets } as never,
      clientFor: (() => ({ linkToUser: async (...args: unknown[]) => { linkCalls.push(args) } })) as never,
    })

    await linkNewMember(services, memberRow('c1'))

    expect(linkCalls).toEqual([])
    expect(withSecrets).not.toHaveBeenCalled()
    expect(services.audit.write).not.toHaveBeenCalled()
  })

  /** LINE ล่มต้องไม่ทำให้บันทึกสมาชิกไม่ได้ — งานที่กรอกไปแล้วหายแพงกว่าสถานะที่ซ่อมได้ (linkedAt: null) */
  it('LINE ล้มใน linkNewMember ไม่ throw กลับ และไม่เขียน linkedAt — แต่ต้องพิสูจน์ว่าเคยยิง linkToUser จริง', async () => {
    const linkCalls: unknown[] = []
    const updateCalls: unknown[] = []
    const services = fakeServices({
      channels: {
        findOne: async () => channelSummary('rm-1'),
        withSecrets: () => ({ findOne: async () => channelWithSecrets('rm-1'), findDefault: vi.fn() }),
      } as never,
      clientFor: (() => ({
        linkToUser: async (userId: string, richMenuId: string) => {
          linkCalls.push([userId, richMenuId])
          throw new Error('LINE is down')
        },
      })) as never,
      members: {
        ...fakeMemberRepo(),
        update: vi.fn(async (id: string, patch: Partial<MemberRow>) => {
          updateCalls.push({ id, patch })
          return memberRow('c1', { id, ...patch })
        }),
      },
    })

    await expect(linkNewMember(services, memberRow('c1'))).resolves.toBeUndefined()

    // ด่านสำคัญที่สุดของเทสต์นี้: ถ้าลบบรรทัดนี้ทิ้ง โค้ดที่ไม่เรียก LINE เลยก็ยังผ่านเทสต์ได้เหมือนกัน
    expect(linkCalls).toHaveLength(1)
    expect(updateCalls).toEqual([])
    expect(services.audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'link-members', result: 'failure' }))
    expect(services.logger.error).toHaveBeenCalled()
  })

  /**
   * channels.findOne โยน ChannelNotFoundError ได้จริง (channel ถูกลบพร้อมกัน, id ค้าง) — แถวสมาชิก
   * เขียนสำเร็จไปแล้วก่อนฟังก์ชันนี้ถูกเรียก ต้อง**ไม่**ให้ error จุดนี้หลุดกลับเข้า Content Manager
   * เหมือนกับ error ของ LINE เอง — นี่คือด่านที่พิสูจน์ว่า try ครอบตั้งแต่การอ่าน channel จริง ๆ
   * ไม่ใช่แค่ครอบคำเรียก LINE
   */
  it('channels.findOne ล้ม (เช่น channel ถูกลบไปแล้ว) ไม่ throw กลับ และไม่เขียน linkedAt', async () => {
    const updateCalls: unknown[] = []
    const findOne = vi.fn(async () => { throw new Error('channel not found') })
    const services = fakeServices({
      channels: { findOne, withSecrets: () => ({ findOne: vi.fn(), findDefault: vi.fn() }) } as never,
      members: {
        ...fakeMemberRepo(),
        update: vi.fn(async (id: string, patch: Partial<MemberRow>) => {
          updateCalls.push({ id, patch })
          return memberRow('c1', { id, ...patch })
        }),
      },
    })

    await expect(linkNewMember(services, memberRow('c1'))).resolves.toBeUndefined()

    expect(findOne).toHaveBeenCalledTimes(1)
    expect(updateCalls).toEqual([])
    expect(services.audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'link-members', result: 'failure', richMenuId: null }),
    )
    expect(services.logger.error).toHaveBeenCalled()
  })
})

describe('unlinkDeletedMember', () => {
  it('ลบสมาชิกที่เคย link แล้ว unlink คนนั้นออกจาก LINE', async () => {
    const unlinkCalls: unknown[] = []
    const services = fakeServices({
      channels: { withSecrets: () => ({ findOne: async () => channelWithSecrets('rm-1'), findDefault: vi.fn() }) } as never,
      clientFor: (() => ({ unlinkFromUser: async (userId: string) => { unlinkCalls.push(userId) } })) as never,
    })

    await unlinkDeletedMember(services, memberRow('c1', { linkedRichMenuId: 'rm-1', linkedAt: '2026-01-01T00:00:00.000Z' }))

    expect(unlinkCalls).toEqual([UID_A])
    expect(services.audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'unlink-members', result: 'success' }))
  })

  it('ไม่เคย link สำเร็จมาก่อนเลย — ลบแล้วไม่มีอะไรให้ unlink ทั้งฝั่ง LINE', async () => {
    const unlinkCalls: unknown[] = []
    const withSecrets = vi.fn()
    const services = fakeServices({
      channels: { withSecrets } as never,
      clientFor: (() => ({ unlinkFromUser: async (userId: string) => { unlinkCalls.push(userId) } })) as never,
    })

    await unlinkDeletedMember(services, memberRow('c1'))

    expect(unlinkCalls).toEqual([])
    expect(withSecrets).not.toHaveBeenCalled()
  })

  it('LINE ล้มตอน unlink ไม่ throw กลับ แต่ต้องพิสูจน์ว่าเคยยิง unlinkFromUser จริง', async () => {
    const unlinkCalls: unknown[] = []
    const services = fakeServices({
      channels: { withSecrets: () => ({ findOne: async () => channelWithSecrets('rm-1'), findDefault: vi.fn() }) } as never,
      clientFor: (() => ({
        unlinkFromUser: async (userId: string) => { unlinkCalls.push(userId); throw new Error('LINE is down') },
      })) as never,
    })

    await expect(unlinkDeletedMember(services, memberRow('c1', { linkedRichMenuId: 'rm-1' })))
      .resolves.toBeUndefined()

    expect(unlinkCalls).toHaveLength(1)
    expect(services.audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'unlink-members', result: 'failure' }))
  })
})

/**
 * ทดสอบการต่อสายจริงของ registerMemberLifecycles: strapi ปลอมที่ครบพอให้ getServices ประกอบสำเร็จ
 * (เหมือน container.test.ts) บวก entityService ที่มีตารางในหน่วยความจำ (เหมือน repo.test.ts) — คุมให้
 * ทุกเคสวิ่งเส้นทาง "channel ยังไม่มีเมนูสมาชิก" เพื่อไม่ต้องแตะการถอดรหัส token/LineClient จริงเลย
 * (นั่นเป็นหน้าที่ของ describe บนที่ทดสอบ linkNewMember/unlinkDeletedMember ตรง ๆ ไปแล้ว)
 */
function fakeFullStrapi(members: Record<string, unknown>[], channels: Record<string, unknown>[]) {
  const subscribe = vi.fn()
  const tables: Record<string, Record<string, unknown>[]> = { [UID.member]: members, [UID.channel]: channels }
  const strapi = {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {
      get: <T>(path: string, fallback?: T) => {
        if (path === 'plugin.line-rich-menu') return {} as unknown as T
        if (path === 'server.app.keys') return ['app-key-one-that-is-long-enough'] as unknown as T
        return fallback as T
      },
    },
    entityService: {
      findMany: vi.fn(async (uid: string) => tables[uid] ?? []),
      findOne: vi.fn(async (uid: string, id: number | string) =>
        (tables[uid] ?? []).find((row) => String(row['id']) === String(id)) ?? null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    plugin: () => ({ service: () => ({}), contentType: () => ({}) }),
    db: { connection: {}, lifecycles: { subscribe } },
    dirs: { static: { public: '/tmp' } },
  } as unknown as StrapiV4
  return { strapi, subscribe }
}

describe('registerMemberLifecycles', () => {
  it('ลงทะเบียน subscriber ตัวเดียวกับ model line-member และมี handler ครบสี่ตัวตามที่ Step 3 ระบุ', () => {
    const { strapi, subscribe } = fakeFullStrapi([], [])
    registerMemberLifecycles(strapi)

    expect(subscribe).toHaveBeenCalledTimes(1)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber
    expect(subscriber.models).toEqual([UID.member])
    expect(typeof subscriber.beforeCreate).toBe('function')
    expect(typeof subscriber.beforeUpdate).toBe('function')
    expect(typeof subscriber.afterCreate).toBe('function')
    expect(typeof subscriber.afterDelete).toBe('function')
  })

  it('beforeCreate ที่ต่อสายจริง ปฏิเสธ uid ผิดรูปแบบเหมือนกับ validateMemberWrite ตรง ๆ', async () => {
    const { strapi, subscribe } = fakeFullStrapi([], [])
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber

    const event: LifecycleEvent = { params: { data: { lineUserId: 'nope', channel: 'c1' } } }
    await expect(subscriber.beforeCreate!(event)).rejects.toThrow(/line user id/i)
  })

  it('afterCreate ที่ต่อสายจริง อ่านแถวที่เพิ่งสร้างกลับผ่าน services.members แล้วเรียก link — no-op เพราะ channel ยังไม่มีเมนูสมาชิก', async () => {
    const { strapi, subscribe } = fakeFullStrapi(
      [{ id: 1, channel: { id: 10 }, lineUserId: UID_A, displayName: null, linkedRichMenuId: null, linkedAt: null }],
      [{ id: 10, name: 'ร้าน', channelId: '1650000000', accessTokenLast4: 'abcd', isDefault: false }],
    )
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber

    const event: LifecycleEvent = { params: { data: {} }, result: { id: 1 } }
    // ไม่ throw และไม่ต้องแตะ LineClient/การถอดรหัส token เลย เพราะ channel id=10 ไม่มี memberRichMenuId
    await expect(subscriber.afterCreate!(event)).resolves.toBeUndefined()
  })

  it('afterDelete ที่ต่อสายจริง เป็น no-op เมื่อแถวที่ถูกลบไม่เคย link สำเร็จมาก่อน', async () => {
    const { strapi, subscribe } = fakeFullStrapi([], [])
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber

    const event: LifecycleEvent = {
      params: { where: { id: 1 } },
      result: { id: 1, channel: { id: 10 }, lineUserId: UID_A, linkedRichMenuId: null, linkedAt: null },
    }
    await expect(subscriber.afterDelete!(event)).resolves.toBeUndefined()
  })
})
