import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// coverage ตั้งที่ root เท่านั้น (ดู vitest.config.ts ที่ root) ห้ามประกาศซ้ำที่นี่
export default defineConfig({
  test: {
    name: 'strapi-v5',
    // ค่าเริ่มต้นเป็น node เพราะเทสต์ส่วนใหญ่ในแพ็กเกจนี้เป็นฝั่งเซิร์ฟเวอร์ ไฟล์ที่ต้องการ DOM
    // ประกาศ `// @vitest-environment jsdom` ไว้บรรทัดแรกของตัวเอง (สำนวนเดียวกับ
    // packages/ui/tests/i18n.test.ts ที่ประกาศ node กลับทางกัน)
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup-dom.ts'],
    server: { deps: { inline: [/@strapi\/design-system/] } },
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@fosivo/line-rich-menu-core/browser': fileURLToPath(new URL('../core/src/browser.ts', import.meta.url)),
      '@fosivo/line-rich-menu-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@fosivo/line-rich-menu-ui': fileURLToPath(new URL('../ui/src/index.ts', import.meta.url)),
      // `@strapi/strapi` ทั้งแพ็กเกจคือ CMS ทั้งตัว (หลายร้อยเมกะไบต์และ React tree ของตัวเอง)
      // การติดตั้งมันไว้เพื่อ import hook สี่ตัวคือราคาที่ไม่คุ้ม ที่นี่จึงชี้ไป test double แล้ว
      // ให้ examples/v5-app (Task 10) เป็นตัวพิสูจน์ของจริง — ดูคอมเมนต์ในไฟล์ double เอง
      '@strapi/strapi/admin': fileURLToPath(new URL('./tests/doubles/strapi-admin.ts', import.meta.url)),
    },
  },
})
