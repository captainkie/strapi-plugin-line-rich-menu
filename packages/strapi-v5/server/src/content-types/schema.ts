/**
 * type ขั้นต่ำของ content type schema ที่ Strapi 5 ต้องการ — ไม่ใช่ type เต็มของ Strapi เอง
 * ด้วยเหตุผลเดียวกับ StrapiV5 ใน ../strapi.ts: การประกาศ shape เองทำให้ไฟล์นี้ไม่ผูกกับ
 * type ของ CMS ที่กว้างมากและเปลี่ยนทุก minor
 *
 * `attributes` เป็น `Record<string, AttributeSchema>` (ไม่ใช่ literal type ที่ infer มาจาก
 * object ของแต่ละไฟล์) เพราะ tests/content-types.test.ts ต้อง index ด้วย string ที่ไม่รู้ล่วงหน้า
 */
export type AttributeType =
  | 'string'
  | 'text'
  | 'boolean'
  | 'integer'
  | 'datetime'
  | 'json'
  | 'enumeration'
  | 'media'
  | 'relation'

export interface AttributeSchema {
  type: AttributeType
  required?: boolean
  unique?: boolean
  private?: boolean
  default?: unknown
  maxLength?: number
  enum?: readonly string[]
  relation?: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany'
  target?: string
  multiple?: boolean
  allowedTypes?: readonly string[]
}

export interface ContentTypeSchema {
  kind: 'collectionType'
  collectionName: string
  info: { singularName: string; pluralName: string; displayName: string }
  options?: { draftAndPublish?: boolean }
  pluginOptions?: Record<string, unknown>
  attributes: Record<string, AttributeSchema>
}
