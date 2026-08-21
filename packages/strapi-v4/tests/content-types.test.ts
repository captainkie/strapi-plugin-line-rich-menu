import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE_TABLE } from '@fosivo/line-rich-menu-core'
import { contentTypes } from '../src/server/content-types/index.js'

const RESERVED = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'publishedAt', 'localizations']

describe('ทุก content type', () => {
  it('มีครบสี่ตัวตามสเปก §7.1', () => {
    expect(Object.keys(contentTypes).sort())
      .toEqual(['line-channel', 'rich-menu', 'rich-menu-audit', 'rich-menu-schedule'])
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

  it('op ตรงกับ ScheduleOp', () => {
    expect(attributes['op']).toMatchObject({
      type: 'enumeration', enum: ['set-default', 'clear-default', 'swap-alias'], required: true,
    })
  })
})

describe('rich-menu-audit', () => {
  const attributes = contentTypes['rich-menu-audit'].schema.attributes

  it('เก็บผู้กระทำและของที่ถูกกระทำเป็นตัวเลข ไม่ใช่ relation — ประวัติต้องอยู่รอดหลังของถูกลบ', () => {
    expect(attributes['actorId']).toMatchObject({ type: 'integer' })
    expect(attributes['channelId']).toMatchObject({ type: 'integer', required: true })
    expect(attributes['richMenuId']).toMatchObject({ type: 'integer' })
    for (const key of Object.keys(attributes)) {
      expect((attributes[key] as { type: string }).type).not.toBe('relation')
    }
  })

  it('action ครอบทั้งหกอย่างตามสเปก §11.5', () => {
    expect(attributes['action']).toMatchObject({
      type: 'enumeration',
      enum: ['publish', 'set-default', 'clear-default', 'swap-alias', 'delete', 'channel-update'],
      required: true,
    })
  })
})
