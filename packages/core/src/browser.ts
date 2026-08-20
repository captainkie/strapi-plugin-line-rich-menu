/**
 * Subpath สำหรับโค้ดที่ปลอดภัยจะรันในเบราว์เซอร์ — ไม่มี `sharp`, ไม่มี `node:crypto`,
 * ไม่มีอะไรที่ผูกกับ Node runtime
 *
 * `"."` (บาร์เรลเต็มใน src/index.ts) ดึง `image/pipeline.js` ซึ่ง import `sharp` แบบ top-level
 * เข้ามาด้วย bundler ฝั่ง admin (webpack 5 ใน Strapi 4, Vite ใน Strapi 5) ไม่ tree-shake bare
 * import ของ native CJS module แบบนี้ — แค่ import `TEMPLATES` หรือ `renderTemplateSvg` ตัวเดียว
 * จาก `"."` จะลาก `sharp` ทั้งก้อนเข้าไปในบันเดิลของ admin panel ทันที (ดูสเปก 5.1, 5.3)
 *
 * ฝั่ง server (adapter ของ Strapi) ยัง import ผ่าน `"."` เหมือนเดิมได้ตามปกติ
 */
export * from './types.js'
export * from './templates.js'
export * from './errors.js'
export * from './schema.js'
export * from './thumbnail.js'
