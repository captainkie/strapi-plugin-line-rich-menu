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
          { group: ['@fosivo/line-rich-menu-core'], message: 'ใช้ /browser เท่านั้น — "." ลาก sharp เข้าบันเดิล' },
        ],
      }],
    },
  },
)
