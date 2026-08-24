import { defineConfig } from 'tsup'

// สอง config ไม่ใช่หนึ่ง — ฝั่ง server รันบน Node 20 ส่วนฝั่ง admin ถูก webpack 5 ของ Strapi 4
// เอาไปรวมร่างต่อแล้วรันในเบราว์เซอร์ target และ platform จึงต้องคนละค่า
// format เป็น cjs ทั้งคู่เพราะไฟล์ shim ที่ root ใช้ require() ตามที่ Strapi 4 กำหนด (สเปก §2.1)
// `noExternal` ของ @fosivo/* ไม่ใช่การจูนขนาดบันเดิล แต่เป็นเงื่อนไขที่ทำให้แพ็กเกจนี้
// ติดตั้งได้เลย: tsup ถือ `dependencies` เป็น external โดยปริยาย ปลั๊กอินที่แพ็กออกมาจึง
// `require("@fosivo/line-rich-menu-core")` ตอนรัน แล้วบังคับให้ package.json ต้องประกาศมัน
// เป็น dependency — ซึ่งเป็น `workspace:*` ที่ npm ปฏิเสธด้วย EUNSUPPORTEDPROTOCOL
// (จับได้ครั้งแรกตอน `npm install` ของ examples/v4-app ใน Task 20 ไม่ใช่จากเทสต์ใด ๆ ก่อนหน้า)
//
// สองแพ็กเกจนั้นเป็นการแบ่งโค้ดภายในระหว่างอะแดปเตอร์ v4/v5 ไม่ใช่ API สาธารณะที่ใครนอกรีโปนี้
// จะ import การรวมเข้ามาในบันเดิลจึงตรงกับสิ่งที่มันเป็นจริง และทำให้ tarball ตัวเดียวพอ
// สำหรับผู้ใช้ — ไม่ต้องปล่อยแพ็กเกจเพิ่มอีกสองตัวขึ้น npm เพียงเพื่อให้ตัวนี้ติดตั้งได้
//
// ฝั่ง admin ปลอดภัยเพราะ `packages/ui` แตะ core ผ่าน subpath `/browser` เท่านั้น
// sharp จึงไม่มีทางถูกลากเข้าบันเดิลของเบราว์เซอร์ผ่านทางนี้
export default defineConfig([
  {
    name: 'server',
    entry: { 'server/index': 'src/server/index.ts' },
    outDir: 'dist',
    format: ['cjs'],
    platform: 'node',
    target: 'node20',
    clean: true,
    sourcemap: true,
    removeNodeProtocol: false,
    external: ['@strapi/strapi', '@strapi/utils', 'sharp'],
    noExternal: [/^@fosivo\//],
  },
  {
    name: 'admin',
    entry: { 'admin/index': 'src/admin/index.tsx' },
    outDir: 'dist',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
    external: [
      'react', 'react-dom', 'react/jsx-runtime',
      'react-router-dom', 'styled-components', 'react-intl',
      '@strapi/design-system', '@strapi/design-system/Icon',
      '@strapi/helper-plugin', '@strapi/icons',
    ],
    noExternal: [/^@fosivo\//],
  },
])
