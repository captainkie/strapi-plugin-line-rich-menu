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
