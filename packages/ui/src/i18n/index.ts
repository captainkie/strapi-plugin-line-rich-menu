/**
 * spec §12: `packages/ui/src/translations/{en,th}.json` เป็น source of truth ที่ build step
 * ของแต่ละ adapter copy ไปตรง ๆ (Strapi's registerTrads กิน plain message object ได้เลย) — ไฟล์
 * ในโฟลเดอร์นี้ (`src/i18n/`) เป็นแค่ API ที่ตัวแอปกับเทสต์ใช้อ่านข้อมูลนั้น ไม่ใช่ source of truth เอง
 *
 * import ตรง ๆ แบบนี้ใช้ได้เพราะเปิด `resolveJsonModule` ไว้ใน tsconfig.base.json แล้ว — ไม่ต้องใช้
 * import attribute (`with { type: 'json' }`) ซึ่งยังไม่นิ่งในสายตา `moduleResolution: Bundler`
 */
import en from '../translations/en.json'
import th from '../translations/th.json'

export const MESSAGES: Record<'en' | 'th', Record<string, string>> = { en, th }
export const TRANSLATION_KEYS: readonly string[] = Object.keys(en).sort()
