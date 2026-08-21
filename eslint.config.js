import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // docs/ เก็บสเปก แผน และโค้ดอ้างอิงจากโปรเจกต์อื่น — ไม่ใช่ซอร์สของแพ็กเกจนี้
  { ignores: ['**/dist/**', '**/coverage/**', '**/.stryker-tmp/**', 'docs/**'] },
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
    files: ['packages/strapi-v4/scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    // examples/v4-app เป็นแอป Strapi 4 ของลูกค้า ไม่ใช่แพ็กเกจในเวิร์กสเปซ — config กับ script
    // ของมันเป็น CommonJS ตามที่ Strapi 4 กำหนด ไม่ใช่ทางเลือกด้านสไตล์ที่จะแก้ให้ตรงกันได้
    files: ['examples/v4-app/**/*.js'],
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
    files: ['examples/v4-app/**/*.ts'],
    languageOptions: {
      globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly' },
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
)
