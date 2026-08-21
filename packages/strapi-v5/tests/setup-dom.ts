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
}
