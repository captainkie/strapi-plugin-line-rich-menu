import { defineConfig } from 'vitest/config'

// `coverage` (provider, include, thresholds) is a workspace-root-only option in Vitest 2 —
// it lives in Vitest's `NonProjectOptions` type, so a per-project `vitest.config.ts` loaded via
// vitest.workspace.ts (see packages/*/vitest.config.ts) can declare it without a type error but
// Vitest silently drops it at runtime: it is never enforced. Verified empirically — with the
// threshold raised to `lines: 100` here removed and left only in packages/core/vitest.config.ts,
// `pnpm test:coverage` still exited 0 even though packages/core/src/line/client.ts was at 99.09%
// lines. It must be declared here, at the true root, for the CI coverage gate to actually block.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
})
