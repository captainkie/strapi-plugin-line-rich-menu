import { defineConfig } from 'tsup'

export default defineConfig({
  // สอง entry: "." (บาร์เรลเต็ม รวม sharp) กับ "./browser" (ไม่มี sharp/node:crypto —
  // ดู src/browser.ts) ต้องแยกไฟล์ output จริง ไม่ใช่แค่แยก export ใน barrel เดียว
  // เพราะ tree-shaking ของ bundler ฝั่ง consumer (webpack 5, Vite) ไม่ตัด bare import
  // ของ native CJS module อย่าง sharp ออกจากบันเดิลแม้จะไม่ได้ใช้ symbol นั้นเลยก็ตาม
  entry: { index: 'src/index.ts', browser: 'src/browser.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  // ค่าเริ่มต้นของ tsup คือ true — esbuild plugin ภายใน ("node-protocol-plugin") ตัด "node:"
  // ออกจากทุก import/require เงียบ ๆ ทำให้ `import ... from "node:crypto"` ใน crypto.ts
  // (เขียนถูกต้องแล้ว) กลายเป็น `from "crypto"` ใน dist ทั้ง ESM และ CJS
  // bundler ฝั่ง consumer (webpack 5, Vite) ใช้ prefix "node:" เพื่อรู้จัก Node builtin —
  // ไม่มี prefix แปลว่ามันอาจพยายาม resolve/polyfill "crypto" เป็น package บน npm แทน
  // Node 20 (target ของแพ็กเกจนี้) รองรับ prefix นี้เต็มที่ทั้ง require และ import จึงปิดไว้เสมอ
  removeNodeProtocol: false,
})
