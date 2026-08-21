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
      include: ['packages/core/src/**', 'packages/ui/src/**'],
      // Thresholds are per-glob, not one set for both packages. A single set cannot serve
      // them: React counts every inline handler prop as a function, so `ui` sits near 71%
      // functions while `core` is at 98% — one shared number either lets `core` sag by
      // twenty points or fails `ui` for a shape it cannot avoid.
      //
      // `ui` was excluded from coverage entirely until now, so the largest package in the
      // repo — 350 tests — had no floor under it at all. That is the same failure this file's
      // comment above describes: a gate that looks configured while blocking nothing.
      //
      // Each number is set just under what the package measures today, so it blocks a
      // regression without demanding new tests to go green. Raise them when the real figure
      // rises; never lower one to make a red build pass.
      thresholds: {
        'packages/core/src/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'packages/ui/src/**': { lines: 90, branches: 90, functions: 70, statements: 90 },
      },
    },
  },
})
