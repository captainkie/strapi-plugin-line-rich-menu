import { LineMark } from '@fosivo/line-rich-menu-ui'
import { PERMISSION, PLUGIN_ID } from './plugin-id.js'
import { trads } from './translations.js'

interface AdminApp {
  addMenuLink(link: Record<string, unknown>): void
  registerPlugin(plugin: Record<string, unknown>): void
}

export default {
  register(app: AdminApp): void {
    app.addMenuLink({
      to: `/plugins/${PLUGIN_ID}`,
      // เครื่องหมาย LINE ที่วาดเอง (สเปกงานนี้ #2) แทนไอคอนกลาง ๆ ของ Strapi (`Message`) — บอกทันที
      // ว่าปลั๊กอินนี้เกี่ยวกับ LINE โดยไม่ใช้โลโก้จริงของ LINE (ดูคอมเมนต์เต็มที่ LineMark.tsx)
      icon: LineMark,
      intlLabel: { id: `${PLUGIN_ID}.plugin.name`, defaultMessage: 'LINE Rich Menu' },
      // เมนูฝั่งซ้ายซ่อนตัวเองจากคนที่ไม่มีสิทธิ์ `read` — ชั้นแรกของ deny by default
      // ชั้นที่บังคับจริงยังเป็น policy ที่ route (Task 5) ไม่ใช่ตรงนี้
      permissions: [{ action: PERMISSION.read, subject: null }],
      Component: async () => import('./App.js'),
    })

    app.registerPlugin({ id: PLUGIN_ID, initializer: undefined, isReady: true, name: PLUGIN_ID })
  },

  registerTrads({ locales }: { locales: string[] }): Promise<{ data: Record<string, string>; locale: string }[]> {
    return Promise.resolve(trads(locales))
  },
}
