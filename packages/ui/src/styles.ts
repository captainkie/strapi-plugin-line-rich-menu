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

const CSS = `
.frm-area:focus-visible {
  outline: 3px solid #4945ff;
  outline-offset: -3px;
  z-index: 2;
}
.frm-area:hover { background: rgba(73, 69, 255, 0.08); }
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

export const OUTLINE_COLOR = '#4945ff'
export const ACTIVE_FILL = 'rgba(73, 69, 255, 0.18)'
export const INVALID_COLOR = '#d02b20'
