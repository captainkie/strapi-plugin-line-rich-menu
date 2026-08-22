import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE_TABLE } from '@fosivo/line-rich-menu-core'
import { contentTypes } from '../src/server/content-types/index.js'

const RESERVED = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'publishedAt', 'localizations']

describe('ทุก content type', () => {
  it('มีครบห้าตัว — line-member เพิ่มเข้ามาใน Task 6', () => {
    expect(Object.keys(contentTypes).sort())
      .toEqual(['line-channel', 'line-member', 'rich-menu', 'rich-menu-audit', 'rich-menu-schedule'])
  })

  // line-member คือตัวเดียวที่เปิดให้เห็นใน Content Manager โดยตั้งใจ (การจัดการรายชื่อด้วยมือ
  // คือทั้งหมดของฟีเจอร์นี้) — ต้องยืนยันว่ามันเป็น "ข้อยกเว้นตัวเดียว" ไม่ใช่แค่ "มี visible: true"
  // เพราะถ้าเผลอเปิดตัวอื่นเพิ่มด้วย เทสต์ที่เช็คแค่ line-member เฉย ๆ จะจับไม่ได้เลย
  it('line-member เป็นตัวเดียวในปลั๊กอินที่เปิดให้เห็นใน Content Manager', () => {
    const visible = Object.entries(contentTypes)
      .filter(([, entry]) => (entry.schema.pluginOptions?.['content-manager'] as { visible?: boolean } | undefined)?.visible === true)
      .map(([key]) => key)
    expect(visible).toEqual(['line-member'])
    expect(contentTypes['line-member'].schema.pluginOptions?.['content-type-builder']).toEqual({ visible: false })
  })

  it('ตรึงชื่อตารางไว้เอง ไม่ปล่อยให้ Strapi เดา', () => {
    expect(contentTypes['line-channel'].schema.collectionName).toBe('line_channels')
    expect(contentTypes['rich-menu'].schema.collectionName).toBe('rich_menus')
    expect(contentTypes['rich-menu-schedule'].schema.collectionName).toBe(DEFAULT_SCHEDULE_TABLE)
    expect(contentTypes['rich-menu-audit'].schema.collectionName).toBe('rich_menu_audits')
  })

  it('ไม่มีตัวไหนประกาศ attribute ที่ Strapi จองชื่อไว้', () => {
    for (const [name, definition] of Object.entries(contentTypes)) {
      const clashes = Object.keys(definition.schema.attributes).filter((key) => RESERVED.includes(key))
      expect(clashes, `${name} ประกาศทับชื่อที่ Strapi จองไว้`).toEqual([])
    }
  })

  it('ปิด draft & publish ทุกตัว — สถานะของเมนูเป็นเรื่องของ LINE ไม่ใช่ของ Strapi', () => {
    for (const definition of Object.values(contentTypes)) {
      expect(definition.schema.options?.draftAndPublish).toBe(false)
    }
  })
})

describe('line-channel', () => {
  const attributes = contentTypes['line-channel'].schema.attributes

  it('ความลับถูกมาร์กเป็น private ทุกตัว — ชั้นป้องกันที่สองถัดจาก DTO', () => {
    expect(attributes['channelAccessToken']).toMatchObject({ type: 'text', required: true, private: true })
    expect(attributes['channelSecret']).toMatchObject({ type: 'text', private: true })
    expect(attributes['accessTokenLast4']).toMatchObject({ type: 'string', private: true })
  })

  it('channelId ห้ามซ้ำ', () => {
    expect(attributes['channelId']).toMatchObject({ type: 'string', required: true, unique: true })
  })

  it('memberRichMenuId เป็น string ธรรมดา ไม่ใช่ relation', () => {
    expect(attributes['memberRichMenuId']).toMatchObject({ type: 'string' })
  })
})

describe('rich-menu', () => {
  const attributes = contentTypes['rich-menu'].schema.attributes

  it('ผูกกับ channel แบบ manyToOne และบังคับให้มี', () => {
    expect(attributes['channel']).toMatchObject({
      type: 'relation', relation: 'manyToOne', target: 'plugin::line-rich-menu.line-channel', required: true,
    })
  })

  it('enumeration ตรงกับ union ในชั้น service เป๊ะ', () => {
    expect(attributes['size']).toMatchObject({ type: 'enumeration', enum: ['large', 'compact'] })
    expect(attributes['chatBarMode']).toMatchObject({ type: 'enumeration', enum: ['default', 'custom'] })
    expect(attributes['status']).toMatchObject({
      type: 'enumeration', enum: ['draft', 'publishing', 'published', 'failed'], default: 'draft',
    })
  })

  it('เวลาที่ publish ขึ้น LINE ใช้ชื่อ linePublishedAt เพราะ publishedAt ถูก Strapi จองไว้', () => {
    expect(attributes['linePublishedAt']).toMatchObject({ type: 'datetime' })
    expect(attributes['publishedAt']).toBeUndefined()
  })

  it('เก็บผลของ normalize ไว้ให้ publish อ่านอย่างเดียว', () => {
    expect(attributes['normalizedImage']).toMatchObject({ type: 'media', multiple: false })
    expect(attributes['normalizedMime']).toMatchObject({ type: 'string' })
    expect(attributes['normalizedWidth']).toMatchObject({ type: 'integer' })
    expect(attributes['normalizedHeight']).toMatchObject({ type: 'integer' })
  })

  it('aliasId ไม่ประกาศ unique เดี่ยว — ข้อบังคับคือ unique ต่อ channel ซึ่ง v4 ทำที่ระดับ schema ไม่ได้', () => {
    expect(attributes['aliasId']).toMatchObject({ type: 'string' })
    expect((attributes['aliasId'] as { unique?: boolean }).unique).toBeUndefined()
  })

  it('มี audience แบบ enum required ที่ default เป็น all — เมนูเก่าที่ไม่เคยตั้งค่าต้องยังทำงานแบบเดิม', () => {
    expect(attributes['audience']).toMatchObject({
      type: 'enumeration', enum: ['all', 'members'], default: 'all', required: true,
    })
  })
})

describe('rich-menu-schedule', () => {
  const attributes = contentTypes['rich-menu-schedule'].schema.attributes

  it('มีคอลัมน์ที่ lock query ต้องใช้ครบ', () => {
    expect(attributes['state']).toMatchObject({
      type: 'enumeration', enum: ['pending', 'running', 'done', 'failed'], default: 'pending',
    })
    expect(attributes['lockedBy']).toMatchObject({ type: 'string' })
    expect(attributes['lockedAt']).toMatchObject({ type: 'datetime' })
    expect(attributes['lastError']).toMatchObject({ type: 'text' })
  })

  it('op ตรงกับ ScheduleOp รวม link-members และ unlink-members', () => {
    expect(attributes['op']).toMatchObject({
      type: 'enumeration',
      enum: ['set-default', 'clear-default', 'swap-alias', 'link-members', 'unlink-members'],
      required: true,
    })
  })

  it('มีคอลัมน์ cursor สำหรับ keyset paging ของงาน link-members', () => {
    expect(attributes['cursor']).toMatchObject({ type: 'string' })
  })
})

describe('line-member', () => {
  const attributes = contentTypes['line-member'].schema.attributes

  it('channel เป็น relation required, lineUserId required, ที่เหลือ optional', () => {
    expect(attributes['channel']).toMatchObject({
      type: 'relation', relation: 'manyToOne', target: 'plugin::line-rich-menu.line-channel', required: true,
    })
    expect(attributes['lineUserId']).toMatchObject({ type: 'string', required: true })
    for (const field of ['displayName', 'linkedRichMenuId', 'linkedAt']) {
      expect(attributes[field]?.required, field).not.toBe(true)
    }
    expect(attributes['linkedAt']).toMatchObject({ type: 'datetime' })
  })
})

describe('rich-menu-audit', () => {
  const attributes = contentTypes['rich-menu-audit'].schema.attributes

  it('เก็บผู้กระทำและ channel เป็นตัวเลข ไม่ใช่ relation — ประวัติต้องอยู่รอดหลังของถูกลบ', () => {
    expect(attributes['actorId']).toMatchObject({ type: 'integer' })
    expect(attributes['channelId']).toMatchObject({ type: 'integer', required: true })
    for (const key of Object.keys(attributes)) {
      expect((attributes[key] as { type: string }).type).not.toBe('relation')
    }
  })

  // Task 10 — richMenuId เดิมเป็น integer เพราะตอนนั้นมีความหมายเดียว (id แถวเมนูของเราเอง)
  // แต่ตอนนี้งานระดับสมาชิก (link-members/unlink-members) เก็บ id ฝั่ง LINE ซึ่งเป็นสตริง
  // (ดูคอมเมนต์เต็มที่ AuditRow.richMenuId ใน core/server/types.ts) คอลัมน์ integer เดิมบังคับ
  // `Number('line-rm-1')` ที่ repo.ts ได้ NaN แล้วโดน Strapi ปฏิเสธแถวเงียบ ๆ — อีกสาเหตุหนึ่ง
  // (นอกจาก enum ที่ขาดหาย) ที่ทำให้ audit ของงานสมาชิกไม่เคยถูกบันทึกเลยตั้งแต่ Task 8
  it('richMenuId เป็น string ไม่ใช่ integer — ต้องรองรับทั้ง id แถวเมนูของเราและ id ฝั่ง LINE', () => {
    expect(attributes['richMenuId']).toMatchObject({ type: 'string' })
  })

  // Task 10 — enum เดิมมีแค่หกค่าตามสเปก §11.5 ขาดสองค่าของงานสมาชิก (link-members/unlink-members)
  // ที่ Task 8 เพิ่มเข้า schedule op แล้วแต่ลืมเติมที่นี่ ทำให้ audit ของงานสมาชิกทุกแถวถูก Strapi
  // ปฏิเสธแล้วหายไปเงียบ ๆ ผ่าน persistQuietly (ดู audit.ts) — เทสต์นี้ต้องครอบ AuditAction ของ
  // core ทั้งเก้าค่า (Task 12 เพิ่ม 'unlink-all') ไม่ใช่แค่หกค่าเดิม ไม่งั้น regression แบบเดียวกัน
  // จะไม่ถูกจับอีก
  it('action ครอบทั้งเก้าอย่างของ AuditAction รวมสองงานสมาชิกและ unlink-all', () => {
    expect(attributes['action']).toMatchObject({
      type: 'enumeration',
      enum: [
        'publish', 'set-default', 'clear-default', 'swap-alias', 'delete', 'channel-update',
        'link-members', 'unlink-members', 'unlink-all',
      ],
      required: true,
    })
  })
})
