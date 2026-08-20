import { defineConfig } from 'vitest/config'

// coverage (provider/include/thresholds) is configured in the root vitest.config.ts —
// it's a workspace-root-only option in Vitest 2 and is silently ignored here. See that file.
export default defineConfig({
  test: {
    name: 'core',
    include: ['tests/**/*.test.ts'],
  },
})
