# LINE Rich Menu — Plan 02: `@fosivo/line-rich-menu-ui`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง React UI ทั้งหมดของปลั๊กอิน — canvas editor, ตัวเลือก template, ฟอร์ม action, และหน้าจอทั้งสาม — โดยที่แพ็กเกจนี้ **ไม่รู้จัก Strapi, ไม่รู้จัก Design System เวอร์ชันไหน, และไม่รู้จัก router** เลย ทุกอย่างที่ต่างกันระหว่าง Strapi 4 กับ 5 เข้ามาทาง `UIPort` ตัวเดียว

**Architecture:** `ui` พึ่งได้แค่ `react` (peer) กับ `@fosivo/line-rich-menu-core/browser` เท่านั้น สิ่งที่ต่างกันระหว่างสองเวอร์ชันของ Strapi — component ของ Design System, ตัวยิง HTTP, การแจ้งเตือน, การนำทาง, การแปลภาษา — ถูกยกออกไปเป็น `UIPort` ที่ adapter เป็นคนฉีดเข้ามา ส่วน `CanvasEditor` ซึ่งเป็นชิ้นที่แพงที่สุด **จงใจไม่ผ่าน port** เพราะเขียนด้วย `div` + inline style ล้วน จึงเขียนครั้งเดียวใช้ได้ทั้งสองเวอร์ชัน

**Tech Stack:** React 18 (peer) · TypeScript 5.6 · vitest + @testing-library/react + jsdom · tsup · Vite (เฉพาะ playground) · zero CSS files

**Spec:** `docs/superpowers/specs/2026-08-20-line-rich-menu-strapi-plugin-design.md` — §5 ทั้งหมด (5.1–5.7) คือสัญญาที่แผนนี้ต้องทำให้ครบ

**สิ่งที่ Plan 01 ส่งต่อมา:** `docs/superpowers/plans/2026-08-20-line-rich-menu-carry-forward.md` — อ่านหัวข้อ "For Plan 02" ก่อนเริ่ม

---

## Global Constraints

ทุก task อยู่ภายใต้ข้อจำกัดเหล่านี้เสมอ

- **`packages/ui` ห้าม import สิ่งเหล่านี้เด็ดขาด** — บังคับด้วยทั้ง ESLint และเทสต์ใน Task 1:
  `@strapi/*` · `styled-components` · `react-router-dom` · `react-intl` · `@strapi/design-system` · `@strapi/helper-plugin`
- **ห้ามมีไฟล์ `.css` ในแพ็กเกจนี้** — ใช้ inline style และ `<style>` ที่ฉีดเองครั้งเดียวสำหรับ pseudo-selector เท่านั้น เหตุผลอยู่ใน Task 4
- import จาก core ต้องเป็น **`@fosivo/line-rich-menu-core/browser`** เท่านั้น ห้ามใช้ `"."` — subpath เต็มลาก `sharp` เข้าบันเดิลของ admin panel
- **Node 20** (`engines: >=20.15.0`) · pnpm **10.34.5**
- ขนาดผืนผ้าใบที่ LINE รับ 6 แบบ · ช่องแตะได้ **1–20 ช่อง** · `chatBarText` **1–14 ตัว** · ชื่อ record **≤30 ตัว** (คนละตัวกับ `name` ใน payload ที่ยอมได้ 300)
- URI scheme ที่อนุญาต: `https`, `http`, `tel`, `line`
- **ห้ามแสดงข้อความภาษาไทยหรืออังกฤษแบบ hardcode ใน component** — ทุกข้อความที่ผู้ใช้เห็นต้องผ่าน `port.t(key)` เท่านั้น (สเปก §12 ให้ `en` เป็นค่าเริ่มต้น)
- `tsconfig` เปิด `noUncheckedIndexedAccess` · ESLint `@typescript-eslint/consistent-type-imports: error`, `prefer-const`
- ทุก commit ใช้ Conventional Commits
- **`packages/ui/src/index.ts` ถูกแตะโดยหลาย task** — Task 1 สร้าง จากนั้น Task 2–13 ให้ **เพิ่มบรรทัด `export *` ของตัวเองต่อท้าย** ห้ามเขียนทับ Task 14 มีรายการฉบับสมบูรณ์ไว้ตรวจทานตอนท้าย
- **`git add` ในแต่ละ Step อาจไม่ครบ** — ถ้า task แก้ `src/index.ts` ให้ commit ไปด้วยเสมอ การปล่อยให้ export ค้างไม่ commit คือสถานะที่พัง

---

## File Structure

```
packages/ui/
├─ package.json                    @fosivo/line-rich-menu-ui — react เป็น peer
├─ tsconfig.json  vitest.config.ts  tsup.config.ts
├─ src/
│  ├─ index.ts                     public API ของแพ็กเกจ
│  ├─ port.ts                      นิยาม UIPort + PortProvider + usePort  (ไม่มี implementation)
│  ├─ stub-port.tsx                implementation ครบชุดสำหรับเทสต์และ playground
│  ├─ action-form.ts               ตัวแปลง ActionFormState ⇄ Action  (ฟังก์ชันบริสุทธิ์)
│  ├─ styles.ts                    ค่าคงที่ของ style + ตัวฉีด <style> ครั้งเดียว
│  ├─ components/
│  │  ├─ CanvasEditor.tsx          overlay จาก bounds · คีย์บอร์ด · ลาก/ปรับขนาด
│  │  ├─ TemplatePicker.tsx        modal แบ่ง Large/Compact + ยืนยันก่อนเปลี่ยน
│  │  ├─ ActionForm.tsx            ฟอร์มของ action หนึ่งช่อง
│  │  ├─ AreaList.tsx              accordion + สลับ list/กางหมด + error ราย ช่อง
│  │  ├─ ChatBarSettings.tsx       สองสวิตช์ + ตัวนับตัวอักษร
│  │  ├─ MainSettings.tsx          ชื่อ + ช่วงเวลาแสดงผล
│  │  ├─ Preview.tsx               กรอบโทรศัพท์ + แถบแชทที่อัปเดตสด
│  │  └─ ImageField.tsx            อัปโหลดผ่าน POST /upload + ตรวจขนาดฝั่ง client
│  ├─ pages/
│  │  ├─ RichMenuEditor.tsx        ฟอร์มยาวหน้าเดียวตาม §5.7
│  │  ├─ RichMenuList.tsx
│  │  └─ ChannelSettings.tsx
│  └─ i18n/{en,th}.json            source of truth ของข้อความ — adapter คัดลอกไปตอน build
├─ tests/                          หนึ่งไฟล์ต่อหนึ่ง component + เทสต์สัญญา
└─ tools/ui-playground/            Vite dev server เปิดดูใน browser ด้วย stub port
```

**เหตุผลของการแบ่ง:** `port.ts` มีแต่ type จึงไม่มีทางลาก implementation ของ Strapi เข้ามาโดยบังเอิญ · `action-form.ts` แยกเป็นฟังก์ชันบริสุทธิ์เพราะเป็นจุดที่ตรรกะพลาดง่ายที่สุดและทดสอบได้โดยไม่ต้อง render · `styles.ts` รวมค่าคงที่ไว้ที่เดียวเพื่อให้ component ไม่ต้องพก magic number

---

## Task 1: Scaffold `packages/ui` + ยามกัน dependency ต้องห้าม

**Files:**
- Create: `packages/ui/package.json`, `tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`, `src/index.ts`
- Modify: `eslint.config.js` (เพิ่ม no-restricted-imports เฉพาะ packages/ui)
- Test: `packages/ui/tests/no-framework-deps.test.ts`

**Interfaces:**
- Consumes: `@fosivo/line-rich-menu-core/browser` (Plan 01)
- Produces: แพ็กเกจ `@fosivo/line-rich-menu-ui` ที่ `pnpm test` เห็น

- [ ] **Step 1: สร้าง package**

`packages/ui/package.json`
```json
{
  "name": "@fosivo/line-rich-menu-ui",
  "version": "0.0.0",
  "type": "module",
  "license": "AGPL-3.0-only",
  "engines": { "node": ">=20.15.0" },
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
  "files": ["dist", "LICENSE", "COMMERCIAL-LICENSE.md"],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fosivo/line-rich-menu-core": "workspace:*"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

`packages/ui/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": {
      "@fosivo/line-rich-menu-core/browser": ["../core/src/browser.ts"]
    }
  },
  "include": ["src", "tests"]
}
```

หมายเหตุ: `lib` ที่นี่ต้องมี `DOM` ต่างจาก `core` ที่ห้ามมี — UI รันในเบราว์เซอร์จริง ส่วน `jsx: react-jsx` คือ automatic runtime ซึ่งทำงานได้ทั้งบน webpack 5 ของ Strapi 4 และ Vite ของ Strapi 5

`packages/ui/vitest.config.ts`
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'ui',
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@fosivo/line-rich-menu-core/browser': fileURLToPath(
        new URL('../core/src/browser.ts', import.meta.url),
      ),
    },
  },
})
```

`packages/ui/tests/setup.ts`
```ts
import '@testing-library/jest-dom/vitest'
```

`packages/ui/tsup.config.ts`
```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  removeNodeProtocol: false,
})
```

`packages/ui/src/index.ts`
```ts
export const UI_VERSION = '0.0.0'
```

ติดตั้ง: `pnpm add -D -w @testing-library/react @testing-library/jest-dom jsdom` และ `pnpm add -D --filter @fosivo/line-rich-menu-ui react react-dom @types/react @types/react-dom`

- [ ] **Step 2: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/no-framework-deps.test.ts`
```ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const uiRoot = fileURLToPath(new URL('..', import.meta.url))

const BANNED = [
  '@strapi/',
  'styled-components',
  'react-router-dom',
  'react-intl',
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
  })
}

describe('ui ไม่ผูกกับ framework ใด ๆ', () => {
  const pkg = JSON.parse(readFileSync(join(uiRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

  it('manifest ไม่มี dependency ต้องห้าม', () => {
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]
    for (const banned of BANNED) {
      expect(names.filter((n) => n.startsWith(banned))).toEqual([])
    }
  })

  // manifest อย่างเดียวไม่พอ — ไฟล์อาจ import ชื่อที่ hoist มาจาก root ของ workspace ได้
  it('ไม่มีไฟล์ไหน import ของต้องห้าม', () => {
    const offenders: string[] = []
    for (const file of walk(join(uiRoot, 'src'))) {
      const source = readFileSync(file, 'utf8')
      for (const banned of BANNED) {
        if (source.includes(`from '${banned}`) || source.includes(`from "${banned}`)) {
          offenders.push(`${file.replace(uiRoot, '')} → ${banned}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('import core ผ่าน subpath /browser เท่านั้น — "." ลาก sharp เข้าบันเดิล', () => {
    const offenders: string[] = []
    for (const file of walk(join(uiRoot, 'src'))) {
      const source = readFileSync(file, 'utf8')
      if (/from ['"]@fosivo\/line-rich-menu-core['"]/.test(source)) {
        offenders.push(file.replace(uiRoot, ''))
      }
    }
    expect(offenders).toEqual([])
  })

  it('ไม่มีไฟล์ .css ในแพ็กเกจ — style ต้อง inline หรือฉีดผ่าน <style>', () => {
    const css = walk(join(uiRoot, 'src')).filter((f) => f.endsWith('.css'))
    expect(css).toEqual([])
  })
})
```

- [ ] **Step 3: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm install && pnpm vitest run packages/ui/tests/no-framework-deps.test.ts`
Expected: FAIL — ยังไม่มี `packages/ui/src` ให้ walk

- [ ] **Step 4: สร้าง `src/index.ts` แล้วรันให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/no-framework-deps.test.ts`
Expected: PASS 4 tests

พิสูจน์ว่ายามทำงานจริง: เพิ่ม `import x from 'styled-components'` ลง `src/index.ts` ชั่วคราว รันซ้ำ ต้อง FAIL แล้วเอาออก

- [ ] **Step 5: เพิ่มยามชั้นที่สองใน ESLint**

เพิ่มใน `eslint.config.js` ต่อจาก config เดิม
```js
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@strapi/*'], message: 'ui ต้องไม่รู้จัก Strapi — รับผ่าน UIPort แทน' },
          { group: ['styled-components'], message: 'Strapi 4 ใช้ v5 และ Strapi 5 ใช้ v6 — ห้ามผูก' },
          { group: ['react-router-dom'], message: 'Strapi 4 ใช้ router v5 และ Strapi 5 ใช้ v6 — รับผ่าน port.nav' },
          { group: ['react-intl'], message: 'รับผ่าน port.t แทน' },
          { group: ['@fosivo/line-rich-menu-core'], message: 'ใช้ /browser เท่านั้น — "." ลาก sharp เข้าบันเดิล' },
        ],
      }],
    },
  },
```

Run: `pnpm lint`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add packages/ui eslint.config.js package.json pnpm-lock.yaml
git commit -m "chore(ui): scaffold the ui package with framework-independence guards"
```

---

## Task 2: `UIPort` — สัญญาที่ adapter ต้อง implement

**Files:**
- Create: `packages/ui/src/port.ts`, `packages/ui/src/stub-port.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/tests/port.test.tsx`

**Interfaces:**
- Consumes: React 18
- Produces:
  - `interface UIPort { ui: UIPrimitives; http: HttpClient; toast(msg): void; nav: Nav; t(key, values?): string }`
  - `const PortProvider: React.FC<{ value: UIPort; children: React.ReactNode }>`
  - `function usePort(): UIPort`
  - `function createStubPort(overrides?: Partial<UIPort>): UIPort`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/port.test.tsx`
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider, usePort } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'

function Probe() {
  const port = usePort()
  return <span>{port.t('probe.key')}</span>
}

describe('UIPort', () => {
  it('component ที่อยู่ใน PortProvider เห็น port ที่ฉีดเข้าไป', () => {
    const port = createStubPort({ t: (key) => `แปลแล้ว:${key}` })
    render(<PortProvider value={port}><Probe /></PortProvider>)
    expect(screen.getByText('แปลแล้ว:probe.key')).toBeInTheDocument()
  })

  it('เรียก usePort นอก provider ต้องพังทันทีพร้อมบอกวิธีแก้ ไม่ใช่คืน undefined เงียบ ๆ', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/PortProvider/)
    spy.mockRestore()
  })

  it('stub port มีครบทุกอย่างที่ UIPort ประกาศไว้', () => {
    const port = createStubPort()
    expect(Object.keys(port.ui).length).toBeGreaterThanOrEqual(15)
    for (const method of ['get', 'post', 'put', 'del'] as const) {
      expect(typeof port.http[method]).toBe('function')
    }
    expect(typeof port.toast).toBe('function')
    expect(typeof port.nav.push).toBe('function')
    expect(typeof port.t).toBe('function')
  })

  it('stub port รับ override เฉพาะบางส่วนได้ โดยไม่ต้องประกอบใหม่ทั้งก้อน', () => {
    const toast = vi.fn()
    const port = createStubPort({ toast })
    port.toast({ type: 'success', message: 'ok' })
    expect(toast).toHaveBeenCalledOnce()
    expect(typeof port.t).toBe('function')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/port.test.tsx`
Expected: FAIL — `Cannot find module '../src/port.js'`

- [ ] **Step 3: เขียน `port.ts`**

`packages/ui/src/port.ts`
```tsx
import { createContext, createElement, useContext, type ComponentType, type ReactNode } from 'react'

/**
 * component ทุกตัวของแพ็กเกจนี้วาดด้วยชุดนี้ ไม่ใช่ด้วย Design System โดยตรง
 * Strapi 4 ใช้ DS v1 และ Strapi 5 ใช้ DS v2 ซึ่ง API ต่างกันมาก การรับผ่าน port
 * ทำให้เขียน component ครั้งเดียวแล้ว adapter สองตัวเป็นคนจับคู่ให้เอง
 */
export interface UIPrimitives {
  Button: ComponentType<{ onClick?: () => void; disabled?: boolean; variant?: 'default' | 'secondary' | 'danger'; type?: 'button' | 'submit'; children?: ReactNode }>
  IconButton: ComponentType<{ onClick?: () => void; label: string; disabled?: boolean; children?: ReactNode }>
  TextInput: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; hint?: string; error?: string; maxLength?: number; disabled?: boolean; placeholder?: string }>
  Textarea: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; error?: string; rows?: number }>
  Select: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; error?: string; disabled?: boolean; children?: ReactNode }>
  Option: ComponentType<{ value: string; children?: ReactNode }>
  Checkbox: ComponentType<{ name: string; checked: boolean; onChange: (checked: boolean) => void; children?: ReactNode }>
  Radio: ComponentType<{ name: string; value: string; checked: boolean; onChange: (value: string) => void; children?: ReactNode }>
  Toggle: ComponentType<{ name: string; checked: boolean; onChange: (checked: boolean) => void; label?: string }>
  Modal: ComponentType<{ open: boolean; onClose: () => void; title: string; footer?: ReactNode; children?: ReactNode }>
  Typography: ComponentType<{ variant?: 'alpha' | 'beta' | 'delta' | 'omega' | 'pi'; textColor?: 'neutral600' | 'neutral800' | 'danger600'; children?: ReactNode }>
  Flex: ComponentType<{ direction?: 'row' | 'column'; gap?: number; alignItems?: string; justifyContent?: string; wrap?: string; children?: ReactNode }>
  Divider: ComponentType<Record<string, never>>
  Alert: ComponentType<{ variant: 'success' | 'warning' | 'danger'; title?: string; onClose?: () => void; children?: ReactNode }>
  Loader: ComponentType<{ children?: ReactNode }>
  Tooltip: ComponentType<{ label: string; children?: ReactNode }>
}

export interface HttpClient {
  get<T>(url: string): Promise<T>
  post<T>(url: string, body?: unknown): Promise<T>
  put<T>(url: string, body?: unknown): Promise<T>
  del<T>(url: string): Promise<T>
}

export interface ToastMessage {
  type: 'success' | 'warning' | 'danger'
  message: string
}

export interface Nav {
  push(path: string): void
  Link: ComponentType<{ to: string; children?: ReactNode }>
}

export interface UIPort {
  ui: UIPrimitives
  http: HttpClient
  toast(message: ToastMessage): void
  nav: Nav
  /** สเปก §12 — ข้อความที่ผู้ใช้เห็นต้องผ่านตัวนี้เสมอ ห้าม hardcode ใน component */
  t(key: string, values?: Record<string, string | number>): string
}

const PortContext = createContext<UIPort | null>(null)

export function PortProvider({ value, children }: { value: UIPort; children: ReactNode }) {
  return createElement(PortContext.Provider, { value }, children)
}

export function usePort(): UIPort {
  const port = useContext(PortContext)
  if (port === null) {
    throw new Error(
      'usePort ถูกเรียกนอก PortProvider — adapter ต้องครอบหน้าจอด้วย <PortProvider value={...}>',
    )
  }
  return port
}
```

- [ ] **Step 4: เขียน `stub-port.tsx`**

`packages/ui/src/stub-port.tsx`
```tsx
import type { UIPort, UIPrimitives } from './port.js'

/**
 * implementation ครบชุดที่ไม่พึ่ง Strapi เลย ใช้สองที่:
 * เทสต์ของแพ็กเกจนี้ทั้งหมด และ playground ที่เปิดดูในเบราว์เซอร์
 *
 * ถ้าเทสต์ทุกตัวรันผ่านชุดนี้ได้ แปลว่า component ไม่ได้แอบพึ่ง DS จริงอยู่
 */
const primitives: UIPrimitives = {
  Button: ({ onClick, disabled, variant = 'default', type = 'button', children }) => (
    <button type={type} onClick={onClick} disabled={disabled} data-variant={variant}>{children}</button>
  ),
  IconButton: ({ onClick, label, disabled, children }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}>{children}</button>
  ),
  TextInput: ({ name, value, onChange, label, hint, error, maxLength, disabled, placeholder }) => (
    <label>
      {label}
      <input
        name={name}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <small>{hint}</small> : null}
      {error ? <span id={`${name}-error`} role="alert">{error}</span> : null}
    </label>
  ),
  Textarea: ({ name, value, onChange, label, error, rows = 3 }) => (
    <label>
      {label}
      <textarea name={name} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} />
      {error ? <span role="alert">{error}</span> : null}
    </label>
  ),
  Select: ({ name, value, onChange, label, error, disabled, children }) => (
    <label>
      {label}
      <select name={name} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      {error ? <span role="alert">{error}</span> : null}
    </label>
  ),
  Option: ({ value, children }) => <option value={value}>{children}</option>,
  Checkbox: ({ name, checked, onChange, children }) => (
    <label>
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  ),
  Radio: ({ name, value, checked, onChange, children }) => (
    <label>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} />
      {children}
    </label>
  ),
  Toggle: ({ name, checked, onChange, label }) => (
    <label>
      {label}
      <input type="checkbox" role="switch" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  ),
  Modal: ({ open, onClose, title, footer, children }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {footer}
        <button type="button" onClick={onClose}>close</button>
      </div>
    ) : null,
  Typography: ({ children }) => <span>{children}</span>,
  Flex: ({ direction = 'row', gap = 0, children }) => (
    <div style={{ display: 'flex', flexDirection: direction, gap }}>{children}</div>
  ),
  Divider: () => <hr />,
  Alert: ({ variant, title, children }) => (
    <div role="status" data-variant={variant}>{title}{children}</div>
  ),
  Loader: ({ children }) => <div role="progressbar">{children}</div>,
  Tooltip: ({ label, children }) => <span title={label}>{children}</span>,
}

export function createStubPort(overrides: Partial<UIPort> = {}): UIPort {
  return {
    ui: primitives,
    http: {
      get: async () => ({}) as never,
      post: async () => ({}) as never,
      put: async () => ({}) as never,
      del: async () => ({}) as never,
    },
    toast: () => {},
    nav: { push: () => {}, Link: ({ to, children }) => <a href={to}>{children}</a> },
    t: (key) => key,
    ...overrides,
  }
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/port.test.tsx`
Expected: PASS 4 tests

- [ ] **Step 6: export แล้ว commit**

`packages/ui/src/index.ts`
```ts
export * from './port.js'
export * from './stub-port.js'
```

```bash
git add packages/ui
git commit -m "feat(ui): define the UIPort contract and a complete stub implementation"
```

---

## Task 3: `action-form.ts` — ตัวแปลง form state ⇄ payload

**Files:**
- Create: `packages/ui/src/action-form.ts`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/tests/action-form.test.ts`

**Interfaces:**
- Consumes: `Action`, `ActionType` จาก `@fosivo/line-rich-menu-core/browser`
- Produces:
  - `interface ActionFormState { type: ActionType; label: string; text: string; uri: string; altUri: string; data: string; displayText: string; mode: 'date' | 'time' | 'datetime'; richMenuAliasId: string; clipboardText: string }`
  - `function emptyActionForm(): ActionFormState`
  - `function toAction(state: ActionFormState): Action`
  - `function fromAction(action: Action): ActionFormState`

สเปก §5.4 อธิบายว่าทำไมต้องมีชั้นนี้: ฟอร์มเก็บทุกฟิลด์ไว้เสมอเพื่อให้ผู้ใช้สลับชนิด action ไปกลับได้โดยไม่สูญเสียสิ่งที่พิมพ์ ส่วน payload เป็น discriminated union ที่ต้องไม่มีฟิลด์ว่างติดไป ถ้าไม่มีตัวแปลงจะเจออาการใดอาการหนึ่งเสมอ

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/action-form.test.ts`
```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { emptyActionForm, fromAction, toAction } from '../src/action-form.js'

describe('toAction', () => {
  it('ตัดฟิลด์ที่ไม่เกี่ยวกับชนิดที่เลือกทิ้ง', () => {
    const state = { ...emptyActionForm(), type: 'message' as const, text: 'สวัสดี', uri: 'https://a.test' }
    expect(toAction(state)).toEqual({ type: 'message', text: 'สวัสดี' })
  })

  it('ไม่ส่งฟิลด์ที่เป็นค่าว่างไปให้ LINE — LINE ปฏิเสธ payload ที่มีสตริงว่าง', () => {
    const action = toAction({ ...emptyActionForm(), type: 'message', text: 'hi', label: '' })
    expect(Object.keys(action)).toEqual(['type', 'text'])
  })

  it('ใส่ label เมื่อผู้ใช้กรอกมา', () => {
    const action = toAction({ ...emptyActionForm(), type: 'message', text: 'hi', label: 'ปุ่ม' })
    expect(action).toEqual({ type: 'message', text: 'hi', label: 'ปุ่ม' })
  })

  it('altUri กลายเป็น { desktop } ตามรูปแบบจริงของ LINE ไม่ใช่สตริงแบน', () => {
    const action = toAction({
      ...emptyActionForm(), type: 'uri', uri: 'https://m.test', altUri: 'https://d.test',
    })
    expect(action).toEqual({ type: 'uri', uri: 'https://m.test', altUri: { desktop: 'https://d.test' } })
  })

  it('camera / cameraRoll / location ต้องมี label เสมอตามสเปก LINE', () => {
    for (const type of ['camera', 'cameraRoll', 'location'] as const) {
      expect(toAction({ ...emptyActionForm(), type, label: 'เปิด' })).toEqual({ type, label: 'เปิด' })
    }
  })

  it('datetimepicker พก mode มาด้วย', () => {
    const action = toAction({ ...emptyActionForm(), type: 'datetimepicker', data: 'd=1', mode: 'date' })
    expect(action).toEqual({ type: 'datetimepicker', data: 'd=1', mode: 'date' })
  })

  it('richmenuswitch พก aliasId และ data', () => {
    const action = toAction({
      ...emptyActionForm(), type: 'richmenuswitch', richMenuAliasId: 'tab-b', data: 'to=b',
    })
    expect(action).toEqual({ type: 'richmenuswitch', richMenuAliasId: 'tab-b', data: 'to=b' })
  })
})

describe('fromAction', () => {
  it('เติมฟิลด์ที่ขาดเป็นสตริงว่าง เพื่อให้ฟอร์มผูกค่าได้ทุกช่อง', () => {
    const state = fromAction({ type: 'message', text: 'hi' })
    expect(state.uri).toBe('')
    expect(state.data).toBe('')
    expect(state.text).toBe('hi')
  })

  it('แบน altUri.desktop กลับมาเป็นช่องเดียวสำหรับฟอร์ม', () => {
    const state = fromAction({ type: 'uri', uri: 'https://m.test', altUri: { desktop: 'https://d.test' } })
    expect(state.altUri).toBe('https://d.test')
  })
})

describe('round trip', () => {
  it('fromAction(toAction(x)) รักษาทุกฟิลด์ที่เกี่ยวกับชนิดนั้นไว้ครบ', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom('message', 'uri', 'postback', 'clipboard'),
          label: fc.string({ minLength: 1, maxLength: 20 }),
          text: fc.string({ minLength: 1, maxLength: 300 }),
          uri: fc.constantFrom('https://a.test', 'http://b.test', 'tel:0812345678'),
          data: fc.string({ minLength: 1, maxLength: 300 }),
          clipboardText: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        (partial) => {
          const state = { ...emptyActionForm(), ...partial }
          const round = fromAction(toAction(state))
          expect(round.type).toBe(state.type)
          if (state.type === 'message') expect(round.text).toBe(state.text)
          if (state.type === 'uri') expect(round.uri).toBe(state.uri)
          if (state.type === 'postback') expect(round.data).toBe(state.data)
          if (state.type === 'clipboard') expect(round.clipboardText).toBe(state.clipboardText)
          expect(round.label).toBe(state.label)
        },
      ),
      { numRuns: 300 },
    )
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/action-form.test.ts`
Expected: FAIL — `Cannot find module '../src/action-form.js'`

- [ ] **Step 3: เขียน `action-form.ts`**

`packages/ui/src/action-form.ts`
```ts
import type { Action, ActionType } from '@fosivo/line-rich-menu-core/browser'

/**
 * รูปทรงของ action ในฟอร์ม — แบน มีทุกฟิลด์เสมอ
 *
 * จงใจไม่ใช่ discriminated union แบบที่ core ใช้ เพราะผู้ใช้สลับชนิด action ไปกลับ
 * แล้วต้องไม่สูญเสียสิ่งที่พิมพ์ไว้ (สเปก §5.4) union จะบังคับให้ทิ้งฟิลด์ที่ไม่ตรงชนิดทันที
 */
export interface ActionFormState {
  type: ActionType
  label: string
  text: string
  uri: string
  altUri: string
  data: string
  displayText: string
  mode: 'date' | 'time' | 'datetime'
  richMenuAliasId: string
  clipboardText: string
}

export function emptyActionForm(): ActionFormState {
  return {
    type: 'message',
    label: '',
    text: '',
    uri: '',
    altUri: '',
    data: '',
    displayText: '',
    mode: 'datetime',
    richMenuAliasId: '',
    clipboardText: '',
  }
}

/** ใส่คู่ key/value ก็ต่อเมื่อมีค่าจริง — สตริงว่างที่หลุดไปถึง LINE จะถูกปฏิเสธ */
function withOptional<T extends object>(base: T, extra: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== '' && value !== undefined) out[key] = value
  }
  return out as T
}

export function toAction(state: ActionFormState): Action {
  const { label } = state
  switch (state.type) {
    case 'message':
      return withOptional({ type: 'message', text: state.text } as const, { label })
    case 'uri':
      return withOptional({ type: 'uri', uri: state.uri } as const, {
        label,
        altUri: state.altUri === '' ? undefined : { desktop: state.altUri },
      })
    case 'postback':
      return withOptional({ type: 'postback', data: state.data } as const, {
        label,
        displayText: state.displayText,
      })
    case 'datetimepicker':
      return withOptional({ type: 'datetimepicker', data: state.data, mode: state.mode } as const, { label })
    case 'richmenuswitch':
      return withOptional(
        { type: 'richmenuswitch', richMenuAliasId: state.richMenuAliasId, data: state.data } as const,
        { label },
      )
    case 'clipboard':
      return withOptional({ type: 'clipboard', clipboardText: state.clipboardText } as const, { label })
    case 'camera':
    case 'cameraRoll':
    case 'location':
      // สามชนิดนี้ LINE บังคับให้มี label เสมอ ไม่ใช่ optional
      return { type: state.type, label } as Action
  }
}

export function fromAction(action: Action): ActionFormState {
  const state = emptyActionForm()
  state.type = action.type
  if ('label' in action && action.label !== undefined) state.label = action.label
  if ('text' in action) state.text = action.text
  if ('uri' in action) state.uri = action.uri
  if ('altUri' in action && action.altUri !== undefined) state.altUri = action.altUri.desktop
  if ('data' in action) state.data = action.data
  if ('displayText' in action && action.displayText !== undefined) state.displayText = action.displayText
  if ('mode' in action) state.mode = action.mode
  if ('richMenuAliasId' in action) state.richMenuAliasId = action.richMenuAliasId
  if ('clipboardText' in action) state.clipboardText = action.clipboardText
  return state
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/action-form.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/action-form.ts packages/ui/src/index.ts packages/ui/tests/action-form.test.ts
git commit -m "feat(ui): map between flat action form state and the LINE payload union"
```

---

## Task 4: `CanvasEditor` — วาด overlay จาก bounds และเลือกช่องด้วยเมาส์หรือคีย์บอร์ด

**Files:**
- Create: `packages/ui/src/styles.ts`, `packages/ui/src/components/CanvasEditor.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/tests/canvas-editor.test.tsx`

**Interfaces:**
- Consumes: `Bounds`, `RichMenuSize`, `areaLabel` จาก core
- Produces:
  - `interface CanvasEditorProps { size: RichMenuSize; bounds: readonly Bounds[]; imageUrl?: string; showOutlines: boolean; activeIndex: number | null; onSelect(index: number): void; onBoundsChange?(index: number, next: Bounds): void; errors?: Readonly<Record<number, string>> }`
  - `const CanvasEditor: React.FC<CanvasEditorProps>`
  - `function injectStylesOnce(): void` จาก `styles.ts`

**นี่คือชิ้นที่ทั้งสถาปัตยกรรมพึ่งพา** — ถ้ามันต้องใช้ Design System เมื่อไหร่ แผนสองอะแดปเตอร์จะพัง จึงห้ามแตะ `usePort().ui` ทั้งไฟล์

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/canvas-editor.test.tsx`
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { TEMPLATES } from '@fosivo/line-rich-menu-core/browser'
import { describe, expect, it, vi } from 'vitest'
import { CanvasEditor } from '../src/components/CanvasEditor.js'

const template = TEMPLATES['RICH_MENU_TEMPLATE_201']!

function setup(overrides: Partial<React.ComponentProps<typeof CanvasEditor>> = {}) {
  const onSelect = vi.fn()
  render(
    <CanvasEditor
      size={template.size}
      bounds={template.bounds}
      showOutlines
      activeIndex={null}
      onSelect={onSelect}
      {...overrides}
    />,
  )
  return { onSelect }
}

describe('CanvasEditor', () => {
  it('วาดช่องครบตามจำนวน bounds', () => {
    setup()
    expect(screen.getAllByRole('button')).toHaveLength(template.bounds.length)
  })

  it('วางแต่ละช่องเป็นเปอร์เซ็นต์ของผืนผ้าใบ ไม่ใช่พิกเซลตายตัว', () => {
    setup()
    const first = screen.getAllByRole('button')[0]!
    // 833/2500 = 33.32%
    expect(first.style.width).toBe('33.32%')
    expect(first.style.left).toBe('0%')
  })

  it('เขียนขนาดพิกเซลจริงกำกับไว้เมื่อเปิด outline — คนเอาไปทำอาร์ตเวิร์กให้ตรงได้', () => {
    setup()
    expect(screen.getAllByText('833×843').length).toBeGreaterThan(0)
  })

  it('ซ่อนกรอบและตัวเลขเมื่อปิด outline', () => {
    setup({ showOutlines: false })
    expect(screen.queryByText('833×843')).not.toBeInTheDocument()
  })

  it('ติดป้าย A B C ตามลำดับช่อง', () => {
    setup()
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${letter}\\b`) })).toBeInTheDocument()
    }
  })

  it('คลิกช่องแล้วแจ้ง index กลับไป', () => {
    const { onSelect } = setup()
    fireEvent.click(screen.getAllByRole('button')[2]!)
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  // สเปก §5.6 ข้อ 1 — editor ต้องใช้ด้วยคีย์บอร์ดได้
  it.each([['Enter'], [' ']])('เลือกช่องด้วยปุ่ม %s ได้', (key) => {
    const { onSelect } = setup()
    fireEvent.keyDown(screen.getAllByRole('button')[1]!, { key })
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('ทุกช่องรับโฟกัสได้ตามลำดับ', () => {
    setup()
    for (const area of screen.getAllByRole('button')) {
      expect(area).toHaveAttribute('tabindex', '0')
    }
  })

  it('ปุ่มอื่นที่ไม่ใช่ Enter หรือ Space ต้องไม่เลือกช่อง', () => {
    const { onSelect } = setup()
    fireEvent.keyDown(screen.getAllByRole('button')[0]!, { key: 'a' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('บอกว่าช่องไหนถูกเลือกอยู่ผ่าน aria-pressed', () => {
    setup({ activeIndex: 3 })
    expect(screen.getAllByRole('button')[3]!).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button')[0]!).toHaveAttribute('aria-pressed', 'false')
  })

  // สเปก §5.6 ข้อ 4 — error ต้องโผล่ที่ช่องที่ผิด
  it('ทำเครื่องหมายช่องที่มี error และบอกผ่าน aria-label', () => {
    setup({ errors: { 2: 'ต้องกรอก URI' } })
    expect(screen.getAllByRole('button')[2]!).toHaveAttribute('data-invalid', 'true')
    expect(screen.getAllByRole('button')[2]!.getAttribute('aria-label')).toContain('ต้องกรอก URI')
  })

  it('แสดงรูปพื้นหลังเมื่อมี', () => {
    setup({ imageUrl: 'https://cdn.test/menu.png' })
    const canvas = screen.getByTestId('rich-menu-canvas')
    expect(canvas.style.backgroundImage).toContain('https://cdn.test/menu.png')
  })

  it('คงสัดส่วนของผืนผ้าใบไว้ ไม่ว่ากล่องข้างนอกจะกว้างเท่าไหร่', () => {
    setup()
    expect(screen.getByTestId('rich-menu-canvas').style.aspectRatio).toBe('2500 / 1686')
  })

  it('ไม่แตะ UIPort เลย — เรนเดอร์ได้โดยไม่มี PortProvider ครอบ', () => {
    // ทั้งชุดนี้ไม่เคยครอบ PortProvider เลย ถ้า CanvasEditor แอบเรียก usePort จะพังทุกเคส
    expect(screen.getByTestId('rich-menu-canvas')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/canvas-editor.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/CanvasEditor.js'`

- [ ] **Step 3: เขียน `styles.ts`**

`packages/ui/src/styles.ts`
```ts
/**
 * แพ็กเกจนี้ไม่มีไฟล์ .css เลยโดยตั้งใจ
 *
 * การ ship CSS จาก library บังคับให้ bundler ของผู้ใช้ต้องประมวลผล CSS ที่มาจาก
 * node_modules ซึ่ง webpack 5 (Strapi 4) กับ Vite (Strapi 5) ตั้งค่าไม่เหมือนกัน
 * และเป็นแหล่งพังที่เลี่ยงได้ฟรี style ปกติจึงเป็น inline ทั้งหมด
 *
 * เหลืออย่างเดียวที่ inline style ทำไม่ได้คือ pseudo-selector — โดยเฉพาะ :focus-visible
 * ซึ่งจำเป็นจริงเพราะสเปก §5.6 บังคับให้ใช้คีย์บอร์ดได้ จึงฉีด <style> ก้อนเดียวเข้า head
 * ครั้งเดียวตลอดอายุหน้า
 */
const STYLE_ID = 'fosivo-line-rich-menu-styles'

const CSS = `
.frm-area:focus-visible {
  outline: 3px solid #4945ff;
  outline-offset: -3px;
  z-index: 2;
}
.frm-area:hover { background: rgba(73, 69, 255, 0.08); }
.frm-handle { opacity: 0; }
.frm-area:hover .frm-handle,
.frm-area:focus-visible .frm-handle { opacity: 1; }
`

export function injectStylesOnce(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

export const OUTLINE_COLOR = '#4945ff'
export const ACTIVE_FILL = 'rgba(73, 69, 255, 0.18)'
export const INVALID_COLOR = '#d02b20'
```

- [ ] **Step 4: เขียน `CanvasEditor.tsx`**

`packages/ui/src/components/CanvasEditor.tsx`
```tsx
import { useEffect, type CSSProperties, type KeyboardEvent } from 'react'
import { areaLabel, type Bounds, type RichMenuSize } from '@fosivo/line-rich-menu-core/browser'
import { ACTIVE_FILL, INVALID_COLOR, OUTLINE_COLOR, injectStylesOnce } from '../styles.js'

export interface CanvasEditorProps {
  size: RichMenuSize
  bounds: readonly Bounds[]
  imageUrl?: string
  showOutlines: boolean
  activeIndex: number | null
  onSelect(index: number): void
  onBoundsChange?(index: number, next: Bounds): void
  errors?: Readonly<Record<number, string>>
}

/** แปลงพิกเซลจริงเป็นเปอร์เซ็นต์ เพื่อให้ overlay ตรงกับรูปไม่ว่าจะย่อขยายแค่ไหน */
function pct(value: number, total: number): string {
  return `${Math.round((value / total) * 10000) / 100}%`
}

export function CanvasEditor({
  size, bounds, imageUrl, showOutlines, activeIndex, onSelect, errors,
}: CanvasEditorProps) {
  useEffect(injectStylesOnce, [])

  const canvasStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: `${size.width} / ${size.height}`,
    backgroundColor: '#eaeaef',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    ...(imageUrl === undefined ? {} : { backgroundImage: `url(${imageUrl})` }),
  }

  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    // การพิมพ์ใน input ที่ซ้อนอยู่ต้องไม่ถูกดักไปเลือกช่อง
    const target = event.target as HTMLElement
    if (target !== event.currentTarget) return
    event.preventDefault()
    onSelect(index)
  }

  return (
    <div data-testid="rich-menu-canvas" style={canvasStyle}>
      {bounds.map((b, index) => {
        const error = errors?.[index]
        const label = areaLabel(index)
        const isActive = activeIndex === index
        const style: CSSProperties = {
          position: 'absolute',
          left: pct(b.x, size.width),
          top: pct(b.y, size.height),
          width: pct(b.width, size.width),
          height: pct(b.height, size.height),
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          ...(showOutlines
            ? { border: `2px solid ${error === undefined ? OUTLINE_COLOR : INVALID_COLOR}` }
            : {}),
          ...(isActive ? { background: ACTIVE_FILL } : {}),
        }

        return (
          <div
            key={`${b.x}-${b.y}-${b.width}-${b.height}`}
            className="frm-area"
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            aria-label={error === undefined ? label : `${label} — ${error}`}
            data-invalid={error === undefined ? undefined : 'true'}
            style={style}
            onClick={() => onSelect(index)}
            onKeyDown={handleKeyDown(index)}
          >
            {showOutlines ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#32324d' }}>{label}</span>
                <span style={{ fontSize: '0.7rem', color: '#666687', fontVariantNumeric: 'tabular-nums' }}>
                  {b.width}×{b.height}
                </span>
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/canvas-editor.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/styles.ts packages/ui/src/components packages/ui/src/index.ts packages/ui/tests/canvas-editor.test.tsx
git commit -m "feat(ui): render the area overlay from bounds with keyboard selection"
```

---

## Task 5: `CanvasEditor` — ลากและปรับขนาดช่องสำหรับ custom layout

**Files:**
- Modify: `packages/ui/src/components/CanvasEditor.tsx`
- Test: `packages/ui/tests/canvas-editor-drag.test.tsx`

**Interfaces:**
- Consumes: `CanvasEditorProps` จาก Task 4
- Produces: เพิ่ม prop `snap?: number` (ค่าเริ่มต้น 10 หน่วยพิกเซลของผืนผ้าใบ) · เมื่อส่ง `onBoundsChange` มา ช่องจะลากได้และมีมือจับปรับขนาดที่มุมขวาล่าง

สเปกข้อ 5.2 บอกว่า custom layout แทบไม่มีต้นทุนเพิ่ม เพราะ component เดียวกันเรนเดอร์ bounds อะไรก็ได้ — task นี้คือส่วนที่เหลือของคำกล่าวนั้น คือทำให้ **แก้** bounds ได้ ไม่ใช่แค่ **แสดง**

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/canvas-editor-drag.test.tsx`
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasEditor } from '../src/components/CanvasEditor.js'

const SIZE = { width: 2500, height: 1686 }
const BOUNDS = [
  { x: 0, y: 0, width: 1250, height: 1686 },
  { x: 1250, y: 0, width: 1250, height: 1686 },
]

// jsdom คืนศูนย์ทั้งหมดจาก getBoundingClientRect ซึ่งทำให้คำนวณอัตราส่วนไม่ได้
// จึงต้องปลอมกล่องขนาด 1000x674 px บนจอ เทียบกับผืนผ้าใบ 2500x1686 → 1 px บนจอ = 2.5 หน่วย
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 674, width: 1000, height: 674,
    toJSON: () => ({}),
  } as DOMRect)
})

function setup(onBoundsChange = vi.fn()) {
  render(
    <CanvasEditor
      size={SIZE}
      bounds={BOUNDS}
      showOutlines
      activeIndex={0}
      onSelect={vi.fn()}
      onBoundsChange={onBoundsChange}
      snap={10}
    />,
  )
  return { onBoundsChange }
}

describe('CanvasEditor — ลากและปรับขนาด', () => {
  it('ไม่มีมือจับให้เห็นเลยถ้าไม่ได้ส่ง onBoundsChange มา — layout สำเร็จรูปต้องแก้ไม่ได้', () => {
    render(
      <CanvasEditor size={SIZE} bounds={BOUNDS} showOutlines activeIndex={0} onSelect={vi.fn()} />,
    )
    expect(screen.queryAllByTestId(/resize-handle/)).toHaveLength(0)
  })

  it('มีมือจับปรับขนาดหนึ่งอันต่อหนึ่งช่องเมื่อแก้ไขได้', () => {
    setup()
    expect(screen.getAllByTestId(/resize-handle/)).toHaveLength(BOUNDS.length)
  })

  it('ลากช่องแล้วแจ้ง bounds ใหม่ โดยแปลงพิกเซลบนจอกลับเป็นหน่วยของผืนผ้าใบ', () => {
    const { onBoundsChange } = setup()
    const area = screen.getAllByRole('button')[0]!
    fireEvent.pointerDown(area, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(area, { clientX: 140, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
    // เลื่อน 40 px บนจอ × 2.5 = 100 หน่วย
    expect(onBoundsChange).toHaveBeenLastCalledWith(0, { x: 100, y: 0, width: 1250, height: 1686 })
  })

  it('ดูดเข้าหาเส้นกริดตามค่า snap', () => {
    const { onBoundsChange } = setup()
    const area = screen.getAllByRole('button')[0]!
    fireEvent.pointerDown(area, { clientX: 100, clientY: 100, pointerId: 1 })
    // 7 px × 2.5 = 17.5 หน่วย → ดูดลงเป็น 20
    fireEvent.pointerMove(area, { clientX: 107, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
    const [, next] = onBoundsChange.mock.calls.at(-1)!
    expect(next.x % 10).toBe(0)
  })

  it('ลากออกนอกผืนผ้าใบไม่ได้ — ค่าถูกหนีบไว้ที่ขอบ', () => {
    const { onBoundsChange } = setup()
    const area = screen.getAllByRole('button')[0]!
    fireEvent.pointerDown(area, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(area, { clientX: -500, clientY: -500, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
    const [, next] = onBoundsChange.mock.calls.at(-1)!
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
  })

  it('ปรับขนาดแล้วเปลี่ยนแค่ความกว้างความสูง ไม่ขยับจุดเริ่ม', () => {
    const { onBoundsChange } = setup()
    const handle = screen.getAllByTestId(/resize-handle/)[0]!
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 674, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 460, clientY: 674, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    const [, next] = onBoundsChange.mock.calls.at(-1)!
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
    expect(next.width).toBe(1150)
  })

  it('ย่อจนติดลบไม่ได้ — ความกว้างอย่างน้อยเท่ากับหนึ่งช่องกริด', () => {
    const { onBoundsChange } = setup()
    const handle = screen.getAllByTestId(/resize-handle/)[0]!
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 674, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: -900, clientY: -900, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    const [, next] = onBoundsChange.mock.calls.at(-1)!
    expect(next.width).toBeGreaterThanOrEqual(10)
    expect(next.height).toBeGreaterThanOrEqual(10)
  })

  it('การกด Enter เพื่อเลือกช่องยังทำงานเหมือนเดิมแม้จะแก้ไขได้', () => {
    const onSelect = vi.fn()
    render(
      <CanvasEditor
        size={SIZE} bounds={BOUNDS} showOutlines activeIndex={null}
        onSelect={onSelect} onBoundsChange={vi.fn()}
      />,
    )
    fireEvent.keyDown(screen.getAllByRole('button')[1]!, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/canvas-editor-drag.test.tsx`
Expected: FAIL — ยังไม่มีมือจับและยังไม่รับ pointer event

- [ ] **Step 3: เพิ่มการลากและปรับขนาดใน `CanvasEditor.tsx`**

เพิ่ม `snap` เข้าไปใน `CanvasEditorProps`
```ts
  /** ขนาดช่องกริดในหน่วยพิกเซลของผืนผ้าใบ ไม่ใช่พิกเซลบนจอ */
  snap?: number
```

เพิ่มฟังก์ชันช่วยไว้เหนือ component
```tsx
type DragMode = 'move' | 'resize'

interface DragState {
  index: number
  mode: DragMode
  startX: number
  startY: number
  origin: Bounds
}

function clampToCanvas(next: Bounds, size: RichMenuSize, min: number): Bounds {
  const width = Math.max(min, Math.min(next.width, size.width))
  const height = Math.max(min, Math.min(next.height, size.height))
  return {
    width,
    height,
    x: Math.max(0, Math.min(next.x, size.width - width)),
    y: Math.max(0, Math.min(next.y, size.height - height)),
  }
}

function snapTo(value: number, grid: number): number {
  return grid <= 1 ? Math.round(value) : Math.round(value / grid) * grid
}
```

ภายใน component เพิ่ม state และตัวจัดการ
```tsx
  const [drag, setDrag] = useState<DragState | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const grid = snap ?? 10
  const editable = onBoundsChange !== undefined

  /** สัดส่วนระหว่างหน่วยของผืนผ้าใบกับพิกเซลบนจอ — ต้องอ่านตอนลากจริง เพราะกล่องยืดตามหน้าจอ */
  const unitsPerPixel = (): number => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect === undefined || rect.width === 0) return 1
    return size.width / rect.width
  }

  const beginDrag = (index: number, mode: DragMode) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!editable) return
    event.stopPropagation()
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    setDrag({ index, mode, startX: event.clientX, startY: event.clientY, origin: bounds[index]! })
  }

  const continueDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag === null || onBoundsChange === undefined) return
    const scale = unitsPerPixel()
    const dx = (event.clientX - drag.startX) * scale
    const dy = (event.clientY - drag.startY) * scale
    const o = drag.origin
    const raw: Bounds = drag.mode === 'move'
      ? { ...o, x: snapTo(o.x + dx, grid), y: snapTo(o.y + dy, grid) }
      : { ...o, width: snapTo(o.width + dx, grid), height: snapTo(o.height + dy, grid) }
    onBoundsChange(drag.index, clampToCanvas(raw, size, grid))
  }

  const endDrag = () => setDrag(null)
```

ผูกเข้ากับ `<div>` ของผืนผ้าใบ: `ref={canvasRef}` และเพิ่ม `onPointerMove={continueDrag} onPointerUp={endDrag} onPointerLeave={endDrag}`

ในแต่ละช่อง เพิ่ม `onPointerDown={beginDrag(index, 'move')}` และเมื่อ `editable` ให้เรนเดอร์มือจับต่อท้ายเนื้อหาของช่อง
```tsx
            {editable ? (
              <span
                className="frm-handle"
                data-testid={`resize-handle-${index}`}
                onPointerDown={beginDrag(index, 'resize')}
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: 14,
                  height: 14,
                  background: OUTLINE_COLOR,
                  cursor: 'nwse-resize',
                  touchAction: 'none',
                }}
              />
            ) : null}
```

และเพิ่ม `...(editable ? { touchAction: 'none' as const } : {})` เข้าไปใน style ของช่อง เพื่อไม่ให้เบราว์เซอร์บนมือถือแย่ง gesture ไปเลื่อนหน้า

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/canvas-editor-drag.test.tsx && pnpm vitest run packages/ui/tests/canvas-editor.test.tsx`
Expected: PASS ทั้งสองไฟล์ — ชุดเดิมต้องไม่แดง

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/CanvasEditor.tsx packages/ui/tests/canvas-editor-drag.test.tsx
git commit -m "feat(ui): allow dragging and resizing areas for custom layouts"
```

---

## Task 6: `tools/ui-playground` — เปิดดูใน browser ได้จริง

**Files:**
- Create: `tools/ui-playground/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Test: ตรวจด้วยตาในเบราว์เซอร์ (ขั้นตอนอยู่ใน Step 5)

**Interfaces:**
- Consumes: `CanvasEditor` (Task 4, 5), `TEMPLATES`, `SIZE_LADDER` จาก core
- Produces: `pnpm --filter @fosivo/ui-playground dev` เปิดที่ `http://127.0.0.1:4030`

`packages/ui` ไม่มีทางเปิดดูได้ด้วยตัวเองเพราะไม่มี Strapi ให้รัน — playground คือที่ที่ทำให้เห็นของจริงระหว่างทาง ไม่ต้องรอจน adapter เสร็จใน Plan 03 และมันรันด้วย **stub port** ตัวเดียวกับที่เทสต์ใช้ ถ้าหน้านี้ทำงาน แปลว่า component ไม่ได้แอบพึ่ง Strapi อยู่

- [ ] **Step 1: สร้าง package**

`tools/ui-playground/package.json`
```json
{
  "name": "@fosivo/ui-playground",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fosivo/line-rich-menu-ui": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^7.1.14"
  }
}
```

`tools/ui-playground/vite.config.ts`
```ts
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 4030, host: '127.0.0.1' },
  resolve: {
    alias: {
      '@fosivo/line-rich-menu-ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
      '@fosivo/line-rich-menu-core/browser': fileURLToPath(new URL('../../packages/core/src/browser.ts', import.meta.url)),
    },
  },
})
```

`tools/ui-playground/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": {
      "@fosivo/line-rich-menu-ui": ["../../packages/ui/src/index.ts"],
      "@fosivo/line-rich-menu-core/browser": ["../../packages/core/src/browser.ts"]
    }
  },
  "include": ["src", "vite.config.ts"]
}
```

`tools/ui-playground/index.html`
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LINE rich menu — UI playground</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`tools/ui-playground/src/main.tsx`
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 2: เขียนหน้า playground**

`tools/ui-playground/src/App.tsx`
```tsx
import { useState } from 'react'
import { TEMPLATES, areaLabel, type Bounds } from '@fosivo/line-rich-menu-core/browser'
import { CanvasEditor, PortProvider, createStubPort } from '@fosivo/line-rich-menu-ui'

const port = createStubPort()
const keys = Object.keys(TEMPLATES).sort()

export function App() {
  const [key, setKey] = useState(keys[0]!)
  const [outlines, setOutlines] = useState(true)
  const [editable, setEditable] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const [bounds, setBounds] = useState<Bounds[]>([...TEMPLATES[keys[0]!]!.bounds])

  const template = TEMPLATES[key]!

  const pick = (next: string) => {
    setKey(next)
    setBounds([...TEMPLATES[next]!.bounds])
    setActive(null)
  }

  return (
    <PortProvider value={port}>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem',
                     font: '15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", sans-serif' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>UI playground</h1>
        <p style={{ color: '#666687', marginTop: '.25rem' }}>
          รันด้วย stub port ตัวเดียวกับที่เทสต์ใช้ — ถ้าหน้านี้ทำงานได้ แปลว่า component ไม่ได้พึ่ง Strapi
        </p>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '1.5rem 0' }}>
          <select value={key} onChange={(e) => pick(e.target.value)}>
            {keys.map((k) => (
              <option key={k} value={k}>{k} — {TEMPLATES[k]!.bounds.length} areas</option>
            ))}
          </select>
          <label><input type="checkbox" checked={outlines} onChange={(e) => setOutlines(e.target.checked)} /> outlines</label>
          <label><input type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)} /> แก้ไขได้</label>
          <span style={{ color: '#666687' }}>
            {active === null ? 'ยังไม่ได้เลือกช่อง' : `เลือกช่อง ${areaLabel(active)}`}
          </span>
        </div>

        <CanvasEditor
          size={template.size}
          bounds={bounds}
          showOutlines={outlines}
          activeIndex={active}
          onSelect={setActive}
          {...(editable
            ? { onBoundsChange: (i: number, next: Bounds) =>
                  setBounds((prev) => prev.map((b, j) => (j === i ? next : b))) }
            : {})}
        />
      </main>
    </PortProvider>
  )
}
```

- [ ] **Step 3: ติดตั้งและ typecheck**

Run: `pnpm install && pnpm --filter @fosivo/ui-playground typecheck`
Expected: clean

- [ ] **Step 4: เพิ่มเข้า workspace typecheck**

`tools/ui-playground` อยู่ใต้ `tools/*` ซึ่ง `pnpm -r typecheck` เก็บอยู่แล้ว ยืนยันด้วย

Run: `pnpm typecheck`
Expected: clean ทุก package

- [ ] **Step 5: เปิดดูจริงในเบราว์เซอร์**

Run: `pnpm --filter @fosivo/ui-playground dev`

ตรวจด้วยตาว่า:
1. เลือก template ได้ครบ 12 แบบ และกรอบเปลี่ยนตาม
2. แต่ละช่องมีตัวอักษรและขนาดพิกเซลกำกับ
3. กด Tab ไล่ช่องได้ และมีวงโฟกัสเห็นชัด กด Enter แล้วช่องถูกเลือก
4. ติ๊ก "แก้ไขได้" แล้วลากช่องและปรับขนาดได้ ค่าดูดเข้ากริด และลากออกนอกกรอบไม่ได้
5. ปิด outlines แล้วกรอบกับตัวเลขหายไป

หยุดเซิร์ฟเวอร์เมื่อตรวจเสร็จ อย่าปล่อยค้างไว้

- [ ] **Step 6: Commit**

```bash
git add tools/ui-playground pnpm-lock.yaml
git commit -m "feat(playground): view the canvas editor in a browser without Strapi"
```

---

## Task 7: `TemplatePicker` — modal เลือก template พร้อมยืนยันก่อนเปลี่ยน

**Files:**
- Create: `packages/ui/src/components/TemplatePicker.tsx`
- Test: `packages/ui/tests/template-picker.test.tsx`

**Interfaces:**
- Consumes: `usePort`, `TEMPLATES`, `SIZE_LADDER`, `renderTemplateSvg`, `TemplateDef`
- Produces:
  - `interface TemplatePickerProps { open: boolean; currentKey: string | null; hasConfiguredActions: boolean; onApply(key: string): void; onClose(): void }`
  - `const TemplatePicker: React.FC<TemplatePickerProps>`

สเปก §5.6 ข้อ 2 — การเปลี่ยน template ทำลาย action ที่ผู้ใช้ตั้งไว้ ต้องถามก่อน และ §5.7 กำหนดว่าหัวข้อของแต่ละกลุ่มต้องระบุขนาดพิกเซลทั้งสามของกลุ่มนั้น

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/template-picker.test.tsx`
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { TemplatePicker } from '../src/components/TemplatePicker.js'

function setup(overrides: Partial<React.ComponentProps<typeof TemplatePicker>> = {}) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(
    <PortProvider value={createStubPort({ t: (key) => key })}>
      <TemplatePicker
        open currentKey={null} hasConfiguredActions={false}
        onApply={onApply} onClose={onClose} {...overrides}
      />
    </PortProvider>,
  )
  return { onApply, onClose }
}

describe('TemplatePicker', () => {
  it('ไม่เรนเดอร์อะไรเลยเมื่อปิดอยู่', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('แสดง Large 7 แบบ และ Compact 5 แบบ', () => {
    setup()
    expect(screen.getAllByTestId(/^template-option-RICH_MENU_TEMPLATE_2/)).toHaveLength(7)
    expect(screen.getAllByTestId(/^template-option-RICH_MENU_TEMPLATE_1/)).toHaveLength(5)
  })

  it('หัวข้อกลุ่มระบุขนาดพิกเซลทั้งสามของกลุ่มนั้น', () => {
    setup()
    expect(screen.getByText(/2500×1686.*1200×810.*800×540/)).toBeInTheDocument()
    expect(screen.getByText(/2500×843.*1200×405.*800×270/)).toBeInTheDocument()
  })

  it('วาด thumbnail จาก bounds เป็น SVG ไม่ใช่ไฟล์ภาพ', () => {
    setup()
    expect(document.body.querySelectorAll('svg')).toHaveLength(12)
  })

  it('บอกจำนวนช่องของแต่ละแบบ', () => {
    setup()
    expect(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_201').textContent).toContain('6')
  })

  it('ทำเครื่องหมายแบบที่ใช้อยู่', () => {
    setup({ currentKey: 'RICH_MENU_TEMPLATE_203' })
    expect(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_203'))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('เลือกแล้วกด apply ส่ง key กลับไป', () => {
    const { onApply } = setup()
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    expect(onApply).toHaveBeenCalledWith('RICH_MENU_TEMPLATE_205')
  })

  it('กด apply โดยยังไม่เลือกอะไรไม่ได้', () => {
    setup()
    expect(screen.getByTestId('template-apply')).toBeDisabled()
  })

  // สเปก §5.6 ข้อ 2
  it('ถามยืนยันก่อน เมื่อมี action ที่ตั้งไว้แล้วและจะถูกทิ้ง', () => {
    const { onApply } = setup({ hasConfiguredActions: true, currentKey: 'RICH_MENU_TEMPLATE_201' })
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByTestId('template-confirm')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('template-confirm'))
    expect(onApply).toHaveBeenCalledWith('RICH_MENU_TEMPLATE_205')
  })

  it('ไม่ถามเมื่อยังไม่มี action ให้เสีย', () => {
    const { onApply } = setup({ hasConfiguredActions: false })
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    expect(onApply).toHaveBeenCalledWith('RICH_MENU_TEMPLATE_205')
  })

  it('ยกเลิกการยืนยันแล้วไม่มีอะไรเปลี่ยน', () => {
    const { onApply } = setup({ hasConfiguredActions: true, currentKey: 'RICH_MENU_TEMPLATE_201' })
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    fireEvent.click(screen.getByTestId('template-cancel-confirm'))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('ทุกข้อความที่ผู้ใช้เห็นผ่าน port.t ไม่มี hardcode', () => {
    const t = vi.fn((key: string) => `T:${key}`)
    render(
      <PortProvider value={createStubPort({ t })}>
        <TemplatePicker open currentKey={null} hasConfiguredActions={false}
          onApply={vi.fn()} onClose={vi.fn()} />
      </PortProvider>,
    )
    expect(t).toHaveBeenCalledWith('template.picker.title')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/template-picker.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/TemplatePicker.js'`

- [ ] **Step 3: เขียน `TemplatePicker.tsx`**

`packages/ui/src/components/TemplatePicker.tsx`
```tsx
import { useState } from 'react'
import {
  SIZE_LADDER, TEMPLATES, renderTemplateSvg, type RichMenuSizeName, type TemplateDef,
} from '@fosivo/line-rich-menu-core/browser'
import { usePort } from '../port.js'
import { OUTLINE_COLOR } from '../styles.js'

export interface TemplatePickerProps {
  open: boolean
  currentKey: string | null
  /** ผู้ใช้ตั้ง action ไว้แล้วหรือยัง — ถ้าตั้งแล้วการเปลี่ยน template จะทิ้งมันไป */
  hasConfiguredActions: boolean
  onApply(key: string): void
  onClose(): void
}

function group(name: RichMenuSizeName): TemplateDef[] {
  return Object.values(TEMPLATES).filter((t) => t.sizeName === name)
}

function sizesLabel(name: RichMenuSizeName): string {
  return SIZE_LADDER[name].map((s) => `${s.width}×${s.height}`).join(' · ')
}

export function TemplatePicker({
  open, currentKey, hasConfiguredActions, onApply, onClose,
}: TemplatePickerProps) {
  const { ui, t } = usePort()
  const [selected, setSelected] = useState<string | null>(currentKey)
  const [confirming, setConfirming] = useState(false)

  if (!open) return null

  const apply = () => {
    if (selected === null) return
    // เปลี่ยน template = ทิ้ง action ที่ตั้งไว้ทั้งหมด ถามก่อนเสมอถ้ามีอะไรจะเสีย
    if (hasConfiguredActions && selected !== currentKey) {
      setConfirming(true)
      return
    }
    onApply(selected)
  }

  const renderGroup = (name: RichMenuSizeName) => (
    <section key={name}>
      <h3>{t(`template.picker.group.${name}`)}</h3>
      <p>{sizesLabel(name)}</p>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {group(name).map((tpl) => (
          <button
            key={tpl.key}
            type="button"
            data-testid={`template-option-${tpl.key}`}
            aria-pressed={selected === tpl.key}
            onClick={() => setSelected(tpl.key)}
            style={{
              padding: 0,
              border: `2px solid ${selected === tpl.key ? OUTLINE_COLOR : '#dcdce4'}`,
              borderRadius: 6,
              background: 'none',
              cursor: 'pointer',
              color: OUTLINE_COLOR,
            }}
          >
            <span
              style={{ display: 'block' }}
              // thumbnail มาจาก bounds ไม่ใช่ไฟล์ภาพ จึงไม่มีสิทธิ์ของ LINE มาเกี่ยวข้อง
              // และ layout ที่ผู้ใช้สร้างเองก็ได้ thumbnail จากโค้ดเดียวกัน
              dangerouslySetInnerHTML={{ __html: renderTemplateSvg(tpl.bounds, tpl.size) }}
            />
            <span style={{ display: 'block', padding: '.4rem', fontSize: '.8rem', color: '#32324d' }}>
              {t('template.picker.areaCount', { count: tpl.bounds.length })}
            </span>
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <ui.Modal
      open
      onClose={onClose}
      title={t('template.picker.title')}
      footer={
        confirming ? (
          <>
            <ui.Button variant="secondary" onClick={() => setConfirming(false)}>
              <span data-testid="template-cancel-confirm">{t('common.cancel')}</span>
            </ui.Button>
            <ui.Button variant="danger" onClick={() => onApply(selected!)}>
              <span data-testid="template-confirm">{t('template.picker.confirmDiscard')}</span>
            </ui.Button>
          </>
        ) : (
          <>
            <ui.Button variant="secondary" onClick={onClose}>{t('common.cancel')}</ui.Button>
            <ui.Button onClick={apply} disabled={selected === null}>
              <span data-testid="template-apply">{t('common.apply')}</span>
            </ui.Button>
          </>
        )
      }
    >
      {confirming ? (
        <ui.Alert variant="warning" title={t('template.picker.discardTitle')}>
          {t('template.picker.discardBody')}
        </ui.Alert>
      ) : (
        <>{renderGroup('large')}{renderGroup('compact')}</>
      )}
    </ui.Modal>
  )
}
```

**หมายเหตุเรื่อง `dangerouslySetInnerHTML`:** ปลอดภัยที่นี่เพราะ `renderTemplateSvg` แปลงทุกค่าที่รับเข้ามาเป็นตัวเลขก่อนเสมอ (Plan 01 Task G) จึงไม่มีทางที่สตริงจากผู้ใช้จะไหลเข้ามาได้ ถ้าวันใดฟังก์ชันนั้นรับข้อความอิสระ ต้องกลับมาทบทวนบรรทัดนี้ก่อน

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/template-picker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/TemplatePicker.tsx packages/ui/tests/template-picker.test.tsx
git commit -m "feat(ui): pick a template, with a confirmation before discarding actions"
```

---

## Task 8: `ActionForm` + `AreaList` — ฟอร์ม action และรายการช่อง

**Files:**
- Create: `packages/ui/src/components/ActionForm.tsx`, `packages/ui/src/components/AreaList.tsx`
- Test: `packages/ui/tests/action-form-ui.test.tsx`, `packages/ui/tests/area-list.test.tsx`

**Interfaces:**
- Consumes: `ActionFormState`, `emptyActionForm` (Task 3), `usePort`, `ALLOWED_URI_SCHEMES`, `areaLabel`
- Produces:
  - `interface ActionFormProps { value: ActionFormState; onChange(next: ActionFormState): void; aliasOptions: readonly string[]; error?: string }`
  - `interface AreaListProps { areas: readonly ActionFormState[]; activeIndex: number | null; view: 'list' | 'expanded'; onViewChange(view: 'list' | 'expanded'): void; onSelect(index: number): void; onChange(index: number, next: ActionFormState): void; aliasOptions: readonly string[]; errors?: Readonly<Record<number, string>> }`

- [ ] **Step 1: เขียน test ของ `ActionForm` ที่ต้องล้มเหลว**

`packages/ui/tests/action-form-ui.test.tsx`
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyActionForm } from '../src/action-form.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { ActionForm } from '../src/components/ActionForm.js'

function setup(value = emptyActionForm(), aliasOptions: string[] = ['tab-a', 'tab-b']) {
  const onChange = vi.fn()
  render(
    <PortProvider value={createStubPort({ t: (k) => k })}>
      <ActionForm value={value} onChange={onChange} aliasOptions={aliasOptions} />
    </PortProvider>,
  )
  return { onChange }
}

describe('ActionForm', () => {
  it('แสดงช่อง text เมื่อชนิดเป็น message', () => {
    setup({ ...emptyActionForm(), type: 'message' })
    expect(screen.getByLabelText('action.field.text')).toBeInTheDocument()
    expect(screen.queryByLabelText('action.field.uri')).not.toBeInTheDocument()
  })

  it('แสดง uri และ altUri เมื่อชนิดเป็น uri', () => {
    setup({ ...emptyActionForm(), type: 'uri' })
    expect(screen.getByLabelText('action.field.uri')).toBeInTheDocument()
    expect(screen.getByLabelText('action.field.altUri')).toBeInTheDocument()
  })

  it('แสดง data และ displayText เมื่อชนิดเป็น postback', () => {
    setup({ ...emptyActionForm(), type: 'postback' })
    expect(screen.getByLabelText('action.field.data')).toBeInTheDocument()
    expect(screen.getByLabelText('action.field.displayText')).toBeInTheDocument()
  })

  it('richmenuswitch เลือกปลายทางจาก alias ที่มีอยู่ ไม่ใช่พิมพ์ id เอง', () => {
    setup({ ...emptyActionForm(), type: 'richmenuswitch' })
    const select = screen.getByLabelText('action.field.richMenuAliasId')
    expect(select.tagName).toBe('SELECT')
    expect(screen.getByRole('option', { name: 'tab-a' })).toBeInTheDocument()
  })

  // สเปก §5.4 — สลับชนิดแล้วต้องไม่ล้างสิ่งที่พิมพ์ไว้
  it('สลับชนิดแล้วค่าที่พิมพ์ไว้ในช่องอื่นยังอยู่', () => {
    const { onChange } = setup({ ...emptyActionForm(), type: 'uri', uri: 'https://a.test' })
    fireEvent.change(screen.getByLabelText('action.field.type'), { target: { value: 'message' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message', uri: 'https://a.test' }),
    )
  })

  it('บอกว่ารับ scheme อะไรได้บ้างในช่อง uri', () => {
    setup({ ...emptyActionForm(), type: 'uri' })
    expect(screen.getByText(/https.*http.*tel.*line/)).toBeInTheDocument()
  })

  it('จำกัด label ไว้ที่ 20 ตัวตามสเปก LINE', () => {
    setup()
    expect(screen.getByLabelText('action.field.label')).toHaveAttribute('maxlength', '20')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/action-form-ui.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน `ActionForm.tsx`**

`packages/ui/src/components/ActionForm.tsx`
```tsx
import { ALLOWED_URI_SCHEMES, type ActionType } from '@fosivo/line-rich-menu-core/browser'
import type { ActionFormState } from '../action-form.js'
import { usePort } from '../port.js'

export interface ActionFormProps {
  value: ActionFormState
  onChange(next: ActionFormState): void
  aliasOptions: readonly string[]
  error?: string
}

const TYPES: readonly ActionType[] = [
  'message', 'uri', 'postback', 'datetimepicker',
  'richmenuswitch', 'clipboard', 'camera', 'cameraRoll', 'location',
]

export function ActionForm({ value, onChange, aliasOptions, error }: ActionFormProps) {
  const { ui, t } = usePort()
  const set = <K extends keyof ActionFormState>(key: K, next: ActionFormState[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <ui.Flex direction="column" gap={2}>
      <ui.Select
        name="type"
        label={t('action.field.type')}
        value={value.type}
        onChange={(next) => set('type', next as ActionType)}
      >
        {TYPES.map((type) => (
          <ui.Option key={type} value={type}>{t(`action.type.${type}`)}</ui.Option>
        ))}
      </ui.Select>

      <ui.TextInput
        name="label"
        label={t('action.field.label')}
        value={value.label}
        maxLength={20}
        onChange={(next) => set('label', next)}
      />

      {value.type === 'message' ? (
        <ui.TextInput name="text" label={t('action.field.text')} value={value.text}
          maxLength={300} error={error} onChange={(next) => set('text', next)} />
      ) : null}

      {value.type === 'uri' ? (
        <>
          <ui.TextInput name="uri" label={t('action.field.uri')} value={value.uri}
            maxLength={1000} error={error}
            hint={ALLOWED_URI_SCHEMES.map((s) => s.replace(':', '')).join(', ')}
            onChange={(next) => set('uri', next)} />
          <ui.TextInput name="altUri" label={t('action.field.altUri')} value={value.altUri}
            maxLength={1000} onChange={(next) => set('altUri', next)} />
        </>
      ) : null}

      {value.type === 'postback' || value.type === 'datetimepicker' || value.type === 'richmenuswitch' ? (
        <ui.TextInput name="data" label={t('action.field.data')} value={value.data}
          maxLength={300} error={error} onChange={(next) => set('data', next)} />
      ) : null}

      {value.type === 'postback' ? (
        <ui.TextInput name="displayText" label={t('action.field.displayText')} value={value.displayText}
          maxLength={300} onChange={(next) => set('displayText', next)} />
      ) : null}

      {value.type === 'datetimepicker' ? (
        <ui.Select name="mode" label={t('action.field.mode')} value={value.mode}
          onChange={(next) => set('mode', next as ActionFormState['mode'])}>
          {(['date', 'time', 'datetime'] as const).map((mode) => (
            <ui.Option key={mode} value={mode}>{t(`action.mode.${mode}`)}</ui.Option>
          ))}
        </ui.Select>
      ) : null}

      {value.type === 'richmenuswitch' ? (
        <ui.Select name="richMenuAliasId" label={t('action.field.richMenuAliasId')}
          value={value.richMenuAliasId} error={error}
          onChange={(next) => set('richMenuAliasId', next)}>
          <ui.Option value="">{t('action.field.chooseAlias')}</ui.Option>
          {aliasOptions.map((alias) => (
            <ui.Option key={alias} value={alias}>{alias}</ui.Option>
          ))}
        </ui.Select>
      ) : null}

      {value.type === 'clipboard' ? (
        <ui.TextInput name="clipboardText" label={t('action.field.clipboardText')}
          value={value.clipboardText} maxLength={1000} error={error}
          onChange={(next) => set('clipboardText', next)} />
      ) : null}
    </ui.Flex>
  )
}
```

- [ ] **Step 4: เขียน test ของ `AreaList` ที่ต้องล้มเหลว**

`packages/ui/tests/area-list.test.tsx`
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyActionForm } from '../src/action-form.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { AreaList } from '../src/components/AreaList.js'

const areas = [emptyActionForm(), emptyActionForm(), emptyActionForm()]

function setup(overrides: Partial<React.ComponentProps<typeof AreaList>> = {}) {
  const props = {
    areas, activeIndex: null, view: 'list' as const,
    onViewChange: vi.fn(), onSelect: vi.fn(), onChange: vi.fn(),
    aliasOptions: [], ...overrides,
  }
  render(
    <PortProvider value={createStubPort({ t: (k) => k })}>
      <AreaList {...props} />
    </PortProvider>,
  )
  return props
}

describe('AreaList', () => {
  it('มีหัวข้อหนึ่งอันต่อหนึ่งช่อง ติดป้าย A B C', () => {
    setup()
    for (const letter of ['A', 'B', 'C']) {
      expect(screen.getByRole('button', { name: new RegExp(letter) })).toBeInTheDocument()
    }
  })

  it('โหมด list พับทุกช่องไว้ ยกเว้นช่องที่เลือกอยู่', () => {
    setup({ activeIndex: 1 })
    expect(screen.getAllByTestId(/^area-body-/)).toHaveLength(1)
    expect(screen.getByTestId('area-body-1')).toBeInTheDocument()
  })

  it('โหมด expanded กางทุกช่องพร้อมกัน', () => {
    setup({ view: 'expanded' })
    expect(screen.getAllByTestId(/^area-body-/)).toHaveLength(3)
  })

  it('สลับโหมดได้จากหัวหมวด', () => {
    const { onViewChange } = setup()
    fireEvent.click(screen.getByTestId('view-expanded'))
    expect(onViewChange).toHaveBeenCalledWith('expanded')
  })

  it('กดหัวข้อช่องแล้วแจ้ง index กลับไป', () => {
    const { onSelect } = setup()
    fireEvent.click(screen.getByTestId('area-header-2'))
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  // สเปก §5.6 ข้อ 4 — error ต้องอยู่ที่ช่องของมัน ไม่ใช่รวมบนหัวฟอร์ม
  it('แสดง error ที่หัวข้อของช่องนั้น แม้ช่องจะพับอยู่', () => {
    setup({ errors: { 2: 'ต้องกรอก URI' } })
    expect(screen.getByTestId('area-header-2').textContent).toContain('ต้องกรอก URI')
  })

  it('ไม่มี error ก็ไม่มีเครื่องหมายอะไร', () => {
    setup()
    expect(screen.queryByTestId('area-error-0')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 5: เขียน `AreaList.tsx`**

`packages/ui/src/components/AreaList.tsx`
```tsx
import { areaLabel } from '@fosivo/line-rich-menu-core/browser'
import type { ActionFormState } from '../action-form.js'
import { usePort } from '../port.js'
import { INVALID_COLOR } from '../styles.js'
import { ActionForm } from './ActionForm.js'

export interface AreaListProps {
  areas: readonly ActionFormState[]
  activeIndex: number | null
  /** ฟอร์ม 20 ช่องที่กางพร้อมกันเลื่อนหายาก จึงมีโหมดพับให้เลือก */
  view: 'list' | 'expanded'
  onViewChange(view: 'list' | 'expanded'): void
  onSelect(index: number): void
  onChange(index: number, next: ActionFormState): void
  aliasOptions: readonly string[]
  errors?: Readonly<Record<number, string>>
}

export function AreaList({
  areas, activeIndex, view, onViewChange, onSelect, onChange, aliasOptions, errors,
}: AreaListProps) {
  const { ui, t } = usePort()

  return (
    <ui.Flex direction="column" gap={2}>
      <ui.Flex justifyContent="space-between" alignItems="center">
        <ui.Typography variant="delta">{t('editor.actions')}</ui.Typography>
        <ui.Flex gap={1}>
          <ui.IconButton label={t('editor.view.list')} onClick={() => onViewChange('list')}>
            <span data-testid="view-list">☰</span>
          </ui.IconButton>
          <ui.IconButton label={t('editor.view.expanded')} onClick={() => onViewChange('expanded')}>
            <span data-testid="view-expanded">⛶</span>
          </ui.IconButton>
        </ui.Flex>
      </ui.Flex>

      {areas.map((area, index) => {
        const error = errors?.[index]
        const open = view === 'expanded' || activeIndex === index
        return (
          <section key={index} style={{ border: '1px solid #dcdce4', borderRadius: 4 }}>
            <button
              type="button"
              data-testid={`area-header-${index}`}
              aria-expanded={open}
              onClick={() => onSelect(index)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between',
                padding: '.6rem .8rem', background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <span>{areaLabel(index)}</span>
              {error === undefined ? null : (
                <span data-testid={`area-error-${index}`} style={{ color: INVALID_COLOR }}>{error}</span>
              )}
            </button>
            {open ? (
              <div data-testid={`area-body-${index}`} style={{ padding: '.8rem' }}>
                <ActionForm
                  value={area}
                  aliasOptions={aliasOptions}
                  onChange={(next) => onChange(index, next)}
                  {...(error === undefined ? {} : { error })}
                />
              </div>
            ) : null}
          </section>
        )
      })}
    </ui.Flex>
  )
}
```

- [ ] **Step 6: รันทั้งสองไฟล์ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/action-form-ui.test.tsx packages/ui/tests/area-list.test.tsx`
Expected: PASS ทั้งสอง

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/ActionForm.tsx packages/ui/src/components/AreaList.tsx packages/ui/tests/action-form-ui.test.tsx packages/ui/tests/area-list.test.tsx
git commit -m "feat(ui): add the per-area action form and the collapsible area list"
```

---

## Task 9: `MainSettings` · `ChatBarSettings` · `Preview`

**Files:**
- Create: `packages/ui/src/components/MainSettings.tsx`, `ChatBarSettings.tsx`, `Preview.tsx`
- Test: `packages/ui/tests/settings-and-preview.test.tsx`

**Interfaces:**
- Produces:
  - `interface MainSettingsValue { title: string; startAt: string; endAt: string }`
  - `interface ChatBarValue { mode: 'default' | 'custom'; text: string; selected: boolean }`
  - `const MainSettings: React.FC<{ value: MainSettingsValue; onChange(next: MainSettingsValue): void; errors?: Partial<Record<keyof MainSettingsValue, string>> }>`
  - `const ChatBarSettings: React.FC<{ value: ChatBarValue; onChange(next: ChatBarValue): void; error?: string }>`
  - `const Preview: React.FC<{ size: RichMenuSize; bounds: readonly Bounds[]; imageUrl?: string; chatBarText: string; expanded: boolean }>`

สเปก §5.5 — แถบแชทมีสองสวิตช์ ไม่ใช่ค่าเดียว และต้องเก็บ **โหมด** ที่ผู้ใช้เลือกไว้ด้วย ไม่ใช่เก็บแต่ผลลัพธ์ · §5.7 — preview ต้องสะท้อน label แบบเรียลไทม์

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/settings-and-preview.test.tsx`
```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { TEMPLATES } from '@fosivo/line-rich-menu-core/browser'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { ChatBarSettings } from '../src/components/ChatBarSettings.js'
import { MainSettings } from '../src/components/MainSettings.js'
import { Preview } from '../src/components/Preview.js'

const port = createStubPort({ t: (k) => k })
const wrap = (node: React.ReactNode) => render(<PortProvider value={port}>{node}</PortProvider>)
const template = TEMPLATES['RICH_MENU_TEMPLATE_201']!

describe('MainSettings', () => {
  const value = { title: '', startAt: '', endAt: '' }

  it('จำกัดชื่อไว้ 30 ตัว — คนละตัวกับ name ใน payload ที่ยอมได้ 300', () => {
    wrap(<MainSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('editor.title')).toHaveAttribute('maxlength', '30')
  })

  it('มีตัวนับตัวอักษรของชื่อ', () => {
    wrap(<MainSettings value={{ ...value, title: 'เมนู' }} onChange={vi.fn()} />)
    expect(screen.getByText('4/30')).toBeInTheDocument()
  })

  it('บอกว่าชื่อนี้ใช้จัดการภายใน ผู้ใช้ปลายทางไม่เห็น', () => {
    wrap(<MainSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByText('editor.title.hint')).toBeInTheDocument()
  })

  it('ช่วงเวลาแสดงผลอยู่ในฟอร์มเดียวกัน ไม่ใช่หน้าแยก', () => {
    wrap(<MainSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('editor.displayPeriod.start')).toBeInTheDocument()
    expect(screen.getByLabelText('editor.displayPeriod.end')).toBeInTheDocument()
  })

  it('ปุ่ม clear ล้างช่วงเวลาทั้งคู่ แต่ไม่แตะชื่อ', () => {
    const onChange = vi.fn()
    wrap(<MainSettings value={{ title: 'เมนู', startAt: '2026-08-20', endAt: '2026-08-26' }} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('clear-period'))
    expect(onChange).toHaveBeenCalledWith({ title: 'เมนู', startAt: '', endAt: '' })
  })
})

describe('ChatBarSettings', () => {
  const value = { mode: 'default' as const, text: '', selected: true }

  it('มีสองสวิตช์แยกกัน — ข้อความบนแถบ กับ สถานะตอนเปิดแชท', () => {
    wrap(<ChatBarSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('chatBar.mode.default')).toBeInTheDocument()
    expect(screen.getByLabelText('chatBar.mode.custom')).toBeInTheDocument()
    expect(screen.getByLabelText('chatBar.behavior.shown')).toBeInTheDocument()
    expect(screen.getByLabelText('chatBar.behavior.collapsed')).toBeInTheDocument()
  })

  it('ช่องข้อความถูกปิดไว้จนกว่าจะเลือกโหมด custom', () => {
    wrap(<ChatBarSettings value={value} onChange={vi.fn()} />)
    expect(screen.getByLabelText('chatBar.text')).toBeDisabled()
  })

  it('เปิดใช้ได้เมื่อเลือก custom และจำกัดที่ 14 ตัว', () => {
    wrap(<ChatBarSettings value={{ ...value, mode: 'custom' }} onChange={vi.fn()} />)
    const input = screen.getByLabelText('chatBar.text')
    expect(input).not.toBeDisabled()
    expect(input).toHaveAttribute('maxlength', '14')
  })

  it('มีตัวนับตัวอักษร — 14 ตัวหมดเร็วมากโดยเฉพาะภาษาไทย', () => {
    wrap(<ChatBarSettings value={{ mode: 'custom', text: 'เมนูหลัก', selected: true }} onChange={vi.fn()} />)
    expect(screen.getByText('8/14')).toBeInTheDocument()
  })

  it('เก็บโหมดที่ผู้ใช้เลือกไว้ ไม่ใช่เก็บแต่ข้อความ', () => {
    const onChange = vi.fn()
    wrap(<ChatBarSettings value={value} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('chatBar.mode.custom'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'custom' }))
  })
})

describe('Preview', () => {
  it('แสดง label ของแถบแชทตามที่พิมพ์ แบบเรียลไทม์', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="ทดสอบ" expanded />)
    expect(screen.getByTestId('preview-chat-bar').textContent).toContain('ทดสอบ')
  })

  it('ยุบเมนูเมื่อ expanded เป็นเท็จ', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded={false} />)
    expect(screen.queryByTestId('preview-menu')).not.toBeInTheDocument()
  })

  it('แสดงเมนูเมื่อ expanded เป็นจริง', () => {
    wrap(<Preview size={template.size} bounds={template.bounds} chatBarText="เมนู" expanded />)
    expect(screen.getByTestId('preview-menu')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/settings-and-preview.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: เขียนทั้งสามไฟล์**

`packages/ui/src/components/MainSettings.tsx`
```tsx
import { usePort } from '../port.js'

export interface MainSettingsValue {
  /** ชื่อสำหรับจัดการภายใน จำกัด 30 ตัว — คนละตัวกับ `name` ใน payload ของ LINE ที่ยอมได้ 300 */
  title: string
  startAt: string
  endAt: string
}

export interface MainSettingsProps {
  value: MainSettingsValue
  onChange(next: MainSettingsValue): void
  errors?: Partial<Record<keyof MainSettingsValue, string>>
}

export function MainSettings({ value, onChange, errors }: MainSettingsProps) {
  const { ui, t } = usePort()
  const set = <K extends keyof MainSettingsValue>(key: K, next: MainSettingsValue[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <ui.Flex direction="column" gap={3}>
      <ui.Typography variant="delta">{t('editor.mainSettings')}</ui.Typography>
      <ui.Flex direction="column" gap={1}>
        <ui.TextInput
          name="title"
          label={t('editor.title')}
          value={value.title}
          maxLength={30}
          hint={t('editor.title.hint')}
          onChange={(next) => set('title', next)}
          {...(errors?.title === undefined ? {} : { error: errors.title })}
        />
        <ui.Typography variant="pi" textColor="neutral600">{value.title.length}/30</ui.Typography>
      </ui.Flex>
      <ui.Flex gap={2} alignItems="flex-end">
        <ui.TextInput name="startAt" label={t('editor.displayPeriod.start')} value={value.startAt}
          placeholder="YYYY-MM-DD HH:mm" onChange={(next) => set('startAt', next)} />
        <ui.TextInput name="endAt" label={t('editor.displayPeriod.end')} value={value.endAt}
          placeholder="YYYY-MM-DD HH:mm" onChange={(next) => set('endAt', next)} />
        <ui.Button variant="secondary" onClick={() => onChange({ ...value, startAt: '', endAt: '' })}>
          <span data-testid="clear-period">{t('common.clear')}</span>
        </ui.Button>
      </ui.Flex>
    </ui.Flex>
  )
}
```

`packages/ui/src/components/ChatBarSettings.tsx`
```tsx
import { usePort } from '../port.js'

export interface ChatBarValue {
  /**
   * โหมดที่ผู้ใช้เลือก ไม่ใช่แค่ผลลัพธ์ (สเปก §5.5)
   * `chatBarText` เป็นฟิลด์บังคับของ LINE เสมอ โหมด default คือฝั่งเราเติมให้
   * ถ้าเก็บแต่ข้อความ พอเปิดเมนูที่เซฟไว้กลับมาจะแยกไม่ออกว่าใครเป็นคนพิมพ์
   */
  mode: 'default' | 'custom'
  text: string
  /** กางเมนูไว้ตอนเปิดแชทหรือยุบไว้ → ไปลงที่ `selected` ใน payload */
  selected: boolean
}

export interface ChatBarSettingsProps {
  value: ChatBarValue
  onChange(next: ChatBarValue): void
  error?: string
}

export function ChatBarSettings({ value, onChange, error }: ChatBarSettingsProps) {
  const { ui, t } = usePort()

  return (
    <ui.Flex direction="column" gap={3}>
      <ui.Typography variant="delta">{t('chatBar.title')}</ui.Typography>

      <ui.Flex direction="column" gap={1}>
        <ui.Typography variant="pi">{t('chatBar.mode')}</ui.Typography>
        <ui.Radio name="chatBarMode" value="default" checked={value.mode === 'default'}
          onChange={() => onChange({ ...value, mode: 'default' })}>
          {t('chatBar.mode.default')}
        </ui.Radio>
        <ui.Radio name="chatBarMode" value="custom" checked={value.mode === 'custom'}
          onChange={() => onChange({ ...value, mode: 'custom' })}>
          {t('chatBar.mode.custom')}
        </ui.Radio>
        <ui.TextInput
          name="chatBarText"
          label={t('chatBar.text')}
          value={value.text}
          maxLength={14}
          disabled={value.mode !== 'custom'}
          onChange={(next) => onChange({ ...value, text: next })}
          {...(error === undefined ? {} : { error })}
        />
        <ui.Typography variant="pi" textColor="neutral600">{value.text.length}/14</ui.Typography>
      </ui.Flex>

      <ui.Flex direction="column" gap={1}>
        <ui.Typography variant="pi">{t('chatBar.behavior')}</ui.Typography>
        <ui.Radio name="chatBarBehavior" value="shown" checked={value.selected}
          onChange={() => onChange({ ...value, selected: true })}>
          {t('chatBar.behavior.shown')}
        </ui.Radio>
        <ui.Radio name="chatBarBehavior" value="collapsed" checked={!value.selected}
          onChange={() => onChange({ ...value, selected: false })}>
          {t('chatBar.behavior.collapsed')}
        </ui.Radio>
      </ui.Flex>
    </ui.Flex>
  )
}
```

`packages/ui/src/components/Preview.tsx`
```tsx
import type { Bounds, RichMenuSize } from '@fosivo/line-rich-menu-core/browser'
import { usePort } from '../port.js'
import { CanvasEditor } from './CanvasEditor.js'

export interface PreviewProps {
  size: RichMenuSize
  bounds: readonly Bounds[]
  imageUrl?: string
  chatBarText: string
  expanded: boolean
}

/** กรอบโทรศัพท์จำลอง — เมนูอยู่ครึ่งล่างและแถบแชทสะท้อน label ที่พิมพ์ทันที (สเปก §5.7) */
export function Preview({ size, bounds, imageUrl, chatBarText, expanded }: PreviewProps) {
  const { t } = usePort()

  return (
    <div style={{ width: 320, border: '1px solid #dcdce4', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: '#8ba7d0', height: 180, padding: '.75rem' }}>
        <span style={{ background: '#fff', borderRadius: 12, padding: '.3rem .6rem', fontSize: '.8rem' }}>
          {t('preview.greeting')}
        </span>
      </div>
      {expanded ? (
        <div data-testid="preview-menu">
          <CanvasEditor
            size={size}
            bounds={bounds}
            showOutlines={imageUrl === undefined}
            activeIndex={null}
            onSelect={() => {}}
            {...(imageUrl === undefined ? {} : { imageUrl })}
          />
        </div>
      ) : null}
      <div
        data-testid="preview-chat-bar"
        style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          borderTop: '1px solid #dcdce4', padding: '.6rem', fontSize: '.85rem',
        }}
      >
        {chatBarText === '' ? t('chatBar.defaultLabel') : chatBarText} ▾
      </div>
    </div>
  )
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/settings-and-preview.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components packages/ui/tests/settings-and-preview.test.tsx
git commit -m "feat(ui): add main settings, the two chat bar switches, and the live preview"
```

---

## Task 10: `ImageField` — อัปโหลดผ่าน `/upload` พร้อมตรวจขนาดฝั่ง client

**Files:**
- Create: `packages/ui/src/components/ImageField.tsx`
- Test: `packages/ui/tests/image-field.test.tsx`

**Interfaces:**
- Consumes: `usePort` (`http.post`), `LINE_ALLOWED_SIZES`, `isAllowedCanvas`
- Produces:
  - `interface UploadedImage { id: number; url: string; width: number; height: number }`
  - `interface ImageFieldProps { value: UploadedImage | null; size: RichMenuSize; disabled: boolean; onChange(next: UploadedImage | null): void }`
  - `const ImageField: React.FC<ImageFieldProps>`

สเปก §5.2 — จงใจไม่เรียก Media Library UI ของ Strapi เพราะ v4 กับ v5 ต่างกันมาก แต่ยิง `POST /upload` ซึ่ง **endpoint เดียวกันทั้งสองเวอร์ชัน** · §5.6 ข้อ 3 — ตรวจขนาดฝั่ง client ก่อนอัป

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/image-field.test.tsx`
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { ImageField } from '../src/components/ImageField.js'

const SIZE = { width: 2500, height: 1686 }

function file(name = 'menu.png', type = 'image/png') {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

/** jsdom ไม่ decode รูปจริง จึงต้องปลอมขนาดที่ Image จะรายงานกลับมา */
function stubImageSize(width: number, height: number) {
  class StubImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    width = width
    height = height
    set src(_v: string) { queueMicrotask(() => this.onload?.()) }
  }
  vi.stubGlobal('Image', StubImage)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} })
}

function setup(port = createStubPort({ t: (k) => k })) {
  const onChange = vi.fn()
  render(
    <PortProvider value={port}>
      <ImageField value={null} size={SIZE} disabled={false} onChange={onChange} />
    </PortProvider>,
  )
  return { onChange }
}

describe('ImageField', () => {
  it('ปิดไว้จนกว่าจะเลือก template — ปุ่ม Image ของ LINE ก็ทำแบบนี้', () => {
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <ImageField value={null} size={SIZE} disabled onChange={vi.fn()} />
      </PortProvider>,
    )
    expect(screen.getByTestId('image-input')).toBeDisabled()
  })

  it('ปฏิเสธไฟล์ที่ไม่ใช่ jpeg หรือ png ตั้งแต่ยังไม่ยิงเซิร์ฟเวอร์', async () => {
    const post = vi.fn()
    const { onChange } = setup(createStubPort({ t: (k) => k, http: { ...createStubPort().http, post } }))
    fireEvent.change(screen.getByTestId('image-input'), {
      target: { files: [file('a.gif', 'image/gif')] },
    })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  // สเปก §5.6 ข้อ 3
  it('ปฏิเสธรูปที่สัดส่วนไม่ตรงกับผืนผ้าใบ ก่อนอัปโหลด', async () => {
    stubImageSize(1000, 1000)
    const post = vi.fn()
    setup(createStubPort({ t: (k) => k, http: { ...createStubPort().http, post } }))
    fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })

  it('อัปโหลดผ่าน POST /upload เมื่อรูปผ่านเกณฑ์ และคืนไฟล์ที่ได้กลับไป', async () => {
    stubImageSize(2500, 1686)
    const post = vi.fn(async () => [{ id: 7, url: '/uploads/menu.png', width: 2500, height: 1686 }])
    const { onChange } = setup(createStubPort({ t: (k) => k, http: { ...createStubPort().http, post } }))
    fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/upload', expect.any(FormData))
    expect(onChange).toHaveBeenCalledWith({ id: 7, url: '/uploads/menu.png', width: 2500, height: 1686 })
  })

  it('แจ้ง error เมื่อเซิร์ฟเวอร์ปฏิเสธ และไม่ตั้งค่าเป็นรูปที่อัปไม่สำเร็จ', async () => {
    stubImageSize(2500, 1686)
    const post = vi.fn(async () => { throw new Error('boom') })
    const { onChange } = setup(createStubPort({ t: (k) => k, http: { ...createStubPort().http, post } }))
    fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ลบรูปที่เลือกไว้ได้', () => {
    const onChange = vi.fn()
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <ImageField
          value={{ id: 1, url: '/uploads/a.png', width: 2500, height: 1686 }}
          size={SIZE} disabled={false} onChange={onChange}
        />
      </PortProvider>,
    )
    fireEvent.click(screen.getByTestId('image-remove'))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/image-field.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน `ImageField.tsx`**

`packages/ui/src/components/ImageField.tsx`
```tsx
import { useState, type ChangeEvent } from 'react'
import type { RichMenuSize } from '@fosivo/line-rich-menu-core/browser'
import { usePort } from '../port.js'

export interface UploadedImage {
  id: number
  url: string
  width: number
  height: number
}

export interface ImageFieldProps {
  value: UploadedImage | null
  size: RichMenuSize
  /** ปิดไว้จนกว่าจะเลือก template — เหมือนปุ่ม Image ของ LINE OA Manager */
  disabled: boolean
  onChange(next: UploadedImage | null): void
}

const ACCEPTED = ['image/jpeg', 'image/png']

function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode_failed'))
    }
    img.src = url
  })
}

export function ImageField({ value, size, disabled, onChange }: ImageFieldProps) {
  const { ui, http, t } = usePort()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handle = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file === undefined) return
    setError(null)

    if (!ACCEPTED.includes(file.type)) {
      setError(t('image.error.format'))
      return
    }

    // ตรวจฝั่ง client ก่อน เพื่อไม่ให้ผู้ใช้ต้องรอ round trip เพื่อรู้ว่ารูปแนวตั้งใช้ไม่ได้
    let measured: { width: number; height: number }
    try {
      measured = await measure(file)
    } catch {
      setError(t('image.error.decode'))
      return
    }

    const wanted = size.width / size.height
    const actual = measured.width / measured.height
    if (Math.abs(wanted - actual) > 0.01) {
      setError(t('image.error.ratio', { expected: `${size.width}×${size.height}` }))
      return
    }

    const body = new FormData()
    body.append('files', file)
    setBusy(true)
    try {
      // `/upload` เป็น endpoint เดียวกันทั้ง Strapi 4 และ 5 — จงใจไม่แตะ Media Library UI
      const uploaded = await http.post<UploadedImage[]>('/upload', body)
      const first = uploaded[0]
      if (first === undefined) throw new Error('empty_response')
      onChange(first)
    } catch {
      setError(t('image.error.upload'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ui.Flex direction="column" gap={1}>
      <input
        data-testid="image-input"
        type="file"
        accept={ACCEPTED.join(',')}
        disabled={disabled || busy}
        onChange={(event) => { void handle(event) }}
      />
      {value === null ? null : (
        <ui.Flex gap={2} alignItems="center">
          <img src={value.url} alt="" style={{ width: 120, height: 'auto' }} />
          <ui.Button variant="danger" onClick={() => onChange(null)}>
            <span data-testid="image-remove">{t('common.remove')}</span>
          </ui.Button>
        </ui.Flex>
      )}
      {busy ? <ui.Loader>{t('common.loading')}</ui.Loader> : null}
      {error === null ? null : <ui.Alert variant="danger">{error}</ui.Alert>}
    </ui.Flex>
  )
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/image-field.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/ImageField.tsx packages/ui/tests/image-field.test.tsx
git commit -m "feat(ui): upload the menu image through /upload with a client-side size check"
```

---

## Task 11: `RichMenuEditor` — ฟอร์มยาวหน้าเดียวที่ประกอบทุกอย่างเข้าด้วยกัน

**Files:**
- Create: `packages/ui/src/pages/RichMenuEditor.tsx`
- Test: `packages/ui/tests/editor.test.tsx`

**Interfaces:**
- Consumes: ทุก component จาก Task 4–10 · `validateRichMenu`, `TEMPLATES`, `ValidationError`
- Produces:
  - `interface RichMenuDraft { title: string; startAt: string; endAt: string; templateKey: string | null; areas: ActionFormState[]; bounds: Bounds[]; sizeName: RichMenuSizeName; chatBar: ChatBarValue; image: UploadedImage | null }`
  - `function emptyDraft(): RichMenuDraft`
  - `interface RichMenuEditorProps { initial?: RichMenuDraft; aliasOptions: readonly string[]; onSave(draft: RichMenuDraft, publish: boolean): Promise<void>; onCancel(): void }`
  - `const RichMenuEditor: React.FC<RichMenuEditorProps>`

โครงตามสเปก §5.7 — **ฟอร์มเดียวเลื่อนยาวแบ่งเป็นหมวด ไม่ใช่แท็บ** ปุ่ม Save draft / Save อยู่ทั้งบนหัวและท้ายฟอร์ม

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/editor.test.tsx`
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { RichMenuEditor, emptyDraft } from '../src/pages/RichMenuEditor.js'

function setup(overrides: Partial<React.ComponentProps<typeof RichMenuEditor>> = {}) {
  const onSave = vi.fn(async () => {})
  const onCancel = vi.fn()
  const toast = vi.fn()
  render(
    <PortProvider value={createStubPort({ t: (k) => k, toast })}>
      <RichMenuEditor aliasOptions={[]} onSave={onSave} onCancel={onCancel} {...overrides} />
    </PortProvider>,
  )
  return { onSave, onCancel, toast }
}

function chooseTemplate(key = 'RICH_MENU_TEMPLATE_205') {
  fireEvent.click(screen.getByTestId('open-template-picker'))
  fireEvent.click(screen.getByTestId(`template-option-${key}`))
  fireEvent.click(screen.getByTestId('template-apply'))
}

describe('RichMenuEditor', () => {
  it('เป็นฟอร์มเดียวเลื่อนยาว ไม่มีแท็บ', () => {
    setup()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('editor.mainSettings')).toBeInTheDocument()
    expect(screen.getByText('chatBar.title')).toBeInTheDocument()
  })

  it('มีปุ่มบันทึกทั้งบนหัวและท้ายฟอร์ม', () => {
    setup()
    expect(screen.getAllByTestId('save-draft')).toHaveLength(2)
    expect(screen.getAllByTestId('save-publish')).toHaveLength(2)
  })

  it('ปุ่มเลือกรูปถูกปิดไว้จนกว่าจะเลือก template', () => {
    setup()
    expect(screen.getByTestId('image-input')).toBeDisabled()
  })

  it('เลือก template แล้วได้ช่องครบตามแบบ และปุ่มรูปเปิดใช้ได้', () => {
    setup()
    chooseTemplate('RICH_MENU_TEMPLATE_205')
    expect(screen.getAllByTestId(/^area-header-/)).toHaveLength(2)
    expect(screen.getByTestId('image-input')).not.toBeDisabled()
  })

  it('ปุ่มเปลี่ยน template เปลี่ยนคำจาก Select เป็น Change เมื่อเลือกแล้ว', () => {
    setup()
    expect(screen.getByTestId('open-template-picker').textContent).toContain('common.select')
    chooseTemplate()
    expect(screen.getByTestId('open-template-picker').textContent).toContain('common.change')
  })

  it('เลือกช่องบน canvas แล้ว accordion ของช่องนั้นกางออก', () => {
    setup()
    chooseTemplate()
    fireEvent.click(screen.getAllByRole('button', { name: /^B/ })[0]!)
    expect(screen.getByTestId('area-body-1')).toBeInTheDocument()
  })

  it('สลับ outline ได้', () => {
    setup()
    chooseTemplate()
    expect(screen.getAllByText(/×/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('editor.showOutlines'))
    expect(screen.queryByText('2500×843')).not.toBeInTheDocument()
  })

  it('แถบแชทใน preview อัปเดตตามที่พิมพ์ทันที', () => {
    setup()
    fireEvent.click(screen.getByLabelText('chatBar.mode.custom'))
    fireEvent.change(screen.getByLabelText('chatBar.text'), { target: { value: 'ทดสอบ' } })
    expect(screen.getByTestId('preview-chat-bar').textContent).toContain('ทดสอบ')
  })

  it('บันทึกร่างได้แม้ยังกรอกไม่ครบ — ร่างคือร่าง', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getAllByTestId('save-draft')[0]!)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.anything(), false))
  })

  it('publish โดยยังไม่มี template ไม่ได้ และบอกว่าติดตรงไหน', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onSave).not.toHaveBeenCalled()
  })

  // สเปก §5.6 ข้อ 4 — error ต้องโผล่ที่ช่องที่ผิด
  it('publish ที่ล้มเพราะ action ไม่ครบ แสดง error ที่ช่องนั้น ไม่ใช่รวมบนหัวฟอร์ม', async () => {
    setup()
    chooseTemplate('RICH_MENU_TEMPLATE_105')
    fireEvent.click(screen.getAllByTestId('save-publish')[0]!)
    await waitFor(() => expect(screen.getByTestId('area-error-0')).toBeInTheDocument())
  })

  it('ยกเลิกแล้วเรียก onCancel', () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getAllByTestId('cancel')[0]!)
    expect(onCancel).toHaveBeenCalled()
  })

  it('เปิดของเดิมมาแก้ได้ครบทุกค่า', () => {
    const initial = {
      ...emptyDraft(),
      title: 'เมนูเดิม',
      chatBar: { mode: 'custom' as const, text: 'ร้านค้า', selected: false },
    }
    setup({ initial })
    expect(screen.getByLabelText('editor.title')).toHaveValue('เมนูเดิม')
    expect(screen.getByLabelText('chatBar.text')).toHaveValue('ร้านค้า')
    expect(screen.getByLabelText('chatBar.behavior.collapsed')).toBeChecked()
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/editor.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: เขียน `RichMenuEditor.tsx`**

`packages/ui/src/pages/RichMenuEditor.tsx`
```tsx
import { useState } from 'react'
import {
  TEMPLATES, ValidationError, validateRichMenu,
  type Bounds, type RichMenuSizeName,
} from '@fosivo/line-rich-menu-core/browser'
import { emptyActionForm, toAction, type ActionFormState } from '../action-form.js'
import { usePort } from '../port.js'
import { AreaList } from '../components/AreaList.js'
import { ChatBarSettings, type ChatBarValue } from '../components/ChatBarSettings.js'
import { CanvasEditor } from '../components/CanvasEditor.js'
import { ImageField, type UploadedImage } from '../components/ImageField.js'
import { MainSettings } from '../components/MainSettings.js'
import { Preview } from '../components/Preview.js'
import { TemplatePicker } from '../components/TemplatePicker.js'

export interface RichMenuDraft {
  title: string
  startAt: string
  endAt: string
  templateKey: string | null
  areas: ActionFormState[]
  bounds: Bounds[]
  sizeName: RichMenuSizeName
  chatBar: ChatBarValue
  image: UploadedImage | null
}

export function emptyDraft(): RichMenuDraft {
  return {
    title: '',
    startAt: '',
    endAt: '',
    templateKey: null,
    areas: [],
    bounds: [],
    sizeName: 'large',
    chatBar: { mode: 'default', text: '', selected: true },
    image: null,
  }
}

export interface RichMenuEditorProps {
  initial?: RichMenuDraft
  aliasOptions: readonly string[]
  onSave(draft: RichMenuDraft, publish: boolean): Promise<void>
  onCancel(): void
}

/** ผู้ใช้กรอกอะไรลงช่องนี้ไปแล้วหรือยัง — ใช้ตัดสินว่าการเปลี่ยน template จะทำลายงานหรือไม่ */
export function hasAnyActionConfigured(area: ActionFormState): boolean {
  const { type: _type, mode: _mode, ...rest } = area
  return Object.values(rest).some((value) => value !== '')
}

/** แปลง path ของ issue เช่น `areas.3.action.uri` เป็นเลข index ของช่อง */
function areaIndexOf(path: string): number | null {
  const match = /^areas\.(\d+)/.exec(path)
  return match === null ? null : Number(match[1])
}

export function RichMenuEditor({ initial, aliasOptions, onSave, onCancel }: RichMenuEditorProps) {
  const { ui, t, toast } = usePort()
  const [draft, setDraft] = useState<RichMenuDraft>(initial ?? emptyDraft())
  const [picking, setPicking] = useState(false)
  const [outlines, setOutlines] = useState(true)
  const [active, setActive] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'expanded'>('list')
  const [areaErrors, setAreaErrors] = useState<Record<number, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const template = draft.templateKey === null ? null : TEMPLATES[draft.templateKey] ?? null
  const size = template?.size ?? { width: 2500, height: 1686 }

  const applyTemplate = (key: string) => {
    const next = TEMPLATES[key]!
    setDraft((prev) => ({
      ...prev,
      templateKey: key,
      sizeName: next.sizeName,
      bounds: [...next.bounds],
      // เปลี่ยน template = ช่องเปลี่ยนทั้งชุด action เดิมจึงผูกกับช่องเดิมไม่ได้อีก
      areas: next.bounds.map(() => emptyActionForm()),
    }))
    setActive(null)
    setAreaErrors({})
    setPicking(false)
  }

  const save = async (publish: boolean) => {
    setFormError(null)
    setAreaErrors({})

    if (publish) {
      if (draft.templateKey === null) {
        setFormError(t('editor.error.noTemplate'))
        return
      }
      if (draft.image === null) {
        setFormError(t('editor.error.noImage'))
        return
      }
      try {
        validateRichMenu({
          size,
          selected: draft.chatBar.selected,
          name: draft.title === '' ? t('editor.untitled') : draft.title,
          chatBarText: draft.chatBar.mode === 'custom' && draft.chatBar.text !== ''
            ? draft.chatBar.text
            : t('chatBar.defaultLabel'),
          areas: draft.bounds.map((bounds, index) => ({
            bounds,
            action: toAction(draft.areas[index] ?? emptyActionForm()),
          })),
        })
      } catch (error) {
        if (error instanceof ValidationError) {
          const next: Record<number, string> = {}
          for (const issue of error.issues) {
            const index = areaIndexOf(issue.path)
            if (index === null) setFormError(t(`validation.${issue.code}`))
            else next[index] = t(`validation.${issue.code}`)
          }
          setAreaErrors(next)
          if (Object.keys(next).length > 0 && view === 'list') setActive(Number(Object.keys(next)[0]))
          return
        }
        throw error
      }
    }

    setSaving(true)
    try {
      await onSave(draft, publish)
      toast({ type: 'success', message: t(publish ? 'editor.published' : 'editor.savedDraft') })
    } catch {
      toast({ type: 'danger', message: t('editor.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <ui.Flex gap={2}>
      <ui.Button variant="secondary" onClick={onCancel} disabled={saving}>
        <span data-testid="cancel">{t('common.cancel')}</span>
      </ui.Button>
      <ui.Button variant="secondary" onClick={() => void save(false)} disabled={saving}>
        <span data-testid="save-draft">{t('editor.saveDraft')}</span>
      </ui.Button>
      <ui.Button onClick={() => void save(true)} disabled={saving}>
        <span data-testid="save-publish">{t('editor.save')}</span>
      </ui.Button>
    </ui.Flex>
  )

  return (
    <ui.Flex direction="column" gap={4}>
      <ui.Flex justifyContent="space-between" alignItems="center">
        <ui.Typography variant="alpha">{t('editor.heading')}</ui.Typography>
        {actions}
      </ui.Flex>

      {formError === null ? null : <ui.Alert variant="danger">{formError}</ui.Alert>}

      <MainSettings
        value={{ title: draft.title, startAt: draft.startAt, endAt: draft.endAt }}
        onChange={(next) => setDraft((prev) => ({ ...prev, ...next }))}
      />

      <ui.Divider />

      <ui.Flex gap={4} alignItems="flex-start">
        <ui.Flex direction="column" gap={2}>
          <Preview
            size={size}
            bounds={draft.bounds}
            chatBarText={draft.chatBar.mode === 'custom' ? draft.chatBar.text : ''}
            expanded={draft.chatBar.selected}
            {...(draft.image === null ? {} : { imageUrl: draft.image.url })}
          />
          <ui.Toggle
            name="outlines"
            label={t('editor.showOutlines')}
            checked={outlines}
            onChange={setOutlines}
          />
        </ui.Flex>

        <ui.Flex direction="column" gap={3}>
          <ui.Flex gap={2} alignItems="center">
            <ui.Typography>{t('editor.template')}</ui.Typography>
            <ui.Button variant="secondary" onClick={() => setPicking(true)}>
              <span data-testid="open-template-picker">
                {draft.templateKey === null ? t('common.select') : t('common.change')}
              </span>
            </ui.Button>
          </ui.Flex>

          <ui.Flex gap={2} alignItems="center">
            <ui.Typography>{t('editor.image')}</ui.Typography>
            <ImageField
              value={draft.image}
              size={size}
              disabled={draft.templateKey === null}
              onChange={(next) => setDraft((prev) => ({ ...prev, image: next }))}
            />
          </ui.Flex>

          {template === null ? null : (
            <CanvasEditor
              size={size}
              bounds={draft.bounds}
              showOutlines={outlines}
              activeIndex={active}
              onSelect={setActive}
              errors={areaErrors}
              {...(draft.image === null ? {} : { imageUrl: draft.image.url })}
            />
          )}

          <AreaList
            areas={draft.areas}
            activeIndex={active}
            view={view}
            onViewChange={setView}
            onSelect={setActive}
            onChange={(index, next) =>
              setDraft((prev) => ({
                ...prev,
                areas: prev.areas.map((a, i) => (i === index ? next : a)),
              }))}
            aliasOptions={aliasOptions}
            errors={areaErrors}
          />
        </ui.Flex>
      </ui.Flex>

      <ui.Divider />

      <ChatBarSettings
        value={draft.chatBar}
        onChange={(next) => setDraft((prev) => ({ ...prev, chatBar: next }))}
      />

      <ui.Flex justifyContent="flex-end">{actions}</ui.Flex>

      <TemplatePicker
        open={picking}
        currentKey={draft.templateKey}
        hasConfiguredActions={draft.areas.some(hasAnyActionConfigured)}
        onApply={applyTemplate}
        onClose={() => setPicking(false)}
      />
    </ui.Flex>
  )
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/editor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/pages/RichMenuEditor.tsx packages/ui/tests/editor.test.tsx
git commit -m "feat(ui): compose the editor as one scrolling form"
```

---

## Task 12: `api.ts` + หน้า `RichMenuList` และ `ChannelSettings`

**Files:**
- Create: `packages/ui/src/api.ts`, `packages/ui/src/pages/RichMenuList.tsx`, `packages/ui/src/pages/ChannelSettings.tsx`
- Modify: `packages/ui/src/components/ImageField.tsx` — เปลี่ยน `'/upload'` ที่ Task 10 hardcode ไว้ มาใช้ `ENDPOINTS.upload` ให้ path ประกาศที่เดียว (แก้เทสต์ของ ImageField ให้ตรงด้วย)
- Test: `packages/ui/tests/list.test.tsx`, `packages/ui/tests/channels.test.tsx`

**Interfaces:**
- Produces:
  - `const ENDPOINTS` — path ที่ฝั่ง adapter ต้อง implement (สัญญาระหว่าง Plan 02 กับ Plan 03)
  - `interface ChannelSummary { id: string; name: string; channelId: string; accessTokenPreview: string; isDefault: boolean }`
  - `interface RichMenuSummary { id: string; title: string; status: 'draft' | 'publishing' | 'published' | 'failed'; channelId: string; aliasId: string | null; updatedAt: string }`
  - `interface BotInfo { userId: string; basicId: string; displayName: string }`
  - `const RichMenuList: React.FC<{ channelId: string | null }>`
  - `const ChannelSettings: React.FC<Record<string, never>>`

`api.ts` เป็นจุดเดียวที่ประกาศ path — Plan 03 อ่านไฟล์นี้แล้ว implement ให้ตรง ไม่ต้องเดาจากโค้ด component

- [ ] **Step 1: เขียน `api.ts`**

`packages/ui/src/api.ts`
```ts
/**
 * สัญญาระหว่าง ui กับ adapter — adapter ของทั้ง Strapi 4 และ 5 ต้อง implement path เหล่านี้
 * ให้เหมือนกัน ui ไม่รู้ว่าเบื้องหลังเป็น entityService หรือ documents()
 */
export const ENDPOINTS = {
  channels: '/line-rich-menu/channels',
  channel: (id: string) => `/line-rich-menu/channels/${id}`,
  channelTest: (id: string) => `/line-rich-menu/channels/${id}/test`,
  menus: '/line-rich-menu/menus',
  menu: (id: string) => `/line-rich-menu/menus/${id}`,
  menuPublish: (id: string) => `/line-rich-menu/menus/${id}/publish`,
  menuSetDefault: (id: string) => `/line-rich-menu/menus/${id}/default`,
  upload: '/upload',
} as const

export interface ChannelSummary {
  id: string
  name: string
  channelId: string
  /** สี่ตัวท้ายเท่านั้น — token เต็มไม่เคยออกจากฝั่งเซิร์ฟเวอร์ (สเปก §11.2) */
  accessTokenPreview: string
  isDefault: boolean
}

export interface RichMenuSummary {
  id: string
  title: string
  status: 'draft' | 'publishing' | 'published' | 'failed'
  channelId: string
  aliasId: string | null
  updatedAt: string
}

export interface BotInfo {
  userId: string
  basicId: string
  displayName: string
}
```

- [ ] **Step 2: เขียน test ของทั้งสองหน้าที่ต้องล้มเหลว**

`packages/ui/tests/list.test.tsx`
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { RichMenuList } from '../src/pages/RichMenuList.js'

const menus = [
  { id: '1', title: 'เมนูหลัก', status: 'published', channelId: 'c1', aliasId: 'main', updatedAt: '2026-08-20' },
  { id: '2', title: 'ร่าง', status: 'draft', channelId: 'c1', aliasId: null, updatedAt: '2026-08-19' },
]

function setup(get = vi.fn(async () => menus), extra: Partial<ReturnType<typeof createStubPort>> = {}) {
  const base = createStubPort({ t: (k) => k })
  const port = { ...base, http: { ...base.http, get }, ...extra }
  render(<PortProvider value={port}><RichMenuList channelId="c1" /></PortProvider>)
  return { get, port }
}

describe('RichMenuList', () => {
  it('แสดงสถานะกำลังโหลดก่อน แล้วค่อยแสดงรายการ', async () => {
    setup()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('เมนูหลัก')).toBeInTheDocument())
  })

  it('แสดงสถานะของแต่ละเมนู', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('status-1').textContent).toContain('status.published'))
    expect(screen.getByTestId('status-2').textContent).toContain('status.draft')
  })

  it('กรองตาม channel ที่เลือก', async () => {
    const { get } = setup()
    await waitFor(() => expect(get).toHaveBeenCalledWith('/line-rich-menu/menus?channel=c1'))
  })

  it('บอกว่ายังไม่มีเมนู แทนที่จะแสดงตารางเปล่า', async () => {
    setup(vi.fn(async () => []))
    await waitFor(() => expect(screen.getByText('list.empty')).toBeInTheDocument())
  })

  it('แจ้งเตือนเมื่อโหลดไม่สำเร็จ ไม่ใช่ค้างที่ spinner', async () => {
    setup(vi.fn(async () => { throw new Error('boom') }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('ยังไม่เลือก channel ก็ไม่ยิงคำขอ', () => {
    const get = vi.fn()
    const base = createStubPort({ t: (k) => k })
    render(
      <PortProvider value={{ ...base, http: { ...base.http, get } }}>
        <RichMenuList channelId={null} />
      </PortProvider>,
    )
    expect(get).not.toHaveBeenCalled()
    expect(screen.getByText('list.pickChannel')).toBeInTheDocument()
  })

  it('กดแก้ไขแล้วนำทางไปหน้า editor ของเมนูนั้น', async () => {
    const push = vi.fn()
    const base = createStubPort({ t: (k) => k })
    render(
      <PortProvider value={{ ...base, http: { ...base.http, get: async () => menus }, nav: { ...base.nav, push } }}>
        <RichMenuList channelId="c1" />
      </PortProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('edit-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edit-1'))
    expect(push).toHaveBeenCalledWith('/rich-menus/1')
  })
})
```

`packages/ui/tests/channels.test.tsx`
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { ChannelSettings } from '../src/pages/ChannelSettings.js'

const channels = [
  { id: 'c1', name: 'ร้านทดสอบ', channelId: '1650000000', accessTokenPreview: '••••••••abcd', isDefault: true },
]

function setup(overrides: { get?: unknown; post?: unknown } = {}) {
  const base = createStubPort({ t: (k) => k })
  const get = overrides.get ?? vi.fn(async () => channels)
  const post = overrides.post ?? vi.fn(async () => ({}))
  const port = { ...base, http: { ...base.http, get, post } as typeof base.http }
  render(<PortProvider value={port}><ChannelSettings /></PortProvider>)
  return { get, post }
}

describe('ChannelSettings', () => {
  it('แสดง channel ที่มีอยู่', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('ร้านทดสอบ')).toBeInTheDocument())
  })

  // สเปก §11.2 — token เต็มต้องไม่เคยออกจากเซิร์ฟเวอร์
  it('แสดงเฉพาะสี่ตัวท้ายของ token ไม่เคยแสดงค่าเต็ม', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('••••••••abcd')).toBeInTheDocument())
  })

  it('เพิ่ม channel ใหม่ได้', async () => {
    const post = vi.fn(async () => ({}))
    setup({ post })
    await waitFor(() => expect(screen.getByTestId('add-channel')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('add-channel'))
    fireEvent.change(screen.getByLabelText('channel.name'), { target: { value: 'ร้านใหม่' } })
    fireEvent.change(screen.getByLabelText('channel.channelId'), { target: { value: '1660000000' } })
    fireEvent.change(screen.getByLabelText('channel.accessToken'), { target: { value: 'token' } })
    fireEvent.click(screen.getByTestId('save-channel'))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/line-rich-menu/channels', expect.objectContaining({
      name: 'ร้านใหม่', channelId: '1660000000',
    })))
  })

  it('ปุ่ม Test connection แสดงชื่อ OA ที่ยิงเจอจริง', async () => {
    const post = vi.fn(async () => ({ userId: 'U1', basicId: '@abc', displayName: 'ร้านที่ยิงเจอ' }))
    setup({ post })
    await waitFor(() => expect(screen.getByTestId('test-c1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('test-c1'))
    await waitFor(() => expect(screen.getByText(/ร้านที่ยิงเจอ/)).toBeInTheDocument())
    expect(post).toHaveBeenCalledWith('/line-rich-menu/channels/c1/test', undefined)
  })

  it('บอกเมื่อ Test connection ล้ม ไม่ปล่อยเงียบ', async () => {
    const post = vi.fn(async () => { throw new Error('401') })
    setup({ post })
    await waitFor(() => expect(screen.getByTestId('test-c1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('test-c1'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
```

- [ ] **Step 3: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/list.test.tsx packages/ui/tests/channels.test.tsx`
Expected: FAIL ทั้งสอง — module not found

- [ ] **Step 4: เขียนทั้งสองหน้า**

`packages/ui/src/pages/RichMenuList.tsx`
```tsx
import { useEffect, useState } from 'react'
import { ENDPOINTS, type RichMenuSummary } from '../api.js'
import { usePort } from '../port.js'

export function RichMenuList({ channelId }: { channelId: string | null }) {
  const { ui, http, nav, t } = usePort()
  const [menus, setMenus] = useState<RichMenuSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (channelId === null) return
    let cancelled = false
    setMenus(null)
    setError(null)
    http.get<RichMenuSummary[]>(`${ENDPOINTS.menus}?channel=${channelId}`)
      .then((rows) => { if (!cancelled) setMenus(rows) })
      .catch(() => { if (!cancelled) setError(t('list.loadFailed')) })
    return () => { cancelled = true }
  }, [channelId, http, t])

  if (channelId === null) return <ui.Typography>{t('list.pickChannel')}</ui.Typography>
  if (error !== null) return <ui.Alert variant="danger">{error}</ui.Alert>
  if (menus === null) return <ui.Loader>{t('common.loading')}</ui.Loader>
  if (menus.length === 0) return <ui.Typography>{t('list.empty')}</ui.Typography>

  return (
    <ui.Flex direction="column" gap={2}>
      {menus.map((menu) => (
        <ui.Flex key={menu.id} justifyContent="space-between" alignItems="center">
          <ui.Typography>{menu.title}</ui.Typography>
          <span data-testid={`status-${menu.id}`}>{t(`status.${menu.status}`)}</span>
          <ui.Button variant="secondary" onClick={() => nav.push(`/rich-menus/${menu.id}`)}>
            <span data-testid={`edit-${menu.id}`}>{t('common.edit')}</span>
          </ui.Button>
        </ui.Flex>
      ))}
    </ui.Flex>
  )
}
```

`packages/ui/src/pages/ChannelSettings.tsx`
```tsx
import { useEffect, useState } from 'react'
import { ENDPOINTS, type BotInfo, type ChannelSummary } from '../api.js'
import { usePort } from '../port.js'

interface DraftChannel {
  name: string
  channelId: string
  channelSecret: string
  accessToken: string
}

const emptyChannel: DraftChannel = { name: '', channelId: '', channelSecret: '', accessToken: '' }

export function ChannelSettings() {
  const { ui, http, t } = usePort()
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<DraftChannel>(emptyChannel)
  const [tested, setTested] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    http.get<ChannelSummary[]>(ENDPOINTS.channels)
      .then(setChannels)
      .catch(() => setError(t('channel.loadFailed')))
  }

  useEffect(reload, [])

  const save = async () => {
    setError(null)
    try {
      await http.post(ENDPOINTS.channels, draft)
      setDraft(emptyChannel)
      setAdding(false)
      reload()
    } catch {
      setError(t('channel.saveFailed'))
    }
  }

  const test = async (id: string) => {
    setError(null)
    setTested(null)
    try {
      const info = await http.post<BotInfo>(ENDPOINTS.channelTest(id), undefined)
      setTested(t('channel.testOk', { name: info.displayName }))
    } catch {
      setError(t('channel.testFailed'))
    }
  }

  const set = <K extends keyof DraftChannel>(key: K, value: DraftChannel[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <ui.Flex direction="column" gap={3}>
      <ui.Typography variant="alpha">{t('channel.heading')}</ui.Typography>
      {error === null ? null : <ui.Alert variant="danger">{error}</ui.Alert>}
      {tested === null ? null : <ui.Alert variant="success">{tested}</ui.Alert>}

      {channels.map((channel) => (
        <ui.Flex key={channel.id} justifyContent="space-between" alignItems="center">
          <ui.Typography>{channel.name}</ui.Typography>
          <ui.Typography textColor="neutral600">{channel.channelId}</ui.Typography>
          <ui.Typography textColor="neutral600">{channel.accessTokenPreview}</ui.Typography>
          <ui.Button variant="secondary" onClick={() => void test(channel.id)}>
            <span data-testid={`test-${channel.id}`}>{t('channel.test')}</span>
          </ui.Button>
        </ui.Flex>
      ))}

      {adding ? (
        <ui.Flex direction="column" gap={2}>
          <ui.TextInput name="name" label={t('channel.name')} value={draft.name}
            onChange={(v) => set('name', v)} />
          <ui.TextInput name="channelId" label={t('channel.channelId')} value={draft.channelId}
            onChange={(v) => set('channelId', v)} />
          <ui.TextInput name="channelSecret" label={t('channel.channelSecret')} value={draft.channelSecret}
            onChange={(v) => set('channelSecret', v)} />
          <ui.TextInput name="accessToken" label={t('channel.accessToken')} value={draft.accessToken}
            onChange={(v) => set('accessToken', v)} />
          <ui.Flex gap={2}>
            <ui.Button variant="secondary" onClick={() => setAdding(false)}>{t('common.cancel')}</ui.Button>
            <ui.Button onClick={() => void save()}>
              <span data-testid="save-channel">{t('common.save')}</span>
            </ui.Button>
          </ui.Flex>
        </ui.Flex>
      ) : (
        <ui.Button onClick={() => setAdding(true)}>
          <span data-testid="add-channel">{t('channel.add')}</span>
        </ui.Button>
      )}
    </ui.Flex>
  )
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/list.test.tsx packages/ui/tests/channels.test.tsx`
Expected: PASS ทั้งสอง

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/api.ts packages/ui/src/pages packages/ui/tests/list.test.tsx packages/ui/tests/channels.test.tsx
git commit -m "feat(ui): add the menu list, channel settings, and the adapter API contract"
```

---

## Task 13: i18n — `en` และ `th` พร้อมยามกันคีย์หาย

**Files:**
- Create: `packages/ui/src/i18n/en.ts`, `packages/ui/src/i18n/th.ts`, `packages/ui/src/i18n/index.ts`
- Test: `packages/ui/tests/i18n.test.ts`

**Interfaces:**
- Produces: `const MESSAGES: Record<'en' | 'th', Record<string, string>>` · `const TRANSLATION_KEYS: readonly string[]`

สเปก §12 ให้ `en` เป็นค่าเริ่มต้น และไฟล์ในแพ็กเกจนี้เป็น source of truth — adapter คัดลอกไปตอน build ไม่ใช่เขียนซ้ำ

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/ui/tests/i18n.test.ts`
```ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MESSAGES } from '../src/i18n/index.js'

const srcRoot = fileURLToPath(new URL('../src', import.meta.url))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : []
  })
}

/** ดึงทุกคีย์ที่โค้ดเรียกจริงผ่าน t('...') */
function keysUsedInSource(): string[] {
  const found = new Set<string>()
  for (const file of walk(srcRoot)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9._-]+)'/g)) {
      found.add(match[1]!)
    }
  }
  return [...found].sort()
}

describe('i18n', () => {
  it('มีทั้ง en และ th', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual(['en', 'th'])
  })

  it('ทั้งสองภาษามีคีย์ชุดเดียวกันเป๊ะ', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.th).sort())
  })

  it('ไม่มีคำแปลไหนเป็นสตริงว่าง', () => {
    for (const [locale, table] of Object.entries(MESSAGES)) {
      const empty = Object.entries(table).filter(([, value]) => value.trim() === '')
      expect(empty, `${locale} มีคำแปลว่าง`).toEqual([])
    }
  })

  // ยามที่สำคัญที่สุด: คีย์ที่โค้ดเรียกแต่ไม่มีคำแปล จะโผล่เป็น raw key บนหน้าจอผู้ใช้
  it('ทุกคีย์ที่โค้ดเรียกใช้ มีคำแปลครบทั้งสองภาษา', () => {
    const missing: string[] = []
    for (const key of keysUsedInSource()) {
      // คีย์ที่ประกอบขึ้นตอน runtime เช่น t(`action.type.${type}`) จับด้วย regex ไม่ได้
      // จึงตรวจเฉพาะคีย์ที่เขียนตรง ๆ
      if (MESSAGES.en[key] === undefined) missing.push(`en:${key}`)
      if (MESSAGES.th[key] === undefined) missing.push(`th:${key}`)
    }
    expect(missing).toEqual([])
  })

  it('มีคำแปลของคีย์ที่ประกอบตอน runtime ครบทุกค่าที่เป็นไปได้', () => {
    const dynamic = [
      ...['message', 'uri', 'postback', 'datetimepicker', 'richmenuswitch', 'clipboard', 'camera', 'cameraRoll', 'location']
        .map((t) => `action.type.${t}`),
      ...['date', 'time', 'datetime'].map((m) => `action.mode.${m}`),
      ...['draft', 'publishing', 'published', 'failed'].map((s) => `status.${s}`),
      ...['large', 'compact'].map((g) => `template.picker.group.${g}`),
      ...['uri_scheme_not_allowed', 'canvas_size_not_allowed', 'area_out_of_bounds', 'too_small', 'too_big', 'unrecognized_keys']
        .map((c) => `validation.${c}`),
    ]
    const missing = dynamic.filter((key) => MESSAGES.en[key] === undefined || MESSAGES.th[key] === undefined)
    expect(missing).toEqual([])
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

Run: `pnpm vitest run packages/ui/tests/i18n.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: เขียนไฟล์ i18n**

`packages/ui/src/i18n/index.ts`
```ts
import { en } from './en.js'
import { th } from './th.js'

export const MESSAGES: Record<'en' | 'th', Record<string, string>> = { en, th }
export const TRANSLATION_KEYS: readonly string[] = Object.keys(en).sort()
```

**ทำไมเป็น `.ts` ไม่ใช่ `.json`:** การ import JSON ต้องเปิด `resolveJsonModule` และในสายตา
`moduleResolution: Bundler` การเขียน `with { type: 'json' }` ยังไม่แน่นอน ส่วนไฟล์ `.ts` ที่ export
ค่าคงที่ทำงานเหมือนกันทุกที่โดยไม่ต้องตั้งค่าอะไรเพิ่ม และ adapter ก็ import ได้ตรง ๆ เหมือนกัน

`packages/ui/src/i18n/en.ts` — สร้างคีย์ให้ครบทุกอันที่ component เรียกใช้ รวมคีย์ที่ประกอบตอน runtime ตามรายการในเทสต์ Step 1 ห่อด้วย `export const en: Record<string, string> = { ... }` ตัวอย่างเนื้อใน:
```ts
{
  "common.cancel": "Cancel",
  "common.apply": "Apply",
  "common.save": "Save",
  "common.select": "Select",
  "common.change": "Change",
  "common.clear": "Clear",
  "common.edit": "Edit",
  "common.remove": "Remove",
  "common.loading": "Loading…",
  "editor.heading": "Rich menu",
  "editor.mainSettings": "Main settings",
  "editor.title": "Title",
  "editor.title.hint": "Titles are only for management purposes. Users won't see them.",
  "editor.displayPeriod.start": "Display from",
  "editor.displayPeriod.end": "Display until",
  "editor.template": "Template",
  "editor.image": "Image",
  "editor.actions": "Actions",
  "editor.showOutlines": "Show template outlines",
  "editor.saveDraft": "Save draft",
  "editor.save": "Save",
  "editor.untitled": "Untitled",
  "editor.published": "Rich menu published",
  "editor.savedDraft": "Draft saved",
  "editor.saveFailed": "Could not save the rich menu",
  "editor.error.noTemplate": "Choose a template before publishing",
  "editor.error.noImage": "Upload an image before publishing",
  "editor.view.list": "List",
  "editor.view.expanded": "Expand all",
  "chatBar.title": "Chat bar settings",
  "chatBar.mode": "Menu bar label",
  "chatBar.mode.default": "Menu",
  "chatBar.mode.custom": "Custom label",
  "chatBar.text": "Custom label",
  "chatBar.defaultLabel": "Menu",
  "chatBar.behavior": "Default behavior",
  "chatBar.behavior.shown": "Shown",
  "chatBar.behavior.collapsed": "Collapsed",
  "preview.greeting": "Hello!",
  "template.picker.title": "Select a template",
  "template.picker.group.large": "Large",
  "template.picker.group.compact": "Compact",
  "template.picker.areaCount": "{count} areas",
  "template.picker.confirmDiscard": "Change and discard",
  "template.picker.discardTitle": "This clears the actions you configured",
  "template.picker.discardBody": "A different template has different areas, so the actions set on the current ones cannot be carried over.",
  "action.field.type": "Action type",
  "action.field.label": "Label",
  "action.field.text": "Text",
  "action.field.uri": "URI",
  "action.field.altUri": "Desktop URI",
  "action.field.data": "Postback data",
  "action.field.displayText": "Display text",
  "action.field.mode": "Mode",
  "action.field.richMenuAliasId": "Target menu",
  "action.field.chooseAlias": "Choose a menu",
  "action.field.clipboardText": "Text to copy",
  "action.type.message": "Message",
  "action.type.uri": "URI",
  "action.type.postback": "Postback",
  "action.type.datetimepicker": "Date and time picker",
  "action.type.richmenuswitch": "Switch rich menu",
  "action.type.clipboard": "Copy to clipboard",
  "action.type.camera": "Camera",
  "action.type.cameraRoll": "Camera roll",
  "action.type.location": "Location",
  "action.mode.date": "Date",
  "action.mode.time": "Time",
  "action.mode.datetime": "Date and time",
  "image.error.format": "Only JPEG and PNG images are accepted",
  "image.error.decode": "That file could not be read as an image",
  "image.error.ratio": "The image must match the template's proportions ({expected})",
  "image.error.upload": "Upload failed",
  "list.empty": "No rich menus yet",
  "list.pickChannel": "Choose a LINE Official Account first",
  "list.loadFailed": "Could not load rich menus",
  "status.draft": "Draft",
  "status.publishing": "Publishing",
  "status.published": "Published",
  "status.failed": "Failed",
  "channel.heading": "LINE Official Accounts",
  "channel.name": "Name",
  "channel.channelId": "Channel ID",
  "channel.channelSecret": "Channel secret",
  "channel.accessToken": "Channel access token",
  "channel.add": "Add an account",
  "channel.test": "Test connection",
  "channel.testOk": "Connected to {name}",
  "channel.testFailed": "LINE rejected those credentials",
  "channel.loadFailed": "Could not load accounts",
  "channel.saveFailed": "Could not save the account",
  "validation.uri_scheme_not_allowed": "Use an https, http, tel or line address",
  "validation.canvas_size_not_allowed": "That canvas size is not one LINE accepts",
  "validation.area_out_of_bounds": "This area falls outside the menu",
  "validation.too_small": "This value is too short",
  "validation.too_big": "This value is too long",
  "validation.unrecognized_keys": "Unexpected field"
}
```

`packages/ui/src/i18n/th.ts` — `export const th: Record<string, string> = { ... }` คีย์ชุดเดียวกันทั้งหมด แปลเป็นไทย ตัวอย่างสองสามอัน:
```ts
{
  "common.cancel": "ยกเลิก",
  "editor.title.hint": "ชื่อนี้ใช้จัดการภายใน ผู้ใช้ปลายทางไม่เห็น",
  "chatBar.behavior.collapsed": "ยุบไว้",
  "validation.area_out_of_bounds": "ช่องนี้อยู่นอกกรอบเมนู"
}
```

**เทสต์เป็นตัวบอกว่าคีย์ครบหรือยัง** — รัน แล้วเติมคีย์ที่ขาดจนกว่าจะเขียว อย่าเดาว่าครบแล้ว

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `pnpm vitest run packages/ui/tests/i18n.test.ts`
Expected: PASS — ถ้าแดงเพราะคีย์ขาด ให้เติมคีย์ ไม่ใช่ลดเทสต์

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/i18n packages/ui/tests/i18n.test.ts
git commit -m "feat(ui): add English and Thai messages with a key-coverage guard"
```

---

## Task 14: playground เต็มรูปแบบ + ตรวจรับด้วยตา

**Files:**
- Modify: `tools/ui-playground/src/App.tsx`
- Modify: `packages/ui/src/index.ts` (export ทุกอย่างที่ adapter ต้องใช้)

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 2–13
- Produces: `packages/ui` public API ฉบับสมบูรณ์ที่ Plan 03 จะ import

- [ ] **Step 1: export ทุกอย่างจาก `index.ts`**

`packages/ui/src/index.ts`
```ts
export * from './api.js'
export * from './action-form.js'
export * from './port.js'
export * from './stub-port.js'
export * from './styles.js'
export * from './components/ActionForm.js'
export * from './components/AreaList.js'
export * from './components/CanvasEditor.js'
export * from './components/ChatBarSettings.js'
export * from './components/ImageField.js'
export * from './components/MainSettings.js'
export * from './components/Preview.js'
export * from './components/TemplatePicker.js'
export * from './pages/ChannelSettings.js'
export * from './pages/RichMenuEditor.js'
export * from './pages/RichMenuList.js'
export { MESSAGES, TRANSLATION_KEYS } from './i18n/index.js'
```

- [ ] **Step 2: เปลี่ยน playground ให้เรนเดอร์ editor จริง**

`tools/ui-playground/src/App.tsx` — แทนที่ทั้งไฟล์
```tsx
import { useMemo, useState } from 'react'
import {
  MESSAGES, PortProvider, RichMenuEditor, createStubPort,
  type RichMenuDraft, type UIPort,
} from '@fosivo/line-rich-menu-ui'

function makePort(locale: 'en' | 'th', log: (line: string) => void): UIPort {
  const table = MESSAGES[locale]
  return createStubPort({
    t: (key, values) => {
      const template = table[key]
      if (template === undefined) return `⟨${key}⟩`
      if (values === undefined) return template
      return Object.entries(values).reduce(
        (out, [k, v]) => out.replace(`{${k}}`, String(v)),
        template,
      )
    },
    toast: (message) => log(`${message.type}: ${message.message}`),
    http: {
      get: async () => [] as never,
      // จำลองการอัปโหลดให้สำเร็จ เพื่อให้เดินฟอร์มได้จนจบโดยไม่ต้องมีเซิร์ฟเวอร์
      post: async (url) =>
        (url === '/upload'
          ? [{ id: 1, url: 'https://placehold.co/2500x1686/png', width: 2500, height: 1686 }]
          : {}) as never,
      put: async () => ({}) as never,
      del: async () => ({}) as never,
    },
  })
}

export function App() {
  const [locale, setLocale] = useState<'en' | 'th'>('en')
  const [lines, setLines] = useState<string[]>([])
  const [saved, setSaved] = useState<RichMenuDraft | null>(null)

  // ต้อง memo ไว้ — หน้าที่มี useEffect ผูกกับ port.http จะ fetch วนไม่รู้จบถ้า port
  // เป็น object ใหม่ทุกรอบ render
  const port = useMemo(
    () => makePort(locale, (line) => setLines((prev) => [line, ...prev].slice(0, 8))),
    [locale],
  )

  return (
    <PortProvider value={port}>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem',
                     font: '15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', margin: 0 }}>UI playground</h1>
            <p style={{ color: '#666687', margin: '.25rem 0 0' }}>
              รันด้วย stub port ตัวเดียวกับที่เทสต์ใช้ — คีย์ที่ยังไม่มีคำแปลจะขึ้นเป็น ⟨key⟩
            </p>
          </div>
          <select value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'th')}>
            <option value="en">English</option>
            <option value="th">ไทย</option>
          </select>
        </header>

        <RichMenuEditor
          aliasOptions={['tab-a', 'tab-b']}
          onSave={async (draft, publish) => {
            setSaved(draft)
            setLines((prev) => [`save publish=${publish}`, ...prev].slice(0, 8))
          }}
          onCancel={() => setLines((prev) => ['cancel', ...prev].slice(0, 8))}
        />

        <section style={{ marginTop: '2rem', borderTop: '1px solid #dcdce4', paddingTop: '1rem' }}>
          <h2 style={{ fontSize: '.9rem', color: '#666687' }}>events</h2>
          <ul>{lines.map((line, i) => <li key={i}><code>{line}</code></li>)}</ul>
          {saved === null ? null : (
            <details>
              <summary>draft ล่าสุด</summary>
              <pre style={{ overflowX: 'auto' }}>{JSON.stringify(saved, null, 2)}</pre>
            </details>
          )}
        </section>
      </main>
    </PortProvider>
  )
}
```

- [ ] **Step 3: ตรวจทั้งชุดก่อนดูด้วยตา**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: clean ทั้งหมด · coverage ของ workspace ยังผ่านเกณฑ์ 90

- [ ] **Step 4: ตรวจรับด้วยตาในเบราว์เซอร์**

Run: `pnpm --filter @fosivo/ui-playground dev` แล้วเปิด `http://127.0.0.1:4030`

ไล่ตรวจตามนี้ ทุกข้อต้องผ่าน:

1. **ไม่มี `⟨key⟩` โผล่ที่ไหนเลย** ทั้งภาษาอังกฤษและไทย — ถ้าเจอแปลว่าคีย์ขาด
2. ฟอร์มเป็น**หน้าเดียวเลื่อนยาว** มีหมวด Main settings → Menu content → Chat bar settings และปุ่มบันทึกทั้งบนและล่าง
3. ปุ่ม Image ถูกปิดไว้ กดเลือก template แล้วเปิดใช้ได้ และคำบนปุ่ม template เปลี่ยนจาก Select เป็น Change
4. modal เลือก template แสดง Large 7 แบบ Compact 5 แบบ พร้อมขนาดพิกเซลทั้งสามที่หัวกลุ่ม
5. เลือก template ที่ตั้ง action ไว้แล้วเปลี่ยนใหม่ → **ต้องถามยืนยันก่อน**
6. กด Tab ไล่ช่องบน canvas ได้ มีวงโฟกัสชัด กด Enter แล้ว accordion ของช่องนั้นกางออก
7. พิมพ์ custom label แล้ว**แถบแชทใน preview เปลี่ยนตามทันที** และตัวนับขึ้น n/14
8. สลับชนิด action จาก URI เป็น Message แล้วกลับมา — **ค่า URI ที่พิมพ์ไว้ต้องยังอยู่**
9. กด Save โดยยังไม่ครบ → error โผล่**ที่ช่องที่ผิด** ไม่ใช่รวมบนหัวฟอร์ม
10. สลับภาษาเป็นไทย ทุกอย่างแปลครบ

หยุดเซิร์ฟเวอร์เมื่อตรวจเสร็จ

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/index.ts tools/ui-playground/src/App.tsx
git commit -m "feat(ui): export the public surface and drive the full editor from the playground"
```

---

## Self-Review

**1. Spec coverage**

| สเปก | Task | สถานะ |
|---|---|---|
| §5.1 UIPort 15 primitives + http/toast/nav/t | 2 | ครอบ |
| §5.2 CanvasEditor ไม่ผ่าน port | 4, 5 | ครอบ — มีเทสต์ยืนยันว่าเรนเดอร์ได้โดยไม่มี PortProvider |
| §5.2 อัปโหลดผ่าน `/upload` ไม่แตะ Media Library | 10 | ครอบ |
| §5.3 หน้าจอทั้งสาม | 11, 12 | ครอบ |
| §5.4 mapper form-state ⇄ payload + round trip | 3 | ครอบ |
| §5.5 chat bar สองสวิตช์ + เก็บโหมด | 9 | ครอบ |
| §5.6 ข้อ 1 คีย์บอร์ด | 4 | ครอบ |
| §5.6 ข้อ 2 ยืนยันก่อนเปลี่ยน template | 7 | ครอบ |
| §5.6 ข้อ 3 ตรวจขนาดรูปฝั่ง client | 10 | ครอบ |
| §5.6 ข้อ 4 error ราย ช่อง | 8, 11 | ครอบ |
| §5.6 ข้อ 5 ตัวนับตัวอักษร | 9 | ครอบ |
| §5.6 สองโหมดแก้ areas | 8 | ครอบ |
| §5.7 ฟอร์มเดียวเลื่อนยาว ไม่ใช่แท็บ | 11 | ครอบ |
| §5.7 ขนาดพิกเซลกำกับบน overlay | 4 | ครอบ |
| §5.7 preview สะท้อน label สด | 9, 11 | ครอบ |
| §5.7 Select → Change | 11 | ครอบ |
| §12 i18n en/th | 13 | ครอบ |
| **§5.7 Design guide modal** | — | **ไม่ครอบโดยตั้งใจ** — เป็นเอกสารช่วยเหลือ ไม่ใช่ฟังก์ชัน เลื่อนไป Plan 04 พร้อม docs |
| **§9 alias / เมนูหลายแท็บ** | 8 (dropdown) | ครอบเฉพาะฝั่ง UI — การผูก alias จริงเป็นงานของ adapter ใน Plan 03 |
| **§10 ตั้งเวลา** | 9 (ช่องกรอก) | ครอบเฉพาะฟอร์ม — cron อยู่ฝั่ง server ใน Plan 03 |

**2. Placeholder scan** — ไม่มี TBD/TODO ทุก step มีโค้ดจริงและคำสั่งรันจริง ข้อยกเว้นเดียวคือไฟล์ `th.json` ที่ให้ตัวอย่างสี่คีย์แล้วบอกให้เทสต์เป็นตัวชี้ว่าครบหรือยัง — จงใจ เพราะการพิมพ์คำแปล 90 คีย์ลงในแผนไม่ได้เพิ่มความชัดเจน และเทสต์บังคับให้ครบอยู่แล้ว

**3. Type consistency** — ตรวจแล้ว: `ActionFormState` ใช้ชื่อเดียวกันทั้ง Task 3/8/11 · `ChatBarValue` ตรงกันระหว่าง Task 9 กับ 11 · `UploadedImage` ตรงกันระหว่าง Task 10 กับ 11 · `CanvasEditorProps` ที่ Task 5 เพิ่ม `snap` ไม่ทำให้ Task 4 พัง เพราะเป็น optional · `usePort()` คืน `UIPort` ที่ประกาศครั้งเดียวใน Task 2 และทุก component ใช้ shape เดียวกัน

---

## แผนถัดไป

Plan 02 จบแล้วได้ **UI ครบทุกหน้าจอ ทดสอบได้ และเปิดดูในเบราว์เซอร์ได้ โดยยังไม่มี Strapi สักบรรทัด** — ประมาณ 3–4 วัน

| Plan | ขอบเขต |
|---|---|
| **03 — adapter v4** | entry files แบบ root, `entityService` repo, จับคู่ DS v1 เข้ากับ UIPort, content-types, RBAC, cron lock, audit log, `examples/v4-app` |
| **04 — adapter v5 + release** | จับคู่ DS v2, `documents()` repo, docs, deploy demo, publish 1.0.0 |
