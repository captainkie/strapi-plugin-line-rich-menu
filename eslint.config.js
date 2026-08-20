import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.stryker-tmp/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
