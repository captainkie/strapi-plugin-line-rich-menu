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
      // Task 20 item 10 (strapi-v5 L2) — ไม่มี `/` นำหน้าอีกต่อไป Strapi 5.52's router
      // (`core/apis/router.js`) เช็คว่า `to` เป็น absolute path แล้ว log คำเตือน deprecated
      // ("this has been corrected for you but will be removed in a future version") พร้อมแก้ให้
      // เป็น relative เองเงียบ ๆ ทุกครั้งที่บูต — ผลลัพธ์ตอน runtime เหมือนเดิมทุกประการ (Strapi
      // mutate ค่าให้อยู่ดี) แค่ไม่ต้องพึ่งพฤติกรรม "แก้ให้เอง" ที่ประกาศไว้ว่าจะถูกถอดออกในอนาคต
      to: `plugins/${PLUGIN_ID}`,
      // เครื่องหมาย LINE ที่วาดเอง (สเปกงานนี้ #2) แทนไอคอนกลาง ๆ ของ Strapi (`Message`) — บอกทันที
      // ว่าปลั๊กอินนี้เกี่ยวกับ LINE โดยไม่ใช้โลโก้จริงของ LINE (ดูคอมเมนต์เต็มที่ LineMark.tsx)
      icon: LineMark,
      intlLabel: { id: `${PLUGIN_ID}.plugin.name`, defaultMessage: 'LINE Rich Menu' },
      // เมนูฝั่งซ้ายซ่อนตัวเองจากคนที่ไม่มีสิทธิ์ `read` — ชั้นแรกของ deny by default
      // ชั้นที่บังคับจริงยังเป็น policy ที่ route (Task 5) ไม่ใช่ตรงนี้
      permissions: [{ action: PERMISSION.read, subject: null }],
      // Task 20 item 10 (strapi-v5 L1) — ไม่ใช่ `async () => import(...)` (async wrapper) อีกต่อไป
      // Strapi 5.52's router (`core/apis/router.js`) เช็ค `link.Component[Symbol.toStringTag] ===
      // 'AsyncFunction'` แล้ว log คำเตือน deprecated ทุกครั้งที่บูต — arrow function ปกติที่ *คืน*
      // Promise (ไม่ใช่ตัวมันเองเป็น async) ให้ค่าที่ resolve เหมือนกันทุกประการ (`import()` คืน
      // Promise เองอยู่แล้ว ไม่ต้อง await) แต่ `Symbol.toStringTag` เป็นของ Function ปกติ ไม่ตรงเงื่อนไข
      Component: () => import('./App.js'),
    })

    app.registerPlugin({ id: PLUGIN_ID, initializer: undefined, isReady: true, name: PLUGIN_ID })
  },

  registerTrads({ locales }: { locales: string[] }): Promise<{ data: Record<string, string>; locale: string }[]> {
    return Promise.resolve(trads(locales))
  },
}
