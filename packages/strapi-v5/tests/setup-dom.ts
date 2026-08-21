/**
 * DS v2 วางอยู่บน Radix ซึ่งเรียก API สี่ตัวนี้ตอน mount ทุกครั้ง และ jsdom ไม่ได้ implement
 * ไว้เลยสักตัว ผลคือ `Modal`, `Select` และ `Radio` โยน TypeError ก่อนจะวาดอะไรออกมา — ซึ่ง
 * อ่านเหมือน adapter เขียนผิด ทั้งที่เป็นช่องว่างของสภาพแวดล้อมเทสต์ล้วน ๆ
 *
 * ไฟล์นี้เป็น setupFiles ของทั้งแพ็กเกจ แต่ทำงานเฉพาะเมื่อมี `window` (คือเฉพาะไฟล์ที่ประกาศ
 * `@vitest-environment jsdom`) ไฟล์ฝั่งเซิร์ฟเวอร์จึงไม่ได้รับผลอะไรจากมัน
 */
if (typeof window !== 'undefined') {
  if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver
  }

  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>
  proto['scrollIntoView'] ??= function scrollIntoView(): void {}
  proto['hasPointerCapture'] ??= function hasPointerCapture(): boolean { return false }
  proto['setPointerCapture'] ??= function setPointerCapture(): void {}
  proto['releasePointerCapture'] ??= function releasePointerCapture(): void {}

  /**
   * `Layouts.Header` (Task 17 — primitives.tsx ของ Page) อ่าน `window.strapi.flags.docLinks`
   * ตอน render ทุกครั้ง เพื่อตัดสินใจว่าจะวาดปุ่ม "Learn more" ไหม — ค่านี้ถูก Strapi เอง bootstrap
   * ไว้ก่อนแอดมิน mount เสมอในแอปจริง แต่ jsdom ไม่มีให้ ปล่อยว่างจะได้ TypeError
   * "Cannot read properties of undefined (reading 'flags')" ก่อนจะวาดอะไรออกมาเลย
   * (ช่องว่างของสภาพแวดล้อมเทสต์เดียวกับสี่ตัวข้างบน ไม่ใช่ adapter เขียนผิด) — ปิด docLinks
   * ไว้ (false) เพราะปลั๊กอินนี้ไม่มี doc link ของตัวเองให้ Strapi จับคู่อยู่แล้ว
   */
  const globalWithStrapi = globalThis as unknown as { strapi?: { flags?: { docLinks?: boolean } } }
  globalWithStrapi.strapi ??= { flags: { docLinks: false } }
}
