import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// coverage ตั้งที่ root เท่านั้น (ดู vitest.config.ts ที่ root) ห้ามประกาศซ้ำที่นี่
export default defineConfig({
  test: {
    name: 'strapi-v4',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // Design System v1 เป็น ESM ที่ import ของจาก `@strapi/ui-primitives` ซึ่งเป็น CommonJS —
    // Node แกะ named export ออกจาก CJS ให้ไม่ได้ ต้องให้ Vite เป็นคน transform ให้ก่อน
    // (`Named export 'useCallbackRef' not found` คือหน้าตาของความพังนี้)
    server: { deps: { inline: [/@strapi\/design-system/] } },
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@fosivo/line-rich-menu-core/browser': fileURLToPath(new URL('../core/src/browser.ts', import.meta.url)),
      '@fosivo/line-rich-menu-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@fosivo/line-rich-menu-ui': fileURLToPath(new URL('../ui/src/index.ts', import.meta.url)),
    },
  },
})
