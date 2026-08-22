/**
 * แพ็กเกจนี้ไม่มีไฟล์ .css เลยโดยตั้งใจ
 *
 * การ ship CSS จาก library บังคับให้ bundler ของผู้ใช้ต้องประมวลผล CSS ที่มาจาก
 * node_modules ซึ่ง webpack 5 (Strapi 4) กับ Vite (Strapi 5) ตั้งค่าไม่เหมือนกัน
 * และเป็นแหล่งพังที่เลี่ยงได้ฟรี style ปกติจึงเป็น inline ทั้งหมด
 *
 * เหลืออย่างเดียวที่ inline style ทำไม่ได้คือ pseudo-selector — โดยเฉพาะ :focus-visible
 * ซึ่งจำเป็นจริงเพราะสเปก §5.6 บังคับให้ใช้คีย์บอร์ดได้ จึงฉีด <style> ก้อนเดียวเข้า head
 * ครั้งเดียวตลอดอายุหน้า
 */
const STYLE_ID = 'fosivo-line-rich-menu-styles'

/**
 * เขียว LINE เอง ('#06C755') — สีของ LINE ไม่ใช่ token ของ Strapi design system จึงเป็นค่าคงที่
 * ตรงนี้ ไม่ใช่สมาชิกของ `ui.Typography`/`ThemeColors` (สเปกงานนี้ #1) ใช้ได้เฉพาะบนพื้นผิวที่
 * "แทน LINE" จริง ๆ — บับเบิลแชทขาออกและกรอบเมนูใน `Preview` (ที่ทั้งไฟล์นั้นเป็นข้อยกเว้นของ
 * port อยู่แล้ว ดูคอมเมนต์หัว Preview.tsx), พื้นที่แก้ผังใน `CanvasEditor` ที่ฝังอยู่ในกรอบโทรศัพท์
 * เท่านั้นเสมอ (จึงนับเป็นส่วนหนึ่งของ "จอ LINE" ไม่ใช่ chrome ของเรา) และแบบที่ถูกเลือกไว้ใน
 * `TemplatePicker` (LINE OA Manager เองไฮไลต์แบบที่เลือกด้วยเขียว) — ห้ามใช้กับปุ่ม Save/Cancel
 * ของ Strapi เอง: นั่นคือ chrome ของแอดมิน ปุ่มเขียวโผล่กลางแอดมินสีน้ำเงินอมม่วงจะอ่านเป็นบั๊ก
 * ไม่ใช่แบรนด์ (ดูคอมเมนต์เต็มในสเปกงานนี้ §1)
 */
export const LINE_GREEN = '#06C755'
export const LINE_ACTIVE_FILL = 'rgba(6, 199, 85, 0.18)'
export const LINE_SELECTED_TINT = 'rgba(6, 199, 85, 0.08)'

const CSS = `
.frm-area:focus-visible {
  outline: 3px solid ${LINE_GREEN};
  outline-offset: -3px;
  z-index: 2;
}
.frm-area:hover { background: ${LINE_ACTIVE_FILL}; }
.frm-handle { opacity: 0; }
.frm-area:hover .frm-handle,
.frm-area:focus-visible .frm-handle { opacity: 1; }
`

export function injectStylesOnce(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

/**
 * สีของ Strapi เอง (indigo/blurple) — เหลือไว้เป็น export สาธารณะตามสัญญาเดิม (ดู
 * tests/public-api.test.ts) แต่ไม่มีจุดไหนใน component ของแพ็กเกจนี้ใช้ตัวนี้อีกแล้วหลัง
 * สเปกงานนี้ #1 (ทุกจุดที่เคยใช้อยู่ในกรอบโทรศัพท์/TemplatePicker เปลี่ยนไปใช้ LINE_GREEN แทน
 * เพราะพื้นผิวเหล่านั้นแทน LINE ไม่ใช่ chrome ของ Strapi — ดูคอมเมนต์ที่ LINE_GREEN ด้านบน)
 */
export const OUTLINE_COLOR = '#4945ff'
export const ACTIVE_FILL = 'rgba(73, 69, 255, 0.18)'
export const INVALID_COLOR = '#d02b20'
