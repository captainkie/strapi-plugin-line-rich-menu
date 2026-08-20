/**
 * สัญญาระหว่าง ui กับ adapter — adapter ของทั้ง Strapi 4 และ 5 ต้อง implement path เหล่านี้
 * ให้เหมือนกัน ui ไม่รู้ว่าเบื้องหลังเป็น entityService หรือ documents()
 */
export const ENDPOINTS = {
  channels: '/line-rich-menu/channels',
  channel: (id: string) => `/line-rich-menu/channels/${id}`,
  channelTest: (id: string) => `/line-rich-menu/channels/${id}/test`,
  menus: '/line-rich-menu/menus',
  menu: (id: string) => `/line-rich-menu/menus/${id}`,
  menuPublish: (id: string) => `/line-rich-menu/menus/${id}/publish`,
  menuSetDefault: (id: string) => `/line-rich-menu/menus/${id}/default`,
  upload: '/upload',
} as const

export interface ChannelSummary {
  id: string
  name: string
  channelId: string
  /** สี่ตัวท้ายเท่านั้น — token เต็มไม่เคยออกจากฝั่งเซิร์ฟเวอร์ (สเปก §11.2) */
  accessTokenPreview: string
  isDefault: boolean
}

export interface RichMenuSummary {
  id: string
  title: string
  status: 'draft' | 'publishing' | 'published' | 'failed'
  channelId: string
  aliasId: string | null
  updatedAt: string
}

export interface BotInfo {
  userId: string
  basicId: string
  displayName: string
}
