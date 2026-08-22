import type { ContentTypeSchema } from './schema.js'

export const richMenuSchedule: { schema: ContentTypeSchema } = {
  schema: {
    kind: 'collectionType' as const,
    // ต้องตรงกับ DEFAULT_SCHEDULE_TABLE ใน core/server/lock.ts เพราะ lock query
    // ยิงผ่าน knex ตรง ๆ ไม่ผ่าน entityService จึงไม่มีใครแปลงชื่อให้
    collectionName: 'rich_menu_schedules',
    info: { singularName: 'rich-menu-schedule', pluralName: 'rich-menu-schedules', displayName: 'Rich menu schedule' },
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      richMenu: {
        type: 'relation' as const,
        relation: 'manyToOne' as const,
        target: 'plugin::line-rich-menu.rich-menu',
        required: true,
      },
      runAt: { type: 'datetime' as const, required: true },
      op: {
        type: 'enumeration' as const,
        enum: ['set-default', 'clear-default', 'swap-alias', 'link-members', 'unlink-members'],
        required: true,
      },
      state: {
        type: 'enumeration' as const,
        enum: ['pending', 'running', 'done', 'failed'],
        default: 'pending',
        required: true,
      },
      lockedBy: { type: 'string' as const },
      lockedAt: { type: 'datetime' as const },
      lastError: { type: 'text' as const },
      // id ของสมาชิกคนสุดท้ายที่ทำไปแล้วของงาน link-members — keyset ไม่ใช่ offset (ดู
      // ListParams.idGreaterThan ใน core/server/types.ts) งานชนิดอื่นไม่แตะฟิลด์นี้เลย รวมถึง
      // unlink-members ที่จงใจไม่มี cursor เพราะชุดงานหดเอง (ดู unlinkMemberChunk ใน core)
      cursor: { type: 'string' as const },
    },
  },
}
