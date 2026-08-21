import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// coverage ตั้งที่ root เท่านั้น (ดู vitest.config.ts ที่ root) ห้ามประกาศซ้ำที่นี่
export default defineConfig({
  test: {
    name: 'strapi-v4',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // แพ็กเกจฝั่งแอดมินของ Strapi 4 ทั้งสองตัวเขียนมาให้ bundler กิน ไม่ใช่ให้ Node กินตรง ๆ:
    // DS v1 import named export จาก `@strapi/ui-primitives` ที่เป็น CommonJS และ helper-plugin
    // import `lodash/isEmpty` แบบไม่มีนามสกุล — ทั้งคู่ ESM loader ของ Node ปฏิเสธ ให้ Vite
    // เป็นคน resolve ให้เหมือนที่ webpack ทำในแอดมินจริง
    server: { deps: { inline: [/@strapi\/(design-system|helper-plugin)/] } },
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
