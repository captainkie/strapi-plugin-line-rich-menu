import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE_TABLE } from '@fosivo/line-rich-menu-core'
import { UID, contentTypes } from '../server/src/content-types/index.js'

const schemas = Object.values(contentTypes).map((entry) => entry.schema)

describe('content type ทั้งสี่', () => {
  it('ครบสี่ตัวและ uid ตรงกับชื่อ singular ของแต่ละตัว', () => {
    expect(Object.keys(contentTypes).sort()).toEqual(
      ['line-channel', 'rich-menu', 'rich-menu-audit', 'rich-menu-schedule'],
    )
    for (const [key, entry] of Object.entries(contentTypes)) {
      expect(entry.schema.info.singularName, key).toBe(key)
      expect(Object.values(UID)).toContain(`plugin::line-rich-menu.${key}`)
    }
  })

  it('ปิด draft & publish ทุกตัว — "published" ของปลั๊กอินนี้หมายถึงสถานะบน LINE', () => {
    for (const schema of schemas) {
      expect(schema.options?.draftAndPublish, schema.collectionName).toBe(false)
    }
  })

  it('ซ่อนจาก content manager และ content-type builder ทุกตัว', () => {
    for (const schema of schemas) {
      expect(schema.pluginOptions?.['content-manager'], schema.collectionName).toEqual({ visible: false })
      expect(schema.pluginOptions?.['content-type-builder'], schema.collectionName).toEqual({ visible: false })
    }
  })

  // lock ยิงผ่าน knex ตรง ๆ ไม่ผ่าน documents() จึงไม่มีใครแปลงชื่อตารางให้
  it('ชื่อตารางของ schedule ตรงกับที่ lock query ใน core ใช้', () => {
    expect(contentTypes['rich-menu-schedule'].schema.collectionName).toBe(DEFAULT_SCHEDULE_TABLE)
  })

  it('ไม่มีตัวไหนประกาศ publishedAt เอง — Strapi จองชื่อนี้ไว้', () => {
    for (const schema of schemas) {
      expect(schema.attributes['publishedAt'], schema.collectionName).toBeUndefined()
    }
  })

  it('ฟิลด์ลับของ channel เป็น private ทั้งสามตัว', () => {
    const attributes = contentTypes['line-channel'].schema.attributes
    for (const field of ['channelAccessToken', 'channelSecret', 'accessTokenLast4']) {
      expect(attributes[field]?.private, field).toBe(true)
    }
  })

  /**
   * นี่คือความต่างที่แท้จริงข้อหนึ่งระหว่าง v4 กับ v5 ในชั้นข้อมูล
   *
   * v4 เก็บ actorId/richMenuId/channelId ของ audit เป็น `integer` เพราะ id ของ v4 เป็นตัวเลข
   * ส่วน v5 อ้างถึงสิ่งเดียวกันด้วย `documentId` ซึ่งเป็นสตริง 24 ตัวอักษร คอลัมน์ integer
   * จะกลืนมันไม่ได้เลย — sqlite จะเก็บเป็น 0 เงียบ ๆ ส่วน postgres จะโยน error ตอน insert
   * ซึ่งแปลว่า audit ของทุก publish จะหายไปทั้งหมด (ตามการตัดสินใจข้อ 6 ของ Plan 03
   * error ของ audit ถูกกลืนและ log ไว้เฉย ๆ) โดยไม่มีอะไรบนหน้าจอบอกผู้ใช้เลย
   *
   * `actorId` ยังเป็น integer เพราะ admin user ของ Strapi 5 ยังใช้ id เป็นตัวเลขอยู่
   * (`ctx.state.user.id`) ไม่ได้เป็น document
   */
  it('audit เก็บ id ของ v5 เป็นสตริง ไม่ใช่ตัวเลข', () => {
    const attributes = contentTypes['rich-menu-audit'].schema.attributes
    expect(attributes['richMenuId']?.type).toBe('string')
    expect(attributes['channelId']?.type).toBe('string')
    expect(attributes['channelId']?.required).toBe(true)
    expect(attributes['actorId']?.type).toBe('integer')
  })

  it('audit ยังไม่ใช้ relation — ประวัติต้องอยู่รอดหลังของที่มันอ้างถึงถูกลบ', () => {
    for (const attribute of Object.values(contentTypes['rich-menu-audit'].schema.attributes)) {
      expect(attribute.type).not.toBe('relation')
    }
  })

  it('เมนูเก็บผลของ normalize ไว้ครบ เพื่อให้ publish ไม่ต้องเรียก sharp เอง', () => {
    const attributes = contentTypes['rich-menu'].schema.attributes
    for (const field of ['normalizedImage', 'normalizedMime', 'normalizedWidth', 'normalizedHeight']) {
      expect(attributes[field], field).toBeDefined()
    }
    expect(attributes['linePublishedAt']?.type).toBe('datetime')
  })
})
