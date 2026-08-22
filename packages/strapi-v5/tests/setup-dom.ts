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
   * Task 20 item 10 (strapi-v5 L4) — คอมเมนต์นี้เคยอ้างว่า `Layouts.Header` จริงอ่าน
   * `window.strapi.flags.docLinks` ตอน render และเทสต์ที่ `tests/admin/primitives.test.tsx`
   * render component นั้นจริง จึงต้องปลอมค่านี้ไว้ — **ไม่จริง**: `vitest.config.ts:50` ของแพ็กเกจนี้
   * alias `@strapi/strapi/admin` ทั้งไฟล์ไปที่ `tests/doubles/strapi-admin.tsx` ตลอดทั้งโปรเจกต์
   * เทสต์ `primitives.Page` จึง render `Layouts.Header` ของ**ตัวปลอม**เสมอ (ดูคอมเมนต์เต็มที่
   * `Page` ใน `admin/src/primitives.tsx`) ไม่ใช่ตัวจริงที่อ่าน `window.strapi.flags` เลยสักครั้ง —
   * polyfill นี้จึงเป็น dead code ในสภาพแวดล้อมเทสต์ปัจจุบัน ไม่มีอะไรอ่านมันจริง
   *
   * เก็บไว้โดยตั้งใจแทนที่จะลบทิ้ง: เป็นเกราะกันไว้เผื่อวันที่ `vitest.config.ts` เลิก alias ไฟล์นี้
   * (เช่นย้ายไป render ของจริงเพื่อพิสูจน์ path นี้จริง ๆ ตามที่คอมเมนต์เดิมตั้งใจไว้) ตอนนั้น
   * polyfill นี้จะกลับมาจำเป็นทันทีโดยไม่ต้องมีใครมาเขียนใหม่ — แต่คอมเมนต์เดิมที่อ้างว่ามันถูกใช้
   * อยู่ *ตอนนี้* เป็นเท็จ แก้ให้ตรงกับความจริงแทน
   */
  const globalWithStrapi = globalThis as unknown as { strapi?: { flags?: { docLinks?: boolean } } }
  globalWithStrapi.strapi ??= { flags: { docLinks: false } }
}
