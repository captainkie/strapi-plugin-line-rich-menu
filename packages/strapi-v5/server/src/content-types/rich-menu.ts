import type { ContentTypeSchema } from './schema.js'

export const richMenu: { schema: ContentTypeSchema } = {
  schema: {
    kind: 'collectionType' as const,
    collectionName: 'rich_menus',
    info: { singularName: 'rich-menu', pluralName: 'rich-menus', displayName: 'Rich menu' },
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      name: { type: 'string' as const, required: true, maxLength: 300 },
      channel: {
        type: 'relation' as const,
        relation: 'manyToOne' as const,
        target: 'plugin::line-rich-menu.line-channel',
        required: true,
      },
      size: { type: 'enumeration' as const, enum: ['large', 'compact'], default: 'large', required: true },
      chatBarText: { type: 'string' as const, required: true, maxLength: 14 },
      chatBarMode: { type: 'enumeration' as const, enum: ['default', 'custom'], default: 'default', required: true },
      selected: { type: 'boolean' as const, default: true },
      templateKey: { type: 'string' as const },
      areas: { type: 'json' as const },
      image: { type: 'media' as const, multiple: false, allowedTypes: ['images'] },
      areaImages: { type: 'json' as const },
      // ผลของ normalize ที่ทำไว้ตอน save — publish อ่านอย่างเดียว ไม่เรียก sharp (design notes ข้อ 3)
      normalizedImage: { type: 'media' as const, multiple: false, allowedTypes: ['images'] },
      normalizedMime: { type: 'string' as const },
      normalizedWidth: { type: 'integer' as const },
      normalizedHeight: { type: 'integer' as const },
      // ไม่ประกาศ unique — ข้อบังคับจริงคือ "ไม่ซ้ำภายใน channel เดียวกัน" ซึ่ง Strapi 4
      // ประกาศเป็น composite unique ไม่ได้ ตัวบังคับอยู่ที่ validation ของ route แทน
      aliasId: { type: 'string' as const },
      status: {
        type: 'enumeration' as const,
        enum: ['draft', 'publishing', 'published', 'failed'],
        default: 'draft',
        required: true,
      },
      lineRichMenuId: { type: 'string' as const },
      // ชื่อนี้ ไม่ใช่ `publishedAt` — Strapi จอง `publishedAt` ไว้ให้ draft & publish ของตัวเอง
      // ประกาศทับแล้ว content type จะโหลดไม่ขึ้นทั้งตัว repo แปลงชื่อกลับให้ชั้น service
      linePublishedAt: { type: 'datetime' as const },
      lastError: { type: 'text' as const },
    },
  },
}
