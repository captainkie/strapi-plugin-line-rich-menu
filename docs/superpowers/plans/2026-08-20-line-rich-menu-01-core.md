# LINE Rich Menu — Plan 01: `@fosivo/line-rich-menu-core`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง library ที่ไม่มี Strapi dependency เลย ซึ่งรู้ทุกอย่างเกี่ยวกับ LINE rich menu — template, การตรวจ payload, การเรียก LINE API, การแปลงรูป, การเข้ารหัสความลับ, และลำดับ publish/rollback — พร้อม test ที่รันได้โดยไม่ต้องบูต Strapi

**Architecture:** โดเมนล้วนแบบ pure function เป็นหลัก I/O มีที่เดียวคือ `line/client.ts` (fetch) และ `image/pipeline.ts` (sharp) state machine ของ publish **คืนแผนเป็น step list ไม่ยิง network เอง** เพื่อให้ทดสอบลำดับและ rollback ได้โดยไม่ต้อง mock network

**Tech Stack:** TypeScript 5.6 · pnpm workspace · vitest 2 · tsup 8 · zod 3 · sharp 0.33 · msw 2 · fast-check 3 · Node 20

**Spec:** `docs/superpowers/specs/2026-08-20-line-rich-menu-strapi-plugin-design.md`

## Global Constraints

ทุก task อยู่ภายใต้ข้อจำกัดเหล่านี้เสมอ ค่าตัวเลขคัดมาจาก spec ตรง ๆ

- **Node 20** เท่านั้น (ลูกค้าอยู่ Node 20.20.0) ห้ามใช้ API ที่ต้อง Node 22+
- `packages/core` **ห้ามมี dependency ใด ๆ ที่ชื่อขึ้นต้นด้วย `@strapi/`** — บังคับด้วย test ใน Task 1
- รูป LINE: **≤ 1,048,576 bytes (1 MB)** · รับเฉพาะ `image/jpeg` และ `image/png`
- ขนาดที่ LINE รับ: `2500x1686`, `2500x843`, `1200x810`, `1200x405`, `800x540`, `800x270`
- ช่องแตะได้ **1–20 ช่อง** ต่อเมนู
- `chatBarText` **1–14 ตัวอักษร** · `name` ≤ 300 ตัวอักษร · `postback.data` ≤ 300 ตัวอักษร
- URI scheme ที่อนุญาต: `https`, `http`, `tel`, `line` เท่านั้น
- **ห้าม log ค่า access token / secret ในทุกกรณี** และห้ามใส่ลงใน error message
- ทุก commit ใช้ Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`)
- **`packages/core/src/index.ts` ถูกแก้โดยหลาย task** — แต่ละ task ให้ **เพิ่มบรรทัด `export * from './<ไฟล์ของตัวเอง>.js'` ต่อท้าย** ไม่ใช่เขียนทับทั้งไฟล์ Task 13 มีรายการ export ฉบับสมบูรณ์ไว้ตรวจทานตอนท้าย
- `tsconfig.base.json` เปิด `noUncheckedIndexedAccess` — การเข้าถึง array/record ด้วย index ต้องใช้ `!` หรือ narrow ก่อน

---

## File Structure

```
package.json                         root workspace scripts
pnpm-workspace.yaml                  packages/* examples/* tools/*
tsconfig.base.json                   compiler options ที่ทุก package ใช้ร่วม
vitest.workspace.ts                  รวม test project ของทุก package
.nvmrc                               20
.github/workflows/ci.yml             typecheck → lint → test → coverage gate → security scan

packages/core/
  package.json                       @fosivo/line-rich-menu-core
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  src/
    index.ts                         re-export public API ทั้งหมด
    types.ts                         Bounds, RichMenuSize, Action, RichMenuArea, RichMenuPayload
    templates.ts                     TEMPLATES 12 แบบ + SIZE_LADDER
    thumbnail.ts                     วาด SVG จาก bounds
    schema.ts                        zod schema ทั้งหมด
    errors.ts                        typed error ทุกชนิด + error code
    crypto.ts                        AES-256-GCM envelope + HKDF
    line/
      client.ts                      LineClient — I/O เดียวของ package (ยกเว้น sharp)
      endpoints.ts                   URL builder ล้วน ไม่มี I/O
    image/
      pipeline.ts                    normalize + compose
      guards.ts                      magic byte, pixel limit
    publish/
      machine.ts                     plan() + compensate() — pure
  tests/
    templates.test.ts
    schema.test.ts
    crypto.test.ts
    line/client.test.ts
    line/retry.test.ts
    image/pipeline.test.ts
    image/guards.test.ts
    publish/machine.test.ts
    thumbnail.test.ts
    no-strapi-deps.test.ts
    fixtures/                        รูปทดสอบ (สร้างด้วยสคริปต์ ไม่ commit binary ใหญ่)

tools/line-mock/
  package.json
  src/server.ts                      fastify เลียน LINE API ใช้ทั้งใน CI และโหมด demo
```

**เหตุผลของการแบ่ง:** `endpoints.ts` แยกจาก `client.ts` เพื่อให้ทดสอบการประกอบ URL ได้โดยไม่แตะ network · `guards.ts` แยกจาก `pipeline.ts` เพราะ guard คือ security boundary ที่ต้องมีชุดเทสต์ของตัวเอง · `machine.ts` ไม่มี I/O เลยจึงเทสต์ด้วย property test ได้

---

## Task 1: Monorepo scaffold + ยามกัน Strapi dependency

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `vitest.workspace.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/tsup.config.ts`, `packages/core/src/index.ts`
- Test: `packages/core/tests/no-strapi-deps.test.ts`

**Interfaces:**
- Consumes: ไม่มี (task แรก)
- Produces: workspace ที่รัน `pnpm test` ได้ · package `@fosivo/line-rich-menu-core` ที่ import ได้

- [ ] **Step 1: สร้างไฟล์ workspace ระดับ root**

`.nvmrc`
```
20
```

`pnpm-workspace.yaml`
```yaml
packages:
  - 'packages/*'
  - 'tools/*'
  - 'examples/*'
```

`package.json`
```json
{
  "name": "line-rich-menu",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint ."
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "tsup": "^8.3.0",
    "eslint": "^9.12.0",
    "typescript-eslint": "^8.8.0"
  },
  "packageManager": "pnpm@11.5.2"
}
```

`tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.workspace.ts`
```ts
export default ['packages/*/vitest.config.ts', 'tools/*/vitest.config.ts']
```

`eslint.config.js` — CI ใน Task 15 เรียก `pnpm lint` จริง จึงต้องมี config จริง
```js
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
```

ติดตั้งเพิ่ม: `pnpm add -D -w @eslint/js`

- [ ] **Step 2: สร้าง package `core`**

`packages/core/package.json`
```json
{
  "name": "@fosivo/line-rich-menu-core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8",
    "sharp": "^0.33.5"
  }
}
```

`packages/core/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["src", "tests"]
}
```

`packages/core/tsup.config.ts`
```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
})
```

`packages/core/vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'core',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
})
```

`packages/core/src/index.ts`
```ts
export const CORE_VERSION = '0.0.0'
```

- [ ] **Step 3: เขียน test ที่ต้องล้มเหลว — ยามกัน Strapi dependency**

`packages/core/tests/no-strapi-deps.test.ts`
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }

describe('core มีอิสระจาก Strapi', () => {
  it('ไม่มี dependency ที่ขึ้นต้นด้วย @strapi/', () => {
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]
    expect(names.filter((n) => n.startsWith('@strapi/'))).toEqual([])
  })

  it('ไม่มี dependency ที่เป็น React หรือ bundler ของ admin panel', () => {
    const banned = ['react', 'react-dom', 'styled-components', 'react-router-dom']
    const names = Object.keys(pkg.dependencies ?? {})
    expect(names.filter((n) => banned.includes(n))).toEqual([])
  })
})
```

- [ ] **Step 4: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm install && pnpm vitest run packages/core/tests/no-strapi-deps.test.ts`
Expected: FAIL — `Cannot find module '../package.json'` ถ้ายังไม่ได้สร้างไฟล์ครบ หรือ PASS ทันทีถ้าสร้างครบแล้ว (test นี้เป็น regression guard ไม่ใช่ TDD แท้ ให้ยืนยันว่ามันจับได้จริงโดยแอบใส่ `"@strapi/utils": "^5.0.0"` ลง dependencies ชั่วคราวแล้วรันซ้ำ ต้อง FAIL)

- [ ] **Step 5: เอา dependency ปลอมออกแล้วรันให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/no-strapi-deps.test.ts`
Expected: PASS 2 tests

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .nvmrc vitest.workspace.ts packages/core
git commit -m "chore: scaffold pnpm monorepo with core package and Strapi-dependency guard"
```

---

## Task 2: Domain types + template catalog 12 แบบ

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/templates.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/templates.test.ts`

**Interfaces:**
- Consumes: workspace จาก Task 1
- Produces:
  - `interface Bounds { x: number; y: number; width: number; height: number }`
  - `interface RichMenuSize { width: number; height: number }`
  - `type RichMenuSizeName = 'large' | 'compact'`
  - `interface TemplateDef { key: string; sizeName: RichMenuSizeName; size: RichMenuSize; bounds: Bounds[] }`
  - `const TEMPLATES: Record<string, TemplateDef>`
  - `const SIZE_LADDER: Record<RichMenuSizeName, RichMenuSize[]>`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/templates.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { SIZE_LADDER, TEMPLATES, type TemplateDef } from '../src/templates.js'

const all = Object.values(TEMPLATES)

describe('แคตตาล็อก template', () => {
  it('มีครบ 12 แบบ — compact 5 large 7', () => {
    expect(all).toHaveLength(12)
    expect(all.filter((t) => t.sizeName === 'compact')).toHaveLength(5)
    expect(all.filter((t) => t.sizeName === 'large')).toHaveLength(7)
  })

  it('ทุกแบบมีช่อง 1–20 ช่องตามที่ LINE จำกัด', () => {
    for (const t of all) {
      expect(t.bounds.length).toBeGreaterThanOrEqual(1)
      expect(t.bounds.length).toBeLessThanOrEqual(20)
    }
  })

  it('ทุกช่องอยู่ในกรอบผืนผ้าใบ', () => {
    for (const t of all) {
      for (const b of t.bounds) {
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.y).toBeGreaterThanOrEqual(0)
        expect(b.width).toBeGreaterThan(0)
        expect(b.height).toBeGreaterThan(0)
        expect(b.x + b.width).toBeLessThanOrEqual(t.size.width)
        expect(b.y + b.height).toBeLessThanOrEqual(t.size.height)
      }
    }
  })

  // invariant นี้พิสูจน์ว่าการพอร์ตพิกัดมาจากโค้ดเดิมถูกต้องครบถ้วน
  it('ช่องทุกช่องรวมกันปูเต็มผืนผ้าใบพอดี ไม่มีรูโหว่ ไม่ทับกัน', () => {
    for (const t of all) {
      const sum = t.bounds.reduce((acc, b) => acc + b.width * b.height, 0)
      expect(sum, `${t.key} พื้นที่รวมไม่เท่าผืนผ้าใบ`).toBe(t.size.width * t.size.height)
      expect(hasOverlap(t), `${t.key} มีช่องทับกัน`).toBe(false)
    }
  })

  it('ทุกขนาดใน SIZE_LADDER เป็นขนาดที่ LINE รับ และเรียงจากใหญ่ไปเล็ก', () => {
    const allowed = new Set([
      '2500x1686', '2500x843', '1200x810', '1200x405', '800x540', '800x270',
    ])
    for (const sizes of Object.values(SIZE_LADDER)) {
      for (const s of sizes) expect(allowed.has(`${s.width}x${s.height}`)).toBe(true)
      const widths = sizes.map((s) => s.width)
      expect(widths).toEqual([...widths].sort((a, b) => b - a))
    }
  })
})

function hasOverlap(t: TemplateDef): boolean {
  for (let i = 0; i < t.bounds.length; i++) {
    for (let j = i + 1; j < t.bounds.length; j++) {
      const a = t.bounds[i]!
      const b = t.bounds[j]!
      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
      if (overlapX > 0 && overlapY > 0) return true
    }
  }
  return false
}
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/templates.test.ts`
Expected: FAIL — `Cannot find module '../src/templates.js'`

- [ ] **Step 3: เขียน `types.ts`**

`packages/core/src/types.ts`
```ts
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RichMenuSize {
  width: number
  height: number
}

export type RichMenuSizeName = 'large' | 'compact'

export type ActionType =
  | 'postback'
  | 'message'
  | 'uri'
  | 'datetimepicker'
  | 'camera'
  | 'cameraRoll'
  | 'location'
  | 'richmenuswitch'
  | 'clipboard'

export interface PostbackAction {
  type: 'postback'
  label?: string
  data: string
  displayText?: string
}
export interface MessageAction {
  type: 'message'
  label?: string
  text: string
}
export interface UriAction {
  type: 'uri'
  label?: string
  uri: string
  altUri?: { desktop: string }
}
export interface DatetimePickerAction {
  type: 'datetimepicker'
  label?: string
  data: string
  mode: 'date' | 'time' | 'datetime'
  initial?: string
  max?: string
  min?: string
}
export interface CameraAction { type: 'camera'; label: string }
export interface CameraRollAction { type: 'cameraRoll'; label: string }
export interface LocationAction { type: 'location'; label: string }
export interface RichMenuSwitchAction {
  type: 'richmenuswitch'
  label?: string
  richMenuAliasId: string
  data: string
}
export interface ClipboardAction {
  type: 'clipboard'
  label?: string
  clipboardText: string
}

export type Action =
  | PostbackAction
  | MessageAction
  | UriAction
  | DatetimePickerAction
  | CameraAction
  | CameraRollAction
  | LocationAction
  | RichMenuSwitchAction
  | ClipboardAction

export interface RichMenuArea {
  bounds: Bounds
  action: Action
}

/** payload ที่ส่งให้ LINE ตรง ๆ — ชื่อฟิลด์ต้องตรงกับ API ของ LINE เป๊ะ */
export interface RichMenuPayload {
  size: RichMenuSize
  selected: boolean
  name: string
  chatBarText: string
  areas: RichMenuArea[]
}
```

- [ ] **Step 4: เขียน `templates.ts` พร้อมพิกัดจริงครบ 12 แบบ**

`packages/core/src/templates.ts`
```ts
import type { Bounds, RichMenuSize, RichMenuSizeName } from './types.js'

export interface TemplateDef {
  key: string
  sizeName: RichMenuSizeName
  size: RichMenuSize
  bounds: Bounds[]
}

export const LARGE: RichMenuSize = { width: 2500, height: 1686 }
export const COMPACT: RichMenuSize = { width: 2500, height: 843 }

/** ไล่จากใหญ่ไปเล็ก — ลดขนาดก็ต่อเมื่อบีบ quality จนสุดแล้วยังเกิน 1 MB */
export const SIZE_LADDER: Record<RichMenuSizeName, RichMenuSize[]> = {
  large: [
    { width: 2500, height: 1686 },
    { width: 1200, height: 810 },
    { width: 800, height: 540 },
  ],
  compact: [
    { width: 2500, height: 843 },
    { width: 1200, height: 405 },
    { width: 800, height: 270 },
  ],
}

const b = (x: number, y: number, width: number, height: number): Bounds => ({ x, y, width, height })

const defs: TemplateDef[] = [
  // ---- large 2500x1686 ----
  {
    key: 'RICH_MENU_TEMPLATE_201',
    sizeName: 'large',
    size: LARGE,
    bounds: [
      b(0, 0, 833, 843), b(833, 0, 833, 843), b(1666, 0, 834, 843),
      b(0, 843, 833, 843), b(833, 843, 833, 843), b(1666, 843, 834, 843),
    ],
  },
  {
    key: 'RICH_MENU_TEMPLATE_202',
    sizeName: 'large',
    size: LARGE,
    bounds: [
      b(0, 0, 1250, 843), b(1250, 0, 1250, 843),
      b(0, 843, 1250, 843), b(1250, 843, 1250, 843),
    ],
  },
  {
    key: 'RICH_MENU_TEMPLATE_203',
    sizeName: 'large',
    size: LARGE,
    bounds: [
      b(0, 0, 2500, 843),
      b(0, 843, 833, 843), b(833, 843, 833, 843), b(1666, 843, 834, 843),
    ],
  },
  {
    key: 'RICH_MENU_TEMPLATE_204',
    sizeName: 'large',
    size: LARGE,
    bounds: [
      b(0, 0, 1666, 1686),
      b(1666, 0, 834, 843), b(1666, 843, 834, 843),
    ],
  },
  {
    key: 'RICH_MENU_TEMPLATE_205',
    sizeName: 'large',
    size: LARGE,
    bounds: [b(0, 0, 2500, 843), b(0, 843, 2500, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_206',
    sizeName: 'large',
    size: LARGE,
    bounds: [b(0, 0, 1250, 1686), b(1250, 0, 1250, 1686)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_207',
    sizeName: 'large',
    size: LARGE,
    bounds: [b(0, 0, 2500, 1686)],
  },
  // ---- compact 2500x843 ----
  {
    key: 'RICH_MENU_TEMPLATE_101',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 833, 843), b(833, 0, 834, 843), b(1667, 0, 833, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_102',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 1250, 843), b(1250, 0, 1250, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_103',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 1667, 843), b(1667, 0, 833, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_104',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 833, 843), b(833, 0, 1667, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_105',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 2500, 843)],
  },
]

export const TEMPLATES: Record<string, TemplateDef> = Object.fromEntries(
  defs.map((d) => [d.key, d]),
)
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/templates.test.ts`
Expected: PASS 5 tests

หมายเหตุ: ถ้า test "ปูเต็มพอดี" ล้ม แปลว่าพิกัดพอร์ตมาผิด **ห้ามแก้ test ให้หย่อนลง** ให้กลับไปแก้พิกัดใน `templates.ts`

- [ ] **Step 6: export ออกจาก index**

`packages/core/src/index.ts`
```ts
export * from './types.js'
export * from './templates.js'
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/templates.ts packages/core/src/index.ts packages/core/tests/templates.test.ts
git commit -m "feat(core): add domain types and 12-template catalog with tiling invariant tests"
```

---

## Task 3: Error taxonomy

**Files:**
- Create: `packages/core/src/errors.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/errors.test.ts`

**Interfaces:**
- Consumes: ไม่มี
- Produces:
  - `abstract class CoreError extends Error { readonly code: string }`
  - `class ValidationError`, `class LineAuthError`, `class LineRateLimitError`, `class LineValidationError`, `class LineServerError`, `class ImageTooLargeError`, `class UnsupportedImageError`, `class ImageBombError`, `class CryptoEnvelopeError`
  - ทุกตัวมี `code` เป็น string คงที่ ใช้เป็นคีย์ i18n ฝั่ง UI

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/errors.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import {
  CoreError, ImageTooLargeError, LineRateLimitError, ValidationError,
} from '../src/errors.js'

describe('error taxonomy', () => {
  it('ทุก error มี code ที่ใช้เป็นคีย์ i18n ได้', () => {
    expect(new ValidationError('x').code).toBe('validation_failed')
    expect(new LineRateLimitError(30).code).toBe('line_rate_limited')
    expect(new ImageTooLargeError(2_000_000).code).toBe('image_too_large')
  })

  it('เป็นลูกของ CoreError และ Error ทั้งหมด', () => {
    const e = new ValidationError('x')
    expect(e).toBeInstanceOf(CoreError)
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('ValidationError')
  })

  it('error ของ rate limit พก retryAfterSeconds มาด้วย', () => {
    expect(new LineRateLimitError(45).retryAfterSeconds).toBe(45)
  })

  it('error ของรูปใหญ่เกินบอกขนาดจริงที่ได้ เพื่อให้ผู้ใช้รู้ว่าห่างแค่ไหน', () => {
    expect(new ImageTooLargeError(2_000_000).actualBytes).toBe(2_000_000)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/errors.test.ts`
Expected: FAIL — `Cannot find module '../src/errors.js'`

- [ ] **Step 3: เขียน `errors.ts`**

`packages/core/src/errors.ts`
```ts
export abstract class CoreError extends Error {
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends CoreError {
  readonly code = 'validation_failed'
  constructor(message: string, readonly issues: readonly string[] = []) {
    super(message)
  }
}

export class LineAuthError extends CoreError {
  readonly code = 'line_auth_failed'
}

export class LineRateLimitError extends CoreError {
  readonly code = 'line_rate_limited'
  constructor(readonly retryAfterSeconds: number) {
    super(`LINE rate limited, retry after ${retryAfterSeconds}s`)
  }
}

/** LINE ปฏิเสธ payload — ข้อความจาก LINE เก็บไว้ใน details ไม่ส่งต่อขึ้น UI ดิบ ๆ */
export class LineValidationError extends CoreError {
  readonly code = 'line_rejected_payload'
  constructor(readonly details: readonly string[] = []) {
    super('LINE rejected the rich menu payload')
  }
}

export class LineServerError extends CoreError {
  readonly code = 'line_server_error'
  constructor(readonly status: number) {
    super(`LINE returned ${status}`)
  }
}

export class UnsupportedImageError extends CoreError {
  readonly code = 'image_unsupported_format'
  constructor(readonly detectedFormat: string | undefined) {
    super(`Unsupported image format: ${detectedFormat ?? 'unknown'}`)
  }
}

export class ImageTooLargeError extends CoreError {
  readonly code = 'image_too_large'
  constructor(readonly actualBytes: number) {
    super(`Image is ${actualBytes} bytes after all compression attempts`)
  }
}

export class ImageBombError extends CoreError {
  readonly code = 'image_pixel_limit_exceeded'
  constructor(readonly pixels: number) {
    super(`Image declares ${pixels} pixels which exceeds the safety limit`)
  }
}

export class CryptoEnvelopeError extends CoreError {
  readonly code = 'crypto_envelope_invalid'
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/errors.test.ts`
Expected: PASS 4 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/errors.ts packages/core/tests/errors.test.ts
git commit -m "feat(core): add typed error taxonomy with i18n-ready codes"
```

---

## Task 4: zod schema + ยามกัน URI scheme อันตราย

**Files:**
- Create: `packages/core/src/schema.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/schema.test.ts`

**Interfaces:**
- Consumes: `types.ts` (Task 2), `errors.ts` (Task 3)
- Produces:
  - `const richMenuPayloadSchema: z.ZodType<RichMenuPayload>`
  - `function validateRichMenu(input: unknown): RichMenuPayload` — โยน `ValidationError` พร้อม `issues`
  - `const ALLOWED_URI_SCHEMES: readonly string[]`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/schema.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { ValidationError } from '../src/errors.js'
import { validateRichMenu } from '../src/schema.js'

const base = {
  size: { width: 2500, height: 1686 },
  selected: false,
  name: 'เมนูหลัก',
  chatBarText: 'เมนู',
  areas: [
    { bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } },
  ],
}

describe('validateRichMenu', () => {
  it('ผ่านสำหรับ payload ที่ถูกต้อง', () => {
    expect(validateRichMenu(base).name).toBe('เมนูหลัก')
  })

  it('ปฏิเสธ chatBarText ที่ยาวเกิน 14 ตัว', () => {
    expect(() => validateRichMenu({ ...base, chatBarText: 'x'.repeat(15) }))
      .toThrow(ValidationError)
  })

  it('ปฏิเสธ chatBarText ว่าง', () => {
    expect(() => validateRichMenu({ ...base, chatBarText: '' })).toThrow(ValidationError)
  })

  it('ปฏิเสธเมื่อมีช่องเกิน 20', () => {
    const areas = Array.from({ length: 21 }, () => base.areas[0])
    expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
  })

  it('ปฏิเสธเมื่อไม่มีช่องเลย', () => {
    expect(() => validateRichMenu({ ...base, areas: [] })).toThrow(ValidationError)
  })

  it('ปฏิเสธช่องที่ล้นออกนอกผืนผ้าใบ', () => {
    const areas = [{ ...base.areas[0], bounds: { x: 2000, y: 0, width: 1000, height: 100 } }]
    expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
  })

  it('ยอมให้ช่องซ้อนทับกันได้ เพราะ LINE อนุญาต', () => {
    const areas = [
      { bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'a' } },
      { bounds: { x: 0, y: 0, width: 100, height: 100 }, action: { type: 'message', text: 'b' } },
    ]
    expect(() => validateRichMenu({ ...base, areas })).not.toThrow()
  })

  it('ปฏิเสธขนาดผืนผ้าใบที่ LINE ไม่รับ', () => {
    expect(() => validateRichMenu({ ...base, size: { width: 1000, height: 1000 } }))
      .toThrow(ValidationError)
  })

  describe.each(['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd'])(
    'ยามกัน URI อันตราย: %s',
    (uri) => {
      it('ถูกปฏิเสธ', () => {
        const areas = [{ ...base.areas[0], action: { type: 'uri', uri } }]
        expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
      })
    },
  )

  describe.each(['https://example.com', 'http://example.com', 'tel:0812345678', 'line://ti/p/@abc'])(
    'URI ที่อนุญาต: %s',
    (uri) => {
      it('ผ่าน', () => {
        const areas = [{ ...base.areas[0], action: { type: 'uri', uri } }]
        expect(() => validateRichMenu({ ...base, areas })).not.toThrow()
      })
    },
  )

  it('ปฏิเสธ postback.data ที่ยาวเกิน 300 ตัว', () => {
    const areas = [{ ...base.areas[0], action: { type: 'postback', data: 'x'.repeat(301) } }]
    expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
  })

  it('ปฏิเสธฟิลด์แปลกปลอมที่ไม่มีในสเปก', () => {
    expect(() => validateRichMenu({ ...base, sneaky: true })).toThrow(ValidationError)
  })

  it('ใส่รายละเอียดข้อผิดพลาดมาใน issues ให้ UI เอาไปแสดงได้', () => {
    try {
      validateRichMenu({ ...base, chatBarText: '' })
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      expect((e as ValidationError).issues.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/schema.test.ts`
Expected: FAIL — `Cannot find module '../src/schema.js'`

- [ ] **Step 3: เขียน `schema.ts`**

`packages/core/src/schema.ts`
```ts
import { z } from 'zod'
import { ValidationError } from './errors.js'
import type { RichMenuPayload } from './types.js'

export const ALLOWED_URI_SCHEMES = ['https:', 'http:', 'tel:', 'line:'] as const

const ALLOWED_CANVAS = [
  '2500x1686', '2500x843', '1200x810', '1200x405', '800x540', '800x270',
] as const

const uriString = z.string().min(1).max(1000).refine((value) => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return (ALLOWED_URI_SCHEMES as readonly string[]).includes(parsed.protocol)
}, { message: 'uri ต้องขึ้นต้นด้วย https, http, tel หรือ line เท่านั้น' })

const label = z.string().min(1).max(20).optional()

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('postback'), label, data: z.string().min(1).max(300), displayText: z.string().max(300).optional() }).strict(),
  z.object({ type: z.literal('message'), label, text: z.string().min(1).max(300) }).strict(),
  z.object({ type: z.literal('uri'), label, uri: uriString, altUri: z.object({ desktop: uriString }).strict().optional() }).strict(),
  z.object({
    type: z.literal('datetimepicker'), label, data: z.string().min(1).max(300),
    mode: z.enum(['date', 'time', 'datetime']),
    initial: z.string().optional(), max: z.string().optional(), min: z.string().optional(),
  }).strict(),
  z.object({ type: z.literal('camera'), label: z.string().min(1).max(20) }).strict(),
  z.object({ type: z.literal('cameraRoll'), label: z.string().min(1).max(20) }).strict(),
  z.object({ type: z.literal('location'), label: z.string().min(1).max(20) }).strict(),
  z.object({ type: z.literal('richmenuswitch'), label, richMenuAliasId: z.string().min(1).max(32).regex(/^[a-z0-9_-]+$/), data: z.string().min(1).max(300) }).strict(),
  z.object({ type: z.literal('clipboard'), label, clipboardText: z.string().min(1).max(1000) }).strict(),
])

const boundsSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict()

const sizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict().refine(
  (s) => (ALLOWED_CANVAS as readonly string[]).includes(`${s.width}x${s.height}`),
  { message: 'ขนาดผืนผ้าใบต้องเป็นขนาดที่ LINE รับเท่านั้น' },
)

export const richMenuPayloadSchema = z.object({
  size: sizeSchema,
  selected: z.boolean(),
  name: z.string().min(1).max(300),
  chatBarText: z.string().min(1).max(14),
  areas: z.array(z.object({ bounds: boundsSchema, action: actionSchema }).strict()).min(1).max(20),
}).strict().superRefine((value, ctx) => {
  value.areas.forEach((area, index) => {
    const { x, y, width, height } = area.bounds
    if (x + width > value.size.width || y + height > value.size.height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['areas', index, 'bounds'],
        message: 'ช่องนี้ล้นออกนอกผืนผ้าใบ',
      })
    }
  })
})

export function validateRichMenu(input: unknown): RichMenuPayload {
  const result = richMenuPayloadSchema.safeParse(input)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new ValidationError('rich menu payload ไม่ผ่านการตรวจสอบ', issues)
  }
  return result.data as RichMenuPayload
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/schema.test.ts`
Expected: PASS ทุกเคส รวมทั้ง block ที่กระจายด้วย `describe.each` (อย่ายึดตัวเลขจำนวนเทสต์ ให้ดูว่าไม่มีตัวไหนแดง)

- [ ] **Step 5: เพิ่ม property test กันเคสที่คิดไม่ถึง**

ติดตั้ง: `pnpm add -D -w fast-check`

เพิ่มท้าย `packages/core/tests/schema.test.ts`
```ts
import fc from 'fast-check'

describe('property: bounds ที่ล้นกรอบต้องถูกปฏิเสธเสมอ', () => {
  it('ไม่ว่าจะสุ่มยังไง ถ้า x+width เกิน 2500 ต้องไม่ผ่าน', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2500 }),
        fc.integer({ min: 1, max: 5000 }),
        (x, width) => {
          fc.pre(x + width > 2500)
          const areas = [{
            bounds: { x, y: 0, width, height: 100 },
            action: { type: 'message', text: 'hi' },
          }]
          expect(() => validateRichMenu({ ...base, areas })).toThrow(ValidationError)
        },
      ),
      { numRuns: 300 },
    )
  })
})
```

- [ ] **Step 6: รัน property test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/schema.test.ts`
Expected: PASS ทั้งหมด ถ้ามี counterexample ให้แก้ `schema.ts` ไม่ใช่แก้ test

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/schema.ts packages/core/tests/schema.test.ts package.json pnpm-lock.yaml
git commit -m "feat(core): add zod validation with URI scheme allowlist and bounds property tests"
```

---

## Task 5: Crypto envelope สำหรับความลับของ channel

**Files:**
- Create: `packages/core/src/crypto.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/crypto.test.ts`

**Interfaces:**
- Consumes: `errors.ts` (Task 3)
- Produces:
  - `function deriveKey(secret: string): Buffer` — HKDF-SHA256 → 32 bytes
  - `function encryptSecret(plaintext: string, key: Buffer): string` — คืน `v1.<iv>.<tag>.<ct>` (base64url)
  - `function decryptSecret(envelope: string, key: Buffer): string` — โยน `CryptoEnvelopeError` ถ้ารูปแบบผิดหรือถูกแก้ไข
  - `function redactSecret(plaintext: string): string` — คืน `••••••••` + 4 ตัวท้าย

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/crypto.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { CryptoEnvelopeError } from '../src/errors.js'
import { decryptSecret, deriveKey, encryptSecret, redactSecret } from '../src/crypto.js'

const key = deriveKey('app-key-หนึ่ง-ที่ยาวพอสมควร')

describe('crypto envelope', () => {
  it('เข้ารหัสแล้วถอดกลับได้ค่าเดิม', () => {
    const token = 'channel-access-token-abcdef123456'
    expect(decryptSecret(encryptSecret(token, key), key)).toBe(token)
  })

  it('ciphertext ไม่มีข้อความต้นฉบับปรากฏอยู่เลย', () => {
    const token = 'super-secret-token'
    expect(encryptSecret(token, key)).not.toContain(token)
  })

  it('IV ต่างกันทุกครั้ง แม้เข้ารหัสข้อความเดียวกัน', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(encryptSecret('same', key).split('.')[1]!)
    expect(seen.size).toBe(200)
  })

  it('ถ้า ciphertext ถูกแก้แม้ไบต์เดียว ต้องถอดไม่ผ่าน (auth tag ทำงาน)', () => {
    const env = encryptSecret('tamper-me', key)
    const parts = env.split('.')
    const ct = Buffer.from(parts[3]!, 'base64url')
    ct[0] = ct[0]! ^ 0x01
    const tampered = [parts[0], parts[1], parts[2], ct.toString('base64url')].join('.')
    expect(() => decryptSecret(tampered, key)).toThrow(CryptoEnvelopeError)
  })

  it('ถ้า auth tag ถูกแก้ ต้องถอดไม่ผ่าน', () => {
    const parts = encryptSecret('tamper-tag', key).split('.')
    const tag = Buffer.from(parts[2]!, 'base64url')
    tag[0] = tag[0]! ^ 0x01
    const tampered = [parts[0], parts[1], tag.toString('base64url'), parts[3]].join('.')
    expect(() => decryptSecret(tampered, key)).toThrow(CryptoEnvelopeError)
  })

  it('ถอดด้วย key ผิดต้องไม่ผ่าน', () => {
    const env = encryptSecret('x', key)
    expect(() => decryptSecret(env, deriveKey('อีก key หนึ่ง'))).toThrow(CryptoEnvelopeError)
  })

  it('ปฏิเสธ envelope ที่รูปแบบผิดหรือ version ไม่รู้จัก', () => {
    expect(() => decryptSecret('ไม่ใช่ envelope', key)).toThrow(CryptoEnvelopeError)
    expect(() => decryptSecret('v9.a.b.c', key)).toThrow(CryptoEnvelopeError)
  })

  it('deriveKey ให้ผลคงที่สำหรับ secret เดิม และยาว 32 ไบต์', () => {
    expect(deriveKey('abc').equals(deriveKey('abc'))).toBe(true)
    expect(deriveKey('abc')).toHaveLength(32)
    expect(deriveKey('abc').equals(deriveKey('abd'))).toBe(false)
  })

  it('redactSecret โชว์แค่ 4 ตัวท้าย', () => {
    expect(redactSecret('abcdefghijkl')).toBe('••••••••ijkl')
    expect(redactSecret('abc')).toBe('••••••••')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/crypto.test.ts`
Expected: FAIL — `Cannot find module '../src/crypto.js'`

- [ ] **Step 3: เขียน `crypto.ts`**

`packages/core/src/crypto.ts`
```ts
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { CryptoEnvelopeError } from './errors.js'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const KEY_BYTES = 32
const HKDF_INFO = 'line-rich-menu:secretbox:v1'

export function deriveKey(secret: string): Buffer {
  const derived = hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.alloc(0),
    Buffer.from(HKDF_INFO, 'utf8'),
    KEY_BYTES,
  )
  return Buffer.from(derived)
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptSecret(envelope: string, key: Buffer): string {
  const parts = envelope.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new CryptoEnvelopeError('รูปแบบ envelope ไม่ถูกต้องหรือเป็นเวอร์ชันที่ไม่รองรับ')
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(parts[1]!, 'base64url'))
    decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3]!, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // ไม่ส่งต่อ error เดิม เพราะอาจมีข้อมูลที่ไม่ควรหลุด
    throw new CryptoEnvelopeError('ถอดรหัสไม่สำเร็จ — ข้อมูลถูกแก้ไขหรือ key ไม่ตรง')
  }
}

export function redactSecret(plaintext: string): string {
  return plaintext.length > 4 ? `••••••••${plaintext.slice(-4)}` : '••••••••'
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/crypto.test.ts`
Expected: PASS 9 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/crypto.ts packages/core/tests/crypto.test.ts
git commit -m "feat(core): add AES-256-GCM secret envelope with per-record IV and tamper detection"
```

---

## Task 6: URL builder ของ LINE API (ไม่มี I/O)

**Files:**
- Create: `packages/core/src/line/endpoints.ts`
- Test: `packages/core/tests/line/endpoints.test.ts`

**Interfaces:**
- Consumes: ไม่มี
- Produces:
  - `const DEFAULT_API_BASE = 'https://api.line.me'`
  - `const DEFAULT_API_DATA_BASE = 'https://api-data.line.me'`
  - `const endpoints` — object ของฟังก์ชันประกอบ URL ทุกเส้น

แยกออกมาเป็นไฟล์ของตัวเองเพราะการประกอบ URL คือจุดที่ path injection เกิดได้ ต้องมีชุดเทสต์เฉพาะ

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/line/endpoints.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_API_BASE, DEFAULT_API_DATA_BASE, endpoints } from '../../src/line/endpoints.js'

const B = DEFAULT_API_BASE
const D = DEFAULT_API_DATA_BASE

describe('endpoints', () => {
  it('ประกอบ URL ได้ถูกต้องทุกเส้น', () => {
    expect(endpoints.createRichMenu(B)).toBe('https://api.line.me/v2/bot/richmenu')
    expect(endpoints.validateRichMenu(B)).toBe('https://api.line.me/v2/bot/richmenu/validate')
    expect(endpoints.richMenu(B, 'rm-1')).toBe('https://api.line.me/v2/bot/richmenu/rm-1')
    expect(endpoints.richMenuList(B)).toBe('https://api.line.me/v2/bot/richmenu/list')
    expect(endpoints.uploadContent(D, 'rm-1')).toBe('https://api-data.line.me/v2/bot/richmenu/rm-1/content')
    expect(endpoints.setDefault(B, 'rm-1')).toBe('https://api.line.me/v2/bot/user/all/richmenu/rm-1')
    expect(endpoints.clearDefault(B)).toBe('https://api.line.me/v2/bot/user/all/richmenu')
    expect(endpoints.alias(B)).toBe('https://api.line.me/v2/bot/richmenu/alias')
    expect(endpoints.aliasById(B, 'tab-a')).toBe('https://api.line.me/v2/bot/richmenu/alias/tab-a')
    expect(endpoints.aliasList(B)).toBe('https://api.line.me/v2/bot/richmenu/alias/list')
    expect(endpoints.botInfo(B)).toBe('https://api.line.me/v2/bot/info')
    expect(endpoints.userRichMenu(B, 'U123', 'rm-1')).toBe('https://api.line.me/v2/bot/user/U123/richmenu/rm-1')
  })

  it('เข้ารหัสค่าที่มาจากผู้ใช้ กัน path traversal', () => {
    expect(endpoints.richMenu(B, '../../admin')).toBe('https://api.line.me/v2/bot/richmenu/..%2F..%2Fadmin')
    expect(endpoints.aliasById(B, 'a/b')).toBe('https://api.line.me/v2/bot/richmenu/alias/a%2Fb')
    expect(endpoints.userRichMenu(B, 'U/1', 'r?x=1')).toBe('https://api.line.me/v2/bot/user/U%2F1/richmenu/r%3Fx%3D1')
  })

  it('รองรับ base URL ที่ชี้ไป line-mock ตอนทดสอบ', () => {
    expect(endpoints.createRichMenu('http://127.0.0.1:4010')).toBe('http://127.0.0.1:4010/v2/bot/richmenu')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/line/endpoints.test.ts`
Expected: FAIL — `Cannot find module '../../src/line/endpoints.js'`

- [ ] **Step 3: เขียน `endpoints.ts`**

`packages/core/src/line/endpoints.ts`
```ts
export const DEFAULT_API_BASE = 'https://api.line.me'
export const DEFAULT_API_DATA_BASE = 'https://api-data.line.me'

const e = encodeURIComponent

export const endpoints = {
  createRichMenu: (base: string) => `${base}/v2/bot/richmenu`,
  validateRichMenu: (base: string) => `${base}/v2/bot/richmenu/validate`,
  richMenu: (base: string, id: string) => `${base}/v2/bot/richmenu/${e(id)}`,
  richMenuList: (base: string) => `${base}/v2/bot/richmenu/list`,
  uploadContent: (dataBase: string, id: string) => `${dataBase}/v2/bot/richmenu/${e(id)}/content`,
  setDefault: (base: string, id: string) => `${base}/v2/bot/user/all/richmenu/${e(id)}`,
  clearDefault: (base: string) => `${base}/v2/bot/user/all/richmenu`,
  alias: (base: string) => `${base}/v2/bot/richmenu/alias`,
  aliasById: (base: string, aliasId: string) => `${base}/v2/bot/richmenu/alias/${e(aliasId)}`,
  aliasList: (base: string) => `${base}/v2/bot/richmenu/alias/list`,
  botInfo: (base: string) => `${base}/v2/bot/info`,
  userRichMenu: (base: string, userId: string, id: string) =>
    `${base}/v2/bot/user/${e(userId)}/richmenu/${e(id)}`,
} as const
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/line/endpoints.test.ts`
Expected: PASS 3 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/line/endpoints.ts packages/core/tests/line/endpoints.test.ts
git commit -m "feat(core): add LINE endpoint builders with path-injection tests"
```

---

## Task 7: LineClient — เส้นทางปกติทุก endpoint

**Files:**
- Create: `packages/core/src/line/client.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/line/client.test.ts`

**Interfaces:**
- Consumes: `endpoints.ts` (Task 6), `errors.ts` (Task 3), `types.ts` (Task 2)
- Produces:
  - `interface LineClientOptions { accessToken: string; apiBaseUrl?: string; apiDataBaseUrl?: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; maxAttempts?: number }`
  - `class LineClient` มีเมธอด: `validateRichMenu(payload)`, `createRichMenu(payload): Promise<string>`, `uploadContent(id, buffer, mime)`, `setDefault(id)`, `clearDefault()`, `getRichMenu(id)`, `listRichMenus()`, `deleteRichMenu(id)`, `createAlias(aliasId, richMenuId)`, `updateAlias(aliasId, richMenuId)`, `deleteAlias(aliasId)`, `listAliases()`, `getBotInfo()`, `linkToUser(userId, richMenuId)`

- [ ] **Step 1: ติดตั้ง msw**

Run: `pnpm add -D -w msw@^2.4.0`

- [ ] **Step 2: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/line/client.test.ts`
```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LineClient } from '../../src/line/client.js'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// จงใจสร้างที่ module scope ไม่ใช่ใน beforeAll — ถ้า LineClient กลับไปจับ globalThis.fetch
// ตอน constructor เมื่อไหร่ เทสต์ชุดนี้จะแดงทันที แทนที่จะหลุดไปยิง LINE ของจริงเงียบ ๆ
const client = new LineClient({ accessToken: 'test-token' })

const payload = {
  size: { width: 2500, height: 1686 },
  selected: false,
  name: 'menu',
  chatBarText: 'menu',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message' as const, text: 'hi' } }],
}

describe('LineClient เส้นทางปกติ', () => {
  it('แนบ Authorization header ที่ถูกต้อง', async () => {
    let seen: string | null = null
    server.use(http.post('https://api.line.me/v2/bot/richmenu', ({ request }) => {
      seen = request.headers.get('authorization')
      return HttpResponse.json({ richMenuId: 'rm-1' })
    }))
    await client.createRichMenu(payload)
    expect(seen).toBe('Bearer test-token')
  })

  it('createRichMenu คืน richMenuId', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      HttpResponse.json({ richMenuId: 'rm-42' })))
    expect(await client.createRichMenu(payload)).toBe('rm-42')
  })

  it('validateRichMenu ผ่านเมื่อ LINE ตอบ 200', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu/validate', () =>
      new HttpResponse(null, { status: 200 })))
    await expect(client.validateRichMenu(payload)).resolves.toBeUndefined()
  })

  it('uploadContent ยิงไป api-data พร้อม Content-Type ของรูป', async () => {
    let contentType: string | null = null
    let bodyLength = 0
    server.use(http.post('https://api-data.line.me/v2/bot/richmenu/rm-1/content', async ({ request }) => {
      contentType = request.headers.get('content-type')
      bodyLength = (await request.arrayBuffer()).byteLength
      return new HttpResponse(null, { status: 200 })
    }))
    await client.uploadContent('rm-1', Buffer.from([1, 2, 3, 4]), 'image/png')
    expect(contentType).toBe('image/png')
    expect(bodyLength).toBe(4)
  })

  it('setDefault และ clearDefault ยิงถูกเส้น', async () => {
    let called: string[] = []
    server.use(
      http.post('https://api.line.me/v2/bot/user/all/richmenu/rm-1', () => {
        called.push('set'); return new HttpResponse(null, { status: 200 })
      }),
      http.delete('https://api.line.me/v2/bot/user/all/richmenu', () => {
        called.push('clear'); return new HttpResponse(null, { status: 200 })
      }),
    )
    await client.setDefault('rm-1')
    await client.clearDefault()
    expect(called).toEqual(['set', 'clear'])
  })

  it('listRichMenus คืนอาเรย์จากฟิลด์ richmenus', async () => {
    server.use(http.get('https://api.line.me/v2/bot/richmenu/list', () =>
      HttpResponse.json({ richmenus: [{ richMenuId: 'a' }, { richMenuId: 'b' }] })))
    expect(await client.listRichMenus()).toHaveLength(2)
  })

  it('alias สร้าง อัปเดต ลบ และ list ได้', async () => {
    const calls: string[] = []
    server.use(
      http.post('https://api.line.me/v2/bot/richmenu/alias', () => {
        calls.push('create'); return HttpResponse.json({})
      }),
      http.post('https://api.line.me/v2/bot/richmenu/alias/tab-a', () => {
        calls.push('update'); return HttpResponse.json({})
      }),
      http.delete('https://api.line.me/v2/bot/richmenu/alias/tab-a', () => {
        calls.push('delete'); return HttpResponse.json({})
      }),
      http.get('https://api.line.me/v2/bot/richmenu/alias/list', () =>
        HttpResponse.json({ aliases: [{ richMenuAliasId: 'tab-a', richMenuId: 'rm-1' }] })),
    )
    await client.createAlias('tab-a', 'rm-1')
    await client.updateAlias('tab-a', 'rm-2')
    await client.deleteAlias('tab-a')
    expect(await client.listAliases()).toHaveLength(1)
    expect(calls).toEqual(['create', 'update', 'delete'])
  })

  it('getBotInfo คืนข้อมูล OA สำหรับปุ่ม Test connection', async () => {
    server.use(http.get('https://api.line.me/v2/bot/info', () =>
      HttpResponse.json({ userId: 'U1', basicId: '@abc', displayName: 'ร้านทดสอบ' })))
    expect((await client.getBotInfo()).displayName).toBe('ร้านทดสอบ')
  })

  it('ใช้ globalThis.fetch ตอนเรียก ไม่ใช่ตอนสร้าง — ไม่งั้น interceptor ที่ติดตั้งทีหลังจะถูกข้าม', async () => {
    const original = globalThis.fetch
    const stub = vi.fn(async () => HttpResponse.json({ richMenuId: 'rm-stub' }))
    try {
      globalThis.fetch = stub as unknown as typeof fetch
      // client ตัวนี้ถูกสร้างไปตั้งแต่ module scope ก่อนที่ stub จะถูกติดตั้ง
      expect(await client.createRichMenu(payload)).toBe('rm-stub')
      expect(stub).toHaveBeenCalledOnce()
    } finally {
      globalThis.fetch = original
    }
  })

  it('ชี้ base URL ไป line-mock ได้', async () => {
    const local = new LineClient({ accessToken: 't', apiBaseUrl: 'http://127.0.0.1:4010' })
    server.use(http.post('http://127.0.0.1:4010/v2/bot/richmenu', () =>
      HttpResponse.json({ richMenuId: 'local-1' })))
    expect(await local.createRichMenu(payload)).toBe('local-1')
  })
})
```

- [ ] **Step 3: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/line/client.test.ts`
Expected: FAIL — `Cannot find module '../../src/line/client.js'`

- [ ] **Step 4: เขียน `client.ts`**

`packages/core/src/line/client.ts`
```ts
import {
  LineAuthError, LineRateLimitError, LineServerError, LineValidationError,
} from '../errors.js'
import type { RichMenuPayload } from '../types.js'
import { DEFAULT_API_BASE, DEFAULT_API_DATA_BASE, endpoints } from './endpoints.js'

export interface LineClientOptions {
  accessToken: string
  apiBaseUrl?: string
  apiDataBaseUrl?: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxAttempts?: number
}

export interface BotInfo {
  userId: string
  basicId: string
  displayName: string
  pictureUrl?: string
}

export interface RichMenuSummary {
  richMenuId: string
  name?: string
  chatBarText?: string
}

export interface AliasSummary {
  richMenuAliasId: string
  richMenuId: string
}

interface RequestSpec {
  method: 'GET' | 'POST' | 'DELETE'
  url: string
  body?: BodyInit
  contentType?: string
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class LineClient {
  readonly #token: string
  readonly #base: string
  readonly #dataBase: string
  readonly #fetch: typeof fetch | undefined
  readonly #sleep: (ms: number) => Promise<void>
  readonly #maxAttempts: number

  constructor(options: LineClientOptions) {
    this.#token = options.accessToken
    this.#base = options.apiBaseUrl ?? DEFAULT_API_BASE
    this.#dataBase = options.apiDataBaseUrl ?? DEFAULT_API_DATA_BASE
    // เก็บเฉพาะตัวที่ถูกฉีดเข้ามา — ห้ามจับ globalThis.fetch ตรงนี้ ดูเหตุผลใน #send
    this.#fetch = options.fetchImpl
    this.#sleep = options.sleep ?? defaultSleep
    this.#maxAttempts = options.maxAttempts ?? 3
  }

  async validateRichMenu(payload: RichMenuPayload): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.validateRichMenu(this.#base), body: JSON.stringify(payload), contentType: 'application/json' })
  }

  async createRichMenu(payload: RichMenuPayload): Promise<string> {
    const res = await this.#send({ method: 'POST', url: endpoints.createRichMenu(this.#base), body: JSON.stringify(payload), contentType: 'application/json' })
    const json = (await res.json()) as { richMenuId: string }
    return json.richMenuId
  }

  async uploadContent(richMenuId: string, image: Buffer, mime: 'image/png' | 'image/jpeg'): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.uploadContent(this.#dataBase, richMenuId), body: new Uint8Array(image), contentType: mime })
  }

  async setDefault(richMenuId: string): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.setDefault(this.#base, richMenuId) })
  }

  async clearDefault(): Promise<void> {
    await this.#send({ method: 'DELETE', url: endpoints.clearDefault(this.#base) })
  }

  async getRichMenu(richMenuId: string): Promise<RichMenuSummary> {
    const res = await this.#send({ method: 'GET', url: endpoints.richMenu(this.#base, richMenuId) })
    return (await res.json()) as RichMenuSummary
  }

  async listRichMenus(): Promise<RichMenuSummary[]> {
    const res = await this.#send({ method: 'GET', url: endpoints.richMenuList(this.#base) })
    const json = (await res.json()) as { richmenus?: RichMenuSummary[] }
    return json.richmenus ?? []
  }

  async deleteRichMenu(richMenuId: string): Promise<void> {
    await this.#send({ method: 'DELETE', url: endpoints.richMenu(this.#base, richMenuId) })
  }

  async createAlias(aliasId: string, richMenuId: string): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.alias(this.#base), body: JSON.stringify({ richMenuAliasId: aliasId, richMenuId }), contentType: 'application/json' })
  }

  async updateAlias(aliasId: string, richMenuId: string): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.aliasById(this.#base, aliasId), body: JSON.stringify({ richMenuId }), contentType: 'application/json' })
  }

  async deleteAlias(aliasId: string): Promise<void> {
    await this.#send({ method: 'DELETE', url: endpoints.aliasById(this.#base, aliasId) })
  }

  async listAliases(): Promise<AliasSummary[]> {
    const res = await this.#send({ method: 'GET', url: endpoints.aliasList(this.#base) })
    const json = (await res.json()) as { aliases?: AliasSummary[] }
    return json.aliases ?? []
  }

  async getBotInfo(): Promise<BotInfo> {
    const res = await this.#send({ method: 'GET', url: endpoints.botInfo(this.#base) })
    return (await res.json()) as BotInfo
  }

  async linkToUser(userId: string, richMenuId: string): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.userRichMenu(this.#base, userId, richMenuId) })
  }

  async #send(spec: RequestSpec): Promise<Response> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt++) {
      const headers: Record<string, string> = { authorization: `Bearer ${this.#token}` }
      if (spec.contentType) headers['content-type'] = spec.contentType

      // หา fetch ตอนเรียก ไม่ใช่ตอนสร้าง object
      // ถ้าจับไว้ตั้งแต่ constructor ตัว interceptor ที่ติดตั้งทีหลัง (msw, undici MockAgent,
      // OpenTelemetry, proxy agent ที่ตั้งใน bootstrap ของ Strapi) จะถูกข้ามทั้งหมด
      // ซึ่งแปลว่า client ที่ควรถูกดักไว้จะหลุดออกไปยิง LINE ของจริงเงียบ ๆ
      const fetchImpl = this.#fetch ?? globalThis.fetch
      const res = await fetchImpl(spec.url, {
        method: spec.method,
        headers,
        ...(spec.body === undefined ? {} : { body: spec.body }),
      })

      if (res.ok) return res

      const error = await this.#toError(res)
      const retryable = error instanceof LineRateLimitError || error instanceof LineServerError
      if (!retryable || attempt === this.#maxAttempts) throw error

      lastError = error
      const waitMs = error instanceof LineRateLimitError
        ? error.retryAfterSeconds * 1000
        : 500 * 2 ** (attempt - 1)
      await this.#sleep(waitMs)
    }
    throw lastError
  }

  async #toError(res: Response): Promise<Error> {
    if (res.status === 401 || res.status === 403) return new LineAuthError('LINE ปฏิเสธ credential')
    if (res.status === 429) {
      const header = res.headers.get('retry-after')
      const seconds = header ? Number.parseInt(header, 10) : 1
      return new LineRateLimitError(Number.isFinite(seconds) ? seconds : 1)
    }
    if (res.status >= 500) return new LineServerError(res.status)

    // 4xx อื่น ๆ ถือเป็น payload ผิด — เก็บรายละเอียดไว้ใน details ไม่โยนข้อความดิบขึ้น UI
    let details: string[] = []
    try {
      const json = (await res.json()) as { message?: string; details?: { message?: string; property?: string }[] }
      details = (json.details ?? [])
        .map((d) => [d.property, d.message].filter(Boolean).join(': '))
        .filter((s) => s.length > 0)
      if (details.length === 0 && json.message) details = [json.message]
    } catch {
      details = []
    }
    return new LineValidationError(details)
  }
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/line/client.test.ts`
Expected: PASS 9 tests

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/line/client.ts packages/core/tests/line/client.test.ts package.json pnpm-lock.yaml
git commit -m "feat(core): add LineClient covering all rich menu endpoints"
```

---

## Task 8: Retry, backoff และการแปลง error — รวมยามกัน token รั่ว

**Files:**
- Modify: `packages/core/src/line/client.ts` (ถ้าต้องแก้หลังเห็นผลเทสต์)
- Test: `packages/core/tests/line/retry.test.ts`

**Interfaces:**
- Consumes: `LineClient` (Task 7)
- Produces: ไม่มี API ใหม่ — ยืนยันพฤติกรรมที่ Task 7 ประกาศไว้

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/line/retry.test.ts`
```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  LineAuthError, LineRateLimitError, LineServerError, LineValidationError,
} from '../../src/errors.js'
import { LineClient } from '../../src/line/client.js'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const payload = {
  size: { width: 2500, height: 843 },
  selected: false,
  name: 'm',
  chatBarText: 'm',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'message' as const, text: 'hi' } }],
}

function makeClient(sleep = vi.fn(async () => {})) {
  return { client: new LineClient({ accessToken: 'secret-token-value', sleep }), sleep }
}

describe('retry และ backoff', () => {
  it('ลองใหม่เมื่อเจอ 500 แล้วสำเร็จในครั้งถัดไป', async () => {
    let hits = 0
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () => {
      hits++
      return hits < 3 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ richMenuId: 'rm-ok' })
    }))
    const { client } = makeClient()
    expect(await client.createRichMenu(payload)).toBe('rm-ok')
    expect(hits).toBe(3)
  })

  it('backoff เพิ่มเป็นเท่าตัว 500ms แล้ว 1000ms', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      new HttpResponse(null, { status: 503 })))
    const { client, sleep } = makeClient()
    await expect(client.createRichMenu(payload)).rejects.toBeInstanceOf(LineServerError)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000])
  })

  it('เคารพ Retry-After ตอนเจอ 429', async () => {
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
      new HttpResponse(null, { status: 429, headers: { 'retry-after': '7' } })))
    const { client, sleep } = makeClient()
    await expect(client.createRichMenu(payload)).rejects.toBeInstanceOf(LineRateLimitError)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([7000, 7000])
  })

  it('ไม่ลองใหม่เมื่อเจอ 401 — credential ผิดลองกี่ครั้งก็ผิด', async () => {
    let hits = 0
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () => {
      hits++
      return new HttpResponse(null, { status: 401 })
    }))
    const { client } = makeClient()
    await expect(client.createRichMenu(payload)).rejects.toBeInstanceOf(LineAuthError)
    expect(hits).toBe(1)
  })

  it('ไม่ลองใหม่เมื่อเจอ 400 และเก็บรายละเอียดไว้ใน details', async () => {
    let hits = 0
    server.use(http.post('https://api.line.me/v2/bot/richmenu', () => {
      hits++
      return HttpResponse.json(
        { message: 'invalid', details: [{ property: 'areas[0].bounds', message: 'out of range' }] },
        { status: 400 },
      )
    }))
    const { client } = makeClient()
    try {
      await client.createRichMenu(payload)
      expect.unreachable('ควรโยน error')
    } catch (e) {
      expect(e).toBeInstanceOf(LineValidationError)
      expect((e as LineValidationError).details).toEqual(['areas[0].bounds: out of range'])
    }
    expect(hits).toBe(1)
  })

  // ยามกัน token รั่ว — ข้อบังคับจาก spec 13.2 ข้อ 2 และ 3
  it('access token ต้องไม่ปรากฏใน message ของ error ทุกชนิด', async () => {
    const statuses = [400, 401, 429, 500]
    for (const status of statuses) {
      server.use(http.post('https://api.line.me/v2/bot/richmenu', () =>
        new HttpResponse(null, { status })))
      const { client } = makeClient()
      try {
        await client.createRichMenu(payload)
      } catch (e) {
        const dump = JSON.stringify({ message: (e as Error).message, ...(e as object) })
        expect(dump, `status ${status} ทำ token รั่ว`).not.toContain('secret-token-value')
      }
    }
  })
})
```

- [ ] **Step 2: รัน test**

Run: `pnpm vitest run packages/core/tests/line/retry.test.ts`
Expected: PASS ทั้งหมดถ้า Task 7 เขียนถูก ถ้าข้อไหนล้ม ให้แก้ `client.ts` **ห้ามแก้ test**

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/line/retry.test.ts packages/core/src/line/client.ts
git commit -m "test(core): cover retry, backoff, error mapping and token-leak guard"
```

---

## Task 9: ยามความปลอดภัยของรูป — magic byte และ decompression bomb

**Files:**
- Create: `packages/core/src/image/guards.ts`
- Create: `packages/core/tests/fixtures/make-fixtures.ts`
- Test: `packages/core/tests/image/guards.test.ts`

**Interfaces:**
- Consumes: `errors.ts` (Task 3)
- Produces:
  - `const MAX_INPUT_PIXELS = 100_000_000`
  - `const MAX_OUTPUT_BYTES = 1_048_576`
  - `interface ImageFacts { format: 'jpeg' | 'png'; width: number; height: number; hasAlpha: boolean }`
  - `async function inspectImage(input: Buffer): Promise<ImageFacts>` — โยน `UnsupportedImageError` / `ImageBombError`

- [ ] **Step 1: เขียนสคริปต์สร้าง fixture (ไม่ commit ไฟล์ binary ใหญ่)**

`packages/core/tests/fixtures/make-fixtures.ts`
```ts
import zlib from 'node:zlib'
import sharp from 'sharp'

/** รูปทึบสีเดียว — บีบง่ายมาก */
export async function solidJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 12, g: 90, b: 200 } } })
    .jpeg({ quality: 95 })
    .toBuffer()
}

/** noise เต็มเฟรม — บีบยากที่สุด ใช้ทดสอบว่าไล่ quality จริง */
export async function noisePng(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3)
  let seed = 1
  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    pixels[i] = seed & 0xff
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer()
}

/** PNG ที่มี alpha จริง */
export async function transparentPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.4 } } })
    .png()
    .toBuffer()
}

/**
 * PNG ที่ประกาศพิกเซลมหาศาลใน IHDR แต่ไฟล์เล็กนิดเดียว — decompression bomb ของจริง
 *
 * ห้ามสร้างด้วย sharp เพราะการสั่ง sharp วาดผืนผ้าใบ 25000x25000 จะจองหน่วยความจำ
 * ระดับกิกะไบต์ในเครื่องที่รันเทสต์เอง ซึ่งคือสิ่งที่เรากำลังจะทดสอบว่าต้องไม่เกิด
 * จึงประกอบ chunk เองให้ IHDR ประกาศขนาดใหญ่ ส่วน IDAT มีข้อมูลไม่กี่ไบต์
 */
export function pngBomb(width = 25000, height = 25000): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0)
    return Buffer.concat([length, typeBuf, data, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 0   // colour type: greyscale
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc(16))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ไฟล์ที่อ้างว่าเป็นรูปแต่เนื้อในไม่ใช่ */
export function fakeImage(): Buffer {
  return Buffer.from('นี่ไม่ใช่รูปภาพ แต่ตั้งชื่อว่า .png', 'utf8')
}
```

- [ ] **Step 2: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/image/guards.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { ImageBombError, UnsupportedImageError } from '../../src/errors.js'
import { MAX_INPUT_PIXELS, MAX_OUTPUT_BYTES, inspectImage } from '../../src/image/guards.js'
import { fakeImage, pngBomb, solidJpeg, transparentPng } from '../fixtures/make-fixtures.js'

describe('ยามความปลอดภัยของรูป', () => {
  it('ค่าคงที่ตรงกับข้อจำกัดของ LINE', () => {
    expect(MAX_OUTPUT_BYTES).toBe(1_048_576)
    expect(MAX_INPUT_PIXELS).toBe(100_000_000)
  })

  it('อ่านข้อมูล JPEG ที่ถูกต้องได้', async () => {
    const facts = await inspectImage(await solidJpeg(800, 600))
    expect(facts).toMatchObject({ format: 'jpeg', width: 800, height: 600, hasAlpha: false })
  })

  it('ตรวจเจอ alpha ใน PNG โปร่งใส', async () => {
    const facts = await inspectImage(await transparentPng(400, 300))
    expect(facts).toMatchObject({ format: 'png', hasAlpha: true })
  })

  it('ปฏิเสธไฟล์ที่ไม่ใช่รูป โดยดูเนื้อในไม่ใช่ชื่อไฟล์', async () => {
    await expect(inspectImage(fakeImage())).rejects.toBeInstanceOf(UnsupportedImageError)
  })

  it('ปฏิเสธรูปฟอร์แมตอื่นที่ LINE ไม่รับ', async () => {
    const sharp = (await import('sharp')).default
    const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
      .webp().toBuffer()
    await expect(inspectImage(webp)).rejects.toBeInstanceOf(UnsupportedImageError)
  })

  it('ปฏิเสธ decompression bomb ก่อนที่จะ decode พิกเซล', async () => {
    await expect(inspectImage(pngBomb())).rejects.toBeInstanceOf(ImageBombError)
  })

  it('bomb ต้องถูกปฏิเสธเร็ว ไม่ใช่ค้างจน process ตาย', async () => {
    const bomb = pngBomb()
    const started = process.hrtime.bigint()
    await expect(inspectImage(bomb)).rejects.toBeInstanceOf(ImageBombError)
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
    expect(elapsedMs).toBeLessThan(2000)
  })
})
```

- [ ] **Step 3: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/image/guards.test.ts`
Expected: FAIL — `Cannot find module '../../src/image/guards.js'`

- [ ] **Step 4: เขียน `guards.ts`**

`packages/core/src/image/guards.ts`
```ts
import sharp from 'sharp'
import { ImageBombError, UnsupportedImageError } from '../errors.js'

/** ~100 ล้านพิกเซล ประมาณ 400 MB ถ้า decode เป็น RGBA — เกินนี้ถือว่าจงใจโจมตี */
export const MAX_INPUT_PIXELS = 100_000_000
export const MAX_OUTPUT_BYTES = 1_048_576

export interface ImageFacts {
  format: 'jpeg' | 'png'
  width: number
  height: number
  hasAlpha: boolean
}

/**
 * อ่าน metadata อย่างเดียว ยังไม่ decode พิกเซล
 * ทำให้ปฏิเสธ decompression bomb ได้ก่อนที่หน่วยความจำจะถูกจอง
 */
export async function inspectImage(input: Buffer): Promise<ImageFacts> {
  let metadata: sharp.Metadata
  try {
    metadata = await sharp(input, { limitInputPixels: false }).metadata()
  } catch {
    throw new UnsupportedImageError(undefined)
  }

  const { format, width, height } = metadata
  if (format !== 'jpeg' && format !== 'png') throw new UnsupportedImageError(format)
  if (!width || !height) throw new UnsupportedImageError(format)
  if (width * height > MAX_INPUT_PIXELS) throw new ImageBombError(width * height)

  return { format, width, height, hasAlpha: metadata.hasAlpha === true }
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/image/guards.test.ts`
Expected: PASS 7 tests

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/image/guards.ts packages/core/tests/image/guards.test.ts packages/core/tests/fixtures/make-fixtures.ts
git commit -m "feat(core): add image guards for magic-byte and decompression-bomb defence"
```

---

## Task 10: Image pipeline — normalize ตามบันไดขนาดและไล่บีบจนต่ำกว่า 1 MB

**Files:**
- Create: `packages/core/src/image/pipeline.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/image/pipeline.test.ts`

**Interfaces:**
- Consumes: `guards.ts` (Task 9), `templates.ts` (Task 2 → `SIZE_LADDER`), `errors.ts` (Task 3)
- Produces:
  - `interface NormalizedImage { buffer: Buffer; mime: 'image/jpeg' | 'image/png'; width: number; height: number; bytes: number }`
  - `interface NormalizeOptions { maxBytes?: number }`
  - `async function normalize(input: Buffer, sizeName: RichMenuSizeName, options?: NormalizeOptions): Promise<NormalizedImage>` — พารามิเตอร์ที่สามมีไว้ให้เทสต์บังคับเส้นทางที่บีบไม่ลง

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/image/pipeline.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { ImageTooLargeError } from '../../src/errors.js'
import { MAX_OUTPUT_BYTES } from '../../src/image/guards.js'
import { normalize } from '../../src/image/pipeline.js'
import { noisePng, solidJpeg, transparentPng } from '../fixtures/make-fixtures.js'

describe('normalize', () => {
  it('ย่อรูปมือถือใหญ่ให้เป็น 2500x1686 และไม่เกิน 1 MB', async () => {
    const result = await normalize(await solidJpeg(4000, 3000), 'large')
    expect(result.width).toBe(2500)
    expect(result.height).toBe(1686)
    expect(result.bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
  })

  it('ทำ compact เป็น 2500x843', async () => {
    const result = await normalize(await solidJpeg(3000, 1000), 'compact')
    expect(result.width).toBe(2500)
    expect(result.height).toBe(843)
  })

  it('ขยายรูปที่เล็กกว่าเป้าให้ได้ขนาดที่ LINE รับ', async () => {
    const result = await normalize(await solidJpeg(600, 400), 'large')
    expect(result.width).toBe(2500)
    expect(result.height).toBe(1686)
  })

  it('รูปโปร่งใสยังคงเป็น PNG เมื่อบีบลงได้', async () => {
    const result = await normalize(await transparentPng(1000, 700), 'large')
    expect(result.mime).toBe('image/png')
    expect(result.bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
  })

  it('รูป noise ที่บีบยากยังต้องออกมาไม่เกิน 1 MB', async () => {
    const result = await normalize(await noisePng(3000, 2000), 'large')
    expect(result.bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
    expect(['image/jpeg', 'image/png']).toContain(result.mime)
  })

  it('ขนาดที่ได้ต้องเป็นหนึ่งในขนาดที่ LINE รับเสมอ', async () => {
    const allowed = new Set(['2500x1686', '1200x810', '800x540'])
    const result = await normalize(await noisePng(3000, 2000), 'large')
    expect(allowed.has(`${result.width}x${result.height}`)).toBe(true)
  })

  it('mime ที่คืนมาตรงกับเนื้อไฟล์จริง', async () => {
    const sharp = (await import('sharp')).default
    const result = await normalize(await solidJpeg(3000, 2000), 'large')
    const actual = (await sharp(result.buffer).metadata()).format
    expect(result.mime).toBe(actual === 'png' ? 'image/png' : 'image/jpeg')
  })

  it('โยน ImageTooLargeError พร้อมขนาดจริง เมื่อบีบทุกทางแล้วยังไม่ผ่าน', async () => {
    // จำลองโดยตั้งเพดานต่ำมากผ่าน option ภายใน
    await expect(
      normalize(await noisePng(3000, 2000), 'large', { maxBytes: 500 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError)
    try {
      await normalize(await noisePng(3000, 2000), 'large', { maxBytes: 500 })
    } catch (e) {
      expect((e as ImageTooLargeError).actualBytes).toBeGreaterThan(500)
    }
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/image/pipeline.test.ts`
Expected: FAIL — `Cannot find module '../../src/image/pipeline.js'`

- [ ] **Step 3: เขียน `pipeline.ts`**

`packages/core/src/image/pipeline.ts`
```ts
import sharp from 'sharp'
import { ImageTooLargeError } from '../errors.js'
import { SIZE_LADDER } from '../templates.js'
import type { RichMenuSizeName } from '../types.js'
import { MAX_OUTPUT_BYTES, inspectImage } from './guards.js'

export interface NormalizedImage {
  buffer: Buffer
  mime: 'image/jpeg' | 'image/png'
  width: number
  height: number
  bytes: number
}

export interface NormalizeOptions {
  /** ใช้ในเทสต์เพื่อบังคับให้เดินเส้นทางที่บีบไม่ลง */
  maxBytes?: number
}

const JPEG_QUALITY_STEPS = [90, 80, 70, 60] as const

export async function normalize(
  input: Buffer,
  sizeName: RichMenuSizeName,
  options: NormalizeOptions = {},
): Promise<NormalizedImage> {
  const maxBytes = options.maxBytes ?? MAX_OUTPUT_BYTES
  const facts = await inspectImage(input)
  let smallest = Number.POSITIVE_INFINITY

  for (const size of SIZE_LADDER[sizeName]) {
    const resized = sharp(input).resize(size.width, size.height, { fit: 'cover', position: 'centre' })

    if (facts.hasAlpha) {
      const png = await resized.clone().png({ compressionLevel: 9, palette: true }).toBuffer()
      smallest = Math.min(smallest, png.length)
      if (png.length <= maxBytes) {
        return { buffer: png, mime: 'image/png', width: size.width, height: size.height, bytes: png.length }
      }
    }

    for (const quality of JPEG_QUALITY_STEPS) {
      const jpeg = await resized
        .clone()
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      smallest = Math.min(smallest, jpeg.length)
      if (jpeg.length <= maxBytes) {
        return { buffer: jpeg, mime: 'image/jpeg', width: size.width, height: size.height, bytes: jpeg.length }
      }
    }
  }

  throw new ImageTooLargeError(smallest)
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/image/pipeline.test.ts`
Expected: PASS 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/image/pipeline.ts packages/core/tests/image/pipeline.test.ts
git commit -m "feat(core): add image normalize with size ladder and quality descent"
```

---

## Task 11: Compose รูปแยกช่อง

**Files:**
- Modify: `packages/core/src/image/pipeline.ts`
- Test: `packages/core/tests/image/compose.test.ts`

**Interfaces:**
- Consumes: `normalize` (Task 10), `Bounds`/`RichMenuSize` (Task 2)
- Produces:
  - `interface AreaImage { bounds: Bounds; image: Buffer }`
  - `async function compose(parts: readonly AreaImage[], size: RichMenuSize): Promise<Buffer>` — คืน PNG ขนาดเท่า `size` ยังไม่ผ่าน normalize

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/image/compose.test.ts`
```ts
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { UnsupportedImageError } from '../../src/errors.js'
import { compose, normalize } from '../../src/image/pipeline.js'
import { fakeImage, solidJpeg } from '../fixtures/make-fixtures.js'

const SIZE = { width: 2500, height: 1686 }

async function colourBlock(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer()
}

describe('compose', () => {
  it('ได้ผืนผ้าใบขนาดตามที่ขอ', async () => {
    const out = await compose([{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, image: await solidJpeg(100, 100) }], SIZE)
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(2500)
    expect(meta.height).toBe(1686)
  })

  it('วางแต่ละช่องตรงพิกัดที่กำหนด', async () => {
    const out = await compose(
      [
        { bounds: { x: 0, y: 0, width: 1250, height: 1686 }, image: await colourBlock(255, 0, 0) },
        { bounds: { x: 1250, y: 0, width: 1250, height: 1686 }, image: await colourBlock(0, 0, 255) },
      ],
      SIZE,
    )
    const raw = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => {
      const i = (y * raw.info.width + x) * raw.info.channels
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]]
    }
    expect(px(100, 100)).toEqual([255, 0, 0])
    expect(px(2400, 100)).toEqual([0, 0, 255])
  })

  it('ช่องที่ไม่ได้ใส่รูปเป็นพื้นขาว ไม่ใช่โปร่งใสที่กลายเป็นดำตอนแปลง JPEG', async () => {
    const out = await compose([{ bounds: { x: 0, y: 0, width: 100, height: 100 }, image: await colourBlock(255, 0, 0) }], SIZE)
    const raw = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    const i = (1000 * raw.info.width + 2000) * raw.info.channels
    expect([raw.data[i], raw.data[i + 1], raw.data[i + 2]]).toEqual([255, 255, 255])
  })

  it('ปฏิเสธไฟล์ที่ไม่ใช่รูปในช่องใดช่องหนึ่ง', async () => {
    await expect(
      compose([{ bounds: { x: 0, y: 0, width: 100, height: 100 }, image: fakeImage() }], SIZE),
    ).rejects.toBeInstanceOf(UnsupportedImageError)
  })

  it('ผลลัพธ์ผ่าน normalize แล้วไม่เกิน 1 MB', async () => {
    const out = await compose([{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, image: await solidJpeg(500, 500) }], SIZE)
    const normalized = await normalize(out, 'large')
    expect(normalized.bytes).toBeLessThanOrEqual(1_048_576)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/image/compose.test.ts`
Expected: FAIL — `compose is not exported`

- [ ] **Step 3: เพิ่ม `compose` ลงใน `pipeline.ts`**

เพิ่ม `Bounds` และ `RichMenuSize` เข้าไปในบล็อก import ที่**ด้านบนของไฟล์** (ไม่ใช่ท้ายไฟล์):
```ts
import type { Bounds, RichMenuSize, RichMenuSizeName } from '../types.js'
```

แล้วเพิ่มส่วนนี้ท้าย `packages/core/src/image/pipeline.ts`
```ts
export interface AreaImage {
  bounds: Bounds
  image: Buffer
}

/**
 * วางรูปของแต่ละช่องลงบนผืนผ้าใบขนาดเต็ม
 * พื้นหลังเป็นขาวทึบ ไม่ใช่โปร่งใส เพราะถ้าโปร่งใสแล้วถูกแปลงเป็น JPEG ทีหลังจะกลายเป็นดำ
 */
export async function compose(parts: readonly AreaImage[], size: RichMenuSize): Promise<Buffer> {
  const layers = await Promise.all(
    parts.map(async (part) => {
      await inspectImage(part.image)
      const resized = await sharp(part.image)
        .resize(part.bounds.width, part.bounds.height, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer()
      return { input: resized, left: part.bounds.x, top: part.bounds.y }
    }),
  )

  return sharp({
    create: {
      width: size.width,
      height: size.height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer()
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/image/compose.test.ts`
Expected: PASS 5 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/image/pipeline.ts packages/core/tests/image/compose.test.ts
git commit -m "feat(core): compose per-area images onto an opaque canvas"
```

---

## Task 12: Publish state machine — ลำดับและการชดเชย

**Files:**
- Create: `packages/core/src/publish/machine.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/publish/machine.test.ts`

**Interfaces:**
- Consumes: `types.ts` (Task 2)
- Produces:
  - `type Step = { kind: 'validate' } | { kind: 'create' } | { kind: 'uploadImage' } | { kind: 'upsertAlias'; aliasId: string } | { kind: 'setDefault' } | { kind: 'deleteOld'; lineRichMenuId: string }`
  - `type Compensation = { kind: 'deleteCreated' }`
  - `interface PublishInput { aliasId?: string; setAsDefault: boolean; previousLineRichMenuId?: string }`
  - `function plan(input: PublishInput): Step[]`
  - `function compensate(completed: readonly Step[]): Compensation[]`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/publish/machine.test.ts`
```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compensate, plan, type Step } from '../../src/publish/machine.js'

describe('plan', () => {
  it('เริ่มด้วย validate เสมอ เพื่อไม่ทิ้งขยะบน LINE เมื่อ payload ผิด', () => {
    expect(plan({ setAsDefault: false })[0]).toEqual({ kind: 'validate' })
  })

  it('สร้างก่อนอัปรูปเสมอ เพราะต้องมี richMenuId ก่อน', () => {
    const steps = plan({ setAsDefault: false }).map((s) => s.kind)
    expect(steps.indexOf('create')).toBeLessThan(steps.indexOf('uploadImage'))
  })

  it('ลบเมนูเก่าเป็นขั้นสุดท้ายเสมอ', () => {
    const steps = plan({ setAsDefault: true, aliasId: 'tab-a', previousLineRichMenuId: 'rm-old' })
    expect(steps.at(-1)).toEqual({ kind: 'deleteOld', lineRichMenuId: 'rm-old' })
  })

  it('ไม่มีขั้นลบเมนูเก่า ถ้ายังไม่เคย publish', () => {
    expect(plan({ setAsDefault: true }).some((s) => s.kind === 'deleteOld')).toBe(false)
  })

  it('ใส่ขั้น alias เมื่อระบุ aliasId', () => {
    expect(plan({ setAsDefault: false, aliasId: 'tab-a' }))
      .toContainEqual({ kind: 'upsertAlias', aliasId: 'tab-a' })
  })

  it('ไม่ใส่ขั้น setDefault เมื่อไม่ได้ขอ', () => {
    expect(plan({ setAsDefault: false }).some((s) => s.kind === 'setDefault')).toBe(false)
  })

  it('อัปเดต alias ก่อนตั้ง default — ให้ปลายทางพร้อมก่อนสลับให้ผู้ใช้เห็น', () => {
    const steps = plan({ setAsDefault: true, aliasId: 'tab-a' }).map((s) => s.kind)
    expect(steps.indexOf('upsertAlias')).toBeLessThan(steps.indexOf('setDefault'))
  })
})

describe('compensate', () => {
  it('ไม่ต้องชดเชยถ้ายังไม่ทันสร้างอะไรบน LINE', () => {
    expect(compensate([{ kind: 'validate' }])).toEqual([])
  })

  it('ลบเมนูที่เพิ่งสร้างถ้าล้มหลังจาก create', () => {
    expect(compensate([{ kind: 'validate' }, { kind: 'create' }]))
      .toEqual([{ kind: 'deleteCreated' }])
  })

  // ข้อบังคับสำคัญที่สุดของ task นี้
  it('property: ทุกจุดที่ล้มกลางทาง ต้องไม่ทิ้งเมนูกำพร้าไว้บน LINE', () => {
    fc.assert(
      fc.property(
        fc.record({
          setAsDefault: fc.boolean(),
          aliasId: fc.option(fc.constantFrom('tab-a', 'tab-b'), { nil: undefined }),
          previousLineRichMenuId: fc.option(fc.constant('rm-old'), { nil: undefined }),
        }),
        fc.nat(),
        (input, cut) => {
          const steps = plan(input)
          const completed = steps.slice(0, cut % (steps.length + 1))
          const created = completed.some((s: Step) => s.kind === 'create')
          const fixes = compensate(completed)
          // สร้างแล้วต้องมีคำสั่งลบ ยังไม่สร้างต้องไม่มีคำสั่งลบ
          expect(fixes.some((f) => f.kind === 'deleteCreated')).toBe(created)
        },
      ),
      { numRuns: 500 },
    )
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/publish/machine.test.ts`
Expected: FAIL — `Cannot find module '../../src/publish/machine.js'`

- [ ] **Step 3: เขียน `machine.ts`**

`packages/core/src/publish/machine.ts`
```ts
export type Step =
  | { kind: 'validate' }
  | { kind: 'create' }
  | { kind: 'uploadImage' }
  | { kind: 'upsertAlias'; aliasId: string }
  | { kind: 'setDefault' }
  | { kind: 'deleteOld'; lineRichMenuId: string }

export type Compensation = { kind: 'deleteCreated' }

export interface PublishInput {
  aliasId?: string
  setAsDefault: boolean
  previousLineRichMenuId?: string
}

/**
 * คืนลำดับขั้นของการ publish โดยไม่ยิง network เอง
 * ผู้เรียกเป็นคนรันทีละขั้น และเรียก compensate() เมื่อขั้นใดล้มเหลว
 */
export function plan(input: PublishInput): Step[] {
  const steps: Step[] = [{ kind: 'validate' }, { kind: 'create' }, { kind: 'uploadImage' }]
  if (input.aliasId) steps.push({ kind: 'upsertAlias', aliasId: input.aliasId })
  if (input.setAsDefault) steps.push({ kind: 'setDefault' })
  if (input.previousLineRichMenuId) {
    steps.push({ kind: 'deleteOld', lineRichMenuId: input.previousLineRichMenuId })
  }
  return steps
}

/**
 * ถ้าสร้างเมนูบน LINE ไปแล้วแต่ขั้นถัดไปล้ม ต้องลบทิ้งเสมอ
 * ไม่งั้นจะเหลือเมนูกำพร้าที่กินโควตาของ channel
 */
export function compensate(completed: readonly Step[]): Compensation[] {
  return completed.some((s) => s.kind === 'create') ? [{ kind: 'deleteCreated' }] : []
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/publish/machine.test.ts`
Expected: PASS 9 tests (รวม property test 500 รอบ)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/publish/machine.ts packages/core/tests/publish/machine.test.ts
git commit -m "feat(core): add publish plan and compensation with orphan-free property test"
```

---

## Task 13: Thumbnail เป็น SVG ที่วาดจาก bounds

**Files:**
- Create: `packages/core/src/thumbnail.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/thumbnail.test.ts`

**Interfaces:**
- Consumes: `types.ts` (Task 2), `templates.ts` (Task 2)
- Produces:
  - `function areaLabel(index: number): string` — 0→`A`, 25→`Z`, 26→`AA`
  - `function renderTemplateSvg(bounds: readonly Bounds[], size: RichMenuSize): string`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/thumbnail.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../src/templates.js'
import { areaLabel, renderTemplateSvg } from '../src/thumbnail.js'

describe('areaLabel', () => {
  it('เริ่มที่ A และไล่ไปตามลำดับ', () => {
    expect(areaLabel(0)).toBe('A')
    expect(areaLabel(19)).toBe('T')
    expect(areaLabel(25)).toBe('Z')
  })

  it('ไม่พังถ้าเกิน Z', () => {
    expect(areaLabel(26)).toBe('AA')
  })
})

describe('renderTemplateSvg', () => {
  const t = TEMPLATES['RICH_MENU_TEMPLATE_201']!

  it('viewBox ตรงกับผืนผ้าใบจริง', () => {
    expect(renderTemplateSvg(t.bounds, t.size)).toContain('viewBox="0 0 2500 1686"')
  })

  it('มี rect หนึ่งอันต่อหนึ่งช่อง', () => {
    const svg = renderTemplateSvg(t.bounds, t.size)
    expect(svg.match(/<rect/g)).toHaveLength(t.bounds.length)
  })

  it('ติดป้ายตัวอักษรครบทุกช่อง', () => {
    const svg = renderTemplateSvg(t.bounds, t.size)
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(svg).toContain(`>${letter}<`)
    }
  })

  it('วาดได้ทุก template ที่มีในแคตตาล็อก', () => {
    for (const template of Object.values(TEMPLATES)) {
      const svg = renderTemplateSvg(template.bounds, template.size)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.match(/<rect/g)).toHaveLength(template.bounds.length)
    }
  })

  it('วาด custom layout ที่ไม่ได้อยู่ในแคตตาล็อกได้ด้วยโค้ดเดียวกัน', () => {
    const custom = [
      { x: 0, y: 0, width: 700, height: 843 },
      { x: 700, y: 0, width: 1800, height: 843 },
    ]
    const svg = renderTemplateSvg(custom, { width: 2500, height: 843 })
    expect(svg.match(/<rect/g)).toHaveLength(2)
  })

  it('ไม่มี script หรือ event handler หลุดเข้าไปใน SVG', () => {
    const svg = renderTemplateSvg(t.bounds, t.size)
    expect(svg).not.toMatch(/<script|onload=|onclick=/i)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/core/tests/thumbnail.test.ts`
Expected: FAIL — `Cannot find module '../src/thumbnail.js'`

- [ ] **Step 3: เขียน `thumbnail.ts`**

`packages/core/src/thumbnail.ts`
```ts
import type { Bounds, RichMenuSize } from './types.js'

export function areaLabel(index: number): string {
  let label = ''
  let n = index
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/**
 * วาด thumbnail จากพิกัดโดยตรง แทนการแนบไฟล์ภาพมากับแพ็กเกจ
 * ผลพลอยได้คือ layout ที่ผู้ใช้สร้างเองก็มี thumbnail ทันทีด้วยโค้ดเดียวกัน
 */
export function renderTemplateSvg(bounds: readonly Bounds[], size: RichMenuSize): string {
  const fontSize = Math.round(Math.min(size.width, size.height) * 0.18)
  const cells = bounds
    .map((b, i) => {
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      return [
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="rgba(0,0,0,0.06)" stroke="currentColor" stroke-width="6" />`,
        `<text x="${cx}" y="${cy}" font-size="${fontSize}" font-family="sans-serif" font-weight="700" fill="currentColor" text-anchor="middle" dominant-baseline="central">${areaLabel(i)}</text>`,
      ].join('')
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" role="img">${cells}</svg>`
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/core/tests/thumbnail.test.ts`
Expected: PASS 8 tests

- [ ] **Step 5: export ทุกอย่างออกจาก index แล้วยืนยันด้วย typecheck**

`packages/core/src/index.ts`
```ts
export * from './types.js'
export * from './templates.js'
export * from './errors.js'
export * from './schema.js'
export * from './crypto.js'
export * from './thumbnail.js'
export * from './line/endpoints.js'
export * from './line/client.js'
export * from './image/guards.js'
export * from './image/pipeline.js'
export * from './publish/machine.js'
```

Run: `pnpm --filter @fosivo/line-rich-menu-core typecheck && pnpm --filter @fosivo/line-rich-menu-core build`
Expected: ไม่มี error และมี `dist/index.js` (ESM), `dist/index.cjs` (CJS), `dist/index.d.ts`

เพราะ package เป็น `"type": "module"` tsup จะออก `.js` เป็น ESM และ `.cjs` เป็น CJS — ไม่ใช่ `.mjs`

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/thumbnail.ts packages/core/src/index.ts packages/core/tests/thumbnail.test.ts
git commit -m "feat(core): render template thumbnails as SVG derived from bounds"
```

---

## Task 14: `tools/line-mock` — เซิร์ฟเวอร์จำลอง LINE

**Files:**
- Create: `tools/line-mock/package.json`, `tools/line-mock/tsconfig.json`, `tools/line-mock/vitest.config.ts`
- Create: `tools/line-mock/src/server.ts`, `tools/line-mock/src/store.ts`
- Test: `tools/line-mock/tests/server.test.ts`

**Interfaces:**
- Consumes: `LineClient` (Task 7) ใช้เป็นตัวยิงในเทสต์
- Produces:
  - `function createServer(): FastifyInstance`
  - `function createStore(): MockStore` — เก็บ rich menu, alias, default ในหน่วยความจำ

- [ ] **Step 1: สร้าง package**

`tools/line-mock/package.json`
```json
{
  "name": "@fosivo/line-mock",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/server.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "fastify": "^5.0.0" },
  "devDependencies": {
    "@fosivo/line-rich-menu-core": "workspace:*",
    "tsx": "^4.19.0"
  }
}
```

`tools/line-mock/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src", "tests"]
}
```

`tools/line-mock/vitest.config.ts` — เทสต์ยิงด้วย `LineClient` ตัวจริงจาก source
จึงต้อง alias ไปที่ `src` ไม่ใช่ `dist` ไม่งั้นต้อง build core ก่อนทุกครั้งที่รันเทสต์
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'line-mock', include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      '@fosivo/line-rich-menu-core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
})
```

Run: `pnpm install`

- [ ] **Step 2: เขียน test ที่ต้องล้มเหลว**

`tools/line-mock/tests/server.test.ts`
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LineClient } from '@fosivo/line-rich-menu-core'
import { createServer } from '../src/server.js'

let baseUrl = ''
const app = createServer()

beforeAll(async () => {
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (typeof address === 'object' && address) baseUrl = `http://127.0.0.1:${address.port}`
})
afterAll(() => app.close())

const payload = {
  size: { width: 2500, height: 843 },
  selected: false,
  name: 'mock menu',
  chatBarText: 'menu',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'message' as const, text: 'hi' } }],
}

describe('line-mock ทำงานเข้ากันได้กับ LineClient จริง', () => {
  it('รองรับวงจร publish ครบ: create → upload → alias → setDefault → list → delete', async () => {
    const client = new LineClient({ accessToken: 'anything', apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })

    await client.validateRichMenu(payload)
    const id = await client.createRichMenu(payload)
    expect(id).toMatch(/^richmenu-/)

    await client.uploadContent(id, Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png')
    await client.createAlias('tab-a', id)
    await client.setDefault(id)

    expect(await client.listRichMenus()).toHaveLength(1)
    expect(await client.listAliases()).toEqual([{ richMenuAliasId: 'tab-a', richMenuId: id }])

    await client.deleteAlias('tab-a')
    await client.deleteRichMenu(id)
    expect(await client.listRichMenus()).toHaveLength(0)
  })

  it('ตอบ 400 พร้อม details เมื่อ payload ผิด เหมือน LINE จริง', async () => {
    const res = await fetch(`${baseUrl}/v2/bot/richmenu`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
      body: JSON.stringify({ ...payload, chatBarText: '' }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { details: unknown[] }).details.length).toBeGreaterThan(0)
  })

  it('ตอบ 401 เมื่อไม่มี Authorization header', async () => {
    const res = await fetch(`${baseUrl}/v2/bot/info`)
    expect(res.status).toBe(401)
  })

  it('getBotInfo คืนข้อมูล OA จำลอง', async () => {
    const client = new LineClient({ accessToken: 'x', apiBaseUrl: baseUrl })
    expect((await client.getBotInfo()).displayName).toBe('Mock LINE OA')
  })
})
```

- [ ] **Step 3: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run tools/line-mock/tests/server.test.ts`
Expected: FAIL — `Cannot find module '../src/server.js'`

- [ ] **Step 4: เขียน `store.ts` และ `server.ts`**

`tools/line-mock/src/store.ts`
```ts
export interface StoredMenu {
  richMenuId: string
  payload: unknown
  image?: { mime: string; bytes: number }
}

export interface MockStore {
  menus: Map<string, StoredMenu>
  aliases: Map<string, string>
  defaultMenuId: string | null
  nextId(): string
}

export function createStore(): MockStore {
  let counter = 0
  return {
    menus: new Map(),
    aliases: new Map(),
    defaultMenuId: null,
    nextId: () => `richmenu-${(++counter).toString().padStart(8, '0')}`,
  }
}
```

`tools/line-mock/src/server.ts`
```ts
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { createStore } from './store.js'

interface Detail { property: string; message: string }

function validate(body: unknown): Detail[] {
  const details: Detail[] = []
  const b = body as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return [{ property: '(root)', message: 'body must be an object' }]
  const chatBarText = b['chatBarText']
  if (typeof chatBarText !== 'string' || chatBarText.length < 1 || chatBarText.length > 14) {
    details.push({ property: 'chatBarText', message: 'must be 1-14 characters' })
  }
  const areas = b['areas']
  if (!Array.isArray(areas) || areas.length < 1 || areas.length > 20) {
    details.push({ property: 'areas', message: 'must contain 1-20 items' })
  }
  return details
}

export function createServer(): FastifyInstance {
  const app = Fastify({ logger: false })
  const store = createStore()

  app.addContentTypeParser(
    ['image/png', 'image/jpeg'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  )

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      // ต้อง return reply เพื่อตัดวงจร ไม่งั้น Fastify จะเดินต่อไป handler
      return reply.code(401).send({ message: 'Authorization header required' })
    }
    return undefined
  })

  app.get('/v2/bot/info', async () => ({
    userId: 'Umock0000',
    basicId: '@mock',
    displayName: 'Mock LINE OA',
  }))

  app.post('/v2/bot/richmenu/validate', async (req, reply) => {
    const details = validate(req.body)
    if (details.length > 0) return reply.code(400).send({ message: 'invalid', details })
    return reply.code(200).send()
  })

  app.post('/v2/bot/richmenu', async (req, reply) => {
    const details = validate(req.body)
    if (details.length > 0) return reply.code(400).send({ message: 'invalid', details })
    const richMenuId = store.nextId()
    store.menus.set(richMenuId, { richMenuId, payload: req.body })
    return reply.send({ richMenuId })
  })

  app.get('/v2/bot/richmenu/list', async () => ({
    richmenus: [...store.menus.values()].map((m) => ({ richMenuId: m.richMenuId })),
  }))

  app.get('/v2/bot/richmenu/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const found = store.menus.get(id)
    return found ? reply.send({ richMenuId: found.richMenuId }) : reply.code(404).send({ message: 'not found' })
  })

  app.delete('/v2/bot/richmenu/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!store.menus.delete(id)) return reply.code(404).send({ message: 'not found' })
    if (store.defaultMenuId === id) store.defaultMenuId = null
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/:id/content', async (req, reply) => {
    const { id } = req.params as { id: string }
    const menu = store.menus.get(id)
    if (!menu) return reply.code(404).send({ message: 'not found' })
    const buffer = req.body as Buffer
    if (buffer.length > 1_048_576) {
      return reply.code(400).send({ message: 'invalid', details: [{ property: 'content', message: 'exceeds 1MB' }] })
    }
    menu.image = { mime: String(req.headers['content-type']), bytes: buffer.length }
    return reply.send({})
  })

  app.post('/v2/bot/user/all/richmenu/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!store.menus.has(id)) return reply.code(404).send({ message: 'not found' })
    store.defaultMenuId = id
    return reply.send({})
  })

  app.delete('/v2/bot/user/all/richmenu', async (_req, reply) => {
    store.defaultMenuId = null
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/alias', async (req, reply) => {
    const { richMenuAliasId, richMenuId } = req.body as { richMenuAliasId: string; richMenuId: string }
    store.aliases.set(richMenuAliasId, richMenuId)
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/alias/:aliasId', async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    const { richMenuId } = req.body as { richMenuId: string }
    store.aliases.set(aliasId, richMenuId)
    return reply.send({})
  })

  app.delete('/v2/bot/richmenu/alias/:aliasId', async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    store.aliases.delete(aliasId)
    return reply.send({})
  })

  app.get('/v2/bot/richmenu/alias/list', async () => ({
    aliases: [...store.aliases.entries()].map(([richMenuAliasId, richMenuId]) => ({ richMenuAliasId, richMenuId })),
  }))

  app.post('/v2/bot/user/:userId/richmenu/:id', async (_req, reply) => reply.send({}))

  return app
}

// รันเป็นเซิร์ฟเวอร์เดี่ยวสำหรับ demo: pnpm --filter @fosivo/line-mock start
if (process.argv[1]?.endsWith('server.ts')) {
  const port = Number(process.env['PORT'] ?? 4010)
  createServer()
    .listen({ port, host: '0.0.0.0' })
    .then(() => console.log(`line-mock listening on ${port}`))
}
```

หมายเหตุ: route `/v2/bot/richmenu/:id/content` อยู่บน host เดียวกับ API หลักใน mock
`LineClient` จึงต้องถูกสร้างด้วย `apiDataBaseUrl` ชี้มาที่ mock ด้วย (เทสต์ทำแบบนั้นแล้ว)

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `pnpm vitest run tools/line-mock/tests/server.test.ts`
Expected: PASS 4 tests

- [ ] **Step 6: Commit**

```bash
git add tools/line-mock
git commit -m "feat(line-mock): add in-memory LINE Messaging API stand-in for CI and demos"
```

---

## Task 15: CI pipeline พร้อมด่านคุณภาพและความปลอดภัย

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `packages/core/stryker.config.json`
- Modify: `package.json` (เพิ่ม script)
- Test: ยืนยันด้วยการรัน workflow จริงบน GitHub

**Interfaces:**
- Consumes: ทุก package จาก Task 1–14
- Produces: ด่านที่บล็อก merge ได้จริง

- [ ] **Step 1: เพิ่ม script ที่ CI จะเรียก**

เพิ่มใน `package.json` ระดับ root
```json
{
  "scripts": {
    "test:coverage": "vitest run --coverage",
    "test:mutation": "pnpm --filter @fosivo/line-rich-menu-core exec stryker run"
  }
}
```

Run: `pnpm add -D -w @stryker-mutator/core @stryker-mutator/vitest-runner`

- [ ] **Step 2: ตั้งค่า mutation testing**

`packages/core/stryker.config.json`
```json
{
  "$schema": "https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/packages/api/schema/stryker-core.json",
  "packageManager": "pnpm",
  "testRunner": "vitest",
  "reporters": ["html", "clear-text", "progress"],
  "mutate": ["src/**/*.ts", "!src/index.ts"],
  "thresholds": { "high": 90, "low": 80, "break": 75 },
  "coverageAnalysis": "perTest"
}
```

- [ ] **Step 3: เขียน workflow**

`.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test:coverage
      - run: pnpm build

  mutation:
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:mutation

  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google/osv-scanner-action/osv-scanner-action@v1
        with:
          scan-args: |-
            --lockfile=./pnpm-lock.yaml

  codeql:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: javascript-typescript }
      - uses: github/codeql-action/analyze@v3
```

- [ ] **Step 4: ยืนยันว่าด่าน coverage บล็อกได้จริง**

ลดค่า threshold ใน `packages/core/vitest.config.ts` เป็น `lines: 100` ชั่วคราวแล้วรัน

Run: `pnpm test:coverage`
Expected: FAIL พร้อมข้อความ coverage threshold not met

แล้วคืนค่ากลับเป็น 90 และรันซ้ำ
Expected: PASS

- [ ] **Step 5: Commit และ push เพื่อดูผล CI จริง**

```bash
git add .github/workflows/ci.yml packages/core/stryker.config.json package.json pnpm-lock.yaml
git commit -m "ci: add quality, mutation, secret, dependency and SAST gates"
git push
```

ตรวจว่า job ทั้ง 5 ผ่านบน GitHub Actions ถ้า mutation score ต่ำกว่า 75 ให้เพิ่ม assertion ในเทสต์ที่อ่อน **ห้ามลด threshold**

---

---

## Task 16: หน้า preview ในเบราว์เซอร์ (รันหลัง Task 13)

**Files:**
- Create: `tools/preview/package.json`, `tools/preview/tsconfig.json`, `tools/preview/vitest.config.ts`
- Create: `tools/preview/src/server.ts`, `tools/preview/src/page.ts`
- Test: `tools/preview/tests/page.test.ts`

**Interfaces:**
- Consumes: `TEMPLATES`, `renderTemplateSvg`, `areaLabel` จาก `@fosivo/line-rich-menu-core` (Task 2, 13)
- Produces:
  - `function renderPage(): string` — HTML ทั้งหน้า
  - `function createServer(): http.Server`
  - script `pnpm --filter @fosivo/preview start` เปิดที่ `http://127.0.0.1:4020`

`core` ไม่มี UI แต่ thumbnail เป็น SVG ที่ดูได้ หน้านี้ทำให้ตรวจสายตาได้ว่าพิกัดที่พอร์ตมาถูกต้องจริง
ซึ่งตาเห็นได้เร็วกว่าอ่าน assertion และเป็นฐานให้ CanvasEditor ใน Plan 02

- [ ] **Step 1: สร้าง package**

`tools/preview/package.json`
```json
{
  "name": "@fosivo/preview",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/server.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "@fosivo/line-rich-menu-core": "workspace:*" },
  "devDependencies": { "tsx": "^4.19.0" }
}
```

`tools/preview/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src", "tests"]
}
```

`tools/preview/vitest.config.ts`
```ts
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
```

Run: `pnpm install`

- [ ] **Step 2: เขียน test ที่ต้องล้มเหลว**

`tools/preview/tests/page.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '@fosivo/line-rich-menu-core'
import { renderPage } from '../src/page.js'

describe('หน้า preview', () => {
  const html = renderPage()

  it('เป็นเอกสาร HTML ที่สมบูรณ์', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
  })

  it('แสดงครบทั้ง 12 template', () => {
    for (const key of Object.keys(TEMPLATES)) expect(html).toContain(key)
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(13)
  })

  it('บอกจำนวนช่องของแต่ละ template', () => {
    const t = TEMPLATES['RICH_MENU_TEMPLATE_201']!
    expect(html).toContain(`${t.bounds.length} areas`)
  })

  it('มีตัวอย่าง custom layout เพื่อพิสูจน์ว่า renderer ตัวเดียวกันวาดได้', () => {
    expect(html).toContain('Custom layout')
  })

  it('ไม่มี script tag — หน้านี้เป็น static ล้วน ไม่ต้องมี JS', () => {
    expect(html).not.toMatch(/<script/i)
  })

  it('รองรับทั้งธีมสว่างและมืดของเบราว์เซอร์', () => {
    expect(html).toContain('prefers-color-scheme: dark')
  })
})
```

- [ ] **Step 3: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run tools/preview/tests/page.test.ts`
Expected: FAIL — `Cannot find module '../src/page.js'`

- [ ] **Step 4: เขียน `page.ts`**

`tools/preview/src/page.ts`
```ts
import { TEMPLATES, renderTemplateSvg, type TemplateDef } from '@fosivo/line-rich-menu-core'

const CUSTOM = {
  size: { width: 2500, height: 1686 },
  bounds: [
    { x: 0, y: 0, width: 2500, height: 500 },
    { x: 0, y: 500, width: 900, height: 1186 },
    { x: 900, y: 500, width: 800, height: 1186 },
    { x: 1700, y: 500, width: 800, height: 1186 },
  ],
}

function card(title: string, subtitle: string, svg: string): string {
  return `<figure class="card">
  <div class="canvas">${svg}</div>
  <figcaption><strong>${title}</strong><span>${subtitle}</span></figcaption>
</figure>`
}

function section(heading: string, items: TemplateDef[]): string {
  const cards = items
    .map((t) => card(t.key, `${t.size.width}x${t.size.height} - ${t.bounds.length} areas`, renderTemplateSvg(t.bounds, t.size)))
    .join('\n')
  return `<section><h2>${heading}</h2><div class="grid">${cards}</div></section>`
}

export function renderPage(): string {
  const all = Object.values(TEMPLATES)
  const large = all.filter((t) => t.sizeName === 'large')
  const compact = all.filter((t) => t.sizeName === 'compact')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LINE rich menu templates</title>
<style>
  :root { color-scheme: light dark; --bg: #fbfbfd; --fg: #16161a; --muted: #6b6b76; --line: #d5d5de; --card: #ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #131316; --fg: #ececf1; --muted: #9a9aa6; --line: #35353f; --card: #1c1c21; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2.5rem 1.5rem 4rem; background: var(--bg); color: var(--fg);
         font: 15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  p.lede { color: var(--muted); margin: 0 0 2.5rem; }
  h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
       margin: 2.5rem 0 1rem; }
  .grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
  .card { margin: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--card); }
  .canvas { color: #10b981; background: repeating-conic-gradient(var(--line) 0% 25%, transparent 0% 50%) 50%/16px 16px; }
  .canvas svg { display: block; width: 100%; height: auto; }
  figcaption { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline;
               padding: .7rem .9rem; border-top: 1px solid var(--line); font-size: .82rem; }
  figcaption span { color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<main>
  <h1>LINE rich menu templates</h1>
  <p class="lede">Thumbnails are SVG rendered from the bounds data in <code>@fosivo/line-rich-menu-core</code>. No bundled images.</p>
  ${section('Large - 2500x1686', large)}
  ${section('Compact - 2500x843', compact)}
  <section><h2>Custom layout</h2><div class="grid">
    ${card('Custom layout', `${CUSTOM.size.width}x${CUSTOM.size.height} - ${CUSTOM.bounds.length} areas`, renderTemplateSvg(CUSTOM.bounds, CUSTOM.size))}
  </div></section>
</main>
</body>
</html>`
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `pnpm vitest run tools/preview/tests/page.test.ts`
Expected: PASS 6 tests

- [ ] **Step 6: เขียน `server.ts`**

`tools/preview/src/server.ts`
```ts
import http from 'node:http'
import { renderPage } from './page.js'

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.url !== '/' && req.url !== '/index.html') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    // สร้างใหม่ทุกครั้งที่โหลด เพื่อให้แก้ bounds แล้วรีเฟรชเห็นผลทันที
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(renderPage())
  })
}

if (process.argv[1]?.endsWith('server.ts')) {
  const port = Number(process.env['PORT'] ?? 4020)
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`preview: http://127.0.0.1:${port}`)
  })
}
```

- [ ] **Step 7: เปิดดูในเบราว์เซอร์จริง**

Run: `pnpm --filter @fosivo/preview start`
Expected: log `preview: http://127.0.0.1:4020` และเปิดหน้าในเบราว์เซอร์เห็น template ครบ 13 การ์ด
(12 แบบมาตรฐาน + custom layout) โดยกรอบแต่ละช่องตรงกับสัดส่วนจริงของ LINE

- [ ] **Step 8: Commit**

```bash
git add tools/preview
git commit -m "feat(preview): serve SVG template gallery for visual verification"
```

## Self-Review

**1. Spec coverage** — เทียบกับ spec ทีละหัวข้อ:

| Spec | Task | สถานะ |
|---|---|---|
| §4.1 templates.ts | Task 2 | ครอบ |
| §4.2 line/client.ts | Task 6, 7, 8 | ครอบ |
| §4.3 image/pipeline.ts | Task 9, 10, 11 | ครอบ |
| §4.4 publish/machine.ts | Task 12 | ครอบ |
| §4.5 schema.ts | Task 4 | ครอบ |
| §5.3 thumbnail SVG | Task 13 | ครอบ (ย้ายมาอยู่ core เพราะเป็น pure function ที่ derive จาก bounds) |
| §11.2 crypto envelope | Task 5 | ครอบ |
| §11.3 input guard | Task 4 (URI/zod), Task 9 (รูป) | ครอบ |
| §11.7 error code | Task 3 | ครอบ |
| §13.1 coverage/mutation | Task 15 | ครอบ |
| §13.2 security test 8 ข้อ | ข้อ 2/3 บางส่วนใน Task 8 · ข้อ 4 ใน Task 5 · ข้อ 5/6 ใน Task 9 · ข้อ 7 ใน Task 4 | **ข้อ 1 (RBAC matrix), ข้อ 8 (audit completeness) อยู่นอก core** → ไปอยู่ Plan 03/04 ซึ่งถูกต้องแล้วเพราะ core ไม่มี RBAC และไม่มี DB |
| §13.4 CI | Task 15 | ครอบ |
| §14 demo hosting | — | **นอกขอบเขต Plan 01** ไปอยู่ Plan 04 |

**2. Placeholder scan** — ไม่มี TBD/TODO ทุก step มีโค้ดจริงและคำสั่งรันจริง

**3. Type consistency** — ตรวจแล้ว: `RichMenuSizeName` ใช้ชื่อเดียวกันทั้ง Task 2/10 · `Bounds` ใช้ร่วมกันทั้ง Task 2/11/13 · `normalize(input, sizeName, options?)` signature ตรงกันระหว่าง Task 10 และการเรียกใน Task 11 · `inspectImage` คืน `ImageFacts` ที่ Task 10 ใช้ฟิลด์ `hasAlpha` ตรงกัน · `LineClient` เมธอดที่ Task 14 เรียกมีครบใน Task 7

---

## แผนถัดไป

Plan 01 นี้จบแล้วได้ **library ที่ทำงานได้จริงและทดสอบครบโดยไม่ต้องมี Strapi** — ประมาณ 4–5 วัน

| Plan | ขอบเขต | ทำไมยังไม่เขียนตอนนี้ |
|---|---|---|
| **02 — `ui`** | UIPort contract, CanvasEditor, 4 หน้าจอ, stub-port tests (มี dev server ให้เปิดดูในเบราว์เซอร์) | ต้องรู้ก่อนว่า API จริงของ `core` หน้าตาเป็นยังไงหลังลงมือ ถ้าเขียน step-level ตอนนี้แล้ว `core` ขยับนิดเดียวก็ต้องรื้อทั้งแผน |
| **03 — adapter v4** | entry files, entityService repo, DS v1 port, content-types, RBAC, cron lock, audit log | ขึ้นกับ UIPort ที่จะนิ่งหลัง Plan 02 |
| **04 — adapter v5 + release** | DS v2 port, documents() repo, i18n, docs, demo deploy, publish 1.0.0 | ขึ้นกับ Plan 03 |

เขียนแผนละเอียดล่วงหน้า 12 วันไม่ใช่ความรอบคอบ แต่คือการรับประกันว่าจะต้องรื้อ — จะเขียน Plan 02 ตอน Plan 01 ใกล้จบ
