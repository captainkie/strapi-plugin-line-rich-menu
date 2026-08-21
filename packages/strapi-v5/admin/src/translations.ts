import { MESSAGES } from '@fosivo/line-rich-menu-ui'
import { PLUGIN_ID } from './plugin-id.js'

/**
 * เขียนเองแทน `prefixPluginTranslations` ของ `@strapi/helper-plugin` — สามบรรทัดเท่ากัน
 * แต่ helper-plugin ทั้งแพ็กเกจไม่มีใน Strapi 5 ไฟล์นี้จึงย้ายไปใช้กับ v5 ได้โดยไม่ต้องแก้
 */
export function prefixTranslations(table: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(table).map(([key, value]) => [`${PLUGIN_ID}.${key}`, value]),
  )
}

/**
 * source of truth ของข้อความอยู่ที่ `packages/ui/src/translations/{en,th}.json` (สเปก §12) —
 * ที่นี่ import ค่าคงที่นั้นผ่าน `MESSAGES` ตรง ๆ แทนที่จะให้ build step คัดลอกไฟล์ไปมา
 * ผลเหมือนกันแต่ไม่มีทางลืม sync เพราะไม่มีขั้นตอนให้ลืมรัน
 *
 * ภาษาที่ไม่มีคำแปลถูกข้าม ไม่ใช่คืนตารางว่าง — ตารางว่างจะทับคำแปลของ Strapi เองบางส่วน
 */
export function trads(
  locales: readonly string[],
): { data: Record<string, string>; locale: string }[] {
  return locales
    .filter((locale): locale is 'en' | 'th' => locale === 'en' || locale === 'th')
    .map((locale) => ({ data: prefixTranslations(MESSAGES[locale]), locale }))
}
