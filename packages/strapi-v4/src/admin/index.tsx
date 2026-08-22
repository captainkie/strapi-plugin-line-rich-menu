import { LineMark } from '@fosivo/line-rich-menu-ui'
import { PERMISSION, PLUGIN_ID } from '../server/permissions.js'
import { trads } from './translations.js'

interface AdminApp {
  addMenuLink(link: Record<string, unknown>): void
  registerPlugin(plugin: Record<string, unknown>): void
}

export default {
  register(app: AdminApp): void {
    app.addMenuLink({
      to: `/plugins/${PLUGIN_ID}`,
      // โลโก้จริงของ LINE (Task 22 item 1) แทนไอคอนกลาง ๆ ของ Strapi (`Message`) — บอกทันทีว่า
      // ปลั๊กอินนี้เกี่ยวกับ LINE (ดูคอมเมนต์เต็มที่ LineMark.tsx และ THIRD_PARTY_NOTICES.md ที่ root
      // ที่มา/สิทธิ์ของเครื่องหมายการค้านี้)
      icon: LineMark,
      intlLabel: { id: `${PLUGIN_ID}.plugin.name`, defaultMessage: 'LINE Rich Menu' },
      // เมนูฝั่งซ้ายซ่อนตัวเองจากคนที่ไม่มีสิทธิ์ `read` — ชั้นแรกของ deny by default
      // ชั้นที่บังคับจริงยังเป็น policy ที่ route (Task 16/17) ไม่ใช่ตรงนี้
      permissions: [{ action: PERMISSION.read, subject: null }],
      Component: async () => import('./App.js'),
    })

    app.registerPlugin({ id: PLUGIN_ID, initializer: undefined, isReady: true, name: PLUGIN_ID })
  },

  registerTrads({ locales }: { locales: string[] }): Promise<{ data: Record<string, string>; locale: string }[]> {
    return Promise.resolve(trads(locales))
  },
}
