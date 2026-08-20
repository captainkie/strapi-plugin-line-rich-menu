import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'preview', include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      '@fosivo/line-rich-menu-core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
})
