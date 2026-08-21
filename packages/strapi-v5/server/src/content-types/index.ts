import { lineChannel } from './line-channel.js'
import { richMenu } from './rich-menu.js'
import { richMenuAudit } from './rich-menu-audit.js'
import { richMenuSchedule } from './rich-menu-schedule.js'

/** uid ที่ชั้นอื่นอ้างถึง — ประกาศที่เดียวเพื่อไม่ให้มีใครพิมพ์สตริงยาว ๆ นี้ผิด */
export const UID = {
  channel: 'plugin::line-rich-menu.line-channel',
  menu: 'plugin::line-rich-menu.rich-menu',
  schedule: 'plugin::line-rich-menu.rich-menu-schedule',
  audit: 'plugin::line-rich-menu.rich-menu-audit',
} as const

export const contentTypes = {
  'line-channel': lineChannel,
  'rich-menu': richMenu,
  'rich-menu-schedule': richMenuSchedule,
  'rich-menu-audit': richMenuAudit,
}
