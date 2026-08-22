/**
 * โครงของ v5 แยก `admin/` กับ `server/` เป็นสอง build ที่ tsconfig คนละตัว การ import ข้าม
 * โฟลเดอร์แบบที่ v4 ทำ (`../server/permissions.js`) จะลาก server เข้าบันเดิลของเบราว์เซอร์
 * ค่าคงที่ตัวเดียวจึงถูกประกาศทั้งสองฝั่ง และมีเทสต์บังคับว่าตรงกัน (tests/admin/register.test.ts
 * ตรวจ `to` ของเมนูซ้าย ส่วน tests/package-shape.test.ts ตรวจ `strapi.name` ใน package.json)
 */
export const PLUGIN_ID = 'line-rich-menu'

export const PERMISSION = {
  read: `plugin::${PLUGIN_ID}.read`,
  write: `plugin::${PLUGIN_ID}.write`,
  publish: `plugin::${PLUGIN_ID}.publish`,
  settings: `plugin::${PLUGIN_ID}.settings`,
} as const
