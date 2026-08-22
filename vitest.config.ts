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
    projects: ['packages/*/vitest.config.ts', 'tools/*/vitest.config.ts', 'docs/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'packages/ui/src/**', 'packages/strapi-v5/server/src/**'],
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
        // เคยลองใส่ `perFile: true` ตรงนี้ แล้ว **มันไม่ทำงาน** — Vitest รับ key นี้ใน threshold
        // ที่ผูกกับ glob โดยไม่บ่น แต่ไม่บังคับใช้ ยืนยันด้วยการวางไฟล์ที่ 40% lines / 50% branches
        // ไว้ใน packages/core/src/server/ แล้วประตูยังเขียว เป็นความล้มเหลวชนิดเดียวกับ threshold
        // ต่อ project ของ Vitest 2 ที่คอมเมนต์ข้างบนเล่าไว้เป๊ะ ๆ คือ option ที่ type ผ่านและอ่านแล้ว
        // เหมือนตั้งค่าไว้ แต่ไม่ได้กั้นอะไรเลย — อย่าใส่กลับโดยไม่ได้ทดสอบว่ามันแดงจริง
        //
        // ผลคือไฟล์ที่อ่อนยังซ่อนหลังไฟล์ที่แข็งได้อยู่ (เจอจริงที่ server/channels.ts 87% branch
        // ขณะที่ทั้ง glob 95%) ทางแก้จริงคือยก packages/ui ให้ผ่าน perFile แล้วเปิดที่ระดับบนสุด
        // ซึ่งเป็นที่เดียวที่ Vitest บังคับใช้จริง — บันทึกไว้ใน carry-forward แล้ว
        'packages/core/src/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'packages/ui/src/**': { lines: 90, branches: 90, functions: 70, statements: 90 },
        // Task 20 item 10 (strapi-v5 L7) — packages/strapi-v5 had no floor at all: `coverage.include`
        // above never named it, so it inherited zero enforcement no matter how thin any file inside
        // got. That is exactly the failure this file's own comment describes for the other two
        // packages ("a gate that looks configured while blocking nothing") one level up — the test
        // *wiring* was fine (`projects` already picks up strapi-v5's vitest.config.ts, `pnpm
        // check:deps` covers both adapters) but nothing in *this* file ever named its source tree.
        // Measured today (`packages/strapi-v5/server/src/**` isolated — see this commit's message
        // for how): 86.11% lines/statements, 92.37% branches, 90.47% functions. Set a few points
        // under each, same convention as core/ui above — blocks a regression, doesn't demand new
        // tests to go green today. `src/controllers/menus.ts` and `channels.ts` are the visibly
        // weak files (many coded-error branches only exercised by the e2e suite in examples/v5-app,
        // not by unit tests) — this floor is what stops that from getting weaker unnoticed, which is
        // the exact gap M4 (item 7, this same task) found in `menu-write.ts`.
        'packages/strapi-v5/server/src/**': { lines: 85, branches: 90, functions: 88, statements: 85 },
      },
    },
  },
})
