import type { ContentTypeSchema } from './schema.js'

export const richMenuAudit: { schema: ContentTypeSchema } = {
  schema: {
    kind: 'collectionType' as const,
    collectionName: 'rich_menu_audits',
    info: { singularName: 'rich-menu-audit', pluralName: 'rich-menu-audits', displayName: 'Rich menu audit' },
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      // เก็บค่าดิบ ไม่ใช่ relation โดยตั้งใจ (ต่างจากสเปก §11.5) — audit เป็น append-only และ
      // ต้องอยู่รอดหลังเมนู channel หรือ admin user ที่มันอ้างถึงถูกลบ ซึ่งเป็นจังหวะที่ประวัติ
      // มีค่าที่สุด relation ที่ลบตามกันจะทำลายหลักฐานเงียบ ๆ
      //
      // `actorId` เป็น integer เพราะ admin user ของ Strapi 5 ยังใช้ id เป็นตัวเลข
      // ส่วนอีกสองตัวเป็น string เพราะมันคือ `documentId` — ต่างจาก v4 ที่เป็น integer ทั้งสามตัว
      actorId: { type: 'integer' as const },
      action: {
        type: 'enumeration' as const,
        enum: ['publish', 'set-default', 'clear-default', 'swap-alias', 'delete', 'channel-update'],
        required: true,
      },
      richMenuId: { type: 'string' as const },
      channelId: { type: 'string' as const, required: true },
      before: { type: 'json' as const },
      after: { type: 'json' as const },
      result: { type: 'enumeration' as const, enum: ['success', 'failure'], required: true },
      errorCode: { type: 'string' as const },
    },
  },
}
