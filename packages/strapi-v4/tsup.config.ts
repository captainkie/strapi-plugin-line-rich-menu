import { defineConfig } from 'tsup'

// สอง config ไม่ใช่หนึ่ง — ฝั่ง server รันบน Node 20 ส่วนฝั่ง admin ถูก webpack 5 ของ Strapi 4
// เอาไปรวมร่างต่อแล้วรันในเบราว์เซอร์ target และ platform จึงต้องคนละค่า
// format เป็น cjs ทั้งคู่เพราะไฟล์ shim ที่ root ใช้ require() ตามที่ Strapi 4 กำหนด (สเปก §2.1)
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
    external: ['@strapi/strapi', 'sharp'],
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
      'react-router-dom', 'styled-components',
      '@strapi/design-system', '@strapi/design-system/Icon',
      '@strapi/helper-plugin', '@strapi/icons',
    ],
  },
])
