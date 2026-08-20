import { defineConfig } from 'vitest/config'

// coverage (provider/include/thresholds) is configured in the root vitest.config.ts and must stay
// there. Vitest resolves coverage once from the root config, never per project, so anything
// declared here type-checks but is silently dropped at runtime — which is how the CI gate once
// ended up looking configured while blocking nothing. See that file.
export default defineConfig({
  test: {
    name: 'core',
    include: ['tests/**/*.test.ts'],
  },
})
