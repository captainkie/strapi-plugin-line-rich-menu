import type { ContentTypeSchema } from './schema.js'

export const lineMember: { schema: ContentTypeSchema } = {
  schema: {
    kind: 'collectionType' as const,
    collectionName: 'line_members',
    info: { singularName: 'line-member', pluralName: 'line-members', displayName: 'LINE member' },
    options: { draftAndPublish: false },
    // ตัวเดียวในปลั๊กอินที่ **เปิด** ให้เห็นใน Content Manager — การจัดการรายชื่อด้วยมือคือทั้งหมด
    // ของเรื่องนี้ (สเปก §Non-goals: ไม่มี webhook ไม่มี CSV ไม่มี REST ของตัวเอง)
    pluginOptions: { 'content-manager': { visible: true }, 'content-type-builder': { visible: false } },
    attributes: {
      // required เพราะ LINE user ID ผูกกับ OA แต่ละตัว — คนเดียวกันมีคนละ id ต่าง channel
      channel: {
        type: 'relation' as const, relation: 'manyToOne' as const,
        target: 'plugin::line-rich-menu.line-channel', required: true,
      },
      lineUserId: { type: 'string' as const, required: true },
      displayName: { type: 'string' as const },
      linkedRichMenuId: { type: 'string' as const },
      linkedAt: { type: 'datetime' as const },
    },
  },
}
