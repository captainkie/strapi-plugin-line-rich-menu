import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // docs/superpowers/ เก็บสเปกและแผน ไม่ใช่ซอร์ส — ส่วน docs/tests/ กับ docs/vitest.config.ts
  // เป็นโค้ดจริงที่ต้องถูก lint เหมือนทุกไฟล์ในรีโป การ ignore ทั้ง docs/** จะยกเว้นมันไปด้วย
  // docs/files/ ไม่ได้ถูก track เลย (.gitignore) — ต้นทางอ้างอิงจากโปรเจกต์ลูกค้าที่ห้ามขึ้น repo
  // สาธารณะ มีอยู่บนเครื่อง dev บางเครื่องเท่านั้น ต้องกันออกไม่งั้น `pnpm lint` จะพังบนเครื่องที่มีมัน
  // แต่ผ่านบน CI เงียบ ๆ เพราะไฟล์ล็อกไม่เคยเห็นมันเลย ซึ่งเป็นด่านที่เขียว/แดงไม่ตรงกันโดยไม่มีใครรู้ตัว
  // examples/*/{build,.strapi,.tmp,.pack,types} ทั้งหมดนี้เป็นผลผลิตของ `strapi build` (หรือ
  // `strapi develop`) กับ `npm pack` ไม่ใช่ซอร์ส — ถ้าไม่กันออก `pnpm lint` จะไปไล่บันเดิลของ admin
  // ทั้งก้อน (หมื่นกว่า error) หรือไล่ types/generated/*.d.ts ที่ Strapi เขียนเองตอน build ซึ่งเป็น
  // ด่านเขียว/แดงไม่ตรงกันแบบเดียวกับ docs/files/ ข้างบน: เครื่องที่เพิ่ง build แล้วมีไฟล์นี้ค้างอยู่
  // จะเจอ `pnpm lint` พังด้วย error ที่ตัวเองไม่ได้ก่อ ส่วน CI ที่ไม่เคย build ก่อน lint จะผ่านเงียบ ๆ
  {
    ignores: [
      '**/dist/**', '**/coverage/**', '**/.stryker-tmp/**', 'docs/superpowers/**', 'docs/screenshots/**',
      'docs/files/**',
      'examples/*/build/**', 'examples/*/.strapi/**',
      'examples/*/.tmp/**', 'examples/*/.pack/**', 'examples/*/types/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // ไฟล์ shim สองตัวนี้ต้องเป็น CommonJS จริง ๆ — Strapi 4 require() เข้าไปตรง ๆ ที่ root
    // ของแพ็กเกจ (สเปก §2.1) จะเขียนเป็น ESM หรือใช้ import ไม่ได้เลย
    files: ['packages/strapi-v4/strapi-server.js', 'packages/strapi-v4/strapi-admin.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // สคริปต์ที่รันด้วย Node ตรง ๆ ไม่ได้ผ่าน bundler — ต้องประกาศ global ของ Node เอง
    // (ไม่ดึงแพ็กเกจ `globals` เข้ามาเพื่อสิ่งนี้ ตามแนวเดียวกับบล็อก shim ด้านบน)
    files: ['packages/strapi-v4/scripts/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    // สคริปต์ที่รันด้วย Node ตรง ๆ ไม่ได้ผ่าน bundler — เหตุผลเดียวกับบล็อกของ strapi-v4
    files: ['packages/strapi-v5/scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    // examples/* เป็นแอป Strapi ของลูกค้า ไม่ใช่แพ็กเกจในเวิร์กสเปซ — config กับ script
    // ของมันเป็น CommonJS ตามที่ Strapi กำหนด (ทั้ง 4 และ 5) ไม่ใช่ทางเลือกด้านสไตล์
    files: ['examples/*/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', exports: 'writable',
        process: 'readonly', console: 'readonly', __dirname: 'readonly', Buffer: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // `__dirname` อยู่ในนี้เพราะ playwright.config.ts ต้องใช้มันแทน `import.meta.url` —
    // Playwright แปลง config เป็น CJS และ `import.meta` ทำให้ Node สลับไปโหลดเป็น ESM แล้วล้ม
    files: ['examples/*/**/*.ts'],
    languageOptions: {
      globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@strapi/*'], message: 'ui ต้องไม่รู้จัก Strapi — รับผ่าน UIPort แทน' },
          { group: ['styled-components'], message: 'Strapi 4 ใช้ v5 และ Strapi 5 ใช้ v6 — ห้ามผูก' },
          { group: ['react-router-dom'], message: 'Strapi 4 ใช้ router v5 และ Strapi 5 ใช้ v6 — รับผ่าน port.nav' },
          { group: ['react-intl'], message: 'รับผ่าน port.t แทน' },
        ],
        // `paths` จับคู่ specifier แบบ exact string ไม่ใช่ glob แบบ `patterns`/`group` —
        // ต้องใช้ตัวนี้เพื่อบล็อกเฉพาะ "." ของ core โดยไม่ก้ำเกย "./browser" ด้วย
        // (group แบบ gitignore-style จะจับ subpath ทุกอันที่อยู่ใต้ specifier ที่ไม่มี wildcard ไปด้วย)
        paths: [
          { name: '@fosivo/line-rich-menu-core', message: 'ใช้ /browser เท่านั้น — "." ลาก sharp เข้าบันเดิล' },
        ],
      }],
    },
  },
  {
    // ยามที่ carry-forward ของ Plan 02 บันทึกว่าขาดอยู่: `RichMenuList` ใส่ `[channelId, http, t]`
    // ไว้ใน dependency array ส่วน `ChannelSettings` ใช้ `useEffect(reload, [])` ที่ปิดทับ http/t
    // สองสำนวนสำหรับเรื่องเดียวกันในไฟล์ที่อยู่ติดกัน — และเป็นความผิดพลาดที่ทำให้หน้าจอกะพริบ
    // เป็นค่าว่างทุก render ถ้าเกิดกับ port ที่ adapter ประกอบ (ดูคอมเมนต์เหนือ HttpClient ใน port.ts)
    files: ['packages/ui/**/*.{ts,tsx}', 'packages/strapi-v4/src/admin/**/*.{ts,tsx}', 'packages/strapi-v5/admin/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
)
