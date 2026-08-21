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

    { method: 'GET', path: '/menus', handler: 'menus.find', config: withPermission(PERMISSION.read) },
    { method: 'GET', path: '/menus/:id', handler: 'menus.findOne', config: withPermission(PERMISSION.read) },
    { method: 'POST', path: '/menus', handler: 'menus.create', config: withPermission(PERMISSION.write) },
    { method: 'PUT', path: '/menus/:id', handler: 'menus.update', config: withPermission(PERMISSION.write) },
    { method: 'DELETE', path: '/menus/:id', handler: 'menus.delete', config: withPermission(PERMISSION.write) },

    { method: 'POST', path: '/menus/:id/publish', handler: 'menus.publish', config: withPermission(PERMISSION.publish) },
    { method: 'POST', path: '/menus/:id/default', handler: 'menus.setDefault', config: withPermission(PERMISSION.publish) },
    { method: 'DELETE', path: '/menus/:id/default', handler: 'menus.clearDefault', config: withPermission(PERMISSION.publish) },

    { method: 'POST', path: '/schedules/tick', handler: 'schedules.tick', config: withPermission(PERMISSION.publish) },
  ],
}
