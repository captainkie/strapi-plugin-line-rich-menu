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
    /**
     * ทั้งสามตัวต้องเข้าท่อของ Vite พร้อมกัน ไม่ใช่แค่ DS ตัวเดียวเหมือนที่เคยเป็น
     *
     * `@strapi/icons` วาดไอคอนด้วย styled-components เหมือน DS ถ้าปล่อยให้ Node โหลดมันเอง
     * (ซึ่ง Node ทำได้ เพราะ `dist/index.mjs` เป็น ESM ถูกต้อง) มันจะ resolve styled-components
     * ด้วยกติกาของ Node คือ field `main` ที่เป็น CJS ขณะที่ DS ซึ่งถูก inline ได้ตัว ESM จาก
     * `resolve.mainFields` ข้างล่าง — กลายเป็น styled-components สองอินสแตนซ์ที่ context
     * คนละอัน แล้วทุกไอคอนล้มด้วย "Accessing `useTheme` hook outside of a `<ThemeProvider>`"
     * ทั้งที่ `DesignSystemProvider` ครอบอยู่จริง ๆ
     *
     * `@strapi/ui-primitives` เป็นแพ็กเกจที่ประกาศตัวเองผิด: `"type": "module"` แต่ `main`
     * ชี้ไป `dist/index.js` ที่เป็น CommonJS และไม่มี `exports` map ให้เลือกทางอื่น — ต้องพึ่ง
     * `resolve.mainFields` ข้างล่างเป็นคนพาไป `dist/index.mjs` ซึ่งเป็น ESM ของจริง
     */
    server: {
      deps: { inline: [/@strapi\/design-system/, /@strapi\/ui-primitives/, /@strapi\/icons/] },
    },
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    /**
     * DS v2 กับ dependency ของมันไม่มี `exports` map สักตัว และหลายตัวประกาศ `"type": "module"`
     * ทั้งที่ `main` เป็น CommonJS — resolver ที่เลือก `main` จึงได้ไฟล์ที่ Node โหลดไม่ได้เลย
     * (`exports is not defined in ES module scope`) การประกาศให้ `module` มาก่อนคือการอ่าน
     * แพ็กเกจแบบเดียวกับที่ Vite ของแอดมิน Strapi 5 ตัวจริงอ่าน ไม่ใช่การผ่อนกติกาให้เทสต์ผ่าน
     *
     * `main` ยังอยู่ท้ายรายการเพื่อไม่ให้แพ็กเกจที่มีแต่ `main` (เช่น react-dom ในบางทาง) พัง
     */
    mainFields: ['module', 'jsnext:main', 'jsnext', 'main'],
    alias: {
      '@fosivo/line-rich-menu-core/browser': fileURLToPath(new URL('../core/src/browser.ts', import.meta.url)),
      '@fosivo/line-rich-menu-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@fosivo/line-rich-menu-ui': fileURLToPath(new URL('../ui/src/index.ts', import.meta.url)),
      // `@strapi/strapi` ทั้งแพ็กเกจคือ CMS ทั้งตัว (หลายร้อยเมกะไบต์และ React tree ของตัวเอง)
      // การติดตั้งมันไว้เพื่อ import hook สี่ตัวคือราคาที่ไม่คุ้ม ที่นี่จึงชี้ไป test double แล้ว
      // ให้ examples/v5-app (Task 10) เป็นตัวพิสูจน์ของจริง — ดูคอมเมนต์ในไฟล์ double เอง
      '@strapi/strapi/admin': fileURLToPath(new URL('./tests/doubles/strapi-admin.tsx', import.meta.url)),
    },
  },
})
