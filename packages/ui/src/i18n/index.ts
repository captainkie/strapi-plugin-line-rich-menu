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

/**
 * ประตูกันคีย์ validation.* ที่ไม่มีคำแปลหลุดขึ้นจอผู้ใช้ดิบ ๆ
 *
 * `packages/core/src/schema.ts` คำนวณ `issue.code` เป็น `params?.code ?? issue.code` — code ของ
 * เราเองเมื่อเราตั้งไว้ (ครบใน `VALIDATION_CODES` ของ core และมีคำแปลเสมอ) ไม่งั้นก็เป็น code ภายใน
 * ของ zod เอง ซึ่งเป็นเซ็ตที่เปิด ไม่ปิด — refinement ใหม่ในอนาคตหรือ zod อัปเกรดที่เปลี่ยนชื่อ
 * internal code อาจ emit ค่าที่แคตตาล็อกนี้ไม่เคยเห็นมาก่อน `RichMenuEditor.tsx` เรียกฟังก์ชันนี้
 * แทนต่อสตริง `validation.${code}` ตรง ๆ เพื่อให้กรณีนั้นคืนข้อความทั่วไปที่ผู้ใช้อ่านแล้วทำอะไรได้
 * แทนที่จะเห็น literal คีย์ที่ไม่มีใครแปล (เช่น `validation.invalid_type`) ค้างอยู่ในฟอร์ม
 */
export function validationKey(code: string): string {
  const key = `validation.${code}`
  return MESSAGES.en[key] === undefined ? 'validation.unknown' : key
}
