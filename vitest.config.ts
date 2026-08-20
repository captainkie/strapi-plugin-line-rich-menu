import { defineConfig } from 'vitest/config'

// `projects` replaces vitest.workspace.ts, which Vitest 3 deprecated and Vitest 4 removes.
//
// `coverage` stays here and only here. In Vitest 2 it was a workspace-root-only option:
// a per-project config loaded through vitest.workspace.ts could declare `coverage.thresholds`
// without a type error, but Vitest dropped it at runtime and never enforced it — the CI gate
// looked configured while blocking nothing. Vitest 3 keeps that rule under the new name:
// coverage is resolved once from the root config, never per project. So the thresholds below
// are the only ones that block, and packages/*/vitest.config.ts must not restate them.
//
// Re-proved after the Vitest 3 upgrade by raising `lines` to 100, running `pnpm test:coverage`
// and watching it exit non-zero, then restoring 90 and watching it pass. See task-14-15-report.md.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'tools/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
})
