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
        // ต้องครบทุกค่าของ AuditAction ใน core — enum ที่ขาดค่าไหนไป Strapi ปฏิเสธแถวนั้นตอนเขียน
        // แล้ว persistQuietly ของ audit writer ก็กลืน error ให้เหลือแค่บรรทัด log ประวัติของงาน
        // สมาชิกจึงหายไปเงียบ ๆ ทั้งที่โค้ดเรียกเขียนอยู่จริง (lifecycles + scheduler) — Task 8 เพิ่ม
        // 'link-members' เข้า schedule op แต่ลืมเติมทั้งคู่ตรงนี้ ทำให้ audit ของงานสมาชิกทุกแถว
        // ถูกทิ้งเงียบมาตั้งแต่นั้น
        enum: [
          'publish', 'set-default', 'clear-default', 'swap-alias', 'delete', 'channel-update',
          'link-members', 'unlink-members', 'unlink-all',
        ],
        required: true,
      },
      // string ไม่ใช่ integer — Task 10 เจอว่าคอลัมน์นี้เดิมเป็น integer มาตั้งแต่ก่อนมีงานระดับ
      // สมาชิก ตอนนั้น richMenuId มีความหมายเดียวคือ id แถวเมนูของเราเอง (ตัวเลขเสมอ) แต่
      // link-members/unlink-members เก็บ id ฝั่ง LINE ซึ่งเป็นสตริง (ดูคอมเมนต์เต็มที่
      // AuditRow.richMenuId ใน core/server/types.ts) คอลัมน์ integer เดิมบังคับ `Number('line-rm-1')`
      // ที่ repo.ts ซึ่งได้ `NaN` แล้วโดน Strapi ปฏิเสธแถวเงียบ ๆ ผ่าน persistQuietly เหมือน enum
      // ที่ขาดหาย — เป็นอีกสาเหตุหนึ่งที่ audit ของงานสมาชิกไม่เคยถูกบันทึกเลย ไม่ใช่แค่ enum เดียว
      richMenuId: { type: 'string' as const },
      channelId: { type: 'integer' as const, required: true },
      before: { type: 'json' as const },
      after: { type: 'json' as const },
      result: { type: 'enumeration' as const, enum: ['success', 'failure'], required: true },
      errorCode: { type: 'string' as const },
    },
  },
}
