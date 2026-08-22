import type { ContentTypeSchema } from './schema.js'

export const lineChannel: { schema: ContentTypeSchema } = {
  schema: {
    kind: 'collectionType' as const,
    collectionName: 'line_channels',
    info: { singularName: 'line-channel', pluralName: 'line-channels', displayName: 'LINE channel' },
    // ปิด draft & publish ทุกตัวในปลั๊กอินนี้ — "สถานะ" ของเมนูหมายถึงสถานะบน LINE
    // การมีสองแนวคิดเรื่อง published ในตารางเดียวกันคือความสับสนที่ไม่ได้อะไรกลับมา
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      name: { type: 'string' as const, required: true },
      channelId: { type: 'string' as const, required: true, unique: true },
      // `private: true` ตัดฟิลด์ออกจาก serializer ของ Strapi เอง — เป็นชั้นที่สองถัดจาก
      // การที่ route ของเราคืน DTO ที่ไม่มีฟิลด์นี้อยู่แล้ว (สเปก §11.2 "ป้องกันหลายชั้น")
      channelAccessToken: { type: 'text' as const, required: true, private: true },
      channelSecret: { type: 'text' as const, private: true },
      accessTokenLast4: { type: 'string' as const, private: true },
      isDefault: { type: 'boolean' as const, default: false },
    },
  },
}
