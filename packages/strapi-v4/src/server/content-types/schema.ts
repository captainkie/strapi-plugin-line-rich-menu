/**
 * type ขั้นต่ำของ content type schema ที่ Strapi 4 ต้องการ — ไม่ใช่ type เต็มของ Strapi เอง
 * ด้วยเหตุผลเดียวกับ StrapiV4 ใน ../strapi.ts: type จริงของ v4 กว้างและหลาย ๆ จุดเป็น any
 * อยู่แล้ว ประกาศ shape เองแบบนี้ยังคอมไพล์ผ่านได้ทั้งตอนย้ายไป Strapi 5
 *
 * `attributes` เป็น `Record<string, AttributeSchema>` (ไม่ใช่ literal object type ที่มาจาก
 * inference ของแต่ละไฟล์ content type) เพราะ tests/content-types.test.ts ต้อง index ด้วย
 * string ที่ไม่รู้ล่วงหน้า (เช่นวน `Object.keys(attributes)` หรือเช็คว่า `attributes['publishedAt']`
 * เป็น `undefined`) — ถ้าปล่อยให้แต่ละไฟล์ content type infer literal type ของตัวเองจาก object
 * literal ตรง ๆ ดัชนีด้วย string ทั่วไปจะชนกับ TS7053 เพราะไม่มี index signature
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
