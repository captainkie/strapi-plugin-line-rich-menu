import { PERMISSION } from '../permissions.js'

/**
 * สเปก §11.4 — "ทุก route เป็น `type: 'admin'` + policy `admin::hasPermissions` — deny by default"
 * ไม่มีเส้นไหนได้รับการยกเว้น รวมถึง `/schedules/tick` ที่ตั้งใจให้ยิงจากภายนอก
 * เทสต์ใน Task 17 วนทุกแถวของอาเรย์นี้แล้วบังคับว่าต้องมี policy ครบทุกเส้น
 */
const withPermission = (action: string) => ({
  policies: [{ name: 'admin::hasPermissions', config: { actions: [action] } }],
})

export const admin = {
  type: 'admin' as const,
  routes: [
    { method: 'GET', path: '/channels', handler: 'channels.find', config: withPermission(PERMISSION.read) },
    { method: 'POST', path: '/channels', handler: 'channels.create', config: withPermission(PERMISSION.settings) },
    { method: 'PUT', path: '/channels/:id', handler: 'channels.update', config: withPermission(PERMISSION.settings) },
    { method: 'POST', path: '/channels/:id/test', handler: 'channels.test', config: withPermission(PERMISSION.settings) },
    { method: 'GET', path: '/channels/:id/reconcile', handler: 'menus.reconcile', config: withPermission(PERMISSION.publish) },
    // ลบด้วย lineRichMenuId ฝั่ง LINE ไม่ใช่ id ของฐานข้อมูล — เมนูกำพร้าไม่มีแถวให้ผูก (สเปก §8 ข้อ 3)
    // ใช้สิทธิ์ publish เหมือน reconcile เพราะมันแตะของจริงบน LINE เส้นเดียวกับที่ §11.4 แยก publish จาก write
    { method: 'DELETE', path: '/channels/:id/orphans/:lineRichMenuId', handler: 'channels.deleteOrphan', config: withPermission(PERMISSION.publish) },
    // :id คือ channel — "active" ของทั้งสอง audience ต้องอ่านจาก LINE จริง (default) และจาก
    // channel เอง (memberRichMenuId) ไม่ใช่แค่จาก DB (สเปก member-audience §"Active is never stored")
    { method: 'GET', path: '/channels/:id/audience', handler: 'members.audience', config: withPermission(PERMISSION.publish) },

    { method: 'GET', path: '/menus', handler: 'menus.find', config: withPermission(PERMISSION.read) },
    { method: 'GET', path: '/menus/:id', handler: 'menus.findOne', config: withPermission(PERMISSION.read) },
    { method: 'POST', path: '/menus', handler: 'menus.create', config: withPermission(PERMISSION.write) },
    { method: 'PUT', path: '/menus/:id', handler: 'menus.update', config: withPermission(PERMISSION.write) },
    { method: 'DELETE', path: '/menus/:id', handler: 'menus.delete', config: withPermission(PERMISSION.write) },

    { method: 'POST', path: '/menus/:id/publish', handler: 'menus.publish', config: withPermission(PERMISSION.publish) },
    { method: 'POST', path: '/menus/:id/default', handler: 'menus.setDefault', config: withPermission(PERMISSION.publish) },
    { method: 'DELETE', path: '/menus/:id/default', handler: 'menus.clearDefault', config: withPermission(PERMISSION.publish) },

    // เปิด/ปิด/ซิงก์เมนูสำหรับสมาชิก — ทั้งสามเส้นแตะของจริงบน LINE (ผูก/ถอน user จริง) จึงต้อง
    // เป็น publish เหมือน publish/default ข้างบน ไม่ใช่ write ที่แค่แก้ร่าง
    { method: 'POST', path: '/menus/:id/audience/activate', handler: 'members.activate', config: withPermission(PERMISSION.publish) },
    { method: 'POST', path: '/menus/:id/audience/deactivate', handler: 'members.deactivate', config: withPermission(PERMISSION.publish) },
    { method: 'POST', path: '/menus/:id/audience/sync', handler: 'members.sync', config: withPermission(PERMISSION.publish) },

    // :id คือแถว line-member — ยิง LINE ตรง ๆ หนึ่งครั้งต่อคำขอ (ดูคอมเมนต์ที่ controllers/members.ts)
    { method: 'GET', path: '/members/:id/verify', handler: 'members.verify', config: withPermission(PERMISSION.publish) },

    { method: 'POST', path: '/schedules/tick', handler: 'schedules.tick', config: withPermission(PERMISSION.publish) },
  ],
}
