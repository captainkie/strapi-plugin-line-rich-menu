export interface LineMarkProps {
  /** ขนาดสี่เหลี่ยมจัตุรัส หน่วยพิกเซล — ดีฟอลต์เท่ากับไอคอนเมนูฝั่งซ้ายทั่วไปของ Strapi */
  size?: number
}

/**
 * โลโก้แอป LINE ตัวจริง (64×64, ย่อมาจากต้นฉบับ 1024×1024 ที่เก็บเต็มขนาดไว้ที่
 * docs/assets/logo/line-logo.png สำหรับ README) ฝัง inline เป็น base64 data URI แทนการ import
 * ไฟล์รูปตรง ๆ — เหตุผลเดียวกับที่แพ็กเกจนี้ไม่ ship ไฟล์ .css เลย (ดูคอมเมนต์หัว styles.ts):
 * webpack 5 ของ Strapi 4 กับ Vite ของ Strapi 5 จัดการ asset ที่มาจาก node_modules ไม่เหมือนกัน
 * data URI ตัดปัญหานั้นทิ้งไปทั้งหมด ไม่ต้องพึ่ง loader ของฝั่งไหนเลย
 *
 * เดิมจุดนี้เป็นรูปทรงที่วาดเอง (สี่เหลี่ยมมนสีเขียว + ฟองข้อความ) เพราะแพ็กเกจนี้เคย ship ไปที่ npm
 * สาธารณะภายใต้สัญญาอนุญาตโอเพนซอร์สที่ไม่ได้ให้สิทธิ์แจกจ่ายเครื่องหมายการค้าของคนอื่น — การใส่โลโก้
 * จริงของ LINE เข้าไปตอนนั้นเท่ากับ redistribute เครื่องหมายการค้าของคนอื่นใต้สัญญาอนุญาตที่ไม่มีสิทธิ์ให้
 * ตอนนี้โปรเจกต์เปลี่ยนไปใช้ Apache-2.0 ทั้งหมดแล้ว (ดู
 * THIRD_PARTY_NOTICES.md ที่ root) ซึ่ง §6 ของสัญญาอนุญาตเองระบุตรง ๆ อยู่แล้วว่าไม่ได้ให้สิทธิ์ใน
 * เครื่องหมายการค้าใด ๆ ทั้งสิ้น — ใส่โลโก้จริงเข้ามาโดยไม่ได้อ้างว่าเป็นส่วนหนึ่งของสิทธิ์ที่สัญญา
 * อนุญาตให้จึงไม่ใช่ปัญหาอีกต่อไป (ยังต้องระบุที่มา/เจ้าของเครื่องหมายไว้ใน THIRD_PARTY_NOTICES.md
 * อยู่ดี ไม่ใช่ว่าเปลี่ยนสัญญาอนุญาตแล้วไม่ต้องพูดถึงเลย)
 *
 * ใช้ที่เดียวกับที่เครื่องหมายวาดเองเคยใช้ทั้งสองจุด (ไอคอนเมนูฝั่งซ้าย, empty-state ตอนยังไม่มี
 * rich menu สักอัน) — ยืนยันด้วยตาจริงในเบราว์เซอร์แล้วว่าอ่านออกทั้งสองธีม (light/dark) ของทั้งสอง
 * adapter (v4/v5) ที่ขนาดจริงที่ render (~20px ในเมนู, 40px ใน empty-state) พื้นเขียว LINE ทึบของ
 * ไอคอนเองทำให้ไม่จมไปกับพื้นหลังธีมไหนเลย ต่างจากรูปทรงวาดเองเดิมที่เคยรับสีจาก theme ได้ (data URI
 * แบบนี้รับไม่ได้ — เป็นข้อจำกัดที่รู้ตัวและยอมรับ ไม่ใช่ความผิดพลาด)
 *
 * เป็นของตกแต่งเสมอในทั้งสองที่ที่ใช้อยู่ (ไอคอนเมนูมี `intlLabel` ของตัวเองอยู่ข้างๆ, empty-state
 * มีข้อความ `list.empty` อยู่ข้างๆ) จึง `alt=""` + `aria-hidden` ไว้ตรงๆ ไม่ต้องรับ label
 *
 * ไม่รับ `width`/`height`/`fill` ที่ Strapi 5's MainNavLinks ส่งมาให้ทุกไอคอนเมนู (ดู
 * @strapi/admin's MainNavLinks.mjs) เหมือนที่ตัวที่วาดเองไม่เคยรับเช่นกัน — คุมขนาดจาก `size` ที่
 * นี่ที่เดียวทั้งสอง adapter (v4 ไม่ส่ง prop อะไรมาเลยให้ icon เมนู, v5 ส่ง width/height/fill แต่ตัว
 * นี้ไม่อ่าน) ดีฟอลต์ 24 จึงเป็นขนาดจริงในเมนูของทั้งคู่ ไม่ใช่แค่ v4
 */
const LINE_LOGO_DATA_URI =
  'data:image/png;base64,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'

export function LineMark({ size = 24 }: LineMarkProps) {
  return (
    <img
      src={LINE_LOGO_DATA_URI}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ display: 'block' }}
    />
  )
}
