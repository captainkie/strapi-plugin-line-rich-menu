# LINE Rich Menu — Plan 03: ชั้น service ที่ใช้ร่วมกัน + adapter ของ Strapi 4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างสองอย่างที่ต่อจาก Plan 01/02 ให้ครบ — (ก) **ชั้น service ฝั่งเซิร์ฟเวอร์ที่ไม่รู้จัก Strapi** ใน `packages/core/src/server/` ซึ่งถือ publish orchestration, audit, การเก็บความลับ, rate limit และ scheduler ไว้ที่เดียว และ (ข) **adapter ของ Strapi 4.25.x** ที่จ่ายให้ชั้นนั้นเพียงสามอย่าง — `Repo` implementation, `UIPort` implementation, และ boilerplate ลงทะเบียนของเวอร์ชันตัวเอง จบแผนนี้ต้อง `examples/v4-app` login → สร้างเมนู → อัปรูป → publish → เห็น `published` ได้จริง

**Architecture:** สเปก §3.1 วาดต้นไม้ที่ไม่มีแพ็กเกจ server ร่วม ถ้าอ่านตรงตัวจะได้ publish path สองชุดที่ค่อย ๆ ลอยจากกัน — ซึ่งขัดกับ §3.2 ที่บอกหลักไว้ตรง ๆ ว่าอะไรที่ไม่ต้องพึ่ง Strapi ให้ยกไป `core` **ชั้น service ทั้งหมดจึงอยู่ใน `packages/core/src/server/` เขียนทับ seam `Repo<T>` ของ §6.2** ทดสอบได้โดยไม่ต้องบูต Strapi และ Plan 04 เหลือแค่จับคู่ DS v2 กับ `documents()` เหตุผลเต็มอยู่ใน design notes ข้อ 1 ราคาที่ต้องจ่ายคือ `core` มีผิวฝั่งเซิร์ฟเวอร์ที่ห้ามหลุดเข้าบันเดิลของ admin — Task 1 ปิดด้วยยามเดินกราฟ import จริง ไม่ใช่ denylist ของชื่อ symbol

**Tech Stack:** TypeScript 5.6 · zod ^3.23.8 · sharp ^0.35.3 · vitest 3 · fast-check 4 · tsup (ทั้ง `core` และ `strapi-v4`) · Strapi **4.25.11** / Node **20.20.0** / Community Edition · Design System v1 · react-router-dom v5 · `@strapi/helper-plugin` ^4.25 · knex ผ่าน `strapi.db.connection`

**Spec:** `docs/superpowers/specs/2026-08-20-line-rich-menu-strapi-plugin-design.md` — §2.1, §3, §6, §7, §8, §9, §10, §11, §13 คือสัญญาที่แผนนี้ต้องทำให้ครบ §11 คือหัวข้อที่แผนนี้ต้องเคารพมากที่สุด

**สิ่งที่ส่งต่อมา:** `docs/superpowers/plans/2026-08-20-line-rich-menu-carry-forward.md` (อ่าน "For Plan 03" และ "Known limits in what shipped") และ `docs/superpowers/plans/2026-08-20-line-rich-menu-03-04-design-notes.md` (ข้อ 1–3 เป็นการตัดสินใจที่แผนนี้เดินตาม ไม่ใช่ข้อเสนอให้ทบทวนใหม่)

**สัญญาที่ผูกอยู่แล้ว:** `packages/ui/src/api.ts` — `ENDPOINTS` ในไฟล์นั้นคือ path ที่ adapter ต้อง implement ให้ตรงเป๊ะ และ `ChannelSummary` / `RichMenuSummary` / `BotInfo` คือรูปทรงที่ response ต้องเป็น ห้ามเปลี่ยนฝั่ง `ui` เพื่อให้ฝั่ง server ง่ายขึ้น

---

## Global Constraints

ทุก task อยู่ภายใต้ข้อจำกัดเหล่านี้เสมอ

- **`packages/core/src/server/**` ต้องไม่มีทางถูกเข้าถึงจาก subpath `./browser`** — บังคับด้วยเทสต์เดินกราฟ import ใน Task 1 และด้วยขั้น grep ใน CI ห้าม `src/browser.ts` หรืออะไรที่มันดึงมา import จาก `./server/` ไม่ว่ากรณีใด
- **`packages/core` ยังห้ามมี dependency ที่ขึ้นต้นด้วย `@strapi/`** — `tests/no-strapi-deps.test.ts` เดิมยังบังคับอยู่ ชั้น service รับ Strapi เข้ามาทาง interface ล้วน (`Repo<T>`, `ImageStore`, `KnexLike`, `AuditWriter`) ไม่เคย import
- **ความลับห้ามออกจากฝั่งเซิร์ฟเวอร์** (สเปก §11.2) — ไม่มี response body ไหนมี `channelAccessToken` หรือ `channelSecret` แบบ plaintext ได้เลย repository คืนค่าที่ตัดฟิลด์ลับออกโดยปริยาย ต้องเรียก `withSecrets()` อย่างจงใจถึงจะได้มา
- **zod ตรวจที่ขอบของ route ทุกเส้นก่อนถึง service** (สเปก §11.3) ใช้ `.strict()` เสมอ ปฏิเสธฟิลด์แปลกปลอม
- **ทุก query ที่เขียนด้วย knex ใช้ binding เท่านั้น** ห้าม string interpolation แม้แต่ใน lock query
- **audit เขียนทุกเส้นทางรวมถึงตอนล้มเหลว** (สเปก §11.5) และ append-only — ไม่มี route ให้แก้หรือลบ
- **error ที่ขึ้นถึง UI เป็น error code เสมอ ไม่ใช่ข้อความดิบจาก LINE หรือจาก libvips** (สเปก §11.7) — `core` มี typed error พร้อม `code` อยู่แล้ว adapter ส่งต่อ `code` ไม่ส่ง `message`
- **ห้ามมี `postinstall` script** ในแพ็กเกจที่ปล่อย (สเปก §11.6) — Task 13 มีเทสต์บังคับ
- **แผนนี้เริ่มได้ก็ต่อเมื่อ Plan 02 จบครบทุก task** — Task 19 ใช้ `MESSAGES` / `TRANSLATION_KEYS` จาก `packages/ui/src/i18n` (Plan 02 Task 13) และ `ENDPOINTS` / `ChannelSettings` / `RichMenuList` ที่ถูก export จาก `packages/ui/src/index.ts` (Plan 02 Task 12, 14) ถ้าสามอย่างนี้ยังไม่มี Task 19 จะคอมไพล์ไม่ผ่าน ส่วน Task 1–18 ไม่ผูกกับ `ui` เลยและเริ่มได้ทันที
- **Node 20** (`engines: >=20.15.0`) · pnpm **10.34.5** · ทุก commit ใช้ Conventional Commits ภาษาอังกฤษตามประวัติที่มีอยู่
- `tsconfig` เปิด `noUncheckedIndexedAccess` · ESLint `@typescript-eslint/consistent-type-imports: error`
- **`packages/core/src/index.ts` ถูกแตะโดยหลาย task** — Task 1 เพิ่มบรรทัด `export * from './server/index.js'` ครั้งเดียว จากนั้น Task 2–12 ให้เพิ่ม `export *` ของตัวเองต่อท้าย **`packages/core/src/server/index.ts`** ห้ามเขียนทับของคนอื่น
- **Strapi 4 หมดอายุการสนับสนุนไปแล้วเมื่อ 30 เม.ย. 2026** — plugin ตัวนี้มีอยู่เพราะลูกค้าที่จ่ายเงินรัน 4.25.11 ไม่ใช่เพราะ v4 เป็นแพลตฟอร์มที่ควรสร้างของใหม่บนนั้น ตรงไหนที่ API ของ v4 ถูก deprecate หรือพิลึก **ให้เลือกทางที่ไม่ต้องเขียนใหม่ตอนลูกค้าย้าย** เช่น ไม่พึ่ง helper ที่หายไปใน v5 ถ้าเขียนเองได้ใน 5 บรรทัด
- **`examples/v4-app` คือ acceptance gate** ไม่ใช่ตัวอย่างประกอบ — task ไหนที่ทำให้มันพัง ถือว่า task นั้นยังไม่เสร็จ

---

## File Structure

```
packages/core/src/
├─ index.ts                        เพิ่ม export * from './server/index.js'  (Task 1)
├─ browser.ts                      ไม่แตะ — ต้องไปไม่ถึง server/ ตลอดกาล
├─ line/client.ts                  เพิ่ม getDefault() / getAlias()          (Task 9)
└─ server/
   ├─ index.ts                     barrel ของชั้น service
   ├─ types.ts                     Repo<T> · record ทุกตัว · PluginConfig
   ├─ errors.ts                    typed error ของชั้น service
   ├─ secrets.ts                   resolve key · seal/open · preview
   ├─ scrub.ts                     ตัวกรอง key ที่ชื่อเข้าข่ายก่อนถึง logger
   ├─ channels.ts                  channel service + withSecrets() opt-in
   ├─ audit.ts                     append-only writer
   ├─ rate-limit.ts                token bucket ต่อ channel
   ├─ images.ts                    normalize/compose ตอน save ไม่ใช่ตอน publish
   ├─ payload.ts                   RichMenuRow → RichMenuPayload
   ├─ compensation.ts              capture ก่อนแตะ · restore สิ่งที่ capture ไว้
   ├─ publish.ts                   publish service
   ├─ menu-ops.ts                  set-default · clear-default · swap-alias · reconcile
   ├─ lock.ts                      conditional UPDATE ด้วย knex binding ล้วน
   └─ scheduler.ts                 tick()

packages/strapi-v4/                strapi-plugin-line-rich-menu-v4
├─ strapi-server.js                shim ที่ root — require('./dist/server/index.js')
├─ strapi-admin.js                 shim ที่ root — require('./dist/admin/index.js')
├─ package.json  tsconfig.json  tsup.config.ts  vitest.config.ts
├─ src/server/
│  ├─ index.ts                     register · bootstrap · config · contentTypes · controllers · routes · services
│  ├─ strapi.ts                    type ขั้นต่ำของ global strapi ที่ใช้จริง (ไม่ import @strapi/strapi)
│  ├─ config.ts                    default + validator ของ plugin config
│  ├─ content-types/               line-channel · rich-menu · rich-menu-schedule · rich-menu-audit
│  ├─ repo.ts                      createEntityServiceRepo — number → string ที่ขอบ
│  ├─ container.ts                 getServices(strapi) ประกอบชั้น service ของ core
│  ├─ validation.ts                zod ของทุก route
│  ├─ controllers/                 channels · menus · schedules
│  ├─ routes/admin.ts              type: 'admin' + admin::hasPermissions ทุกเส้น
│  ├─ permissions.ts               read · create-update · publish · settings
│  └─ bootstrap.ts                 ลงทะเบียน permission + cron
├─ src/admin/
│  ├─ index.tsx                    register(app) · registerTrads
│  ├─ port.tsx                     DS v1 → UIPort
│  └─ App.tsx                      router v5 · สามหน้าจอจาก @fosivo/line-rich-menu-ui
└─ tests/

examples/v4-app/                   Strapi 4.25.11 จริง · sqlite · yalc link · acceptance gate
```

**เหตุผลของการแบ่ง:** `server/` แต่ละไฟล์รับ dependency เข้าทางพารามิเตอร์ทั้งหมด (`create*(deps)`) จึงเทสต์ได้ด้วย object ธรรมดาโดยไม่ต้อง mock module · `strapi.ts` ประกาศ type ของ `strapi` เองแทนการ import `@strapi/strapi` เพราะ type ของ v4 กว้างและกำลังจะหายไป การประกาศเองทำให้ไฟล์เดียวกันคอมไพล์ผ่านตอนย้ายไป v5 · `validation.ts` รวม zod ทุกเส้นไว้ที่เดียวเพื่อให้ตรวจได้ด้วยตาว่าไม่มี route ไหนหลุด

---

## Task 1: Scaffold `core/src/server/` + ยามที่พิสูจน์ว่า `/browser` ไปไม่ถึง

**Files:**
- Create: `packages/core/src/server/index.ts`, `packages/core/src/server/types.ts`, `packages/core/src/server/errors.ts`
- Modify: `packages/core/src/index.ts` (เพิ่มบรรทัดเดียว), `.github/workflows/ci.yml` (เพิ่มขั้น grep)
- Test: `packages/core/tests/server/import-guard.test.ts`

**Interfaces:**
- Consumes: `Bounds`, `Action`, `RichMenuSize`, `RichMenuSizeName` จาก `../types.js` · `CoreError` จาก `../errors.js`
- Produces:
  - `interface ListParams { filters?: Record<string, string | number | boolean | null>; sort?: string; limit?: number; start?: number; populate?: readonly string[] }`
  - `interface Repo<T> { findMany(params?: ListParams): Promise<T[]>; findOne(id: string): Promise<T | null>; create(data: Partial<T>): Promise<T>; update(id: string, data: Partial<T>): Promise<T>; delete(id: string): Promise<void> }`
  - `type MenuStatus = 'draft' | 'publishing' | 'published' | 'failed'`
  - `type ScheduleOp = 'set-default' | 'clear-default' | 'swap-alias'`
  - `type ScheduleState = 'pending' | 'running' | 'done' | 'failed'`
  - `type AuditAction = 'publish' | 'set-default' | 'clear-default' | 'swap-alias' | 'delete' | 'channel-update'`
  - `interface ChannelRow`, `interface ChannelRecord`, `interface ChannelWithSecrets`
  - `interface RichMenuRow`, `interface AreaRecord`, `interface ScheduleRow`, `interface AuditRow`
  - `interface PluginConfig`
  - `class ServerError extends CoreError` และลูกอีกห้าตัว
  - `const SERVER_MODULE_MARKER = 'line-rich-menu/server'`

ยามเดิม (`tests/browser.test.ts`) เป็น **denylist ของชื่อ symbol** — คอมเมนต์ในไฟล์นั้นยอมรับเองว่ามันจับโมดูลผูก Node ตัวใหม่ที่ยังไม่มีชื่อในลิสต์ไม่ได้ ตอนนี้ที่ `core` กำลังจะโตขึ้นทั้งชั้น server ยามแบบนั้นไม่พอ ยามใหม่ **เดินกราฟ import จริงจาก `src/browser.ts`** แล้วยืนยันว่าไม่มีไฟล์ไหนที่เดินไปถึงอยู่ใต้ `src/server/` — ซึ่งจับได้ทั้งไฟล์ที่ยังไม่มีชื่อและ import ทางอ้อมผ่านสามทอด

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/server/import-guard.test.ts`
```ts
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url))

/**
 * `[^'"]*?` เป็น lazy โดยตั้งใจ เพื่อให้ข้ามบรรทัดได้ — import ที่แตกหลายบรรทัด
 * (`import {\n  A, B,\n} from './x.js'`) มีอยู่จริงในโค้ดเบสนี้ ถ้าใช้ `[^'"\n]*`
 * บรรทัด `} from './x.js'` จะไม่ถูกจับเลย และยามจะเขียวทั้งที่ตาบอด
 */
const SPECIFIER = /(?:^|\n)[ \t]*(?:import|export)\b[^'"]*?['"]([^'"]+)['"]/g

function specifiersOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(SPECIFIER)].map((m) => m[1]!).filter((s) => s.length > 0)
}

/** เดินตาม import ที่เป็น relative และลงท้าย .js เท่านั้น — เป็น convention ที่ทั้งแพ็กเกจนี้ใช้ */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    for (const spec of specifiersOf(file)) {
      if (!spec.startsWith('.') || !spec.endsWith('.js')) continue
      queue.push(resolve(dirname(file), spec.replace(/\.js$/, '.ts')))
    }
  }
  return [...seen]
}

function bareSpecifiersOf(file: string): string[] {
  return specifiersOf(file).filter((s) => !s.startsWith('.'))
}

const underServer = (file: string) =>
  relative(srcRoot, file).split(sep)[0] === 'server'

describe('กราฟ import ของ subpath "./browser"', () => {
  it('เดินได้จริง ไม่ใช่ regex ที่จับอะไรไม่ได้เลย', () => {
    const reached = reachableFrom(resolve(srcRoot, 'browser.ts'))
    expect(reached.length).toBeGreaterThan(4)
    expect(reached.some((f) => f.endsWith(`${sep}templates.ts`))).toBe(true)
  })

  it('ไปไม่ถึงไฟล์ใดใต้ src/server/ เลย', () => {
    const reached = reachableFrom(resolve(srcRoot, 'browser.ts'))
    expect(reached.filter(underServer).map((f) => relative(srcRoot, f))).toEqual([])
  })

  it('ไม่มีไฟล์ที่เดินไปถึงตัวไหน import sharp หรือ node: builtin', () => {
    const offenders = reachableFrom(resolve(srcRoot, 'browser.ts'))
      .flatMap((file) => bareSpecifiersOf(file).map((spec) => ({ file: relative(srcRoot, file), spec })))
      .filter(({ spec }) => spec === 'sharp' || spec.startsWith('node:'))
    expect(offenders).toEqual([])
  })
})

describe('กราฟ import ของ entry "."', () => {
  it('เดินไปถึง src/server/index.ts ได้ — ชั้น service ต้องอยู่บน entry ฝั่ง Node', () => {
    const reached = reachableFrom(resolve(srcRoot, 'index.ts'))
    expect(reached.map((f) => relative(srcRoot, f))).toContain(`server${sep}index.ts`)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/import-guard.test.ts
```

คาดว่าล้ม 1 เคส: `เดินไปถึง src/server/index.ts ได้` — array ที่ได้ไม่มี `server/index.ts` เพราะทั้งโฟลเดอร์ยังไม่มี อีกสามเคสเขียวอยู่แล้ว (ยังไม่มี `server/` ให้รั่ว) ซึ่งถูกต้อง — เคสพวกนั้นคือยามที่ต้องเขียวตลอดไป ไม่ใช่ยามที่ต้องแดงก่อน

- [ ] **Step 3: เขียน `server/types.ts`**

`packages/core/src/server/types.ts`
```ts
import type { Action, Bounds, RichMenuSize, RichMenuSizeName } from '../types.js'

/**
 * seam ของสเปก §6.2 — ชั้น service มองเห็น `id: string` เสมอ
 * v5 คืน `documentId` เป็น string อยู่แล้ว ส่วน v4 คืน `id` เป็น number แล้วแปลงที่ขอบ (Task 15)
 */
export interface ListParams {
  filters?: Record<string, string | number | boolean | null>
  sort?: string
  limit?: number
  start?: number
  populate?: readonly string[]
}

export interface Repo<T> {
  findMany(params?: ListParams): Promise<T[]>
  findOne(id: string): Promise<T | null>
  create(data: Partial<T>): Promise<T>
  update(id: string, data: Partial<T>): Promise<T>
  delete(id: string): Promise<void>
}

export type MenuStatus = 'draft' | 'publishing' | 'published' | 'failed'
export type ScheduleOp = 'set-default' | 'clear-default' | 'swap-alias'
export type ScheduleState = 'pending' | 'running' | 'done' | 'failed'
export type AuditAction =
  | 'publish' | 'set-default' | 'clear-default' | 'swap-alias' | 'delete' | 'channel-update'
export type AuditResult = 'success' | 'failure'

/** แถวดิบจาก DB — ฟิลด์ลับยังเป็น envelope `v1.<iv>.<tag>.<ct>` ที่ยังไม่ได้ถอด */
export interface ChannelRow {
  id: string
  name: string
  channelId: string
  channelAccessToken: string
  channelSecret: string | null
  /**
   * สี่ตัวท้ายของ access token เก็บเป็น plaintext แยกไว้ตั้งแต่ตอนเขียน
   * เพื่อให้เส้นทาง list/get **ไม่ต้องถอดรหัสอะไรเลย** ก็แสดง `••••••••abcd` ได้
   * ป้องกันแบบชั้นเดียวคือ "อย่าลืม redact" ส่วนแบบนี้คือ "ไม่มีอะไรให้ leak ตั้งแต่ต้น"
   */
  accessTokenLast4: string
  isDefault: boolean
}

/** สิ่งที่ออกจาก service ได้ — ไม่มีฟิลด์ลับ ไม่ว่าจะเป็น plaintext หรือ ciphertext */
export interface ChannelRecord {
  id: string
  name: string
  channelId: string
  /** `••••••••abcd` — สี่ตัวท้ายของ access token เท่านั้น (สเปก §11.2) */
  accessTokenPreview: string
  isDefault: boolean
}

export interface ChannelWithSecrets extends ChannelRecord {
  channelAccessToken: string
  channelSecret: string | null
}

export interface AreaRecord {
  bounds: Bounds
  action: Action
}

export interface RichMenuRow {
  id: string
  name: string
  channelId: string
  size: RichMenuSizeName
  chatBarText: string
  chatBarMode: 'default' | 'custom'
  selected: boolean
  templateKey: string | null
  areas: AreaRecord[]
  /** file id ของรูปที่ผู้ใช้อัปมาดิบ ๆ ผ่าน POST /upload */
  imageFileId: number | null
  areaImages: { index: number; fileId: number }[]
  /**
   * ผลของ normalize ที่ทำไว้ตอน save (design notes ข้อ 3) — publish อ่านตัวนี้อย่างเดียว
   * ไม่เคยเรียก sharp เอง `normalizedSize` คือขั้นบันไดที่รูป *ลงจริง* ไม่ใช่ที่ฟอร์มเชื่อว่าจะลง
   */
  normalizedFileId: number | null
  normalizedMime: 'image/jpeg' | 'image/png' | null
  normalizedSize: RichMenuSize | null
  aliasId: string | null
  status: MenuStatus
  lineRichMenuId: string | null
  publishedAt: string | null
  lastError: string | null
  /** Strapi เขียนให้เอง — `RichMenuSummary` ใน packages/ui/src/api.ts ต้องการฟิลด์นี้ */
  updatedAt: string
}

export interface ScheduleRow {
  id: string
  richMenuId: string
  runAt: string
  op: ScheduleOp
  state: ScheduleState
  lockedBy: string | null
  lockedAt: string | null
  lastError: string | null
}

export interface AuditRow {
  id: string
  actorId: string | null
  action: AuditAction
  richMenuId: string | null
  channelId: string
  before: unknown
  after: unknown
  result: AuditResult
  errorCode: string | null
}

/** สเปก §7.2 — ค่าที่มาจาก config/plugins.js ของผู้ใช้ หลังผ่าน validator แล้ว */
export interface PluginConfig {
  encryptionKey: string | null
  scheduler: { enabled: boolean; cron: string; lockTtlMs: number }
  lineApiBaseUrl: string
  lineApiDataBaseUrl: string
  mockMode: boolean
  publishRateLimit: { capacity: number; refillPerMinute: number }
}
```

- [ ] **Step 4: เขียน `server/errors.ts`**

`packages/core/src/server/errors.ts`
```ts
import { CoreError } from '../errors.js'

/**
 * error ของชั้น service แยกไฟล์จาก `../errors.js` เพราะไฟล์นั้นถูก re-export ผ่าน
 * subpath `./browser` — อะไรที่มีแต่ฝั่งเซิร์ฟเวอร์ใช้ ไม่ควรไปนั่งอยู่ในบันเดิลของ admin
 * (คลาสเปล่า ๆ ไม่หนัก แต่บรรทัดฐาน "browser ไม่รู้จัก server" มีค่ามากกว่าไบต์ที่ประหยัดได้)
 *
 * ทุกตัวมี `code` ตามสเปก §11.7 — UI แปล code เป็นข้อความ ไม่เคยเห็น message ดิบ
 */
export class PublishRateLimitedError extends CoreError {
  readonly code = 'publish_rate_limited'
  constructor(readonly retryAfterMs: number) {
    super(`publish rate limit hit, retry in ${retryAfterMs}ms`)
  }
}

/** เมนูยังไม่มีรูปที่ normalize ผ่านเกณฑ์ — publish ไปก็โดน LINE ปฏิเสธ */
export class MenuNotReadyError extends CoreError {
  readonly code = 'menu_not_ready'
  constructor(readonly reason: 'no_image' | 'no_areas' | 'no_channel' | 'not_published') {
    super(`menu is not ready to publish: ${reason}`)
  }
}

/** สเปก §9 — action ชี้ไป alias ของเมนูที่ยังไม่เคย publish */
export class AliasNotPublishedError extends CoreError {
  readonly code = 'alias_not_published'
  constructor(readonly aliasId: string) {
    super(`alias "${aliasId}" is not published yet`)
  }
}

export class ChannelNotFoundError extends CoreError {
  readonly code = 'channel_not_found'
}

export class MenuNotFoundError extends CoreError {
  readonly code = 'menu_not_found'
}

/** ไม่มี encryptionKey และไม่มี APP_KEYS[0] ให้ derive — ปฏิเสธตั้งแต่ตอน bootstrap */
export class EncryptionKeyMissingError extends CoreError {
  readonly code = 'encryption_key_missing'
}
```

- [ ] **Step 5: เขียน `server/index.ts` แล้วต่อเข้า entry "."**

`packages/core/src/server/index.ts`
```ts
/**
 * ชั้น service ที่ใช้ร่วมกันระหว่าง adapter ของ Strapi 4 กับ 5
 *
 * ไม่มีบรรทัดไหนในโฟลเดอร์นี้ import `@strapi/*` — ทุกอย่างที่ต้องพึ่ง Strapi เข้ามาทาง
 * interface (`Repo<T>`, `ImageStore`, `KnexLike`) ที่ adapter เป็นคน implement
 * ดู design notes ข้อ 1 สำหรับเหตุผลที่ไม่ทำซ้ำในแต่ละ adapter
 */
export const SERVER_MODULE_MARKER = 'line-rich-menu/server'

export * from './types.js'
export * from './errors.js'
```

`packages/core/src/index.ts` — เพิ่มบรรทัดสุดท้าย
```ts
export * from './server/index.js'
```

- [ ] **Step 6: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server/import-guard.test.ts packages/core/tests/browser.test.ts
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

ทั้งสองไฟล์ต้องเขียว — `browser.test.ts` เดิมยังต้องผ่านโดยไม่แก้อะไร

- [ ] **Step 7: เพิ่มยามชั้นที่สองใน CI**

`.github/workflows/ci.yml` — ใน job `quality` ต่อจากขั้น "ตรวจว่า dist/browser.{js,cjs} ไม่มี sharp หลุดเข้ามา" ให้เพิ่ม
```yaml
      - name: ตรวจว่า dist/browser.{js,cjs} ไม่มีชั้น server หลุดเข้ามา
        # เทสต์ import-guard ตรวจที่ต้นทาง (src) ขั้นนี้ตรวจที่ dist ซึ่งเป็นสิ่งที่ผู้บริโภคได้จริง
        # SERVER_MODULE_MARKER เป็นค่าคงที่ที่มีอยู่ที่เดียวในโค้ดเบส การเจอมันใน browser bundle
        # แปลว่า tree-shaking ไม่ได้ตัด server/ ออก ไม่ว่าจะเข้ามาทางไหน
        run: |
          if grep -n "line-rich-menu/server" \
            packages/core/dist/browser.js packages/core/dist/browser.cjs; then
            echo "::error::ชั้น server หลุดเข้า packages/core/dist/browser.{js,cjs} — subpath \"./browser\" ต้องไม่มีโค้ดฝั่งเซิร์ฟเวอร์"
            exit 1
          fi
```

ยืนยันด้วยมือครั้งเดียว:
```bash
pnpm --filter @fosivo/line-rich-menu-core build
grep -c "line-rich-menu/server" packages/core/dist/browser.js || echo "ไม่พบ — ถูกต้อง"
grep -c "line-rich-menu/server" packages/core/dist/index.js
```
บรรทัดแรกต้องไม่พบ บรรทัดที่สองต้องพบอย่างน้อย 1

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/server packages/core/src/index.ts \
        packages/core/tests/server/import-guard.test.ts .github/workflows/ci.yml
git commit -m "feat(core): add the shared server layer seam with an import-graph guard"
```

---

## Task 2: `server/secrets.ts` — key จาก config หรือ `APP_KEYS[0]` และ preview ที่ไม่ต้องถอดรหัส

**Files:**
- Create: `packages/core/src/server/secrets.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่ม `export * from './secrets.js'`)
- Test: `packages/core/tests/server/secrets.test.ts`

**Interfaces:**
- Consumes: `deriveKey`, `encryptSecret`, `decryptSecret`, `redactSecret` จาก `../crypto.js` (Plan 01) · `CryptoEnvelopeError` จาก `../errors.js` · `EncryptionKeyMissingError` จาก `./errors.js` (Task 1) · `ChannelRow`, `ChannelRecord`, `ChannelWithSecrets` จาก `./types.js` (Task 1)
- Produces:
  - `interface EncryptionKeySource { encryptionKey?: string | null; appKeys?: readonly string[] | null }`
  - `function resolveEncryptionKey(source: EncryptionKeySource): Buffer`
  - `interface ChannelSecretsInput { channelAccessToken: string; channelSecret?: string | null }`
  - `interface SealedChannelSecrets { channelAccessToken: string; channelSecret: string | null; accessTokenLast4: string }`
  - `function sealChannelSecrets(input: ChannelSecretsInput, key: Buffer): SealedChannelSecrets`
  - `function openChannelSecrets(row: ChannelRow, key: Buffer): ChannelWithSecrets`
  - `function toChannelRecord(row: ChannelRow): ChannelRecord`
  - `function lastFourOf(plaintext: string): string`
  - `function previewOf(last4: string): string`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/server/secrets.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { CryptoEnvelopeError } from '../../src/errors.js'
import { deriveKey, redactSecret } from '../../src/crypto.js'
import { EncryptionKeyMissingError } from '../../src/server/errors.js'
import {
  lastFourOf, openChannelSecrets, previewOf, resolveEncryptionKey,
  sealChannelSecrets, toChannelRecord,
} from '../../src/server/secrets.js'
import type { ChannelRow } from '../../src/server/types.js'

const TOKEN = 'aBcDeFgH1234567890+/channel-access-token-XYZ9'
const SECRET = '0123456789abcdef0123456789abcdef'

function rowFrom(key: Buffer, overrides: Partial<ChannelRow> = {}): ChannelRow {
  const sealed = sealChannelSecrets({ channelAccessToken: TOKEN, channelSecret: SECRET }, key)
  return {
    id: '1', name: 'ร้านทดสอบ', channelId: '1650000000', isDefault: true,
    ...sealed, ...overrides,
  }
}

/** ค้นทุกซอกของ object ว่ามีสตริงต้องห้ามโผล่ไหม — สเปก §13.2 ข้อ 2 */
function deepContains(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle)
  if (Array.isArray(value)) return value.some((v) => deepContains(v, needle))
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((v) => deepContains(v, needle))
  }
  return false
}

describe('resolveEncryptionKey', () => {
  it('ใช้ config.encryptionKey เมื่อมี', () => {
    expect(resolveEncryptionKey({ encryptionKey: 'from-config', appKeys: ['from-app-keys'] }))
      .toEqual(deriveKey('from-config'))
  })

  it('derive จาก APP_KEYS[0] เมื่อไม่ได้ตั้ง encryptionKey', () => {
    expect(resolveEncryptionKey({ encryptionKey: null, appKeys: ['from-app-keys', 'second'] }))
      .toEqual(deriveKey('from-app-keys'))
  })

  it('ถือว่าค่าว่างหรือช่องว่างล้วนคือไม่ได้ตั้ง', () => {
    expect(resolveEncryptionKey({ encryptionKey: '   ', appKeys: ['from-app-keys'] }))
      .toEqual(deriveKey('from-app-keys'))
  })

  it('โยน EncryptionKeyMissingError เมื่อไม่มีทั้งสองทาง', () => {
    expect(() => resolveEncryptionKey({})).toThrow(EncryptionKeyMissingError)
    expect(() => resolveEncryptionKey({ encryptionKey: '', appKeys: [] })).toThrow(EncryptionKeyMissingError)
    expect(() => resolveEncryptionKey({ appKeys: ['  '] })).toThrow(EncryptionKeyMissingError)
  })
})

describe('seal / open', () => {
  const key = deriveKey('unit-test-key')

  it('round trip ได้ค่าเดิมทั้งสองฟิลด์', () => {
    const opened = openChannelSecrets(rowFrom(key), key)
    expect(opened.channelAccessToken).toBe(TOKEN)
    expect(opened.channelSecret).toBe(SECRET)
  })

  it('IV ไม่ซ้ำข้าม record — ปิดผนึกข้อความเดียวกันสองครั้งได้ envelope คนละอัน', () => {
    const a = sealChannelSecrets({ channelAccessToken: TOKEN }, key)
    const b = sealChannelSecrets({ channelAccessToken: TOKEN }, key)
    expect(a.channelAccessToken).not.toBe(b.channelAccessToken)
    expect(openChannelSecrets(rowFrom(key, a), key).channelAccessToken)
      .toBe(openChannelSecrets(rowFrom(key, b), key).channelAccessToken)
  })

  it('แก้ ciphertext ไป 1 ไบต์แล้วถอดไม่ผ่าน — auth tag ทำงาน', () => {
    const row = rowFrom(key)
    const parts = row.channelAccessToken.split('.')
    const flipped = parts[3]!.startsWith('A') ? `B${parts[3]!.slice(1)}` : `A${parts[3]!.slice(1)}`
    const tampered: ChannelRow = { ...row, channelAccessToken: [parts[0], parts[1], parts[2], flipped].join('.') }
    expect(() => openChannelSecrets(tampered, key)).toThrow(CryptoEnvelopeError)
  })

  it('channelSecret ที่ไม่ได้กรอกยังเป็น null ทั้งขาไปและขากลับ', () => {
    const sealed = sealChannelSecrets({ channelAccessToken: TOKEN, channelSecret: '  ' }, key)
    expect(sealed.channelSecret).toBeNull()
    expect(openChannelSecrets(rowFrom(key, sealed), key).channelSecret).toBeNull()
  })
})

describe('preview', () => {
  const key = deriveKey('unit-test-key')

  it('toChannelRecord ไม่มี plaintext และไม่มี ciphertext ติดมาเลย', () => {
    const row = rowFrom(key)
    const record = toChannelRecord(row)
    expect(deepContains(record, TOKEN)).toBe(false)
    expect(deepContains(record, SECRET)).toBe(false)
    expect(deepContains(record, row.channelAccessToken)).toBe(false)
    expect(record.accessTokenPreview).toBe('••••••••XYZ9')
  })

  it('รูปแบบตรงกับ redactSecret ของ core เป๊ะ รวมเคสสั้นและเคสยาว 4 ตัวพอดี', () => {
    for (const value of [TOKEN, 'abcd', 'abc', '', 'abcde']) {
      expect(previewOf(lastFourOf(value))).toBe(redactSecret(value))
    }
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/secrets.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/secrets.js"` — ไฟล์ยังไม่มี

- [ ] **Step 3: เขียน `server/secrets.ts`**

`packages/core/src/server/secrets.ts`
```ts
import { decryptSecret, deriveKey, encryptSecret } from '../crypto.js'
import { EncryptionKeyMissingError } from './errors.js'
import type { ChannelRecord, ChannelRow, ChannelWithSecrets } from './types.js'

export interface EncryptionKeySource {
  encryptionKey?: string | null
  appKeys?: readonly string[] | null
}

/**
 * สเปก §11.2 — key มาจาก config `encryptionKey` ถ้าไม่ตั้งจะ derive จาก `APP_KEYS[0]`
 *
 * ทั้งสองทางเดินผ่าน `deriveKey` (HKDF-SHA256 info คงที่) เหมือนกัน ไม่ใช่แค่ทางหลัง —
 * ทำให้ `encryptionKey` เป็นสตริงยาวเท่าไหร่ก็ได้โดยไม่ต้องบังคับให้ผู้ใช้หา 32 ไบต์มาเอง
 * และทำให้มีทางเดียวที่ key ถูกสร้าง ไม่ต้องเดาว่า envelope ตัวนี้มาจาก path ไหน
 *
 * โยนทิ้งเมื่อไม่มีทั้งสองทาง แทนที่จะ derive จากค่าว่าง — key ที่คาดเดาได้แปลว่า
 * ใครที่อ่าน DB ได้ก็ถอด token ได้ ซึ่งเท่ากับไม่ได้เข้ารหัสเลย
 */
export function resolveEncryptionKey(source: EncryptionKeySource): Buffer {
  const explicit = source.encryptionKey?.trim()
  if (explicit !== undefined && explicit.length > 0) return deriveKey(explicit)

  const fromAppKeys = source.appKeys?.[0]?.trim()
  if (fromAppKeys !== undefined && fromAppKeys.length > 0) return deriveKey(fromAppKeys)

  throw new EncryptionKeyMissingError(
    'set config.encryptionKey or APP_KEYS[0] before storing LINE credentials',
  )
}

export interface ChannelSecretsInput {
  channelAccessToken: string
  channelSecret?: string | null
}

export interface SealedChannelSecrets {
  channelAccessToken: string
  channelSecret: string | null
  accessTokenLast4: string
}

/**
 * `> 4` ไม่ใช่ `>= 4` โดยตั้งใจ — ต้องตรงกับเงื่อนไขใน `redactSecret` ของ core
 * ไม่งั้น token ยาว 4 ตัวพอดีจะถูกแสดงทั้งตัว ซึ่งกรณีนั้นคือ "สั้นเกินกว่าจะปิดอะไรได้"
 */
export function lastFourOf(plaintext: string): string {
  return plaintext.length > 4 ? plaintext.slice(-4) : ''
}

export function previewOf(last4: string): string {
  return last4.length === 4 ? `••••••••${last4}` : '••••••••'
}

export function sealChannelSecrets(input: ChannelSecretsInput, key: Buffer): SealedChannelSecrets {
  const secret = input.channelSecret?.trim()
  return {
    channelAccessToken: encryptSecret(input.channelAccessToken, key),
    channelSecret: secret !== undefined && secret.length > 0 ? encryptSecret(secret, key) : null,
    accessTokenLast4: lastFourOf(input.channelAccessToken),
  }
}

/**
 * เส้นทางนี้ **ไม่ถอดรหัสอะไรเลย** — preview มาจากคอลัมน์ `accessTokenLast4` ที่เขียนไว้ตอน seal
 * เหตุผล: การกันข้อมูลรั่วแบบ "ถอดมาแล้วอย่าลืม redact" พังทันทีที่มีใครลืม
 * ส่วนแบบนี้พังไม่ได้เพราะ plaintext ไม่เคยถูกสร้างขึ้นบนเส้นทาง list/get ตั้งแต่ต้น
 */
export function toChannelRecord(row: ChannelRow): ChannelRecord {
  return {
    id: row.id,
    name: row.name,
    channelId: row.channelId,
    accessTokenPreview: previewOf(row.accessTokenLast4),
    isDefault: row.isDefault,
  }
}

export function openChannelSecrets(row: ChannelRow, key: Buffer): ChannelWithSecrets {
  return {
    ...toChannelRecord(row),
    channelAccessToken: decryptSecret(row.channelAccessToken, key),
    channelSecret: row.channelSecret === null ? null : decryptSecret(row.channelSecret, key),
  }
}
```

`packages/core/src/server/index.ts` — เพิ่มต่อท้าย
```ts
export * from './secrets.js'
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server/secrets.test.ts
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server packages/core/tests/server/secrets.test.ts
git commit -m "feat(core): seal channel credentials and preview them without decrypting"
```

---

## Task 3: `server/scrub.ts` — ตัวกรองก่อนถึง logger และก่อนลง audit

**Files:**
- Create: `packages/core/src/server/scrub.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่ม `export * from './scrub.js'`)
- Test: `packages/core/tests/server/scrub.test.ts`

**Interfaces:**
- Consumes: ไม่มี — ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ล้วน
- Produces:
  - `const REDACTED = '[redacted]'`
  - `function scrub(value: unknown): unknown`
  - `interface LoggerLike { debug(...args: unknown[]): void; info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }`
  - `function createScrubbedLogger(base: LoggerLike): LoggerLike`

สเปก §11.2 ต้องการ scrubber ที่ logger ทุกระดับ และ §11.5 ต้องการ `before`/`after` ของ audit ที่ **redact แล้ว** ทั้งสองข้อคือฟังก์ชันเดียวกัน จึงเขียนครั้งเดียวแล้ว Task 5 เอาไปใช้ต่อ

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/server/scrub.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { REDACTED, createScrubbedLogger, scrub } from '../../src/server/scrub.js'

const TOKEN = 'aBcDeFgH1234567890-channel-access-token'

describe('scrub', () => {
  it('แทนค่าใต้คีย์ที่ชื่อเข้าข่าย ไม่ว่าตัวพิมพ์ใหญ่เล็กหรือลึกแค่ไหน', () => {
    const input = {
      name: 'ร้านทดสอบ',
      channelAccessToken: TOKEN,
      nested: { CHANNEL_SECRET: 's3cr3t', headers: { Authorization: `Bearer ${TOKEN}` } },
      list: [{ token: TOKEN }, { safe: 'ok' }],
    }
    expect(scrub(input)).toEqual({
      name: 'ร้านทดสอบ',
      channelAccessToken: REDACTED,
      nested: { CHANNEL_SECRET: REDACTED, headers: { Authorization: REDACTED } },
      list: [{ token: REDACTED }, { safe: 'ok' }],
    })
  })

  it('ไม่แตะค่าที่ไม่เข้าข่าย รวมตัวเลข boolean และ null', () => {
    expect(scrub({ id: 7, isDefault: true, lastError: null, size: 'large' }))
      .toEqual({ id: 7, isDefault: true, lastError: null, size: 'large' })
  })

  it('ตัด Bearer ที่ฝังอยู่ในสตริงออก แม้คีย์จะไม่เข้าข่าย', () => {
    expect(scrub({ message: `request failed: Bearer ${TOKEN} rejected` }))
      .toEqual({ message: `request failed: Bearer ${REDACTED} rejected` })
    expect(scrub(`Bearer ${TOKEN}`)).toBe(`Bearer ${REDACTED}`)
  })

  it('ไม่วนไม่รู้จบเมื่อเจอ object ที่อ้างถึงตัวเอง', () => {
    const cyclic: Record<string, unknown> = { name: 'a' }
    cyclic['self'] = cyclic
    expect(scrub(cyclic)).toEqual({ name: 'a', self: '[circular]' })
  })

  it('ตัดที่ความลึก 8 แทนที่จะไล่ลงไปไม่จบ', () => {
    let deep: Record<string, unknown> = { bottom: 'reached' }
    for (let i = 0; i < 12; i++) deep = { down: deep }
    expect(JSON.stringify(scrub(deep))).toContain(REDACTED)
    expect(JSON.stringify(scrub(deep))).not.toContain('reached')
  })

  it('แปลง Error เป็น object ที่มี name message code — ไม่ใช่ {} ว่างเปล่า', () => {
    class Typed extends Error { readonly code = 'line_auth_failed' }
    expect(scrub(new Typed('LINE rejected credential')))
      .toEqual({ name: 'Typed', message: 'LINE rejected credential', code: 'line_auth_failed' })
  })
})

describe('createScrubbedLogger', () => {
  it('กรองทุกระดับ ไม่ใช่แค่ error', () => {
    const base = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const logger = createScrubbedLogger(base)

    logger.debug('publishing', { channelAccessToken: TOKEN })
    logger.info('publishing', { channelAccessToken: TOKEN })
    logger.warn('publishing', { channelAccessToken: TOKEN })
    logger.error('publishing', { channelAccessToken: TOKEN })

    const everything = JSON.stringify([
      base.debug.mock.calls, base.info.mock.calls, base.warn.mock.calls, base.error.mock.calls,
    ])
    expect(everything).not.toContain(TOKEN)
    expect(base.error).toHaveBeenCalledWith('publishing', { channelAccessToken: REDACTED })
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/scrub.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/scrub.js"`

- [ ] **Step 3: เขียน `server/scrub.ts`**

`packages/core/src/server/scrub.ts`
```ts
export const REDACTED = '[redacted]'

/**
 * คีย์ที่ค่าใต้มันถือว่าเป็นความลับเสมอ (สเปก §11.2)
 * `credential` กับ `password` ไม่ได้อยู่ในรายการของสเปกแต่ใส่ไว้ด้วย เพราะราคาของ false positive
 * คือ log อ่านยากขึ้นหนึ่งบรรทัด ส่วนราคาของ false negative คือ token หลุดเข้า log aggregator
 */
const SENSITIVE_KEY = /(token|secret|authorization|password|credential)/i

/**
 * ตัดแม้แต่ตอนที่คีย์ไม่ได้บอกอะไร — ข้อความ error จาก HTTP client ชั้นล่างมักพก header
 * ที่ส่งไปกลับมาด้วยทั้งก้อน ซึ่งเป็นเคสที่ทำให้ token หลุดจริงมาแล้วในโปรเจกต์อื่น
 */
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi

/** ลึกเกินนี้แปลว่าเป็นโครงสร้างที่ไม่ได้ตั้งใจ log อยู่แล้ว ตัดทิ้งดีกว่าไล่ต่อ */
const MAX_DEPTH = 8

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return value.replace(BEARER, `Bearer ${REDACTED}`)
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return REDACTED
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1, seen))

  // Object.entries ของ Error คืน [] เพราะ name/message/stack เป็น non-enumerable —
  // ถ้าไม่ดักไว้ error ทุกตัวจะกลายเป็น {} ใน log ซึ่งแย่กว่าไม่ log เลย
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code
    return {
      name: value.name,
      message: walk(value.message, depth + 1, seen),
      ...(typeof code === 'string' ? { code } : {}),
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : walk(item, depth + 1, seen),
    ]),
  )
}

export function scrub(value: unknown): unknown {
  return walk(value, 0, new WeakSet())
}

export interface LoggerLike {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/**
 * ห่อ logger ของ Strapi ทั้งสี่ระดับ ไม่ใช่แค่ `error` — สเปก §11.2 เขียนว่า "ทุก log level"
 * เพราะ `debug` คือระดับที่คนเผลอ dump ทั้ง request object ลงไปมากที่สุด
 */
export function createScrubbedLogger(base: LoggerLike): LoggerLike {
  const wrap = (level: keyof LoggerLike) =>
    (...args: unknown[]) => { base[level](...args.map((arg) => scrub(arg))) }
  return { debug: wrap('debug'), info: wrap('info'), warn: wrap('warn'), error: wrap('error') }
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server/scrub.test.ts
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server packages/core/tests/server/scrub.test.ts
git commit -m "feat(core): scrub credentials from every log level and audit payload"
```

---

## Task 4: `server/channels.ts` — repository ที่ตัดความลับออกโดยปริยาย และ `withSecrets()` ที่ต้องจงใจเรียก

**Files:**
- Create: `packages/core/src/server/channels.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่ม `export * from './channels.js'`)
- Test: `packages/core/tests/server/channels.test.ts`

**Interfaces:**
- Consumes: `Repo`, `ChannelRow`, `ChannelRecord`, `ChannelWithSecrets` จาก `./types.js` (Task 1) · `ChannelNotFoundError` จาก `./errors.js` (Task 1) · `sealChannelSecrets`, `openChannelSecrets`, `toChannelRecord` จาก `./secrets.js` (Task 2) · `ValidationError` จาก `../errors.js`
- Produces:
  - `interface ChannelInput { name: string; channelId: string; channelAccessToken: string; channelSecret?: string | null; isDefault?: boolean }`
  - `interface SecretChannelReader { findOne(id: string): Promise<ChannelWithSecrets>; findDefault(): Promise<ChannelWithSecrets> }`
  - `interface ChannelService { list(): Promise<ChannelRecord[]>; findOne(id: string): Promise<ChannelRecord>; create(input: ChannelInput): Promise<ChannelRecord>; update(id: string, input: Partial<ChannelInput>): Promise<ChannelRecord>; withSecrets(): SecretChannelReader }`
  - `function createChannelService(deps: { repo: Repo<ChannelRow>; key: Buffer }): ChannelService`

สเปก §11.2 บอกว่า "repository layer ตัดฟิลด์ลับออกโดยปริยาย ต้องเรียก `withSecrets()` อย่างจงใจถึงจะได้มา" — สิ่งที่ทำให้มันเป็นจริงไม่ใช่วินัย แต่คือ **type**: `list()` และ `findOne()` คืน `ChannelRecord` ซึ่งไม่มีฟิลด์ลับให้เข้าถึงเลย ต่อให้ controller เผลอ `return channel` ทั้งก้อนก็ไม่มีอะไรรั่ว

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/server/channels.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { deriveKey } from '../../src/crypto.js'
import { ValidationError } from '../../src/errors.js'
import { createChannelService } from '../../src/server/channels.js'
import { ChannelNotFoundError } from '../../src/server/errors.js'
import type { ListParams, Repo } from '../../src/server/types.js'
import type { ChannelRow } from '../../src/server/types.js'

const key = deriveKey('unit-test-key')
const TOKEN = 'aBcDeFgH1234567890-channel-access-token-WXYZ'

/** repo ในหน่วยความจำที่รองรับเฉพาะ filter แบบเท่ากับ ซึ่งเป็นทั้งหมดที่ service ตัวนี้ใช้ */
function fakeRepo(seed: ChannelRow[] = []): Repo<ChannelRow> & { rows: ChannelRow[] } {
  const rows = [...seed]
  let next = seed.length + 1
  return {
    rows,
    async findMany(params?: ListParams) {
      const filters = params?.filters ?? {}
      return rows.filter((row) => Object.entries(filters).every(
        ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
      ))
    },
    async findOne(id) { return rows.find((row) => row.id === id) ?? null },
    async create(data) {
      const row = { id: String(next++), ...data } as ChannelRow
      rows.push(row)
      return row
    },
    async update(id, data) {
      const index = rows.findIndex((row) => row.id === id)
      if (index < 0) throw new Error('missing')
      rows[index] = { ...rows[index]!, ...data }
      return rows[index]!
    },
    async delete(id) {
      const index = rows.findIndex((row) => row.id === id)
      if (index >= 0) rows.splice(index, 1)
    },
  }
}

function deepContains(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle)
  if (Array.isArray(value)) return value.some((v) => deepContains(v, needle))
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((v) => deepContains(v, needle))
  }
  return false
}

const input = { name: 'ร้านทดสอบ', channelId: '1650000000', channelAccessToken: TOKEN, channelSecret: 'shh' }

describe('createChannelService — เส้นทางปกติไม่มีความลับติดมา', () => {
  it('create เก็บลง repo เป็น ciphertext ไม่ใช่ plaintext', async () => {
    const repo = fakeRepo()
    await createChannelService({ repo, key }).create(input)
    expect(deepContains(repo.rows, TOKEN)).toBe(false)
    expect(repo.rows[0]!.channelAccessToken.startsWith('v1.')).toBe(true)
    expect(repo.rows[0]!.accessTokenLast4).toBe('WXYZ')
  })

  it('create คืน record ที่ไม่มีทั้ง plaintext และ ciphertext', async () => {
    const created = await createChannelService({ repo: fakeRepo(), key }).create(input)
    expect(created.accessTokenPreview).toBe('••••••••WXYZ')
    expect(deepContains(created, TOKEN)).toBe(false)
    expect(deepContains(created, 'v1.')).toBe(false)
  })

  it('list คืนทุก channel โดยไม่มีความลับแม้แต่ตัวเดียว', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    await service.create(input)
    await service.create({ ...input, channelId: '1650000001', channelAccessToken: `${TOKEN}2` })
    const rows = await service.list()
    expect(rows).toHaveLength(2)
    expect(deepContains(rows, TOKEN)).toBe(false)
  })

  it('ปฏิเสธ channelId ซ้ำด้วย ValidationError ที่ path ชี้ไปช่องที่ผิด', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    await service.create(input)
    await expect(service.create(input)).rejects.toThrow(ValidationError)
    await service.create(input).catch((error: ValidationError) => {
      expect(error.issues).toEqual([
        { path: 'channelId', code: 'channel_id_taken', message: 'channelId is already registered' },
      ])
    })
  })

  it('ตั้ง isDefault ตัวใหม่แล้วตัวเก่าถูกปลด — มี default ได้ทีละตัว', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    const first = await service.create({ ...input, isDefault: true })
    await service.create({ ...input, channelId: '1650000001', isDefault: true })
    expect((await service.findOne(first.id)).isDefault).toBe(false)
  })

  it('findOne ที่ไม่มีจริงโยน ChannelNotFoundError ไม่ใช่คืน null', async () => {
    await expect(createChannelService({ repo: fakeRepo(), key }).findOne('404'))
      .rejects.toThrow(ChannelNotFoundError)
  })
})

describe('update', () => {
  it('ไม่ส่ง token มาด้วย = ไม่แตะ envelope เดิม', async () => {
    const repo = fakeRepo()
    const service = createChannelService({ repo, key })
    const created = await service.create(input)
    const before = repo.rows[0]!.channelAccessToken

    await service.update(created.id, { name: 'ชื่อใหม่' })

    expect(repo.rows[0]!.channelAccessToken).toBe(before)
    expect(repo.rows[0]!.name).toBe('ชื่อใหม่')
  })

  it('ส่ง token ใหม่มา = ปิดผนึกใหม่และ last4 ตามไปด้วย', async () => {
    const repo = fakeRepo()
    const service = createChannelService({ repo, key })
    const created = await service.create(input)

    const updated = await service.update(created.id, { channelAccessToken: 'brand-new-token-6789' })

    expect(updated.accessTokenPreview).toBe('••••••••6789')
    expect(deepContains(repo.rows, 'brand-new-token-6789')).toBe(false)
  })
})

describe('withSecrets — ทางเดียวที่จะได้ plaintext', () => {
  it('findOne คืน token จริง', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    const created = await service.create(input)
    const opened = await service.withSecrets().findOne(created.id)
    expect(opened.channelAccessToken).toBe(TOKEN)
    expect(opened.channelSecret).toBe('shh')
  })

  it('findDefault เลือกตัวที่ตั้ง isDefault ไว้', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    await service.create({ ...input, channelAccessToken: 'other-token-0000' })
    await service.create({ ...input, channelId: '1650000001', isDefault: true })
    expect((await service.withSecrets().findDefault()).channelId).toBe('1650000001')
  })

  it('ไม่มี channel เลย findDefault โยน ChannelNotFoundError', async () => {
    await expect(createChannelService({ repo: fakeRepo(), key }).withSecrets().findDefault())
      .rejects.toThrow(ChannelNotFoundError)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/channels.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/channels.js"`

- [ ] **Step 3: เขียน `server/channels.ts`**

`packages/core/src/server/channels.ts`
```ts
import { ValidationError } from '../errors.js'
import { ChannelNotFoundError } from './errors.js'
import { openChannelSecrets, sealChannelSecrets, toChannelRecord } from './secrets.js'
import type { ChannelRecord, ChannelRow, ChannelWithSecrets, Repo } from './types.js'

export interface ChannelInput {
  name: string
  channelId: string
  channelAccessToken: string
  channelSecret?: string | null
  isDefault?: boolean
}

export interface SecretChannelReader {
  findOne(id: string): Promise<ChannelWithSecrets>
  findDefault(): Promise<ChannelWithSecrets>
}

export interface ChannelService {
  list(): Promise<ChannelRecord[]>
  findOne(id: string): Promise<ChannelRecord>
  create(input: ChannelInput): Promise<ChannelRecord>
  update(id: string, input: Partial<ChannelInput>): Promise<ChannelRecord>
  /** ทางเดียวที่จะได้ plaintext — ชื่อยาวและต้องเรียกเองโดยตั้งใจ ตามสเปก §11.2 */
  withSecrets(): SecretChannelReader
}

export function createChannelService(deps: { repo: Repo<ChannelRow>; key: Buffer }): ChannelService {
  const { repo, key } = deps

  async function rowOrThrow(id: string): Promise<ChannelRow> {
    const row = await repo.findOne(id)
    if (row === null) throw new ChannelNotFoundError(`channel ${id} does not exist`)
    return row
  }

  /** LINE OA หนึ่งตัวคือ channel หนึ่งตัว การมี default สองตัวไม่มีความหมายที่ตีความได้ */
  async function clearOtherDefaults(exceptId: string): Promise<void> {
    const others = await repo.findMany({ filters: { isDefault: true } })
    await Promise.all(
      others.filter((row) => row.id !== exceptId).map((row) => repo.update(row.id, { isDefault: false })),
    )
  }

  async function assertChannelIdFree(channelId: string, exceptId?: string): Promise<void> {
    const taken = await repo.findMany({ filters: { channelId } })
    if (taken.some((row) => row.id !== exceptId)) {
      // ใช้ ValidationError ของ core ไม่ใช่ error ชนิดใหม่ เพราะ `issues[].path` คือสิ่งที่
      // ฟอร์มฝั่ง UI (Plan 02) เอาไปชี้ error ลงช่องที่ผิดอยู่แล้ว — ชนิดใหม่จะไปโผล่บนหัวฟอร์มแทน
      throw new ValidationError('channelId is already registered', [
        { path: 'channelId', code: 'channel_id_taken', message: 'channelId is already registered' },
      ])
    }
  }

  return {
    async list() {
      return (await repo.findMany({ sort: 'name' })).map(toChannelRecord)
    },

    async findOne(id) {
      return toChannelRecord(await rowOrThrow(id))
    },

    async create(input) {
      await assertChannelIdFree(input.channelId)
      const created = await repo.create({
        name: input.name,
        channelId: input.channelId,
        isDefault: input.isDefault === true,
        ...sealChannelSecrets(input, key),
      })
      if (input.isDefault === true) await clearOtherDefaults(created.id)
      return toChannelRecord(await rowOrThrow(created.id))
    },

    async update(id, input) {
      const current = await rowOrThrow(id)
      if (input.channelId !== undefined) await assertChannelIdFree(input.channelId, id)

      // ไม่ส่ง token มา = ไม่ได้ตั้งใจเปลี่ยน token ไม่ใช่ตั้งใจล้างทิ้ง
      // ถ้าปิดผนึก undefined ทับ envelope เดิม channel ที่ใช้งานอยู่จะพังทันทีที่ผู้ใช้แก้แค่ชื่อ
      const resealed = input.channelAccessToken === undefined
        ? {}
        : sealChannelSecrets(
            { channelAccessToken: input.channelAccessToken, channelSecret: input.channelSecret },
            key,
          )

      await repo.update(id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.channelId === undefined ? {} : { channelId: input.channelId }),
        ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
        ...resealed,
      })
      if (input.isDefault === true) await clearOtherDefaults(id)
      return toChannelRecord(await rowOrThrow(current.id))
    },

    withSecrets() {
      return {
        async findOne(id) {
          return openChannelSecrets(await rowOrThrow(id), key)
        },
        async findDefault() {
          const marked = await repo.findMany({ filters: { isDefault: true } })
          const chosen = marked[0] ?? (await repo.findMany({ limit: 1 }))[0]
          if (chosen === undefined) throw new ChannelNotFoundError('no LINE channel is configured')
          return openChannelSecrets(chosen, key)
        },
      }
    },
  }
}
```

`packages/core/src/server/index.ts` — เพิ่มต่อท้าย
```ts
export * from './channels.js'
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server/channels.test.ts
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server packages/core/tests/server/channels.test.ts
git commit -m "feat(core): return channels without secrets unless withSecrets is called"
```

---

## Task 5: `server/audit.ts` — append-only และเขียนบนเส้นทางที่ล้มเหลวด้วย

**Files:**
- Create: `packages/core/src/server/audit.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่ม `export * from './audit.js'`)
- Test: `packages/core/tests/server/audit.test.ts`

**Interfaces:**
- Consumes: `Repo`, `AuditRow`, `AuditAction`, `AuditResult` จาก `./types.js` (Task 1) · `scrub`, `LoggerLike` จาก `./scrub.js` (Task 3)
- Produces:
  - `interface AuditEntry { actorId: string | null; action: AuditAction; richMenuId: string | null; channelId: string; before?: unknown; after?: unknown; result: AuditResult; errorCode?: string | null }`
  - `type AuditContext = Omit<AuditEntry, 'result' | 'after' | 'errorCode'>`
  - `interface AuditWriter { write(entry: AuditEntry): Promise<void>; around<T>(context: AuditContext, run: () => Promise<T>, describeAfter?: (value: T) => unknown): Promise<T> }`
  - `function createAuditWriter(deps: { repo: Repo<AuditRow>; logger: LoggerLike }): AuditWriter`
  - `function errorCodeOf(error: unknown): string`

สเปก §11.5 บอกสองอย่างที่ต้องแยกกันอ่าน — **append-only** (ไม่มี route ให้แก้/ลบ) และ **เขียนทุกเส้นทางรวมถึงตอนล้มเหลว** ข้อหลังคือข้อที่พลาดง่ายกว่ามาก เพราะ `try { ...; await audit() }` จะข้าม audit ทุกครั้งที่โยน `around()` มีอยู่เพื่อให้ไม่มีใครต้องจำเรื่องนี้เอง

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/server/audit.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { LineAuthError } from '../../src/errors.js'
import { createAuditWriter, errorCodeOf } from '../../src/server/audit.js'
import { REDACTED } from '../../src/server/scrub.js'
import type { AuditRow, Repo } from '../../src/server/types.js'

function fakeRepo(): Repo<AuditRow> & { rows: AuditRow[]; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } {
  const rows: AuditRow[] = []
  return {
    rows,
    async findMany() { return rows },
    async findOne() { return null },
    async create(data) {
      const row = { id: String(rows.length + 1), ...data } as AuditRow
      rows.push(row)
      return row
    },
    update: vi.fn(async () => { throw new Error('audit rows are append-only') }),
    delete: vi.fn(async () => { throw new Error('audit rows are append-only') }),
  }
}

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const context = { actorId: '3', action: 'publish' as const, richMenuId: '9', channelId: '1' }

describe('createAuditWriter', () => {
  it('เขียนแถวพร้อม before/after ที่ผ่าน scrub แล้ว', async () => {
    const repo = fakeRepo()
    await createAuditWriter({ repo, logger: silent }).write({
      ...context,
      before: { status: 'draft', channelAccessToken: 'plain-token' },
      after: { status: 'published' },
      result: 'success',
    })
    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]!.before).toEqual({ status: 'draft', channelAccessToken: REDACTED })
    expect(repo.rows[0]!.after).toEqual({ status: 'published' })
    expect(repo.rows[0]!.errorCode).toBeNull()
  })

  it('around เขียน success พร้อม after ที่ได้จากผลลัพธ์', async () => {
    const repo = fakeRepo()
    const writer = createAuditWriter({ repo, logger: silent })

    const value = await writer.around(
      { ...context, before: { status: 'draft' } },
      async () => ({ lineRichMenuId: 'richmenu-1' }),
      (result) => ({ lineRichMenuId: result.lineRichMenuId }),
    )

    expect(value).toEqual({ lineRichMenuId: 'richmenu-1' })
    expect(repo.rows[0]!.result).toBe('success')
    expect(repo.rows[0]!.after).toEqual({ lineRichMenuId: 'richmenu-1' })
  })

  it('around เขียน failure พร้อม error code แล้วโยน error เดิมต่อ ไม่ใช่ตัวใหม่', async () => {
    const repo = fakeRepo()
    const writer = createAuditWriter({ repo, logger: silent })
    const thrown = new LineAuthError('LINE ปฏิเสธ credential')

    await expect(writer.around(context, async () => { throw thrown }))
      .rejects.toBe(thrown)

    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]!.result).toBe('failure')
    expect(repo.rows[0]!.errorCode).toBe('line_auth_failed')
  })

  it('error ที่ไม่มี code ยังได้แถว audit — ไม่ใช่เงียบหาย', async () => {
    const repo = fakeRepo()
    const writer = createAuditWriter({ repo, logger: silent })
    await expect(writer.around(context, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(repo.rows[0]!.errorCode).toBe('unknown_error')
  })

  it('ไม่เคยเรียก update หรือ delete ของ repo เลย — append-only', async () => {
    const repo = fakeRepo()
    const writer = createAuditWriter({ repo, logger: silent })
    await writer.write({ ...context, result: 'success' })
    await writer.around(context, async () => 'ok')
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.delete).not.toHaveBeenCalled()
  })

  it('audit ที่เขียนไม่ลงต้องไม่กลบ error จริงของงาน และต้องถูก log ไว้', async () => {
    const repo = fakeRepo()
    repo.create = async () => { throw new Error('table is gone') }
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const writer = createAuditWriter({ repo, logger })

    await expect(writer.around(context, async () => { throw new LineAuthError('nope') }))
      .rejects.toThrow(LineAuthError)

    expect(logger.error).toHaveBeenCalled()
  })
})

describe('errorCodeOf', () => {
  it('อ่าน code จาก typed error ของ core', () => {
    expect(errorCodeOf(new LineAuthError('x'))).toBe('line_auth_failed')
  })
  it('คืน unknown_error สำหรับอย่างอื่นทั้งหมด', () => {
    expect(errorCodeOf(new Error('x'))).toBe('unknown_error')
    expect(errorCodeOf('a string')).toBe('unknown_error')
    expect(errorCodeOf(null)).toBe('unknown_error')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/audit.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/audit.js"`

- [ ] **Step 3: เขียน `server/audit.ts`**

`packages/core/src/server/audit.ts`
```ts
import { scrub, type LoggerLike } from './scrub.js'
import type { AuditAction, AuditResult, AuditRow, Repo } from './types.js'

export interface AuditEntry {
  actorId: string | null
  action: AuditAction
  richMenuId: string | null
  channelId: string
  before?: unknown
  after?: unknown
  result: AuditResult
  errorCode?: string | null
}

export type AuditContext = Omit<AuditEntry, 'result' | 'after' | 'errorCode'>

export interface AuditWriter {
  write(entry: AuditEntry): Promise<void>
  /**
   * ห่องานหนึ่งชิ้นให้มีแถว audit เสมอ ไม่ว่าจะจบทางไหน
   * รูปแบบ `try { ...; await audit() }` ข้าม audit ทุกครั้งที่โยน ซึ่งเป็นเคสที่ §11.5
   * ต้องการมากที่สุด — "ใครกด publish แล้วพัง" มีค่าพอ ๆ กับ "ใครกด publish แล้วสำเร็จ"
   */
  around<T>(context: AuditContext, run: () => Promise<T>, describeAfter?: (value: T) => unknown): Promise<T>
}

export function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && code.length > 0 ? code : 'unknown_error'
}

export function createAuditWriter(deps: { repo: Repo<AuditRow>; logger: LoggerLike }): AuditWriter {
  const { repo, logger } = deps

  async function persist(entry: AuditEntry): Promise<void> {
    await repo.create({
      actorId: entry.actorId,
      action: entry.action,
      richMenuId: entry.richMenuId,
      channelId: entry.channelId,
      before: scrub(entry.before ?? null),
      after: scrub(entry.after ?? null),
      result: entry.result,
      errorCode: entry.errorCode ?? null,
    })
  }

  /**
   * audit ที่เขียนไม่ลงต้องไม่กลายเป็น error ที่ผู้ใช้เห็นแทน error จริง
   * ถ้า publish ล้มเพราะ token หมดอายุ แล้ว audit ล้มตามเพราะตารางหาย ผู้ใช้ต้องเห็นข้อแรก
   * แถวที่หายไปถูกบันทึกไว้ที่ logger แทน — ผู้ตรวจจึงยังเห็นว่ามีช่องโหว่ตรงไหน
   *
   * FLAG สำหรับผู้รีวิว: อีกทางที่เถียงได้คือ "publish ที่ audit ไม่ได้ ต้องถือว่าล้ม"
   * เลือกทางนี้เพราะการกลบ error ต้นทางทำให้ debug ไม่ได้เลย และ LINE ก็ถูกแตะไปแล้วจริง ๆ
   */
  async function persistQuietly(entry: AuditEntry): Promise<void> {
    try {
      await persist(entry)
    } catch (error) {
      logger.error('line-rich-menu: failed to write audit row', { entry: scrub(entry), error })
    }
  }

  return {
    write: persistQuietly,

    async around(context, run, describeAfter) {
      let value: Awaited<ReturnType<typeof run>>
      try {
        value = await run()
      } catch (error) {
        await persistQuietly({ ...context, result: 'failure', after: null, errorCode: errorCodeOf(error) })
        throw error
      }
      await persistQuietly({
        ...context,
        result: 'success',
        after: describeAfter === undefined ? null : describeAfter(value),
        errorCode: null,
      })
      return value
    },
  }
}
```

`packages/core/src/server/index.ts` — เพิ่มต่อท้าย
```ts
export * from './audit.js'
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server/audit.test.ts
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server packages/core/tests/server/audit.test.ts
git commit -m "feat(core): write an audit row on the failure path as well as the success path"
```

---

## Task 6: `server/rate-limit.ts` — token bucket ต่อ channel ที่ endpoint publish

**Files:**
- Create: `packages/core/src/server/rate-limit.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่ม `export * from './rate-limit.js'`)
- Test: `packages/core/tests/server/rate-limit.test.ts`

**Interfaces:**
- Consumes: `PublishRateLimitedError` จาก `./errors.js` (Task 1)
- Produces:
  - `interface RateLimiterOptions { capacity: number; refillPerMinute: number; now?: () => number }`
  - `interface RateLimiter { take(key: string): void; tryTake(key: string): boolean }`
  - `function createRateLimiter(options: RateLimiterOptions): RateLimiter`

สเปก §11.4 — "rate limit ที่ endpoint publish · token bucket ต่อ channel กันทั้งการกดรัวและกันชน rate limit ของ LINE เอง" ที่นี่คือฝั่งกันการกดรัว ส่วนการชน rate limit ของ LINE จริง ๆ `LineClient` มี backoff อยู่แล้วจาก Plan 01

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/server/rate-limit.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { PublishRateLimitedError } from '../../src/server/errors.js'
import { createRateLimiter } from '../../src/server/rate-limit.js'

function clock(start = 0) {
  let value = start
  return { now: () => value, advance: (ms: number) => { value += ms } }
}

describe('createRateLimiter', () => {
  it('ปล่อยผ่านได้เท่ากับ capacity แล้วบล็อกตัวถัดไป', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 3, refillPerMinute: 3, now: time.now })
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(false)
  })

  it('take โยน PublishRateLimitedError พร้อมเวลาที่ต้องรอจริง', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 60, now: time.now })
    limiter.take('ch1')
    try {
      limiter.take('ch1')
      throw new Error('ควรจะโยนไปแล้ว')
    } catch (error) {
      expect(error).toBeInstanceOf(PublishRateLimitedError)
      // 60 ต่อนาที = 1 ต่อวินาที → ต้องรอราว 1000 ms
      expect((error as PublishRateLimitedError).retryAfterMs).toBeGreaterThan(900)
      expect((error as PublishRateLimitedError).retryAfterMs).toBeLessThanOrEqual(1000)
    }
  })

  it('เติมคืนตามเวลาที่ผ่านไป', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 60, now: time.now })
    limiter.take('ch1')
    limiter.take('ch1')
    expect(limiter.tryTake('ch1')).toBe(false)
    time.advance(1000)
    expect(limiter.tryTake('ch1')).toBe(true)
  })

  it('ไม่เติมเกิน capacity ต่อให้ทิ้งไว้นานแค่ไหน', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 2, refillPerMinute: 60, now: time.now })
    time.advance(60 * 60 * 1000)
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(false)
  })

  it('แต่ละ channel มีถังของตัวเอง', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 1, now: time.now })
    expect(limiter.tryTake('ch1')).toBe(true)
    expect(limiter.tryTake('ch2')).toBe(true)
    expect(limiter.tryTake('ch1')).toBe(false)
  })

  it('config ที่ตั้งผิดถูกดันขึ้นเป็นค่าต่ำสุด แทนที่จะล็อกทุกคนออกถาวร', () => {
    const time = clock()
    const limiter = createRateLimiter({ capacity: 0, refillPerMinute: 0, now: time.now })
    expect(limiter.tryTake('ch1')).toBe(true)
    time.advance(60_000)
    expect(limiter.tryTake('ch1')).toBe(true)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/rate-limit.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/rate-limit.js"`

- [ ] **Step 3: เขียน `server/rate-limit.ts`**

`packages/core/src/server/rate-limit.ts`
```ts
import { PublishRateLimitedError } from './errors.js'

export interface RateLimiterOptions {
  capacity: number
  refillPerMinute: number
  /** ฉีดเข้ามาในเทสต์ได้ ไม่งั้นเทสต์ต้องนอนรอจริง */
  now?: () => number
}

export interface RateLimiter {
  /** โยน `PublishRateLimitedError` เมื่อถังหมด */
  take(key: string): void
  tryTake(key: string): boolean
}

interface Bucket { tokens: number; updatedAt: number }

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  // ดันขึ้นเป็นค่าต่ำสุดแทนการเชื่อค่าที่ส่งมา — `capacity: 0` จาก config ที่พิมพ์ผิด
  // แปลว่าไม่มีใคร publish ได้อีกเลยจนกว่าจะมีคนไปแก้ไฟล์ ซึ่งเป็นความล้มเหลวที่เงียบเกินไป
  const capacity = Math.max(1, Math.floor(options.capacity))
  const refillPerMs = Math.max(1, Math.floor(options.refillPerMinute)) / 60_000
  const now = options.now ?? Date.now

  // in-memory ต่อ process โดยตั้งใจ — สเปก §10 เลือกไม่พึ่ง Redis ทั้งโปรเจกต์
  // ผลคือระบบที่รันหลาย instance จะได้เพดานเท่ากับ capacity × จำนวน instance
  // ซึ่งยังห่างจาก rate limit จริงของ LINE มาก และ LineClient มี backoff รับอีกชั้น
  const buckets = new Map<string, Bucket>()

  function refill(key: string): Bucket {
    const at = now()
    const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: at }
    const gained = (at - bucket.updatedAt) * refillPerMs
    const next: Bucket = { tokens: Math.min(capacity, bucket.tokens + gained), updatedAt: at }
    buckets.set(key, next)
    return next
  }

  return {
    tryTake(key) {
      const bucket = refill(key)
      if (bucket.tokens < 1) return false
      bucket.tokens -= 1
      return true
    },
    take(key) {
      const bucket = refill(key)
      if (bucket.tokens < 1) {
        throw new PublishRateLimitedError(Math.ceil((1 - bucket.tokens) / refillPerMs))
      }
      bucket.tokens -= 1
    },
  }
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server/rate-limit.test.ts
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server packages/core/tests/server/rate-limit.test.ts
git commit -m "feat(core): rate limit publishing per channel with a token bucket"
```

---

## Task 7: `server/images.ts` — normalize ตอน **save** ไม่ใช่ตอน publish

**Files:**
- Create: `packages/core/src/server/images.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่ม `export * from './images.js'`)
- Test: `packages/core/tests/server/images.test.ts`

**Interfaces:**
- Consumes: `normalize`, `compose` จาก `../image/pipeline.js` (Plan 01) · `LARGE`, `COMPACT` จาก `../templates.js` · `MenuNotReadyError` จาก `./errors.js` (Task 1) · `AreaRecord`, `RichMenuSize`, `RichMenuSizeName` จาก `./types.js` / `../types.js`
- Produces:
  - `interface ImageStore { read(fileId: number): Promise<Buffer>; write(input: { buffer: Buffer; mime: 'image/jpeg' | 'image/png'; filename: string }): Promise<{ id: number }> }`
  - `interface ImageSourceInput { sizeName: RichMenuSizeName; imageFileId: number | null; areaImages: readonly { index: number; fileId: number }[]; areas: readonly AreaRecord[] }`
  - `interface PreparedImage { normalizedFileId: number; normalizedMime: 'image/jpeg' | 'image/png'; normalizedSize: RichMenuSize }`
  - `function canvasFor(sizeName: RichMenuSizeName): RichMenuSize`
  - `function imageFingerprint(input: ImageSourceInput): string`
  - `function prepareImage(deps: { store: ImageStore }, input: ImageSourceInput, menuId: string): Promise<PreparedImage>`

Plan 01 วัดไว้ว่ารูปที่บีบไม่ลงใช้เวลาเกิน 5 วินาทีต่อการ normalize หนึ่งครั้ง และสเปก §4.3 สรุปตรง ๆ ว่า **ห้ามทำ normalize แบบ synchronous ในคำขอที่ publish** แต่ `ui` ที่ merge ไปแล้วอัปโหลดผ่าน `POST /upload` ของ Strapi ตรง ๆ (สเปก §5.2) ซึ่งไม่ผ่านปลั๊กอินเลย

**คำตัดสิน:** normalize เกิดที่ **ขั้น save เมนู** ซึ่งเป็นจุดสัมผัสฝั่งเซิร์ฟเวอร์จุดเดียวที่ UI ที่ปล่อยไปแล้วให้มา และเกิด **ครั้งเดียวต่อการเปลี่ยนรูป** ไม่ใช่ครั้งเดียวต่อการ publish ผลถูกเก็บลง `normalizedFileId` / `normalizedMime` / `normalizedSize` แล้ว publish อ่านอย่างเดียว — เส้นทาง publish จึงไม่เรียก sharp เลยแม้แต่ครั้งเดียว `imageFingerprint` ทำให้ save ที่ไม่ได้แตะรูปข้ามงานนี้ไปทั้งดุ้น

**FLAG สำหรับผู้รีวิว:** ถ้า reverse proxy ของลูกค้าตั้ง timeout ต่ำกว่า ~10 วินาที ขั้น save จะยังชนได้ในเคสรูป noise หลายช่อง ทางแก้จริงคือคิวงาน ซึ่งเกินขอบเขต 1.0.0 — บันทึกไว้ใน carry-forward ของ Plan 04

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/server/images.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { MAX_OUTPUT_BYTES } from '../../src/image/guards.js'
import { MenuNotReadyError } from '../../src/server/errors.js'
import { canvasFor, imageFingerprint, prepareImage } from '../../src/server/images.js'
import type { ImageStore } from '../../src/server/images.js'
import { solidJpeg, transparentPng } from '../fixtures/make-fixtures.js'

// เหตุผลเดียวกับ tests/image/pipeline.test.ts — mozjpeg บีบจริง ช้ากว่า 5000ms บน CI ได้
vi.setConfig({ testTimeout: 20_000 })

function fakeStore(files: Record<number, Buffer>): ImageStore & { written: { mime: string; bytes: number }[] } {
  const written: { mime: string; bytes: number }[] = []
  let next = 900
  return {
    written,
    async read(fileId) {
      const found = files[fileId]
      if (found === undefined) throw new Error(`no file ${fileId}`)
      return found
    },
    async write({ buffer, mime }) {
      written.push({ mime, bytes: buffer.length })
      return { id: next++ }
    },
  }
}

describe('canvasFor', () => {
  it('map ชื่อขนาดไปเป็นผืนผ้าใบที่ LINE รับ', () => {
    expect(canvasFor('large')).toEqual({ width: 2500, height: 1686 })
    expect(canvasFor('compact')).toEqual({ width: 2500, height: 843 })
  })
})

describe('prepareImage — รูปเดียว', () => {
  it('normalize แล้วเก็บไฟล์ใหม่ คืนขั้นบันไดที่ลงจริง', async () => {
    const store = fakeStore({ 11: await solidJpeg(4000, 3000) })
    const prepared = await prepareImage({ store }, {
      sizeName: 'large', imageFileId: 11, areaImages: [], areas: [],
    }, '7')

    expect(prepared.normalizedFileId).toBe(900)
    expect(prepared.normalizedMime).toBe('image/jpeg')
    expect(prepared.normalizedSize).toEqual({ width: 2500, height: 1686 })
    expect(store.written[0]!.bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
  })

  it('PNG ที่มี alpha จริงยังคงเป็น PNG', async () => {
    const store = fakeStore({ 12: await transparentPng(2500, 843) })
    const prepared = await prepareImage({ store }, {
      sizeName: 'compact', imageFileId: 12, areaImages: [], areas: [],
    }, '7')
    expect(prepared.normalizedMime).toBe('image/png')
    expect(prepared.normalizedSize).toEqual({ width: 2500, height: 843 })
  })

  it('ไม่มีรูปเลยโยน MenuNotReadyError("no_image") ไม่ใช่ปล่อยไปพังตอน publish', async () => {
    await expect(prepareImage({ store: fakeStore({}) }, {
      sizeName: 'large', imageFileId: null, areaImages: [], areas: [],
    }, '7')).rejects.toThrow(MenuNotReadyError)
  })
})

describe('prepareImage — โหมด compose แยกช่อง', () => {
  it('วางรูปแต่ละช่องลงผืนผ้าใบแล้ว normalize ต่อ', async () => {
    const store = fakeStore({ 21: await solidJpeg(1250, 1686), 22: await solidJpeg(1250, 1686) })
    const areas = [
      { bounds: { x: 0, y: 0, width: 1250, height: 1686 }, action: { type: 'message' as const, text: 'a' } },
      { bounds: { x: 1250, y: 0, width: 1250, height: 1686 }, action: { type: 'message' as const, text: 'b' } },
    ]

    const prepared = await prepareImage({ store }, {
      sizeName: 'large',
      imageFileId: null,
      areaImages: [{ index: 0, fileId: 21 }, { index: 1, fileId: 22 }],
      areas,
    }, '7')

    expect(prepared.normalizedSize).toEqual({ width: 2500, height: 1686 })
    expect(store.written).toHaveLength(1)
  })

  it('areaImages ที่ชี้ไป index ที่ไม่มี area โยน MenuNotReadyError("no_areas")', async () => {
    const store = fakeStore({ 21: await solidJpeg(1250, 1686) })
    await expect(prepareImage({ store }, {
      sizeName: 'large', imageFileId: null, areaImages: [{ index: 5, fileId: 21 }], areas: [],
    }, '7')).rejects.toThrow(MenuNotReadyError)
  })
})

describe('imageFingerprint', () => {
  it('เหมือนเดิมเมื่อไม่มีอะไรเกี่ยวกับรูปเปลี่ยน', () => {
    const base = {
      sizeName: 'large' as const, imageFileId: 11, areaImages: [], areas: [
        { bounds: { x: 0, y: 0, width: 100, height: 100 }, action: { type: 'message' as const, text: 'a' } },
      ],
    }
    expect(imageFingerprint(base)).toBe(imageFingerprint({ ...base, areas: [
      { bounds: { x: 0, y: 0, width: 100, height: 100 }, action: { type: 'message' as const, text: 'เปลี่ยนข้อความ' } },
    ] }))
  })

  it('ต่างเมื่อ file, ขนาด หรือ bounds เปลี่ยน', () => {
    const base = { sizeName: 'large' as const, imageFileId: 11, areaImages: [], areas: [] }
    expect(imageFingerprint(base)).not.toBe(imageFingerprint({ ...base, imageFileId: 12 }))
    expect(imageFingerprint(base)).not.toBe(imageFingerprint({ ...base, sizeName: 'compact' }))
    expect(imageFingerprint(base)).not.toBe(imageFingerprint({
      ...base,
      areas: [{ bounds: { x: 0, y: 0, width: 10, height: 10 }, action: { type: 'message', text: 'a' } }],
    }))
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/images.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/images.js"`

- [ ] **Step 3: เขียน `server/images.ts`**

`packages/core/src/server/images.ts`
```ts
import { compose, normalize } from '../image/pipeline.js'
import { COMPACT, LARGE } from '../templates.js'
import type { RichMenuSize, RichMenuSizeName } from '../types.js'
import { MenuNotReadyError } from './errors.js'
import type { AreaRecord } from './types.js'

/**
 * ปลั๊กอินไม่เก็บไฟล์เอง (สเปก §7.3) — อ่านและเขียนผ่าน upload provider ของ Strapi
 * adapter เป็นคน implement ตัวนี้ ชั้น service จึงไม่รู้ว่าเบื้องหลังเป็น local / S3 / Cloudinary
 */
export interface ImageStore {
  read(fileId: number): Promise<Buffer>
  write(input: { buffer: Buffer; mime: 'image/jpeg' | 'image/png'; filename: string }): Promise<{ id: number }>
}

export interface ImageSourceInput {
  sizeName: RichMenuSizeName
  imageFileId: number | null
  areaImages: readonly { index: number; fileId: number }[]
  areas: readonly AreaRecord[]
}

export interface PreparedImage {
  normalizedFileId: number
  normalizedMime: 'image/jpeg' | 'image/png'
  /** ขั้นบันไดที่รูป *ลงจริง* — `payload.size` ต้องมาจากค่านี้ ไม่ใช่จากที่ฟอร์มเชื่อ */
  normalizedSize: RichMenuSize
}

export function canvasFor(sizeName: RichMenuSizeName): RichMenuSize {
  return sizeName === 'large' ? LARGE : COMPACT
}

/**
 * ลายนิ้วมือของ "สิ่งที่ทำให้ผลของ normalize เปลี่ยน" เท่านั้น
 * `action` ของแต่ละช่องไม่อยู่ในนี้โดยตั้งใจ — แก้ข้อความปุ่มไม่ควรทำให้ต้องบีบรูปใหม่ 5 วินาที
 */
export function imageFingerprint(input: ImageSourceInput): string {
  return JSON.stringify([
    input.sizeName,
    input.imageFileId,
    [...input.areaImages].sort((a, b) => a.index - b.index).map((a) => [a.index, a.fileId]),
    input.areas.map((a) => [a.bounds.x, a.bounds.y, a.bounds.width, a.bounds.height]),
  ])
}

export async function prepareImage(
  deps: { store: ImageStore },
  input: ImageSourceInput,
  menuId: string,
): Promise<PreparedImage> {
  const canvas = canvasFor(input.sizeName)

  let source: Buffer
  if (input.areaImages.length > 0) {
    const parts = await Promise.all(input.areaImages.map(async (part) => {
      const area = input.areas[part.index]
      if (area === undefined) throw new MenuNotReadyError('no_areas')
      return { bounds: area.bounds, image: await deps.store.read(part.fileId) }
    }))
    source = await compose(parts, canvas)
  } else if (input.imageFileId !== null) {
    source = await deps.store.read(input.imageFileId)
  } else {
    throw new MenuNotReadyError('no_image')
  }

  const normalized = await normalize(source, input.sizeName)
  const extension = normalized.mime === 'image/png' ? 'png' : 'jpg'
  const { id } = await deps.store.write({
    buffer: normalized.buffer,
    mime: normalized.mime,
    filename: `rich-menu-${menuId}-${normalized.width}x${normalized.height}.${extension}`,
  })

  return {
    normalizedFileId: id,
    normalizedMime: normalized.mime,
    normalizedSize: { width: normalized.width, height: normalized.height },
  }
}
```

`packages/core/src/server/index.ts` — เพิ่มต่อท้าย
```ts
export * from './images.js'
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server/images.test.ts
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server packages/core/tests/server/images.test.ts
git commit -m "feat(core): normalize the menu image when it is saved, not when it is published"
```

---

## Task 8: `server/payload.ts` — `RichMenuRow` → `RichMenuPayload` และการปิดวงเรื่องขนาด

**Files:**
- Create: `packages/core/src/server/payload.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่ม `export * from './payload.js'`)
- Test: `packages/core/tests/server/payload.test.ts`

**Interfaces:**
- Consumes: `validateRichMenu` จาก `../schema.js` · `sizeNameFor` จาก `../templates.js` · `canvasFor` จาก `./images.js` (Task 7) · `MenuNotReadyError`, `AliasNotPublishedError` จาก `./errors.js` (Task 1) · `RichMenuRow` จาก `./types.js` (Task 1) · `Bounds`, `RichMenuPayload`, `RichMenuSize` จาก `../types.js`
- Produces:
  - `const DEFAULT_CHAT_BAR_TEXT = 'Menu'`
  - `function resolveChatBarText(menu: Pick<RichMenuRow, 'chatBarMode' | 'chatBarText'>): string`
  - `function scaleBounds(bounds: Bounds, from: RichMenuSize, to: RichMenuSize): Bounds`
  - `function publishedAliasesOf(menus: readonly RichMenuRow[]): Set<string>`
  - `function buildPayload(menu: RichMenuRow, publishedAliases: ReadonlySet<string>): RichMenuPayload`

**กับดักที่ task นี้มีไว้ปิด:** carry-forward เขียนว่า "`payload.size` ต้องมาจากค่าที่ `normalize` คืน" — แต่ถ้า `normalize` ลดขั้นบันไดลงไป 1200×810 เพราะบีบไม่ลง `bounds` ที่ผู้ใช้วาดไว้บนผืนผ้าใบ 2500×1686 จะ **ล้นกรอบทันที** และ `validateRichMenu` จะปฏิเสธ การเอา `size` จากผลของ normalize อย่างเดียวจึงยังไม่พอ — ต้องย่อ `bounds` ตามไปด้วยในอัตราส่วนเดียวกัน

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/server/payload.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { ValidationError } from '../../src/errors.js'
import { AliasNotPublishedError, MenuNotReadyError } from '../../src/server/errors.js'
import {
  DEFAULT_CHAT_BAR_TEXT, buildPayload, publishedAliasesOf, resolveChatBarText, scaleBounds,
} from '../../src/server/payload.js'
import type { RichMenuRow } from '../../src/server/types.js'

function menu(overrides: Partial<RichMenuRow> = {}): RichMenuRow {
  return {
    id: '1', name: 'เมนูหลัก', channelId: '1', size: 'large',
    chatBarText: 'เปิดเมนู', chatBarMode: 'custom', selected: true,
    templateKey: 'RICH_MENU_TEMPLATE_201', areas: [
      { bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'สวัสดี' } },
    ],
    imageFileId: 11, areaImages: [],
    normalizedFileId: 900, normalizedMime: 'image/jpeg',
    normalizedSize: { width: 2500, height: 1686 },
    aliasId: 'main', status: 'draft', lineRichMenuId: null, publishedAt: null, lastError: null,
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('resolveChatBarText', () => {
  it('โหมด custom ใช้ข้อความที่ผู้ใช้พิมพ์', () => {
    expect(resolveChatBarText({ chatBarMode: 'custom', chatBarText: 'เปิดเมนู' })).toBe('เปิดเมนู')
  })
  it('โหมด default เติมค่าคงที่ให้ ไม่ใช่ค่าว่าง — LINE บังคับให้มีฟิลด์นี้เสมอ', () => {
    expect(resolveChatBarText({ chatBarMode: 'default', chatBarText: '' })).toBe(DEFAULT_CHAT_BAR_TEXT)
    expect(resolveChatBarText({ chatBarMode: 'default', chatBarText: 'ถูกละเลย' })).toBe(DEFAULT_CHAT_BAR_TEXT)
  })
})

describe('scaleBounds', () => {
  it('อัตราส่วน 1 คืนตัวเลขเดิมเป๊ะ ไม่ใช่ค่าที่ปัดแล้วเพี้ยน', () => {
    const from = { width: 2500, height: 1686 }
    const bounds = { x: 833, y: 0, width: 834, height: 843 }
    expect(scaleBounds(bounds, from, from)).toEqual(bounds)
  })

  it('ย่อลงขั้นบันไดถัดไปแล้วยังอยู่ในกรอบ', () => {
    const scaled = scaleBounds(
      { x: 1250, y: 843, width: 1250, height: 843 },
      { width: 2500, height: 1686 },
      { width: 1200, height: 810 },
    )
    expect(scaled.x + scaled.width).toBeLessThanOrEqual(1200)
    expect(scaled.y + scaled.height).toBeLessThanOrEqual(810)
    expect(scaled.width).toBeGreaterThan(0)
    expect(scaled.height).toBeGreaterThan(0)
  })
})

describe('publishedAliasesOf', () => {
  it('นับเฉพาะเมนูที่ publish แล้วและมี alias กับ id จาก LINE จริง', () => {
    const rows = [
      menu({ id: '1', aliasId: 'tab-a', status: 'published', lineRichMenuId: 'richmenu-a' }),
      menu({ id: '2', aliasId: 'tab-b', status: 'draft', lineRichMenuId: null }),
      menu({ id: '3', aliasId: null, status: 'published', lineRichMenuId: 'richmenu-c' }),
    ]
    expect([...publishedAliasesOf(rows)]).toEqual(['tab-a'])
  })
})

describe('buildPayload', () => {
  it('ประกอบ payload จากแถวในฐานข้อมูลและผ่าน validateRichMenu ของ core', () => {
    const payload = buildPayload(menu(), new Set())
    expect(payload.size).toEqual({ width: 2500, height: 1686 })
    expect(payload.chatBarText).toBe('เปิดเมนู')
    expect(payload.selected).toBe(true)
    expect(payload.areas).toHaveLength(1)
  })

  it('size มาจากขั้นบันไดที่รูปลงจริง และ bounds ถูกย่อตามไปด้วย', () => {
    const payload = buildPayload(menu({ normalizedSize: { width: 1200, height: 810 } }), new Set())
    expect(payload.size).toEqual({ width: 1200, height: 810 })
    expect(payload.areas[0]!.bounds).toEqual({ x: 0, y: 0, width: 1200, height: 810 })
  })

  it('ยังไม่มีรูปที่ normalize แล้วโยน MenuNotReadyError', () => {
    expect(() => buildPayload(menu({ normalizedSize: null, normalizedFileId: null }), new Set()))
      .toThrow(MenuNotReadyError)
  })

  it('ไม่มีช่องเลยโยน MenuNotReadyError ไม่ใช่ปล่อยให้ LINE ปฏิเสธ', () => {
    expect(() => buildPayload(menu({ areas: [] }), new Set())).toThrow(MenuNotReadyError)
  })

  it('ขนาดที่เก็บกับขั้นบันไดที่รูปลงไม่ตรงตระกูลกัน = แถวเสีย ต้อง prepare รูปใหม่', () => {
    expect(() => buildPayload(menu({ normalizedSize: { width: 2500, height: 843 } }), new Set()))
      .toThrow(MenuNotReadyError)
  })

  it('richmenuswitch ที่ชี้ไป alias ที่ยังไม่ publish โยน AliasNotPublishedError พร้อมชื่อ alias', () => {
    const withSwitch = menu({
      areas: [{
        bounds: { x: 0, y: 0, width: 2500, height: 1686 },
        action: { type: 'richmenuswitch', richMenuAliasId: 'tab-b', data: 'go' },
      }],
    })
    expect(() => buildPayload(withSwitch, new Set())).toThrow(AliasNotPublishedError)
    expect(() => buildPayload(withSwitch, new Set(['tab-b']))).not.toThrow()
  })

  it('payload ที่ผิดกฎของ LINE ยังโยน ValidationError ของ core เหมือนเดิม', () => {
    expect(() => buildPayload(menu({ chatBarMode: 'custom', chatBarText: 'ยาวเกินสิบสี่ตัวอักษรแน่นอน' }), new Set()))
      .toThrow(ValidationError)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/payload.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/payload.js"`

- [ ] **Step 3: เขียน `server/payload.ts`**

`packages/core/src/server/payload.ts`
```ts
import { validateRichMenu } from '../schema.js'
import { sizeNameFor } from '../templates.js'
import type { Bounds, RichMenuPayload, RichMenuSize } from '../types.js'
import { AliasNotPublishedError, MenuNotReadyError } from './errors.js'
import { canvasFor } from './images.js'
import type { RichMenuRow } from './types.js'

/**
 * `chatBarText` เป็นฟิลด์บังคับของ LINE เสมอ ส่วนโหมด default (สเปก §5.5) แปลว่า
 * "ผู้ใช้ไม่อยากตั้งเอง ให้ระบบเติมให้" — ค่าที่เติมจึงต้องไม่ขึ้นกับภาษาของ admin ที่กด save
 * ไม่งั้นเมนูเดียวกันจะได้แถบแชทคนละคำขึ้นกับว่าใครกด publish
 */
export const DEFAULT_CHAT_BAR_TEXT = 'Menu'

export function resolveChatBarText(menu: Pick<RichMenuRow, 'chatBarMode' | 'chatBarText'>): string {
  return menu.chatBarMode === 'custom' ? menu.chatBarText : DEFAULT_CHAT_BAR_TEXT
}

/**
 * `bounds` ถูกวาดบนผืนผ้าใบตามชื่อขนาด (`large` = 2500×1686) แต่ `normalize` มีสิทธิ์
 * ลดขั้นบันไดลงเมื่อบีบไม่ลง 1 MB ถ้าเอา `size` ใหม่ไปคู่กับ `bounds` เดิม ทุกช่องจะล้นกรอบ
 * และ `validateRichMenu` จะปฏิเสธทั้งเมนู — ซึ่งอ่านเหมือนบั๊กของผู้ใช้ทั้งที่เป็นของเรา
 *
 * `clamp` ด้านล่างไม่ใช่ของฟุ่มเฟือย — การปัดเศษขึ้นสองครั้ง (x และ width) ทำให้ผลรวม
 * เกินขอบได้หนึ่งพิกเซล ซึ่งพอที่จะถูกปฏิเสธจริง
 */
export function scaleBounds(bounds: Bounds, from: RichMenuSize, to: RichMenuSize): Bounds {
  if (from.width === to.width && from.height === to.height) return { ...bounds }

  const ratioX = to.width / from.width
  const ratioY = to.height / from.height
  const x = Math.round(bounds.x * ratioX)
  const y = Math.round(bounds.y * ratioY)
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(bounds.width * ratioX), to.width - x)),
    height: Math.max(1, Math.min(Math.round(bounds.height * ratioY), to.height - y)),
  }
}

/** สเปก §9 — alias ใช้ได้ก็ต่อเมื่อเมนูปลายทาง publish ไปแล้วจริงและมี id จาก LINE */
export function publishedAliasesOf(menus: readonly RichMenuRow[]): Set<string> {
  return new Set(
    menus
      .filter((m) => m.status === 'published' && m.aliasId !== null && m.lineRichMenuId !== null)
      .map((m) => m.aliasId!),
  )
}

export function buildPayload(menu: RichMenuRow, publishedAliases: ReadonlySet<string>): RichMenuPayload {
  if (menu.normalizedSize === null || menu.normalizedFileId === null) {
    throw new MenuNotReadyError('no_image')
  }
  if (menu.areas.length === 0) throw new MenuNotReadyError('no_areas')

  // แถวที่ `size` กับขั้นบันไดของรูปคนละตระกูลกันเกิดได้เมื่อผู้ใช้เปลี่ยน template ข้ามตระกูล
  // แล้ว save ล้มกลางทาง — ปล่อยผ่านแปลว่าเมนูบน LINE จะมีสัดส่วนไม่ตรงกับรูปที่อัปไป
  if (sizeNameFor(menu.normalizedSize) !== menu.size) throw new MenuNotReadyError('no_image')

  for (const area of menu.areas) {
    if (area.action.type === 'richmenuswitch' && !publishedAliases.has(area.action.richMenuAliasId)) {
      throw new AliasNotPublishedError(area.action.richMenuAliasId)
    }
  }

  const declared = canvasFor(menu.size)
  return validateRichMenu({
    size: menu.normalizedSize,
    selected: menu.selected,
    name: menu.name.slice(0, 300),
    chatBarText: resolveChatBarText(menu),
    areas: menu.areas.map((area) => ({
      bounds: scaleBounds(area.bounds, declared, menu.normalizedSize!),
      action: area.action,
    })),
  })
}
```

`packages/core/src/server/index.ts` — เพิ่มต่อท้าย
```ts
export * from './payload.js'
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server/payload.test.ts
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server packages/core/tests/server/payload.test.ts
git commit -m "feat(core): build the LINE payload from the rung the image actually landed on"
```

---

## Task 9: `LineClient.getDefault()` / `getAlias()` — อ่านสถานะก่อนแตะ

**Files:**
- Modify: `packages/core/src/errors.ts`, `packages/core/src/line/endpoints.ts`, `packages/core/src/line/client.ts`, `tools/line-mock/src/server.ts`
- Test: `packages/core/tests/line/read-state.test.ts`, `tools/line-mock/tests/read-state.test.ts`

**Interfaces:**
- Consumes: `endpoints` จาก `./endpoints.js` · `CoreError` จาก `../errors.js`
- Produces:
  - `class LineNotFoundError extends CoreError { readonly code = 'line_not_found' }`
  - `endpoints.defaultRichMenu(base: string): string`
  - `LineClient.getDefault(): Promise<string | null>`
  - `LineClient.getAlias(aliasId: string): Promise<string | null>`
  - `tools/line-mock` รองรับ `GET /v2/bot/user/all/richmenu` และ `GET /v2/bot/richmenu/alias/:aliasId`

design notes ข้อ 2 ปิดข้อค้างของ carry-forward ด้วยการ **capture ก่อนแตะ แล้วคืนสิ่งที่ capture ไว้** ซึ่งต้องอ่านสองอย่างจาก LINE ที่ `LineClient` ยังไม่มีให้ — เมนู default ปัจจุบัน และปลายทางปัจจุบันของ alias ทั้งคู่ตอบ **404 เมื่อยังไม่มี** ซึ่งเป็นคำตอบ ไม่ใช่ความผิดพลาด `#toError` เดิมเหมารวม 4xx ที่ไม่ใช่ 401/403/429 เป็น `LineValidationError` ทั้งหมด จึงแยกไม่ออก task นี้แยก 404 ออกมาเป็นชนิดของตัวเอง (ไม่มีเทสต์เดิมข้อไหนใช้ 404 — ทุกเคส 4xx ใน `tests/line/retry.test.ts` ใช้ 400)

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/line/read-state.test.ts`
```ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { LineNotFoundError, LineValidationError } from '../../src/errors.js'
import { LineClient } from '../../src/line/client.js'
import { endpoints } from '../../src/line/endpoints.js'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const client = () => new LineClient({ accessToken: 'secret-token-value' })

describe('endpoints.defaultRichMenu', () => {
  it('เป็น URL เดียวกับ clearDefault — ต่างกันแค่ HTTP method', () => {
    expect(endpoints.defaultRichMenu('https://api.line.me'))
      .toBe(endpoints.clearDefault('https://api.line.me'))
  })
})

describe('getDefault', () => {
  it('คืน richMenuId เมื่อมี default อยู่', async () => {
    server.use(http.get('https://api.line.me/v2/bot/user/all/richmenu', () =>
      HttpResponse.json({ richMenuId: 'richmenu-current' })))
    expect(await client().getDefault()).toBe('richmenu-current')
  })

  it('คืน null เมื่อ LINE ตอบ 404 — ยังไม่เคยตั้ง default ไม่ใช่ error', async () => {
    server.use(http.get('https://api.line.me/v2/bot/user/all/richmenu', () =>
      HttpResponse.json({ message: 'no default richmenu' }, { status: 404 })))
    expect(await client().getDefault()).toBeNull()
  })

  it('400 ยังเป็น LineValidationError เหมือนเดิม ไม่ถูกกลืนเป็น null', async () => {
    server.use(http.get('https://api.line.me/v2/bot/user/all/richmenu', () =>
      HttpResponse.json({ message: 'bad' }, { status: 400 })))
    await expect(client().getDefault()).rejects.toBeInstanceOf(LineValidationError)
  })
})

describe('getAlias', () => {
  it('คืน richMenuId ที่ alias ชี้อยู่', async () => {
    server.use(http.get('https://api.line.me/v2/bot/richmenu/alias/tab-a', () =>
      HttpResponse.json({ richMenuAliasId: 'tab-a', richMenuId: 'richmenu-a' })))
    expect(await client().getAlias('tab-a')).toBe('richmenu-a')
  })

  it('คืน null เมื่อยังไม่มี alias ตัวนั้น', async () => {
    server.use(http.get('https://api.line.me/v2/bot/richmenu/alias/tab-a', () =>
      HttpResponse.json({ message: 'not found' }, { status: 404 })))
    expect(await client().getAlias('tab-a')).toBeNull()
  })
})

describe('404 จาก endpoint อื่น', () => {
  it('เป็น LineNotFoundError ไม่ใช่ LineValidationError', async () => {
    server.use(http.delete('https://api.line.me/v2/bot/richmenu/richmenu-gone', () =>
      HttpResponse.json({ message: 'not found' }, { status: 404 })))
    await expect(client().deleteRichMenu('richmenu-gone')).rejects.toBeInstanceOf(LineNotFoundError)
  })
})
```

`tools/line-mock/tests/read-state.test.ts`
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
afterAll(async () => { await app.close() })

const payload = {
  size: { width: 2500, height: 843 },
  selected: false,
  name: 'm',
  chatBarText: 'm',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'message' as const, text: 'hi' } }],
}

describe('line-mock รองรับการอ่านสถานะที่ compensation ต้องใช้', () => {
  it('ยังไม่มี default → getDefault คืน null · ตั้งแล้ว → คืน id นั้น', async () => {
    const client = new LineClient({ accessToken: 'x', apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })
    expect(await client.getDefault()).toBeNull()

    const id = await client.createRichMenu(payload)
    await client.setDefault(id)
    expect(await client.getDefault()).toBe(id)

    await client.clearDefault()
    expect(await client.getDefault()).toBeNull()
  })

  it('ยังไม่มี alias → getAlias คืน null · สร้างแล้ว → คืนปลายทาง', async () => {
    const client = new LineClient({ accessToken: 'x', apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })
    expect(await client.getAlias('tab-x')).toBeNull()

    const id = await client.createRichMenu(payload)
    await client.createAlias('tab-x', id)
    expect(await client.getAlias('tab-x')).toBe(id)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/line/read-state.test.ts tools/line-mock/tests/read-state.test.ts
```

คาดว่าล้มด้วย TypeScript/runtime error: `endpoints.defaultRichMenu is not a function` และ `client.getDefault is not a function`

- [ ] **Step 3: เพิ่ม `LineNotFoundError`**

`packages/core/src/errors.ts` — เพิ่มต่อจาก `LineValidationError`
```ts
/**
 * LINE ตอบ 404 — สำหรับ `getDefault` / `getAlias` นี่คือ "ยังไม่มี" ซึ่งเป็นคำตอบที่ถูกต้อง
 * ไม่ใช่ความผิดพลาด แยกออกจาก `LineValidationError` เพราะ compensation (Task 10) ต้องแยก
 * "ไม่มีของให้คืน" ออกจาก "payload ผิด" ให้ได้ ไม่งั้นจะคืนสถานะผิดหรือกลืน error จริงทิ้ง
 */
export class LineNotFoundError extends CoreError {
  readonly code = 'line_not_found'
}
```

- [ ] **Step 4: เพิ่ม endpoint และสองเมธอดใน client**

`packages/core/src/line/endpoints.ts` — เพิ่มคีย์ในอ็อบเจกต์ `endpoints` ต่อจาก `clearDefault`
```ts
  // URL เดียวกับ clearDefault ต่างกันแค่ method (GET อ่าน · DELETE ล้าง)
  // ประกาศแยกชื่อเพราะจุดเรียกอ่านง่ายกว่า `endpoints.clearDefault(base)` ที่ตามด้วย method: 'GET'
  defaultRichMenu: (base: string) => `${base}/v2/bot/user/all/richmenu`,
```

`packages/core/src/line/client.ts`
1. เพิ่ม `LineNotFoundError` เข้า import จาก `../errors.js`
2. ใน `#toError` เพิ่มบรรทัดนี้ **ก่อน** บล็อกที่แปลง 4xx อื่น ๆ เป็น `LineValidationError`
```ts
    // 404 มีความหมายเฉพาะ — "ยังไม่มีของชิ้นนี้" ซึ่ง getDefault/getAlias ถือเป็นคำตอบ
    // ถ้าเหมารวมเป็น LineValidationError จะแยกไม่ออกจาก payload ผิด
    if (res.status === 404) return new LineNotFoundError('LINE ไม่พบทรัพยากรที่ขอ')
```
3. เพิ่มสองเมธอดสาธารณะ ต่อจาก `clearDefault`
```ts
  /** `null` = ยังไม่เคยตั้ง default บน channel นี้ */
  async getDefault(): Promise<string | null> {
    return this.#readRichMenuId(endpoints.defaultRichMenu(this.#base))
  }

  /** `null` = ยังไม่มี alias ชื่อนี้ */
  async getAlias(aliasId: string): Promise<string | null> {
    return this.#readRichMenuId(endpoints.aliasById(this.#base, aliasId))
  }

  async #readRichMenuId(url: string): Promise<string | null> {
    try {
      const res = await this.#send({ method: 'GET', url })
      const json = (await res.json()) as { richMenuId?: string }
      return json.richMenuId ?? null
    } catch (error) {
      if (error instanceof LineNotFoundError) return null
      throw error
    }
  }
```

- [ ] **Step 5: เพิ่มสอง route ใน line-mock**

`tools/line-mock/src/server.ts` — เพิ่ม **ก่อน** `app.post('/v2/bot/user/all/richmenu/:id', ...)`
```ts
  app.get('/v2/bot/user/all/richmenu', async (_req, reply) => {
    if (store.defaultMenuId === null) return reply.code(404).send({ message: 'no default richmenu' })
    return reply.send({ richMenuId: store.defaultMenuId })
  })
```
และเพิ่ม **ก่อน** `app.get('/v2/bot/richmenu/alias/list', ...)`
```ts
  app.get('/v2/bot/richmenu/alias/:aliasId', async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    const richMenuId = store.aliases.get(aliasId)
    if (richMenuId === undefined) return reply.code(404).send({ message: 'alias not found' })
    return reply.send({ richMenuAliasId: aliasId, richMenuId })
  })
```

หมายเหตุ: router ของ fastify เลือก segment คงที่ก่อน parameter เสมอ `/v2/bot/richmenu/alias/:aliasId` จึงไม่ชนกับ `/v2/bot/richmenu/:id` ที่มีอยู่แล้ว — โครงเดียวกันกับ `/v2/bot/richmenu/alias/list` ที่อยู่ร่วมกันได้อยู่ก่อนหน้านี้

- [ ] **Step 6: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/line tools/line-mock
pnpm typecheck
```

ทั้ง `retry.test.ts` และ `client.test.ts` เดิมต้องยังเขียวโดยไม่แก้อะไร — ถ้าแดง แปลว่าบรรทัด 404 ถูกวางผิดที่ใน `#toError`

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/errors.ts packages/core/src/line packages/core/tests/line/read-state.test.ts \
        tools/line-mock/src/server.ts tools/line-mock/tests/read-state.test.ts
git commit -m "feat(core): read the current default menu and alias target from LINE"
```

---

## Task 10: `server/compensation.ts` + `server/publish.ts` — capture ก่อนแตะ คืนสิ่งที่ capture ไว้

**Files:**
- Create: `packages/core/src/server/compensation.ts`, `packages/core/src/server/publish.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่มสองบรรทัด), `packages/core/tests/publish/machine.test.ts` (แก้ชื่อ property test เดิมให้ตรงกับสิ่งที่มันพิสูจน์จริง)
- Test: `packages/core/tests/server/compensation.test.ts`, `packages/core/tests/server/publish.test.ts`

**Interfaces:**
- Consumes: `plan`, `compensate`, `Step` จาก `../publish/machine.js` (Plan 01) · `LineClient` จาก `../line/client.js` · `LineNotFoundError` จาก `../errors.js` (Task 9) · `buildPayload`, `publishedAliasesOf` จาก `./payload.js` (Task 8) · `ImageStore` จาก `./images.js` (Task 7) · `AuditWriter`, `errorCodeOf` จาก `./audit.js` (Task 5) · `RateLimiter` จาก `./rate-limit.js` (Task 6) · `LoggerLike` จาก `./scrub.js` (Task 3) · `MenuNotFoundError`, `MenuNotReadyError` จาก `./errors.js` (Task 1) · `Repo`, `RichMenuRow`, `MenuStatus` จาก `./types.js` (Task 1)
- Produces:
  - `interface PriorState { defaultRichMenuId: string | null; aliasTarget: string | null }`
  - `interface LineReader { getDefault(): Promise<string | null>; getAlias(aliasId: string): Promise<string | null> }`
  - `interface LineRestorer { setDefault(id: string): Promise<void>; clearDefault(): Promise<void>; updateAlias(aliasId: string, id: string): Promise<void>; deleteAlias(aliasId: string): Promise<void> }`
  - `function capturePriorState(client: LineReader, input: { aliasId: string | null; willSetDefault: boolean }): Promise<PriorState>`
  - `function restorePriorState(client: LineRestorer, prior: PriorState, input: { aliasId: string | null; completed: readonly Step[] }, logger: LoggerLike): Promise<void>`
  - `interface PublishDeps { client: LineClient; menus: Repo<RichMenuRow>; audit: AuditWriter; limiter: RateLimiter; store: ImageStore; logger: LoggerLike; now(): Date }`
  - `interface PublishRequest { menuId: string; actorId: string | null; setAsDefault: boolean }`
  - `interface PublishOutcome { lineRichMenuId: string; status: MenuStatus }`
  - `function publishMenu(deps: PublishDeps, request: PublishRequest): Promise<PublishOutcome>`

carry-forward เปิดข้อนี้ค้างไว้: `upsertAlias` สำเร็จแล้ว `setDefault` ล้ม → `compensate` ลบเมนูที่เพิ่งสร้าง แต่ alias ยังชี้ไป id ที่ถูกลบไปแล้ว design notes ข้อ 2 ปิดด้วยการ **อ่านสถานะเดิมก่อนแตะ แล้วคืนกลับให้ตรงกับที่อ่านมา** ไม่ใช่การสลับลำดับ (สลับลำดับย้ายปัญหาไปที่ default ซึ่งแย่กว่า) property test เดิมพิสูจน์แค่ "ไม่มีเมนูกำพร้า" — task นี้เพิ่มตัวที่พิสูจน์ "ไม่มีสถานะกำพร้า"

- [ ] **Step 1: เขียน test ของ `compensation.ts` ที่ต้องล้มเหลว**

`packages/core/tests/server/compensation.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import type { Step } from '../../src/publish/machine.js'
import { capturePriorState, restorePriorState } from '../../src/server/compensation.js'

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function restorer() {
  return {
    setDefault: vi.fn(async () => {}),
    clearDefault: vi.fn(async () => {}),
    updateAlias: vi.fn(async () => {}),
    deleteAlias: vi.fn(async () => {}),
  }
}

describe('capturePriorState', () => {
  it('อ่าน default ก็ต่อเมื่อจะไปตั้ง default และอ่าน alias ก็ต่อเมื่อมี alias', async () => {
    const client = {
      getDefault: vi.fn(async () => 'richmenu-old'),
      getAlias: vi.fn(async () => 'richmenu-aliased'),
    }
    expect(await capturePriorState(client, { aliasId: null, willSetDefault: false }))
      .toEqual({ defaultRichMenuId: null, aliasTarget: null })
    expect(client.getDefault).not.toHaveBeenCalled()
    expect(client.getAlias).not.toHaveBeenCalled()

    expect(await capturePriorState(client, { aliasId: 'tab-a', willSetDefault: true }))
      .toEqual({ defaultRichMenuId: 'richmenu-old', aliasTarget: 'richmenu-aliased' })
    expect(client.getAlias).toHaveBeenCalledWith('tab-a')
  })
})

describe('restorePriorState', () => {
  const completedAll: Step[] = [
    { kind: 'validate' }, { kind: 'create' }, { kind: 'uploadImage' },
    { kind: 'upsertAlias', aliasId: 'tab-a' }, { kind: 'setDefault' },
  ]

  it('alias ที่เราสร้างขึ้นใหม่เอง ต้องถูกลบทิ้ง ไม่ใช่ปล่อยชี้ไปเมนูที่กำลังจะถูกลบ', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: null, aliasTarget: null },
      { aliasId: 'tab-a', completed: completedAll }, silent)
    expect(client.deleteAlias).toHaveBeenCalledWith('tab-a')
    expect(client.updateAlias).not.toHaveBeenCalled()
  })

  it('alias ที่มีอยู่ก่อน ต้องถูกชี้กลับไปที่ปลายทางเดิม', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: null, aliasTarget: 'richmenu-previous' },
      { aliasId: 'tab-a', completed: completedAll }, silent)
    expect(client.updateAlias).toHaveBeenCalledWith('tab-a', 'richmenu-previous')
    expect(client.deleteAlias).not.toHaveBeenCalled()
  })

  it('default ที่มีอยู่ก่อน ต้องถูกตั้งกลับ', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: 'richmenu-old', aliasTarget: null },
      { aliasId: null, completed: completedAll }, silent)
    expect(client.setDefault).toHaveBeenCalledWith('richmenu-old')
    expect(client.clearDefault).not.toHaveBeenCalled()
  })

  it('ไม่เคยมี default มาก่อน ต้องล้างทิ้ง ไม่ใช่ปล่อยให้ชี้เมนูที่กำลังจะถูกลบ', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: null, aliasTarget: null },
      { aliasId: null, completed: completedAll }, silent)
    expect(client.clearDefault).toHaveBeenCalled()
  })

  it('ไม่แตะอะไรเลยถ้ายังไม่ทันทำขั้นที่เปลี่ยนสถานะ', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: 'richmenu-old', aliasTarget: 'x' },
      { aliasId: 'tab-a', completed: [{ kind: 'validate' }, { kind: 'create' }] }, silent)
    expect(client.setDefault).not.toHaveBeenCalled()
    expect(client.clearDefault).not.toHaveBeenCalled()
    expect(client.updateAlias).not.toHaveBeenCalled()
    expect(client.deleteAlias).not.toHaveBeenCalled()
  })

  it('การคืนค่าที่ล้มเองต้องถูก log แล้วไปต่อ ไม่ใช่หยุดครึ่งทาง', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const client = restorer()
    client.setDefault.mockRejectedValueOnce(new Error('LINE ล่ม'))

    await restorePriorState(client, { defaultRichMenuId: 'richmenu-old', aliasTarget: 'richmenu-previous' },
      { aliasId: 'tab-a', completed: completedAll }, logger)

    expect(logger.error).toHaveBeenCalled()
    expect(client.updateAlias).toHaveBeenCalledWith('tab-a', 'richmenu-previous')
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/compensation.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/compensation.js"`

- [ ] **Step 3: เขียน `server/compensation.ts`**

`packages/core/src/server/compensation.ts`
```ts
import type { Step } from '../publish/machine.js'
import type { LoggerLike } from './scrub.js'

export interface PriorState {
  /** เมนูที่เป็น default ของ channel อยู่ก่อนหน้า — `null` = ยังไม่เคยตั้ง */
  defaultRichMenuId: string | null
  /** ปลายทางของ alias ก่อนหน้า — `null` = alias นี้ยังไม่เคยมี */
  aliasTarget: string | null
}

export interface LineReader {
  getDefault(): Promise<string | null>
  getAlias(aliasId: string): Promise<string | null>
}

export interface LineRestorer {
  setDefault(richMenuId: string): Promise<void>
  clearDefault(): Promise<void>
  updateAlias(aliasId: string, richMenuId: string): Promise<void>
  deleteAlias(aliasId: string): Promise<void>
}

/**
 * อ่านเฉพาะสิ่งที่กำลังจะไปแตะ — ไม่ใช่ทุกอย่างเสมอ
 * การเรียก `getDefault()` ทุกครั้งที่ publish ทั้งที่ไม่ได้จะตั้ง default คือหนึ่ง round trip
 * ต่อการ publish ที่ไม่ได้ใช้ และเป็นอีกหนึ่งจุดที่ล้มได้โดยไม่มีเหตุผล
 */
export async function capturePriorState(
  client: LineReader,
  input: { aliasId: string | null; willSetDefault: boolean },
): Promise<PriorState> {
  return {
    defaultRichMenuId: input.willSetDefault ? await client.getDefault() : null,
    aliasTarget: input.aliasId === null ? null : await client.getAlias(input.aliasId),
  }
}

/**
 * คืนสถานะให้ตรงกับที่ `capturePriorState` อ่านไว้ ก่อนที่ผู้เรียกจะลบเมนูที่เพิ่งสร้าง
 *
 * ทำไมไม่แก้ด้วยการสลับลำดับขั้นแทน: ถ้าเลื่อน `upsertAlias` ไปท้ายสุด `setDefault` จะกลายเป็น
 * ขั้นที่สำเร็จก่อนแล้วมีขั้นหลังล้ม → LINE เหลือ default ที่ชี้เมนูที่กำลังจะถูกลบ ซึ่งแย่กว่า
 * alias ค้าง เพราะผู้ใช้ปลายทางเห็นผลทันที
 *
 * แต่ละขั้นถูกห่อ try/catch แยกกัน — การคืน default ที่ล้มต้องไม่ทำให้ alias ไม่ถูกคืนตามไปด้วย
 * และไม่ว่ากรณีใด error ของการคืนค่าต้องไม่กลบ error จริงที่ทำให้ต้องมาคืนค่าตั้งแต่แรก
 */
export async function restorePriorState(
  client: LineRestorer,
  prior: PriorState,
  input: { aliasId: string | null; completed: readonly Step[] },
  logger: LoggerLike,
): Promise<void> {
  const did = (kind: Step['kind']) => input.completed.some((step) => step.kind === kind)

  async function attempt(what: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
    } catch (error) {
      logger.error(`line-rich-menu: failed to restore ${what} during compensation`, { error })
    }
  }

  if (did('setDefault')) {
    await attempt('default rich menu', async () => {
      if (prior.defaultRichMenuId === null) await client.clearDefault()
      else await client.setDefault(prior.defaultRichMenuId)
    })
  }

  if (did('upsertAlias') && input.aliasId !== null) {
    const aliasId = input.aliasId
    await attempt(`alias ${aliasId}`, async () => {
      if (prior.aliasTarget === null) await client.deleteAlias(aliasId)
      else await client.updateAlias(aliasId, prior.aliasTarget)
    })
  }
}
```

- [ ] **Step 4: เขียน test ของ `publish.ts` ที่ต้องล้มเหลว**

`packages/core/tests/server/publish.test.ts`
```ts
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { LineNotFoundError, LineServerError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import { PublishRateLimitedError } from '../../src/server/errors.js'
import { createRateLimiter } from '../../src/server/rate-limit.js'
import { publishMenu } from '../../src/server/publish.js'
import type { ImageStore } from '../../src/server/images.js'
import type { AuditRow, Repo, RichMenuRow } from '../../src/server/types.js'

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function menuRow(overrides: Partial<RichMenuRow> = {}): RichMenuRow {
  return {
    id: '1', name: 'เมนูหลัก', channelId: '10', size: 'large',
    chatBarText: 'เปิดเมนู', chatBarMode: 'custom', selected: true,
    templateKey: 'RICH_MENU_TEMPLATE_201',
    areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
    imageFileId: 11, areaImages: [],
    normalizedFileId: 900, normalizedMime: 'image/jpeg',
    normalizedSize: { width: 2500, height: 1686 },
    aliasId: null, status: 'draft', lineRichMenuId: null, publishedAt: null, lastError: null,
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

function menuRepo(seed: RichMenuRow[]): Repo<RichMenuRow> & { rows: RichMenuRow[] } {
  const rows = [...seed]
  return {
    rows,
    async findMany(params) {
      const filters = params?.filters ?? {}
      return rows.filter((row) => Object.entries(filters).every(
        ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
      ))
    },
    async findOne(id) { return rows.find((row) => row.id === id) ?? null },
    async create(data) { const row = { id: '99', ...data } as RichMenuRow; rows.push(row); return row },
    async update(id, data) {
      const index = rows.findIndex((row) => row.id === id)
      rows[index] = { ...rows[index]!, ...data }
      return rows[index]!
    },
    async delete() {},
  }
}

function auditRepo(): Repo<AuditRow> & { rows: AuditRow[] } {
  const rows: AuditRow[] = []
  return {
    rows,
    async findMany() { return rows },
    async findOne() { return null },
    async create(data) { const row = { id: String(rows.length + 1), ...data } as AuditRow; rows.push(row); return row },
    async update() { throw new Error('append-only') },
    async delete() { throw new Error('append-only') },
  }
}

/** LINE จำลองที่จำสถานะจริง เพื่อให้ assert ได้ว่า compensation คืนสถานะครบ */
function fakeLine(initial: { defaultId?: string | null; aliases?: Record<string, string> } = {}) {
  const calls: string[] = []
  const state = {
    menus: new Set<string>(initial.defaultId ? [initial.defaultId] : []),
    aliases: new Map<string, string>(Object.entries(initial.aliases ?? {})),
    defaultId: initial.defaultId ?? null,
  }
  let counter = 0
  const failures = new Map<string, Error>()
  return {
    calls, state, failAt: (call: string, error: Error) => failures.set(call, error),
    client: {
      async validateRichMenu() { calls.push('validate'); const f = failures.get('validate'); if (f) throw f },
      async createRichMenu() {
        calls.push('create')
        const f = failures.get('create'); if (f) throw f
        const id = `richmenu-new-${++counter}`
        state.menus.add(id)
        return id
      },
      async uploadContent() { calls.push('upload'); const f = failures.get('upload'); if (f) throw f },
      async createAlias(aliasId: string, richMenuId: string) {
        calls.push('createAlias')
        const f = failures.get('createAlias'); if (f) throw f
        state.aliases.set(aliasId, richMenuId)
      },
      async updateAlias(aliasId: string, richMenuId: string) {
        calls.push('updateAlias')
        const f = failures.get('updateAlias'); if (f) throw f
        state.aliases.set(aliasId, richMenuId)
      },
      async deleteAlias(aliasId: string) { calls.push('deleteAlias'); state.aliases.delete(aliasId) },
      async setDefault(id: string) {
        calls.push('setDefault')
        const f = failures.get('setDefault'); if (f) throw f
        state.defaultId = id
      },
      async clearDefault() { calls.push('clearDefault'); state.defaultId = null },
      async deleteRichMenu(id: string) {
        calls.push('deleteRichMenu')
        const f = failures.get('deleteRichMenu'); if (f) throw f
        state.menus.delete(id)
      },
      async getDefault() { return state.defaultId },
      async getAlias(aliasId: string) { return state.aliases.get(aliasId) ?? null },
    },
  }
}

function imageStore(): ImageStore & { write: ReturnType<typeof vi.fn> } {
  return {
    async read() { return Buffer.from('normalized-bytes') },
    write: vi.fn(async () => ({ id: 0 })),
  }
}

function deps(line: ReturnType<typeof fakeLine>, menus: Repo<RichMenuRow>, audit = auditRepo()) {
  return {
    audit,
    deps: {
      client: line.client as never,
      menus,
      audit: createAuditWriter({ repo: audit, logger: silent }),
      limiter: createRateLimiter({ capacity: 10, refillPerMinute: 60 }),
      store: imageStore(),
      logger: silent,
      now: () => new Date('2026-08-21T00:00:00.000Z'),
    },
  }
}

describe('publishMenu — เส้นทางที่สำเร็จ', () => {
  it('ยิงตามลำดับของ plan() เป๊ะ', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow({ aliasId: 'tab-a' })])
    const { deps: d } = deps(line, menus)

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })

    expect(line.calls).toEqual(['validate', 'create', 'upload', 'createAlias', 'setDefault'])
  })

  it('เขียน lineRichMenuId ลง DB ทันทีที่ create สำเร็จ ก่อนอัปรูป', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow()])
    const seenAtUpload: (string | null)[] = []
    const original = line.client.uploadContent
    line.client.uploadContent = async () => {
      seenAtUpload.push(menus.rows[0]!.lineRichMenuId)
      await original()
    }
    const { deps: d } = deps(line, menus)

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })

    expect(seenAtUpload).toEqual(['richmenu-new-1'])
  })

  it('ลบเมนูเวอร์ชันก่อนหน้าเป็นขั้นสุดท้าย และทน 404 ได้', async () => {
    const line = fakeLine()
    line.failAt('deleteRichMenu', new LineNotFoundError('gone'))
    const menus = menuRepo([menuRow({ lineRichMenuId: 'richmenu-old' })])
    const { deps: d } = deps(line, menus)

    const outcome = await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })

    expect(outcome.status).toBe('published')
    expect(menus.rows[0]!.status).toBe('published')
    expect(menus.rows[0]!.publishedAt).toBe('2026-08-21T00:00:00.000Z')
  })

  it('ไม่เรียก sharp เลย — publish อ่านรูปที่ normalize ไว้แล้วอย่างเดียว', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow()])
    const { deps: d } = deps(line, menus)

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })

    expect((d.store as { write: ReturnType<typeof vi.fn> }).write).not.toHaveBeenCalled()
  })

  it('เขียนแถว audit ที่สำเร็จ พร้อม before/after', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow()])
    const { deps: d, audit } = deps(line, menus)

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })

    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0]!.result).toBe('success')
    expect(audit.rows[0]!.action).toBe('publish')
    expect(audit.rows[0]!.actorId).toBe('3')
    expect(audit.rows[0]!.before).toMatchObject({ status: 'draft' })
    expect(audit.rows[0]!.after).toMatchObject({ status: 'published', lineRichMenuId: 'richmenu-new-1' })
  })
})

describe('publishMenu — เส้นทางที่ล้ม', () => {
  it('อัปรูปล้ม → ลบเมนูที่เพิ่งสร้าง สถานะเป็น failed และมีแถว audit ที่ล้ม', async () => {
    const line = fakeLine()
    line.failAt('upload', new LineServerError(500))
    const menus = menuRepo([menuRow()])
    const { deps: d, audit } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false }))
      .rejects.toBeInstanceOf(LineServerError)

    expect(line.state.menus.size).toBe(0)
    expect(menus.rows[0]!.status).toBe('failed')
    expect(menus.rows[0]!.lastError).toBe('line_server_error')
    expect(menus.rows[0]!.lineRichMenuId).toBeNull()
    expect(audit.rows[0]!.result).toBe('failure')
    expect(audit.rows[0]!.errorCode).toBe('line_server_error')
  })

  it('alias ถูกสร้างใหม่แล้ว setDefault ล้ม → alias ต้องหายไป ไม่ใช่ชี้เมนูที่ถูกลบ', async () => {
    const line = fakeLine()
    line.failAt('setDefault', new LineServerError(500))
    const menus = menuRepo([menuRow({ aliasId: 'tab-a' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    expect(line.state.aliases.has('tab-a')).toBe(false)
    expect(line.state.menus.size).toBe(0)
  })

  it('alias ที่มีอยู่ก่อน ถูกชี้กลับไปที่ปลายทางเดิม', async () => {
    const line = fakeLine({ aliases: { 'tab-a': 'richmenu-previous' } })
    line.failAt('setDefault', new LineServerError(500))
    const menus = menuRepo([menuRow({ aliasId: 'tab-a' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    expect(line.state.aliases.get('tab-a')).toBe('richmenu-previous')
  })

  it('default ที่มีอยู่ก่อน ถูกตั้งกลับหลัง deleteOld ล้ม', async () => {
    const line = fakeLine({ defaultId: 'richmenu-old' })
    line.failAt('deleteRichMenu', new LineServerError(500))
    const menus = menuRepo([menuRow({ lineRichMenuId: 'richmenu-old' })])
    const { deps: d } = deps(line, menus)

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: true })).rejects.toThrow()

    expect(line.state.defaultId).toBe('richmenu-old')
  })

  it('ถูก rate limit → ไม่แตะ LINE เลย และไม่สร้างแถว audit', async () => {
    const line = fakeLine()
    const menus = menuRepo([menuRow()])
    const { deps: d, audit } = deps(line, menus)
    d.limiter = createRateLimiter({ capacity: 1, refillPerMinute: 1 })

    await publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false })
    line.calls.length = 0
    audit.rows.length = 0

    await expect(publishMenu(d, { menuId: '1', actorId: '3', setAsDefault: false }))
      .rejects.toBeInstanceOf(PublishRateLimitedError)

    expect(line.calls).toEqual([])
    expect(audit.rows).toEqual([])
  })
})

describe('property: ล้มที่ขั้นไหนก็ไม่ทิ้งสถานะกำพร้าไว้บน LINE', () => {
  it('default และ alias กลับไปเท่ากับก่อนเริ่มเสมอ และไม่มีเมนูใหม่ค้าง', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hadDefault: fc.boolean(),
          hadAlias: fc.boolean(),
          useAlias: fc.boolean(),
          setAsDefault: fc.boolean(),
          failStep: fc.constantFrom('validate', 'create', 'upload', 'createAlias', 'updateAlias', 'setDefault'),
        }),
        async (scenario) => {
          const line = fakeLine({
            defaultId: scenario.hadDefault ? 'richmenu-old' : null,
            aliases: scenario.hadAlias ? { 'tab-a': 'richmenu-previous' } : {},
          })
          const before = {
            defaultId: line.state.defaultId,
            aliases: [...line.state.aliases.entries()].sort(),
            menus: [...line.state.menus].sort(),
          }
          line.failAt(scenario.failStep, new LineServerError(500))

          const menus = menuRepo([menuRow({ aliasId: scenario.useAlias ? 'tab-a' : null })])
          const { deps: d } = deps(line, menus)

          await publishMenu(d, { menuId: '1', actorId: null, setAsDefault: scenario.setAsDefault })
            .catch(() => undefined)

          expect({
            defaultId: line.state.defaultId,
            aliases: [...line.state.aliases.entries()].sort(),
            menus: [...line.state.menus].sort(),
          }).toEqual(before)
        },
      ),
      { numRuns: 200 },
    )
  })
})
```

- [ ] **Step 5: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/publish.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/publish.js"`

- [ ] **Step 6: เขียน `server/publish.ts`**

`packages/core/src/server/publish.ts`
```ts
import { LineNotFoundError } from '../errors.js'
import type { LineClient } from '../line/client.js'
import { compensate, plan } from '../publish/machine.js'
import type { Step } from '../publish/machine.js'
import { errorCodeOf, type AuditWriter } from './audit.js'
import { capturePriorState, restorePriorState } from './compensation.js'
import { MenuNotFoundError, MenuNotReadyError } from './errors.js'
import type { ImageStore } from './images.js'
import { buildPayload, publishedAliasesOf } from './payload.js'
import type { RateLimiter } from './rate-limit.js'
import type { LoggerLike } from './scrub.js'
import type { MenuStatus, Repo, RichMenuRow } from './types.js'

export interface PublishDeps {
  client: LineClient
  menus: Repo<RichMenuRow>
  audit: AuditWriter
  limiter: RateLimiter
  store: ImageStore
  logger: LoggerLike
  now(): Date
}

export interface PublishRequest {
  menuId: string
  actorId: string | null
  setAsDefault: boolean
}

export interface PublishOutcome {
  lineRichMenuId: string
  status: MenuStatus
}

/** ฟิลด์ที่ผู้ตรวจอยากรู้ว่า "จากอะไรเป็นอะไร" — ไม่ใช่ทั้งแถวซึ่งมี areas ยาวเป็นหน้า */
function snapshotOf(menu: RichMenuRow) {
  return {
    status: menu.status,
    lineRichMenuId: menu.lineRichMenuId,
    aliasId: menu.aliasId,
    publishedAt: menu.publishedAt,
  }
}

export async function publishMenu(deps: PublishDeps, request: PublishRequest): Promise<PublishOutcome> {
  const { client, menus, audit, limiter, store, logger, now } = deps

  const menu = await menus.findOne(request.menuId)
  if (menu === null) throw new MenuNotFoundError(`rich menu ${request.menuId} does not exist`)
  if (menu.normalizedFileId === null || menu.normalizedMime === null) {
    throw new MenuNotReadyError('no_image')
  }

  // rate limit อยู่ **นอก** audit.around โดยตั้งใจ — คำขอที่ถูกปฏิเสธตรงนี้ไม่ได้แตะ LINE เลย
  // สเปก §13.2 ข้อ 8 บังคับให้ "ทุก action ที่แตะ LINE" มีแถว audit ซึ่งไม่รวมเคสนี้
  // และการปล่อยให้กดรัวสร้างแถว audit ได้ คือการเปิดทางให้ถมตาราง audit ด้วยคลิกเดียว
  // FLAG สำหรับผู้รีวิว: ถ้าอยากได้หลักฐานว่ามีคนพยายามกดรัว ต้องเก็บที่ log ไม่ใช่ที่ audit
  limiter.take(menu.channelId)

  const siblings = await menus.findMany({ filters: { channelId: menu.channelId } })
  const payload = buildPayload(menu, publishedAliasesOf(siblings))
  const image = await store.read(menu.normalizedFileId)
  const mime = menu.normalizedMime

  return audit.around(
    {
      actorId: request.actorId,
      action: 'publish',
      richMenuId: menu.id,
      channelId: menu.channelId,
      before: snapshotOf(menu),
    },
    async () => {
      await menus.update(menu.id, { status: 'publishing', lastError: null })

      const steps = plan({
        ...(menu.aliasId === null ? {} : { aliasId: menu.aliasId }),
        setAsDefault: request.setAsDefault,
        ...(menu.lineRichMenuId === null ? {} : { previousLineRichMenuId: menu.lineRichMenuId }),
      })

      // อ่านก่อนแตะ — ต้องเกิดก่อน step แรกที่เปลี่ยนอะไรบน LINE (design notes ข้อ 2)
      const prior = await capturePriorState(client, {
        aliasId: menu.aliasId,
        willSetDefault: request.setAsDefault,
      })

      const completed: Step[] = []
      let createdId: string | null = null

      try {
        for (const step of steps) {
          switch (step.kind) {
            case 'validate':
              await client.validateRichMenu(payload)
              break
            case 'create':
              createdId = await client.createRichMenu(payload)
              // เขียนทันทีก่อนขั้นถัดไป (สเปก §8 ข้อ 2) — process ตายตรงนี้แล้วยังมี id
              // ให้ reconcile job เก็บกวาดได้ ถ้ารอเขียนตอนจบ เมนูจะกลายเป็นขยะที่ไม่มีใครรู้จัก
              await menus.update(menu.id, { lineRichMenuId: createdId })
              break
            case 'uploadImage':
              await client.uploadContent(createdId!, image, mime)
              break
            case 'upsertAlias':
              if (prior.aliasTarget === null) await client.createAlias(step.aliasId, createdId!)
              else await client.updateAlias(step.aliasId, createdId!)
              break
            case 'setDefault':
              await client.setDefault(createdId!)
              break
            case 'deleteOld':
              // เมนูเก่าที่หายไปแล้ว (ลบจาก LINE OA Manager หรือ publish รอบก่อนลบไปแล้ว)
              // ไม่ใช่เหตุให้ publish รอบนี้ล้ม — ผลลัพธ์ที่ต้องการคือ "เมนูเก่าไม่อยู่" ซึ่งเป็นจริงแล้ว
              await client.deleteRichMenu(step.lineRichMenuId).catch((error: unknown) => {
                if (!(error instanceof LineNotFoundError)) throw error
              })
              break
          }
          completed.push(step)
        }
      } catch (error) {
        await restorePriorState(client, prior, { aliasId: menu.aliasId, completed }, logger)

        for (const action of compensate(completed)) {
          if (action.kind === 'deleteCreated' && createdId !== null) {
            await client.deleteRichMenu(createdId).catch((deleteError: unknown) => {
              logger.error('line-rich-menu: failed to delete the menu created during a failed publish', {
                createdId, error: deleteError,
              })
            })
          }
        }

        await menus.update(menu.id, {
          status: 'failed',
          lastError: errorCodeOf(error),
          // เคลียร์ id ทิ้งเพราะเมนูตัวนั้นถูกลบไปแล้วในบรรทัดข้างบน — ถ้าปล่อยไว้
          // publish รอบหน้าจะพยายาม deleteOld id ที่ไม่มีอยู่จริง
          lineRichMenuId: null,
        })
        throw error
      }

      await menus.update(menu.id, {
        status: 'published',
        publishedAt: now().toISOString(),
        lastError: null,
      })
      return { lineRichMenuId: createdId!, status: 'published' as const }
    },
    (outcome) => ({ status: outcome.status, lineRichMenuId: outcome.lineRichMenuId }),
  )
}
```

`packages/core/src/server/index.ts` — เพิ่มต่อท้าย
```ts
export * from './compensation.js'
export * from './publish.js'
```

- [ ] **Step 7: แก้ชื่อ property test เดิมให้ตรงกับสิ่งที่มันพิสูจน์จริง**

`packages/core/tests/publish/machine.test.ts` — เปลี่ยนบรรทัดชื่อเทสต์ (บรรทัดที่ขึ้นต้นด้วย `it('property: ทุกจุดที่ล้มกลางทาง`) เป็น
```ts
  // ครอบเฉพาะ "เมนูกำพร้า" เท่านั้น — machine.ts เป็นฟังก์ชันบริสุทธิ์ที่ไม่รู้ว่า alias หรือ default
  // เคยมีค่าอะไรอยู่ก่อน จึงพิสูจน์เรื่องสถานะไม่ได้โดยหลักการ ตัวที่พิสูจน์เรื่องนั้นคือ
  // property test ใน tests/server/publish.test.ts ซึ่งมี LINE จำลองที่จำสถานะจริง
  it('property: ล้มกลางทางที่จุดไหนก็ต้องไม่ทิ้ง *เมนู* กำพร้าไว้บน LINE', () => {
```

- [ ] **Step 8: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server packages/core/tests/publish
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/server packages/core/tests/server packages/core/tests/publish/machine.test.ts
git commit -m "feat(core): restore the default menu and alias that publishing replaced when it fails"
```

---

## Task 11: `server/menu-ops.ts` — set-default · clear-default · swap-alias · reconcile

**Files:**
- Create: `packages/core/src/server/menu-ops.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่ม `export * from './menu-ops.js'`)
- Test: `packages/core/tests/server/menu-ops.test.ts`

**Interfaces:**
- Consumes: `AuditWriter` จาก `./audit.js` (Task 5) · `MenuNotFoundError`, `MenuNotReadyError` จาก `./errors.js` (Task 1) · `Repo`, `RichMenuRow` จาก `./types.js` (Task 1) · `LineClient` จาก `../line/client.js`
- Produces:
  - `interface MenuOpsDeps { client: LineClient; menus: Repo<RichMenuRow>; audit: AuditWriter }`
  - `function setMenuAsDefault(deps: MenuOpsDeps, input: { menuId: string; actorId: string | null }): Promise<void>`
  - `function clearChannelDefault(deps: MenuOpsDeps, input: { channelId: string; actorId: string | null }): Promise<void>`
  - `function swapMenuAlias(deps: MenuOpsDeps, input: { menuId: string; actorId: string | null }): Promise<void>`
  - `interface ReconcileReport { orphans: string[]; missing: string[] }`
  - `function reconcileChannel(deps: MenuOpsDeps, input: { channelId: string }): Promise<ReconcileReport>`

สามตัวแรกคือ op ที่ทั้ง route (Task 16) และ scheduler (Task 12) เรียกใช้ร่วมกัน จึงต้องอยู่ที่เดียว ไม่ใช่เขียนซ้ำสองที่แล้วมี audit ไม่เหมือนกัน ส่วน `reconcileChannel` คือข้อ 3 ของสเปก §8 — **รายงานอย่างเดียว ไม่ลบให้อัตโนมัติ** เพราะเมนูที่ไม่รู้จักอาจถูกสร้างจาก LINE OA Manager โดยตรง

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/server/menu-ops.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { LineServerError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import { MenuNotReadyError } from '../../src/server/errors.js'
import {
  clearChannelDefault, reconcileChannel, setMenuAsDefault, swapMenuAlias,
} from '../../src/server/menu-ops.js'
import type { AuditRow, Repo, RichMenuRow } from '../../src/server/types.js'

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function menuRow(overrides: Partial<RichMenuRow> = {}): RichMenuRow {
  return {
    id: '1', name: 'เมนูหลัก', channelId: '10', size: 'large',
    chatBarText: 'เปิดเมนู', chatBarMode: 'custom', selected: true,
    templateKey: null, areas: [],
    imageFileId: null, areaImages: [],
    normalizedFileId: 900, normalizedMime: 'image/jpeg', normalizedSize: { width: 2500, height: 1686 },
    aliasId: null, status: 'published', lineRichMenuId: 'richmenu-a',
    publishedAt: '2026-08-20T00:00:00.000Z', lastError: null,
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

function repos(seed: RichMenuRow[]) {
  const rows = [...seed]
  const auditRows: AuditRow[] = []
  const menus: Repo<RichMenuRow> = {
    async findMany(params) {
      const filters = params?.filters ?? {}
      return rows.filter((row) => Object.entries(filters).every(
        ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
      ))
    },
    async findOne(id) { return rows.find((row) => row.id === id) ?? null },
    async create(data) { const row = { id: '99', ...data } as RichMenuRow; rows.push(row); return row },
    async update(id, data) {
      const index = rows.findIndex((row) => row.id === id)
      rows[index] = { ...rows[index]!, ...data }
      return rows[index]!
    },
    async delete() {},
  }
  const audit: Repo<AuditRow> = {
    async findMany() { return auditRows },
    async findOne() { return null },
    async create(data) { const row = { id: String(auditRows.length + 1), ...data } as AuditRow; auditRows.push(row); return row },
    async update() { throw new Error('append-only') },
    async delete() { throw new Error('append-only') },
  }
  return { rows, auditRows, menus, audit: createAuditWriter({ repo: audit, logger: silent }) }
}

function client(overrides: Record<string, unknown> = {}) {
  return {
    setDefault: vi.fn(async () => {}),
    clearDefault: vi.fn(async () => {}),
    getDefault: vi.fn(async () => null as string | null),
    getAlias: vi.fn(async () => null as string | null),
    createAlias: vi.fn(async () => {}),
    updateAlias: vi.fn(async () => {}),
    listRichMenus: vi.fn(async () => [] as { richMenuId: string }[]),
    ...overrides,
  } as never
}

describe('setMenuAsDefault', () => {
  it('ตั้ง default บน LINE แล้วเขียน audit ที่บอกว่าจากอะไรเป็นอะไร', async () => {
    const { menus, audit, auditRows } = repos([menuRow()])
    const line = client({ getDefault: vi.fn(async () => 'richmenu-old') })

    await setMenuAsDefault({ client: line, menus, audit }, { menuId: '1', actorId: '3' })

    expect((line as unknown as { setDefault: ReturnType<typeof vi.fn> }).setDefault)
      .toHaveBeenCalledWith('richmenu-a')
    expect(auditRows[0]).toMatchObject({
      action: 'set-default', result: 'success', actorId: '3', channelId: '10',
      before: { defaultRichMenuId: 'richmenu-old' },
      after: { defaultRichMenuId: 'richmenu-a' },
    })
  })

  it('เมนูที่ยังไม่ publish ตั้ง default ไม่ได้', async () => {
    const { menus, audit } = repos([menuRow({ status: 'draft', lineRichMenuId: null })])
    await expect(setMenuAsDefault({ client: client(), menus, audit }, { menuId: '1', actorId: null }))
      .rejects.toBeInstanceOf(MenuNotReadyError)
  })

  it('LINE ล้ม → ยังมีแถว audit ที่บอกว่าล้มด้วย code อะไร', async () => {
    const { menus, audit, auditRows } = repos([menuRow()])
    const line = client({ setDefault: vi.fn(async () => { throw new LineServerError(503) }) })

    await expect(setMenuAsDefault({ client: line, menus, audit }, { menuId: '1', actorId: '3' }))
      .rejects.toBeInstanceOf(LineServerError)

    expect(auditRows[0]).toMatchObject({ action: 'set-default', result: 'failure', errorCode: 'line_server_error' })
  })
})

describe('clearChannelDefault', () => {
  it('ล้าง default แล้วเขียน audit', async () => {
    const { menus, audit, auditRows } = repos([menuRow()])
    const line = client({ getDefault: vi.fn(async () => 'richmenu-a') })

    await clearChannelDefault({ client: line, menus, audit }, { channelId: '10', actorId: '3' })

    expect((line as unknown as { clearDefault: ReturnType<typeof vi.fn> }).clearDefault).toHaveBeenCalled()
    expect(auditRows[0]).toMatchObject({
      action: 'clear-default', result: 'success', richMenuId: null, channelId: '10',
      before: { defaultRichMenuId: 'richmenu-a' }, after: { defaultRichMenuId: null },
    })
  })
})

describe('swapMenuAlias', () => {
  it('ยังไม่มี alias นั้นบน LINE → สร้างใหม่', async () => {
    const { menus, audit } = repos([menuRow({ aliasId: 'tab-a' })])
    const line = client()
    await swapMenuAlias({ client: line, menus, audit }, { menuId: '1', actorId: '3' })
    expect((line as unknown as { createAlias: ReturnType<typeof vi.fn> }).createAlias)
      .toHaveBeenCalledWith('tab-a', 'richmenu-a')
  })

  it('มี alias อยู่แล้ว → ชี้ใหม่ ไม่ใช่สร้างซ้ำ', async () => {
    const { menus, audit, auditRows } = repos([menuRow({ aliasId: 'tab-a' })])
    const line = client({ getAlias: vi.fn(async () => 'richmenu-previous') })

    await swapMenuAlias({ client: line, menus, audit }, { menuId: '1', actorId: '3' })

    expect((line as unknown as { updateAlias: ReturnType<typeof vi.fn> }).updateAlias)
      .toHaveBeenCalledWith('tab-a', 'richmenu-a')
    expect(auditRows[0]).toMatchObject({
      action: 'swap-alias',
      before: { aliasId: 'tab-a', richMenuId: 'richmenu-previous' },
      after: { aliasId: 'tab-a', richMenuId: 'richmenu-a' },
    })
  })

  it('เมนูที่ไม่มี alias สลับไม่ได้', async () => {
    const { menus, audit } = repos([menuRow({ aliasId: null })])
    await expect(swapMenuAlias({ client: client(), menus, audit }, { menuId: '1', actorId: null }))
      .rejects.toBeInstanceOf(MenuNotReadyError)
  })
})

describe('reconcileChannel', () => {
  it('รายงานเมนูบน LINE ที่ไม่มีใน DB และเมนูใน DB ที่หายไปจาก LINE — ไม่ลบอะไรเลย', async () => {
    const { menus, audit } = repos([
      menuRow({ id: '1', lineRichMenuId: 'richmenu-a' }),
      menuRow({ id: '2', lineRichMenuId: 'richmenu-gone' }),
    ])
    const line = client({
      listRichMenus: vi.fn(async () => [{ richMenuId: 'richmenu-a' }, { richMenuId: 'richmenu-stray' }]),
    })

    const report = await reconcileChannel({ client: line, menus, audit }, { channelId: '10' })

    expect(report).toEqual({ orphans: ['richmenu-stray'], missing: ['richmenu-gone'] })
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/menu-ops.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/menu-ops.js"`

- [ ] **Step 3: เขียน `server/menu-ops.ts`**

`packages/core/src/server/menu-ops.ts`
```ts
import type { LineClient } from '../line/client.js'
import type { AuditWriter } from './audit.js'
import { MenuNotFoundError, MenuNotReadyError } from './errors.js'
import type { Repo, RichMenuRow } from './types.js'

export interface MenuOpsDeps {
  client: LineClient
  menus: Repo<RichMenuRow>
  audit: AuditWriter
}

async function publishedMenuOrThrow(menus: Repo<RichMenuRow>, menuId: string): Promise<RichMenuRow> {
  const menu = await menus.findOne(menuId)
  if (menu === null) throw new MenuNotFoundError(`rich menu ${menuId} does not exist`)
  // ตั้ง default ให้เมนูที่ยังไม่เคยขึ้น LINE ไม่ได้ — id ที่จะส่งไปยังไม่มีอยู่จริง
  if (menu.status !== 'published' || menu.lineRichMenuId === null) {
    throw new MenuNotReadyError('not_published')
  }
  return menu
}

export async function setMenuAsDefault(
  deps: MenuOpsDeps,
  input: { menuId: string; actorId: string | null },
): Promise<void> {
  const menu = await publishedMenuOrThrow(deps.menus, input.menuId)
  const previous = await deps.client.getDefault()

  await deps.audit.around(
    {
      actorId: input.actorId,
      action: 'set-default',
      richMenuId: menu.id,
      channelId: menu.channelId,
      before: { defaultRichMenuId: previous },
    },
    async () => { await deps.client.setDefault(menu.lineRichMenuId!) },
    () => ({ defaultRichMenuId: menu.lineRichMenuId }),
  )
}

export async function clearChannelDefault(
  deps: MenuOpsDeps,
  input: { channelId: string; actorId: string | null },
): Promise<void> {
  const previous = await deps.client.getDefault()

  await deps.audit.around(
    {
      actorId: input.actorId,
      action: 'clear-default',
      // ไม่ผูกกับเมนูตัวใดตัวหนึ่ง — การล้าง default เป็นการกระทำระดับ channel
      richMenuId: null,
      channelId: input.channelId,
      before: { defaultRichMenuId: previous },
    },
    async () => { await deps.client.clearDefault() },
    () => ({ defaultRichMenuId: null }),
  )
}

export async function swapMenuAlias(
  deps: MenuOpsDeps,
  input: { menuId: string; actorId: string | null },
): Promise<void> {
  const menu = await publishedMenuOrThrow(deps.menus, input.menuId)
  if (menu.aliasId === null) throw new MenuNotReadyError('not_published')

  const aliasId = menu.aliasId
  const target = menu.lineRichMenuId!
  const previous = await deps.client.getAlias(aliasId)

  await deps.audit.around(
    {
      actorId: input.actorId,
      action: 'swap-alias',
      richMenuId: menu.id,
      channelId: menu.channelId,
      before: { aliasId, richMenuId: previous },
    },
    async () => {
      // POST /richmenu/alias สร้างใหม่ ส่วน POST /richmenu/alias/{id} ชี้ใหม่ — คนละ endpoint
      // การเรียกผิดตัวได้ 400 กลับมา จึงต้องอ่านก่อนว่ามีอยู่แล้วหรือยัง
      if (previous === null) await deps.client.createAlias(aliasId, target)
      else await deps.client.updateAlias(aliasId, target)
    },
    () => ({ aliasId, richMenuId: target }),
  )
}

export interface ReconcileReport {
  /** อยู่บน LINE แต่ไม่มีแถวไหนใน DB อ้างถึง */
  orphans: string[]
  /** DB บอกว่า published แต่ LINE ไม่มีแล้ว */
  missing: string[]
}

/**
 * สเปก §8 ข้อ 3 — **รายงานอย่างเดียว ไม่ลบให้** เพราะเมนูที่ไม่รู้จักอาจถูกสร้างจาก
 * LINE OA Manager โดยตรงหรือจากระบบอื่นของลูกค้า การลบอัตโนมัติคือการทำลายของคนอื่น
 */
export async function reconcileChannel(
  deps: MenuOpsDeps,
  input: { channelId: string },
): Promise<ReconcileReport> {
  const onLine = new Set((await deps.client.listRichMenus()).map((menu) => menu.richMenuId))
  const rows = await deps.menus.findMany({ filters: { channelId: input.channelId } })
  const known = new Set(rows.map((row) => row.lineRichMenuId).filter((id): id is string => id !== null))

  return {
    orphans: [...onLine].filter((id) => !known.has(id)).sort(),
    missing: rows
      .filter((row) => row.status === 'published' && row.lineRichMenuId !== null && !onLine.has(row.lineRichMenuId))
      .map((row) => row.lineRichMenuId!)
      .sort(),
  }
}
```

`packages/core/src/server/index.ts` — เพิ่มต่อท้าย
```ts
export * from './menu-ops.js'
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server/menu-ops.test.ts
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server packages/core/tests/server/menu-ops.test.ts
git commit -m "feat(core): add the default, alias, and reconcile operations with audit rows"
```

---

## Task 12: `server/lock.ts` + `server/scheduler.ts` — conditional UPDATE ด้วย binding ล้วน

**Files:**
- Create: `packages/core/src/server/lock.ts`, `packages/core/src/server/scheduler.ts`
- Modify: `packages/core/src/server/index.ts` (เพิ่มสองบรรทัด)
- Test: `packages/core/tests/server/lock.test.ts`, `packages/core/tests/server/scheduler.test.ts`

**Interfaces:**
- Consumes: `MenuOpsDeps`, `setMenuAsDefault`, `clearChannelDefault`, `swapMenuAlias` จาก `./menu-ops.js` (Task 11) · `errorCodeOf` จาก `./audit.js` (Task 5) · `LoggerLike` จาก `./scrub.js` (Task 3) · `Repo`, `ScheduleRow`, `ScheduleOp` จาก `./types.js` (Task 1) · `MenuNotFoundError` จาก `./errors.js` (Task 1)
- Produces:
  - `interface KnexWhereBuilder { whereNull(column: string): KnexWhereBuilder; orWhere(column: string, operator: string, value: unknown): KnexWhereBuilder }`
  - `interface KnexQueryBuilder { where(column: string, value: unknown): KnexQueryBuilder; whereIn(column: string, values: readonly unknown[]): KnexQueryBuilder; andWhere(group: (builder: KnexWhereBuilder) => void): KnexQueryBuilder; update(data: Record<string, unknown>): Promise<number> }`
  - `type KnexLike = (table: string) => KnexQueryBuilder`
  - `interface ScheduleLockColumns { id: string; state: string; lockedBy: string; lockedAt: string; lastError: string }`
  - `const DEFAULT_SCHEDULE_TABLE = 'rich_menu_schedules'`
  - `interface ScheduleLock { claim(scheduleId: string, owner: string): Promise<boolean>; release(scheduleId: string, owner: string, state: 'done' | 'failed', lastError: string | null): Promise<void> }`
  - `function createScheduleLock(knex: KnexLike, options: { table?: string; ttlMs: number; now?: () => Date; columns?: Partial<ScheduleLockColumns> }): ScheduleLock`
  - `interface TickReport { due: number; claimed: number; done: number; failed: number }`
  - `function createScheduler(deps: { schedules: Repo<ScheduleRow>; lock: ScheduleLock; ops: MenuOpsDeps; logger: LoggerLike; now(): Date; owner: string; batchSize?: number }): { tick(): Promise<TickReport> }`

**คำตัดสินสามข้อที่ต่างจาก SQL ตัวอย่างในสเปก §10 และเหตุผล**

1. **ใช้ query builder ไม่ใช่ `knex.raw`** — builder ผูกค่าเป็น binding โดยโครงสร้าง ไม่ใช่โดยวินัย ซึ่งทำให้ข้อบังคับ "binding เท่านั้น" ของ §11.3 พิสูจน์ได้ด้วย type: interface ที่ประกาศไว้ข้างบน **ไม่มีเมธอด `raw` ให้เรียก**
2. **คำนวณเส้นตาย TTL ใน JavaScript ไม่ใช่ `NOW() - INTERVAL '5 minutes'`** — `INTERVAL` เป็นไวยากรณ์ของ Postgres และ acceptance gate ของแผนนี้รันบน sqlite การส่ง `Date` เป็น binding ทำงานเหมือนกันทุก dialect
3. **claim ตั้ง `state = 'running'` ไปด้วยในคำสั่งเดียว และเงื่อนไขรับทั้ง `pending` และ `running`** — สเปกเขียนแค่ `locked_by`/`locked_at` แต่ §7.1 มี state `running` อยู่จริง การไม่ใช้มันทำให้ไม่มีทางรู้ว่างานกำลังทำอยู่ ส่วนการรับ `running` เข้ามาด้วย (คู่กับเงื่อนไข lock หมดอายุ) คือสิ่งที่ทำให้ worker ที่ตายกลางทางถูกเก็บกวาดได้ ยังเป็น UPDATE ที่มีเงื่อนไขคำสั่งเดียวเหมือนเดิม

**หมายเหตุ:** lock อยู่ใน `core` ไม่ใช่ใน adapter เพราะ `strapi.db.connection` เป็น knex เหมือนกันทั้ง 4.25 และ 5 (สเปก §2.1) — เขียนที่นี่ครั้งเดียวแล้ว Plan 04 ส่ง connection เข้ามาเฉย ๆ

- [ ] **Step 1: เขียน test ของ lock ที่ต้องล้มเหลว**

`packages/core/tests/server/lock.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE_TABLE, createScheduleLock } from '../../src/server/lock.js'
import type { KnexLike, KnexQueryBuilder, KnexWhereBuilder } from '../../src/server/lock.js'

interface Recorded { method: string; args: unknown[] }

function recordingKnex(affected: number) {
  const tables: string[] = []
  const calls: Recorded[] = []
  const knex: KnexLike = (table) => {
    tables.push(table)
    const group: KnexWhereBuilder = {
      whereNull(column) { calls.push({ method: 'whereNull', args: [column] }); return group },
      orWhere(column, operator, value) { calls.push({ method: 'orWhere', args: [column, operator, value] }); return group },
    }
    const builder: KnexQueryBuilder = {
      where(column, value) { calls.push({ method: 'where', args: [column, value] }); return builder },
      whereIn(column, values) { calls.push({ method: 'whereIn', args: [column, values] }); return builder },
      andWhere(fn) { calls.push({ method: 'andWhere', args: [] }); fn(group); return builder },
      async update(data) { calls.push({ method: 'update', args: [data] }); return affected },
    }
    return builder
  }
  return { knex, tables, calls }
}

const now = () => new Date('2026-08-21T12:00:00.000Z')

describe('createScheduleLock.claim', () => {
  it('แย่ง lock สำเร็จเมื่อ UPDATE โดน 1 แถว', async () => {
    const { knex } = recordingKnex(1)
    expect(await createScheduleLock(knex, { ttlMs: 300_000, now }).claim('7', 'worker-a')).toBe(true)
  })

  it('ไม่ได้ lock เมื่อ UPDATE ไม่โดนแถวไหนเลย', async () => {
    const { knex } = recordingKnex(0)
    expect(await createScheduleLock(knex, { ttlMs: 300_000, now }).claim('7', 'worker-a')).toBe(false)
  })

  it('ยิงคำสั่งเดียวไปที่ตารางที่ถูกต้อง พร้อมเงื่อนไขครบทั้งสี่ข้อ', async () => {
    const { knex, tables, calls } = recordingKnex(1)
    await createScheduleLock(knex, { ttlMs: 300_000, now }).claim('7', 'worker-a')

    expect(tables).toEqual([DEFAULT_SCHEDULE_TABLE])
    expect(calls.filter((c) => c.method === 'update')).toHaveLength(1)
    expect(calls).toContainEqual({ method: 'where', args: ['id', '7'] })
    expect(calls).toContainEqual({ method: 'whereIn', args: ['state', ['pending', 'running']] })
    expect(calls).toContainEqual({ method: 'whereNull', args: ['locked_by'] })
    expect(calls).toContainEqual({
      method: 'orWhere', args: ['locked_at', '<', new Date('2026-08-21T11:55:00.000Z')],
    })
    expect(calls.at(-1)).toEqual({
      method: 'update',
      args: [{ locked_by: 'worker-a', locked_at: now(), state: 'running' }],
    })
  })

  it('ค่าทุกตัวถูกส่งเป็น binding — ไม่มีคอลัมน์ไหนที่ประกอบมาจากสตริง', async () => {
    const { knex, calls } = recordingKnex(1)
    await createScheduleLock(knex, { ttlMs: 300_000, now }).claim("7'; DROP TABLE x;--", "owner' OR 1=1")

    const columns = calls
      .filter((c) => c.method === 'where' || c.method === 'whereIn' || c.method === 'whereNull' || c.method === 'orWhere')
      .map((c) => c.args[0])
    // ชื่อคอลัมน์ต้องมาจากตารางค่าคงที่เท่านั้น ค่าที่ผู้ใช้ควบคุมได้ไปอยู่ในตำแหน่ง binding
    expect(columns).toEqual(['id', 'state', 'locked_by', 'locked_at'])
    expect(calls).toContainEqual({ method: 'where', args: ['id', "7'; DROP TABLE x;--"] })
  })

  it('เปลี่ยนชื่อตารางและคอลัมน์ได้ เผื่อ naming strategy ของ Strapi ต่างจากที่คาด', async () => {
    const { knex, tables, calls } = recordingKnex(1)
    await createScheduleLock(knex, {
      ttlMs: 1000, now, table: 'custom_schedules', columns: { lockedBy: 'lockedBy', lockedAt: 'lockedAt' },
    }).claim('7', 'worker-a')

    expect(tables).toEqual(['custom_schedules'])
    expect(calls).toContainEqual({ method: 'whereNull', args: ['lockedBy'] })
  })
})

describe('createScheduleLock.release', () => {
  it('ปลดล็อกเฉพาะแถวที่ตัวเองถืออยู่ และเขียนผลลัพธ์ลงไปพร้อมกัน', async () => {
    const { knex, calls } = recordingKnex(1)
    await createScheduleLock(knex, { ttlMs: 1000, now }).release('7', 'worker-a', 'failed', 'line_auth_failed')

    expect(calls).toContainEqual({ method: 'where', args: ['id', '7'] })
    expect(calls).toContainEqual({ method: 'where', args: ['locked_by', 'worker-a'] })
    expect(calls.at(-1)).toEqual({
      method: 'update',
      args: [{ state: 'failed', last_error: 'line_auth_failed', locked_by: null }],
    })
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/lock.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/lock.js"`

- [ ] **Step 3: เขียน `server/lock.ts`**

`packages/core/src/server/lock.ts`
```ts
/**
 * type ขั้นต่ำของ knex ที่ lock ตัวนี้ใช้จริง — ประกาศเองแทนการ `import type { Knex } from 'knex'`
 * เพราะ `core` ต้องไม่มี dependency ที่ผูกกับ Strapi หรือกับ ORM ตัวใดตัวหนึ่ง
 *
 * สังเกตว่า **ไม่มี `raw`** อยู่ใน interface นี้ — สเปก §11.3 บังคับว่าทุก query ต้องใช้ binding
 * เท่านั้น "ห้าม string interpolation แม้แต่ใน lock query" การไม่ประกาศ `raw` ทำให้กฎข้อนั้น
 * บังคับได้ตอนคอมไพล์ ไม่ใช่ตอนรีวิว
 */
export interface KnexWhereBuilder {
  whereNull(column: string): KnexWhereBuilder
  orWhere(column: string, operator: string, value: unknown): KnexWhereBuilder
}

export interface KnexQueryBuilder {
  where(column: string, value: unknown): KnexQueryBuilder
  whereIn(column: string, values: readonly unknown[]): KnexQueryBuilder
  andWhere(group: (builder: KnexWhereBuilder) => void): KnexQueryBuilder
  /** คืนจำนวนแถวที่ถูกแก้ — เท่ากันทุก dialect ที่ Strapi รองรับ */
  update(data: Record<string, unknown>): Promise<number>
}

export type KnexLike = (table: string) => KnexQueryBuilder

export interface ScheduleLockColumns {
  id: string
  state: string
  lockedBy: string
  lockedAt: string
  lastError: string
}

/** ต้องตรงกับ `collectionName` ของ content type `rich-menu-schedule` (Task 14) */
export const DEFAULT_SCHEDULE_TABLE = 'rich_menu_schedules'

const DEFAULT_COLUMNS: ScheduleLockColumns = {
  id: 'id', state: 'state', lockedBy: 'locked_by', lockedAt: 'locked_at', lastError: 'last_error',
}

export interface ScheduleLock {
  claim(scheduleId: string, owner: string): Promise<boolean>
  release(scheduleId: string, owner: string, state: 'done' | 'failed', lastError: string | null): Promise<void>
}

export function createScheduleLock(
  knex: KnexLike,
  options: { table?: string; ttlMs: number; now?: () => Date; columns?: Partial<ScheduleLockColumns> },
): ScheduleLock {
  const table = options.table ?? DEFAULT_SCHEDULE_TABLE
  const now = options.now ?? (() => new Date())
  const column = { ...DEFAULT_COLUMNS, ...options.columns }

  return {
    async claim(scheduleId, owner) {
      const at = now()
      // เส้นตายคำนวณใน JS ไม่ใช่ `NOW() - INTERVAL '5 minutes'` ตามตัวอย่างในสเปก §10 —
      // `INTERVAL` เป็นไวยากรณ์ของ Postgres และ acceptance gate ของแผนนี้รันบน sqlite
      // ส่ง Date เข้าไปเป็น binding แทน ทำงานเหมือนกันทุก dialect ที่ Strapi รองรับ
      const cutoff = new Date(at.getTime() - options.ttlMs)

      const affected = await knex(table)
        .where(column.id, scheduleId)
        .whereIn(column.state, ['pending', 'running'])
        .andWhere((builder) => { builder.whereNull(column.lockedBy).orWhere(column.lockedAt, '<', cutoff) })
        .update({ [column.lockedBy]: owner, [column.lockedAt]: at, [column.state]: 'running' })

      // === 1 ไม่ใช่ > 0 — ถ้าโดนมากกว่าหนึ่งแถวแปลว่าเงื่อนไขกว้างเกินไป ซึ่งเป็นบั๊ก
      // ที่ต้องไม่ถูกตีความว่า "ได้ lock แล้ว" (สเปก §10: "ตรวจ affected rows = 1")
      return affected === 1
    },

    async release(scheduleId, owner, state, lastError) {
      // `where lockedBy = owner` กันไม่ให้ worker ที่ถูกแย่ง lock ไปแล้วมาเขียนทับผลของคนที่ถืออยู่
      await knex(table)
        .where(column.id, scheduleId)
        .where(column.lockedBy, owner)
        .update({ [column.state]: state, [column.lastError]: lastError, [column.lockedBy]: null })
    },
  }
}
```

- [ ] **Step 4: เขียน test ของ scheduler ที่ต้องล้มเหลว**

`packages/core/tests/server/scheduler.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { LineServerError } from '../../src/errors.js'
import { createAuditWriter } from '../../src/server/audit.js'
import { createScheduler } from '../../src/server/scheduler.js'
import type { AuditRow, Repo, RichMenuRow, ScheduleRow } from '../../src/server/types.js'

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const NOW = new Date('2026-08-21T12:00:00.000Z')

function scheduleRow(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 's1', richMenuId: '1', runAt: '2026-08-21T11:00:00.000Z', op: 'set-default',
    state: 'pending', lockedBy: null, lockedAt: null, lastError: null,
    ...overrides,
  }
}

function menuRow(overrides: Partial<RichMenuRow> = {}): RichMenuRow {
  return {
    id: '1', name: 'เมนูหลัก', channelId: '10', size: 'large',
    chatBarText: 'x', chatBarMode: 'custom', selected: true, templateKey: null, areas: [],
    imageFileId: null, areaImages: [],
    normalizedFileId: 900, normalizedMime: 'image/jpeg', normalizedSize: { width: 2500, height: 1686 },
    aliasId: 'tab-a', status: 'published', lineRichMenuId: 'richmenu-a',
    publishedAt: null, lastError: null, updatedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

function listRepo<T extends { id: string; state?: string }>(rows: T[]): Repo<T> {
  return {
    async findMany(params) {
      const filters = params?.filters ?? {}
      return rows.filter((row) => Object.entries(filters).every(
        ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
      ))
    },
    async findOne(id) { return rows.find((row) => row.id === id) ?? null },
    async create(data) { const row = { id: 'new', ...data } as T; rows.push(row); return row },
    async update(id, data) {
      const index = rows.findIndex((row) => row.id === id)
      rows[index] = { ...rows[index]!, ...data }
      return rows[index]!
    },
    async delete() {},
  }
}

function harness(schedules: ScheduleRow[], menus: RichMenuRow[], claim = async () => true) {
  const auditRows: AuditRow[] = []
  const lock = { claim: vi.fn(claim), release: vi.fn(async () => {}) }
  const line = {
    setDefault: vi.fn(async () => {}),
    clearDefault: vi.fn(async () => {}),
    getDefault: vi.fn(async () => null as string | null),
    getAlias: vi.fn(async () => null as string | null),
    createAlias: vi.fn(async () => {}),
    updateAlias: vi.fn(async () => {}),
    listRichMenus: vi.fn(async () => []),
  }
  const auditRepo: Repo<AuditRow> = {
    async findMany() { return auditRows },
    async findOne() { return null },
    async create(data) { const row = { id: String(auditRows.length + 1), ...data } as AuditRow; auditRows.push(row); return row },
    async update() { throw new Error('append-only') },
    async delete() { throw new Error('append-only') },
  }
  const scheduler = createScheduler({
    schedules: listRepo(schedules),
    lock,
    ops: {
      client: line as never,
      menus: listRepo(menus),
      audit: createAuditWriter({ repo: auditRepo, logger: silent }),
    },
    logger: silent,
    now: () => NOW,
    owner: 'worker-a',
  })
  return { scheduler, lock, line, auditRows }
}

describe('tick', () => {
  it('ทำเฉพาะงานที่ถึงเวลาแล้ว', async () => {
    const { scheduler, lock } = harness(
      [scheduleRow({ id: 's1' }), scheduleRow({ id: 's2', runAt: '2026-08-21T13:00:00.000Z' })],
      [menuRow()],
    )
    const report = await scheduler.tick()
    expect(report.due).toBe(1)
    expect(lock.claim).toHaveBeenCalledTimes(1)
    expect(lock.claim).toHaveBeenCalledWith('s1', 'worker-a')
  })

  it('แย่ง lock ไม่ได้ = ข้ามไป ไม่ใช่ทำซ้ำ', async () => {
    const { scheduler, line } = harness([scheduleRow()], [menuRow()], async () => false)
    const report = await scheduler.tick()
    expect(report.claimed).toBe(0)
    expect(line.setDefault).not.toHaveBeenCalled()
  })

  it('รวมแถวที่ค้างสถานะ running เข้ามาด้วย — worker ที่ตายกลางทางต้องถูกเก็บกวาด', async () => {
    const { scheduler, lock } = harness(
      [scheduleRow({ id: 's-stuck', state: 'running', lockedBy: 'worker-dead', lockedAt: '2026-08-21T11:00:00.000Z' })],
      [menuRow()],
    )
    await scheduler.tick()
    expect(lock.claim).toHaveBeenCalledWith('s-stuck', 'worker-a')
  })

  it('เลือก op ให้ถูกตัว', async () => {
    const { scheduler, line } = harness(
      [
        scheduleRow({ id: 's1', op: 'set-default' }),
        scheduleRow({ id: 's2', op: 'clear-default' }),
        scheduleRow({ id: 's3', op: 'swap-alias' }),
      ],
      [menuRow()],
    )
    await scheduler.tick()
    expect(line.setDefault).toHaveBeenCalledWith('richmenu-a')
    expect(line.clearDefault).toHaveBeenCalled()
    expect(line.createAlias).toHaveBeenCalledWith('tab-a', 'richmenu-a')
  })

  it('สำเร็จ → release เป็น done · ล้ม → release เป็น failed พร้อม error code', async () => {
    const { scheduler, lock, line } = harness(
      [scheduleRow({ id: 's1' }), scheduleRow({ id: 's2' })],
      [menuRow()],
    )
    line.setDefault.mockRejectedValueOnce(new LineServerError(503))

    const report = await scheduler.tick()

    expect(lock.release).toHaveBeenCalledWith('s1', 'worker-a', 'failed', 'line_server_error')
    expect(lock.release).toHaveBeenCalledWith('s2', 'worker-a', 'done', null)
    expect(report).toEqual({ due: 2, claimed: 2, done: 1, failed: 1 })
  })

  it('งานที่ล้มไม่หยุดงานที่เหลือในรอบเดียวกัน', async () => {
    const { scheduler, line } = harness(
      [scheduleRow({ id: 's1' }), scheduleRow({ id: 's2' })],
      [menuRow()],
    )
    line.setDefault.mockRejectedValueOnce(new LineServerError(503))
    await scheduler.tick()
    expect(line.setDefault).toHaveBeenCalledTimes(2)
  })

  it('ทุกงานที่รันมีแถว audit — cron ไม่มี actor จึงเป็น null ไม่ใช่ปลอมเป็นใครสักคน', async () => {
    const { scheduler, auditRows } = harness([scheduleRow()], [menuRow()])
    await scheduler.tick()
    expect(auditRows[0]).toMatchObject({ action: 'set-default', actorId: null, result: 'success' })
  })
})
```

- [ ] **Step 5: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/core/tests/server/scheduler.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../../src/server/scheduler.js"`

- [ ] **Step 6: เขียน `server/scheduler.ts`**

`packages/core/src/server/scheduler.ts`
```ts
import { errorCodeOf } from './audit.js'
import { MenuNotFoundError } from './errors.js'
import type { ScheduleLock } from './lock.js'
import { clearChannelDefault, setMenuAsDefault, swapMenuAlias, type MenuOpsDeps } from './menu-ops.js'
import type { LoggerLike } from './scrub.js'
import type { Repo, ScheduleRow } from './types.js'

export interface TickReport {
  due: number
  claimed: number
  done: number
  failed: number
}

export interface SchedulerDeps {
  schedules: Repo<ScheduleRow>
  lock: ScheduleLock
  ops: MenuOpsDeps
  logger: LoggerLike
  now(): Date
  /** ตัวระบุ process ที่จะถูกเขียนลง `lockedBy` — v4 adapter ใช้ `${hostname}:${pid}` */
  owner: string
  batchSize?: number
}

export function createScheduler(deps: SchedulerDeps): { tick(): Promise<TickReport> } {
  const batchSize = deps.batchSize ?? 25

  return {
    async tick(): Promise<TickReport> {
      const at = deps.now().getTime()

      // ดึงทั้ง pending และ running — `running` ที่ค้างจาก worker ที่ตายไปแล้วต้องถูกหยิบซ้ำได้
      // ตัวที่ตัดสินว่าหยิบได้จริงไหมคือเงื่อนไข lock หมดอายุใน `lock.claim` ไม่ใช่ตรงนี้
      // (`ListParams.filters` เทียบเท่ากับอย่างเดียว จึงต้องยิงสองครั้งแล้วรวม ไม่ใช่ IN)
      const candidates = [
        ...await deps.schedules.findMany({ filters: { state: 'pending' } }),
        ...await deps.schedules.findMany({ filters: { state: 'running' } }),
      ]

      const due = candidates
        .filter((row) => Date.parse(row.runAt) <= at)
        .sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt))
        .slice(0, batchSize)

      const report: TickReport = { due: due.length, claimed: 0, done: 0, failed: 0 }

      for (const row of due) {
        if (!await deps.lock.claim(row.id, deps.owner)) continue
        report.claimed += 1

        try {
          await run(row)
          report.done += 1
          await deps.lock.release(row.id, deps.owner, 'done', null)
        } catch (error) {
          report.failed += 1
          // งานหนึ่งที่ล้มต้องไม่หยุดรอบทั้งรอบ — ไม่งั้นตารางเวลาของเมนูอื่นพังตามไปด้วย
          deps.logger.error('line-rich-menu: scheduled operation failed', { scheduleId: row.id, error })
          await deps.lock.release(row.id, deps.owner, 'failed', errorCodeOf(error))
        }
      }

      return report
    },
  }

  async function run(row: ScheduleRow): Promise<void> {
    // cron ไม่มีผู้ใช้ที่กดปุ่ม — actor เป็น null และ content type ต้องยอมให้ null ได้ (Task 14)
    const actorId = null

    switch (row.op) {
      case 'set-default':
        await setMenuAsDefault(deps.ops, { menuId: row.richMenuId, actorId })
        return
      case 'swap-alias':
        await swapMenuAlias(deps.ops, { menuId: row.richMenuId, actorId })
        return
      case 'clear-default': {
        // clear-default เป็น op ระดับ channel แต่ schedule ผูกกับเมนู — ต้องหา channel จากเมนูนั้น
        const menu = await deps.ops.menus.findOne(row.richMenuId)
        if (menu === null) throw new MenuNotFoundError(`rich menu ${row.richMenuId} does not exist`)
        await clearChannelDefault(deps.ops, { channelId: menu.channelId, actorId })
        return
      }
    }
  }
}
```

`packages/core/src/server/index.ts` — เพิ่มต่อท้าย
```ts
export * from './lock.js'
export * from './scheduler.js'
```

- [ ] **Step 7: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/core/tests/server
pnpm test:coverage
pnpm --filter @fosivo/line-rich-menu-core typecheck
```

`pnpm test:coverage` ต้องยังผ่าน gate 90% ทั้ง line และ branch — ถ้าตก ให้เติมเทสต์ของสาขาที่ยังไม่ถูกแตะ **ห้ามลดเกณฑ์**

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/server packages/core/tests/server/lock.test.ts packages/core/tests/server/scheduler.test.ts
git commit -m "feat(core): claim scheduled work with one conditional update using bindings only"
```

---

## Task 13: Scaffold `packages/strapi-v4` + ไฟล์ shim ที่ root

**Files:**
- Create: `packages/strapi-v4/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `strapi-server.js`, `strapi-admin.js`, `src/server/index.ts`, `src/admin/index.tsx`, `src/server/strapi.ts`
- Test: `packages/strapi-v4/tests/package-shape.test.ts`

**Interfaces:**
- Consumes: `ENDPOINTS` จาก `@fosivo/line-rich-menu-ui` (Plan 02) — ใช้ผูกว่า plugin id ตรงกับ path ที่ UI ยิง
- Produces:
  - แพ็กเกจ `strapi-plugin-line-rich-menu-v4` ที่ `pnpm -r build` และ `pnpm test` เห็น
  - `interface StrapiV4` — type ขั้นต่ำของ global `strapi` ที่ adapter ใช้จริง
  - `plugin id = 'line-rich-menu'` ซึ่งทำให้ route มี prefix `/line-rich-menu/...` ตรงกับ `ENDPOINTS`

สเปก §2.1: Strapi 4 หา entry จาก **ไฟล์ `strapi-server.js` / `strapi-admin.js` ที่ root ของ package** ไม่ใช่ `exports` map แบบ v5 และ `@strapi/sdk-plugin` ใช้กับ v4 ไม่ได้ (§3.1) — จึงเป็น tsup + shim สองไฟล์

- [ ] **Step 1: สร้าง package**

`packages/strapi-v4/package.json`
```json
{
  "name": "strapi-plugin-line-rich-menu-v4",
  "version": "0.0.0",
  "description": "LINE rich menu builder for Strapi 4.25.x — a bridge while you migrate to Strapi 5",
  "license": "AGPL-3.0-only",
  "engines": { "node": ">=20.15.0" },
  "main": "./strapi-server.js",
  "files": [
    "dist",
    "strapi-server.js",
    "strapi-admin.js",
    "LICENSE",
    "COMMERCIAL-LICENSE.md"
  ],
  "strapi": {
    "name": "line-rich-menu",
    "displayName": "LINE Rich Menu",
    "description": "Build, schedule and publish LINE rich menus from the Strapi admin panel",
    "kind": "plugin"
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fosivo/line-rich-menu-core": "workspace:*",
    "@fosivo/line-rich-menu-ui": "workspace:*",
    "zod": "^3.23.8"
  },
  "peerDependencies": {
    "@strapi/design-system": "^1.19.0",
    "@strapi/helper-plugin": "^4.25.0",
    "@strapi/icons": "^1.19.0",
    "@strapi/strapi": "^4.25.0",
    "react": "^17.0.0 || ^18.0.0",
    "react-dom": "^17.0.0 || ^18.0.0",
    "react-router-dom": "^5.3.4",
    "styled-components": "^5.3.3"
  }
}
```

**ไม่มีฟิลด์ `"type"` โดยตั้งใจ** — ค่าเริ่มต้นคือ `commonjs` ซึ่งเป็นสิ่งที่ Strapi 4 ต้องการ ไฟล์ shim ถูก `require()` ตรง ๆ ถ้าตั้ง `"type": "module"` เหมือนแพ็กเกจอื่นในเวิร์กสเปซ Strapi จะโหลดปลั๊กอินไม่ขึ้นเลย และ **ไม่มี `postinstall`** ตามสเปก §11.6

`packages/strapi-v4/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": {
      "@fosivo/line-rich-menu-core": ["../core/src/index.ts"],
      "@fosivo/line-rich-menu-core/browser": ["../core/src/browser.ts"],
      "@fosivo/line-rich-menu-ui": ["../ui/src/index.ts"]
    }
  },
  "include": ["src", "tests"]
}
```

`packages/strapi-v4/tsup.config.ts`
```ts
import { defineConfig } from 'tsup'

// สอง config ไม่ใช่หนึ่ง — ฝั่ง server รันบน Node 20 ส่วนฝั่ง admin ถูก webpack 5 ของ Strapi 4
// เอาไปรวมร่างต่อแล้วรันในเบราว์เซอร์ target และ platform จึงต้องคนละค่า
// format เป็น cjs ทั้งคู่เพราะไฟล์ shim ที่ root ใช้ require() ตามที่ Strapi 4 กำหนด (สเปก §2.1)
export default defineConfig([
  {
    name: 'server',
    entry: { 'server/index': 'src/server/index.ts' },
    outDir: 'dist',
    format: ['cjs'],
    platform: 'node',
    target: 'node20',
    clean: true,
    sourcemap: true,
    removeNodeProtocol: false,
    external: ['@strapi/strapi', 'sharp'],
  },
  {
    name: 'admin',
    entry: { 'admin/index': 'src/admin/index.tsx' },
    outDir: 'dist',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
    external: [
      'react', 'react-dom', 'react/jsx-runtime',
      'react-router-dom', 'styled-components',
      '@strapi/design-system', '@strapi/design-system/Icon',
      '@strapi/helper-plugin', '@strapi/icons',
    ],
  },
])
```

`packages/strapi-v4/vitest.config.ts`
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// coverage ตั้งที่ root เท่านั้น (ดู vitest.config.ts ที่ root) ห้ามประกาศซ้ำที่นี่
export default defineConfig({
  test: {
    name: 'strapi-v4',
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@fosivo/line-rich-menu-core/browser': fileURLToPath(new URL('../core/src/browser.ts', import.meta.url)),
      '@fosivo/line-rich-menu-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@fosivo/line-rich-menu-ui': fileURLToPath(new URL('../ui/src/index.ts', import.meta.url)),
    },
  },
})
```

หมายเหตุ: alias ของ `/browser` ต้องอยู่ **ก่อน** ตัวที่ไม่มี subpath — Vite จับคู่ alias แบบสตริงนำหน้าตามลำดับ ถ้าสลับกัน `@fosivo/line-rich-menu-core/browser` จะถูกจับโดยกฎแรกแล้วกลายเป็น `core/src/index.ts/browser`

ติดตั้ง:
```bash
pnpm add -D --filter strapi-plugin-line-rich-menu-v4 \
  @strapi/design-system@^1.19.0 @strapi/helper-plugin@^4.25.0 @strapi/icons@^1.19.0 \
  react@^18.3.1 react-dom@^18.3.1 react-router-dom@^5.3.4 styled-components@^5.3.11 \
  @types/react@^18.3.12 @types/react-dom@^18.3.1 @types/react-router-dom@^5.3.3
cp LICENSE COMMERCIAL-LICENSE.md packages/strapi-v4/
```

- [ ] **Step 2: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v4/tests/package-shape.test.ts`
```ts
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENDPOINTS } from '@fosivo/line-rich-menu-ui'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  type?: string
  main?: string
  files?: string[]
  scripts?: Record<string, string>
  strapi?: { name?: string }
  peerDependencies?: Record<string, string>
}

describe('รูปทรงของแพ็กเกจที่ Strapi 4 ต้องการ', () => {
  it('ไม่ใช่ ES module — Strapi 4 require() ไฟล์ shim ตรง ๆ', () => {
    expect(pkg.type).toBeUndefined()
  })

  it('มีไฟล์ shim ทั้งสองตัวอยู่ที่ root จริง', () => {
    expect(existsSync(`${root}strapi-server.js`)).toBe(true)
    expect(existsSync(`${root}strapi-admin.js`)).toBe(true)
  })

  it('shim แกะ default ออกให้ด้วย — tsup ห่อ CJS ไว้ใต้ .default', () => {
    for (const shim of ['strapi-server.js', 'strapi-admin.js']) {
      const source = readFileSync(`${root}${shim}`, 'utf8')
      expect(source).toContain('.default')
      expect(source).toContain('module.exports')
    }
  })

  it('files ที่จะถูกปล่อยขึ้น npm มีทั้ง dist และ shim', () => {
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'strapi-server.js', 'strapi-admin.js']))
  })
})

describe('ข้อบังคับด้าน supply chain (สเปก §11.6)', () => {
  it('ไม่มี script ที่รันตอนติดตั้ง', () => {
    const forbidden = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']
    expect(forbidden.filter((name) => (pkg.scripts ?? {})[name] !== undefined)).toEqual([])
  })
})

describe('plugin id ผูกกับ path ที่ ui ยิงจริง', () => {
  it('ทุก endpoint ของปลั๊กอินขึ้นต้นด้วยชื่อปลั๊กอิน', () => {
    const id = pkg.strapi?.name
    expect(id).toBe('line-rich-menu')
    const paths = [
      ENDPOINTS.channels, ENDPOINTS.channel('1'), ENDPOINTS.channelTest('1'),
      ENDPOINTS.menus, ENDPOINTS.menu('1'), ENDPOINTS.menuPublish('1'), ENDPOINTS.menuSetDefault('1'),
    ]
    expect(paths.every((path) => path.startsWith(`/${id}/`))).toBe(true)
  })
})

describe('peer range', () => {
  it('ผูกกับ Strapi 4 เท่านั้น — v5 เป็นคนละแพ็กเกจ', () => {
    expect(pkg.peerDependencies?.['@strapi/strapi']).toBe('^4.25.0')
  })
})
```

- [ ] **Step 3: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/strapi-v4
```

คาดว่าล้มด้วย `ENOENT ... packages/strapi-v4/package.json` ถ้ายังไม่ได้ทำ Step 1 หรือล้มที่เคส "มีไฟล์ shim ทั้งสองตัวอยู่ที่ root จริง" ถ้าทำ Step 1 แล้ว

- [ ] **Step 4: เขียนไฟล์ shim และ entry เปล่า**

`packages/strapi-v4/strapi-server.js`
```js
'use strict'

/**
 * Strapi 4 หา entry ของปลั๊กอินจากไฟล์ชื่อนี้ที่ root ของแพ็กเกจ (สเปก §2.1)
 * ไม่ใช่จาก `exports` map แบบ Strapi 5 — ไฟล์นี้จึงต้องเป็น CommonJS จริง ๆ และต้องอยู่ใน `files`
 *
 * `.default ?? mod` เพราะ tsup ปล่อย CJS ที่ห่อ default export ไว้ใต้ `.default` พร้อม
 * `__esModule: true` ส่วน loader ของ Strapi 4 คาดหวังอ็อบเจกต์ปลั๊กอินตรง ๆ
 * การแกะที่นี่ทำให้ฝั่ง TypeScript เขียน `export default` ได้ตามปกติ
 */
const mod = require('./dist/server/index.js')
module.exports = mod.default ?? mod
```

`packages/strapi-v4/strapi-admin.js`
```js
'use strict'

// เหตุผลเดียวกับ strapi-server.js — ดูคอมเมนต์ในไฟล์นั้น
const mod = require('./dist/admin/index.js')
module.exports = mod.default ?? mod
```

`packages/strapi-v4/src/server/strapi.ts`
```ts
/**
 * type ขั้นต่ำของ global `strapi` เท่าที่ adapter นี้ใช้จริง
 *
 * ตั้งใจไม่ `import type { Strapi } from '@strapi/strapi'` ด้วยสองเหตุผล:
 * type ของ v4 กว้างมากและหลายส่วนเป็น `any` อยู่แล้ว จึงไม่ได้ความปลอดภัยเพิ่ม และ
 * Strapi 4 หมดอายุการสนับสนุนไปแล้ว (30 เม.ย. 2026) — ไฟล์ที่ประกาศ shape เองแบบนี้
 * คอมไพล์ผ่านได้ทั้งบน v4 และ v5 ทำให้ตอนลูกค้าย้าย ไม่ต้องเขียนชั้น service ใหม่
 */
export interface StrapiLogger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface StrapiV4 {
  log: StrapiLogger
  config: { get<T>(path: string, defaultValue?: T): T }
  plugin(name: string): { service<T>(name: string): T; contentType(name: string): unknown }
  entityService: {
    findMany(uid: string, params?: unknown): Promise<unknown[]>
    findOne(uid: string, id: number | string, params?: unknown): Promise<unknown>
    create(uid: string, params: { data: unknown }): Promise<unknown>
    update(uid: string, id: number | string, params: { data: unknown }): Promise<unknown>
    delete(uid: string, id: number | string): Promise<unknown>
  }
  db: { connection: unknown }
  admin: { services: { permission: { actionProvider: { registerMany(actions: unknown[]): Promise<void> } } } }
  cron: { add(jobs: Record<string, unknown>): void }
}
```

`packages/strapi-v4/src/server/index.ts` — โครงเปล่าที่ Task 14–18 จะเติมทีละส่วน
```ts
import type { StrapiV4 } from './strapi.js'

export default {
  register(_context: { strapi: StrapiV4 }): void {},
  bootstrap(_context: { strapi: StrapiV4 }): void {},
  config: { default: {}, validator(): void {} },
  contentTypes: {},
  controllers: {},
  routes: {},
  services: {},
}
```

`packages/strapi-v4/src/admin/index.tsx` — โครงเปล่าที่ Task 19 จะเติม
```tsx
export default {
  register(): void {},
  registerTrads(): Promise<unknown[]> { return Promise.resolve([]) },
}
```

- [ ] **Step 5: รัน test ให้ผ่านและ build ได้จริง**

```bash
pnpm install
pnpm vitest run packages/strapi-v4
pnpm --filter strapi-plugin-line-rich-menu-v4 build
node -e "console.log(typeof require('./packages/strapi-v4/strapi-server.js').register)"
```

บรรทัดสุดท้ายต้องพิมพ์ `function` — ถ้าพิมพ์ `undefined` แปลว่า shim ไม่ได้แกะ `.default` ออกมา

- [ ] **Step 6: Commit**

```bash
git add packages/strapi-v4 pnpm-lock.yaml
git commit -m "feat(v4): scaffold the Strapi 4 plugin with its root entry shims"
```

---

## Task 14: content type ทั้งสี่ พร้อมตรึงชื่อตารางและหลบชื่อที่ Strapi จอง

**Files:**
- Create: `packages/strapi-v4/src/server/content-types/line-channel.ts`, `rich-menu.ts`, `rich-menu-schedule.ts`, `rich-menu-audit.ts`, `index.ts`
- Modify: `packages/strapi-v4/src/server/index.ts` (ต่อ `contentTypes`)
- Test: `packages/strapi-v4/tests/content-types.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_SCHEDULE_TABLE` จาก `@fosivo/line-rich-menu-core` (Task 12)
- Produces:
  - `const contentTypes: { 'line-channel': { schema: ContentTypeSchema }; 'rich-menu': ...; 'rich-menu-schedule': ...; 'rich-menu-audit': ... }`
  - uid ที่ชั้นอื่นอ้างถึง: `plugin::line-rich-menu.line-channel`, `.rich-menu`, `.rich-menu-schedule`, `.rich-menu-audit`

**คำตัดสินสามข้อที่ต่างจากสเปก §7.1 / §11.5 และเหตุผล**

1. **`publishedAt` ถูกเปลี่ยนชื่อเป็น `linePublishedAt` ในฐานข้อมูล** — `publishedAt` เป็นชื่อที่ Strapi จองไว้สำหรับ draft & publish ของตัวเอง การประกาศทับทำให้ content type โหลดไม่ขึ้น ชั้น service ยังเห็นฟิลด์ชื่อ `publishedAt` เหมือนเดิม repo (Task 15) แปลงชื่อให้ที่ขอบ
2. **`rich-menu-audit` เก็บ `actorId` / `channelId` / `richMenuId` เป็นเลขจำนวนเต็ม ไม่ใช่ relation** — สเปก §11.5 เขียนไว้เป็น relation แต่ audit เป็น **append-only และต้องอยู่รอดหลังของที่มันอ้างถึงถูกลบ** ซึ่งเป็นตอนที่ประวัติมีค่าที่สุดพอดี relation ที่ cascade ลบตามจะทำลายหลักฐานเงียบ ๆ และ relation ไป `admin::user` ยังเป็นจุดที่ v4 กับ v5 ประกาศไม่เหมือนกัน — เลี่ยงได้ก็เลี่ยง
3. **`aliasId` ไม่ประกาศ `unique: true`** — สเปกต้องการ unique **ต่อ channel** ซึ่ง Strapi 4 ประกาศ composite unique ไม่ได้ การใส่ `unique: true` เดี่ยว ๆ จะห้ามข้าม channel ซึ่งผิดจากที่ต้องการ ข้อบังคับนี้จึงไปอยู่ที่ชั้น validation ของ route (Task 16) แทน

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v4/tests/content-types.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE_TABLE } from '@fosivo/line-rich-menu-core'
import { contentTypes } from '../src/server/content-types/index.js'

const RESERVED = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'publishedAt', 'localizations']

describe('ทุก content type', () => {
  it('มีครบสี่ตัวตามสเปก §7.1', () => {
    expect(Object.keys(contentTypes).sort())
      .toEqual(['line-channel', 'rich-menu', 'rich-menu-audit', 'rich-menu-schedule'])
  })

  it('ตรึงชื่อตารางไว้เอง ไม่ปล่อยให้ Strapi เดา', () => {
    expect(contentTypes['line-channel'].schema.collectionName).toBe('line_channels')
    expect(contentTypes['rich-menu'].schema.collectionName).toBe('rich_menus')
    expect(contentTypes['rich-menu-schedule'].schema.collectionName).toBe(DEFAULT_SCHEDULE_TABLE)
    expect(contentTypes['rich-menu-audit'].schema.collectionName).toBe('rich_menu_audits')
  })

  it('ไม่มีตัวไหนประกาศ attribute ที่ Strapi จองชื่อไว้', () => {
    for (const [name, definition] of Object.entries(contentTypes)) {
      const clashes = Object.keys(definition.schema.attributes).filter((key) => RESERVED.includes(key))
      expect(clashes, `${name} ประกาศทับชื่อที่ Strapi จองไว้`).toEqual([])
    }
  })

  it('ปิด draft & publish ทุกตัว — สถานะของเมนูเป็นเรื่องของ LINE ไม่ใช่ของ Strapi', () => {
    for (const definition of Object.values(contentTypes)) {
      expect(definition.schema.options?.draftAndPublish).toBe(false)
    }
  })
})

describe('line-channel', () => {
  const attributes = contentTypes['line-channel'].schema.attributes

  it('ความลับถูกมาร์กเป็น private ทุกตัว — ชั้นป้องกันที่สองถัดจาก DTO', () => {
    expect(attributes['channelAccessToken']).toMatchObject({ type: 'text', required: true, private: true })
    expect(attributes['channelSecret']).toMatchObject({ type: 'text', private: true })
    expect(attributes['accessTokenLast4']).toMatchObject({ type: 'string', private: true })
  })

  it('channelId ห้ามซ้ำ', () => {
    expect(attributes['channelId']).toMatchObject({ type: 'string', required: true, unique: true })
  })
})

describe('rich-menu', () => {
  const attributes = contentTypes['rich-menu'].schema.attributes

  it('ผูกกับ channel แบบ manyToOne และบังคับให้มี', () => {
    expect(attributes['channel']).toMatchObject({
      type: 'relation', relation: 'manyToOne', target: 'plugin::line-rich-menu.line-channel', required: true,
    })
  })

  it('enumeration ตรงกับ union ในชั้น service เป๊ะ', () => {
    expect(attributes['size']).toMatchObject({ type: 'enumeration', enum: ['large', 'compact'] })
    expect(attributes['chatBarMode']).toMatchObject({ type: 'enumeration', enum: ['default', 'custom'] })
    expect(attributes['status']).toMatchObject({
      type: 'enumeration', enum: ['draft', 'publishing', 'published', 'failed'], default: 'draft',
    })
  })

  it('เวลาที่ publish ขึ้น LINE ใช้ชื่อ linePublishedAt เพราะ publishedAt ถูก Strapi จองไว้', () => {
    expect(attributes['linePublishedAt']).toMatchObject({ type: 'datetime' })
    expect(attributes['publishedAt']).toBeUndefined()
  })

  it('เก็บผลของ normalize ไว้ให้ publish อ่านอย่างเดียว', () => {
    expect(attributes['normalizedImage']).toMatchObject({ type: 'media', multiple: false })
    expect(attributes['normalizedMime']).toMatchObject({ type: 'string' })
    expect(attributes['normalizedWidth']).toMatchObject({ type: 'integer' })
    expect(attributes['normalizedHeight']).toMatchObject({ type: 'integer' })
  })

  it('aliasId ไม่ประกาศ unique เดี่ยว — ข้อบังคับคือ unique ต่อ channel ซึ่ง v4 ทำที่ระดับ schema ไม่ได้', () => {
    expect(attributes['aliasId']).toMatchObject({ type: 'string' })
    expect((attributes['aliasId'] as { unique?: boolean }).unique).toBeUndefined()
  })
})

describe('rich-menu-schedule', () => {
  const attributes = contentTypes['rich-menu-schedule'].schema.attributes

  it('มีคอลัมน์ที่ lock query ต้องใช้ครบ', () => {
    expect(attributes['state']).toMatchObject({
      type: 'enumeration', enum: ['pending', 'running', 'done', 'failed'], default: 'pending',
    })
    expect(attributes['lockedBy']).toMatchObject({ type: 'string' })
    expect(attributes['lockedAt']).toMatchObject({ type: 'datetime' })
    expect(attributes['lastError']).toMatchObject({ type: 'text' })
  })

  it('op ตรงกับ ScheduleOp', () => {
    expect(attributes['op']).toMatchObject({
      type: 'enumeration', enum: ['set-default', 'clear-default', 'swap-alias'], required: true,
    })
  })
})

describe('rich-menu-audit', () => {
  const attributes = contentTypes['rich-menu-audit'].schema.attributes

  it('เก็บผู้กระทำและของที่ถูกกระทำเป็นตัวเลข ไม่ใช่ relation — ประวัติต้องอยู่รอดหลังของถูกลบ', () => {
    expect(attributes['actorId']).toMatchObject({ type: 'integer' })
    expect(attributes['channelId']).toMatchObject({ type: 'integer', required: true })
    expect(attributes['richMenuId']).toMatchObject({ type: 'integer' })
    for (const key of Object.keys(attributes)) {
      expect((attributes[key] as { type: string }).type).not.toBe('relation')
    }
  })

  it('action ครอบทั้งหกอย่างตามสเปก §11.5', () => {
    expect(attributes['action']).toMatchObject({
      type: 'enumeration',
      enum: ['publish', 'set-default', 'clear-default', 'swap-alias', 'delete', 'channel-update'],
      required: true,
    })
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/strapi-v4/tests/content-types.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../src/server/content-types/index.js"`

- [ ] **Step 3: เขียน content type ทั้งสี่**

`packages/strapi-v4/src/server/content-types/line-channel.ts`
```ts
export const lineChannel = {
  schema: {
    kind: 'collectionType' as const,
    collectionName: 'line_channels',
    info: { singularName: 'line-channel', pluralName: 'line-channels', displayName: 'LINE channel' },
    // ปิด draft & publish ทุกตัวในปลั๊กอินนี้ — "สถานะ" ของเมนูหมายถึงสถานะบน LINE
    // การมีสองแนวคิดเรื่อง published ในตารางเดียวกันคือความสับสนที่ไม่ได้อะไรกลับมา
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      name: { type: 'string' as const, required: true },
      channelId: { type: 'string' as const, required: true, unique: true },
      // `private: true` ตัดฟิลด์ออกจาก serializer ของ Strapi เอง — เป็นชั้นที่สองถัดจาก
      // การที่ route ของเราคืน DTO ที่ไม่มีฟิลด์นี้อยู่แล้ว (สเปก §11.2 "ป้องกันหลายชั้น")
      channelAccessToken: { type: 'text' as const, required: true, private: true },
      channelSecret: { type: 'text' as const, private: true },
      accessTokenLast4: { type: 'string' as const, private: true },
      isDefault: { type: 'boolean' as const, default: false },
    },
  },
}
```

`packages/strapi-v4/src/server/content-types/rich-menu.ts`
```ts
export const richMenu = {
  schema: {
    kind: 'collectionType' as const,
    collectionName: 'rich_menus',
    info: { singularName: 'rich-menu', pluralName: 'rich-menus', displayName: 'Rich menu' },
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      name: { type: 'string' as const, required: true, maxLength: 300 },
      channel: {
        type: 'relation' as const,
        relation: 'manyToOne' as const,
        target: 'plugin::line-rich-menu.line-channel',
        required: true,
      },
      size: { type: 'enumeration' as const, enum: ['large', 'compact'], default: 'large', required: true },
      chatBarText: { type: 'string' as const, required: true, maxLength: 14 },
      chatBarMode: { type: 'enumeration' as const, enum: ['default', 'custom'], default: 'default', required: true },
      selected: { type: 'boolean' as const, default: true },
      templateKey: { type: 'string' as const },
      areas: { type: 'json' as const },
      image: { type: 'media' as const, multiple: false, allowedTypes: ['images'] },
      areaImages: { type: 'json' as const },
      // ผลของ normalize ที่ทำไว้ตอน save — publish อ่านอย่างเดียว ไม่เรียก sharp (design notes ข้อ 3)
      normalizedImage: { type: 'media' as const, multiple: false, allowedTypes: ['images'] },
      normalizedMime: { type: 'string' as const },
      normalizedWidth: { type: 'integer' as const },
      normalizedHeight: { type: 'integer' as const },
      // ไม่ประกาศ unique — ข้อบังคับจริงคือ "ไม่ซ้ำภายใน channel เดียวกัน" ซึ่ง Strapi 4
      // ประกาศเป็น composite unique ไม่ได้ ตัวบังคับอยู่ที่ validation ของ route แทน
      aliasId: { type: 'string' as const },
      status: {
        type: 'enumeration' as const,
        enum: ['draft', 'publishing', 'published', 'failed'],
        default: 'draft',
        required: true,
      },
      lineRichMenuId: { type: 'string' as const },
      // ชื่อนี้ ไม่ใช่ `publishedAt` — Strapi จอง `publishedAt` ไว้ให้ draft & publish ของตัวเอง
      // ประกาศทับแล้ว content type จะโหลดไม่ขึ้นทั้งตัว repo แปลงชื่อกลับให้ชั้น service
      linePublishedAt: { type: 'datetime' as const },
      lastError: { type: 'text' as const },
    },
  },
}
```

`packages/strapi-v4/src/server/content-types/rich-menu-schedule.ts`
```ts
export const richMenuSchedule = {
  schema: {
    kind: 'collectionType' as const,
    // ต้องตรงกับ DEFAULT_SCHEDULE_TABLE ใน core/server/lock.ts เพราะ lock query
    // ยิงผ่าน knex ตรง ๆ ไม่ผ่าน entityService จึงไม่มีใครแปลงชื่อให้
    collectionName: 'rich_menu_schedules',
    info: { singularName: 'rich-menu-schedule', pluralName: 'rich-menu-schedules', displayName: 'Rich menu schedule' },
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      richMenu: {
        type: 'relation' as const,
        relation: 'manyToOne' as const,
        target: 'plugin::line-rich-menu.rich-menu',
        required: true,
      },
      runAt: { type: 'datetime' as const, required: true },
      op: {
        type: 'enumeration' as const,
        enum: ['set-default', 'clear-default', 'swap-alias'],
        required: true,
      },
      state: {
        type: 'enumeration' as const,
        enum: ['pending', 'running', 'done', 'failed'],
        default: 'pending',
        required: true,
      },
      lockedBy: { type: 'string' as const },
      lockedAt: { type: 'datetime' as const },
      lastError: { type: 'text' as const },
    },
  },
}
```

`packages/strapi-v4/src/server/content-types/rich-menu-audit.ts`
```ts
export const richMenuAudit = {
  schema: {
    kind: 'collectionType' as const,
    collectionName: 'rich_menu_audits',
    info: { singularName: 'rich-menu-audit', pluralName: 'rich-menu-audits', displayName: 'Rich menu audit' },
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      // เก็บเป็นตัวเลข ไม่ใช่ relation โดยตั้งใจ (ต่างจากสเปก §11.5) — audit เป็น append-only
      // และต้องอยู่รอดหลังเมนู channel หรือ admin user ที่มันอ้างถึงถูกลบ ซึ่งเป็นจังหวะที่
      // ประวัติมีค่าที่สุด relation ที่ลบตามกันจะทำลายหลักฐานเงียบ ๆ
      actorId: { type: 'integer' as const },
      action: {
        type: 'enumeration' as const,
        enum: ['publish', 'set-default', 'clear-default', 'swap-alias', 'delete', 'channel-update'],
        required: true,
      },
      richMenuId: { type: 'integer' as const },
      channelId: { type: 'integer' as const, required: true },
      before: { type: 'json' as const },
      after: { type: 'json' as const },
      result: { type: 'enumeration' as const, enum: ['success', 'failure'], required: true },
      errorCode: { type: 'string' as const },
    },
  },
}
```

`packages/strapi-v4/src/server/content-types/index.ts`
```ts
import { lineChannel } from './line-channel.js'
import { richMenu } from './rich-menu.js'
import { richMenuAudit } from './rich-menu-audit.js'
import { richMenuSchedule } from './rich-menu-schedule.js'

/** uid ที่ชั้นอื่นอ้างถึง — ประกาศที่เดียวเพื่อไม่ให้มีใครพิมพ์สตริงยาว ๆ นี้ผิด */
export const UID = {
  channel: 'plugin::line-rich-menu.line-channel',
  menu: 'plugin::line-rich-menu.rich-menu',
  schedule: 'plugin::line-rich-menu.rich-menu-schedule',
  audit: 'plugin::line-rich-menu.rich-menu-audit',
} as const

export const contentTypes = {
  'line-channel': lineChannel,
  'rich-menu': richMenu,
  'rich-menu-schedule': richMenuSchedule,
  'rich-menu-audit': richMenuAudit,
}
```

`packages/strapi-v4/src/server/index.ts` — แทน `contentTypes: {}` เดิม
```ts
import { contentTypes } from './content-types/index.js'
import type { StrapiV4 } from './strapi.js'

export default {
  register(_context: { strapi: StrapiV4 }): void {},
  bootstrap(_context: { strapi: StrapiV4 }): void {},
  config: { default: {}, validator(): void {} },
  contentTypes,
  controllers: {},
  routes: {},
  services: {},
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/strapi-v4/tests/content-types.test.ts
pnpm --filter strapi-plugin-line-rich-menu-v4 typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/strapi-v4/src/server packages/strapi-v4/tests/content-types.test.ts
git commit -m "feat(v4): declare the four plugin content types with pinned table names"
```

---

## Task 15: `entityService` repo · plugin config · service container

**Files:**
- Create: `packages/strapi-v4/src/server/repo.ts`, `packages/strapi-v4/src/server/config.ts`, `packages/strapi-v4/src/server/container.ts`
- Modify: `packages/strapi-v4/src/server/strapi.ts` (เพิ่ม `dirs`), `packages/strapi-v4/src/server/index.ts` (ต่อ `config`)
- Test: `packages/strapi-v4/tests/repo.test.ts`, `packages/strapi-v4/tests/config.test.ts`

**Interfaces:**
- Consumes: `Repo`, `ChannelRow`, `RichMenuRow`, `ScheduleRow`, `AuditRow`, `PluginConfig`, `ImageStore`, `ChannelService`, `AuditWriter`, `RateLimiter`, `ScheduleLock`, `createChannelService`, `createAuditWriter`, `createRateLimiter`, `createScheduleLock`, `createScrubbedLogger`, `resolveEncryptionKey`, `LineClient`, `ChannelWithSecrets` จาก `@fosivo/line-rich-menu-core` (Task 1–12) · `UID` จาก `./content-types/index.js` (Task 14) · `StrapiV4` จาก `./strapi.js` (Task 13)
- Produces:
  - `function createChannelRepo(strapi: StrapiV4): Repo<ChannelRow>`
  - `function createMenuRepo(strapi: StrapiV4): Repo<RichMenuRow>`
  - `function createScheduleRepo(strapi: StrapiV4): Repo<ScheduleRow>`
  - `function createAuditRepo(strapi: StrapiV4): Repo<AuditRow>`
  - `function createImageStore(strapi: StrapiV4): ImageStore`
  - `const configDefault: PluginConfig`
  - `function validateConfig(value: unknown): PluginConfig`
  - `function readConfig(strapi: StrapiV4): PluginConfig`
  - `interface Services { config: PluginConfig; logger: LoggerLike; channels: ChannelService; menus: Repo<RichMenuRow>; schedules: Repo<ScheduleRow>; audit: AuditWriter; limiter: RateLimiter; store: ImageStore; lock: ScheduleLock; clientFor(channel: ChannelWithSecrets): LineClient }`
  - `function getServices(strapi: StrapiV4): Services`

สเปก §6.2: "ฝั่ง service ที่ใช้ร่วมกันมองเห็นเป็น `id: string` เสมอ (v4 adapter แปลง number → string ที่ขอบ)" — ไฟล์ `repo.ts` คือ "ขอบ" นั้น และเป็นที่เดียวที่รู้ว่า `channelId` ในชั้น service คือ relation ชื่อ `channel` ในฐานข้อมูล และ `publishedAt` คือคอลัมน์ `linePublishedAt`

- [ ] **Step 1: เขียน test ของ repo ที่ต้องล้มเหลว**

`packages/strapi-v4/tests/repo.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { UID } from '../src/server/content-types/index.js'
import { createAuditRepo, createChannelRepo, createMenuRepo, createScheduleRepo } from '../src/server/repo.js'
import type { StrapiV4 } from '../src/server/strapi.js'

function fakeStrapi(responses: Record<string, unknown>) {
  const calls: { method: string; uid: string; args: unknown[] }[] = []
  const entityService = {
    findMany: vi.fn(async (uid: string, params?: unknown) => {
      calls.push({ method: 'findMany', uid, args: [params] })
      return (responses['findMany'] as unknown[]) ?? []
    }),
    findOne: vi.fn(async (uid: string, id: number | string, params?: unknown) => {
      calls.push({ method: 'findOne', uid, args: [id, params] })
      return responses['findOne'] ?? null
    }),
    create: vi.fn(async (uid: string, params: { data: unknown }) => {
      calls.push({ method: 'create', uid, args: [params] })
      return responses['create'] ?? responses['findOne']
    }),
    update: vi.fn(async (uid: string, id: number | string, params: { data: unknown }) => {
      calls.push({ method: 'update', uid, args: [id, params] })
      return responses['update'] ?? responses['findOne']
    }),
    delete: vi.fn(async (uid: string, id: number | string) => {
      calls.push({ method: 'delete', uid, args: [id] })
      return null
    }),
  }
  return { calls, strapi: { entityService } as unknown as StrapiV4, entityService }
}

const menuEntity = {
  id: 7,
  name: 'เมนูหลัก',
  channel: { id: 10 },
  size: 'large',
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom',
  selected: true,
  templateKey: 'RICH_MENU_TEMPLATE_201',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
  image: { id: 11 },
  areaImages: [],
  normalizedImage: { id: 900 },
  normalizedMime: 'image/jpeg',
  normalizedWidth: 2500,
  normalizedHeight: 1686,
  aliasId: 'tab-a',
  status: 'published',
  lineRichMenuId: 'richmenu-a',
  linePublishedAt: '2026-08-20T00:00:00.000Z',
  lastError: null,
  updatedAt: '2026-08-20T09:00:00.000Z',
}

describe('createChannelRepo', () => {
  it('แปลง id ที่เป็นตัวเลขเป็นสตริงที่ขอบ', async () => {
    const { strapi } = fakeStrapi({ findOne: { id: 10, name: 'ร้าน', channelId: '1650000000', channelAccessToken: 'v1.a.b.c', channelSecret: null, accessTokenLast4: 'WXYZ', isDefault: true } })
    const row = await createChannelRepo(strapi).findOne('10')
    expect(row).toEqual({
      id: '10', name: 'ร้าน', channelId: '1650000000',
      channelAccessToken: 'v1.a.b.c', channelSecret: null, accessTokenLast4: 'WXYZ', isDefault: true,
    })
  })

  it('ยิงไปที่ uid ของปลั๊กอิน ไม่ใช่ uid อื่น', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createChannelRepo(strapi).findMany({ filters: { isDefault: true } })
    expect(calls[0]!.uid).toBe(UID.channel)
    expect(calls[0]!.args[0]).toMatchObject({ filters: { isDefault: true } })
  })
})

describe('createMenuRepo', () => {
  it('แปลง relation และคอลัมน์ที่ชื่อไม่ตรงกับชั้น service', async () => {
    const { strapi } = fakeStrapi({ findOne: menuEntity })
    expect(await createMenuRepo(strapi).findOne('7')).toEqual({
      id: '7',
      name: 'เมนูหลัก',
      channelId: '10',
      size: 'large',
      chatBarText: 'เปิดเมนู',
      chatBarMode: 'custom',
      selected: true,
      templateKey: 'RICH_MENU_TEMPLATE_201',
      areas: menuEntity.areas,
      imageFileId: 11,
      areaImages: [],
      normalizedFileId: 900,
      normalizedMime: 'image/jpeg',
      normalizedSize: { width: 2500, height: 1686 },
      aliasId: 'tab-a',
      status: 'published',
      lineRichMenuId: 'richmenu-a',
      publishedAt: '2026-08-20T00:00:00.000Z',
      lastError: null,
      updatedAt: '2026-08-20T09:00:00.000Z',
    })
  })

  it('populate relation ที่ต้องใช้ ไม่งั้น id ของ channel และรูปจะไม่กลับมา', async () => {
    const { strapi, calls } = fakeStrapi({ findOne: menuEntity })
    await createMenuRepo(strapi).findOne('7')
    expect(calls[0]!.args[1]).toMatchObject({ populate: ['channel', 'image', 'normalizedImage'] })
  })

  it('เขียนกลับด้วยชื่อฟิลด์ของฐานข้อมูล', async () => {
    const { strapi, calls } = fakeStrapi({ findOne: menuEntity })
    await createMenuRepo(strapi).update('7', {
      channelId: '10',
      normalizedFileId: 900,
      normalizedSize: { width: 1200, height: 810 },
      publishedAt: '2026-08-21T00:00:00.000Z',
      status: 'published',
    })
    expect(calls[0]!.args[1]).toEqual({
      data: {
        channel: 10,
        normalizedImage: 900,
        normalizedWidth: 1200,
        normalizedHeight: 810,
        linePublishedAt: '2026-08-21T00:00:00.000Z',
        status: 'published',
      },
    })
  })

  it('filter ด้วย channelId ถูกแปลงเป็น filter บน relation', async () => {
    const { strapi, calls } = fakeStrapi({ findMany: [] })
    await createMenuRepo(strapi).findMany({ filters: { channelId: '10' } })
    expect(calls[0]!.args[0]).toMatchObject({ filters: { channel: 10 } })
  })

  it('ค่าที่ยังไม่มีกลายเป็น null / [] ไม่ใช่ undefined — ชั้น service ประกาศไว้แบบนั้น', async () => {
    const { strapi } = fakeStrapi({ findOne: { id: 7, name: 'x', channel: { id: 10 }, size: 'large', chatBarText: 'x', chatBarMode: 'default', selected: false, status: 'draft' } })
    const row = await createMenuRepo(strapi).findOne('7')
    expect(row).toMatchObject({
      areas: [], areaImages: [], imageFileId: null, normalizedFileId: null,
      normalizedMime: null, normalizedSize: null, aliasId: null,
      lineRichMenuId: null, publishedAt: null, lastError: null, templateKey: null,
    })
  })
})

describe('createScheduleRepo', () => {
  it('แปลง relation richMenu เป็น richMenuId ทั้งขาอ่านและขาเขียน', async () => {
    const { strapi, calls } = fakeStrapi({
      findOne: {
        id: 3, richMenu: { id: 7 }, runAt: '2026-08-21T11:00:00.000Z', op: 'set-default',
        state: 'pending', lockedBy: null, lockedAt: null, lastError: null,
      },
    })
    const repo = createScheduleRepo(strapi)
    expect(await repo.findOne('3')).toMatchObject({ id: '3', richMenuId: '7', op: 'set-default' })

    await repo.create({ richMenuId: '7', runAt: '2026-08-21T11:00:00.000Z', op: 'clear-default', state: 'pending' })
    expect(calls[1]!.args[0]).toEqual({
      data: { richMenu: 7, runAt: '2026-08-21T11:00:00.000Z', op: 'clear-default', state: 'pending' },
    })
  })
})

describe('createAuditRepo', () => {
  it('เขียนตัวเลขลงคอลัมน์ตัวเลข ไม่ใช่สตริง', async () => {
    const { strapi, calls } = fakeStrapi({ create: { id: 1 } })
    await createAuditRepo(strapi).create({
      actorId: '3', action: 'publish', richMenuId: '7', channelId: '10',
      before: null, after: null, result: 'success', errorCode: null,
    })
    expect(calls[0]!.args[0]).toEqual({
      data: {
        actorId: 3, action: 'publish', richMenuId: 7, channelId: 10,
        before: null, after: null, result: 'success', errorCode: null,
      },
    })
  })

  it('actor ที่เป็น null (งานจาก cron) ยังเขียนได้ ไม่กลายเป็น NaN', async () => {
    const { strapi, calls } = fakeStrapi({ create: { id: 1 } })
    await createAuditRepo(strapi).create({
      actorId: null, action: 'set-default', richMenuId: null, channelId: '10',
      before: null, after: null, result: 'success', errorCode: null,
    })
    expect(calls[0]!.args[0]).toMatchObject({ data: { actorId: null, richMenuId: null } })
  })
})
```

`packages/strapi-v4/tests/config.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { configDefault, readConfig, validateConfig } from '../src/server/config.js'
import type { StrapiV4 } from '../src/server/strapi.js'

function fakeStrapi(values: Record<string, unknown>): StrapiV4 {
  return {
    config: { get: <T>(path: string, fallback?: T) => (values[path] ?? fallback) as T },
  } as unknown as StrapiV4
}

describe('validateConfig', () => {
  it('เติมค่าเริ่มต้นให้ครบเมื่อผู้ใช้ไม่ได้ตั้งอะไรเลย', () => {
    expect(validateConfig({})).toEqual(configDefault)
  })

  it('ปฏิเสธ cron ที่ว่างและ lockTtlMs ที่ไม่เป็นบวก', () => {
    expect(() => validateConfig({ scheduler: { enabled: true, cron: '', lockTtlMs: 1000 } })).toThrow()
    expect(() => validateConfig({ scheduler: { enabled: true, cron: '* * * * *', lockTtlMs: 0 } })).toThrow()
  })

  it('ปฏิเสธ base url ที่ไม่ใช่ URL', () => {
    expect(() => validateConfig({ lineApiBaseUrl: 'ไม่ใช่ url' })).toThrow()
  })

  it('ปฏิเสธคีย์แปลกปลอม — จับ typo ตั้งแต่ตอนบูต ไม่ใช่ตอนที่ฟีเจอร์เงียบไปเฉย ๆ', () => {
    expect(() => validateConfig({ mockmode: true })).toThrow()
  })
})

describe('readConfig', () => {
  it('อ่านค่าจาก config ของปลั๊กอินและผ่าน validator', () => {
    const config = readConfig(fakeStrapi({
      'plugin.line-rich-menu': { mockMode: true, lineApiBaseUrl: 'http://127.0.0.1:4010' },
    }))
    expect(config.mockMode).toBe(true)
    expect(config.lineApiBaseUrl).toBe('http://127.0.0.1:4010')
    expect(config.scheduler.cron).toBe(configDefault.scheduler.cron)
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/strapi-v4/tests/repo.test.ts packages/strapi-v4/tests/config.test.ts
```

คาดว่าล้มทั้งสองไฟล์ด้วย `Failed to resolve import "../src/server/repo.js"` และ `".../config.js"`

- [ ] **Step 3: เพิ่ม `dirs` ใน `StrapiV4`**

`packages/strapi-v4/src/server/strapi.ts` — เพิ่มฟิลด์ใน `interface StrapiV4`
```ts
  /** ใช้อ่านไฟล์ของ upload provider แบบ local ที่คืน url สัมพัทธ์ */
  dirs: { static: { public: string } }
```

- [ ] **Step 4: เขียน `repo.ts`**

`packages/strapi-v4/src/server/repo.ts`
```ts
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AuditRow, ChannelRow, ImageStore, ListParams, Repo, RichMenuRow, ScheduleRow,
} from '@fosivo/line-rich-menu-core'
import { UID } from './content-types/index.js'
import type { StrapiV4 } from './strapi.js'

type Entity = Record<string, unknown>

const asString = (value: unknown): string => String(value)
const relationId = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const id = (value as { id?: unknown }).id
  return typeof id === 'number' ? id : null
}
const orNull = <T>(value: unknown): T | null => (value === undefined || value === null ? null : value as T)

/**
 * ตัวช่วยประกาศ repo หนึ่งตัว — ทุกตัวใช้ `entityService` เหมือนกัน ต่างกันแค่การแปลงรูปทรง
 * v5 จะเขียนตัวเทียบเท่าด้วย `documents()` โดยที่ชั้น service ไม่รู้เรื่องเลย (สเปก §6.2)
 */
function define<TRow extends { id: string }>(
  strapi: StrapiV4,
  uid: string,
  shape: {
    toRow(entity: Entity): TRow
    toData(patch: Partial<TRow>): Entity
    mapFilters?(filters: NonNullable<ListParams['filters']>): Record<string, unknown>
    populate?: readonly string[]
  },
): Repo<TRow> {
  const populate = shape.populate === undefined ? {} : { populate: [...shape.populate] }

  const params = (input?: ListParams) => ({
    ...populate,
    ...(input?.filters === undefined
      ? {}
      : { filters: shape.mapFilters === undefined ? input.filters : shape.mapFilters(input.filters) }),
    ...(input?.sort === undefined ? {} : { sort: input.sort }),
    ...(input?.limit === undefined ? {} : { limit: input.limit }),
    ...(input?.start === undefined ? {} : { start: input.start }),
  })

  return {
    async findMany(input) {
      const rows = await strapi.entityService.findMany(uid, params(input))
      return (rows as Entity[]).map(shape.toRow)
    },
    async findOne(id) {
      const entity = await strapi.entityService.findOne(uid, Number(id), populate)
      return entity === null || entity === undefined ? null : shape.toRow(entity as Entity)
    },
    async create(data) {
      const created = await strapi.entityService.create(uid, { data: shape.toData(data) })
      return shape.toRow(created as Entity)
    },
    async update(id, data) {
      const updated = await strapi.entityService.update(uid, Number(id), { data: shape.toData(data) })
      return shape.toRow(updated as Entity)
    },
    async delete(id) {
      await strapi.entityService.delete(uid, Number(id))
    },
  }
}

export function createChannelRepo(strapi: StrapiV4): Repo<ChannelRow> {
  return define<ChannelRow>(strapi, UID.channel, {
    toRow: (entity) => ({
      id: asString(entity['id']),
      name: entity['name'] as string,
      channelId: entity['channelId'] as string,
      channelAccessToken: (entity['channelAccessToken'] as string | undefined) ?? '',
      channelSecret: orNull<string>(entity['channelSecret']),
      accessTokenLast4: (entity['accessTokenLast4'] as string | undefined) ?? '',
      isDefault: entity['isDefault'] === true,
    }),
    toData: (patch) => ({ ...patch }),
  })
}

export function createMenuRepo(strapi: StrapiV4): Repo<RichMenuRow> {
  return define<RichMenuRow>(strapi, UID.menu, {
    populate: ['channel', 'image', 'normalizedImage'],
    mapFilters: (filters) => {
      const { channelId, ...rest } = filters
      // `channelId` ในชั้น service คือ relation ชื่อ `channel` ในฐานข้อมูล — จุดเดียวที่รู้เรื่องนี้
      return channelId === undefined || channelId === null ? rest : { ...rest, channel: Number(channelId) }
    },
    toRow: (entity) => {
      const width = entity['normalizedWidth']
      const height = entity['normalizedHeight']
      return {
        id: asString(entity['id']),
        name: entity['name'] as string,
        channelId: asString(relationId(entity['channel'])),
        size: entity['size'] as RichMenuRow['size'],
        chatBarText: (entity['chatBarText'] as string | undefined) ?? '',
        chatBarMode: entity['chatBarMode'] as RichMenuRow['chatBarMode'],
        selected: entity['selected'] === true,
        templateKey: orNull<string>(entity['templateKey']),
        areas: (entity['areas'] as RichMenuRow['areas'] | undefined) ?? [],
        imageFileId: relationId(entity['image']),
        areaImages: (entity['areaImages'] as RichMenuRow['areaImages'] | undefined) ?? [],
        normalizedFileId: relationId(entity['normalizedImage']),
        normalizedMime: orNull<RichMenuRow['normalizedMime']>(entity['normalizedMime']),
        normalizedSize: typeof width === 'number' && typeof height === 'number' ? { width, height } : null,
        aliasId: orNull<string>(entity['aliasId']),
        status: entity['status'] as RichMenuRow['status'],
        lineRichMenuId: orNull<string>(entity['lineRichMenuId']),
        // `publishedAt` ในชั้น service คือคอลัมน์ `linePublishedAt` — ชื่อเดิมถูก Strapi จองไว้
        publishedAt: orNull<string>(entity['linePublishedAt']),
        lastError: orNull<string>(entity['lastError']),
        // Strapi เขียน updatedAt ให้เอง — `toData` จึงไม่มีทางเขียนกลับ และไม่ควรมี
        updatedAt: (entity['updatedAt'] as string | undefined) ?? '',
      }
    },
    toData: (patch) => {
      const data: Entity = {}
      if (patch.name !== undefined) data['name'] = patch.name
      if (patch.channelId !== undefined) data['channel'] = Number(patch.channelId)
      if (patch.size !== undefined) data['size'] = patch.size
      if (patch.chatBarText !== undefined) data['chatBarText'] = patch.chatBarText
      if (patch.chatBarMode !== undefined) data['chatBarMode'] = patch.chatBarMode
      if (patch.selected !== undefined) data['selected'] = patch.selected
      if (patch.templateKey !== undefined) data['templateKey'] = patch.templateKey
      if (patch.areas !== undefined) data['areas'] = patch.areas
      if (patch.imageFileId !== undefined) data['image'] = patch.imageFileId
      if (patch.areaImages !== undefined) data['areaImages'] = patch.areaImages
      if (patch.normalizedFileId !== undefined) data['normalizedImage'] = patch.normalizedFileId
      if (patch.normalizedMime !== undefined) data['normalizedMime'] = patch.normalizedMime
      if (patch.normalizedSize !== undefined) {
        data['normalizedWidth'] = patch.normalizedSize === null ? null : patch.normalizedSize.width
        data['normalizedHeight'] = patch.normalizedSize === null ? null : patch.normalizedSize.height
      }
      if (patch.aliasId !== undefined) data['aliasId'] = patch.aliasId
      if (patch.status !== undefined) data['status'] = patch.status
      if (patch.lineRichMenuId !== undefined) data['lineRichMenuId'] = patch.lineRichMenuId
      if (patch.publishedAt !== undefined) data['linePublishedAt'] = patch.publishedAt
      if (patch.lastError !== undefined) data['lastError'] = patch.lastError
      return data
    },
  })
}

export function createScheduleRepo(strapi: StrapiV4): Repo<ScheduleRow> {
  return define<ScheduleRow>(strapi, UID.schedule, {
    populate: ['richMenu'],
    mapFilters: (filters) => {
      const { richMenuId, ...rest } = filters
      return richMenuId === undefined || richMenuId === null ? rest : { ...rest, richMenu: Number(richMenuId) }
    },
    toRow: (entity) => ({
      id: asString(entity['id']),
      richMenuId: asString(relationId(entity['richMenu'])),
      runAt: entity['runAt'] as string,
      op: entity['op'] as ScheduleRow['op'],
      state: entity['state'] as ScheduleRow['state'],
      lockedBy: orNull<string>(entity['lockedBy']),
      lockedAt: orNull<string>(entity['lockedAt']),
      lastError: orNull<string>(entity['lastError']),
    }),
    toData: (patch) => {
      const data: Entity = {}
      if (patch.richMenuId !== undefined) data['richMenu'] = Number(patch.richMenuId)
      if (patch.runAt !== undefined) data['runAt'] = patch.runAt
      if (patch.op !== undefined) data['op'] = patch.op
      if (patch.state !== undefined) data['state'] = patch.state
      if (patch.lockedBy !== undefined) data['lockedBy'] = patch.lockedBy
      if (patch.lockedAt !== undefined) data['lockedAt'] = patch.lockedAt
      if (patch.lastError !== undefined) data['lastError'] = patch.lastError
      return data
    },
  })
}

/** `null` ต้องอยู่รอดเป็น `null` — `Number(null)` คือ 0 ซึ่งจะกลายเป็น "actor คนที่ id 0" */
const numberOrNull = (value: string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value)

export function createAuditRepo(strapi: StrapiV4): Repo<AuditRow> {
  return define<AuditRow>(strapi, UID.audit, {
    toRow: (entity) => ({
      id: asString(entity['id']),
      actorId: entity['actorId'] === null || entity['actorId'] === undefined ? null : asString(entity['actorId']),
      action: entity['action'] as AuditRow['action'],
      richMenuId: entity['richMenuId'] === null || entity['richMenuId'] === undefined ? null : asString(entity['richMenuId']),
      channelId: asString(entity['channelId']),
      before: entity['before'] ?? null,
      after: entity['after'] ?? null,
      result: entity['result'] as AuditRow['result'],
      errorCode: orNull<string>(entity['errorCode']),
    }),
    toData: (patch) => ({
      actorId: numberOrNull(patch.actorId),
      action: patch.action,
      richMenuId: numberOrNull(patch.richMenuId),
      channelId: numberOrNull(patch.channelId),
      before: patch.before ?? null,
      after: patch.after ?? null,
      result: patch.result,
      errorCode: patch.errorCode ?? null,
    }),
  })
}

/**
 * อ่าน/เขียนไฟล์ผ่าน upload plugin ของ Strapi (สเปก §7.3 — ปลั๊กอินไม่เก็บไฟล์เอง)
 *
 * ขาอ่าน: provider แบบ local คืน url สัมพัทธ์ (`/uploads/x.jpg`) จึงอ่านจากดิสก์ ส่วน S3/Cloudinary
 * คืน url เต็มจึง fetch — ครอบทั้งสองแบบโดยไม่ต้องรู้ว่า provider ตัวไหนถูกติดตั้ง
 *
 * ขาเขียน: upload service ของ v4 รับไฟล์แบบ formidable ซึ่งต้องมี `path` บนดิสก์จริง
 * จึงเขียนลง temp ก่อนแล้วลบทิ้งเสมอใน finally
 */
export function createImageStore(strapi: StrapiV4): ImageStore {
  const uploadService = () => strapi.plugin('upload').service<{
    upload(args: { data: unknown; files: unknown }): Promise<{ id: number }[]>
  }>('upload')

  return {
    async read(fileId) {
      const file = await strapi.entityService.findOne('plugin::upload.file', fileId) as { url?: string } | null
      const url = file?.url
      if (url === undefined) throw new Error(`upload file ${fileId} has no url`)

      if (url.startsWith('http://') || url.startsWith('https://')) {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`failed to read upload file ${fileId}: ${response.status}`)
        return Buffer.from(await response.arrayBuffer())
      }
      return readFile(join(strapi.dirs.static.public, url))
    },

    async write({ buffer, mime, filename }) {
      const directory = await mkdtemp(join(tmpdir(), 'line-rich-menu-'))
      const path = join(directory, filename)
      try {
        await writeFile(path, buffer)
        const uploaded = await uploadService().upload({
          data: { fileInfo: { name: filename, alternativeText: null, caption: null } },
          files: { path, name: filename, type: mime, size: buffer.length },
        })
        const first = uploaded[0]
        if (first === undefined) throw new Error('upload returned no file')
        return { id: first.id }
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  }
}
```

- [ ] **Step 5: เขียน `config.ts`**

`packages/strapi-v4/src/server/config.ts`
```ts
import { z } from 'zod'
import type { PluginConfig } from '@fosivo/line-rich-menu-core'
import type { StrapiV4 } from './strapi.js'

export const configDefault: PluginConfig = {
  encryptionKey: null,
  scheduler: { enabled: true, cron: '* * * * *', lockTtlMs: 300_000 },
  lineApiBaseUrl: 'https://api.line.me',
  lineApiDataBaseUrl: 'https://api-data.line.me',
  mockMode: false,
  publishRateLimit: { capacity: 3, refillPerMinute: 6 },
}

const url = z.string().url()

/**
 * `.strict()` เหมือนกับที่ route ใช้ (สเปก §11.3) — config ที่พิมพ์คีย์ผิดจะล้มตอนบูต
 * ซึ่งเห็นทันที ดีกว่าปล่อยให้ `mockmode: true` ถูกเมินเงียบ ๆ แล้วยิงใส่ LINE จริงตอน demo
 */
const schema = z.object({
  encryptionKey: z.string().min(1).nullable().default(null),
  scheduler: z.object({
    enabled: z.boolean().default(true),
    cron: z.string().min(1).default('* * * * *'),
    lockTtlMs: z.number().int().positive().default(300_000),
  }).strict().default({}),
  lineApiBaseUrl: url.default(configDefault.lineApiBaseUrl),
  lineApiDataBaseUrl: url.default(configDefault.lineApiDataBaseUrl),
  mockMode: z.boolean().default(false),
  publishRateLimit: z.object({
    capacity: z.number().int().positive().default(3),
    refillPerMinute: z.number().int().positive().default(6),
  }).strict().default({}),
}).strict()

export function validateConfig(value: unknown): PluginConfig {
  return schema.parse(value ?? {})
}

export function readConfig(strapi: StrapiV4): PluginConfig {
  return validateConfig(strapi.config.get<unknown>('plugin.line-rich-menu', {}))
}
```

`packages/strapi-v4/src/server/index.ts` — แทน `config: { default: {}, validator(): void {} }` เดิม
```ts
  config: { default: configDefault, validator: validateConfig },
```
พร้อมเพิ่ม `import { configDefault, validateConfig } from './config.js'` ที่หัวไฟล์

- [ ] **Step 6: เขียน `container.ts`**

`packages/strapi-v4/src/server/container.ts`
```ts
import {
  LineClient, createAuditWriter, createChannelService, createRateLimiter,
  createScheduleLock, createScrubbedLogger, resolveEncryptionKey,
  type AuditWriter, type ChannelService, type ChannelWithSecrets, type ImageStore,
  type KnexLike, type LoggerLike, type PluginConfig, type RateLimiter, type Repo,
  type RichMenuRow, type ScheduleLock, type ScheduleRow,
} from '@fosivo/line-rich-menu-core'
import { readConfig } from './config.js'
import {
  createAuditRepo, createChannelRepo, createImageStore, createMenuRepo, createScheduleRepo,
} from './repo.js'
import type { StrapiV4 } from './strapi.js'

export interface Services {
  config: PluginConfig
  logger: LoggerLike
  channels: ChannelService
  menus: Repo<RichMenuRow>
  schedules: Repo<ScheduleRow>
  audit: AuditWriter
  limiter: RateLimiter
  store: ImageStore
  lock: ScheduleLock
  clientFor(channel: ChannelWithSecrets): LineClient
}

/**
 * ประกอบครั้งเดียวต่อหนึ่ง instance ของ Strapi แล้วจำไว้
 *
 * ไม่ใช่การ optimise — `createRateLimiter` ถือถังของแต่ละ channel ไว้ในหน่วยความจำของตัวเอง
 * ถ้าประกอบใหม่ทุกคำขอ ทุกคำขอจะได้ถังเต็มใบใหม่ แปลว่า rate limit ไม่ทำงานเลย
 * WeakMap เพื่อให้เทสต์ที่สร้าง strapi ปลอมหลายตัวไม่ปนกันและไม่รั่ว
 */
const cache = new WeakMap<StrapiV4, Services>()

export function getServices(strapi: StrapiV4): Services {
  const cached = cache.get(strapi)
  if (cached !== undefined) return cached

  const config = readConfig(strapi)
  const logger = createScrubbedLogger(strapi.log)
  const key = resolveEncryptionKey({
    encryptionKey: config.encryptionKey,
    appKeys: strapi.config.get<string[]>('server.app.keys', []),
  })

  const services: Services = {
    config,
    logger,
    channels: createChannelService({ repo: createChannelRepo(strapi), key }),
    menus: createMenuRepo(strapi),
    schedules: createScheduleRepo(strapi),
    audit: createAuditWriter({ repo: createAuditRepo(strapi), logger }),
    limiter: createRateLimiter(config.publishRateLimit),
    store: createImageStore(strapi),
    lock: createScheduleLock(strapi.db.connection as KnexLike, { ttlMs: config.scheduler.lockTtlMs }),
    clientFor: (channel) => new LineClient({
      accessToken: channel.channelAccessToken,
      apiBaseUrl: config.lineApiBaseUrl,
      apiDataBaseUrl: config.lineApiDataBaseUrl,
    }),
  }

  cache.set(strapi, services)
  return services
}
```

- [ ] **Step 7: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/strapi-v4
pnpm --filter strapi-plugin-line-rich-menu-v4 typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/strapi-v4/src/server packages/strapi-v4/tests
git commit -m "feat(v4): map entityService entities onto the shared repo seam"
```

---

## Task 16: route แบบ `type: 'admin'` · zod ที่ขอบทุกเส้น · controller

**Files:**
- Create: `packages/strapi-v4/src/server/validation.ts`, `src/server/http-error.ts`, `src/server/permissions.ts`, `src/server/menu-write.ts`, `src/server/controllers/channels.ts`, `src/server/controllers/menus.ts`, `src/server/controllers/schedules.ts`, `src/server/controllers/index.ts`, `src/server/routes/admin.ts`, `src/server/routes/index.ts`
- Modify: `packages/core/src/schema.ts` (export `actionSchema` และ `boundsSchema`), `packages/strapi-v4/src/server/index.ts` (ต่อ `controllers` และ `routes`)
- Test: `packages/strapi-v4/tests/validation.test.ts`, `packages/strapi-v4/tests/controllers.test.ts`

**Interfaces:**
- Consumes: `getServices`, `Services` จาก `./container.js` (Task 15) · `publishMenu`, `setMenuAsDefault`, `clearChannelDefault`, `reconcileChannel`, `prepareImage`, `imageFingerprint`, `buildPayload` และ typed error ทั้งหมดจาก `@fosivo/line-rich-menu-core` · `ENDPOINTS`, `ChannelSummary`, `RichMenuSummary`, `BotInfo` จาก `@fosivo/line-rich-menu-ui`
- Produces:
  - `const PERMISSION = { read: 'plugin::line-rich-menu.read', write: 'plugin::line-rich-menu.write', publish: 'plugin::line-rich-menu.publish', settings: 'plugin::line-rich-menu.settings' } as const`
  - `const permissionActions: { section: 'plugins'; displayName: string; uid: string; pluginName: 'line-rich-menu' }[]`
  - `interface AdminContext` — รูปทรงของ koa context เท่าที่ controller ใช้
  - `const channelCreateSchema`, `channelUpdateSchema`, `menuInputSchema`, `publishBodySchema`, `idParam`, `listQuerySchema`
  - `function parse<T>(schema: z.ZodType<T>, value: unknown): T`
  - `function toHttpError(ctx: AdminContext, error: unknown): void`
  - `function saveMenu(services: Services, input: MenuInput, existing: RichMenuRow | null, actorId: string | null): Promise<RichMenuRow>`
  - `const controllers`, `const routes`

**คำตัดสินเรื่องการจับคู่สิทธิ์ (สเปก §11.4)** — สี่ uid ตามตารางใน §11.4 (แถว `create / update` ในตารางนั้นคือสิทธิ์เดียว จึงตั้งชื่อว่า `write`) ส่วนรายการห้าชื่อใน §1.3 ถือว่าถูกแทนที่ด้วยตารางของ §11.4 ซึ่งเป็นหัวข้อที่ระบุเรื่องสิทธิ์จริง ๆ

| route | สิทธิ์ | เหตุผลที่เลือกแบบนี้ |
|---|---|---|
| `GET /channels` | `read` | หน้ารายการเมนูต้องเลือก channel ก่อน และ response ไม่มีความลับอยู่แล้ว การบังคับ `settings` จะทำให้คนแก้ draft ทำงานไม่ได้เลย |
| `POST /channels` · `PUT /channels/:id` · `POST /channels/:id/test` | `settings` | ทั้งสามเส้นแตะ token — `test` ใช้ token ยิงจริง |
| `GET /menus` · `GET /menus/:id` | `read` | |
| `POST /menus` · `PUT /menus/:id` · `DELETE /menus/:id` | `write` | ลบ draft เป็นการแก้ของที่ยังไม่ขึ้น LINE |
| `POST /menus/:id/publish` · `POST|DELETE /menus/:id/default` | `publish` | |
| `GET /channels/:id/reconcile` | `publish` | กิน quota ของ LINE และผลลัพธ์ทำอะไรต่อได้เฉพาะคนที่ publish ได้ |
| `POST /schedules/tick` | `publish` | §11.4 เขียนว่า "ทุก route เป็น `type: 'admin'` — deny by default" ไม่มีข้อยกเว้น คนที่จะยิงจากข้างนอกตาม §10 ต้องใช้ admin API token |

- [ ] **Step 1: เปิด export ของ schema ย่อยใน core**

`packages/core/src/schema.ts` — เปลี่ยนสองบรรทัดจาก `const` เป็น `export const`
```ts
export const actionSchema = z.discriminatedUnion('type', [
```
```ts
export const boundsSchema = z.object({
```
เหตุผล: ชั้น route ต้องปฏิเสธ action ที่มีฟิลด์แปลกปลอมตั้งแต่ขอบ (สเปก §11.3) การประกาศ union ซ้ำในอะแดปเตอร์แปลว่าวันหนึ่งสองที่จะไม่ตรงกัน แล้ว payload ที่ผ่าน route จะไปตกที่ `validateRichMenu` ตอน publish แทน — ซึ่งสายเกินไป

- [ ] **Step 2: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v4/tests/validation.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  channelCreateSchema, idParam, listQuerySchema, menuInputSchema, publishBodySchema,
} from '../src/server/validation.js'

const validMenu = {
  name: 'เมนูหลัก',
  channelId: '10',
  size: 'large',
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom',
  selected: true,
  templateKey: 'RICH_MENU_TEMPLATE_201',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
  imageFileId: 11,
  areaImages: [],
  aliasId: 'tab-a',
  startAt: null,
  endAt: null,
}

describe('menuInputSchema', () => {
  it('ยอมรับ input ที่ถูกต้อง', () => {
    expect(menuInputSchema.parse(validMenu)).toMatchObject({ name: 'เมนูหลัก', channelId: '10' })
  })

  it('ปฏิเสธฟิลด์แปลกปลอมที่ระดับบนสุด', () => {
    expect(() => menuInputSchema.parse({ ...validMenu, isAdmin: true })).toThrow(ZodError)
  })

  it('ปฏิเสธฟิลด์แปลกปลอมที่อยู่ลึกใน action ด้วย — ไม่ใช่แค่ระดับบนสุด', () => {
    expect(() => menuInputSchema.parse({
      ...validMenu,
      areas: [{ bounds: validMenu.areas[0]!.bounds, action: { type: 'message', text: 'hi', evil: 1 } }],
    })).toThrow(ZodError)
  })

  it('ปฏิเสธ uri scheme ที่อันตราย ตั้งแต่ขอบของ route', () => {
    for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      expect(() => menuInputSchema.parse({
        ...validMenu,
        areas: [{ bounds: validMenu.areas[0]!.bounds, action: { type: 'uri', uri } }],
      }), uri).toThrow(ZodError)
    }
  })

  it('จำกัดจำนวนช่องที่ 1–20 และ chatBarText ที่ 14 ตัว', () => {
    expect(() => menuInputSchema.parse({ ...validMenu, areas: [] })).toThrow(ZodError)
    expect(() => menuInputSchema.parse({ ...validMenu, chatBarText: 'x'.repeat(15) })).toThrow(ZodError)
  })

  it('aliasId ต้องเป็น slug ที่ LINE ยอมรับ', () => {
    expect(() => menuInputSchema.parse({ ...validMenu, aliasId: 'Tab A!' })).toThrow(ZodError)
    expect(menuInputSchema.parse({ ...validMenu, aliasId: null }).aliasId).toBeNull()
  })
})

describe('channelCreateSchema', () => {
  it('บังคับให้มี token และปฏิเสธฟิลด์แปลกปลอม', () => {
    expect(() => channelCreateSchema.parse({ name: 'x', channelId: '1' })).toThrow(ZodError)
    expect(() => channelCreateSchema.parse({
      name: 'x', channelId: '1', channelAccessToken: 't', role: 'super-admin',
    })).toThrow(ZodError)
  })
})

describe('idParam · listQuerySchema · publishBodySchema', () => {
  it('id ต้องเป็นตัวเลขล้วน', () => {
    expect(idParam.parse('12')).toBe('12')
    expect(() => idParam.parse('12; DROP TABLE x')).toThrow(ZodError)
  })

  it('query ที่ไม่รู้จักถูกปฏิเสธ', () => {
    expect(listQuerySchema.parse({ channel: '10' })).toEqual({ channel: '10' })
    expect(() => listQuerySchema.parse({ channel: '10', limit: '99999' })).toThrow(ZodError)
  })

  it('body ของ publish ว่างได้ และ default เป็นไม่ตั้ง default', () => {
    expect(publishBodySchema.parse(undefined)).toEqual({ setAsDefault: false })
  })
})
```

`packages/strapi-v4/tests/controllers.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { LineAuthError, ValidationError } from '@fosivo/line-rich-menu-core'
import { PublishRateLimitedError } from '@fosivo/line-rich-menu-core'
import { controllers } from '../src/server/controllers/index.js'
import { toHttpError } from '../src/server/http-error.js'
import type { AdminContext } from '../src/server/http-error.js'

const TOKEN = 'aBcDeFgH1234567890-channel-access-token-WXYZ'

function ctx(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    request: { body: undefined },
    query: {},
    params: {},
    state: { user: { id: 3 } },
    status: 200,
    body: undefined,
    set: vi.fn(),
    ...overrides,
  } as AdminContext
}

function deepContains(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle)
  if (Array.isArray(value)) return value.some((v) => deepContains(v, needle))
  if (value !== null && typeof value === 'object') return Object.values(value).some((v) => deepContains(v, needle))
  return false
}

/** strapi ปลอมที่มีเฉพาะสิ่งที่ controller เดินผ่านจริง */
function fakeStrapi(seed: { channels?: unknown[]; menus?: unknown[] } = {}) {
  const rows: Record<string, Record<string, unknown>[]> = {
    'plugin::line-rich-menu.line-channel': (seed.channels ?? []) as Record<string, unknown>[],
    'plugin::line-rich-menu.rich-menu': (seed.menus ?? []) as Record<string, unknown>[],
    'plugin::line-rich-menu.rich-menu-schedule': [],
    'plugin::line-rich-menu.rich-menu-audit': [],
  }
  let next = 100
  return {
    rows,
    strapi: {
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      config: {
        get: <T>(path: string, fallback?: T) => (path === 'server.app.keys' ? (['app-key-one'] as unknown as T) : (fallback as T)),
      },
      dirs: { static: { public: '/tmp' } },
      plugin: () => ({ service: () => ({ upload: async () => [{ id: 900 }] }), contentType: () => ({}) }),
      db: { connection: () => ({}) },
      admin: { services: { permission: { actionProvider: { registerMany: async () => {} } } } },
      cron: { add: vi.fn() },
      entityService: {
        findMany: async (uid: string) => rows[uid] ?? [],
        findOne: async (uid: string, id: number | string) => (rows[uid] ?? []).find((r) => r['id'] === Number(id)) ?? null,
        create: async (uid: string, params: { data: Record<string, unknown> }) => {
          const row = { id: next++, ...params.data }
          rows[uid]!.push(row)
          return row
        },
        update: async (uid: string, id: number | string, params: { data: Record<string, unknown> }) => {
          const row = (rows[uid] ?? []).find((r) => r['id'] === Number(id))!
          Object.assign(row, params.data)
          return row
        },
        delete: async (uid: string, id: number | string) => {
          rows[uid] = (rows[uid] ?? []).filter((r) => r['id'] !== Number(id))
          return null
        },
      },
    } as never,
  }
}

describe('channels controller', () => {
  it('สร้าง channel แล้วคืน DTO ที่ไม่มี token ไม่ว่าจะซอกไหน', async () => {
    const { strapi } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    const context = ctx({ request: { body: { name: 'ร้าน', channelId: '1650000000', channelAccessToken: TOKEN } } })

    await controller.create(context)

    expect(context.body).toMatchObject({ name: 'ร้าน', accessTokenPreview: '••••••••WXYZ' })
    expect(deepContains(context.body, TOKEN)).toBe(false)
  })

  it('list ไม่มี token และไม่มี ciphertext', async () => {
    const { strapi } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    await controller.create(ctx({ request: { body: { name: 'ร้าน', channelId: '1650000000', channelAccessToken: TOKEN } } }))

    const context = ctx()
    await controller.find(context)

    expect(deepContains(context.body, TOKEN)).toBe(false)
    expect(deepContains(context.body, 'v1.')).toBe(false)
  })

  it('body ที่มีฟิลด์แปลกปลอมถูกปฏิเสธด้วย 400 ไม่ใช่ 500', async () => {
    const { strapi } = fakeStrapi()
    const controller = controllers.channels({ strapi })
    const context = ctx({ request: { body: { name: 'ร้าน', channelId: '1', channelAccessToken: TOKEN, isSuperAdmin: true } } })

    await controller.create(context)

    expect(context.status).toBe(400)
    expect(context.body).toMatchObject({ error: { code: 'validation_failed' } })
  })
})

describe('toHttpError', () => {
  it('แปลง code ของ core เป็นสถานะ HTTP ที่ตรงความหมาย และไม่ส่ง message ดิบขึ้นไป', () => {
    const cases: [unknown, number, string][] = [
      [new ValidationError('x', [{ path: 'name', code: 'too_small', message: 'too small' }]), 400, 'validation_failed'],
      [new PublishRateLimitedError(1500), 429, 'publish_rate_limited'],
      [new LineAuthError('LINE ปฏิเสธ credential'), 502, 'line_auth_failed'],
      [new Error('unexpected'), 500, 'internal_error'],
    ]
    for (const [error, status, code] of cases) {
      const context = ctx()
      toHttpError(context, error)
      expect(context.status).toBe(status)
      expect(context.body).toMatchObject({ error: { code } })
      expect(JSON.stringify(context.body)).not.toContain('LINE ปฏิเสธ')
    }
  })

  it('429 ตั้ง Retry-After เป็นวินาที', () => {
    const context = ctx()
    toHttpError(context, new PublishRateLimitedError(1500))
    expect(context.set).toHaveBeenCalledWith('Retry-After', '2')
  })

  it('ส่ง issues ของ ValidationError ต่อไปให้ฟอร์มชี้ช่องที่ผิดได้', () => {
    const context = ctx()
    toHttpError(context, new ValidationError('x', [{ path: 'channelId', code: 'channel_id_taken', message: 'taken' }]))
    expect(context.body).toMatchObject({
      error: { code: 'validation_failed', issues: [{ path: 'channelId', code: 'channel_id_taken' }] },
    })
  })
})
```

- [ ] **Step 3: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/strapi-v4/tests/validation.test.ts packages/strapi-v4/tests/controllers.test.ts
```

คาดว่าล้มทั้งสองไฟล์ด้วย `Failed to resolve import "../src/server/validation.js"` และ `".../controllers/index.js"`

- [ ] **Step 4: เขียน `validation.ts` และ `permissions.ts`**

`packages/strapi-v4/src/server/validation.ts`
```ts
import { z } from 'zod'
import { actionSchema, boundsSchema } from '@fosivo/line-rich-menu-core'

/**
 * `actionSchema` / `boundsSchema` ยืมมาจาก core ไม่ประกาศซ้ำ — สองที่ที่ประกาศกฎเดียวกัน
 * จะไม่ตรงกันในวันใดวันหนึ่งเสมอ แล้ว action ที่ผ่านด่าน route จะไปตายตอน publish แทน
 * ซึ่งเป็นตอนที่ผู้ใช้เสียเวลาไปแล้วและ LINE อาจถูกแตะไปแล้ว
 */
export const idParam = z.string().regex(/^\d+$/, 'id must be numeric')

const isoDate = z.string().datetime({ offset: true })

export const channelCreateSchema = z.object({
  name: z.string().min(1).max(120),
  channelId: z.string().min(1).max(64),
  channelAccessToken: z.string().min(1).max(1000),
  channelSecret: z.string().max(1000).nullish(),
  isDefault: z.boolean().optional(),
}).strict()

export const channelUpdateSchema = channelCreateSchema.partial().strict()

export const menuInputSchema = z.object({
  name: z.string().min(1).max(300),
  channelId: idParam,
  size: z.enum(['large', 'compact']),
  chatBarText: z.string().max(14),
  chatBarMode: z.enum(['default', 'custom']),
  selected: z.boolean(),
  templateKey: z.string().max(64).nullable(),
  areas: z.array(z.object({ bounds: boundsSchema, action: actionSchema }).strict()).min(1).max(20),
  imageFileId: z.number().int().positive().nullable(),
  areaImages: z.array(z.object({ index: z.number().int().min(0).max(19), fileId: z.number().int().positive() }).strict()),
  // ตัวเดียวกับที่ LINE ยอมรับใน richMenuAliasId — ตรึงไว้ที่นี่ด้วยเพราะ alias เป็น slug
  // ที่ผู้ใช้ตั้งเอง (สเปก §9) และมันไปโผล่ใน URL ของ LINE ตรง ๆ
  aliasId: z.string().regex(/^[a-z0-9_-]+$/).max(32).nullable(),
  startAt: isoDate.nullable(),
  endAt: isoDate.nullable(),
}).strict()

export type MenuInput = z.infer<typeof menuInputSchema>

export const publishBodySchema = z.object({
  setAsDefault: z.boolean().default(false),
}).strict().default({})

export const listQuerySchema = z.object({
  channel: idParam.optional(),
}).strict()

export const setDefaultBodySchema = z.object({}).strict().default({})
```

`packages/strapi-v4/src/server/permissions.ts`
```ts
/**
 * สี่สิทธิ์ตามตารางในสเปก §11.4 — แถว "create / update" ของตารางนั้นคือสิทธิ์เดียว
 * ตั้งชื่อว่า `write` ส่วนรายการห้าชื่อใน §1.3 ถือว่าถูกแทนที่ด้วยตารางนี้
 *
 * `settings` แยกจาก `publish` เป็นสาระสำคัญของดีไซน์ ไม่ใช่รายละเอียด — มอบสิทธิ์สร้าง
 * และปล่อยเมนูให้ใครสักคนได้ โดยที่คนนั้นไม่มีวันเห็น token ของ LINE OA
 */
export const PLUGIN_ID = 'line-rich-menu'

export const PERMISSION = {
  read: `plugin::${PLUGIN_ID}.read`,
  write: `plugin::${PLUGIN_ID}.write`,
  publish: `plugin::${PLUGIN_ID}.publish`,
  settings: `plugin::${PLUGIN_ID}.settings`,
} as const

export const permissionActions = [
  { section: 'plugins', displayName: 'Read rich menus', uid: 'read', pluginName: PLUGIN_ID },
  { section: 'plugins', displayName: 'Create and edit drafts', uid: 'write', pluginName: PLUGIN_ID },
  { section: 'plugins', displayName: 'Publish to LINE', uid: 'publish', pluginName: PLUGIN_ID },
  { section: 'plugins', displayName: 'Manage channels and tokens', uid: 'settings', pluginName: PLUGIN_ID },
] as const
```

- [ ] **Step 5: เขียน `http-error.ts`**

`packages/strapi-v4/src/server/http-error.ts`
```ts
import { ZodError } from 'zod'
import { ValidationError, type ValidationIssue } from '@fosivo/line-rich-menu-core'

export interface AdminContext {
  request: { body: unknown }
  query: Record<string, unknown>
  params: Record<string, string>
  state: { user?: { id: number } }
  status: number
  body: unknown
  set(field: string, value: string): void
}

/**
 * สเปก §11.7 — UI แปล `code` เป็นข้อความตามภาษา ชั้นนี้จึงส่งแค่ `code` ขึ้นไป
 * ไม่ส่ง `message` เด็ดขาด เพราะ message ของ LINE เคยมีเคสที่สะท้อน payload กลับมาพร้อม header
 */
const STATUS_BY_CODE: Record<string, number> = {
  validation_failed: 400,
  channel_not_found: 404,
  menu_not_found: 404,
  menu_not_ready: 409,
  alias_not_published: 409,
  publish_rate_limited: 429,
  encryption_key_missing: 500,
  crypto_envelope_invalid: 500,
  image_unsupported_format: 400,
  image_too_large: 400,
  image_pixel_limit_exceeded: 400,
  image_processing_failed: 400,
  line_auth_failed: 502,
  line_rejected_payload: 502,
  line_rate_limited: 502,
  line_server_error: 502,
  line_not_found: 502,
}

/**
 * zod ที่ขอบของ route โยน `ZodError` ไม่ใช่ `ValidationError` ของ core — ถ้าไม่แปลงตรงนี้
 * body ที่มีฟิลด์แปลกปลอมจะกลายเป็น 500 ซึ่งอ่านเหมือนเซิร์ฟเวอร์พัง ทั้งที่ผู้ใช้ส่งของผิดมา
 * แปลงเป็น `issues` รูปทรงเดียวกับของ core เพื่อให้ฟอร์มฝั่ง UI ชี้ลงช่องที่ผิดได้เหมือนกัน
 */
function issuesOf(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    code: issue.code,
    message: issue.message,
  }))
}

export function toHttpError(ctx: AdminContext, error: unknown): void {
  if (error instanceof ZodError) {
    ctx.status = 400
    ctx.body = { error: { code: 'validation_failed', issues: issuesOf(error) } }
    return
  }

  const code = (error as { code?: unknown } | null)?.code
  const known = typeof code === 'string' ? STATUS_BY_CODE[code] : undefined

  if (known === undefined) {
    ctx.status = 500
    ctx.body = { error: { code: 'internal_error' } }
    return
  }

  ctx.status = known
  if (known === 429) {
    const retryAfterMs = (error as { retryAfterMs?: number }).retryAfterMs ?? 1000
    ctx.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
  }

  ctx.body = error instanceof ValidationError
    ? { error: { code: 'validation_failed', issues: error.issues } }
    : { error: { code } }
}

/** ห่อ handler ทุกตัวให้ error กลายเป็น response ที่มี code เสมอ ไม่ใช่ 500 เปล่า ๆ ของ koa */
export function guard(
  handler: (ctx: AdminContext) => Promise<void>,
): (ctx: AdminContext) => Promise<void> {
  return async (ctx) => {
    try {
      await handler(ctx)
    } catch (error) {
      toHttpError(ctx, error)
    }
  }
}
```

- [ ] **Step 6: เขียน `menu-write.ts`**

`packages/strapi-v4/src/server/menu-write.ts`
```ts
import {
  ValidationError, imageFingerprint, prepareImage,
  type RichMenuRow, type ScheduleRow,
} from '@fosivo/line-rich-menu-core'
import type { Services } from './container.js'
import type { MenuInput } from './validation.js'

function sourceOf(row: Pick<RichMenuRow, 'size' | 'imageFileId' | 'areaImages' | 'areas'>) {
  return {
    sizeName: row.size,
    imageFileId: row.imageFileId,
    areaImages: row.areaImages,
    areas: row.areas,
  }
}

/**
 * alias ต้องไม่ซ้ำ **ภายใน channel เดียวกัน** (สเปก §7.1) ซึ่ง Strapi 4 ประกาศเป็น
 * composite unique ที่ระดับ schema ไม่ได้ — ข้อบังคับจึงอยู่ตรงนี้ และใช้ ValidationError
 * ที่มี `path` เพื่อให้ฟอร์มชี้ลงช่อง aliasId ได้ตรง ๆ
 */
async function assertAliasFree(services: Services, input: MenuInput, exceptId: string | null): Promise<void> {
  if (input.aliasId === null) return
  const siblings = await services.menus.findMany({ filters: { channelId: input.channelId } })
  if (siblings.some((row) => row.aliasId === input.aliasId && row.id !== exceptId)) {
    throw new ValidationError('aliasId is already used in this channel', [
      { path: 'aliasId', code: 'alias_id_taken', message: 'aliasId is already used in this channel' },
    ])
  }
}

/**
 * ช่วงเวลาแสดงผลในฟอร์ม (สเปก §5.7) ถูกเก็บเป็นแถว schedule ไม่ใช่คอลัมน์บนเมนู —
 * `startAt` คือ `set-default` และ `endAt` คือ `clear-default` ทำให้ §10 กับหน้าจอเป็นเรื่องเดียวกัน
 * แทนที่ของเดิมทั้งหมดทุกครั้งที่ save เพื่อไม่ให้เหลือคิวจากค่าที่ผู้ใช้แก้ทิ้งไปแล้ว
 */
async function replaceSchedules(services: Services, menuId: string, input: MenuInput): Promise<void> {
  const existing = await services.schedules.findMany({ filters: { richMenuId: menuId, state: 'pending' } })
  await Promise.all(existing.map((row: ScheduleRow) => services.schedules.delete(row.id)))

  if (input.startAt !== null) {
    await services.schedules.create({ richMenuId: menuId, runAt: input.startAt, op: 'set-default', state: 'pending' })
  }
  if (input.endAt !== null) {
    await services.schedules.create({ richMenuId: menuId, runAt: input.endAt, op: 'clear-default', state: 'pending' })
  }
}

export async function saveMenu(
  services: Services,
  input: MenuInput,
  existing: RichMenuRow | null,
  _actorId: string | null,
): Promise<RichMenuRow> {
  await assertAliasFree(services, input, existing?.id ?? null)

  const patch: Partial<RichMenuRow> = {
    name: input.name,
    channelId: input.channelId,
    size: input.size,
    chatBarText: input.chatBarText,
    chatBarMode: input.chatBarMode,
    selected: input.selected,
    templateKey: input.templateKey,
    areas: input.areas,
    imageFileId: input.imageFileId,
    areaImages: input.areaImages,
    aliasId: input.aliasId,
  }

  const saved = existing === null
    ? await services.menus.create({ ...patch, status: 'draft' })
    : await services.menus.update(existing.id, patch)

  // normalize เกิดตรงนี้ ไม่ใช่ตอน publish (design notes ข้อ 3) และเกิดเฉพาะตอนที่สิ่งที่
  // ทำให้ผลของมันเปลี่ยนจริง ๆ เปลี่ยน — แก้ข้อความปุ่มไม่ควรทำให้ต้องบีบรูปใหม่ห้าวินาที
  const changed = existing === null
    || existing.normalizedFileId === null
    || imageFingerprint(sourceOf(existing)) !== imageFingerprint(sourceOf(saved))

  let result = saved
  if (changed && (saved.imageFileId !== null || saved.areaImages.length > 0)) {
    const prepared = await prepareImage({ store: services.store }, sourceOf(saved), saved.id)
    result = await services.menus.update(saved.id, prepared)
  }

  await replaceSchedules(services, saved.id, input)
  return result
}
```

- [ ] **Step 7: เขียน controller ทั้งสามตัว**

`packages/strapi-v4/src/server/controllers/channels.ts`
```ts
import type { StrapiV4 } from '../strapi.js'
import { getServices } from '../container.js'
import { guard, type AdminContext } from '../http-error.js'
import { channelCreateSchema, channelUpdateSchema, idParam } from '../validation.js'

const actorOf = (ctx: AdminContext): string | null =>
  ctx.state.user === undefined ? null : String(ctx.state.user.id)

export const channels = ({ strapi }: { strapi: StrapiV4 }) => ({
  find: guard(async (ctx) => {
    ctx.body = await getServices(strapi).channels.list()
  }),

  create: guard(async (ctx) => {
    const services = getServices(strapi)
    const input = channelCreateSchema.parse(ctx.request.body)

    // ไม่ใช้ `audit.around` ที่นี่ เพราะ context ของ audit ต้องมี `channelId` ตั้งแต่ก่อนเริ่ม
    // แต่ id เพิ่งมีตอนสร้างเสร็จ การใส่ค่าหลอกไว้ก่อนแล้วเขียนทับทีหลังจะทำให้แถวที่ล้ม
    // ชี้ไป channel ที่ไม่มีอยู่จริง — เขียนสองทางแยกกันตรงไปตรงมากว่า
    const context = { actorId: actorOf(ctx), action: 'channel-update' as const, richMenuId: null }
    try {
      const created = await services.channels.create(input)
      await services.audit.write({
        ...context, channelId: created.id, before: null,
        after: { channelId: created.channelId, name: created.name },
        result: 'success', errorCode: null,
      })
      ctx.body = created
    } catch (error) {
      // channel ยังไม่เกิด จึงยังไม่มี id ให้อ้าง — `channelId: '0'` คือ "ยังไม่มี"
      // และเป็นค่าที่คอลัมน์ integer แบบ required รับได้ ไม่ใช่ null ที่จะถูกปฏิเสธ
      await services.audit.write({
        ...context, channelId: '0', before: null, after: null,
        result: 'failure', errorCode: (error as { code?: string }).code ?? 'unknown_error',
      })
      throw error
    }
  }),

  update: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const input = channelUpdateSchema.parse(ctx.request.body)
    const before = await services.channels.findOne(id)
    ctx.body = await services.audit.around(
      { actorId: actorOf(ctx), action: 'channel-update', richMenuId: null, channelId: id, before },
      () => services.channels.update(id, input),
      (updated) => ({ channelId: updated.channelId, name: updated.name }),
    )
  }),

  test: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    // withSecrets() ถูกเรียกตรงนี้เท่านั้นในทั้งไฟล์ — เป็นจุดเดียวที่ต้องใช้ token จริง
    const channel = await services.channels.withSecrets().findOne(id)
    const info = await services.clientFor(channel).getBotInfo()
    ctx.body = { userId: info.userId, basicId: info.basicId, displayName: info.displayName }
  }),
})
```

`packages/strapi-v4/src/server/controllers/menus.ts`
```ts
import {
  clearChannelDefault, publishMenu, reconcileChannel, setMenuAsDefault,
  type RichMenuRow,
} from '@fosivo/line-rich-menu-core'
import { getServices, type Services } from '../container.js'
import { guard, type AdminContext } from '../http-error.js'
import { saveMenu } from '../menu-write.js'
import type { StrapiV4 } from '../strapi.js'
import {
  idParam, listQuerySchema, menuInputSchema, publishBodySchema, setDefaultBodySchema,
} from '../validation.js'

const actorOf = (ctx: AdminContext): string | null =>
  ctx.state.user === undefined ? null : String(ctx.state.user.id)

/** รูปทรงที่ `RichMenuSummary` ใน packages/ui/src/api.ts ประกาศไว้ — ห้ามเพิ่มหรือลดฟิลด์ */
const toSummary = (row: RichMenuRow) => ({
  id: row.id,
  title: row.name,
  status: row.status,
  channelId: row.channelId,
  aliasId: row.aliasId,
  updatedAt: row.updatedAt,
})

async function toDetail(services: Services, row: RichMenuRow) {
  const schedules = await services.schedules.findMany({ filters: { richMenuId: row.id, state: 'pending' } })
  return {
    ...row,
    startAt: schedules.find((s) => s.op === 'set-default')?.runAt ?? null,
    endAt: schedules.find((s) => s.op === 'clear-default')?.runAt ?? null,
  }
}

/** ops ที่ menu-ops ต้องการ ประกอบจาก channel ของเมนูนั้น ๆ ไม่ใช่ channel เริ่มต้น */
async function opsFor(services: Services, menu: RichMenuRow) {
  const channel = await services.channels.withSecrets().findOne(menu.channelId)
  return { client: services.clientFor(channel), menus: services.menus, audit: services.audit }
}

export const menus = ({ strapi }: { strapi: StrapiV4 }) => ({
  find: guard(async (ctx) => {
    const services = getServices(strapi)
    const query = listQuerySchema.parse(ctx.query)
    const rows = await services.menus.findMany({
      ...(query.channel === undefined ? {} : { filters: { channelId: query.channel } }),
      sort: 'updatedAt:desc',
    })
    ctx.body = rows.map(toSummary)
  }),

  findOne: guard(async (ctx) => {
    const services = getServices(strapi)
    const row = await services.menus.findOne(idParam.parse(ctx.params['id']))
    if (row === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }
    ctx.body = await toDetail(services, row)
  }),

  create: guard(async (ctx) => {
    const services = getServices(strapi)
    const input = menuInputSchema.parse(ctx.request.body)
    const saved = await saveMenu(services, input, null, actorOf(ctx))
    ctx.status = 201
    ctx.body = await toDetail(services, saved)
  }),

  update: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const input = menuInputSchema.parse(ctx.request.body)
    const existing = await services.menus.findOne(id)
    if (existing === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }
    const saved = await saveMenu(services, input, existing, actorOf(ctx))
    ctx.body = await toDetail(services, saved)
  }),

  delete: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const existing = await services.menus.findOne(id)
    if (existing === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

    await services.audit.around(
      {
        actorId: actorOf(ctx), action: 'delete', richMenuId: id, channelId: existing.channelId,
        before: { status: existing.status, lineRichMenuId: existing.lineRichMenuId },
      },
      () => services.menus.delete(id),
    )
    ctx.status = 204
    ctx.body = null
  }),

  publish: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const body = publishBodySchema.parse(ctx.request.body)
    const menu = await services.menus.findOne(id)
    if (menu === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

    const channel = await services.channels.withSecrets().findOne(menu.channelId)
    ctx.body = await publishMenu({
      client: services.clientFor(channel),
      menus: services.menus,
      audit: services.audit,
      limiter: services.limiter,
      store: services.store,
      logger: services.logger,
      now: () => new Date(),
    }, { menuId: id, actorId: actorOf(ctx), setAsDefault: body.setAsDefault })
  }),

  setDefault: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    setDefaultBodySchema.parse(ctx.request.body)
    const menu = await services.menus.findOne(id)
    if (menu === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

    await setMenuAsDefault(await opsFor(services, menu), { menuId: id, actorId: actorOf(ctx) })
    ctx.status = 204
    ctx.body = null
  }),

  clearDefault: guard(async (ctx) => {
    const services = getServices(strapi)
    const id = idParam.parse(ctx.params['id'])
    const menu = await services.menus.findOne(id)
    if (menu === null) { ctx.status = 404; ctx.body = { error: { code: 'menu_not_found' } }; return }

    await clearChannelDefault(await opsFor(services, menu), { channelId: menu.channelId, actorId: actorOf(ctx) })
    ctx.status = 204
    ctx.body = null
  }),

  reconcile: guard(async (ctx) => {
    const services = getServices(strapi)
    const channelId = idParam.parse(ctx.params['id'])
    const channel = await services.channels.withSecrets().findOne(channelId)
    ctx.body = await reconcileChannel(
      { client: services.clientFor(channel), menus: services.menus, audit: services.audit },
      { channelId },
    )
  }),
})
```

`packages/strapi-v4/src/server/controllers/schedules.ts`
```ts
import { getServices } from '../container.js'
import { guard } from '../http-error.js'
import { runTick } from '../tick.js'
import type { StrapiV4 } from '../strapi.js'

export const schedules = ({ strapi }: { strapi: StrapiV4 }) => ({
  // สเปก §10 — สำหรับคนที่รัน serverless หรือหลาย instance ให้ปิด scheduler.enabled
  // แล้วยิงเส้นนี้จากข้างนอกแทน ยังเป็น type: 'admin' เหมือนทุกเส้น (§11.4 ไม่มีข้อยกเว้น)
  // ผู้เรียกจากภายนอกจึงต้องใช้ admin API token
  tick: guard(async (ctx) => {
    ctx.body = await runTick(strapi, getServices(strapi))
  }),
})
```

`packages/strapi-v4/src/server/controllers/index.ts`
```ts
import { channels } from './channels.js'
import { menus } from './menus.js'
import { schedules } from './schedules.js'

export const controllers = { channels, menus, schedules }
```

หมายเหตุ: `runTick` มาจาก `./tick.js` ซึ่ง **Task 18 เป็นคนสร้าง** — จนกว่าจะถึงตอนนั้นให้สร้างไฟล์ชั่วคราว `packages/strapi-v4/src/server/tick.ts` ที่มีเนื้อเท่านี้ แล้ว Task 18 จะเขียนทับ
```ts
import type { Services } from './container.js'
import type { StrapiV4 } from './strapi.js'

export async function runTick(_strapi: StrapiV4, _services: Services): Promise<{ due: number; claimed: number; done: number; failed: number }> {
  return { due: 0, claimed: 0, done: 0, failed: 0 }
}
```

- [ ] **Step 8: เขียน route**

`packages/strapi-v4/src/server/routes/admin.ts`
```ts
import { PERMISSION } from '../permissions.js'

/**
 * สเปก §11.4 — "ทุก route เป็น `type: 'admin'` + policy `admin::hasPermissions` — deny by default"
 * ไม่มีเส้นไหนได้รับการยกเว้น รวมถึง `/schedules/tick` ที่ตั้งใจให้ยิงจากภายนอก
 * เทสต์ใน Task 17 วนทุกแถวของอาเรย์นี้แล้วบังคับว่าต้องมี policy ครบทุกเส้น
 */
const withPermission = (action: string) => ({
  policies: [{ name: 'admin::hasPermissions', config: { actions: [action] } }],
})

export const admin = {
  type: 'admin' as const,
  routes: [
    { method: 'GET', path: '/channels', handler: 'channels.find', config: withPermission(PERMISSION.read) },
    { method: 'POST', path: '/channels', handler: 'channels.create', config: withPermission(PERMISSION.settings) },
    { method: 'PUT', path: '/channels/:id', handler: 'channels.update', config: withPermission(PERMISSION.settings) },
    { method: 'POST', path: '/channels/:id/test', handler: 'channels.test', config: withPermission(PERMISSION.settings) },
    { method: 'GET', path: '/channels/:id/reconcile', handler: 'menus.reconcile', config: withPermission(PERMISSION.publish) },

    { method: 'GET', path: '/menus', handler: 'menus.find', config: withPermission(PERMISSION.read) },
    { method: 'GET', path: '/menus/:id', handler: 'menus.findOne', config: withPermission(PERMISSION.read) },
    { method: 'POST', path: '/menus', handler: 'menus.create', config: withPermission(PERMISSION.write) },
    { method: 'PUT', path: '/menus/:id', handler: 'menus.update', config: withPermission(PERMISSION.write) },
    { method: 'DELETE', path: '/menus/:id', handler: 'menus.delete', config: withPermission(PERMISSION.write) },

    { method: 'POST', path: '/menus/:id/publish', handler: 'menus.publish', config: withPermission(PERMISSION.publish) },
    { method: 'POST', path: '/menus/:id/default', handler: 'menus.setDefault', config: withPermission(PERMISSION.publish) },
    { method: 'DELETE', path: '/menus/:id/default', handler: 'menus.clearDefault', config: withPermission(PERMISSION.publish) },

    { method: 'POST', path: '/schedules/tick', handler: 'schedules.tick', config: withPermission(PERMISSION.publish) },
  ],
}
```

`packages/strapi-v4/src/server/routes/index.ts`
```ts
import { admin } from './admin.js'

export const routes = { admin }
```

`packages/strapi-v4/src/server/index.ts` — แทน `controllers: {}` และ `routes: {}` เดิม พร้อมเพิ่ม import ที่หัวไฟล์
```ts
import { controllers } from './controllers/index.js'
import { routes } from './routes/index.js'
```
```ts
  controllers,
  routes,
```

- [ ] **Step 9: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/strapi-v4
pnpm --filter strapi-plugin-line-rich-menu-v4 typecheck
pnpm vitest run packages/core
```

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/schema.ts packages/strapi-v4/src packages/strapi-v4/tests
git commit -m "feat(v4): expose the admin routes with zod validation at every edge"
```

---

## Task 17: RBAC — ลงทะเบียนสี่สิทธิ์ และ matrix ที่พิสูจน์ว่าไม่มีเส้นไหนหลุด

**Files:**
- Create: `packages/strapi-v4/src/server/bootstrap.ts`
- Modify: `packages/strapi-v4/src/server/index.ts` (ต่อ `bootstrap`)
- Test: `packages/strapi-v4/tests/rbac.test.ts`

**Interfaces:**
- Consumes: `permissionActions`, `PERMISSION`, `PLUGIN_ID` จาก `./permissions.js` (Task 16) · `routes` จาก `./routes/index.js` (Task 16) · `StrapiV4` จาก `./strapi.js` (Task 13)
- Produces:
  - `function registerPermissions(strapi: StrapiV4): Promise<void>`
  - `function bootstrap(context: { strapi: StrapiV4 }): Promise<void>`

สเปก §13.2 ข้อ 1 ต้องการ matrix ทุก route × ทุก role ที่ยืนยันว่า role ที่ไม่มีสิทธิ์ได้ 403 ทุกเส้น **การได้ 403 จริง ๆ เป็นงานของ `admin::hasPermissions` ของ Strapi เอง** สิ่งที่เทสต์ระดับนี้พิสูจน์ได้และควรพิสูจน์คือ **ไม่มี route ไหนที่ลืมประกาศ policy** ซึ่งเป็นความผิดพลาดที่เกิดจริงเวลาเพิ่มเส้นใหม่ ส่วนการเรียกจริงด้วย role ที่ไม่มีสิทธิ์แล้วได้ 403 อยู่ใน `examples/v4-app` (Task 20)

**§6.3 หมายเหตุ Community Edition:** CE ลงทะเบียน action ได้ปกติแต่ไม่มี custom role — สี่สิทธิ์นี้จะไปโผล่ในหน้า role ของ Super Admin / Editor / Author เท่านั้น ไม่กระทบดีไซน์และไม่ต้องแก้อะไร

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v4/tests/rbac.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { registerPermissions } from '../src/server/bootstrap.js'
import { PERMISSION, PLUGIN_ID, permissionActions } from '../src/server/permissions.js'
import { routes } from '../src/server/routes/index.js'
import type { StrapiV4 } from '../src/server/strapi.js'

interface RouteConfig {
  policies?: { name: string; config?: { actions?: string[] } }[]
}
interface RouteDef {
  method: string
  path: string
  handler: string
  config?: RouteConfig
}

const allRoutes = Object.values(routes).flatMap((group) => (group as { routes: RouteDef[] }).routes)

describe('matrix ของ route × สิทธิ์', () => {
  it('มี route group เดียวและเป็น type admin — deny by default (สเปก §11.4)', () => {
    for (const group of Object.values(routes)) {
      expect((group as { type: string }).type).toBe('admin')
    }
  })

  it('ทุกเส้นมี policy admin::hasPermissions พอดีหนึ่งอัน — ไม่มีเส้นไหนหลุด', () => {
    const naked = allRoutes.filter((route) => {
      const policies = route.config?.policies ?? []
      return policies.filter((policy) => policy.name === 'admin::hasPermissions').length !== 1
    })
    expect(naked.map((route) => `${route.method} ${route.path}`)).toEqual([])
  })

  it('ทุกเส้นขอสิทธิ์ที่ประกาศไว้จริง ไม่ใช่สตริงที่พิมพ์เอง', () => {
    const known = new Set(Object.values(PERMISSION))
    const unknown = allRoutes.flatMap((route) =>
      (route.config?.policies ?? [])
        .flatMap((policy) => policy.config?.actions ?? [])
        .filter((action) => !known.has(action as never))
        .map((action) => `${route.method} ${route.path} → ${action}`),
    )
    expect(unknown).toEqual([])
  })

  it('สิทธิ์ทั้งสี่ถูกใช้จริงอย่างน้อยหนึ่งเส้น — ไม่มีสิทธิ์ที่ประกาศไว้เฉย ๆ', () => {
    const used = new Set(allRoutes.flatMap((route) =>
      (route.config?.policies ?? []).flatMap((policy) => policy.config?.actions ?? []),
    ))
    expect([...Object.values(PERMISSION)].filter((action) => !used.has(action))).toEqual([])
  })

  it('เส้นที่แตะ token ใช้ settings ส่วนเส้นที่ยิงขึ้น LINE ใช้ publish — สองอย่างนี้ต้องไม่ปนกัน', () => {
    const actionFor = (method: string, path: string) =>
      allRoutes.find((route) => route.method === method && route.path === path)
        ?.config?.policies?.[0]?.config?.actions?.[0]

    expect(actionFor('POST', '/channels')).toBe(PERMISSION.settings)
    expect(actionFor('PUT', '/channels/:id')).toBe(PERMISSION.settings)
    expect(actionFor('POST', '/channels/:id/test')).toBe(PERMISSION.settings)

    expect(actionFor('POST', '/menus/:id/publish')).toBe(PERMISSION.publish)
    expect(actionFor('POST', '/menus/:id/default')).toBe(PERMISSION.publish)
    expect(actionFor('POST', '/schedules/tick')).toBe(PERMISSION.publish)

    // คนที่ publish ได้ ต้องไม่ได้สิทธิ์แตะ token มาด้วยโดยปริยาย และกลับกัน
    expect(PERMISSION.publish).not.toBe(PERMISSION.settings)
  })
})

describe('registerPermissions', () => {
  it('ลงทะเบียนครบทั้งสี่ action ด้วย pluginName ที่ถูกต้อง', async () => {
    const registerMany = vi.fn(async () => {})
    const strapi = {
      admin: { services: { permission: { actionProvider: { registerMany } } } },
    } as unknown as StrapiV4

    await registerPermissions(strapi)

    expect(registerMany).toHaveBeenCalledTimes(1)
    expect(registerMany.mock.calls[0]![0]).toEqual(permissionActions)
    for (const action of permissionActions) {
      expect(action.pluginName).toBe(PLUGIN_ID)
      expect(action.section).toBe('plugins')
    }
  })

  it('uid ที่ลงทะเบียนประกอบกับ pluginName แล้วตรงกับที่ route ขอ', () => {
    const composed = permissionActions.map((action) => `plugin::${action.pluginName}.${action.uid}`).sort()
    expect(composed).toEqual([...Object.values(PERMISSION)].sort())
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/strapi-v4/tests/rbac.test.ts
```

คาดว่าล้มทั้งไฟล์ด้วย `Failed to resolve import "../src/server/bootstrap.js"`

- [ ] **Step 3: เขียน `bootstrap.ts`**

`packages/strapi-v4/src/server/bootstrap.ts`
```ts
import { permissionActions } from './permissions.js'
import type { StrapiV4 } from './strapi.js'

/**
 * ลงทะเบียนสี่สิทธิ์เข้า action provider ของ admin
 *
 * บน Community Edition (สเปก §6.3) สิทธิ์เหล่านี้ยังลงทะเบียนได้ปกติ แต่จะไปโผล่เฉพาะใน
 * role มาตรฐานสามตัว เพราะ CE ไม่มี custom role — ไม่ต้องทำอะไรเพิ่มและไม่ต้องดักกรณีนี้
 */
export async function registerPermissions(strapi: StrapiV4): Promise<void> {
  await strapi.admin.services.permission.actionProvider.registerMany([...permissionActions])
}

export async function bootstrap({ strapi }: { strapi: StrapiV4 }): Promise<void> {
  await registerPermissions(strapi)
}
```

`packages/strapi-v4/src/server/index.ts` — แทน `bootstrap(_context) {}` เดิม พร้อมเพิ่ม import
```ts
import { bootstrap } from './bootstrap.js'
```
```ts
  bootstrap,
```

- [ ] **Step 4: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/strapi-v4
pnpm --filter strapi-plugin-line-rich-menu-v4 typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/strapi-v4/src/server packages/strapi-v4/tests/rbac.test.ts
git commit -m "feat(v4): register four permissions and prove no route is left unguarded"
```

---

## Task 18: cron — ลงทะเบียน tick และปิดได้ตาม config

**Files:**
- Create: `packages/strapi-v4/src/server/tick.ts` (เขียนทับไฟล์ชั่วคราวจาก Task 16)
- Modify: `packages/strapi-v4/src/server/bootstrap.ts` (ต่อการลงทะเบียน cron)
- Test: `packages/strapi-v4/tests/cron.test.ts`

**Interfaces:**
- Consumes: `createScheduler`, `TickReport` จาก `@fosivo/line-rich-menu-core` (Task 12) · `Services`, `getServices` จาก `./container.js` (Task 15)
- Produces:
  - `function runTick(strapi: StrapiV4, services: Services): Promise<TickReport>`
  - `function registerCron(strapi: StrapiV4): void`

`strapi.cron.add` มี API เหมือนกันทั้ง 4.25 และ 5 (สเปก §2.1) ไฟล์นี้จึงย้ายไป Plan 04 ได้แทบไม่ต้องแก้

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v4/tests/cron.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { registerCron } from '../src/server/tick.js'
import type { StrapiV4 } from '../src/server/strapi.js'

function fakeStrapi(pluginConfig: Record<string, unknown>) {
  const add = vi.fn()
  const strapi = {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {
      get: <T>(path: string, fallback?: T) => {
        if (path === 'plugin.line-rich-menu') return pluginConfig as unknown as T
        if (path === 'server.app.keys') return ['app-key-one'] as unknown as T
        return fallback as T
      },
    },
    cron: { add },
  } as unknown as StrapiV4
  return { strapi, add }
}

describe('registerCron', () => {
  it('ลงทะเบียนงานตาม cron expression ที่ config กำหนด', () => {
    const { strapi, add } = fakeStrapi({ scheduler: { enabled: true, cron: '*/5 * * * *', lockTtlMs: 60000 } })
    registerCron(strapi)
    expect(add).toHaveBeenCalledTimes(1)
    expect(Object.keys(add.mock.calls[0]![0] as object)).toEqual(['*/5 * * * *'])
  })

  it('ไม่ลงทะเบียนเลยเมื่อปิด scheduler — คนที่รันหลาย instance ยิง /schedules/tick เอง (สเปก §10)', () => {
    const { strapi, add } = fakeStrapi({ scheduler: { enabled: false, cron: '* * * * *', lockTtlMs: 60000 } })
    registerCron(strapi)
    expect(add).not.toHaveBeenCalled()
  })

  it('งานที่ลงทะเบียนไว้ต้องไม่โยน error ออกไปหา cron runner ถ้า tick ล้ม', async () => {
    const { strapi, add } = fakeStrapi({ scheduler: { enabled: true, cron: '* * * * *', lockTtlMs: 60000 } })
    registerCron(strapi)
    const job = Object.values(add.mock.calls[0]![0] as Record<string, () => Promise<void>>)[0]!
    // ไม่มี db.connection ในของปลอมชุดนี้ → getServices จะโยน ซึ่งเป็นเคสที่ต้องถูกกลืนและ log
    await expect(job()).resolves.toBeUndefined()
    expect((strapi.log.error as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/strapi-v4/tests/cron.test.ts
```

คาดว่าล้มด้วย `registerCron is not a function` เพราะไฟล์ `tick.ts` ชั่วคราวจาก Task 16 ยังไม่มีฟังก์ชันนี้

- [ ] **Step 3: เขียน `tick.ts` ทับไฟล์ชั่วคราว**

`packages/strapi-v4/src/server/tick.ts`
```ts
import { hostname } from 'node:os'
import { createScheduler, type TickReport } from '@fosivo/line-rich-menu-core'
import { getServices, type Services } from './container.js'
import type { StrapiV4 } from './strapi.js'

/**
 * ตัวระบุ process ที่ไปลงคอลัมน์ `locked_by` — hostname กับ pid รวมกันแยก instance ได้จริง
 * ทั้งบนหลาย container และบนเครื่องเดียวที่รันหลาย process (pm2 cluster)
 */
const owner = (): string => `${hostname()}:${process.pid}`

/**
 * แต่ละ schedule ผูกกับเมนู และแต่ละเมนูผูกกับ channel ของตัวเอง — client จึงต้องประกอบ
 * ตาม channel ของงานนั้น ไม่ใช่ channel เริ่มต้นของระบบ ไม่งั้น tick ในระบบที่มีหลาย OA
 * จะยิงเมนูของ OA หนึ่งด้วย token ของอีก OA หนึ่ง
 */
export async function runTick(strapi: StrapiV4, services: Services): Promise<TickReport> {
  const total: TickReport = { due: 0, claimed: 0, done: 0, failed: 0 }

  for (const channel of await services.channels.list()) {
    const withSecrets = await services.channels.withSecrets().findOne(channel.id)
    const report = await createScheduler({
      schedules: services.schedules,
      lock: services.lock,
      ops: {
        client: services.clientFor(withSecrets),
        menus: services.menus,
        audit: services.audit,
      },
      logger: services.logger,
      now: () => new Date(),
      owner: owner(),
    }).tick()

    total.due += report.due
    total.claimed += report.claimed
    total.done += report.done
    total.failed += report.failed
  }

  strapi.log.debug('line-rich-menu: scheduler tick finished', total)
  return total
}

export function registerCron(strapi: StrapiV4): void {
  const services = (() => {
    try {
      return getServices(strapi)
    } catch {
      return null
    }
  })()

  // อ่าน config ตรง ๆ แทนการพึ่ง services เพราะ getServices อาจล้มได้ตอนบูต
  // (เช่นยังไม่ได้ตั้ง APP_KEYS) และการปิด scheduler ไว้ต้องยังทำงานได้ในสภาพนั้น
  const scheduler = strapi.config.get<{ scheduler?: { enabled?: boolean; cron?: string } }>(
    'plugin.line-rich-menu', {},
  ).scheduler
  if (scheduler?.enabled === false) return
  const expression = scheduler?.cron ?? '* * * * *'

  strapi.cron.add({
    [expression]: async () => {
      try {
        await runTick(strapi, services ?? getServices(strapi))
      } catch (error) {
        // cron runner ของ Strapi ไม่จับ error ให้ — error ที่หลุดออกไปจะกลายเป็น
        // unhandled rejection ที่ทำให้ process ตายทั้งตัวในทุก ๆ นาที
        strapi.log.error('line-rich-menu: scheduler tick failed', error)
      }
    },
  })
}
```

- [ ] **Step 4: ต่อ cron เข้ากับ bootstrap**

`packages/strapi-v4/src/server/bootstrap.ts` — เพิ่ม import และเรียกต่อจาก `registerPermissions`
```ts
import { registerCron } from './tick.js'
```
```ts
export async function bootstrap({ strapi }: { strapi: StrapiV4 }): Promise<void> {
  await registerPermissions(strapi)
  registerCron(strapi)
}
```

- [ ] **Step 5: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/strapi-v4
pnpm --filter strapi-plugin-line-rich-menu-v4 typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/strapi-v4/src/server packages/strapi-v4/tests/cron.test.ts
git commit -m "feat(v4): run the scheduler tick on cron and let a deployment turn it off"
```

---

## Task 19: ฝั่ง admin — จับคู่ Design System v1 เข้ากับ `UIPort` · router v5 · i18n

**Files:**
- Create: `packages/strapi-v4/src/admin/adapters.ts`, `src/admin/primitives.tsx`, `src/admin/port.tsx`, `src/admin/translations.ts`, `src/admin/App.tsx`, `src/admin/pages/List.tsx`, `src/admin/pages/Editor.tsx`
- Modify: `packages/strapi-v4/src/admin/index.tsx`, `packages/ui/src/i18n/en.ts`, `packages/ui/src/i18n/th.ts`
- Test: `packages/strapi-v4/tests/admin/adapters.test.ts`, `packages/strapi-v4/tests/admin/translations.test.ts`, `packages/strapi-v4/tests/admin/primitives.test.ts`

**Interfaces:**
- Consumes: `UIPort`, `UIPrimitives`, `PortProvider`, `RichMenuList`, `ChannelSettings`, `RichMenuEditor`, `emptyDraft`, `MESSAGES`, `TRANSLATION_KEYS`, `ENDPOINTS`, `RichMenuDraft` จาก `@fosivo/line-rich-menu-ui` (Plan 02) · `toAction` จาก `@fosivo/line-rich-menu-ui` · `PERMISSION`, `PLUGIN_ID` จาก `../server/permissions.js` (Task 16)
- Produces:
  - `interface FetchClient { get<T>(url: string): Promise<{ data: T }>; post<T>(url: string, body?: unknown): Promise<{ data: T }>; put<T>(url: string, body?: unknown): Promise<{ data: T }>; del<T>(url: string): Promise<{ data: T }> }`
  - `function makeHttp(client: FetchClient): UIPort['http']`
  - `function makeToast(toggle: (message: { type: string; message: { id: string; defaultMessage: string } }) => void): UIPort['toast']`
  - `function makeNav(history: { push(path: string): void }, Link: ComponentType<{ to: string; children?: ReactNode }>): UIPort['nav']`
  - `function makeT(formatMessage: (descriptor: { id: string; defaultMessage: string }, values?: Record<string, unknown>) => string): UIPort['t']`
  - `const primitives: UIPrimitives`
  - `function usePluginPort(): UIPort`
  - `function prefixTranslations(table: Record<string, string>): Record<string, string>`
  - `function trads(locales: readonly string[]): { data: Record<string, string>; locale: string }[]`

**สิ่งที่ตัดสินใจไว้ในงานนี้**

- **`prefixPluginTranslations` ของ `@strapi/helper-plugin` ไม่ถูกใช้ ทั้งที่มีให้** — มันเป็นสามบรรทัดและ helper-plugin ทั้งแพ็กเกจหายไปใน Strapi 5 การเขียนเองที่นี่แปลว่าตอนลูกค้าย้าย ไฟล์นี้ย้ายตามได้เลย (ข้อบังคับ "อย่าเลือกทางที่ต้องเขียนใหม่ตอน upgrade" ใน Global Constraints)
- **`toast` ของ v4 ไม่มีชนิด `danger`** — `useNotification` ของ 4.25 รับ `info | warning | softWarning | success` เท่านั้น `danger` ของ `UIPort` จึงถูกจับคู่กับ `warning` ซึ่งเป็นชนิดที่แดงที่สุดที่ v4 มี (v5 มี `danger` จริง Plan 04 จะจับคู่ตรงตัว)
- **`http` ต้องส่ง `FormData` ต่อโดยไม่แตะ** — `ImageField` ของ Plan 02 ยิง `POST /upload` ด้วย `FormData` ถ้า adapter เผลอ `JSON.stringify` ให้ การอัปโหลดรูปจะพังทั้งฟีเจอร์
- **เทสต์ของ task นี้แยกสองชั้น** — ตัวจับคู่ (`adapters.ts`) เทสต์แบบฟังก์ชันบริสุทธิ์ ส่วน `primitives.tsx` เทสต์แค่ว่า "มีครบทุกคีย์ที่ `UIPrimitives` ประกาศ" การเรนเดอร์ DS v1 จริงต้องมี ThemeProvider ทั้งชุดซึ่งเป็นการทดสอบ Strapi ไม่ใช่ทดสอบเรา — ชั้นนั้นถูกครอบด้วย Playwright ใน Task 20

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v4/tests/admin/adapters.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest'
import { makeHttp, makeNav, makeT, makeToast } from '../../src/admin/adapters.js'

describe('makeHttp', () => {
  it('แกะ .data ของ axios ออกให้ ui เห็นแค่ payload', async () => {
    const client = {
      get: vi.fn(async () => ({ data: [{ id: '1' }] })),
      post: vi.fn(async () => ({ data: { ok: true } })),
      put: vi.fn(async () => ({ data: { ok: true } })),
      del: vi.fn(async () => ({ data: null })),
    }
    const http = makeHttp(client)
    expect(await http.get('/x')).toEqual([{ id: '1' }])
    expect(await http.post('/x', { a: 1 })).toEqual({ ok: true })
    expect(await http.put('/x', { a: 1 })).toEqual({ ok: true })
    expect(await http.del('/x')).toBeNull()
  })

  it('ส่ง FormData ต่อโดยไม่แปลงร่าง — ไม่งั้นการอัปโหลดรูปพังทั้งฟีเจอร์', async () => {
    const post = vi.fn(async () => ({ data: [{ id: 1 }] }))
    const body = new FormData()
    body.append('files', new Blob(['x']), 'a.png')

    await makeHttp({ get: vi.fn(), post, put: vi.fn(), del: vi.fn() } as never).post('/upload', body)

    expect(post).toHaveBeenCalledWith('/upload', body)
    expect(post.mock.calls[0]![1]).toBeInstanceOf(FormData)
  })
})

describe('makeToast', () => {
  it('จับคู่ danger เป็น warning เพราะ v4 ไม่มีชนิด danger', () => {
    const toggle = vi.fn()
    const toast = makeToast(toggle)

    toast({ type: 'success', message: 'ok' })
    toast({ type: 'warning', message: 'careful' })
    toast({ type: 'danger', message: 'boom' })

    expect(toggle.mock.calls.map((call) => (call[0] as { type: string }).type))
      .toEqual(['success', 'warning', 'warning'])
    expect(toggle.mock.calls[2]![0]).toMatchObject({ message: { defaultMessage: 'boom' } })
  })
})

describe('makeNav', () => {
  it('เติม prefix ของปลั๊กอินให้ path ที่ ui ส่งมาแบบสัมพัทธ์', () => {
    const history = { push: vi.fn() }
    const Link = (() => null) as never
    makeNav(history, Link).push('/rich-menus/7')
    expect(history.push).toHaveBeenCalledWith('/plugins/line-rich-menu/rich-menus/7')
  })

  it('ไม่เติมซ้ำถ้า path เต็มมาแล้ว', () => {
    const history = { push: vi.fn() }
    makeNav(history, (() => null) as never).push('/plugins/line-rich-menu/rich-menus/7')
    expect(history.push).toHaveBeenCalledWith('/plugins/line-rich-menu/rich-menus/7')
  })
})

describe('makeT', () => {
  it('เติม namespace ของปลั๊กอินให้คีย์ และส่ง values ต่อ', () => {
    const formatMessage = vi.fn(() => 'แปลแล้ว')
    expect(makeT(formatMessage)('list.empty', { count: 2 })).toBe('แปลแล้ว')
    expect(formatMessage).toHaveBeenCalledWith(
      { id: 'line-rich-menu.list.empty', defaultMessage: 'list.empty' },
      { count: 2 },
    )
  })
})
```

`packages/strapi-v4/tests/admin/translations.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { MESSAGES, TRANSLATION_KEYS } from '@fosivo/line-rich-menu-ui'
import { prefixTranslations, trads } from '../../src/admin/translations.js'

describe('prefixTranslations', () => {
  it('เติม namespace ให้ทุกคีย์ ไม่ตกหล่นแม้แต่ตัวเดียว', () => {
    const prefixed = prefixTranslations(MESSAGES.en)
    expect(Object.keys(prefixed)).toHaveLength(TRANSLATION_KEYS.length)
    expect(Object.keys(prefixed).every((key) => key.startsWith('line-rich-menu.'))).toBe(true)
    expect(prefixed[`line-rich-menu.${TRANSLATION_KEYS[0]!}`]).toBe(MESSAGES.en[TRANSLATION_KEYS[0]!])
  })
})

describe('trads', () => {
  it('คืนทั้ง en และ th เมื่อ admin เปิดทั้งสองภาษา', () => {
    expect(trads(['en', 'th']).map((entry) => entry.locale)).toEqual(['en', 'th'])
  })

  it('ภาษาที่ปลั๊กอินไม่มีคำแปลถูกข้ามไป ไม่ใช่คืนตารางว่างทับของเดิม', () => {
    expect(trads(['fr']).map((entry) => entry.locale)).toEqual([])
  })

  it('ทั้งสองภาษามีคีย์ครบชุดเดียวกัน — คีย์ที่หายทำให้ผู้ใช้เห็น id ดิบบนหน้าจอ', () => {
    const [en, th] = [trads(['en'])[0]!, trads(['th'])[0]!]
    expect(Object.keys(th.data).sort()).toEqual(Object.keys(en.data).sort())
  })
})
```

`packages/strapi-v4/tests/admin/primitives.test.ts`
```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { primitives } from '../../src/admin/primitives.js'

/**
 * รายการนี้ต้องตรงกับคีย์ของ `UIPrimitives` ใน packages/ui/src/port.ts เป๊ะ
 * ถ้า Plan 02 เพิ่ม primitive ตัวใหม่แล้ว adapter ไม่ได้จับคู่ให้ หน้าจอจะพังตอน render
 * ไม่ใช่ตอนคอมไพล์ (component ที่ undefined เป็น runtime error ของ React)
 */
const REQUIRED = [
  'Button', 'IconButton', 'TextInput', 'Textarea', 'Select', 'Option', 'Checkbox',
  'Radio', 'Toggle', 'Modal', 'Typography', 'Flex', 'Divider', 'Alert', 'Loader', 'Tooltip',
]

describe('primitives', () => {
  it('จับคู่ครบทุกตัวที่ UIPrimitives ประกาศ', () => {
    expect(Object.keys(primitives).sort()).toEqual([...REQUIRED].sort())
  })

  it('ทุกตัวเป็น component ที่เรียกได้จริง ไม่ใช่ undefined', () => {
    for (const key of REQUIRED) {
      expect(primitives[key as keyof typeof primitives], key).toBeTypeOf('function')
    }
  })
})
```

- [ ] **Step 2: รัน test ให้เห็นว่าล้มเหลว**

```bash
pnpm vitest run packages/strapi-v4/tests/admin
```

คาดว่าล้มทั้งสามไฟล์ด้วย `Failed to resolve import "../../src/admin/adapters.js"` และไฟล์พี่น้องอีกสองตัว

- [ ] **Step 3: เขียน `adapters.ts` และ `translations.ts`**

`packages/strapi-v4/src/admin/adapters.ts`
```ts
import type { ComponentType, ReactNode } from 'react'
import type { UIPort } from '@fosivo/line-rich-menu-ui'
import { PLUGIN_ID } from '../server/permissions.js'

export interface FetchClient {
  get<T>(url: string): Promise<{ data: T }>
  post<T>(url: string, body?: unknown): Promise<{ data: T }>
  put<T>(url: string, body?: unknown): Promise<{ data: T }>
  del<T>(url: string): Promise<{ data: T }>
}

/**
 * `useFetchClient` ของ v4 เป็น axios ที่แนบ JWT ของ admin ให้แล้ว — หน้าที่ตรงนี้มีแค่แกะ `.data`
 *
 * ห้ามแปลง body เด็ดขาด: `ImageField` ของ Plan 02 ยิง `POST /upload` ด้วย `FormData`
 * ซึ่ง axios ตั้ง boundary ของ multipart ให้เอง การ JSON.stringify ให้จะทำให้อัปรูปไม่ได้เลย
 */
export function makeHttp(client: FetchClient): UIPort['http'] {
  return {
    async get(url) { return (await client.get(url)).data },
    async post(url, body) { return (await client.post(url, body)).data },
    async put(url, body) { return (await client.put(url, body)).data },
    async del(url) { return (await client.del(url)).data },
  }
}

/**
 * `useNotification` ของ 4.25 รับ `info | warning | softWarning | success` — ไม่มี `danger`
 * จึงจับคู่ `danger` กับ `warning` ซึ่งเป็นชนิดที่ชัดที่สุดที่ v4 มี (v5 มี `danger` จริง)
 */
export function makeToast(
  toggle: (message: { type: string; message: { id: string; defaultMessage: string } }) => void,
): UIPort['toast'] {
  return ({ type, message }) => {
    toggle({
      type: type === 'danger' ? 'warning' : type,
      // ข้อความถูกแปลมาแล้วจาก port.t ฝั่ง ui — ส่งเป็น defaultMessage ให้ react-intl ใช้ตรง ๆ
      message: { id: `${PLUGIN_ID}.toast`, defaultMessage: message },
    })
  }
}

const BASE = `/plugins/${PLUGIN_ID}`

/** `ui` ไม่รู้ว่าตัวเองถูก mount ไว้ที่ไหน — prefix จึงถูกเติมที่นี่ที่เดียว */
export function makeNav(
  history: { push(path: string): void },
  Link: ComponentType<{ to: string; children?: ReactNode }>,
): UIPort['nav'] {
  return {
    push(path) { history.push(path.startsWith(BASE) ? path : `${BASE}${path}`) },
    Link,
  }
}

export function makeT(
  formatMessage: (descriptor: { id: string; defaultMessage: string }, values?: Record<string, unknown>) => string,
): UIPort['t'] {
  return (key, values) =>
    formatMessage({ id: `${PLUGIN_ID}.${key}`, defaultMessage: key }, values)
}
```

`packages/strapi-v4/src/admin/translations.ts`
```ts
import { MESSAGES } from '@fosivo/line-rich-menu-ui'
import { PLUGIN_ID } from '../server/permissions.js'

/**
 * เขียนเองแทน `prefixPluginTranslations` ของ `@strapi/helper-plugin` — สามบรรทัดเท่ากัน
 * แต่ helper-plugin ทั้งแพ็กเกจไม่มีใน Strapi 5 ไฟล์นี้จึงย้ายไปใช้กับ v5 ได้โดยไม่ต้องแก้
 */
export function prefixTranslations(table: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(table).map(([key, value]) => [`${PLUGIN_ID}.${key}`, value]))
}

/**
 * source of truth ของข้อความอยู่ที่ `packages/ui/src/i18n` (สเปก §12) — ที่นี่ import
 * ค่าคงที่นั้นตรง ๆ แทนที่จะให้ build step คัดลอกไฟล์ไปมา ผลเหมือนกันแต่ไม่มีทางลืม sync
 *
 * ภาษาที่ไม่มีคำแปลถูกข้าม ไม่ใช่คืนตารางว่าง — ตารางว่างจะทับคำแปลของ Strapi เองบางส่วน
 */
export function trads(locales: readonly string[]): { data: Record<string, string>; locale: string }[] {
  return locales
    .filter((locale): locale is 'en' | 'th' => locale === 'en' || locale === 'th')
    .map((locale) => ({ data: prefixTranslations(MESSAGES[locale]), locale }))
}
```

- [ ] **Step 4: เขียน `primitives.tsx` และ `port.tsx`**

`packages/strapi-v4/src/admin/primitives.tsx`
```tsx
import {
  Alert as DsAlert, Box, Button as DsButton, Checkbox as DsCheckbox, Divider as DsDivider,
  Flex as DsFlex, IconButton as DsIconButton, Loader as DsLoader, ModalBody, ModalFooter,
  ModalHeader, ModalLayout, Option as DsOption, Radio as DsRadio, Select as DsSelect,
  Textarea as DsTextarea, TextInput as DsTextInput, ToggleInput, Tooltip as DsTooltip,
  Typography as DsTypography,
} from '@strapi/design-system'
import type { UIPrimitives } from '@fosivo/line-rich-menu-ui'

/**
 * จับคู่ Design System v1 เข้ากับ `UIPort` — ไฟล์นี้คือ **ทั้งหมด** ที่ต่างจาก v5 ในฝั่ง UI
 * ทุก component ของ `packages/ui` วาดผ่านชุดนี้ ไม่มีตัวไหน import DS โดยตรง (สเปก §5.1)
 *
 * `testId` ถูกส่งลง element ที่กดได้จริงเสมอ ไม่ใช่ wrapper — เทสต์ของ Plan 02 คาดหวังว่า
 * `toBeDisabled()` และ `click` จะทำงานกับ element ที่ถือ data-testid นั้น
 */
export const primitives: UIPrimitives = {
  Button: ({ onClick, disabled, variant, type, children, testId }) => (
    <DsButton
      onClick={onClick}
      disabled={disabled}
      type={type ?? 'button'}
      variant={variant === 'danger' ? 'danger-light' : variant === 'secondary' ? 'tertiary' : 'default'}
      data-testid={testId}
    >
      {children}
    </DsButton>
  ),

  IconButton: ({ onClick, label, disabled, children, testId }) => (
    <DsIconButton onClick={onClick} label={label} disabled={disabled} data-testid={testId} icon={children} />
  ),

  TextInput: ({ name, value, onChange, label, hint, error, maxLength, disabled, placeholder, type }) => (
    <DsTextInput
      name={name}
      value={value}
      onChange={(event: { target: { value: string } }) => onChange(event.target.value)}
      label={label}
      hint={hint}
      error={error}
      maxLength={maxLength}
      disabled={disabled}
      placeholder={placeholder}
      type={type ?? 'text'}
    />
  ),

  Textarea: ({ name, value, onChange, label, error, rows }) => (
    <DsTextarea
      name={name}
      value={value}
      onChange={(event: { target: { value: string } }) => onChange(event.target.value)}
      label={label}
      error={error}
      rows={rows}
    />
  ),

  // DS v1 ส่งค่าที่เลือกมาตรง ๆ ไม่ใช่ event ต่างจาก v2 ที่ห่อไว้ — จุดที่จับคู่ผิดง่ายที่สุด
  Select: ({ name, value, onChange, label, error, disabled, children }) => (
    <DsSelect name={name} value={value} onChange={onChange} label={label} error={error} disabled={disabled}>
      {children}
    </DsSelect>
  ),

  Option: ({ value, children }) => <DsOption value={value}>{children}</DsOption>,

  Checkbox: ({ name, checked, onChange, children }) => (
    <DsCheckbox name={name} value={checked} onValueChange={onChange}>{children}</DsCheckbox>
  ),

  Radio: ({ name, value, checked, onChange, children }) => (
    <DsRadio name={name} value={value} checked={checked} onChange={() => onChange(value)}>{children}</DsRadio>
  ),

  Toggle: ({ name, checked, onChange, label }) => (
    <ToggleInput
      name={name}
      label={label}
      checked={checked}
      onChange={(event: { target: { checked: boolean } }) => onChange(event.target.checked)}
      onLabel="on"
      offLabel="off"
    />
  ),

  Modal: ({ open, onClose, title, footer, children }) =>
    open ? (
      <ModalLayout onClose={onClose} labelledBy="line-rich-menu-modal-title">
        <ModalHeader>
          <DsTypography id="line-rich-menu-modal-title" fontWeight="bold">{title}</DsTypography>
        </ModalHeader>
        <ModalBody>{children}</ModalBody>
        {footer === undefined ? null : <ModalFooter startActions={footer} />}
      </ModalLayout>
    ) : null,

  Typography: ({ variant, textColor, children }) => (
    <DsTypography variant={variant} textColor={textColor}>{children}</DsTypography>
  ),

  Flex: ({ direction, gap, alignItems, justifyContent, wrap, children }) => (
    <DsFlex
      direction={direction === 'column' ? 'column' : 'row'}
      gap={gap}
      alignItems={alignItems}
      justifyContent={justifyContent}
      wrap={wrap}
    >
      {children}
    </DsFlex>
  ),

  Divider: () => <DsDivider />,

  Alert: ({ variant, title, onClose, children }) => (
    <Box paddingBottom={2}>
      <DsAlert variant={variant} title={title ?? ''} onClose={onClose} closeLabel="close">{children}</DsAlert>
    </Box>
  ),

  Loader: ({ children }) => <DsLoader small>{children}</DsLoader>,

  Tooltip: ({ label, children }) => <DsTooltip description={label}>{children}</DsTooltip>,
}
```

`packages/strapi-v4/src/admin/port.tsx`
```tsx
import { useMemo } from 'react'
import { useFetchClient, useNotification } from '@strapi/helper-plugin'
import { Link, useHistory } from 'react-router-dom'
import { useIntl } from 'react-intl'
import type { UIPort } from '@fosivo/line-rich-menu-ui'
import { makeHttp, makeNav, makeT, makeToast, type FetchClient } from './adapters.js'
import { primitives } from './primitives.js'

/**
 * ประกอบ `UIPort` จาก hook ของ Strapi 4 — hook ทั้งสี่ตัวนี้คือทุกอย่างที่ v4 กับ v5 ต่างกัน
 * ฝั่งนอกไฟล์นี้ (`packages/ui`) ไม่มีบรรทัดไหนรู้จัก Strapi เลย
 *
 * `react-intl` และ `react-router-dom` ถูก import ที่นี่ได้ เพราะไฟล์นี้อยู่ในอะแดปเตอร์
 * ESLint บล็อกทั้งสองตัวเฉพาะใน `packages/ui` ซึ่งเป็นที่ที่มันเป็นปัญหาจริง
 */
export function usePluginPort(): UIPort {
  const fetchClient = useFetchClient() as unknown as FetchClient
  const toggleNotification = useNotification()
  const history = useHistory()
  const { formatMessage } = useIntl()

  return useMemo<UIPort>(() => ({
    ui: primitives,
    http: makeHttp(fetchClient),
    toast: makeToast(toggleNotification as never),
    nav: makeNav(history, Link as never),
    t: makeT(formatMessage as never),
  }), [fetchClient, toggleNotification, history, formatMessage])
}
```

- [ ] **Step 5: เขียนหน้าจอและ entry ของ admin**

`packages/strapi-v4/src/admin/pages/Editor.tsx`
```tsx
import { useEffect, useState } from 'react'
import { useHistory, useLocation, useParams } from 'react-router-dom'
import {
  ENDPOINTS, RichMenuEditor, emptyDraft, fromAction, toAction, usePort,
  type RichMenuDraft,
} from '@fosivo/line-rich-menu-ui'
import type { Action, Bounds } from '@fosivo/line-rich-menu-core/browser'

const BASE = '/plugins/line-rich-menu'

interface MenuDetail {
  id: string
  name: string
  channelId: string
  size: 'large' | 'compact'
  chatBarText: string
  chatBarMode: 'default' | 'custom'
  selected: boolean
  templateKey: string | null
  areas: { bounds: Bounds; action: Action }[]
  imageFileId: number | null
  aliasId: string | null
  startAt: string | null
  endAt: string | null
}

/**
 * `RichMenuEditor` อ่าน `initial` แค่ตอน mount (คอมเมนต์ใน `RichMenuEditorProps` ของ Plan 02
 * เตือนไว้ตรง ๆ) — หน้านี้จึงไม่ render editor เลยจนกว่า fetch จะเสร็จ ไม่ใช่ render ด้วยค่าว่าง
 * แล้วรอ ไม่งั้นฟอร์มจะโชว์ค่าว่างค้างทับ record ที่เพิ่งโหลดมา
 */
export function EditorPage() {
  const { http, t, toast } = usePort()
  const { id } = useParams<{ id?: string }>()
  const history = useHistory()
  const search = new URLSearchParams(useLocation().search)

  const [draft, setDraft] = useState<RichMenuDraft | null>(id === undefined ? emptyDraft() : null)
  const [channelId, setChannelId] = useState(search.get('channel') ?? '')
  const [aliasId, setAliasId] = useState<string | null>(null)
  const [aliases, setAliases] = useState<string[]>([])

  useEffect(() => {
    http.get<{ aliasId: string | null }[]>(ENDPOINTS.menus)
      .then((rows) => setAliases(rows.map((row) => row.aliasId).filter((alias): alias is string => alias !== null)))
      .catch(() => setAliases([]))
  }, [http])

  useEffect(() => {
    if (id === undefined) return
    http.get<MenuDetail>(ENDPOINTS.menu(id))
      .then((detail) => {
        setChannelId(detail.channelId)
        setAliasId(detail.aliasId)
        setDraft({
          title: detail.name,
          startAt: detail.startAt ?? '',
          endAt: detail.endAt ?? '',
          templateKey: detail.templateKey,
          areas: detail.areas.map((area) => fromAction(area.action)),
          bounds: detail.areas.map((area) => area.bounds),
          sizeName: detail.size,
          chatBar: { mode: detail.chatBarMode, text: detail.chatBarText, selected: detail.selected },
          image: null,
        })
      })
      .catch(() => { toast({ type: 'danger', message: t('editor.loadFailed') }) })
  }, [http, id, t, toast])

  if (draft === null) return null

  const save = async (next: RichMenuDraft, publish: boolean): Promise<void> => {
    const body = {
      name: next.title,
      channelId,
      size: next.sizeName,
      chatBarText: next.chatBar.text,
      chatBarMode: next.chatBar.mode,
      selected: next.chatBar.selected,
      templateKey: next.templateKey,
      // `bounds` กับ `areas` ของ draft เรียงตรงกันตาม index เสมอ (สัญญาของ CanvasEditor ใน Plan 02)
      areas: next.bounds.map((bounds, index) => {
        const state = next.areas[index]
        if (state === undefined) throw new Error(`area ${index} is missing its action`)
        return { bounds, action: toAction(state) }
      }),
      imageFileId: next.image?.id ?? null,
      areaImages: [],
      aliasId,
      startAt: next.startAt === '' ? null : next.startAt,
      endAt: next.endAt === '' ? null : next.endAt,
    }

    const saved = id === undefined
      ? await http.post<MenuDetail>(ENDPOINTS.menus, body)
      : await http.put<MenuDetail>(ENDPOINTS.menu(id), body)

    if (publish) await http.post(ENDPOINTS.menuPublish(saved.id), { setAsDefault: true })
    history.push(BASE)
  }

  return (
    <RichMenuEditor
      initial={draft}
      aliasOptions={aliases}
      onCancel={() => history.push(BASE)}
      onSave={save}
    />
  )
}
```

`packages/strapi-v4/src/admin/pages/List.tsx`
```tsx
import { useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { ChannelSettings, ENDPOINTS, RichMenuList, usePort, type ChannelSummary } from '@fosivo/line-rich-menu-ui'

const BASE = '/plugins/line-rich-menu'

/**
 * ตัวเลือก channel อยู่ที่อะแดปเตอร์ ไม่ใช่ใน `packages/ui` — `RichMenuList` รับ `channelId`
 * เข้ามาเป็น prop โดยตั้งใจ (Plan 02) เพราะการเลือก channel เป็นเรื่องของหน้าที่ประกอบมัน
 * ไม่ใช่ของตัวรายการเอง
 */
export function ListPage() {
  const { ui, http, t } = usePort()
  const history = useHistory()
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [channelId, setChannelId] = useState<string | null>(null)

  useEffect(() => {
    http.get<ChannelSummary[]>(ENDPOINTS.channels)
      .then((rows) => {
        setChannels(rows)
        setChannelId((current) => current ?? rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? null)
      })
      .catch(() => setChannels([]))
  }, [http])

  return (
    <ui.Flex direction="column" gap={4}>
      <ui.Flex gap={2} alignItems="center">
        <ui.Select
          name="channel"
          label={t('list.channel')}
          value={channelId ?? ''}
          onChange={setChannelId}
          disabled={channels.length === 0}
        >
          {channels.map((channel) => (
            <ui.Option key={channel.id} value={channel.id}>{channel.name}</ui.Option>
          ))}
        </ui.Select>
        <ui.Button
          testId="create-menu"
          disabled={channelId === null}
          onClick={() => history.push(`${BASE}/rich-menus/new?channel=${channelId ?? ''}`)}
        >
          {t('list.create')}
        </ui.Button>
      </ui.Flex>

      <RichMenuList channelId={channelId} />
      <ui.Divider />
      <ChannelSettings />
    </ui.Flex>
  )
}
```

`packages/strapi-v4/src/admin/App.tsx`
```tsx
import { Route, Switch } from 'react-router-dom'
import { PortProvider } from '@fosivo/line-rich-menu-ui'
import { usePluginPort } from './port.js'
import { EditorPage } from './pages/Editor.js'
import { ListPage } from './pages/List.js'

const BASE = '/plugins/line-rich-menu'

/**
 * router v5 — `Switch` + `Route component` (v6 ใช้ `Routes` + `element` ซึ่งเป็นคนละ API
 * และเป็นหนึ่งในเหตุผลที่ปลั๊กอินสองเวอร์ชันแชร์แพ็กเกจกันไม่ได้ ดูสเปก §2.1)
 * `/rich-menus/new` ต้องมาก่อน `/rich-menus/:id` ไม่งั้น `new` จะถูกจับเป็น id
 */
export default function App() {
  const port = usePluginPort()
  return (
    <PortProvider value={port}>
      <Switch>
        <Route path={`${BASE}/rich-menus/new`} component={EditorPage} exact />
        <Route path={`${BASE}/rich-menus/:id`} component={EditorPage} exact />
        <Route path={BASE} component={ListPage} />
      </Switch>
    </PortProvider>
  )
}
```

`packages/strapi-v4/src/admin/index.tsx`
```tsx
import { PLUGIN_ID, PERMISSION } from '../server/permissions.js'
import { trads } from './translations.js'

interface AdminApp {
  addMenuLink(link: Record<string, unknown>): void
  registerPlugin(plugin: Record<string, unknown>): void
}

export default {
  register(app: AdminApp): void {
    app.addMenuLink({
      to: `/plugins/${PLUGIN_ID}`,
      icon: undefined,
      intlLabel: { id: `${PLUGIN_ID}.plugin.name`, defaultMessage: 'LINE Rich Menu' },
      // เมนูฝั่งซ้ายซ่อนตัวเองจากคนที่ไม่มีสิทธิ์ `read` — ชั้นแรกของ deny by default
      // ชั้นที่บังคับจริงยังเป็น policy ที่ route (Task 16/17) ไม่ใช่ตรงนี้
      permissions: [{ action: PERMISSION.read, subject: null }],
      Component: async () => import('./App.js'),
    })

    app.registerPlugin({ id: PLUGIN_ID, initializer: undefined, isReady: true, name: PLUGIN_ID })
  },

  registerTrads({ locales }: { locales: string[] }): Promise<{ data: Record<string, string>; locale: string }[]> {
    return Promise.resolve(trads(locales))
  },
}
```

- [ ] **Step 6: เติมคีย์แปลสามตัวที่หน้าจอของอะแดปเตอร์ใช้**

หน้า `ListPage` และ `EditorPage` เป็นของอะแดปเตอร์ แต่ข้อความยังต้องผ่าน `port.t` เหมือนกฎเดียวกับ `packages/ui` และ source of truth ของข้อความอยู่ที่ `packages/ui/src/i18n` (สเปก §12) — คีย์จึงต้องไปเพิ่มที่นั่น ไม่ใช่ hardcode ไว้ในอะแดปเตอร์

`packages/ui/src/i18n/en.ts` — เพิ่มสามบรรทัดในอ็อบเจกต์ `en`
```ts
  'list.channel': 'Channel',
  'list.create': 'Create rich menu',
  'editor.loadFailed': 'Could not load this rich menu',
```

`packages/ui/src/i18n/th.ts` — เพิ่มสามคีย์เดียวกันในอ็อบเจกต์ `th`
```ts
  'list.channel': 'ช่องทาง',
  'list.create': 'สร้างเมนู',
  'editor.loadFailed': 'โหลดเมนูนี้ไม่สำเร็จ',
```

เทสต์ `packages/ui/tests/i18n.test.ts` ของ Plan 02 บังคับว่า `en` กับ `th` ต้องมีคีย์ชุดเดียวกัน — เพิ่มข้างเดียวแล้วมันจะแดงทันที ซึ่งเป็นพฤติกรรมที่ต้องการ

```bash
pnpm vitest run packages/ui/tests/i18n.test.ts
```

- [ ] **Step 7: รัน test ให้ผ่าน**

```bash
pnpm vitest run packages/strapi-v4
pnpm vitest run packages/ui
pnpm --filter strapi-plugin-line-rich-menu-v4 typecheck
pnpm --filter strapi-plugin-line-rich-menu-v4 build
```

- [ ] **Step 8: Commit**

```bash
git add packages/strapi-v4/src/admin packages/strapi-v4/tests/admin packages/ui/src/i18n
git commit -m "feat(v4): implement the UI port with Design System v1 and router v5"
```

---

## Task 20: `examples/v4-app` — acceptance gate ที่รัน Strapi 4.25.11 จริง

**Files:**
- Create: `examples/v4-app/package.json`, `.env.example`, `config/server.js`, `config/admin.js`, `config/database.js`, `config/plugins.js`, `config/middlewares.js`, `src/index.js`, `scripts/seed.js`, `playwright.config.ts`, `tests/acceptance.spec.ts`, `README.md`
- Modify: `pnpm-workspace.yaml` (กัน `examples/v4-app` ออกจากเวิร์กสเปซ), `.github/workflows/ci.yml` (job `e2e-v4`)
- Test: `examples/v4-app/tests/acceptance.spec.ts` (Playwright)

**Interfaces:**
- Consumes: tarball ของ `strapi-plugin-line-rich-menu-v4` (Task 13–19) · `tools/line-mock` (Plan 00 + Task 9)
- Produces: คำสั่งเดียว `pnpm e2e:v4` ที่บูต Strapi 4 จริง แล้วเดินเส้นทาง login → สร้าง → อัปรูป → publish → เห็น `published`

**คำตัดสินสองข้อ**

1. **ติดตั้งปลั๊กอินจาก `npm pack` ไม่ใช่ `yalc` (ต่างจากที่สเปก §3.1 เขียนไว้)** — tarball คือสิ่งที่ลูกค้าได้จริงจาก npm การติดตั้งแบบนี้จึงพิสูจน์ `files` allowlist, ไฟล์ shim ที่ root และ `dist` ไปพร้อมกัน ส่วน yalc ลิงก์ซอร์สที่ยังไม่ผ่านขั้นแพ็ก — ถ้าลืมใส่ `strapi-server.js` ใน `files` yalc จะไม่มีทางจับได้ และนั่นคือความผิดพลาดที่ทำให้ปลั๊กอินโหลดไม่ขึ้นบนเครื่องผู้ใช้จริง ๆ
2. **`examples/v4-app` ถูกกันออกจาก pnpm workspace และติดตั้งด้วย npm** — Strapi 4 ต้องการ `node_modules` แบบแบนสำหรับ webpack ของ admin และ peer dependency ของปลั๊กอิน (react, DS v1) ต้อง resolve ไปที่สำเนาของแอปเอง การให้มันเป็นแอปอิสระคือสภาพแวดล้อมเดียวกับลูกค้า ไม่ใช่สภาพแวดล้อมพิเศษของเรา
3. **เทสต์แยกสองชั้น** — ชั้น API เดินเส้นทางทั้งหมดผ่าน HTTP จริงของ Strapi (รวม policy, zod, publish, LINE mock) และเป็นที่ที่ตรวจ 403 ของ role ที่ไม่มีสิทธิ์ ส่วนชั้นเบราว์เซอร์พิสูจน์ว่า **บันเดิลของ admin โหลดขึ้นจริง** ซึ่งเป็นสิ่งที่พังจริงบน v4 (DS v1, webpack 5, router v5) การไล่ลากกล่องบน canvas ผ่านเบราว์เซอร์ไม่ได้เพิ่มความมั่นใจเกินกว่าที่ Plan 02 ทดสอบไว้แล้ว แต่เพิ่มความเปราะมาก

- [ ] **Step 1: กัน example ออกจากเวิร์กสเปซ**

`pnpm-workspace.yaml`
```yaml
packages:
  - 'packages/*'
  - 'tools/*'
  # examples/v4-app ติดตั้งด้วย npm ต่างหาก — ดูเหตุผลใน docs/.../03-server-and-v4.md Task 20
  # มันต้องเป็นแอป Strapi 4 ที่เหมือนของลูกค้า ไม่ใช่แพ็กเกจในเวิร์กสเปซที่ได้ node_modules พิเศษ
  - '!examples/v4-app'
allowBuilds:
  esbuild: true
  msw: false
  sharp: true
```

- [ ] **Step 2: สร้างแอป Strapi 4**

`examples/v4-app/package.json`
```json
{
  "name": "v4-app",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "develop": "strapi develop",
    "start": "strapi start",
    "build": "strapi build",
    "seed": "node scripts/seed.js",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@strapi/plugin-i18n": "4.25.11",
    "@strapi/plugin-users-permissions": "4.25.11",
    "@strapi/strapi": "4.25.11",
    "better-sqlite3": "9.6.0",
    "pg": "8.12.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "5.3.4",
    "styled-components": "5.3.11"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "sharp": "0.35.3"
  },
  "engines": { "node": ">=20.15.0" }
}
```

`examples/v4-app/config/server.js`
```js
module.exports = ({ env }) => ({
  host: env('HOST', '127.0.0.1'),
  port: env.int('PORT', 1337),
  app: { keys: env.array('APP_KEYS') },
})
```

`examples/v4-app/config/admin.js`
```js
module.exports = ({ env }) => ({
  auth: { secret: env('ADMIN_JWT_SECRET') },
  apiToken: { salt: env('API_TOKEN_SALT') },
  transfer: { token: { salt: env('TRANSFER_TOKEN_SALT') } },
})
```

`examples/v4-app/config/database.js`
```js
const path = require('path')

// สลับได้ด้วย DATABASE_CLIENT เพื่อให้ CI รัน matrix sqlite × postgres ได้จากแอปเดียว
// สเปก §13.4 — และเป็นด่านที่พิสูจน์ว่า lock query (Task 12) ทำงานได้ทั้งสอง dialect จริง
module.exports = ({ env }) => {
  const client = env('DATABASE_CLIENT', 'sqlite')

  if (client === 'postgres') {
    return {
      connection: {
        client: 'postgres',
        connection: {
          host: env('DATABASE_HOST', '127.0.0.1'),
          port: env.int('DATABASE_PORT', 5432),
          database: env('DATABASE_NAME', 'strapi'),
          user: env('DATABASE_USERNAME', 'strapi'),
          password: env('DATABASE_PASSWORD', 'strapi'),
        },
        pool: { min: 0, max: 5 },
      },
    }
  }

  return {
    connection: {
      client: 'sqlite',
      connection: { filename: path.join(__dirname, '..', env('DATABASE_FILENAME', '.tmp/data.db')) },
      useNullAsDefault: true,
    },
  }
}
```

`examples/v4-app/config/plugins.js`
```js
module.exports = ({ env }) => ({
  'line-rich-menu': {
    enabled: true,
    config: {
      encryptionKey: env('LINE_RM_ENCRYPTION_KEY'),
      // ชี้ไป tools/line-mock เพื่อให้ CI รันได้โดยไม่ต้องมี credential จริง (สเปก §13.4)
      lineApiBaseUrl: env('LINE_API_BASE_URL', 'https://api.line.me'),
      lineApiDataBaseUrl: env('LINE_API_DATA_BASE_URL', 'https://api-data.line.me'),
      // ปิด cron ในเทสต์ เพื่อให้ tick เกิดเฉพาะตอนที่เทสต์ยิงเองผ่าน /schedules/tick
      // ไม่งั้นงานที่ตั้งเวลาไว้จะถูกรันโดยรอบ cron ระหว่างที่เทสต์กำลัง assert อยู่พอดี
      scheduler: { enabled: env.bool('LINE_RM_SCHEDULER', false), cron: '* * * * *', lockTtlMs: 300000 },
    },
  },
})
```

`examples/v4-app/config/middlewares.js`
```js
module.exports = [
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::logger',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
]
```

`examples/v4-app/src/index.js`
```js
module.exports = { register() {}, bootstrap() {} }
```

`examples/v4-app/.env.example`
```
HOST=127.0.0.1
PORT=1337
APP_KEYS=one-app-key,two-app-key
ADMIN_JWT_SECRET=example-admin-jwt-secret
API_TOKEN_SALT=example-api-token-salt
TRANSFER_TOKEN_SALT=example-transfer-token-salt
DATABASE_CLIENT=sqlite
LINE_API_BASE_URL=http://127.0.0.1:4010
LINE_API_DATA_BASE_URL=http://127.0.0.1:4010
LINE_RM_ENCRYPTION_KEY=example-encryption-key-please-change
LINE_RM_SCHEDULER=false
E2E_ADMIN_EMAIL=owner@example.com
E2E_ADMIN_PASSWORD=Passw0rd!example
E2E_AUTHOR_EMAIL=author@example.com
E2E_AUTHOR_PASSWORD=Passw0rd!example
```

`examples/v4-app/scripts/seed.js`
```js
'use strict'

/**
 * สร้างผู้ใช้ admin สองคน: หนึ่ง Super Admin สำหรับเดินเส้นทางหลัก และหนึ่ง Author
 * ที่ไม่มีสิทธิ์ของปลั๊กอินเลย — คนหลังมีไว้พิสูจน์ว่า route ทุกเส้นตอบ 403 (สเปก §13.2 ข้อ 1)
 *
 * ไม่สร้าง channel ที่นี่โดยตั้งใจ — เทสต์สร้างเองผ่าน POST /line-rich-menu/channels
 * เพื่อให้เส้นทางเข้ารหัส token ถูกเดินจริงแทนที่จะถูกข้ามด้วยการเขียนแถวตรง ๆ
 */
async function main() {
  const strapiFactory = require('@strapi/strapi')
  const strapi = await strapiFactory().load()

  // `strapi.db.query('admin::role')` แทน `strapi.admin.services.role.*` — service ของ admin
  // เปลี่ยนชื่อเมธอดไปมาระหว่าง 4.x ย่อย ส่วน query engine เสถียรทั้งสาย
  const roles = await strapi.db.query('admin::role').findMany()
  const roleIdByCode = Object.fromEntries(roles.map((role) => [role.code, role.id]))

  const users = [
    { env: 'E2E_ADMIN', code: 'strapi-super-admin', firstname: 'Owner' },
    { env: 'E2E_AUTHOR', code: 'strapi-author', firstname: 'Author' },
  ]

  for (const user of users) {
    const email = process.env[`${user.env}_EMAIL`]
    const password = process.env[`${user.env}_PASSWORD`]
    const existing = await strapi.db.query('admin::user').findOne({ where: { email } })
    if (existing) continue

    await strapi.admin.services.user.create({
      email,
      password,
      firstname: user.firstname,
      lastname: 'E2E',
      isActive: true,
      registrationToken: null,
      roles: [roleIdByCode[user.code]],
    })
    strapi.log.info(`seeded ${email} as ${user.code}`)
  }

  await strapi.destroy()
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 3: เขียนเทสต์ acceptance**

`examples/v4-app/playwright.config.ts`
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Strapi 4 บูตช้าและ publish เดินหลาย round trip — 60 วินาทีคือกันค้าง ไม่ใช่เกณฑ์ประสิทธิภาพ
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // ต้องเป็น 1 — เทสต์ทั้งชุดใช้ฐานข้อมูลเดียวกันและตั้ง default menu ตัวเดียวกันบน mock
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:1337',
    trace: 'retain-on-failure',
  },
})
```

`examples/v4-app/tests/acceptance.spec.ts`
```ts
import { expect, test, type APIRequestContext } from '@playwright/test'

const ADMIN = { email: process.env['E2E_ADMIN_EMAIL']!, password: process.env['E2E_ADMIN_PASSWORD']! }
const AUTHOR = { email: process.env['E2E_AUTHOR_EMAIL']!, password: process.env['E2E_AUTHOR_PASSWORD']! }

async function login(request: APIRequestContext, who: { email: string; password: string }): Promise<string> {
  const response = await request.post('/admin/login', { data: who })
  expect(response.ok(), `login ของ ${who.email} ต้องสำเร็จ`).toBe(true)
  return (await response.json()).data.token as string
}

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

/** JPEG ทึบสีเดียวขนาด 2500×1686 สร้างสด ๆ เพื่อไม่ต้องมีไฟล์ binary ใน repo */
async function makeImage(): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp({ create: { width: 2500, height: 1686, channels: 3, background: { r: 20, g: 120, b: 210 } } })
    .jpeg({ quality: 85 })
    .toBuffer()
}

test.describe('เส้นทางหลัก', () => {
  test('login → สร้าง channel → สร้างเมนู → อัปรูป → publish → เห็น published', async ({ request }) => {
    const token = await login(request, ADMIN)

    const channelResponse = await request.post('/line-rich-menu/channels', {
      ...auth(token),
      data: { name: 'ร้านทดสอบ', channelId: '1650000000', channelAccessToken: 'e2e-access-token-ABCD' },
    })
    expect(channelResponse.status()).toBe(200)
    const channel = await channelResponse.json()
    // สเปก §11.2 — token เต็มต้องไม่เคยออกจากฝั่งเซิร์ฟเวอร์
    expect(JSON.stringify(channel)).not.toContain('e2e-access-token-ABCD')
    expect(channel.accessTokenPreview).toBe('••••••••ABCD')

    const upload = await request.post('/upload', {
      ...auth(token),
      multipart: { files: { name: 'menu.jpg', mimeType: 'image/jpeg', buffer: await makeImage() } },
    })
    expect(upload.ok()).toBe(true)
    const fileId = (await upload.json())[0].id as number

    const created = await request.post('/line-rich-menu/menus', {
      ...auth(token),
      data: {
        name: 'เมนูหลัก',
        channelId: channel.id,
        size: 'large',
        chatBarText: 'เปิดเมนู',
        chatBarMode: 'custom',
        selected: true,
        templateKey: null,
        areas: [{
          bounds: { x: 0, y: 0, width: 2500, height: 1686 },
          action: { type: 'message', text: 'สวัสดี' },
        }],
        imageFileId: fileId,
        areaImages: [],
        aliasId: 'main',
        startAt: null,
        endAt: null,
      },
    })
    expect(created.status()).toBe(201)
    const menu = await created.json()
    // normalize เกิดตอน save ไม่ใช่ตอน publish (design notes ข้อ 3)
    expect(menu.normalizedFileId).not.toBeNull()
    expect(menu.normalizedSize).toEqual({ width: 2500, height: 1686 })

    const published = await request.post(`/line-rich-menu/menus/${menu.id}/publish`, {
      ...auth(token),
      data: { setAsDefault: true },
    })
    expect(published.status()).toBe(200)
    expect((await published.json()).status).toBe('published')

    const list = await request.get(`/line-rich-menu/menus?channel=${channel.id}`, auth(token))
    expect((await list.json())[0]).toMatchObject({ title: 'เมนูหลัก', status: 'published', aliasId: 'main' })
  })

  test('reconcile ไม่เห็นเมนูกำพร้าหลัง publish ที่สำเร็จ', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channels = await (await request.get('/line-rich-menu/channels', auth(token))).json()
    const report = await request.get(`/line-rich-menu/channels/${channels[0].id}/reconcile`, auth(token))
    expect(await report.json()).toEqual({ orphans: [], missing: [] })
  })

  test('tick ที่ยิงจากภายนอกทำงานได้และไม่ล้ม', async ({ request }) => {
    const token = await login(request, ADMIN)
    const response = await request.post('/line-rich-menu/schedules/tick', { ...auth(token), data: {} })
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ failed: 0 })
  })
})

test.describe('RBAC — role ที่ไม่มีสิทธิ์ต้องได้ 403 ทุกเส้น (สเปก §13.2 ข้อ 1)', () => {
  const guarded: [string, string][] = [
    ['GET', '/line-rich-menu/channels'],
    ['POST', '/line-rich-menu/channels'],
    ['PUT', '/line-rich-menu/channels/1'],
    ['POST', '/line-rich-menu/channels/1/test'],
    ['GET', '/line-rich-menu/channels/1/reconcile'],
    ['GET', '/line-rich-menu/menus'],
    ['GET', '/line-rich-menu/menus/1'],
    ['POST', '/line-rich-menu/menus'],
    ['PUT', '/line-rich-menu/menus/1'],
    ['DELETE', '/line-rich-menu/menus/1'],
    ['POST', '/line-rich-menu/menus/1/publish'],
    ['POST', '/line-rich-menu/menus/1/default'],
    ['DELETE', '/line-rich-menu/menus/1/default'],
    ['POST', '/line-rich-menu/schedules/tick'],
  ]

  // GET กับ DELETE ห้ามแนบ body — Playwright ปฏิเสธคำขอที่มี `data` บนสองเมธอดนี้
  const options = (method: string, token: string) =>
    method === 'GET' || method === 'DELETE'
      ? { method, ...auth(token) }
      : { method, ...auth(token), data: {} }

  for (const [method, path] of guarded) {
    test(`${method} ${path} → 403`, async ({ request }) => {
      const token = await login(request, AUTHOR)
      const response = await request.fetch(path, options(method, token))
      expect(response.status()).toBe(403)
    })
  }

  test('ไม่มีคำขอไหนของ role นี้ที่ได้ token กลับไป', async ({ request }) => {
    const token = await login(request, AUTHOR)
    for (const [method, path] of guarded) {
      const response = await request.fetch(path, options(method, token))
      expect(await response.text()).not.toContain('e2e-access-token')
    }
  })
})

test.describe('บันเดิลของ admin โหลดขึ้นจริง', () => {
  test('login แล้วเปิดหน้าปลั๊กอินได้ — DS v1 + webpack + router v5 ทำงานร่วมกันได้', async ({ page }) => {
    await page.goto('/admin/auth/login')
    await page.getByLabel(/email/i).fill(ADMIN.email)
    await page.getByLabel(/password/i).fill(ADMIN.password)
    await page.getByRole('button', { name: /login/i }).click()
    await page.waitForURL(/\/admin(\/.*)?$/)

    await page.goto('/admin/plugins/line-rich-menu')

    // ปุ่มนี้อยู่ในหน้าของอะแดปเตอร์ (ListPage) และวาดด้วย primitive ที่จับคู่กับ DS v1
    // ถ้ามันขึ้น แปลว่า port ทั้งชุดถูกฉีดสำเร็จและไม่มี primitive ตัวไหนเป็น undefined
    await expect(page.getByTestId('create-menu')).toBeVisible()
    await expect(page.getByText('เมนูหลัก')).toBeVisible()
  })
})
```

`examples/v4-app/README.md`
```md
# examples/v4-app

Strapi **4.25.11** ของจริง ใช้เป็น acceptance gate ของ Plan 03 ไม่ใช่ตัวอย่างประกอบ

แอปนี้ **ไม่ได้อยู่ใน pnpm workspace** โดยตั้งใจ — มันต้องเป็นสภาพแวดล้อมเดียวกับของลูกค้า
คือ `node_modules` ที่ติดตั้งด้วย npm และปลั๊กอินที่ติดตั้งจาก tarball ของ `npm pack`
ไม่ใช่ซอร์สที่ลิงก์มา วิธีนี้พิสูจน์ `files` allowlist และไฟล์ shim ที่ root ไปพร้อมกัน

    cp .env.example .env
    pnpm --filter @fosivo/line-mock start &          # จาก root ของ repo
    pnpm build                                        # จาก root ของ repo
    (cd ../../packages/strapi-v4 && npm pack --pack-destination /tmp)
    npm install
    npm install /tmp/strapi-plugin-line-rich-menu-v4-*.tgz
    npm run build && npm run seed
    npm start
    npm run test:e2e
```

- [ ] **Step 4: รันด้วยมือให้ผ่านครั้งแรก**

```bash
pnpm build
pnpm --filter @fosivo/line-mock start &
until curl -sf http://127.0.0.1:4010/v2/bot/info >/dev/null; do sleep 1; done

cd packages/strapi-v4 && npm pack --pack-destination /tmp && cd ../..
cd examples/v4-app
cp .env.example .env
npm install
npm install /tmp/strapi-plugin-line-rich-menu-v4-*.tgz
npm run build
npm run seed
npx strapi start &
until curl -sf http://127.0.0.1:1337/admin >/dev/null; do sleep 2; done
npx playwright install --with-deps chromium
npm run test:e2e
```

ถ้าเส้นทางหลักผ่านครบทุกข้อ **Plan 03 จบ** — ถ้าไม่ผ่าน ให้กลับไปแก้ที่ task ต้นทาง ไม่ใช่แก้เทสต์

- [ ] **Step 5: เพิ่ม job ใน CI**

`.github/workflows/ci.yml` — เพิ่ม job ใหม่ต่อท้าย
```yaml
  e2e-v4:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      # สเปก §13.4 — matrix db เป็นด่านที่พิสูจน์ว่า lock query ของ scheduler (คำนวณเส้นตาย
      # ใน JS ไม่ใช่ INTERVAL ของ Postgres) ทำงานได้จริงทั้งสอง dialect ไม่ใช่แค่ที่เราเดา
      matrix:
        db: [sqlite, postgres]
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: strapi
          POSTGRES_PASSWORD: strapi
          POSTGRES_DB: strapi
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: เริ่ม LINE mock
        run: |
          pnpm --filter @fosivo/line-mock start &
          until curl -sf http://127.0.0.1:4010/v2/bot/info >/dev/null; do sleep 1; done

      - name: แพ็กปลั๊กอินเป็น tarball เหมือนที่ผู้ใช้ได้จาก npm
        run: npm pack --pack-destination "$RUNNER_TEMP"
        working-directory: packages/strapi-v4

      - name: ติดตั้งแอปตัวอย่างและปลั๊กอินจาก tarball
        working-directory: examples/v4-app
        run: |
          cp .env.example .env
          npm install
          npm install "$RUNNER_TEMP"/strapi-plugin-line-rich-menu-v4-*.tgz

      - name: build admin แล้ว seed ผู้ใช้
        working-directory: examples/v4-app
        env:
          DATABASE_CLIENT: ${{ matrix.db }}
        run: |
          set -a && . ./.env && set +a
          export DATABASE_CLIENT=${{ matrix.db }}
          npm run build
          node scripts/seed.js

      - name: บูต Strapi แล้วรัน Playwright
        working-directory: examples/v4-app
        env:
          DATABASE_CLIENT: ${{ matrix.db }}
        run: |
          set -a && . ./.env && set +a
          export DATABASE_CLIENT=${{ matrix.db }}
          npx strapi start &
          until curl -sf http://127.0.0.1:1337/admin >/dev/null; do sleep 2; done
          npx playwright install --with-deps chromium
          npm run test:e2e

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-trace-${{ matrix.db }}
          path: examples/v4-app/test-results
```

- [ ] **Step 6: Commit**

```bash
git add examples/v4-app pnpm-workspace.yaml .github/workflows/ci.yml
git commit -m "test(v4): run the plugin inside a real Strapi 4.25.11 app as the acceptance gate"
```

---

## Self-Review

**1. Spec coverage**

| สเปก | Task | สถานะ |
|---|---|---|
| §2.1 entry point เป็นไฟล์ที่ root ของ package | 13 | ครอบ — มีเทสต์ยืนยันว่า shim มีจริงและแกะ `.default` |
| §2.1 DS v1 · router v5 · `@strapi/helper-plugin` | 19 | ครอบ |
| §2.1 `strapi.entityService` (numeric id) | 15 | ครอบ |
| §2.1 `strapi.cron.add` · `strapi.db.connection` เหมือนกันทั้งสองเวอร์ชัน | 12, 18 | ครอบ — lock อยู่ใน `core` เพื่อไม่ให้ Plan 04 เขียนซ้ำ |
| §3.1 `packages/strapi-v4` (tsup + shim) · `examples/v4-app` | 13, 20 | ครอบ |
| §3.2 ยกสิ่งที่ไม่ต้องพึ่ง Strapi ไป `core` | 1–12 | ครอบ |
| §6.1 ข้อ 1 entry point | 13 | ครอบ |
| §6.1 ข้อ 2 implement `UIPort` | 19 | ครอบ |
| §6.1 ข้อ 3 data access adapter | 15 | ครอบ |
| §6.1 ข้อ 4 content-type · route · permission · cron · i18n | 14, 16, 17, 18, 19 | ครอบ |
| §6.2 `Repo<T>` และ id เป็น string เสมอ | 1, 15 | ครอบ |
| §6.3 หมายเหตุ Community Edition | 17 | ครอบ — บันทึกไว้ ไม่ต้องเขียนโค้ดเพิ่ม |
| §7.1 content type ทั้งสี่ | 14 | ครอบ (มีสามข้อที่ต่างจากสเปก ดูตารางคำตัดสิน) |
| §7.2 plugin config | 15 | ครอบ + validator แบบ `.strict()` |
| §7.3 รูปผ่าน `plugin::upload.file` | 7, 15 | ครอบ — `ImageStore` เป็น port, adapter ต่อกับ upload plugin |
| §8 validate → create → เขียน id ทันที → upload → alias/default → deleteOld | 10 | ครอบ |
| §8 compensation ไม่ทิ้งขยะ | 10 | ครอบ — capture/restore + property test ของสถานะ |
| §8 reconcile job (รายงาน ไม่ลบ) | 11, 16, 20 | ครอบ |
| §9 alias เป็น default behavior · `richmenuswitch` ชี้ alias · error เมื่อ alias ยังไม่ publish | 8, 11, 16 | ครอบ |
| §10 cron ทุกนาที · conditional UPDATE lock · `POST /schedules/tick` | 12, 16, 18 | ครอบ |
| §11.2 AES-256-GCM · IV ต่อ record · key จาก config หรือ `APP_KEYS[0]` | 2 | ครอบ |
| §11.2 repository ตัดความลับโดยปริยาย · `withSecrets()` | 4 | ครอบ — บังคับด้วย type ไม่ใช่ด้วยวินัย |
| §11.2 redact 4 ตัวท้าย · log scrubber ทุก level | 2, 3 | ครอบ |
| §11.3 zod ที่ขอบทุก route · `.strict()` | 16 | ครอบ |
| §11.3 `uri` scheme ที่อนุญาต | 16 | ครอบที่ขอบ route ด้วย (core บังคับอยู่แล้วตั้งแต่ Plan 01) |
| §11.3 knex ใช้ binding เท่านั้น | 12 | ครอบ — interface ไม่มี `raw` ให้เรียก |
| §11.3 magic bytes · `limitInputPixels` | 7 | ครอบผ่าน `inspectImage` ของ Plan 01 ที่ `prepareImage` เดินผ่านเสมอ |
| §11.4 ทุก route เป็น `type: 'admin'` + `admin::hasPermissions` | 16, 17 | ครอบ |
| §11.4 สี่สิทธิ์ · `settings` แยกจาก `publish` | 16, 17 | ครอบ |
| §11.4 rate limit ที่ endpoint publish (token bucket ต่อ channel) | 6, 10 | ครอบ |
| §11.5 audit ครบทุกฟิลด์ · ทุกเส้นทางรวมที่ล้ม · append-only | 5, 14 | ครอบ |
| §11.6 ไม่มี `postinstall` | 13 | ครอบ — มีเทสต์บังคับ |
| §11.7 typed error ที่มี code · ไม่ส่งข้อความดิบขึ้น UI | 16 | ครอบ |
| §12 i18n `en`/`th` · `registerTrads` ของ v4 | 19 | ครอบ |
| §13.1 ชั้น adapter: `examples/v4-app` + Playwright | 20 | ครอบ |
| §13.2 ข้อ 1 RBAC matrix | 17, 20 | ครอบ — โครงสร้างที่ 17, 403 จริงที่ 20 |
| §13.2 ข้อ 2 token ไม่รั่วใน response ใด ๆ | 4, 16, 20 | ครอบ — ค้นแบบ deep ทั้งสามชั้น |
| §13.2 ข้อ 3 log scrubbing | 3 | ครอบ |
| §13.2 ข้อ 4 encryption round-trip · IV ไม่ซ้ำ · แก้ 1 ไบต์ต้องพัง | 2 | ครอบ |
| §13.2 ข้อ 8 audit completeness | 5, 10, 11, 12 | ครอบ |
| §13.4 e2e matrix strapi 4 × db[sqlite, postgres] × node 20 | 20 | ครอบ |
| **§11.6 provenance · Dependabot · 2FA บน npm** | — | **เลื่อนไป Plan 04 โดยตั้งใจ** — เป็นงานตอนปล่อยเวอร์ชัน ไม่ใช่งานของอะแดปเตอร์ |
| **§13.2 ข้อ 5, 6, 7 (PNG bomb · magic byte · uri scheme)** | — | **ครอบแล้วตั้งแต่ Plan 01** ใน `tests/image/guards.test.ts` และ `tests/schema.test.ts` — Task 7 และ 16 เดินผ่านด่านเดิม ไม่ได้เขียนด่านใหม่ |
| **§13.3 การทดสอบ image pipeline (perceptual hash, fixture)** | — | **ครอบแล้วตั้งแต่ Plan 01** — Task 7 ใช้ fixture ชุดเดิมและไม่ทำซ้ำ |
| **§13.4 `strapi-plugin verify`** | — | **v5 เท่านั้น** — `@strapi/sdk-plugin` ใช้กับ v4 ไม่ได้ (§3.1) ไปอยู่ใน Plan 04 |
| **§14 demo hosting** | — | **Plan 04** |
| **§4.2 `linkToUser`** | — | **นอกขอบเขต v1.0 ตามสเปก §1.4** — client มีให้แล้วใน core แต่ไม่มี UI และไม่มี route |

**2. Placeholder scan** — ไล่หา `TBD`, `TODO`, `เหมือน Task`, "จัดการ error ตามความเหมาะสม" แล้วไม่พบ ทุก step มีโค้ดจริงและคำสั่งรันจริง จุดที่ใกล้เคียงที่สุดสองจุดถูกทำให้ชัดเจนแล้ว: (ก) `src/server/tick.ts` ใน Task 16 เป็นไฟล์ชั่วคราวที่มีเนื้อครบและถูกเขียนทับใน Task 18 ซึ่งระบุไว้ตรงนั้น ไม่ใช่ปล่อยให้เดา · (ข) คำแปลสามคีย์ใน Task 19 Step 6 มีข้อความทั้งสองภาษาเขียนไว้ครบ ไม่ได้บอกแค่ว่า "เพิ่มคีย์"

**3. Type consistency** — ตรวจแล้ว
- `Repo<T>` ประกาศครั้งเดียวใน Task 1 และทุก repo ใน Task 15 กับทุก fake repo ในเทสต์ implement รูปทรงเดียวกัน
- `RichMenuRow` มี `updatedAt` ตั้งแต่ Task 1 เพราะ `RichMenuSummary` ของ `packages/ui/src/api.ts` ต้องการ — fixture ในเทสต์ของ Task 8, 10, 11, 12 และ mapping ใน Task 15 มีฟิลด์นี้ครบตรงกัน
- `publishedAt` (ชั้น service) ⇄ `linePublishedAt` (คอลัมน์) แปลงที่ `repo.ts` ที่เดียว — Task 14 มีเทสต์ว่าไม่มี attribute ชื่อ `publishedAt` และ Task 15 มีเทสต์ว่าเขียนกลับด้วยชื่อคอลัมน์
- `channelId` (ชั้น service) ⇄ relation `channel` แปลงที่ `repo.ts` ที่เดียวเช่นกัน ทั้งขาอ่าน ขาเขียน และขา filter
- `MenuNotReadyError` รับ `'no_image' | 'no_areas' | 'no_channel' | 'not_published'` ประกาศครั้งเดียวใน Task 1 และ Task 7, 8, 11 ใช้เฉพาะค่าจากรายการนี้
- `ScheduleLock` ที่ Task 12 สร้าง ตรงกับที่ `createScheduler` และ `Services.lock` คาดหวัง
- `AuditEntry` / `AuditContext` ที่ Task 5 สร้าง ถูกใช้เหมือนกันใน Task 10, 11 และ controller ของ Task 16
- `PERMISSION` ประกาศใน Task 16 และถูกทั้ง route (Task 16), bootstrap (Task 17) และ menu link ของ admin (Task 19) อ้างถึงตัวเดียวกัน — Task 17 มีเทสต์ที่ประกอบ `plugin::${pluginName}.${uid}` แล้วเทียบกับ `PERMISSION` ตรง ๆ
- `UIPrimitives` 16 ตัวใน `packages/ui/src/port.ts` ตรงกับรายการใน `primitives.tsx` และเทสต์ของ Task 19 บังคับให้ตรงกันแบบ set-equality
- `DEFAULT_SCHEDULE_TABLE` ใน `core/server/lock.ts` กับ `collectionName` ของ `rich-menu-schedule` ถูกผูกกันด้วยเทสต์ใน Task 14

**4. คำตัดสินที่ทำเอง และจุดที่ผู้รีวิวควรดูซ้ำ**

| # | คำตัดสิน | เหตุผลสั้น ๆ | ควรดูซ้ำ |
|---|---|---|---|
| 1 | ชั้น service ทั้งหมดอยู่ใน `packages/core/src/server/` | §3.1 ไม่มีแพ็กเกจร่วม แต่ §3.2 บอกหลักตรงกันข้าม — เดินตาม §3.2 ตาม design notes ข้อ 1 | |
| 2 | ยาม `/browser` เปลี่ยนจาก denylist ของ symbol เป็นการเดินกราฟ import | denylist จับโมดูลใหม่ที่ยังไม่มีชื่อในลิสต์ไม่ได้ — คอมเมนต์ในไฟล์เดิมยอมรับเอง | |
| 3 | `normalize` เกิดตอน **save เมนู** ไม่ใช่ตอน upload หรือ publish | UI ที่ปล่อยไปแล้วอัปผ่าน `POST /upload` ของ Strapi ตรง ๆ ขั้น save เป็นจุดสัมผัสฝั่งเซิร์ฟเวอร์จุดเดียวที่เหลือ | **ใช่** — proxy timeout ต่ำกว่า ~10 วิ ยังชนได้ในเคสรูป noise หลายช่อง ทางแก้จริงคือคิวงาน |
| 4 | `buildPayload` **ย่อ `bounds`** ตามขั้นบันไดที่รูปลงจริง | เอา `size` ใหม่ไปคู่กับ `bounds` เดิมทำให้ทุกช่องล้นกรอบและถูกปฏิเสธทั้งเมนู | |
| 5 | เก็บ `accessTokenLast4` เป็นคอลัมน์ต่างหาก (เพิ่มจาก §7.1) | เส้นทาง list/get จึงไม่ต้องถอดรหัสเลย — ไม่มีอะไรให้ leak ตั้งแต่ต้น | |
| 6 | เพิ่ม `normalizedImage` / `normalizedMime` / `normalizedWidth` / `normalizedHeight` (เพิ่มจาก §7.1) | ผลของ `normalize` ต้องอยู่ในฐานข้อมูล ไม่งั้น publish ต้องคำนวณใหม่ทุกครั้ง | |
| 7 | `publishedAt` → คอลัมน์ `linePublishedAt` | `publishedAt` เป็นชื่อที่ Strapi จองไว้ ประกาศทับแล้ว content type โหลดไม่ขึ้น | |
| 8 | `rich-menu-audit` เก็บ `actorId`/`channelId`/`richMenuId` เป็น integer ไม่ใช่ relation (ต่างจาก §11.5) | audit ต้องอยู่รอดหลังของที่มันอ้างถึงถูกลบ ซึ่งเป็นตอนที่ประวัติมีค่าที่สุด | **ใช่** |
| 9 | `actor` เป็น null ได้ และงานจาก cron บันทึกเป็น null | tick ไม่มีผู้ใช้ที่กดปุ่ม — การปลอมเป็น user คนใดคนหนึ่งแย่กว่าการบอกว่าไม่มี | |
| 10 | `aliasId` ไม่ประกาศ `unique` ที่ schema — บังคับที่ชั้น validation แทน | §7.1 ต้องการ unique **ต่อ channel** ซึ่ง Strapi 4 ประกาศ composite unique ไม่ได้ | |
| 11 | ช่วงเวลาแสดงผลของฟอร์ม (`startAt`/`endAt`) ถูกเก็บเป็นแถว `rich-menu-schedule` | ทำให้ §10 กับหน้าจอของ §5.7 เป็นเรื่องเดียวกัน แทนที่จะมีสองระบบเวลา | **ใช่** |
| 12 | lock ใช้ query builder + เส้นตายที่คำนวณใน JS (ไม่ใช่ `NOW() - INTERVAL`) | `INTERVAL` เป็นไวยากรณ์ Postgres ส่วน gate รันบน sqlite ด้วย — และ builder ผูก binding โดยโครงสร้าง | |
| 13 | claim ตั้ง `state = 'running'` และรับทั้ง `pending`/`running` | ใช้ state ที่ §7.1 ประกาศไว้จริง และทำให้ worker ที่ตายกลางทางถูกเก็บกวาดได้ ยังเป็น UPDATE เดียว | **ใช่** |
| 14 | `lock.ts` อยู่ใน `core` ไม่ใช่ใน adapter | `strapi.db.connection` เป็น knex เหมือนกันทั้งสองเวอร์ชัน — Plan 04 จะได้ไม่ต้องเขียนซ้ำ | |
| 15 | rate limit ตรวจ **นอก** `audit.around` | คำขอที่ถูกปฏิเสธไม่ได้แตะ LINE และการปล่อยให้กดรัวสร้างแถว audit คือช่องถมตาราง | **ใช่** |
| 16 | audit ที่เขียนไม่ลงถูก log แล้วกลืน ไม่กลบ error จริง | การกลบ error ต้นทางทำให้ debug ไม่ได้เลย ส่วนแถวที่หายยังมีร่องรอยที่ log | **ใช่** |
| 17 | สี่สิทธิ์: `read` · `write` · `publish` · `settings` | ตาม **ตาราง** ของ §11.4 (แถว create/update คือสิทธิ์เดียว) ไม่ใช่รายการห้าชื่อใน §1.3 | |
| 18 | `GET /channels` ใช้ `read` ไม่ใช่ `settings` | หน้ารายการต้องเลือก channel ก่อน และ response ไม่มีความลับอยู่แล้ว | |
| 19 | `POST /schedules/tick` ยังเป็น `type: 'admin'` + `publish` | §11.4 เขียนว่าไม่มีข้อยกเว้น — ผู้เรียกจากภายนอกใช้ admin API token | **ใช่** |
| 20 | `LineClient` เพิ่ม `getDefault()` / `getAlias()` และ 404 กลายเป็น `LineNotFoundError` | compensation ต้องแยก "ไม่มีของ" ออกจาก "payload ผิด" ให้ได้ | |
| 21 | i18n import ค่าคงที่จาก `packages/ui` ตรง ๆ แทน build step ที่คัดลอกไฟล์ (§12 เขียนว่าคัดลอก) | ผลเหมือนกันแต่ไม่มีทางลืม sync | |
| 22 | เขียน `prefixTranslations` เองแทน `prefixPluginTranslations` ของ helper-plugin | สามบรรทัด และ helper-plugin ไม่มีใน v5 — ไฟล์นี้ย้ายตามไปได้ทันที | |
| 23 | `toast` ของ `danger` ถูกจับคู่กับ `warning` | `useNotification` ของ 4.25 ไม่มีชนิด `danger` | |
| 24 | ประกาศ `interface StrapiV4` เอง แทน import type จาก `@strapi/strapi` | type ของ v4 กว้างและกำลังจะหายไป การประกาศเองทำให้ไฟล์เดิมคอมไพล์ผ่านบน v5 | |
| 25 | `examples/v4-app` ติดตั้งปลั๊กอินจาก `npm pack` และอยู่นอก pnpm workspace (§3.1 เขียนว่า yalc) | tarball พิสูจน์ `files` allowlist และ shim ที่ root ไปด้วย ส่วน yalc ลิงก์ซอร์สที่ยังไม่ผ่านขั้นแพ็ก | **ใช่** |
| 26 | Playwright แยกสองชั้น: API เดินเส้นทางเต็ม เบราว์เซอร์พิสูจน์ว่าบันเดิล admin โหลดขึ้น | การไล่ลากกล่องบน canvas ผ่านเบราว์เซอร์เปราะมากโดยไม่เพิ่มความมั่นใจเกิน Plan 02 | |
| 27 | `DEFAULT_CHAT_BAR_TEXT = 'Menu'` สำหรับโหมด default | ฟิลด์นี้บังคับเสมอ และค่าที่เติมต้องไม่ขึ้นกับภาษาของ admin ที่กด save | |

---

## แผนถัดไป

Plan 03 จบแล้วได้ **ชั้น service ที่ทดสอบได้โดยไม่ต้องบูต Strapi และปลั๊กอิน v4 ที่รันบน Strapi 4.25.11 จริง ผ่านเส้นทาง publish ครบวง** — ประมาณ 3.5–4 วัน (สเปก §15 ให้ Phase 3 = 2 วัน กับ Phase 5 = 1.5–2 วัน ซึ่งงานความปลอดภัยของ Phase 5 ถูกทำไปพร้อมกันในแผนนี้แล้ว)

**สิ่งที่ส่งต่อให้ Plan 04**

- **v5 adapter เหลือแค่สามชิ้น** — `Repo` ที่เขียนด้วย `documents()`, `UIPrimitives` ที่จับคู่กับ DS v2, และ boilerplate ลงทะเบียนแบบ `exports` map + `@strapi/sdk-plugin` ส่วน `lock.ts`, `tick.ts`, `translations.ts`, `validation.ts`, `http-error.ts` และ `permissions.ts` ย้ายไปได้เกือบทั้งดุ้น
- **`ImageStore` ของ v5 ต่างจาก v4** — `strapi.plugins.upload` ใน v5 ไม่รับไฟล์แบบ formidable เหมือนกัน ต้องตรวจสัญญาใหม่ที่จุดนั้นจุดเดียว
- **`prepareImage` ยังทำงานในคำขอ save** — ถ้าลูกค้ารายไหนตั้ง proxy timeout ต่ำ ต้องยกไปเป็นคิวงาน ซึ่งเป็นการเปลี่ยนสัญญาของ `POST /menus` (จะกลายเป็น 202) ไม่ใช่การแก้ภายใน
- **rate limiter เป็น in-memory ต่อ process** — ระบบที่รันหลาย instance จะได้เพดานคูณตามจำนวน instance ยังห่างจาก rate limit จริงของ LINE มาก แต่ควรเขียนไว้ใน README
- **`toHttpError` มีตาราง code → status ที่ต้องขยายทุกครั้งที่ core เพิ่ม typed error** — code ที่ไม่รู้จักตกเป็น 500 `internal_error` ซึ่งปลอดภัยแต่เงียบ
- **`aliasId` unique ต่อ channel บังคับที่ชั้น application ไม่ใช่ที่ฐานข้อมูล** — สอง request พร้อมกันที่ใช้ alias เดียวกันยังลอดได้ตามทฤษฎี ถ้าจะปิดจริงต้องมี unique index ที่เขียนด้วย migration เอง
- **`examples/v5-app`, README พร้อมภาพหน้าจอ, deploy demo และการปล่อย 1.0.0** ทั้งหมดอยู่ใน Plan 04 ตาม design notes ข้อ 4

| Plan | ขอบเขต |
|---|---|
| **04 — adapter v5 + release** | `documents()` repo, DS v2, `@strapi/sdk-plugin`, i18n ทั้งสองเวอร์ชัน, `examples/v5-app`, README + screenshots, deploy demo, เตรียม publish 1.0.0 ให้เหลือคำสั่งเดียว |

---

# ภาคผนวก — Task 21 (controller เพิ่มหลังตรวจแผน)

## ทำไมถึงมีข้อนี้

ตารางความครอบคลุมด้านบนบันทึก §8 ข้อ 3 ว่า "ครอบ" โดยอ่านมันเป็น **"รายงาน ไม่ลบ"** แต่ประโยคจริงในสเปกคือ

> reconcile job — เทียบ `GET /v2/bot/richmenu/list` กับ DB แล้วรายงานเมนูกำพร้า
> (**ไม่ลบอัตโนมัติ** เพราะอาจมีเมนูที่สร้างจากที่อื่น) **ให้ผู้ใช้กดลบเอง**

สองท่อนนั้นไม่ใช่เรื่องเดียวกัน ท่อนแรกห้ามระบบลบเอง ท่อนที่สองสั่งให้มีทางให้คนลบ แผนทำท่อนแรกครบ
และไม่ได้ทำท่อนที่สองเลย ผลคือตอนนี้:

- `reconcileChannel` คืน `orphans: string[]` ออกมาได้ แต่**ไม่มีเส้นทางไหนลบมันได้** — `DELETE /menus/:id`
  ลบด้วย id ของฐานข้อมูล ส่วนเมนูกำพร้าคือเมนูที่**ไม่มีแถวในฐานข้อมูล** นั่นคือนิยามของมัน สิ่งเดียวที่
  มันมีคือ rich menu id ฝั่ง LINE
- `packages/ui` ที่ปล่อยไปแล้วไม่มีอะไรเรียก `/channels/:id/reconcile` เลย ทั้งแพ็กเกจ

เมนูกำพร้ากินโควตาของ channel (LINE จำกัดจำนวน rich menu ต่อ channel) การรายงานว่ามีขยะโดยไม่มีที่กดเก็บ
คือการบอกผู้ใช้ว่าเขามีปัญหาแล้วปิดประตูใส่

Task นี้ปิดท่อนที่สอง ทำทั้ง route และ UI ในข้อเดียวเพราะ route ที่ไม่มีใครเรียกคือโค้ดตาย และการปล่อย
โค้ดตายไปกับ 1.0 แย่กว่าการไม่มีมัน

## Task 21: ลบเมนูกำพร้าได้จริง — route ที่ลบด้วย id ฝั่ง LINE + แผงในหน้า channel

**Files:**
- Modify: `packages/core/src/server/menu-ops.ts` — เพิ่ม `deleteOrphan`
- Modify: `packages/core/tests/server/menu-ops.test.ts`
- Modify: `packages/strapi-v4/src/server/routes.ts` · `src/server/controllers/channels.ts`
- Modify: `packages/ui/src/api.ts` — เพิ่ม `channelReconcile` และ `channelOrphan`
- Modify: `packages/ui/src/pages/ChannelSettings.tsx` · `packages/ui/tests/channels.test.tsx`
- Modify: `packages/ui/src/translations/{en,th}.json`

**Interfaces:**
- Produces:
  - `function deleteOrphan(deps: MenuOpsDeps, input: { channelId: string; lineRichMenuId: string }): Promise<void>`
  - `ENDPOINTS.channelReconcile = (id: string) => \`/line-rich-menu/channels/${id}/reconcile\``
  - `ENDPOINTS.channelOrphan = (id: string, lineRichMenuId: string) => \`/line-rich-menu/channels/${id}/orphans/${lineRichMenuId}\``

**สิ่งที่ต้องได้ และเหตุผลของแต่ละข้อ**

1. **`deleteOrphan` ต้องยืนยันว่ามันกำพร้าจริงก่อนลบ** — เรียก `reconcileChannel` ใหม่แล้วตรวจว่า
   `lineRichMenuId` ที่ขอมาอยู่ใน `orphans` จริง ถ้าไม่อยู่ให้โยน `MenuNotReadyError('not_published')`
   ห้ามเชื่อ id ที่ client ส่งมาแล้วยิง `DELETE` ให้ LINE ทันที มิฉะนั้นผู้ใช้ที่มีสิทธิ์ `publish`
   จะลบเมนูที่ **กำลังใช้งานอยู่** ได้ด้วยการเดา id ซึ่งเป็นการยกระดับสิทธิ์ที่แผงหน้าจอไม่ได้ตั้งใจให้
   รายงานที่ผู้ใช้เห็นอาจเก่าไปแล้วหลายนาที การตรวจซ้ำตอนลบจึงไม่ใช่ของฟุ่มเฟือย

2. **เขียน audit ทั้งขาสำเร็จและขาล้ม** ด้วย `action: 'delete'`, `channel`, `before` เป็น
   `{ lineRichMenuId }` และ `after` เป็น `null` — เดินผ่าน `audit.around` เหมือน op อื่นใน Task 11
   ไม่ใช่เขียนเอง

3. **route ใช้สิทธิ์ `publish`** ไม่ใช่ `write` — มันเปลี่ยนสิ่งที่มีอยู่บน LINE จริง ซึ่งเป็นเส้นแบ่ง
   เดียวกับที่ §11.4 ใช้แยก `publish` ออกจาก `write` ตั้งแต่ต้น

4. **แผงใน `ChannelSettings`** — ปุ่มต่อ channel ที่เรียก reconcile แล้วแสดงผลสองรายการ
   `orphans` มีปุ่มลบรายตัว ส่วน `missing` **แสดงอย่างเดียวไม่มีปุ่ม** เพราะมันคือแถวใน DB ที่บอกว่า
   published แต่ของบน LINE หายไปแล้ว การลบทิ้งไม่ได้แก้อะไร สิ่งที่ผู้ใช้ต้องทำคือ publish ใหม่

5. **ปุ่มลบต้องถามยืนยันก่อน** และข้อความยืนยันต้องมี id ที่จะลบอยู่ในนั้น — เป็นการลบของบนระบบจริง
   ที่ย้อนไม่ได้ ใช้ `ui.Modal` เหมือนที่ `TemplatePicker` ทำตอนเปลี่ยน template

6. **ข้อความทุกตัวผ่าน `t()`** และเพิ่มคีย์ครบทั้ง `en` และ `th` โดยเรียงตามคีย์ — เทสต์
   allowlist คำทับศัพท์ใน `i18n.test.ts` จะแดงถ้าคำแปลไทยเผลอเหมือนอังกฤษ

7. **เทสต์ที่ต้องมี** — `deleteOrphan` ปฏิเสธ id ที่ไม่ได้อยู่ในรายงาน (ข้อ 1 คือหัวใจ ต้องมีเทสต์ที่
   ล้มเมื่อเอาการตรวจซ้ำออก) · audit ถูกเขียนทั้งสองขา · แผงเรียก endpoint ถูกตัว · ปุ่มลบเรียกเฉพาะ
   หลังยืนยัน · `missing` ไม่มีปุ่มลบ

**Commit** — แยกเป็นสาม: `feat(core): let a verified orphan be deleted`,
`feat(v4): expose orphan cleanup on the channel route`,
`feat(ui): show the reconcile report and let an orphan be removed`

---

# คำตัดสินของ controller ต่อแปดข้อที่ผู้เขียนแผนติดธงไว้

ทั้งแปดข้อรับตามที่เสนอ ยกเว้นข้อ 3 ที่ต้องเพิ่มเทสต์หนึ่งตัว และข้อ 1 กับ 7 ที่ต้องไปโผล่ใน README
ของ Plan 04 ไม่ใช่หายไปเฉย ๆ

| ข้อ | คำตัดสิน |
|---|---|
| 1 · normalize ตอน save | **รับ** พร้อมข้อจำกัดที่ระบุไว้ ทางแก้จริงคือคิวงานซึ่งเปลี่ยน `POST /menus` เป็น 202 — เป็นการเปลี่ยนสัญญา ไม่ใช่การแก้ภายใน จึงไม่ใช่ของ 1.0 **แต่ต้องเขียนไว้ใน README ว่ารูปที่บีบยากหลายช่องอาจใช้เวลาเกิน 10 วินาที** ผู้ใช้ที่ตั้ง proxy timeout ต่ำต้องรู้ล่วงหน้า ไม่ใช่มารู้ตอนมันพัง |
| 2 · audit เก็บ integer ไม่ใช่ relation | **รับ** เหตุผลถูกต้องและสำคัญกว่าการเดินตาม §11.5 ตามตัวอักษร — ประวัติที่หายไปพร้อมของที่มันบันทึกคือประวัติที่ไร้ประโยชน์ตรงจุดที่ต้องใช้มันที่สุด |
| 3 · ช่วงเวลาแสดงผลเป็นแถว schedule | **รับ แต่ต้องมีเทสต์ round-trip** — ฟอร์มเขียน `startAt`/`endAt` ลงเป็นแถว `set-default`/`clear-default` แล้วตอนเปิดเมนูกลับมาแก้ต้องอ่านกลับขึ้นฟอร์มได้ค่าเดิมเป๊ะ ถ้าขาขึ้นกับขาลงไม่สมมาตร ผู้ใช้จะเปิดเมนูที่ตั้งเวลาไว้แล้วเห็นช่องว่าง แล้วกด save ทับเวลาที่ตัวเองตั้งไว้โดยไม่รู้ตัว เทสต์ต้องอยู่ที่ Task 15 (ชั้น repo) และครอบทั้งกรณีตั้งครบสองค่า ตั้งค่าเดียว และไม่ตั้งเลย |
| 4 · claim ตั้ง `running` และรับทั้ง `pending`/`running` | **รับ** — ยังเป็น UPDATE เดียว ใช้ state ที่ §7.1 ประกาศจริง และกู้งานของ worker ที่ตายกลางทางได้ ซึ่ง snippet ในสเปกทำไม่ได้เพราะไม่มีคอลัมน์ state เลย |
| 5 · rate limit อยู่นอก `audit.around` | **รับ** — คำขอที่ถูกปฏิเสธไม่ได้แตะ LINE จึงไม่ใช่เหตุการณ์ที่ §11.5 ต้องการ และการปล่อยให้กดรัวสร้างแถว audit คือช่องถมตารางที่เปิดให้ใครก็ได้ที่มีสิทธิ์ publish |
| 6 · audit เขียนไม่ลง → log แล้วกลืน | **รับ** — ตอนที่ audit ล้ม LINE ถูกแตะไปแล้ว การโยน error ทับจะรายงานว่า publish ล้มทั้งที่มันสำเร็จ ซึ่งผิดกว่าการมีแถวหาย และการกลบ error ต้นทางทำให้ไล่ปัญหาจริงไม่ได้เลย |
| 7 · `POST /schedules/tick` ต้องใช้ admin token | **รับ** — §11.4 เขียนว่าไม่มีข้อยกเว้น และการเปิดรูให้ endpoint ที่สั่งงานจริงได้โดยไม่ต้องยืนยันตัวตนเป็นราคาที่แพงกว่าความไม่สะดวก **แต่ต้องมีตัวอย่าง `curl` พร้อม header ใน README** ไม่งั้นคนที่ปิด scheduler แล้วยิงจากข้างนอกจะเจอ 403 โดยไม่รู้ว่าต้องทำอะไร |
| 8 · `npm pack` แทน yalc | **รับ และดีกว่าที่สเปกเขียน** — tarball พิสูจน์ `files` allowlist กับ shim ที่ root ไปด้วย ซึ่งเป็นสองอย่างที่ถ้าผิดแล้วปลั๊กอินโหลดไม่ขึ้นบนเครื่องลูกค้า ส่วน yalc ลิงก์ซอร์สที่ยังไม่ผ่านขั้นแพ็ก จึงพิสูจน์สองอย่างนั้นไม่ได้เลย |
