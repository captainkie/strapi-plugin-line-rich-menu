import { describe, expect, it, vi } from 'vitest'
import type { ListParams, MemberRow, Repo } from '@fosivo/line-rich-menu-core'
import { UID } from '../server/src/content-types/index.js'
import type { Services } from '../server/src/container.js'
import {
  linkNewMember, registerMemberLifecycles, unlinkDeletedMember, validateMemberWrite,
} from '../server/src/lifecycles.js'
import type { LifecycleEvent, LifecycleSubscriber, StrapiV5 } from '../server/src/strapi.js'

const UID_A = `U${'a'.repeat(32)}`

function memberRow(channelId: string, overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: 'm1', channelId, lineUserId: UID_A, displayName: null,
    linkedRichMenuId: null, linkedAt: null, ...overrides,
  }
}

/** repo ปลอมของ services.members สำหรับเทสต์ validateMemberWrite/linkNewMember โดยตรง — filter
 * ตาม channelId เหมือน createMemberRepo จริงของ v5 (mapFilters ใน repo.ts) */
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
    lock: { claim: vi.fn(), heartbeat: vi.fn(), release: vi.fn() },
    clientFor: vi.fn(),
    transaction: async (fn) => fn(),
    ...overrides,
  }
}

describe('validateMemberWrite', () => {
  it('ปฏิเสธ uid ที่ผิดรูปแบบก่อนบันทึก', async () => {
    await expect(validateMemberWrite(fakeMemberRepo(), { lineUserId: 'nope' }, { channelId: 'c1', exceptId: null }))
      .rejects.toThrow(/line user id/i)
  })

  it('ปฏิเสธ uid ซ้ำภายใน channel เดียวกัน แต่ยอมให้ซ้ำข้าม channel', async () => {
    const members = fakeMemberRepo([memberRow('c1', { id: 'm1', lineUserId: UID_A })])

    await expect(validateMemberWrite(members, { lineUserId: UID_A }, { channelId: 'c1', exceptId: null }))
      .rejects.toThrow(/already/i)
    await expect(validateMemberWrite(members, { lineUserId: UID_A }, { channelId: 'c2', exceptId: null }))
      .resolves.toBeUndefined()
  })

  it('แถวตัวเองไม่ถูกนับเป็นของซ้ำ เมื่อ exceptId ตรงกับ id ของแถวนั้น (beforeUpdate re-save โดยไม่เปลี่ยนอะไร)', async () => {
    const members = fakeMemberRepo([memberRow('c1', { id: 'm1', lineUserId: UID_A })])
    await expect(validateMemberWrite(members, { lineUserId: UID_A }, { channelId: 'c1', exceptId: 'm1' }))
      .resolves.toBeUndefined()
  })

  it('ไม่เช็คอะไรเลยเมื่อคำขอไม่ได้แตะ lineUserId — beforeUpdate ที่แก้แค่ displayName', async () => {
    const members = fakeMemberRepo()
    await expect(validateMemberWrite(members, { displayName: 'ใหม่' }, { channelId: null, exceptId: null }))
      .resolves.toBeUndefined()
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
    await expect(validateMemberWrite(members, { lineUserId: `U${'b'.repeat(32)}` }, { channelId: null, exceptId: 'm2' }))
      .rejects.toThrow(/already/i)
    expect(members.findOne).toHaveBeenCalledWith('m2')

    // เปลี่ยนไปเป็น uid ที่ไม่ซ้ำใครใน c1 เลย — ต้องผ่าน ไม่ใช่ถูกปฏิเสธเพราะหา channel ไม่เจอ
    await expect(validateMemberWrite(members, { lineUserId: `U${'c'.repeat(32)}` }, { channelId: null, exceptId: 'm2' }))
      .resolves.toBeUndefined()
  })

  /**
   * ด่านนี้ต้องไม่ถูกข้ามเงียบ ๆ เด็ดขาด — ถ้าเช็คซ้ำไม่ได้จริง ๆ (ไม่มีทางรู้ channel เลย) ต้อง
   * ปฏิเสธการเขียน ไม่ใช่ปล่อยผ่านแบบเดิม เพราะ "ปล่อยผ่านดีกว่าปฏิเสธของถูก" ใช้ไม่ได้กับด่าน
   * uniqueness — ข้อมูลซ้ำที่หลุดเข้าไปเงียบ ๆ แพงกว่าการเขียนที่ถูกปฏิเสธแล้วผู้ใช้แก้ไขใหม่ได้
   */
  it('payload ไม่มี channel และไม่มี exceptId (ไม่รู้ว่าแถวไหนเลย) — ปฏิเสธ ไม่ใช่ปล่อยผ่าน', async () => {
    const members = fakeMemberRepo()
    await expect(validateMemberWrite(members, { lineUserId: UID_A }, { channelId: null, exceptId: null }))
      .rejects.toThrow(/uniqueness/i)
    expect(members.findOne).not.toHaveBeenCalled()
    expect(members.findMany).not.toHaveBeenCalled()
  })

  /**
   * ตัวจับใจความของ fix รอบนี้: exceptId มีค่าจริง แต่ `members.findOne(exceptId)` หาแถวไม่เจอ
   * (คืน null) — เช่น exceptId มาจาก where.id ที่เป็น primary key ตัวเลข ไม่ใช่ documentId ที่
   * findOne คาดหวัง เดิมโค้ดตกลงไปที่ `existing?.channelId ?? null` แล้วปล่อยผ่านเงียบ ๆ เหมือน
   * กรณี exceptId เป็น null เป๊ะ — รอบนี้ทั้งสองทางต้องจบที่ปฏิเสธเหมือนกัน
   */
  it('exceptId มีค่าแต่หาแถวไม่เจอ (findOne คืน null) — ปฏิเสธ ไม่ใช่ปล่อยผ่านเหมือนที่เคยเป็น', async () => {
    const members = fakeMemberRepo() // ไม่มีแถวไหนเลย — findOne('m-missing') จะคืน null เสมอ
    await expect(validateMemberWrite(members, { lineUserId: UID_A }, { channelId: null, exceptId: 'm-missing' }))
      .rejects.toThrow(/uniqueness/i)
    expect(members.findOne).toHaveBeenCalledWith('m-missing')
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
 * (เหมือน container.test.ts) บวก documents() ที่มีตารางในหน่วยความจำ (เหมือน repo.test.ts)
 *
 * แถวในตารางมีทั้ง `id` ตัวเลขและ `documentId` เพราะทั้งสองอย่างนี้เป็นคนละตัวระบุกันจริง ๆ บน v5
 * และความต่างนั้นคือทั้งเรื่อง: `documents().findOne` หาเจอด้วย documentId เท่านั้น ส่วน
 * `db.query().findOne` หาเจอด้วย primary key ตัวเลขเท่านั้น — ตรงกับของจริง ทำให้เทสต์ที่ยิง
 * primary key เข้า hook พิสูจน์การแปลได้จริง ไม่ใช่ผ่านเพราะ fake ยอมรับทุกอย่าง
 *
 * `findMany` กรองด้วย `channel.documentId` เหมือน mapFilters ของ createMemberRepo ด้วยเหตุผล
 * เดียวกัน — ถ้ามันคืนทุกแถวเสมอ ด่านเช็คซ้ำจะเขียวแม้ channel ที่ส่งเข้าไปเป็นคนละตัวระบุ
 */
function fakeFullStrapi(members: Record<string, unknown>[], channels: Record<string, unknown>[]) {
  const subscribe = vi.fn()
  const created: { uid: string; data: Record<string, unknown> }[] = []
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
    documents: (uid: string) => ({
      findMany: vi.fn(async (params?: { filters?: Record<string, unknown> }) => {
        const channel = (params?.filters?.['channel'] as { documentId?: string } | undefined)?.documentId
        const rows = tables[uid] ?? []
        return channel === undefined
          ? rows
          : rows.filter((row) => (row['channel'] as { documentId?: string } | undefined)?.documentId === channel)
      }),
      findOne: vi.fn(async (params: { documentId: string }) =>
        (tables[uid] ?? []).find((row) => row['documentId'] === params.documentId) ?? null),
      create: vi.fn(async (params: { data: Record<string, unknown> }) => {
        created.push({ uid, data: params.data })
        return {}
      }),
      update: vi.fn(),
      delete: vi.fn(),
    }),
    plugin: () => ({ service: () => ({}), contentType: () => ({}) }),
    db: {
      connection: {},
      query: (uid: string) => ({
        findOne: vi.fn(async (params: { where: Record<string, unknown> }) =>
          (tables[uid] ?? []).find((row) => row['id'] === params.where['id']) ?? null),
      }),
      transaction: async (fn: () => unknown) => fn(),
      lifecycles: { subscribe },
    },
    dirs: { static: { public: '/tmp' } },
  } as unknown as StrapiV5
  return { strapi, subscribe, created }
}

const CHANNEL_ROW = {
  id: 10, documentId: 'c1', name: 'ร้าน', channelId: '1650000000', accessTokenLast4: 'abcd', isDefault: false,
}

const memberEntity = (over: Record<string, unknown>) => ({
  id: 1, documentId: 'mem1', channel: { id: 10, documentId: 'c1' }, lineUserId: UID_A,
  displayName: null, linkedRichMenuId: null, linkedAt: null, ...over,
})

/**
 * จำลอง Map ที่ provider จริงของ `@strapi/database` ใช้เก็บ `state` ระหว่าง before/after hook ของ
 * คำสั่งเดียวกัน แล้วส่งกลับมาเป็น `state` ของ event **คนละ object** ที่ hook ตัวหลังได้รับ (ดูคอมเมนต์
 * ที่ `LifecycleEvent.state` ใน strapi.ts) — ก่อนหน้านี้เทสต์ของ beforeDelete/afterDelete ในไฟล์นี้
 * ส่ง event object เดียวกันให้ทั้งสอง hook ซึ่งพิสูจน์ได้แค่ว่าโค้ดอ่านค่าที่ตัวเองเพิ่งเขียนลง object
 * เดียวกันได้ ไม่ใช่ว่าสัญญาการส่งผ่าน state ข้าม hook ทำงานจริง (จะเขียวอยู่ดีแม้ beforeDelete ไม่ได้
 * เขียนผ่าน event.state เลย) คนละ event object ต่อ hook คือสิ่งที่ทำให้เทสต์นี้ล้มได้จริงถ้าสัญญานั้นพัง
 */
function fakeProviderStates() {
  let stored: Record<string, unknown> | undefined
  return {
    before(shape: Omit<LifecycleEvent, 'state'>): LifecycleEvent {
      return { ...shape, state: stored }
    },
    capture(event: LifecycleEvent): void {
      stored = event.state
    },
    after(shape: Omit<LifecycleEvent, 'state'>): LifecycleEvent {
      return { ...shape, state: stored }
    },
  }
}

describe('registerMemberLifecycles', () => {
  it('ลงทะเบียน subscriber ตัวเดียวกับ model line-member และมี handler ครบทั้งห้าตัว', () => {
    const { strapi, subscribe } = fakeFullStrapi([], [])
    registerMemberLifecycles(strapi)

    expect(subscribe).toHaveBeenCalledTimes(1)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber
    expect(subscriber.models).toEqual([UID.member])
    expect(typeof subscriber.beforeCreate).toBe('function')
    expect(typeof subscriber.beforeUpdate).toBe('function')
    expect(typeof subscriber.afterCreate).toBe('function')
    expect(typeof subscriber.beforeDelete).toBe('function')
    expect(typeof subscriber.afterDelete).toBe('function')
  })

  it('beforeCreate ที่ต่อสายจริง ปฏิเสธ uid ผิดรูปแบบเหมือนกับ validateMemberWrite ตรง ๆ', async () => {
    const { strapi, subscribe } = fakeFullStrapi([], [])
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber

    const event: LifecycleEvent = { params: { data: { lineUserId: 'nope', channel: { connect: [{ id: 10 }] } } } }
    await expect(subscriber.beforeCreate!(event)).rejects.toThrow(/line user id/i)
  })

  /**
   * `data.channel` ที่มาถึง db.lifecycles เป็น **primary key ตัวเลข** เสมอ (document service แปลง
   * documentId ให้ก่อนแล้ว) ถ้าเอาเลขนั้นไปกรอง `channelId` ของชั้น service ตรง ๆ จะไม่เจอสมาชิก
   * สักคนในทุกกรณี — ด่านเช็คซ้ำจะเขียวตลอดกาลโดยไม่เคยเปรียบเทียบอะไรเลย ซึ่งคือความล้มเหลว
   * ที่มองไม่เห็นแบบเดียวกับที่กฎ fail closed มีไว้กัน
   */
  it('beforeCreate จับ uid ซ้ำได้จริงเมื่อ channel มาเป็น primary key ตัวเลข', async () => {
    const { strapi, subscribe } = fakeFullStrapi([memberEntity({})], [CHANNEL_ROW])
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber

    const event: LifecycleEvent = { params: { data: { lineUserId: UID_A, channel: { connect: [{ id: 10 }] } } } }
    await expect(subscriber.beforeCreate!(event)).rejects.toThrow(/already/i)
  })

  /**
   * finding ที่ 2 ของ Task 13 รอบแรก: `where.id` ที่ event ส่งมาคือ primary key ตัวเลข ส่วน
   * `services.members.findOne` ค้นด้วย documentId — ยิงตรง ๆ จะได้ null ทุกครั้ง แล้วกฎ fail closed
   * ก็ปฏิเสธการแก้ไขธรรมดาที่ไม่มีอะไรผิดเลย ด่านนี้จึงต้องผ่านได้ **และ** ยังจับของซ้ำได้จริง
   * ทั้งสองอย่างพร้อมกัน — อย่างใดอย่างหนึ่งเดี่ยว ๆ ผ่านได้ด้วยโค้ดที่ยังพัง
   */
  it('beforeUpdate ที่ payload ไม่มี channel resolve แถวเดิมจาก primary key ได้ — ผ่านของถูก ปฏิเสธของซ้ำ', async () => {
    const { strapi, subscribe } = fakeFullStrapi(
      [memberEntity({}), memberEntity({ id: 2, documentId: 'mem2', lineUserId: `U${'b'.repeat(32)}` })],
      [CHANNEL_ROW],
    )
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber

    await expect(subscriber.beforeUpdate!({
      params: { where: { id: 1 }, data: { lineUserId: `U${'c'.repeat(32)}` } },
    })).resolves.toBeUndefined()

    await expect(subscriber.beforeUpdate!({
      params: { where: { id: 1 }, data: { lineUserId: `U${'b'.repeat(32)}` } },
    })).rejects.toThrow(/already/i)
  })

  it('afterCreate ที่ต่อสายจริง อ่านแถวที่เพิ่งสร้างกลับผ่าน services.members แล้วเรียก link — no-op เพราะ channel ยังไม่มีเมนูสมาชิก', async () => {
    const { strapi, subscribe } = fakeFullStrapi([memberEntity({})], [CHANNEL_ROW])
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber

    const event: LifecycleEvent = { params: { data: {} }, result: { documentId: 'mem1' } }
    // ไม่ throw และไม่ต้องแตะ LineClient/การถอดรหัส token เลย เพราะ channel c1 ไม่มี memberRichMenuId
    await expect(subscriber.afterCreate!(event)).resolves.toBeUndefined()
  })

  /**
   * finding ที่ 1 ของ Task 13 รอบแรก: `event.result` ของ afterDelete ไม่มี `channel` และไม่มี
   * `linkedRichMenuId` ติดมาเลย (ตรงกับของจริง — `entries.delete` ไม่ส่ง populate) ค่าที่ unlink
   * ต้องใช้จึงมาได้จากที่เดียวคือแถวที่ beforeDelete อ่านไว้ก่อนแถวจะหาย
   *
   * ยืนยันด้วย audit ที่เขียนออกมา ไม่ใช่แค่ "ไม่ throw" — `richMenuId: 'rm-1'` มีอยู่เฉพาะในแถว
   * ที่อ่านไว้ล่วงหน้า ถ้า afterDelete กลับไปพึ่ง event.result จะไม่มีทางเขียนค่านี้ได้เลย
   */
  it('beforeDelete เก็บแถวไว้ให้ afterDelete unlink — ผ่าน state คนละ event object เหมือน provider จริง ไม่พึ่ง event.result ที่ไม่มี channel', async () => {
    const { strapi, subscribe, created } = fakeFullStrapi(
      [memberEntity({ linkedRichMenuId: 'rm-1', linkedAt: '2026-01-01T00:00:00.000Z' })],
      [CHANNEL_ROW],
    )
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber
    const states = fakeProviderStates()

    const beforeEvent = states.before({ params: { where: { id: 1 } }, result: { documentId: 'mem1', lineUserId: UID_A } })
    await subscriber.beforeDelete!(beforeEvent)
    states.capture(beforeEvent)

    const afterEvent = states.after({ params: { where: { id: 1 } }, result: { documentId: 'mem1', lineUserId: UID_A } })
    await expect(subscriber.afterDelete!(afterEvent)).resolves.toBeUndefined()

    // ครึ่งที่คุยกับ LINE จริงถูกพิสูจน์ไปแล้วที่ describe ของ unlinkDeletedMember — ที่นี่พิสูจน์
    // แค่ว่าค่าที่ beforeDelete เก็บไว้เดินทางถึง unlinkDeletedMember จริง ผ่าน state ที่ provider
    // ส่งต่อข้าม event object จริง ๆ ไม่ใช่แค่ mutation ของ object เดียวกัน
    expect(created.filter((row) => row.uid === UID.audit))
      .toEqual([{ uid: UID.audit, data: expect.objectContaining({ action: 'unlink-members', richMenuId: 'rm-1' }) }])
  })

  it('afterDelete ที่ beforeDelete อ่านแถวไม่เจอ เป็น no-op — ไม่ throw ใส่การลบที่สำเร็จไปแล้ว', async () => {
    const { strapi, subscribe, created } = fakeFullStrapi([], [])
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber
    const states = fakeProviderStates()

    const beforeEvent = states.before({ params: { where: { id: 1 } }, result: { documentId: 'mem1' } })
    await subscriber.beforeDelete!(beforeEvent)
    states.capture(beforeEvent)

    const afterEvent = states.after({ params: { where: { id: 1 } }, result: { documentId: 'mem1' } })
    await expect(subscriber.afterDelete!(afterEvent)).resolves.toBeUndefined()
    expect(created).toEqual([])
  })

  /**
   * Minor (task-13-findings-2.md รอบ 3): เคสที่ยังไม่เคยมีเทสต์เลย — provider ไม่ได้ส่งต่อ state
   * มาให้ afterDelete จริง ๆ (ต่างจากเคส "beforeDelete อ่านแถวไม่เจอ" ข้างบน ที่ยัง stash `null`
   * ไว้ให้ผ่าน event.state) `stashedMember` ต้องอ่าน `event.state?.[...]` ด้วย optional chaining
   * แล้วได้ null กลับมา ไม่ใช่ throw เพราะ `event.state` เป็น undefined ล้วน ๆ
   */
  it('afterDelete ที่ไม่มี state ถูกส่งต่อมาให้เลย (beforeDelete ไม่เคยรันมาก่อน) เป็น no-op เงียบ ๆ', async () => {
    const { strapi, subscribe, created } = fakeFullStrapi(
      [memberEntity({ linkedRichMenuId: 'rm-1', linkedAt: '2026-01-01T00:00:00.000Z' })],
      [CHANNEL_ROW],
    )
    registerMemberLifecycles(strapi)
    const subscriber = subscribe.mock.calls[0]![0] as LifecycleSubscriber

    const event: LifecycleEvent = { params: { where: { id: 1 } }, result: { documentId: 'mem1', lineUserId: UID_A } }
    await expect(subscriber.afterDelete!(event)).resolves.toBeUndefined()
    // ต้องไม่ unlink ทั้งที่แถวจริงมี linkedRichMenuId — พิสูจน์ว่า afterDelete ไม่ได้ไปอ่านค่าจากที่อื่น
    expect(created).toEqual([])
  })
})
