/**
 * สี่สิทธิ์ตามตารางในสเปก §11.4 — แถว "create / update" ของตารางนั้นคือสิทธิ์เดียว
 * ตั้งชื่อว่า `write` ส่วนรายการห้าชื่อใน §1.3 ถือว่าถูกแทนที่ด้วยตารางนี้
 *
 * `settings` แยกจาก `publish` เป็นสาระสำคัญของดีไซน์ ไม่ใช่รายละเอียด — มอบสิทธิ์สร้าง
 * และปล่อยเมนูให้ใครสักคนได้ โดยที่คนนั้นไม่มีวันเห็น token ของ LINE OA
 */
export const PLUGIN_ID = 'line-rich-menu'

export const PERMISSION = {
  read: `plugin::${PLUGIN_ID}.read`,
  write: `plugin::${PLUGIN_ID}.write`,
  publish: `plugin::${PLUGIN_ID}.publish`,
  settings: `plugin::${PLUGIN_ID}.settings`,
} as const

export const permissionActions = [
  { section: 'plugins', displayName: 'Read rich menus', uid: 'read', pluginName: PLUGIN_ID },
  { section: 'plugins', displayName: 'Create and edit drafts', uid: 'write', pluginName: PLUGIN_ID },
  { section: 'plugins', displayName: 'Publish to LINE', uid: 'publish', pluginName: PLUGIN_ID },
  { section: 'plugins', displayName: 'Manage channels and tokens', uid: 'settings', pluginName: PLUGIN_ID },
] as const
