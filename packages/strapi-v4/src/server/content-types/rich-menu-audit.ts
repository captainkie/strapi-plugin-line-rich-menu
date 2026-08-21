import type { ContentTypeSchema } from './schema.js'

export const richMenuAudit: { schema: ContentTypeSchema } = {
  schema: {
    kind: 'collectionType' as const,
    collectionName: 'rich_menu_audits',
    info: { singularName: 'rich-menu-audit', pluralName: 'rich-menu-audits', displayName: 'Rich menu audit' },
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      // เก็บเป็นตัวเลข ไม่ใช่ relation โดยตั้งใจ (ต่างจากสเปก §11.5) — audit เป็น append-only
      // และต้องอยู่รอดหลังเมนู channel หรือ admin user ที่มันอ้างถึงถูกลบ ซึ่งเป็นจังหวะที่
      // ประวัติมีค่าที่สุด relation ที่ลบตามกันจะทำลายหลักฐานเงียบ ๆ
      actorId: { type: 'integer' as const },
      action: {
        type: 'enumeration' as const,
        enum: ['publish', 'set-default', 'clear-default', 'swap-alias', 'delete', 'channel-update'],
        required: true,
      },
      richMenuId: { type: 'integer' as const },
      channelId: { type: 'integer' as const, required: true },
      before: { type: 'json' as const },
      after: { type: 'json' as const },
      result: { type: 'enumeration' as const, enum: ['success', 'failure'], required: true },
      errorCode: { type: 'string' as const },
    },
  },
}
