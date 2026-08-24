import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE_TABLE } from '@fosivo/line-rich-menu-core'
import { UID, contentTypes } from '../server/src/content-types/index.js'

const schemas = Object.values(contentTypes).map((entry) => entry.schema)

describe('content type ทั้งห้า', () => {
  it('ครบห้าตัวและ uid ตรงกับชื่อ singular ของแต่ละตัว', () => {
    expect(Object.keys(contentTypes).sort()).toEqual(
      ['line-channel', 'line-member', 'rich-menu', 'rich-menu-audit', 'rich-menu-schedule'],
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

  it('ซ่อนจาก content manager และ content-type builder ทุกตัว ยกเว้น line-member', () => {
    for (const [key, entry] of Object.entries(contentTypes)) {
      if (key === 'line-member') continue
      expect(entry.schema.pluginOptions?.['content-manager'], key).toEqual({ visible: false })
      expect(entry.schema.pluginOptions?.['content-type-builder'], key).toEqual({ visible: false })
    }
  })

  // line-member คือตัวเดียวที่เปิดให้เห็นใน Content Manager โดยตั้งใจ (การจัดการรายชื่อด้วยมือ
  // คือทั้งหมดของฟีเจอร์นี้) — ต้องยืนยันว่ามันเป็น "ข้อยกเว้นตัวเดียว" ไม่ใช่แค่ "มี visible: true"
  // เพราะเทสต์ก่อนหน้านี้ข้ามมันไปเฉย ๆ ไม่ได้พิสูจน์ว่าไม่มีตัวอื่นหลุดตามมาด้วย
  it('line-member เป็นตัวเดียวที่เปิดให้เห็นใน Content Manager', () => {
    const visible = Object.entries(contentTypes)
      .filter(([, entry]) => entry.schema.pluginOptions?.['content-manager'] === undefined
        ? false
        : (entry.schema.pluginOptions['content-manager'] as { visible?: boolean }).visible === true)
      .map(([key]) => key)
    expect(visible).toEqual(['line-member'])
    expect(contentTypes['line-member'].schema.pluginOptions?.['content-type-builder']).toEqual({ visible: false })
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

  it('เมนูมี audience แบบ enum required ที่ default เป็น all — เมนูเก่าที่ไม่เคยตั้งค่าต้องยังทำงานแบบเดิม', () => {
    const attribute = contentTypes['rich-menu'].schema.attributes['audience']
    expect(attribute?.type).toBe('enumeration')
    expect(attribute?.enum).toEqual(['all', 'members'])
    expect(attribute?.default).toBe('all')
    expect(attribute?.required).toBe(true)
  })

  it('channel มี memberRichMenuId เป็น string ธรรมดา ไม่ใช่ relation', () => {
    expect(contentTypes['line-channel'].schema.attributes['memberRichMenuId']?.type).toBe('string')
  })

  it('schedule รับ op link-members และมีคอลัมน์ cursor', () => {
    const attributes = contentTypes['rich-menu-schedule'].schema.attributes
    expect(attributes['op']?.enum).toContain('link-members')
    expect(attributes['cursor']?.type).toBe('string')
  })

  // ค่าที่ไม่อยู่ใน enum ถูก Strapi ปฏิเสธตอนเขียน — deactivate ตั้งงานนี้แล้วเรียก tick ต่อทันที
  // ในคำขอเดียวกัน ถ้าค่านี้หายไปคือปุ่มปิดที่ล้มทุกครั้งบน Strapi จริง ทั้งที่เทสต์ที่ใช้ของปลอมเขียว
  it('schedule รับ op unlink-members ด้วย — ไม่งั้น deactivate ตั้งงานไม่ได้เลย', () => {
    expect(contentTypes['rich-menu-schedule'].schema.attributes['op']?.enum).toContain('unlink-members')
  })

  // audit เขียนจาก lifecycles (ผูก/ปลดรายคน) และจาก scheduler (งาน unlink ทั้งชุด) — enum ที่ขาด
  // สองค่านี้ทำให้แถวถูกปฏิเสธ แล้ว persistQuietly ของ audit writer กลืน error ไว้เงียบ ๆ
  // ประวัติจึงหายไปโดยไม่มีใครรู้ ทั้งที่โค้ดเรียกเขียนอยู่จริงทุกครั้ง
  it('audit รับ action ของงานสมาชิกครบทั้ง link-members และ unlink-members', () => {
    const actions = contentTypes['rich-menu-audit'].schema.attributes['action']?.enum
    expect(actions).toContain('link-members')
    expect(actions).toContain('unlink-members')
  })

  // Task 12 — unlink-all คือ action ใหม่ของ unlinkAllFromMenu (core/menu-ops.ts) ค่าที่ไม่อยู่ใน
  // enum นี้ถูก Strapi ปฏิเสธตอนเขียนเงียบ ๆ เหมือนสองค่าข้างบน (ดูคอมเมนต์ที่เทสต์ก่อนหน้า)
  it('audit รับ action unlink-all ของปุ่มปลดทุกคนออกจากเมนู (Task 12)', () => {
    const actions = contentTypes['rich-menu-audit'].schema.attributes['action']?.enum
    expect(actions).toContain('unlink-all')
  })

  it('line-member: channel เป็น relation required, lineUserId required, ที่เหลือ optional', () => {
    const attributes = contentTypes['line-member'].schema.attributes
    expect(attributes['channel']).toMatchObject({
      type: 'relation', relation: 'manyToOne', target: UID.channel, required: true,
    })
    expect(attributes['lineUserId']).toMatchObject({ type: 'string', required: true })
    for (const field of ['displayName', 'linkedRichMenuId', 'linkedAt']) {
      expect(attributes[field]?.required, field).not.toBe(true)
    }
    expect(attributes['linkedAt']?.type).toBe('datetime')
  })
})
