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
)
