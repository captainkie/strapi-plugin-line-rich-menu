# LINE Rich Menu — Plan 04: adapter ของ Strapi 5 + การเตรียมปล่อย 1.0.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิดงานทั้งโปรเจกต์ให้เหลือ "คำสั่งเดียว" สองคำสั่งที่เป็นสิทธิ์ของเจ้าของ — (ก) **adapter ของ Strapi 5** ที่จ่ายให้ชั้น service ของ `packages/core/src/server/` เพียงสามอย่างเหมือนที่ v4 จ่าย คือ `Repo` ที่เขียนด้วย `documents()`, `UIPrimitives` ที่จับคู่กับ Design System v2 และ boilerplate ลงทะเบียนแบบ `exports` map ผ่าน `@strapi/sdk-plugin` (ข) **ทุกอย่างที่ 1.0.0 ต้องมีก่อนขึ้นชั้น** — `examples/v5-app` เป็น acceptance gate, custom layout ที่ผู้ใช้กดถึงได้จริง, README พร้อมภาพหน้าจอ, กรอบสัญญาอนุญาต AGPL-3.0 + commercial, ส่วนรับบริจาค, demo hosting, changesets, `npm publish --provenance` ผ่าน GitHub Actions OIDC และ `strapi-plugin verify`

**Architecture:** Plan 03 ยกชั้น service ทั้งชั้นไปไว้ที่ `packages/core/src/server/` แล้ว (design notes ข้อ 1) แผนนี้จึงไม่ได้ re-litigate publish semantics อีกเลย — สิ่งที่แตกต่างจริงระหว่างสองเวอร์ชันเหลือแค่ผิวสามชั้น: **ชั้นข้อมูล** (`entityService` ที่คืน id เป็นตัวเลข กับ `documents()` ที่คืน `documentId` เป็นสตริง), **ชั้น UI** (DS v1 ที่ทุกอินพุตถือ label/error ของตัวเอง กับ DS v2 ที่วางอยู่บน Radix และแยก `Field.*` ออกมาต่างหาก) และ **ชั้นลงทะเบียน** (ไฟล์ shim ที่ root กับ `exports` map) ไฟล์ที่เหลือ — `permissions.ts`, `http-error.ts`, `menu-write.ts`, `translations.ts` — ย้ายมาได้เกือบทั้งดุ้น ส่วน `validation.ts` กับการต่อสาย `lock.ts` **ย้ายทั้งดุ้นไม่ได้** ด้วยเหตุผลที่ Plan 03 มองไม่เห็นตอนเขียนโน้ตส่งต่อ (ดู "คำตัดสินที่แผนนี้ทำ" ท้ายไฟล์ ข้อ 3 และข้อ 4)

**Tech Stack:** TypeScript 5.6 · zod ^3.23.8 · sharp ^0.35.3 · vitest 3 (+ jsdom สำหรับเทสต์ฝั่งแอดมิน) · `@strapi/sdk-plugin` **^6.1.1** (Vite ข้างใน) · Strapi **5.52.1** / Node **20.20.0** / Community Edition · `@strapi/design-system` **^2.2.4** · `@strapi/icons` **^2.2.4** · react-router-dom **v6** · styled-components **v6** · changesets · Playwright

**Spec:** `docs/superpowers/specs/2026-08-20-line-rich-menu-strapi-plugin-design.md` — §2.1 (ตารางความต่าง v4/v5), §3.1 (โครงสร้าง monorepo และเครื่องมือ build), §6 (หน้าที่ของ adapter), §11.6 (supply chain), §12 (i18n), §13.4 (CI pipeline), §14 (demo hosting) และ §17 (สิ่งที่ตัดสินใจแล้ว — โดยเฉพาะแถว "ขอบเขต v1.0" ที่เป็นคนตอบคำถามค้างเรื่อง custom layout)

**สิ่งที่ส่งต่อมา:** `docs/superpowers/plans/2026-08-20-line-rich-menu-carry-forward.md` — อ่านหัวข้อ **"For Plan 04 — release"**, **"Release-task items"**, **"จาก Plan 02's whole-branch review"** และ **"From Plan 03"** ให้ครบก่อนเริ่ม · `docs/superpowers/plans/2026-08-20-line-rich-menu-03-04-design-notes.md` ข้อ 4 นิยามขอบเขตของแผนนี้ · หัวข้อ "แผนถัดไป" ท้าย `2026-08-20-line-rich-menu-03-server-and-v4.md` คือรายการสิ่งที่ Plan 03 ตั้งใจส่งมา

**สัญญาที่ผูกอยู่แล้ว:** `packages/ui/src/port.ts` คือสัญญาที่ `admin/src/primitives.tsx` ต้อง implement ให้ครบ **ห้ามแก้ `port.ts` เพื่อให้ DS v2 ง่ายขึ้น** — `packages/strapi-v4` implement สัญญาชุดเดียวกันนี้ผ่านมาแล้ว การขยับสัญญาตอนนี้แปลว่าต้องกลับไปแก้ v4 ด้วยเสมอ · `packages/ui/src/api.ts` — `ENDPOINTS` คือ path ที่ route ของ v5 ต้อง implement ให้ตรงเป๊ะกับ v4

---

## Global Constraints

ทุก task อยู่ภายใต้ข้อจำกัดเหล่านี้เสมอ

- **`packages/strapi-v5` ต้องติดตั้งได้จาก npm จริงตั้งแต่วันแรก** — กับดักเดียวกับที่ Plan 03 Task 20 เพิ่งเจอ: `packages/strapi-v4` เคยประกาศแพ็กเกจพี่น้องเป็น `workspace:*` ใน `dependencies` ซึ่ง `npm install` ปฏิเสธด้วย `EUNSUPPORTEDPROTOCOL` และเทสต์ 608 ตัวไม่มีตัวไหนจับได้เลยเพราะทุกตัวรันในเวิร์กสเปซที่ pnpm ลิงก์ให้แล้ว **Task 1 วางด่านนี้ก่อนเขียนโค้ดจริงแม้แต่บรรทัดเดียว** ไม่ใช่ไปเจอตอน acceptance อีกรอบ
- **`@fosivo/line-rich-menu-core` และ `@fosivo/line-rich-menu-ui` อยู่ที่ `devDependencies` เท่านั้น ห้ามอยู่ที่ `dependencies`** — `@strapi/sdk-plugin` ตั้ง external จาก `dependencies` + `peerDependencies` เท่านั้น (ยืนยันจาก `dist/vite-config-*.mjs` ฟังก์ชัน `getExternals`) ทุกอย่างนอกสองรายการนั้นถูกรวมเข้าบันเดิลโดยอัตโนมัติ ซึ่งให้ผลเดียวกับ `noExternal` ของ tsup ฝั่ง v4 พอดี
- **ห้ามมี `postinstall` / `prepare` / `prepublish` script** ในแพ็กเกจที่ปล่อย (สเปก §11.6) — `strapi-plugin build` ต้องถูกเรียกจาก `pnpm build` ที่ root ไม่ใช่จาก lifecycle hook ของ npm
- **ชั้น service มองเห็น `id: string` เสมอ** (สเปก §6.2) — v5 คืน `documentId` เป็น string อยู่แล้ว ไม่ต้องแปลง แต่ **`documentId` ไม่ใช่ตัวเลข** อะไรก็ตามที่สมมติว่า id เป็นตัวเลขได้ (regex `^\d+$`, `Number(id)`, คอลัมน์ `integer`) จะพังเงียบ ๆ ทั้งหมด
- **`packages/core` และ `packages/ui` ห้ามถูกแก้เพื่อให้ v5 ง่ายขึ้น** — ยกเว้น Task 11 และ Task 12 ซึ่งเป็นงาน release ของ `packages/ui` ที่ตกลงไว้ล่วงหน้าแล้ว ถ้าเจอว่า v5 ต้องการอะไรจาก `core` ที่ยังไม่มี ให้หยุดแล้วรายงาน อย่าเพิ่มผิวใหม่เข้า `core` กลางแผน
- **zod ตรวจที่ขอบของ route ทุกเส้นก่อนถึง service** ใช้ `.strict()` เสมอ (สเปก §11.3) · **ทุก route เป็น `type: 'admin'` + policy `admin::hasPermissions` ไม่มีข้อยกเว้น** (สเปก §11.4) · **audit เขียนทุกเส้นทางรวมถึงตอนล้มเหลว** (§11.5) · **error ที่ขึ้นถึง UI เป็น `code` เสมอ ไม่ใช่ข้อความดิบ** (§11.7)
- **ความลับห้ามออกจากฝั่งเซิร์ฟเวอร์** (§11.2) — ไม่มี response body ไหนมี `channelAccessToken` หรือ `channelSecret` แบบ plaintext ได้เลย
- **ข้อความที่ผู้ใช้เห็นต้องผ่าน `t()` ทุกตัว** รวมถึง `aria-label` และ `closeLabel` (§12) ห้าม hardcode สตริงอังกฤษหรือไทยใน `primitives.tsx`
- **`examples/v5-app` คือ acceptance gate** ไม่ใช่ตัวอย่างประกอบ — task ไหนที่ทำให้มันพัง ถือว่า task นั้นยังไม่เสร็จ เช่นเดียวกับ `examples/v4-app` ที่ต้องยังเขียวตลอดแผนนี้
- **Node 20** (`engines: >=20.15.0`) · pnpm **10.34.5** · `tsconfig` เปิด `noUncheckedIndexedAccess` · ESLint `@typescript-eslint/consistent-type-imports: error` · ทุก commit ใช้ Conventional Commits ภาษาอังกฤษ scope ของ adapter ตัวใหม่คือ `v5`
- **การปล่อยขึ้น npm และการเปิด repo เป็น public เป็นการตัดสินใจของเจ้าของ ไม่ใช่ของแผนนี้** — แผนนี้เตรียมทั้งสองอย่างให้เหลือคำสั่งเดียวแล้ว **หยุด** Task 16 จบที่ checklist ที่รันแล้วเขียว ไม่ใช่ที่ `npm publish` ที่รันไปแล้ว

---

## File Structure

```
packages/strapi-v5/                  strapi-plugin-line-rich-menu
├─ package.json                      exports map: ./strapi-admin · ./strapi-server  (ไม่มีไฟล์ shim ที่ root)
├─ tsconfig.json                     ตัวที่ `pnpm typecheck` ใช้ — ครอบทั้ง admin/ server/ tests/
├─ vitest.config.ts                  alias @fosivo/* ไปที่ src และ @strapi/strapi/admin ไปที่ test double
├─ scripts/check-runtime-deps.mjs    ทุก require()/import ที่เหลือใน dist ต้องประกาศไว้และติดตั้งได้จาก npm
├─ server/
│  ├─ tsconfig.json  tsconfig.build.json      sdk-plugin หา `./server/tsconfig.build.json` ตอน emit .d.ts
│  └─ src/
│     ├─ index.ts                    register · bootstrap · config · contentTypes · controllers · routes
│     ├─ strapi.ts                   type ขั้นต่ำของ global strapi ของ v5 (ไม่ import @strapi/strapi)
│     ├─ config.ts                   default + validator ของ plugin config  (ยกมาจาก v4 ทั้งดุ้น)
│     ├─ content-types/              line-channel · rich-menu · rich-menu-schedule · rich-menu-audit
│     ├─ repo.ts                     documents() repo + ImageStore แบบ formidable v3
│     ├─ container.ts                getServices(strapi) — ผูก lock เข้ากับคอลัมน์ document_id
│     ├─ validation.ts               zod ของทุก route — `idParam` ของ v5 ไม่ใช่ตัวเลข
│     ├─ http-error.ts               code → status  (ยกมาจาก v4 ทั้งดุ้น)
│     ├─ menu-write.ts               saveMenu · readDisplayPeriod · writeDisplayPeriod  (ยกมาทั้งดุ้น)
│     ├─ permissions.ts              read · write · publish · settings  (ยกมาทั้งดุ้น)
│     ├─ controllers/                channels · menus · schedules
│     ├─ routes/admin.ts             type: 'admin' + admin::hasPermissions ทุกเส้น
│     ├─ tick.ts                     runTick + registerCron
│     └─ bootstrap.ts                ลงทะเบียน permission + cron
├─ admin/
│  ├─ tsconfig.json  tsconfig.build.json
│  └─ src/
│     ├─ index.ts                    register(app) · registerTrads
│     ├─ App.tsx                     router v6 · Routes/element
│     ├─ port.tsx                    hook ของ Strapi 5 → UIPort
│     ├─ adapters.ts                 http/toast/nav/t ที่ไม่รู้จัก Strapi  (ยกมาจาก v4 แก้เฉพาะ toast)
│     ├─ primitives.tsx              Design System v2 → UIPrimitives
│     ├─ translations.ts             prefixTranslations + trads  (ยกมาทั้งดุ้น)
│     ├─ pages/{List,Editor}.tsx
│     └─ strapi-admin.d.ts           module shim ของ @strapi/strapi/admin เท่าที่ใช้จริง
└─ tests/
   ├─ setup-dom.ts                   polyfill ที่ Radix ต้องการใน jsdom
   ├─ doubles/strapi-admin.ts        ของจริงถูกพิสูจน์ที่ examples/v5-app ไม่ใช่ที่นี่
   └─ *.test.ts(x)

examples/v5-app/                     Strapi 5.52.1 จริง · sqlite/postgres · npm pack → npm install · acceptance gate

docs/
├─ screenshots/                      ภาพที่ Playwright ถ่ายเอง ไม่ใช่ภาพที่คนแคปมาวาง
├─ DEMO.md                           วิธี deploy demo ตาม §14 (Render + Neon + Cloudinary)
└─ RELEASING.md                      ลำดับการปล่อย 1.0.0 — คำสั่งสุดท้ายเป็นของเจ้าของ

README.md                            หน้าร้าน: ภาพหน้าจอ · ติดตั้ง · config · ข้อจำกัดที่รู้อยู่ · AGPL + commercial · donate
.changeset/config.json               fixed: v4 กับ v5 ขยับเวอร์ชันพร้อมกันเสมอ (§17 "1.0.0 เต็มทีเดียว")
.github/workflows/release.yml        changesets publish + npm provenance ผ่าน OIDC
.github/workflows/ci.yml             เพิ่ม job e2e matrix strapi[4,5] × db[sqlite,postgres]
```

**เหตุผลของการแบ่ง:** `admin/src` กับ `server/src` **ไม่ใช่** `src/admin` กับ `src/server` แบบ v4 เพราะ `strapi-plugin build` คำนวณ path ของ tsconfig สำหรับ emit `.d.ts` เป็น `./<name>/tsconfig.build.json` โดยที่ `<name>` มาจากชื่อ export key (`./strapi-admin` → `admin`, `./strapi-server` → `server`) — โครงอื่นทำให้ dts ไม่ออกหรือออกผิดที่ · `strapi.ts` ประกาศ type ของ `strapi` เองด้วยเหตุผลเดียวกับ v4 คือไม่ผูกกับ type ของ CMS ที่กว้างมากและเปลี่ยนบ่อย · `tests/doubles/` แยกออกมาเป็นโฟลเดอร์ของตัวเองเพื่อให้เห็นชัดในสารบัญไฟล์ว่า "ตรงนี้ไม่ใช่ของจริง" ไม่ใช่ซ่อนเป็น mock ที่ประกาศกลางไฟล์เทสต์

---

## Task 1: Scaffold `packages/strapi-v5` + ด่านที่พิสูจน์ว่ามันติดตั้งได้จาก npm จริง

**Files:**
- Create: `packages/strapi-v5/package.json`, `tsconfig.json`, `vitest.config.ts`, `admin/tsconfig.json`, `admin/tsconfig.build.json`, `admin/src/index.ts`, `server/tsconfig.json`, `server/tsconfig.build.json`, `server/src/index.ts`, `scripts/check-runtime-deps.mjs`, `LICENSE`, `COMMERCIAL-LICENSE.md`
- Create: `packages/strapi-v5/tests/package-shape.test.ts`
- Modify: `eslint.config.js` (บล็อกสำหรับสคริปต์ `.mjs` ของ v5 + ติดตั้ง `eslint-plugin-react-hooks`)

**Interfaces:**
- Consumes: `ENDPOINTS` จาก `@fosivo/line-rich-menu-ui` (Plan 02 Task 12)
- Produces: แพ็กเกจ `strapi-plugin-line-rich-menu` ที่ `pnpm test` มองเห็นเป็น project ชื่อ `strapi-v5`

- [ ] **Step 1: สร้างแพ็กเกจและไฟล์ config**

`packages/strapi-v5/package.json`

```json
{
  "name": "strapi-plugin-line-rich-menu",
  "version": "0.0.0",
  "description": "Design, schedule and publish LINE rich menus from the Strapi 5 admin panel",
  "license": "AGPL-3.0-only",
  "engines": {
    "node": ">=20.15.0"
  },
  "exports": {
    "./package.json": "./package.json",
    "./strapi-admin": {
      "types": "./dist/admin/src/index.d.ts",
      "source": "./admin/src/index.ts",
      "import": "./dist/admin/index.mjs",
      "require": "./dist/admin/index.js",
      "default": "./dist/admin/index.js"
    },
    "./strapi-server": {
      "types": "./dist/server/src/index.d.ts",
      "source": "./server/src/index.ts",
      "import": "./dist/server/index.mjs",
      "require": "./dist/server/index.js",
      "default": "./dist/server/index.js"
    }
  },
  "files": [
    "dist",
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
    "build": "strapi-plugin build",
    "watch": "strapi-plugin watch",
    "watch:link": "strapi-plugin watch:link",
    "verify": "strapi-plugin verify",
    "typecheck": "tsc --noEmit",
    "check:deps": "node scripts/check-runtime-deps.mjs"
  },
  "dependencies": {
    "sharp": "^0.35.3",
    "zod": "^3.23.8"
  },
  "peerDependencies": {
    "@strapi/design-system": "^2.0.0",
    "@strapi/icons": "^2.0.0",
    "@strapi/strapi": "^5.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-intl": "^6.4.1",
    "react-router-dom": "^6.0.0",
    "styled-components": "^6.0.0"
  },
  "devDependencies": {
    "@fosivo/line-rich-menu-core": "workspace:*",
    "@fosivo/line-rich-menu-ui": "workspace:*",
    "@strapi/design-system": "^2.2.4",
    "@strapi/icons": "^2.2.4",
    "@strapi/sdk-plugin": "^6.1.1",
    "@types/react": "^18.3.31",
    "@types/react-dom": "^18.3.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-intl": "^6.4.1",
    "react-router-dom": "^6.26.2",
    "styled-components": "^6.1.13"
  }
}
```

สามอย่างในไฟล์นี้ที่ผิดแล้วปลั๊กอินโหลดไม่ขึ้นโดยไม่มีอะไรใน log บอก:

1. **ไม่มี `"type": "module"`** — `strapi-plugin build` ปล่อยทั้ง `index.mjs` (ESM) และ `index.js` (CJS) การประกาศ `type: module` จะทำให้ `.js` ถูกอ่านเป็น ESM แล้วพังทันทีที่ Strapi `require()` มัน
2. **ลำดับคีย์ใน `exports` ต้องขึ้นด้วย `types` และลงท้ายด้วย `default`** — `strapi-plugin verify` ล้มด้วยข้อความ `the 'types' property should be the first property` ถ้าสลับ ไม่ใช่แค่เตือน
3. **`@fosivo/*` อยู่ที่ `devDependencies`** — ถ้าเลื่อนไป `dependencies` เมื่อไหร่ sdk-plugin จะตั้งมันเป็น external แล้ว dist จะ `require("@fosivo/line-rich-menu-core")` ตอนรัน ซึ่งไม่มีอยู่บนเครื่องผู้ใช้ นี่คือความล้มเหลวเดียวกับที่ v4 เจอ ต่างแค่ข้อความ error

`packages/strapi-v5/tsconfig.json` — ตัวที่ `pnpm typecheck` เรียก ครอบทั้งสามโฟลเดอร์

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
  "include": ["admin", "server", "tests"]
}
```

`packages/strapi-v5/server/tsconfig.json`

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "lib": ["ES2022"],
    "paths": {
      "@fosivo/line-rich-menu-core": ["../../core/src/index.ts"]
    }
  },
  "include": ["src"]
}
```

`packages/strapi-v5/server/tsconfig.build.json` — ตัวที่ `strapi-plugin build` หยิบไปให้ `vite-plugin-dts`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "skipLibCheck": true,
    "paths": {}
  },
  "include": ["src"]
}
```

`paths` ถูกล้างเป็น `{}` ที่นี่โดยตั้งใจ: ตอน build จริง `@fosivo/*` ถูก resolve จาก `node_modules` ที่ pnpm ลิงก์ไว้ (ซึ่งมี `.d.ts` ที่ build แล้ว) การชี้กลับไปที่ `../../core/src/*.ts` จะทำให้ `vite-plugin-dts` พยายาม emit type ของแพ็กเกจอื่นเข้ามาใน `dist/` ของแพ็กเกจนี้ด้วย

`packages/strapi-v5/admin/tsconfig.json`

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": {
      "@fosivo/line-rich-menu-ui": ["../../ui/src/index.ts"],
      "@fosivo/line-rich-menu-core/browser": ["../../core/src/browser.ts"]
    }
  },
  "include": ["src"]
}
```

`packages/strapi-v5/admin/tsconfig.build.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "skipLibCheck": true,
    "paths": {}
  },
  "include": ["src"]
}
```

`packages/strapi-v5/vitest.config.ts`

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// coverage ตั้งที่ root เท่านั้น (ดู vitest.config.ts ที่ root) ห้ามประกาศซ้ำที่นี่
export default defineConfig({
  test: {
    name: 'strapi-v5',
    // ค่าเริ่มต้นเป็น node เพราะเทสต์ส่วนใหญ่ในแพ็กเกจนี้เป็นฝั่งเซิร์ฟเวอร์ ไฟล์ที่ต้องการ DOM
    // ประกาศ `// @vitest-environment jsdom` ไว้บรรทัดแรกของตัวเอง (สำนวนเดียวกับ
    // packages/ui/tests/i18n.test.ts ที่ประกาศ node กลับทางกัน)
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup-dom.ts'],
    server: { deps: { inline: [/@strapi\/design-system/] } },
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@fosivo/line-rich-menu-core/browser': fileURLToPath(new URL('../core/src/browser.ts', import.meta.url)),
      '@fosivo/line-rich-menu-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@fosivo/line-rich-menu-ui': fileURLToPath(new URL('../ui/src/index.ts', import.meta.url)),
      // `@strapi/strapi` ทั้งแพ็กเกจคือ CMS ทั้งตัว (หลายร้อยเมกะไบต์และ React tree ของตัวเอง)
      // การติดตั้งมันไว้เพื่อ import hook สี่ตัวคือราคาที่ไม่คุ้ม ที่นี่จึงชี้ไป test double แล้ว
      // ให้ examples/v5-app (Task 10) เป็นตัวพิสูจน์ของจริง — ดูคอมเมนต์ในไฟล์ double เอง
      '@strapi/strapi/admin': fileURLToPath(new URL('./tests/doubles/strapi-admin.ts', import.meta.url)),
    },
  },
})
```

`packages/strapi-v5/tests/setup-dom.ts` — Radix ที่อยู่ใต้ DS v2 ใช้ API ที่ jsdom ไม่มี

```ts
/**
 * DS v2 วางอยู่บน Radix ซึ่งเรียก API สี่ตัวนี้ตอน mount ทุกครั้ง และ jsdom ไม่ได้ implement
 * ไว้เลยสักตัว ผลคือ `Modal`, `Select` และ `Radio` โยน TypeError ก่อนจะวาดอะไรออกมา — ซึ่ง
 * อ่านเหมือน adapter เขียนผิด ทั้งที่เป็นช่องว่างของสภาพแวดล้อมเทสต์ล้วน ๆ
 *
 * ไฟล์นี้เป็น setupFiles ของทั้งแพ็กเกจ แต่ทำงานเฉพาะเมื่อมี `window` (คือเฉพาะไฟล์ที่ประกาศ
 * `@vitest-environment jsdom`) ไฟล์ฝั่งเซิร์ฟเวอร์จึงไม่ได้รับผลอะไรจากมัน
 */
if (typeof window !== 'undefined') {
  if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver
  }

  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>
  proto['scrollIntoView'] ??= function scrollIntoView(): void {}
  proto['hasPointerCapture'] ??= function hasPointerCapture(): boolean { return false }
  proto['setPointerCapture'] ??= function setPointerCapture(): void {}
  proto['releasePointerCapture'] ??= function releasePointerCapture(): void {}
}
```

`packages/strapi-v5/tests/doubles/strapi-admin.ts`

```ts
/**
 * ตัวแทนของ `@strapi/strapi/admin` ในเทสต์ — **ไม่ใช่ของจริง** และไม่ได้อ้างว่าเป็น
 *
 * สิ่งที่เทสต์ในแพ็กเกจนี้พิสูจน์ได้จริงคือ "สายไฟเหนือ hook ต่อถูก": port ถูกประกอบครั้งเดียว
 * ต่อชุด dependency, `.data` ถูกแกะ, FormData ไม่ถูกแปลงร่าง, path ถูกเติม prefix
 * สิ่งที่พิสูจน์ไม่ได้คือ "hook ของ Strapi 5 คืนค่ารูปนี้จริงไหม" — ตัวที่พิสูจน์ข้อนั้นคือ
 * examples/v5-app ใน Task 10 ซึ่งบูต Strapi 5.52.1 ตัวจริงและกดผ่านหน้าจอจริง
 *
 * รูปทรงด้านล่างอ้างอิงจากคู่มือย้าย v4 → v5 ของ Strapi (`helper-plugin.md`):
 * `useFetchClient` ย้ายมาจาก `@strapi/helper-plugin` โดยรูปทรงไม่เปลี่ยน ส่วน `useNotification`
 * เปลี่ยนจาก "คืนฟังก์ชัน" เป็น "คืนอ็อบเจกต์ที่มี toggleNotification" และ `message` กลายเป็น
 * สตริงที่แปลแล้ว ไม่ใช่ descriptor ของ react-intl อีกต่อไป
 */
export interface FetchResponse<T> { data: T }

export function useFetchClient(): {
  get<T>(url: string): Promise<FetchResponse<T>>
  post<T>(url: string, body?: unknown): Promise<FetchResponse<T>>
  put<T>(url: string, body?: unknown): Promise<FetchResponse<T>>
  del<T>(url: string): Promise<FetchResponse<T>>
} {
  throw new Error('useFetchClient ของจริงถูกพิสูจน์ที่ examples/v5-app ไม่ใช่ที่นี่')
}

export function useNotification(): {
  toggleNotification(notification: { type: string; message: string }): void
} {
  throw new Error('useNotification ของจริงถูกพิสูจน์ที่ examples/v5-app ไม่ใช่ที่นี่')
}
```

`packages/strapi-v5/admin/src/index.ts` และ `packages/strapi-v5/server/src/index.ts` — ตัวชั่วคราวให้ build ผ่าน จะถูกเขียนทับใน Task 2 และ Task 8

```ts
export default {}
```

`packages/strapi-v5/LICENSE` และ `packages/strapi-v5/COMMERCIAL-LICENSE.md` — คัดลอกจาก root ตรง ๆ ให้เหมือนที่ `packages/strapi-v4` ทำ:

```bash
cp LICENSE COMMERCIAL-LICENSE.md packages/strapi-v5/
```

ติดตั้ง:

```bash
pnpm install
pnpm add -D --filter strapi-plugin-line-rich-menu \
  @fosivo/line-rich-menu-core@workspace:* @fosivo/line-rich-menu-ui@workspace:* \
  @strapi/sdk-plugin @strapi/design-system @strapi/icons \
  react react-dom @types/react @types/react-dom react-intl react-router-dom styled-components
pnpm add -D -w eslint-plugin-react-hooks
```

`eslint-plugin-react-hooks` ถูกติดตั้งที่นี่ ไม่ใช่ที่ Task 12 เพราะ `admin/src/port.tsx` ของ Task 8 คือไฟล์ที่มันมีไว้ป้องกันพอดี — dependency array ของ `useMemo` ที่ประกอบ port ผิดตัวเดียวแปลว่าทั้งหน้ากะพริบเป็นค่าว่างทุก render (ดูคอมเมนต์เหนือ `HttpClient` ใน `packages/ui/src/port.ts`) carry-forward ของ Plan 02 บันทึกไว้แล้วว่ามันคือ linter ที่จะจับความต่างระหว่าง `RichMenuList` กับ `ChannelSettings` ได้ แต่ยังไม่ได้ติดตั้ง

- [ ] **Step 2: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v5/tests/package-shape.test.ts`

```ts
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENDPOINTS } from '@fosivo/line-rich-menu-ui'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name?: string
  type?: string
  files?: string[]
  scripts?: Record<string, string>
  strapi?: { name?: string }
  exports?: Record<string, Record<string, string> | string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const STANDARD_EXPORTS = ['./strapi-admin', './strapi-server'] as const

describe('รูปทรงของแพ็กเกจที่ Strapi 5 ต้องการ (สเปก §2.1)', () => {
  it('ลงทะเบียนผ่าน exports map ไม่ใช่ไฟล์ shim ที่ root แบบ v4', () => {
    for (const key of STANDARD_EXPORTS) {
      expect(pkg.exports?.[key], key).toBeTypeOf('object')
    }
    expect(existsSync(`${root}strapi-server.js`)).toBe(false)
    expect(existsSync(`${root}strapi-admin.js`)).toBe(false)
  })

  /**
   * `strapi-plugin build` ปล่อยทั้ง .mjs และ .js — ประกาศ `type: module` เมื่อไหร่ `.js`
   * จะถูกอ่านเป็น ESM แล้ว Strapi ที่ require() มันจะพังด้วย ERR_REQUIRE_ESM
   */
  it('ไม่ประกาศ type: module — dist มีทั้ง cjs และ esm อยู่ข้าง ๆ กัน', () => {
    expect(pkg.type).toBeUndefined()
  })

  /**
   * `strapi-plugin verify` บังคับลำดับนี้และล้มด้วย exit code 1 ถ้าสลับ ด่านนี้ทำให้รู้ตั้งแต่
   * `pnpm test` ไม่ต้องรอถึงขั้น build ซึ่งช้ากว่ามากและอยู่หลัง commit ไปแล้ว
   */
  it('ทุก export ขึ้นต้นด้วย types และลงท้ายด้วย default', () => {
    for (const key of STANDARD_EXPORTS) {
      const keys = Object.keys(pkg.exports?.[key] as Record<string, string>)
      expect(keys[0], `${key} คีย์แรก`).toBe('types')
      expect(keys[keys.length - 1], `${key} คีย์สุดท้าย`).toBe('default')
    }
  })

  /**
   * sdk-plugin คำนวณ path ของ tsconfig สำหรับ emit .d.ts จากชื่อ export key ตรง ๆ
   * (`./strapi-admin` → `./admin/tsconfig.build.json`) ไม่มีไฟล์นั้น = ไม่มี .d.ts ออกมา
   * = `types` ใน exports ชี้ไปไฟล์ที่ไม่มีอยู่ = `strapi-plugin verify` ล้ม
   */
  it('มี tsconfig.build.json อยู่ในโฟลเดอร์ที่ sdk-plugin จะไปหา', () => {
    expect(existsSync(`${root}admin/tsconfig.build.json`)).toBe(true)
    expect(existsSync(`${root}server/tsconfig.build.json`)).toBe(true)
  })

  it('source ที่ประกาศไว้ใน exports ชี้ไปไฟล์ที่มีอยู่จริง', () => {
    for (const key of STANDARD_EXPORTS) {
      const source = (pkg.exports?.[key] as Record<string, string>)['source']!
      expect(existsSync(`${root}${source.replace('./', '')}`), source).toBe(true)
    }
  })

  it('files ที่จะถูกปล่อยขึ้น npm มี dist และสัญญาอนุญาตทั้งสองฉบับ', () => {
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'LICENSE', 'COMMERCIAL-LICENSE.md']))
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
      ENDPOINTS.channels, ENDPOINTS.channel('a'), ENDPOINTS.channelTest('a'),
      ENDPOINTS.menus, ENDPOINTS.menu('a'), ENDPOINTS.menuPublish('a'), ENDPOINTS.menuSetDefault('a'),
    ]
    expect(paths.every((path) => path.startsWith(`/${id}/`))).toBe(true)
  })

  it('ชื่อแพ็กเกจเป็นตัวที่ไม่มีคำต่อท้าย — v4 เป็นคนแบก suffix ไม่ใช่ v5', () => {
    expect(pkg.name).toBe('strapi-plugin-line-rich-menu')
  })
})

describe('peer range', () => {
  it('ผูกกับ Strapi 5 เท่านั้น — v4 เป็นคนละแพ็กเกจ', () => {
    expect(pkg.peerDependencies?.['@strapi/strapi']).toBe('^5.0.0')
  })

  it('ผูกกับ Design System v2 และ router v6 ตามตารางสเปก §2.1', () => {
    expect(pkg.peerDependencies?.['@strapi/design-system']).toBe('^2.0.0')
    expect(pkg.peerDependencies?.['@strapi/icons']).toBe('^2.0.0')
    expect(pkg.peerDependencies?.['react-router-dom']).toBe('^6.0.0')
    expect(pkg.peerDependencies?.['styled-components']).toBe('^6.0.0')
  })
})

/**
 * ด่านเดียวกับ tests/package-shape.test.ts ของ v4 ซึ่งเกิดจากความล้มเหลวจริงที่ Task 20
 * ของ Plan 03 เจอเป็นครั้งแรก: `dependencies` ประกาศ `@fosivo/*: "workspace:*"` แล้ว
 * `npm install` ตอบ `EUNSUPPORTEDPROTOCOL` — เทสต์ 608 ตัวไม่มีตัวไหนแตะเลยเพราะทุกตัวรัน
 * ในเวิร์กสเปซที่ pnpm ลิงก์ให้แล้ว
 *
 * v5 มีกับดักตัวเดียวกันเป๊ะ ต่างแค่กลไก: sdk-plugin ตั้ง external จาก `dependencies` +
 * `peerDependencies` เท่านั้น (ดู getExternals ใน dist/vite-config-*.mjs) ตราบใดที่ @fosivo/*
 * อยู่ที่ devDependencies มันจะถูกรวมเข้าบันเดิลโดยอัตโนมัติ ซึ่งเป็นสิ่งที่เราต้องการ
 */
describe('ทุก dependency ที่เหลืออยู่ต้องติดตั้งได้จาก npm จริง', () => {
  const runtime = Object.entries(pkg.dependencies ?? {})

  it('ไม่มี dependency ไหนใช้ protocol ที่ npm ไม่รู้จัก', () => {
    const bad = [...runtime, ...Object.entries(pkg.peerDependencies ?? {})]
      .filter(([, range]) => /^(workspace|link|catalog|file):/.test(range))
    expect(bad).toEqual([])
  })

  it('ไม่มีแพ็กเกจภายในของเวิร์กสเปซหลงอยู่ใน dependencies หรือ peerDependencies', () => {
    expect(runtime.filter(([name]) => name.startsWith('@fosivo/'))).toEqual([])
    expect(Object.keys(pkg.peerDependencies ?? {}).filter((name) => name.startsWith('@fosivo/'))).toEqual([])
  })

  it('แพ็กเกจภายในยังต้องอยู่ที่ devDependencies — build ต้องหามันเจอเพื่อรวมเข้าบันเดิล', () => {
    const dev = pkg.devDependencies ?? {}
    expect(dev['@fosivo/line-rich-menu-core']).toBe('workspace:*')
    expect(dev['@fosivo/line-rich-menu-ui']).toBe('workspace:*')
  })
})
```

- [ ] **Step 3: รันแล้วดูมันแดง**

```bash
pnpm test --project strapi-v5
```

คาดว่าล้มที่ `Cannot find module` ของ `tests/doubles/strapi-admin.ts` ถ้ายังไม่ได้สร้าง หรือถ้าสร้างครบแล้วจะล้มที่ `มี tsconfig.build.json อยู่ในโฟลเดอร์ที่ sdk-plugin จะไปหา` ถ้าไฟล์นั้นยังไม่มี — ยืนยันว่าด่านมองเห็นของจริง ไม่ใช่เขียวเพราะไม่ได้ตรวจอะไร

- [ ] **Step 4: implement ให้เขียว**

สร้างไฟล์ทั้งหมดใน Step 1 แล้วเพิ่มบล็อกนี้ต่อท้าย `eslint.config.js` ก่อนบล็อกของ `packages/ui`

```js
  {
    // สคริปต์ที่รันด้วย Node ตรง ๆ ไม่ได้ผ่าน bundler — เหตุผลเดียวกับบล็อกของ strapi-v4
    files: ['packages/strapi-v5/scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
```

และเปิด `eslint-plugin-react-hooks` ให้ครอบทั้งสองที่ที่มี React จริง โดยเพิ่ม import ที่หัวไฟล์

```js
import reactHooks from 'eslint-plugin-react-hooks'
```

แล้วเพิ่มบล็อกนี้

```js
  {
    // ยามที่ carry-forward ของ Plan 02 บันทึกว่าขาดอยู่: `RichMenuList` ใส่ `[channelId, http, t]`
    // ไว้ใน dependency array ส่วน `ChannelSettings` ใช้ `useEffect(reload, [])` ที่ปิดทับ http/t
    // สองสำนวนสำหรับเรื่องเดียวกันในไฟล์ที่อยู่ติดกัน — และเป็นความผิดพลาดที่ทำให้หน้าจอกะพริบ
    // เป็นค่าว่างทุก render ถ้าเกิดกับ port ที่ adapter ประกอบ (ดูคอมเมนต์เหนือ HttpClient ใน port.ts)
    files: ['packages/ui/**/*.{ts,tsx}', 'packages/strapi-v4/src/admin/**/*.{ts,tsx}', 'packages/strapi-v5/admin/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
```

ถ้ากฎนี้ทำให้ไฟล์เดิมของ `packages/ui` แดง **ห้ามลดกฎเป็น `warn`** ให้แก้ไฟล์นั้นและ commit แยกด้วยข้อความ `fix(ui): close the effect dependency gaps react-hooks reports` — การลดระดับกฎเพื่อให้ผ่านคือการติดตั้ง linter ที่ไม่บังคับอะไร ซึ่งเป็นความล้มเหลวชนิดที่โปรเจกต์นี้บันทึกไว้แล้วสี่ครั้ง

- [ ] **Step 5: เขียว**

```bash
pnpm test --project strapi-v5 && pnpm lint && pnpm typecheck
```

- [ ] **Step 6: commit**

```bash
git add packages/strapi-v5 eslint.config.js package.json pnpm-lock.yaml
git commit -m "feat(v5): scaffold the Strapi 5 plugin with an installability guard"
```

---

## Task 2: `StrapiV5` · content type ทั้งสี่ · entry ของฝั่ง server

**Files:**
- Create: `packages/strapi-v5/server/src/strapi.ts`, `content-types/schema.ts`, `content-types/line-channel.ts`, `content-types/rich-menu.ts`, `content-types/rich-menu-schedule.ts`, `content-types/rich-menu-audit.ts`, `content-types/index.ts`
- Modify: `packages/strapi-v5/server/src/index.ts`
- Test: `packages/strapi-v5/tests/content-types.test.ts`

**Interfaces:**
- Produces:
  - `interface StrapiV5 { log; config; plugin(name); documents(uid): DocumentsApi; db: { connection: unknown; query(uid): unknown }; admin; cron; dirs }`
  - `const UID: { channel: 'plugin::line-rich-menu.line-channel'; menu: 'plugin::line-rich-menu.rich-menu'; schedule: 'plugin::line-rich-menu.rich-menu-schedule'; audit: 'plugin::line-rich-menu.rich-menu-audit' }`
  - `const contentTypes: Record<'line-channel' | 'rich-menu' | 'rich-menu-schedule' | 'rich-menu-audit', { schema: ContentTypeSchema }>`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v5/tests/content-types.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE_TABLE } from '@fosivo/line-rich-menu-core'
import { UID, contentTypes } from '../server/src/content-types/index.js'

const schemas = Object.values(contentTypes).map((entry) => entry.schema)

describe('content type ทั้งสี่', () => {
  it('ครบสี่ตัวและ uid ตรงกับชื่อ singular ของแต่ละตัว', () => {
    expect(Object.keys(contentTypes).sort()).toEqual(
      ['line-channel', 'rich-menu', 'rich-menu-audit', 'rich-menu-schedule'],
    )
    for (const [key, entry] of Object.entries(contentTypes)) {
      expect(entry.schema.info.singularName, key).toBe(key)
      expect(Object.values(UID)).toContain(`plugin::line-rich-menu.${key}`)
    }
  })

  it('ปิด draft & publish ทุกตัว — "published" ของปลั๊กอินนี้หมายถึงสถานะบน LINE', () => {
    for (const schema of schemas) {
      expect(schema.options?.draftAndPublish, schema.collectionName).toBe(false)
    }
  })

  it('ซ่อนจาก content manager และ content-type builder ทุกตัว', () => {
    for (const schema of schemas) {
      expect(schema.pluginOptions?.['content-manager'], schema.collectionName).toEqual({ visible: false })
      expect(schema.pluginOptions?.['content-type-builder'], schema.collectionName).toEqual({ visible: false })
    }
  })

  // lock ยิงผ่าน knex ตรง ๆ ไม่ผ่าน documents() จึงไม่มีใครแปลงชื่อตารางให้
  it('ชื่อตารางของ schedule ตรงกับที่ lock query ใน core ใช้', () => {
    expect(contentTypes['rich-menu-schedule'].schema.collectionName).toBe(DEFAULT_SCHEDULE_TABLE)
  })

  it('ไม่มีตัวไหนประกาศ publishedAt เอง — Strapi จองชื่อนี้ไว้', () => {
    for (const schema of schemas) {
      expect(schema.attributes['publishedAt'], schema.collectionName).toBeUndefined()
    }
  })

  it('ฟิลด์ลับของ channel เป็น private ทั้งสามตัว', () => {
    const attributes = contentTypes['line-channel'].schema.attributes
    for (const field of ['channelAccessToken', 'channelSecret', 'accessTokenLast4']) {
      expect(attributes[field]?.private, field).toBe(true)
    }
  })

  /**
   * นี่คือความต่างที่แท้จริงข้อหนึ่งระหว่าง v4 กับ v5 ในชั้นข้อมูล
   *
   * v4 เก็บ actorId/richMenuId/channelId ของ audit เป็น `integer` เพราะ id ของ v4 เป็นตัวเลข
   * ส่วน v5 อ้างถึงสิ่งเดียวกันด้วย `documentId` ซึ่งเป็นสตริง 24 ตัวอักษร คอลัมน์ integer
   * จะกลืนมันไม่ได้เลย — sqlite จะเก็บเป็น 0 เงียบ ๆ ส่วน postgres จะโยน error ตอน insert
   * ซึ่งแปลว่า audit ของทุก publish จะหายไปทั้งหมด (ตามการตัดสินใจข้อ 6 ของ Plan 03
   * error ของ audit ถูกกลืนและ log ไว้เฉย ๆ) โดยไม่มีอะไรบนหน้าจอบอกผู้ใช้เลย
   *
   * `actorId` ยังเป็น integer เพราะ admin user ของ Strapi 5 ยังใช้ id เป็นตัวเลขอยู่
   * (`ctx.state.user.id`) ไม่ได้เป็น document
   */
  it('audit เก็บ id ของ v5 เป็นสตริง ไม่ใช่ตัวเลข', () => {
    const attributes = contentTypes['rich-menu-audit'].schema.attributes
    expect(attributes['richMenuId']?.type).toBe('string')
    expect(attributes['channelId']?.type).toBe('string')
    expect(attributes['channelId']?.required).toBe(true)
    expect(attributes['actorId']?.type).toBe('integer')
  })

  it('audit ยังไม่ใช้ relation — ประวัติต้องอยู่รอดหลังของที่มันอ้างถึงถูกลบ', () => {
    for (const attribute of Object.values(contentTypes['rich-menu-audit'].schema.attributes)) {
      expect(attribute.type).not.toBe('relation')
    }
  })

  it('เมนูเก็บผลของ normalize ไว้ครบ เพื่อให้ publish ไม่ต้องเรียก sharp เอง', () => {
    const attributes = contentTypes['rich-menu'].schema.attributes
    for (const field of ['normalizedImage', 'normalizedMime', 'normalizedWidth', 'normalizedHeight']) {
      expect(attributes[field], field).toBeDefined()
    }
    expect(attributes['linePublishedAt']?.type).toBe('datetime')
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project strapi-v5 tests/content-types.test.ts
```

คาดว่าล้มด้วย `Cannot find module '../server/src/content-types/index.js'`

- [ ] **Step 3: implement**

`packages/strapi-v5/server/src/content-types/schema.ts` — คัดลอกจาก `packages/strapi-v4/src/server/content-types/schema.ts` ทั้งไฟล์ ยกเว้นย่อหน้าแรกของ JSDoc ที่ต้องเปลี่ยนเป็น

```ts
/**
 * type ขั้นต่ำของ content type schema ที่ Strapi 5 ต้องการ — ไม่ใช่ type เต็มของ Strapi เอง
 * ด้วยเหตุผลเดียวกับ StrapiV5 ใน ../strapi.ts: การประกาศ shape เองทำให้ไฟล์นี้ไม่ผูกกับ
 * type ของ CMS ที่กว้างมากและเปลี่ยนทุก minor
 *
 * `attributes` เป็น `Record<string, AttributeSchema>` (ไม่ใช่ literal type ที่ infer มาจาก
 * object ของแต่ละไฟล์) เพราะ tests/content-types.test.ts ต้อง index ด้วย string ที่ไม่รู้ล่วงหน้า
 */
```

`packages/strapi-v5/server/src/content-types/line-channel.ts`, `rich-menu.ts`, `rich-menu-schedule.ts` — คัดลอกจาก v4 **ทั้งไฟล์ ไม่แก้อะไรเลย** ทั้งสามตัวไม่มีคอลัมน์ไหนที่ผูกกับรูปแบบของ id

`packages/strapi-v5/server/src/content-types/rich-menu-audit.ts`

```ts
import type { ContentTypeSchema } from './schema.js'

export const richMenuAudit: { schema: ContentTypeSchema } = {
  schema: {
    kind: 'collectionType' as const,
    collectionName: 'rich_menu_audits',
    info: { singularName: 'rich-menu-audit', pluralName: 'rich-menu-audits', displayName: 'Rich menu audit' },
    options: { draftAndPublish: false },
    pluginOptions: { 'content-manager': { visible: false }, 'content-type-builder': { visible: false } },
    attributes: {
      // เก็บค่าดิบ ไม่ใช่ relation โดยตั้งใจ (ต่างจากสเปก §11.5) — audit เป็น append-only และ
      // ต้องอยู่รอดหลังเมนู channel หรือ admin user ที่มันอ้างถึงถูกลบ ซึ่งเป็นจังหวะที่ประวัติ
      // มีค่าที่สุด relation ที่ลบตามกันจะทำลายหลักฐานเงียบ ๆ
      //
      // `actorId` เป็น integer เพราะ admin user ของ Strapi 5 ยังใช้ id เป็นตัวเลข
      // ส่วนอีกสองตัวเป็น string เพราะมันคือ `documentId` — ต่างจาก v4 ที่เป็น integer ทั้งสามตัว
      actorId: { type: 'integer' as const },
      action: {
        type: 'enumeration' as const,
        enum: ['publish', 'set-default', 'clear-default', 'swap-alias', 'delete', 'channel-update'],
        required: true,
      },
      richMenuId: { type: 'string' as const },
      channelId: { type: 'string' as const, required: true },
      before: { type: 'json' as const },
      after: { type: 'json' as const },
      result: { type: 'enumeration' as const, enum: ['success', 'failure'], required: true },
      errorCode: { type: 'string' as const },
    },
  },
}
```

`packages/strapi-v5/server/src/content-types/index.ts` — คัดลอกจาก v4 ทั้งไฟล์ (uid เหมือนกันเป๊ะเพราะ plugin id เหมือนกัน)

`packages/strapi-v5/server/src/strapi.ts`

```ts
/**
 * type ขั้นต่ำของ global `strapi` เท่าที่ adapter นี้ใช้จริง
 *
 * ตั้งใจไม่ `import type { Core } from '@strapi/strapi'` ด้วยเหตุผลเดียวกับที่ v4 ไม่ทำ:
 * type ของ CMS กว้างมาก ผูกกับ minor version และดึงทั้งแพ็กเกจเข้ามาในกราฟ typecheck
 * ไฟล์นี้ประกาศเฉพาะสิ่งที่ถูกเรียกจริง ซึ่งเป็นเซ็ตที่เล็กและตรวจด้วยตาได้ทั้งหมด
 */
export interface StrapiLogger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** พารามิเตอร์ของ Document Service เท่าที่ repo ใช้ — ทุกตัวเป็น optional ตามของจริง */
export interface DocumentParams {
  documentId?: string
  data?: unknown
  filters?: Record<string, unknown>
  sort?: string
  populate?: string[]
  fields?: string[]
  start?: number
  limit?: number
}

export interface DocumentsApi {
  findMany(params?: DocumentParams): Promise<unknown[]>
  findOne(params: DocumentParams & { documentId: string }): Promise<unknown>
  create(params: DocumentParams & { data: unknown }): Promise<unknown>
  update(params: DocumentParams & { documentId: string; data: unknown }): Promise<unknown>
  delete(params: DocumentParams & { documentId: string }): Promise<unknown>
}

export interface StrapiV5 {
  log: StrapiLogger
  config: { get<T>(path: string, defaultValue?: T): T }
  plugin(name: string): { service<T>(name: string): T; contentType(name: string): unknown }
  /** สเปก §2.1 — v5 แทน entityService ด้วยตัวนี้ และคืน `documentId` เป็นสตริง */
  documents(uid: string): DocumentsApi
  db: { connection: unknown }
  admin: { services: { permission: { actionProvider: { registerMany(actions: unknown[]): Promise<void> } } } }
  cron: { add(jobs: Record<string, unknown>): void }
  /** ใช้อ่านไฟล์ของ upload provider แบบ local ที่คืน url สัมพัทธ์ */
  dirs: { static: { public: string } }
}
```

`packages/strapi-v5/server/src/index.ts`

```ts
import { contentTypes } from './content-types/index.js'

export default {
  contentTypes,
}
```

- [ ] **Step 4: เขียว**

```bash
pnpm test --project strapi-v5 && pnpm typecheck
```

- [ ] **Step 5: commit**

```bash
git add packages/strapi-v5
git commit -m "feat(v5): declare the four content types with documentId-shaped audit columns"
```

---

## Task 3: `documents()` repo + `ImageStore` ที่ตรงกับ upload service ของ v5

**Files:**
- Create: `packages/strapi-v5/server/src/repo.ts`
- Test: `packages/strapi-v5/tests/repo.test.ts`

**Interfaces:**
- Consumes: `Repo<T>`, `ChannelRow`, `RichMenuRow`, `ScheduleRow`, `AuditRow`, `ImageStore`, `ListParams` จาก `@fosivo/line-rich-menu-core` (Plan 03 Task 1) · `UID` จาก Task 2 · `StrapiV5` จาก Task 2
- Produces:
  - `function createChannelRepo(strapi: StrapiV5): Repo<ChannelRow>`
  - `function createMenuRepo(strapi: StrapiV5): Repo<RichMenuRow>`
  - `function createScheduleRepo(strapi: StrapiV5): Repo<ScheduleRow>`
  - `function createAuditRepo(strapi: StrapiV5): Repo<AuditRow>`
  - `function createImageStore(strapi: StrapiV5): ImageStore`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v5/tests/repo.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  createAuditRepo, createChannelRepo, createImageStore, createMenuRepo, createScheduleRepo,
} from '../server/src/repo.js'
import { UID } from '../server/src/content-types/index.js'
import type { StrapiV5 } from '../server/src/strapi.js'

type Call = { uid: string; method: string; params: unknown }

/**
 * strapi ปลอมที่บันทึกทุกการเรียก `documents()` ไว้ — เทสต์ในไฟล์นี้พิสูจน์ **รูปทรงของคำขอ**
 * ที่ repo ยิงออกไป ไม่ใช่พฤติกรรมของฐานข้อมูล เพราะสิ่งที่แตกต่างจริงระหว่าง v4 กับ v5 อยู่ตรงนั้น
 */
function fakeStrapi(results: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const api = (uid: string) => ({
    findMany: vi.fn(async (params?: unknown) => {
      calls.push({ uid, method: 'findMany', params })
      return (results['findMany'] as unknown[] | undefined) ?? []
    }),
    findOne: vi.fn(async (params: unknown) => {
      calls.push({ uid, method: 'findOne', params })
      return results['findOne'] ?? null
    }),
    create: vi.fn(async (params: unknown) => {
      calls.push({ uid, method: 'create', params })
      return results['create'] ?? {}
    }),
    update: vi.fn(async (params: unknown) => {
      calls.push({ uid, method: 'update', params })
      return results['update'] ?? {}
    }),
    delete: vi.fn(async (params: unknown) => {
      calls.push({ uid, method: 'delete', params })
      return { documentId: 'x' }
    }),
  })
  const strapi = { documents: (uid: string) => api(uid) } as unknown as StrapiV5
  return { strapi, calls }
}

describe('documents() repo — รูปทรงของคำขอ', () => {
  it('findOne ส่ง documentId เป็นสตริง ไม่ใช่ตัวเลขที่แปลงมา', async () => {
    const { strapi, calls } = fakeStrapi()
    await createChannelRepo(strapi).findOne('kx91p2m4c7v0b8n3q5r6t7y8')
    expect(calls[0]).toEqual({
      uid: UID.channel,
      method: 'findOne',
      params: { documentId: 'kx91p2m4c7v0b8n3q5r6t7y8' },
    })
  })

  it('delete ก็ส่ง documentId ทางเดียวกัน — ไม่มี positional argument แบบ entityService', async () => {
    const { strapi, calls } = fakeStrapi()
    await createChannelRepo(strapi).delete('abc123')
    expect(calls[0]!.params).toEqual({ documentId: 'abc123' })
  })

  it('update วาง documentId กับ data ไว้ในอ็อบเจกต์เดียวกัน', async () => {
    const { strapi, calls } = fakeStrapi({ update: { documentId: 'abc123', name: 'ใหม่' } })
    await createChannelRepo(strapi).update('abc123', { name: 'ใหม่' })
    expect(calls[0]!.params).toEqual({ documentId: 'abc123', data: { name: 'ใหม่' } })
  })

  it('limit/start ถูกส่งต่อโดยไม่แปลงเป็น pagination — Document Service รับ offset ตรง ๆ', async () => {
    const { strapi, calls } = fakeStrapi()
    await createChannelRepo(strapi).findMany({ limit: 1 })
    expect(calls[0]!.params).toEqual({ limit: 1 })
  })
})

describe('channel repo', () => {
  it('อ่าน documentId มาเป็น id ของชั้น service', async () => {
    const { strapi } = fakeStrapi({
      findOne: {
        documentId: 'ch0000000000000000000001', id: 7,
        name: 'ร้าน', channelId: '1650000000',
        channelAccessToken: 'v1.iv.tag.ct', channelSecret: null,
        accessTokenLast4: 'ABCD', isDefault: true,
      },
    })
    const row = await createChannelRepo(strapi).findOne('ch0000000000000000000001')
    expect(row).toEqual({
      id: 'ch0000000000000000000001',
      name: 'ร้าน',
      channelId: '1650000000',
      channelAccessToken: 'v1.iv.tag.ct',
      channelSecret: null,
      accessTokenLast4: 'ABCD',
      isDefault: true,
    })
  })

  // `id: 7` ที่ติดมาด้วยคือ primary key ของแถว ไม่ใช่ตัวระบุที่ชั้น service ใช้ — ถ้าหยิบผิดตัว
  // ทุกอย่างจะ "ทำงาน" ในเทสต์ที่มีแถวเดียว แล้วพังตอนมีสองแถวขึ้นไปในแอปจริง
  it('ไม่หยิบคอลัมน์ id มาใช้แทน documentId เด็ดขาด', async () => {
    const { strapi } = fakeStrapi({
      findOne: { documentId: 'ch0000000000000000000001', id: 7, name: '', channelId: '', accessTokenLast4: '', isDefault: false },
    })
    expect((await createChannelRepo(strapi).findOne('ch0000000000000000000001'))!.id).not.toBe('7')
  })
})

describe('menu repo', () => {
  it('อ่าน relation ของ channel ผ่าน documentId ของ relation ไม่ใช่ id', async () => {
    const { strapi } = fakeStrapi({
      findOne: {
        documentId: 'mn0000000000000000000001',
        name: 'เมนูหลัก',
        channel: { documentId: 'ch0000000000000000000001', id: 7 },
        size: 'large', chatBarText: 'เมนู', chatBarMode: 'custom', selected: true,
        templateKey: null, areas: [], image: { id: 3 }, areaImages: [],
        normalizedImage: null, normalizedMime: null,
        normalizedWidth: null, normalizedHeight: null,
        aliasId: null, status: 'draft', lineRichMenuId: null,
        linePublishedAt: null, lastError: null, updatedAt: '2026-08-20T00:00:00.000Z',
      },
    })
    const row = await createMenuRepo(strapi).findOne('mn0000000000000000000001')
    expect(row!.channelId).toBe('ch0000000000000000000001')
    // ไฟล์ของ upload plugin ยังใช้ id เป็นตัวเลขใน Strapi 5 — media จึงยังเป็น number
    expect(row!.imageFileId).toBe(3)
  })

  it('เขียน relation ของ channel ด้วย set ของ documentId ไม่ใช่ตัวเลข', async () => {
    const { strapi, calls } = fakeStrapi({ create: { documentId: 'mn1', channel: { documentId: 'ch1' } } })
    await createMenuRepo(strapi).create({ name: 'ใหม่', channelId: 'ch0000000000000000000001' })
    const data = (calls[0]!.params as { data: Record<string, unknown> }).data
    expect(data['channel']).toEqual({ set: ['ch0000000000000000000001'] })
  })

  it('กรองด้วย channelId แปลงเป็นเงื่อนไขบน documentId ของ relation', async () => {
    const { strapi, calls } = fakeStrapi()
    await createMenuRepo(strapi).findMany({ filters: { channelId: 'ch0000000000000000000001' } })
    expect((calls[0]!.params as { filters: unknown }).filters).toEqual({
      channel: { documentId: 'ch0000000000000000000001' },
    })
  })

  it('populate ครบสามตัวที่ toRow อ่าน — ไม่งั้น channelId จะเป็น null ทุกแถว', async () => {
    const { strapi, calls } = fakeStrapi()
    await createMenuRepo(strapi).findMany()
    expect((calls[0]!.params as { populate: string[] }).populate.sort())
      .toEqual(['channel', 'image', 'normalizedImage'])
  })

  it('publishedAt ของชั้น service คือคอลัมน์ linePublishedAt', async () => {
    const { strapi, calls } = fakeStrapi({ update: {} })
    await createMenuRepo(strapi).update('mn1', { publishedAt: '2026-08-20T10:00:00.000Z' })
    const data = (calls[0]!.params as { data: Record<string, unknown> }).data
    expect(data['linePublishedAt']).toBe('2026-08-20T10:00:00.000Z')
    expect(data['publishedAt']).toBeUndefined()
  })
})

describe('audit repo', () => {
  it('เขียน id เป็นสตริงตามที่คอลัมน์ของ v5 เป็น — ไม่มี Number() ที่ไหนเลย', async () => {
    const { strapi, calls } = fakeStrapi({ create: {} })
    await createAuditRepo(strapi).create({
      actorId: '7', action: 'publish', richMenuId: 'mn1', channelId: 'ch1',
      before: null, after: null, result: 'success', errorCode: null,
    })
    expect((calls[0]!.params as { data: unknown }).data).toEqual({
      actorId: 7, action: 'publish', richMenuId: 'mn1', channelId: 'ch1',
      before: null, after: null, result: 'success', errorCode: null,
    })
  })

  // `Number(null)` คือ 0 ซึ่งจะกลายเป็น "actor คนที่ id 0" — คนที่ไม่มีอยู่จริงแต่ดูเหมือนมี
  it('actorId ที่เป็น null อยู่รอดเป็น null ไม่กลายเป็น 0', async () => {
    const { strapi, calls } = fakeStrapi({ create: {} })
    await createAuditRepo(strapi).create({
      actorId: null, action: 'set-default', richMenuId: null, channelId: 'ch1',
      before: null, after: null, result: 'success', errorCode: null,
    })
    const data = (calls[0]!.params as { data: Record<string, unknown> }).data
    expect(data['actorId']).toBeNull()
    expect(data['richMenuId']).toBeNull()
  })
})

describe('schedule repo', () => {
  it('กรองด้วย richMenuId แปลงเป็นเงื่อนไขบน documentId ของ relation', async () => {
    const { strapi, calls } = fakeStrapi()
    await createScheduleRepo(strapi).findMany({ filters: { richMenuId: 'mn1', state: 'pending' } })
    expect((calls[0]!.params as { filters: unknown }).filters).toEqual({
      state: 'pending',
      richMenu: { documentId: 'mn1' },
    })
  })
})

describe('ImageStore', () => {
  /**
   * นี่คือความต่างข้อที่สองที่แท้จริงระหว่าง v4 กับ v5 และเป็นข้อที่ Plan 03 บันทึกส่งมาไว้แล้ว
   *
   * upload service ของ v4 อ่าน `{ path, name, type, size }` (formidable v1/v2)
   * ส่วนของ v5 อ่าน `{ filepath, originalFilename, mimetype, size }` (formidable v3) —
   * ยืนยันจาก `enhanceAndValidateFile` ใน @strapi/upload@5.x ซึ่งอ่าน `file.originalFilename`,
   * `file.mimetype`, `file.size` และ `file.filepath` ตรง ๆ
   *
   * ถ้าส่งรูปทรงของ v4 ไป upload จะ "สำเร็จ" แต่ได้ไฟล์ชื่อ `unamed` ที่ไม่มีนามสกุลและ
   * mime เป็น `application/octet-stream` ซึ่งทำให้ LINE ปฏิเสธรูปตอน publish โดยที่ log
   * ของ Strapi ไม่มีอะไรผิดปกติเลย
   */
  it('write ส่งไฟล์ตามรูปทรงของ formidable v3 และส่งเป็นอาเรย์', async () => {
    const upload = vi.fn(async () => [{ id: 42 }])
    const strapi = {
      plugin: () => ({ service: () => ({ upload }) }),
    } as unknown as StrapiV5

    const result = await createImageStore(strapi).write({
      buffer: Buffer.from('jpeg-bytes'), mime: 'image/jpeg', filename: 'menu.jpg',
    })

    expect(result).toEqual({ id: 42 })
    const arg = upload.mock.calls[0]![0] as { files: Record<string, unknown>[] }
    expect(arg.files).toHaveLength(1)
    expect(arg.files[0]).toMatchObject({
      originalFilename: 'menu.jpg',
      mimetype: 'image/jpeg',
      size: Buffer.from('jpeg-bytes').length,
    })
    expect(typeof arg.files[0]!['filepath']).toBe('string')
    expect(arg.files[0]!['path']).toBeUndefined()
  })

  it('ลบโฟลเดอร์ชั่วคราวทิ้งแม้ upload จะโยน', async () => {
    const paths: string[] = []
    const upload = vi.fn(async (arg: { files: { filepath: string }[] }) => {
      paths.push(arg.files[0]!.filepath)
      throw new Error('provider down')
    })
    const strapi = { plugin: () => ({ service: () => ({ upload }) }) } as unknown as StrapiV5

    await expect(createImageStore(strapi).write({
      buffer: Buffer.from('x'), mime: 'image/png', filename: 'a.png',
    })).rejects.toThrow('provider down')

    const { existsSync } = await import('node:fs')
    expect(existsSync(paths[0]!)).toBe(false)
  })

  it('read อ่านผ่าน upload service ไม่ใช่ documents() — ไฟล์ไม่ใช่ document', async () => {
    const findOne = vi.fn(async () => ({ url: 'https://cdn.example.com/menu.jpg' }))
    const strapi = { plugin: () => ({ service: () => ({ findOne }) }) } as unknown as StrapiV5

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    )
    const buffer = await createImageStore(strapi).read(9)
    expect(findOne).toHaveBeenCalledWith(9)
    expect([...buffer]).toEqual([1, 2, 3])
    fetchSpy.mockRestore()
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project strapi-v5 tests/repo.test.ts
```

คาดว่าล้มด้วย `Cannot find module '../server/src/repo.js'`

- [ ] **Step 3: implement**

`packages/strapi-v5/server/src/repo.ts`

```ts
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AuditRow, ChannelRow, ImageStore, ListParams, Repo, RichMenuRow, ScheduleRow,
} from '@fosivo/line-rich-menu-core'
import { UID } from './content-types/index.js'
import type { DocumentParams, StrapiV5 } from './strapi.js'

type Entity = Record<string, unknown>

/**
 * `documentId` ของ relation ที่ populate มาแล้ว — คืน `null` เมื่อไม่ได้ populate หรือไม่มีค่า
 *
 * ห้ามใช้ `entity.id` แทน: `id` คือ primary key ของแถว ส่วน `documentId` คือตัวระบุที่ทั้ง
 * Document Service และชั้น service ของเราใช้ ในตารางที่มีแถวเดียวสองค่านี้แยกกันไม่ออกด้วยตา
 * แต่พอมีหลายแถวเมื่อไหร่ การหยิบผิดตัวจะทำให้ทุกคำขอชี้ไปแถวอื่น
 */
const documentIdOf = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const id = (value as { documentId?: unknown }).documentId
  return typeof id === 'string' ? id : null
}

/** id ของไฟล์ใน upload plugin ยังเป็นตัวเลขใน Strapi 5 — media ไม่ใช่ document */
const fileIdOf = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const id = (value as { id?: unknown }).id
  return typeof id === 'number' ? id : null
}

const orNull = <T>(value: unknown): T | null => (value === undefined || value === null ? null : value as T)

/**
 * ตัวช่วยประกาศ repo หนึ่งตัว — คู่ขนานกับ `define` ใน packages/strapi-v4/src/server/repo.ts
 * ต่างกันแค่ว่า id เดินทางใน object พารามิเตอร์แทนที่จะเป็น argument ตัวที่สอง และไม่มี
 * `Number()` ที่ไหนเลย เพราะ `documentId` เป็นสตริงอยู่แล้วทั้งขาเข้าและขาออก (สเปก §6.2)
 */
function define<TRow extends { id: string }>(
  strapi: StrapiV5,
  uid: string,
  shape: {
    toRow(entity: Entity): TRow
    toData(patch: Partial<TRow>): Entity
    mapFilters?(filters: NonNullable<ListParams['filters']>): Record<string, unknown>
    populate?: readonly string[]
  },
): Repo<TRow> {
  const populate = shape.populate === undefined ? {} : { populate: [...shape.populate] }

  const params = (input?: ListParams): DocumentParams => ({
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
      const rows = await strapi.documents(uid).findMany(params(input))
      return (rows as Entity[]).map(shape.toRow)
    },
    async findOne(id) {
      const entity = await strapi.documents(uid).findOne({ documentId: id, ...populate })
      return entity === null || entity === undefined ? null : shape.toRow(entity as Entity)
    },
    async create(data) {
      const created = await strapi.documents(uid).create({ data: shape.toData(data), ...populate })
      return shape.toRow(created as Entity)
    },
    async update(id, data) {
      const updated = await strapi.documents(uid).update({ documentId: id, data: shape.toData(data), ...populate })
      return shape.toRow(updated as Entity)
    },
    async delete(id) {
      await strapi.documents(uid).delete({ documentId: id })
    },
  }
}

export function createChannelRepo(strapi: StrapiV5): Repo<ChannelRow> {
  return define<ChannelRow>(strapi, UID.channel, {
    toRow: (entity) => ({
      id: entity['documentId'] as string,
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

export function createMenuRepo(strapi: StrapiV5): Repo<RichMenuRow> {
  return define<RichMenuRow>(strapi, UID.menu, {
    populate: ['channel', 'image', 'normalizedImage'],
    mapFilters: (filters) => {
      const { channelId, ...rest } = filters
      // `channelId` ในชั้น service คือ relation ชื่อ `channel` — v5 กรอง relation ด้วย documentId
      // ของปลายทาง ไม่ใช่ด้วยตัวเลขแบบ v4 จุดเดียวในโค้ดเบสที่รู้เรื่องนี้
      return channelId === undefined || channelId === null
        ? rest
        : { ...rest, channel: { documentId: String(channelId) } }
    },
    toRow: (entity) => {
      const width = entity['normalizedWidth']
      const height = entity['normalizedHeight']
      return {
        id: entity['documentId'] as string,
        name: entity['name'] as string,
        channelId: documentIdOf(entity['channel']) ?? '',
        size: entity['size'] as RichMenuRow['size'],
        chatBarText: (entity['chatBarText'] as string | undefined) ?? '',
        chatBarMode: entity['chatBarMode'] as RichMenuRow['chatBarMode'],
        selected: entity['selected'] === true,
        templateKey: orNull<string>(entity['templateKey']),
        areas: (entity['areas'] as RichMenuRow['areas'] | undefined) ?? [],
        imageFileId: fileIdOf(entity['image']),
        areaImages: (entity['areaImages'] as RichMenuRow['areaImages'] | undefined) ?? [],
        normalizedFileId: fileIdOf(entity['normalizedImage']),
        normalizedMime: orNull<RichMenuRow['normalizedMime']>(entity['normalizedMime']),
        normalizedSize: typeof width === 'number' && typeof height === 'number' ? { width, height } : null,
        aliasId: orNull<string>(entity['aliasId']),
        status: entity['status'] as RichMenuRow['status'],
        lineRichMenuId: orNull<string>(entity['lineRichMenuId']),
        // `publishedAt` ในชั้น service คือคอลัมน์ `linePublishedAt` — ชื่อเดิมถูก Strapi จองไว้
        publishedAt: orNull<string>(entity['linePublishedAt']),
        lastError: orNull<string>(entity['lastError']),
        updatedAt: (entity['updatedAt'] as string | undefined) ?? '',
      }
    },
    toData: (patch) => {
      const data: Entity = {}
      if (patch.name !== undefined) data['name'] = patch.name
      // `set` เขียนทับ relation ทั้งชุด ต่างจาก `connect` ที่เพิ่มเข้าไป — เมนูมี channel ได้ตัวเดียว
      // การใช้ connect จะสะสม relation ทุกครั้งที่ save แทนที่จะย้าย
      if (patch.channelId !== undefined) data['channel'] = { set: [patch.channelId] }
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

export function createScheduleRepo(strapi: StrapiV5): Repo<ScheduleRow> {
  return define<ScheduleRow>(strapi, UID.schedule, {
    populate: ['richMenu'],
    mapFilters: (filters) => {
      const { richMenuId, ...rest } = filters
      return richMenuId === undefined || richMenuId === null
        ? rest
        : { ...rest, richMenu: { documentId: String(richMenuId) } }
    },
    toRow: (entity) => ({
      id: entity['documentId'] as string,
      richMenuId: documentIdOf(entity['richMenu']) ?? '',
      runAt: entity['runAt'] as string,
      op: entity['op'] as ScheduleRow['op'],
      state: entity['state'] as ScheduleRow['state'],
      lockedBy: orNull<string>(entity['lockedBy']),
      lockedAt: orNull<string>(entity['lockedAt']),
      lastError: orNull<string>(entity['lastError']),
    }),
    toData: (patch) => {
      const data: Entity = {}
      if (patch.richMenuId !== undefined) data['richMenu'] = { set: [patch.richMenuId] }
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

export function createAuditRepo(strapi: StrapiV5): Repo<AuditRow> {
  return define<AuditRow>(strapi, UID.audit, {
    toRow: (entity) => ({
      id: entity['documentId'] as string,
      actorId: entity['actorId'] === null || entity['actorId'] === undefined ? null : String(entity['actorId']),
      action: entity['action'] as AuditRow['action'],
      richMenuId: orNull<string>(entity['richMenuId']),
      channelId: (entity['channelId'] as string | undefined) ?? '',
      before: entity['before'] ?? null,
      after: entity['after'] ?? null,
      result: entity['result'] as AuditRow['result'],
      errorCode: orNull<string>(entity['errorCode']),
    }),
    // ต่างจาก v4 ตรงที่ richMenuId/channelId ไม่ถูกแปลงเป็นตัวเลข — คอลัมน์ของ v5 เป็น string
    // และค่าที่ใส่คือ documentId ส่วน actorId ยังเป็นตัวเลขเพราะ admin user ของ v5 ยังใช้ id ตัวเลข
    toData: (patch) => ({
      actorId: numberOrNull(patch.actorId),
      action: patch.action,
      richMenuId: patch.richMenuId ?? null,
      channelId: patch.channelId,
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
 * ขาอ่านไม่ใช้ `documents('plugin::upload.file')` เพราะไฟล์ไม่ใช่ document — มันไม่มี
 * `documentId` เลย ใช้ `upload.findOne(id)` ซึ่งรับ id ตัวเลขตรง ๆ แทน
 *
 * ขาเขียนต่างจาก v4 ตรงรูปทรงของไฟล์: upload service ของ v5 อ่าน `originalFilename`,
 * `mimetype` และ `filepath` (formidable v3) ไม่ใช่ `name`, `type`, `path` (formidable v1/v2)
 * และรับเป็นอาเรย์เสมอ ส่งของ v4 ไปจะได้ไฟล์ชื่อ `unamed` mime `application/octet-stream`
 * ที่ LINE ปฏิเสธตอน publish โดยไม่มีอะไรใน log ของ Strapi ผิดปกติเลย
 */
export function createImageStore(strapi: StrapiV5): ImageStore {
  const uploadService = () => strapi.plugin('upload').service<{
    upload(args: { data: unknown; files: unknown[] }): Promise<{ id: number }[]>
    findOne(id: number, populate?: unknown): Promise<{ url?: string } | null>
  }>('upload')

  return {
    async read(fileId) {
      const file = await uploadService().findOne(fileId)
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
      const filepath = join(directory, filename)
      try {
        await writeFile(filepath, buffer)
        const uploaded = await uploadService().upload({
          data: { fileInfo: { name: filename, alternativeText: null, caption: null } },
          files: [{ filepath, originalFilename: filename, mimetype: mime, size: buffer.length }],
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

- [ ] **Step 4: เขียว**

```bash
pnpm test --project strapi-v5 && pnpm typecheck
```

- [ ] **Step 5: commit**

```bash
git add packages/strapi-v5
git commit -m "feat(v5): back the Repo seam with documents() and the v5 upload contract"
```

---

## Task 4: plugin config + service container — และคอลัมน์ที่ lock ต้องยิงใส่

**Files:**
- Create: `packages/strapi-v5/server/src/config.ts`, `packages/strapi-v5/server/src/container.ts`
- Modify: `packages/strapi-v5/server/src/index.ts`
- Test: `packages/strapi-v5/tests/config.test.ts`, `packages/strapi-v5/tests/container.test.ts`

**Interfaces:**
- Consumes: `createScheduleLock`, `createChannelService`, `createAuditWriter`, `createRateLimiter`, `createScrubbedLogger`, `resolveEncryptionKey`, `LineClient`, `PluginConfig` จาก `@fosivo/line-rich-menu-core` (Plan 03) · `createChannelRepo`/`createMenuRepo`/`createScheduleRepo`/`createAuditRepo`/`createImageStore` จาก Task 3
- Produces:
  - `const configDefault: PluginConfig` · `function validateConfig(value: unknown): PluginConfig` · `function readConfig(strapi: StrapiV5): PluginConfig`
  - `interface Services { config; logger; channels; menus; schedules; audit; limiter; store; lock; clientFor(channel: ChannelWithSecrets): LineClient }`
  - `function getServices(strapi: StrapiV5): Services`
  - `const SCHEDULE_ID_COLUMN = 'document_id'`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v5/tests/config.test.ts` — คัดลอกจาก `packages/strapi-v4/tests/config.test.ts` ทั้งไฟล์ แล้วเปลี่ยน import สองบรรทัดบนสุดให้ชี้ไป `../server/src/config.js` แทน `../src/server/config.js` เนื้อในของ config ไม่มีอะไรผูกกับเวอร์ชันของ Strapi เลย

`packages/strapi-v5/tests/container.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { SCHEDULE_ID_COLUMN, getServices } from '../server/src/container.js'
import type { StrapiV5 } from '../server/src/strapi.js'

/**
 * knex ปลอมที่บันทึกชื่อคอลัมน์ที่ถูกอ้างถึงใน `where` ตัวแรก — เทสต์ในไฟล์นี้ไม่ได้สนใจว่า
 * query คืนอะไร แต่สนใจว่า **มันยิงใส่คอลัมน์ไหน**
 */
function fakeKnex() {
  const wheres: [string, unknown][] = []
  const builder = {
    where(column: string, value: unknown) { wheres.push([column, value]); return builder },
    whereIn() { return builder },
    andWhere(group: (b: unknown) => void) {
      group({ whereNull: () => ({ orWhere: () => undefined }) })
      return builder
    },
    async update() { return 1 },
  }
  return { knex: () => builder, wheres }
}

function fakeStrapi(connection: unknown) {
  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {
      get: <T>(path: string, fallback?: T) => {
        if (path === 'plugin.line-rich-menu') return {} as unknown as T
        if (path === 'server.app.keys') return ['app-key-one-that-is-long-enough'] as unknown as T
        return fallback as T
      },
    },
    documents: () => ({}) as never,
    plugin: () => ({ service: () => ({}), contentType: () => ({}) }),
    db: { connection },
    dirs: { static: { public: '/tmp' } },
  } as unknown as StrapiV5
}

describe('getServices', () => {
  it('ประกอบครั้งเดียวต่อหนึ่ง instance แล้วจำไว้ — rate limiter ถือถังไว้ในตัวเอง', () => {
    const { knex } = fakeKnex()
    const strapi = fakeStrapi(knex)
    expect(getServices(strapi)).toBe(getServices(strapi))
  })

  it('strapi คนละตัวได้ services คนละชุด ไม่ปนกัน', () => {
    const a = fakeStrapi(fakeKnex().knex)
    const b = fakeStrapi(fakeKnex().knex)
    expect(getServices(a)).not.toBe(getServices(b))
  })
})

/**
 * ด่านที่แพงที่สุดในไฟล์นี้ และเป็นข้อที่โน้ตส่งต่อของ Plan 03 มองข้าม
 *
 * `lock.ts` ใน core ย้ายมาใช้กับ v5 ได้จริงโดยไม่ต้องแก้สักบรรทัด — แต่ **การต่อสายเข้ากับมัน
 * ย้ายมาไม่ได้** เพราะ `ScheduleRow.id` ของ v5 คือ `documentId` ส่วน lock query ยิงผ่าน knex
 * ตรง ๆ ซึ่งมองเห็นแค่คอลัมน์ในตาราง ค่าเริ่มต้นของ `ScheduleLockColumns.id` คือ `'id'` ซึ่งเป็น
 * primary key ตัวเลข การส่ง documentId เข้าไปเทียบกับคอลัมน์นั้นได้ผลลัพธ์เดียวเสมอคือ
 * `affected === 0` แปลว่า **claim ไม่เคยสำเร็จเลยสักครั้ง** ทุกงานที่ตั้งเวลาไว้จะถูกข้ามเงียบ ๆ
 * ทุกนาที โดยที่ `tick` รายงาน `{ due: n, claimed: 0 }` ซึ่งอ่านเหมือนระบบทำงานปกติ
 *
 * บน sqlite `where id = 'kx91...'` ไม่ error ด้วยซ้ำ — มันแค่ไม่ตรงอะไรเลย
 */
describe('scheduler lock', () => {
  it('claim ยิงใส่คอลัมน์ document_id ไม่ใช่ id', async () => {
    const { knex, wheres } = fakeKnex()
    const services = getServices(fakeStrapi(knex))
    await services.lock.claim('kx91p2m4c7v0b8n3q5r6t7y8', 'host:1')
    expect(wheres[0]).toEqual([SCHEDULE_ID_COLUMN, 'kx91p2m4c7v0b8n3q5r6t7y8'])
    expect(SCHEDULE_ID_COLUMN).toBe('document_id')
  })

  it('release ยิงใส่คอลัมน์เดียวกัน', async () => {
    const { knex, wheres } = fakeKnex()
    const services = getServices(fakeStrapi(knex))
    await services.lock.release('kx91p2m4c7v0b8n3q5r6t7y8', 'host:1', 'done', null)
    expect(wheres[0]![0]).toBe(SCHEDULE_ID_COLUMN)
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project strapi-v5 tests/container.test.ts
```

คาดว่าล้มด้วย `Cannot find module '../server/src/container.js'`

- [ ] **Step 3: implement**

`packages/strapi-v5/server/src/config.ts` — คัดลอกจาก `packages/strapi-v4/src/server/config.ts` ทั้งไฟล์ แล้วเปลี่ยนแค่ `import type { StrapiV4 } from './strapi.js'` เป็น `import type { StrapiV5 } from './strapi.js'` และ signature ของ `readConfig` เป็น `readConfig(strapi: StrapiV5)` — เนื้อในไม่มีอะไรผูกกับเวอร์ชัน

`packages/strapi-v5/server/src/container.ts`

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
import type { StrapiV5 } from './strapi.js'

/**
 * คอลัมน์ที่ lock query ต้องยิงใส่บน Strapi 5
 *
 * `createScheduleLock` มี `options.columns` ไว้ให้แทนที่ชื่อคอลัมน์ได้อยู่แล้ว และนี่คือจุดเดียว
 * ในทั้งโปรเจกต์ที่ต้องใช้มัน: ตัวระบุที่ชั้น service ส่งเข้า `claim`/`release` คือ `documentId`
 * ส่วนคอลัมน์ `id` ในตารางคือ primary key ตัวเลขซึ่งไม่มีทางตรงกัน ค่า default `'id'` จะทำให้
 * `affected` เป็น 0 เสมอ แปลว่า claim ไม่เคยสำเร็จ ทุกงานที่ตั้งเวลาไว้ถูกข้ามทุกนาทีโดยที่
 * รายงานของ tick อ่านเหมือนปกติ (`due: n, claimed: 0` แยกจาก "ไม่มีงานถึงกำหนด" ไม่ออกด้วยตา)
 *
 * export ออกมาเป็นค่าคงที่แทนที่จะฝังเป็น literal เพื่อให้ tests/container.test.ts อ้างถึงตัวเดียวกัน
 * ได้ ไม่ใช่พิมพ์สตริงซ้ำแล้วพิสูจน์แค่ว่าตัวเองเท่ากับตัวเอง
 */
export const SCHEDULE_ID_COLUMN = 'document_id'

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
 * ประกอบครั้งเดียวต่อหนึ่ง instance ของ Strapi แล้วจำไว้ — ไม่ใช่การ optimise
 * `createRateLimiter` ถือถังของแต่ละ channel ไว้ในหน่วยความจำของตัวเอง ประกอบใหม่ทุกคำขอ
 * แปลว่าทุกคำขอได้ถังเต็มใบใหม่ คือ rate limit ไม่ทำงานเลย
 */
const cache = new WeakMap<StrapiV5, Services>()

export function getServices(strapi: StrapiV5): Services {
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
    lock: createScheduleLock(strapi.db.connection as KnexLike, {
      ttlMs: config.scheduler.lockTtlMs,
      columns: { id: SCHEDULE_ID_COLUMN },
    }),
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

`packages/strapi-v5/server/src/index.ts`

```ts
import { configDefault, validateConfig } from './config.js'
import { contentTypes } from './content-types/index.js'

export default {
  config: { default: configDefault, validator: validateConfig },
  contentTypes,
}
```

- [ ] **Step 4: เขียว**

```bash
pnpm test --project strapi-v5 && pnpm typecheck
```

- [ ] **Step 5: commit**

```bash
git add packages/strapi-v5
git commit -m "feat(v5): wire the service container and bind the scheduler lock to document_id"
```

---

## Task 5: zod ที่ขอบทุกเส้น · route แบบ `type: 'admin'` · controller

**Files:**
- Create: `packages/strapi-v5/server/src/validation.ts`, `http-error.ts`, `menu-write.ts`, `permissions.ts`, `routes/admin.ts`, `routes/index.ts`, `controllers/channels.ts`, `controllers/menus.ts`, `controllers/schedules.ts`, `controllers/index.ts`
- Modify: `packages/strapi-v5/server/src/index.ts`
- Test: `packages/strapi-v5/tests/validation.test.ts`, `packages/strapi-v5/tests/controllers.test.ts`

**Interfaces:**
- Consumes: `getServices`, `Services` จาก Task 4 · `publishMenu`, `setMenuAsDefault`, `clearChannelDefault`, `reconcileChannel`, `ValidationError`, `imageFingerprint`, `prepareImage`, `actionSchema`, `boundsSchema` จาก `@fosivo/line-rich-menu-core`
- Produces:
  - `const idParam: z.ZodString` — รับ `documentId` ของ Strapi 5 ไม่ใช่ตัวเลข
  - `const menuInputSchema`, `channelCreateSchema`, `channelUpdateSchema`, `publishBodySchema`, `listQuerySchema`, `setDefaultBodySchema`
  - `type MenuInput = z.infer<typeof menuInputSchema>`
  - `function guard(handler: (ctx: AdminContext) => Promise<void>): (ctx: AdminContext) => Promise<void>` · `interface AdminContext`
  - `const admin: { type: 'admin'; routes: { method: string; path: string; handler: string; config: { policies: unknown[] } }[] }`
  - `const controllers: { channels; menus; schedules }`
  - `const PERMISSION: { read; write; publish; settings }` · `const PLUGIN_ID = 'line-rich-menu'`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v5/tests/validation.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { channelCreateSchema, idParam, listQuerySchema, menuInputSchema } from '../server/src/validation.js'

const menu = {
  name: 'เมนูหลัก',
  channelId: 'ch0000000000000000000001',
  size: 'large' as const,
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom' as const,
  selected: true,
  templateKey: null,
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'ไง' } }],
  imageFileId: 3,
  areaImages: [],
  aliasId: 'main',
  startAt: null,
  endAt: null,
}

/**
 * โน้ตส่งต่อของ Plan 03 บอกว่า `validation.ts` "ย้ายไปได้เกือบทั้งดุ้น" — จริงทุกบรรทัดยกเว้น
 * บรรทัดเดียวนี้ และมันเป็นบรรทัดที่ทำให้ทั้งปลั๊กอินใช้ไม่ได้ถ้าย้ายมาตรง ๆ
 *
 * v4 ใช้ `z.string().regex(/^\d+$/)` เพราะ id ของ v4 เป็นตัวเลข ส่วน documentId ของ v5
 * เป็นสตริงตัวอักษรผสมตัวเลข 24 ตัว regex ของ v4 จะปฏิเสธมันทุกตัว ผลคือ **ทุก route ที่มี
 * `:id` ตอบ 400 `validation_failed` เสมอ** ตั้งแต่คำขอแรก ซึ่งอ่านเหมือนฝั่ง UI ส่งของผิด
 */
describe('idParam ของ Strapi 5', () => {
  it('รับ documentId ที่เป็นตัวอักษรผสมตัวเลข', () => {
    expect(idParam.parse('kx91p2m4c7v0b8n3q5r6t7y8')).toBe('kx91p2m4c7v0b8n3q5r6t7y8')
  })

  it('ยังรับสตริงตัวเลขล้วน — id ของ admin user ที่ไหลมาทาง path ก็ยังต้องผ่าน', () => {
    expect(idParam.parse('7')).toBe('7')
  })

  it('ปฏิเสธค่าที่ว่าง ค่าที่ยาวเกินจริง และค่าที่มีอักขระที่ไม่ใช่ id', () => {
    for (const bad of ['', 'a'.repeat(65), '../../etc/passwd', 'ab cd', "a'or'1"]) {
      expect(() => idParam.parse(bad), bad).toThrow()
    }
  })
})

describe('menuInputSchema', () => {
  it('รับ payload ที่ครบและถูกต้อง', () => {
    expect(menuInputSchema.parse(menu).channelId).toBe('ch0000000000000000000001')
  })

  it('channelId เป็น documentId ไม่ใช่ตัวเลข', () => {
    expect(() => menuInputSchema.parse({ ...menu, channelId: 'ch0000000000000000000001' })).not.toThrow()
  })

  it('ปฏิเสธฟิลด์แปลกปลอม (สเปก §11.3 — .strict() ทุกตัว)', () => {
    expect(() => menuInputSchema.parse({ ...menu, extra: true })).toThrow()
  })

  it('chatBarText เกิน 14 ตัวไม่ผ่าน — ข้อจำกัดของ LINE เอง', () => {
    expect(() => menuInputSchema.parse({ ...menu, chatBarText: 'ก'.repeat(15) })).toThrow()
  })

  it('areas ต้องมี 1–20 ช่อง', () => {
    expect(() => menuInputSchema.parse({ ...menu, areas: [] })).toThrow()
    expect(() => menuInputSchema.parse({ ...menu, areas: Array.from({ length: 21 }, () => menu.areas[0]) })).toThrow()
  })

  it('imageFileId ยังเป็นตัวเลข — ไฟล์ของ upload plugin ไม่ใช่ document', () => {
    expect(() => menuInputSchema.parse({ ...menu, imageFileId: 'abc' })).toThrow()
    expect(menuInputSchema.parse({ ...menu, imageFileId: null }).imageFileId).toBeNull()
  })

  it('aliasId ต้องเป็น slug ที่ LINE รับได้', () => {
    expect(() => menuInputSchema.parse({ ...menu, aliasId: 'Main Menu' })).toThrow()
  })
})

describe('listQuerySchema', () => {
  it('channel เป็น documentId', () => {
    expect(listQuerySchema.parse({ channel: 'ch0000000000000000000001' }).channel)
      .toBe('ch0000000000000000000001')
  })

  it('ปฏิเสธ query แปลกปลอม', () => {
    expect(() => listQuerySchema.parse({ nope: '1' })).toThrow()
  })
})

describe('channelCreateSchema', () => {
  it('ปฏิเสธ token ที่ว่าง', () => {
    expect(() => channelCreateSchema.parse({ name: 'ร้าน', channelId: '165', channelAccessToken: '' })).toThrow()
  })
})
```

`packages/strapi-v5/tests/controllers.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { controllers } from '../server/src/controllers/index.js'
import { admin } from '../server/src/routes/admin.js'
import { PERMISSION } from '../server/src/permissions.js'
import type { AdminContext } from '../server/src/http-error.js'
import type { StrapiV5 } from '../server/src/strapi.js'

function makeCtx(over: Partial<AdminContext> = {}): AdminContext {
  return {
    request: { body: {} },
    query: {},
    params: {},
    state: { user: { id: 7 } },
    status: 200,
    body: undefined,
    set: vi.fn(),
    ...over,
  } as AdminContext
}

/** route table ไม่ต้องการ strapi จริง — controller factory ถูกเรียกเพื่อดูว่ามีเมธอดอยู่เท่านั้น */
const strapi = {} as StrapiV5

describe('route ทุกเส้น (สเปก §11.4)', () => {
  it('เป็น type: admin ทั้งชุด ไม่มีข้อยกเว้น', () => {
    expect(admin.type).toBe('admin')
  })

  it('ทุกเส้นมี policy admin::hasPermissions พร้อม action ที่รู้จัก', () => {
    const known = new Set(Object.values(PERMISSION))
    for (const route of admin.routes) {
      const policies = route.config.policies as { name: string; config: { actions: string[] } }[]
      expect(policies, route.path).toHaveLength(1)
      expect(policies[0]!.name, route.path).toBe('admin::hasPermissions')
      expect(policies[0]!.config.actions, route.path).toHaveLength(1)
      expect(known.has(policies[0]!.config.actions[0]!), route.path).toBe(true)
    }
  })

  it('handler ทุกตัวที่ route อ้างถึงมีอยู่จริงใน controllers', () => {
    for (const route of admin.routes) {
      const [name, method] = route.handler.split('.')
      const factory = (controllers as Record<string, (deps: { strapi: StrapiV5 }) => Record<string, unknown>>)[name!]
      expect(factory, route.handler).toBeTypeOf('function')
      expect(factory!({ strapi })[method!], route.handler).toBeTypeOf('function')
    }
  })

  // path ที่ ui ยิงจริงถูกประกาศไว้ที่ packages/ui/src/api.ts — สองฝั่งต้องตรงกันเป๊ะ
  it('ครอบคลุมทุก path ที่ ENDPOINTS ประกาศ (เทียบแบบไม่สน :id)', () => {
    const declared = new Set(admin.routes.map((route) => `${route.method} ${route.path}`))
    for (const expected of [
      'GET /channels', 'POST /channels', 'PUT /channels/:id', 'POST /channels/:id/test',
      'GET /menus', 'GET /menus/:id', 'POST /menus', 'PUT /menus/:id', 'DELETE /menus/:id',
      'POST /menus/:id/publish', 'POST /menus/:id/default', 'DELETE /menus/:id/default',
      'POST /schedules/tick',
    ]) {
      expect(declared.has(expected), expected).toBe(true)
    }
  })
})

/**
 * strapi ปลอมที่มีเฉพาะสิ่งที่ `getServices` เดินผ่านจริง — controller ทุกตัวเรียก
 * `getServices(strapi)` เป็นบรรทัดแรกก่อนแตะ zod ด้วยซ้ำ การส่ง `{}` เข้าไปจึงได้ 500 จาก
 * `resolveEncryptionKey` ทุกครั้ง ซึ่งกลบสิ่งที่เทสต์ตั้งใจจะพิสูจน์ทั้งหมด
 */
function fakeStrapi(rows: Record<string, Record<string, unknown>[]> = {}) {
  const table = (uid: string) => (rows[uid] ??= [])
  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {
      get: <T>(path: string, fallback?: T) =>
        (path === 'server.app.keys' ? (['app-key-one-that-is-long-enough'] as unknown as T) : (fallback as T)),
    },
    dirs: { static: { public: '/tmp' } },
    plugin: () => ({ service: () => ({}), contentType: () => ({}) }),
    db: { connection: () => ({ where: () => ({}) }) },
    cron: { add: vi.fn() },
    admin: { services: { permission: { actionProvider: { registerMany: async () => {} } } } },
    documents: (uid: string) => ({
      findMany: async () => [...table(uid)],
      findOne: async ({ documentId }: { documentId: string }) =>
        table(uid).find((row) => row['documentId'] === documentId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { documentId: `doc${table(uid).length + 1}`, ...data }
        table(uid).push(row)
        return row
      },
      update: async ({ documentId, data }: { documentId: string; data: Record<string, unknown> }) => {
        const row = table(uid).find((candidate) => candidate['documentId'] === documentId)!
        Object.assign(row, data)
        return row
      },
      delete: async ({ documentId }: { documentId: string }) => {
        rows[uid] = table(uid).filter((row) => row['documentId'] !== documentId)
        return { documentId }
      },
    }),
  } as unknown as StrapiV5
}

describe('guard แปลง error เป็น response ที่มี code เสมอ', () => {
  it('ZodError กลายเป็น 400 validation_failed พร้อม issues ไม่ใช่ 500 เปล่า ๆ', async () => {
    const ctx = makeCtx({ params: { id: 'doc1' }, request: { body: { nope: true } } })
    await controllers.menus({ strapi: fakeStrapi() }).update(ctx)
    expect(ctx.status).toBe(400)
    const body = ctx.body as { error: { code: string; issues: { path: string }[] } }
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.issues.length).toBeGreaterThan(0)
  })

  it('query ที่มีฟิลด์แปลกปลอมก็เป็น 400 ไม่ใช่ถูกเมิน (สเปก §11.3 .strict())', async () => {
    const ctx = makeCtx({ query: { nope: '1' } })
    await controllers.menus({ strapi: fakeStrapi() }).find(ctx)
    expect(ctx.status).toBe(400)
  })

  // สเปก §11.7 — UI แปล `code` เป็นข้อความเอง ชั้นนี้จึงห้ามส่ง message, stack หรืออะไรที่
  // สะท้อนสิ่งที่เซิร์ฟเวอร์รู้กลับไป
  it('body ที่ตอบกลับมีแต่ code กับ issues ไม่มี stack ไม่มีข้อความดิบ', async () => {
    const ctx = makeCtx({ params: { id: 'doc1' }, request: { body: { nope: true } } })
    await controllers.menus({ strapi: fakeStrapi() }).update(ctx)
    const serialised = JSON.stringify(ctx.body)
    expect(serialised).not.toContain('stack')
    expect(serialised).not.toContain('at Object')
  })

  it('id ที่ไม่มีอยู่ตอบ 404 menu_not_found ไม่ใช่ 500', async () => {
    const ctx = makeCtx({ params: { id: 'doesnotexist' } })
    await controllers.menus({ strapi: fakeStrapi() }).findOne(ctx)
    expect(ctx.status).toBe(404)
    expect((ctx.body as { error: { code: string } }).error.code).toBe('menu_not_found')
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project strapi-v5 tests/validation.test.ts tests/controllers.test.ts
```

คาดว่าล้มด้วย `Cannot find module '../server/src/validation.js'`

- [ ] **Step 3: implement**

`packages/strapi-v5/server/src/permissions.ts`, `http-error.ts`, `menu-write.ts` — คัดลอกจาก `packages/strapi-v4/src/server/` ทั้งสามไฟล์ **โดยไม่แก้อะไรเลย** ทั้งสามตัวรับ dependency ทางพารามิเตอร์ล้วนและไม่มีบรรทัดไหนอ้างถึง `entityService` หรือรูปแบบของ id (`menu-write.ts` import `Services` จาก `./container.js` ซึ่งเป็นตัวของ v5 อยู่แล้วเพราะเป็น path สัมพัทธ์)

`packages/strapi-v5/server/src/validation.ts` — คัดลอกจาก v4 แล้วแทนที่บล็อกของ `idParam` ด้วย

```ts
/**
 * ตัวระบุของ Strapi 5 คือ `documentId` — สตริงตัวพิมพ์เล็กผสมตัวเลข 24 ตัวที่ Strapi สร้างเอง
 * ไม่ใช่เลขจำนวนเต็มแบบ v4 การยก `/^\d+$/` ของ v4 มาตรง ๆ จะทำให้ทุก route ที่มี `:id`
 * ตอบ 400 ตั้งแต่คำขอแรก
 *
 * ยังคุมรูปทรงไว้แน่น ไม่ใช่ `z.string()` เปล่า ๆ — ค่านี้ถูกส่งต่อลงไปเป็นเงื่อนไข query และเป็น
 * ส่วนหนึ่งของ path เพราะฉะนั้นการจำกัดให้เหลือ [A-Za-z0-9_-] ยาวไม่เกิน 64 คือการปิดทั้ง
 * path traversal และการยัดอักขระควบคุมเข้าไปในชั้นที่อยู่ถัดไป โดยไม่ต้องเดาว่าชั้นนั้นกันไว้แล้วหรือยัง
 */
export const idParam = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'id must be a document id')
```

ส่วนที่เหลือของไฟล์เหมือน v4 ทุกบรรทัด — `menuInputSchema.channelId` ยังเป็น `idParam` (ซึ่งตอนนี้หมายถึง documentId แล้ว) และ `imageFileId` ยังเป็น `z.number().int().positive().nullable()` เพราะไฟล์ของ upload plugin ยังใช้ id ตัวเลขใน Strapi 5

`packages/strapi-v5/server/src/routes/admin.ts` และ `routes/index.ts` — คัดลอกจาก v4 ทั้งสองไฟล์ ไม่แก้อะไร (path และสิทธิ์เหมือนกันทุกเส้น เพราะ `ENDPOINTS` ฝั่ง ui เป็นตัวเดียวกัน)

**อ่านไฟล์ต้นทางตอนคัดลอก อย่าเชื่อรายการในแผนนี้** — Plan 03 มีภาคผนวก Task 21 ที่เพิ่ม `DELETE /channels/:id/orphans/:lineRichMenuId` (พร้อม `deleteOrphan` ใน `core` และ `ENDPOINTS.channelOrphan` ใน `ui`) ซึ่งอาจ merge เข้ามาระหว่างที่แผนนี้ถูกเขียนหรือถูกรัน การคัดลอกไฟล์จริงจึงหยิบเส้นนั้นมาด้วยโดยอัตโนมัติ และ `controllers/channels.ts` ที่คัดลอกมาก็จะมี handler ของมันอยู่แล้ว เทสต์ใน Step 1 ตรวจแบบ "ต้องมีอย่างน้อยเส้นเหล่านี้" ไม่ใช่ "ต้องมีเท่านี้เป๊ะ" ด้วยเหตุผลนี้ — เส้นที่เพิ่มมาจึงไม่ทำให้มันแดง แต่ยังถูกตาราง RBAC บังคับครบทุกเส้นเหมือนกัน

`packages/strapi-v5/server/src/controllers/channels.ts`, `menus.ts`, `schedules.ts`, `index.ts` — คัดลอกจาก v4 ทั้งสี่ไฟล์ แล้วแก้สองอย่างเท่านั้นในแต่ละไฟล์ที่มี:

1. `import type { StrapiV4 } from '../strapi.js'` → `import type { StrapiV5 } from '../strapi.js'` และทุกที่ที่ใช้ `{ strapi }: { strapi: StrapiV4 }` → `{ strapi: StrapiV5 }`
2. ใน `controllers/channels.ts` เปลี่ยนคอมเมนต์และค่า sentinel ของขาล้มเหลว จาก

```ts
      // channel ยังไม่เกิด จึงยังไม่มี id ให้อ้าง — `channelId: '0'` คือ "ยังไม่มี"
      // และเป็นค่าที่คอลัมน์ integer แบบ required รับได้ ไม่ใช่ null ที่จะถูกปฏิเสธ
      await services.audit.write({
        ...context, channelId: '0', before: null, after: null,
```

เป็น

```ts
      // channel ยังไม่เกิด จึงยังไม่มี documentId ให้อ้าง — `'(none)'` คือ "ยังไม่มี" และเป็นค่าที่
      // คอลัมน์ string แบบ required รับได้ ไม่ใช่ null ที่จะถูกปฏิเสธ
      //
      // ต่างจาก v4 ที่ใช้ `'0'` เพราะคอลัมน์ที่นั่นเป็น integer — บน v5 การคง `'0'` ไว้จะอ่านได้
      // เหมือน documentId จริงที่ชื่อว่า "0" ซึ่งเป็นค่าที่คนไล่ audit แยกจากของจริงไม่ออก
      await services.audit.write({
        ...context, channelId: '(none)', before: null, after: null,
```

`packages/strapi-v5/server/src/index.ts`

```ts
import { configDefault, validateConfig } from './config.js'
import { contentTypes } from './content-types/index.js'
import { controllers } from './controllers/index.js'
import { routes } from './routes/index.js'
import type { StrapiV5 } from './strapi.js'

export default {
  // register ยังไม่มี logic จริง — พารามิเตอร์ไม่ได้ใช้ตอนนี้แต่ต้องอยู่เพื่อให้ตรง signature ที่ Strapi เรียก
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  register(_context: { strapi: StrapiV5 }): void {},
  config: { default: configDefault, validator: validateConfig },
  contentTypes,
  controllers,
  routes,
  services: {},
}
```

- [ ] **Step 4: เขียว**

```bash
pnpm test --project strapi-v5 && pnpm typecheck && pnpm lint
```

- [ ] **Step 5: commit**

```bash
git add packages/strapi-v5
git commit -m "feat(v5): add admin routes, controllers and a documentId-aware validation layer"
```

---

## Task 6: RBAC · bootstrap · cron

**Files:**
- Create: `packages/strapi-v5/server/src/tick.ts`, `packages/strapi-v5/server/src/bootstrap.ts`
- Modify: `packages/strapi-v5/server/src/index.ts`
- Test: `packages/strapi-v5/tests/rbac.test.ts`, `packages/strapi-v5/tests/cron.test.ts`

**Interfaces:**
- Consumes: `createScheduler`, `TickReport` จาก `@fosivo/line-rich-menu-core` · `getServices`, `Services` จาก Task 4 · `permissionActions` จาก Task 5
- Produces:
  - `function runTick(strapi: StrapiV5, services: Services): Promise<TickReport>`
  - `function registerCron(strapi: StrapiV5): void`
  - `function registerPermissions(strapi: StrapiV5): Promise<void>`
  - `function bootstrap(context: { strapi: StrapiV5 }): Promise<void>`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v5/tests/rbac.test.ts` — คัดลอกจาก `packages/strapi-v4/tests/rbac.test.ts` ทั้งไฟล์ แล้วเปลี่ยน path ของ import จาก `../src/server/…` เป็น `../server/src/…` และ `StrapiV4` เป็น `StrapiV5` ไม่มีอะไรอื่นต่างเลย เพราะ action provider ของ admin เป็น API ตัวเดียวกันทั้งสองเวอร์ชัน

`packages/strapi-v5/tests/cron.test.ts` — คัดลอกจาก `packages/strapi-v4/tests/cron.test.ts` แล้วเปลี่ยน path และชื่อ type เช่นเดียวกัน จากนั้น **เพิ่ม** เทสต์ตัวนี้ต่อท้าย

```ts
describe('runTick', () => {
  it('ประกอบ client ตาม channel ของแต่ละงาน ไม่ใช่ channel เริ่มต้นของระบบ', async () => {
    const clients: string[] = []
    const services = {
      channels: {
        list: async () => [{ id: 'ch1' }, { id: 'ch2' }],
        withSecrets: () => ({
          findOne: async (id: string) => ({ id, channelAccessToken: `token-${id}` }),
        }),
      },
      clientFor: (channel: { channelAccessToken: string }) => {
        clients.push(channel.channelAccessToken)
        return {} as never
      },
      schedules: { findMany: async () => [] },
      lock: { claim: async () => false, release: async () => undefined },
      menus: {}, audit: {},
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    }
    const strapi = { log: { debug: vi.fn(), error: vi.fn() } } as unknown as StrapiV5

    const report = await runTick(strapi, services as never)

    // ระบบที่มีหลาย OA จะยิงเมนูของ OA หนึ่งด้วย token ของอีก OA หนึ่งถ้าข้อนี้ผิด
    expect(clients).toEqual(['token-ch1', 'token-ch2'])
    expect(report).toEqual({ due: 0, claimed: 0, done: 0, failed: 0 })
  })
})
```

โดยเพิ่ม `import { runTick } from '../server/src/tick.js'` ที่หัวไฟล์

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project strapi-v5 tests/rbac.test.ts tests/cron.test.ts
```

คาดว่าล้มด้วย `Cannot find module '../server/src/tick.js'`

- [ ] **Step 3: implement**

`packages/strapi-v5/server/src/tick.ts` และ `bootstrap.ts` — คัดลอกจาก `packages/strapi-v4/src/server/` ทั้งสองไฟล์ แล้วเปลี่ยนเฉพาะ `StrapiV4` → `StrapiV5` ในบรรทัด import และในลายเซ็นของฟังก์ชัน เนื้อในเหมือนกันทุกบรรทัด — สเปก §2.1 ระบุไว้แล้วว่า `strapi.cron.add` เป็น API ตัวเดียวกันทั้งสองเวอร์ชัน และ `strapi.admin.services.permission.actionProvider.registerMany` ก็เช่นกัน

`packages/strapi-v5/server/src/index.ts` — เพิ่ม `bootstrap`

```ts
import { bootstrap } from './bootstrap.js'
import { configDefault, validateConfig } from './config.js'
import { contentTypes } from './content-types/index.js'
import { controllers } from './controllers/index.js'
import { routes } from './routes/index.js'
import type { StrapiV5 } from './strapi.js'

export default {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  register(_context: { strapi: StrapiV5 }): void {},
  bootstrap,
  config: { default: configDefault, validator: validateConfig },
  contentTypes,
  controllers,
  routes,
  services: {},
}
```

- [ ] **Step 4: เขียว**

```bash
pnpm test --project strapi-v5 && pnpm typecheck
```

- [ ] **Step 5: commit**

```bash
git add packages/strapi-v5
git commit -m "feat(v5): register the four permissions and run the scheduler tick on cron"
```

---

## Task 7: จับคู่ Design System v2 เข้ากับ `UIPort`

**Files:**
- Create: `packages/strapi-v5/admin/src/primitives.tsx`
- Test: `packages/strapi-v5/tests/admin/primitives.test.tsx`

**Interfaces:**
- Consumes: `UIPrimitives`, `usePort`, `PortProvider`, `createStubPort` จาก `@fosivo/line-rich-menu-ui` (Plan 02)
- Produces: `const primitives: UIPrimitives`

ติดตั้งก่อน:

```bash
pnpm add -D --filter strapi-plugin-line-rich-menu @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v5/tests/admin/primitives.test.tsx`

```tsx
// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { DesignSystemProvider } from '@strapi/design-system'
import { PortProvider, createStubPort } from '@fosivo/line-rich-menu-ui'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { primitives } from '../../admin/src/primitives.js'

afterEach(cleanup)

/**
 * ต่างจาก v4 ที่ใช้ `renderToStaticMarkup` — DS v2 วางอยู่บน Radix ซึ่ง `Modal` และ `Tooltip`
 * วาดผ่าน portal และ `Select`/`Radio` อาศัย pointer/ResizeObserver การ render บนเซิร์ฟเวอร์
 * จึงคืน markup ว่างสำหรับตัวที่สำคัญที่สุด testing-library บน jsdom เป็นวิธีเดียวที่มองเห็น
 * ของจริง (polyfill ที่ Radix ต้องการอยู่ที่ tests/setup-dom.ts)
 */
function draw(node: ReactNode) {
  return render(
    <DesignSystemProvider>
      <PortProvider value={createStubPort({ t: (key) => `TH:${key}` })}>{node}</PortProvider>
    </DesignSystemProvider>,
  )
}

/**
 * ชุดคีย์ที่ต้องมีอ่านจาก stub ของ packages/ui ไม่ได้พิมพ์ไว้ที่นี่ — `createStubPort().ui`
 * ถูกประกาศเป็น `UIPrimitives` ตรง ๆ จึงขาดคีย์ไม่ได้และเกินคีย์ก็ไม่ได้ รายการที่ hand-copy
 * เคยพังเงียบมาแล้วรอบหนึ่งตอน Plan 02 เปลี่ยน `Radio` เดี่ยวเป็น `RadioGroup` + `Radio`
 */
const REQUIRED = Object.keys(createStubPort().ui).sort()

describe('primitives', () => {
  it('จับคู่ครบทุกตัวที่ UIPrimitives ประกาศ', () => {
    expect(Object.keys(primitives).sort()).toEqual(REQUIRED)
  })

  it('ทุกตัวเป็น component ที่เรียกได้จริง ไม่ใช่ undefined', () => {
    for (const key of REQUIRED) {
      expect(primitives[key as keyof typeof primitives], key).toBeTypeOf('function')
    }
  })
})

describe('Typography', () => {
  // DS v2 เปลี่ยนพร็อพ polymorphic จาก `as` เป็น `tag` — ส่ง `as` ต่อไปตรง ๆ จะไม่มี error
  // แต่ element ที่ออกมาเป็น span เสมอ แปลว่าหน้าจอไม่มีหัวข้อเลยทั้งหน้า
  it('`as` ของ port ออกมาเป็น element จริงผ่าน `tag` ของ DS v2', () => {
    const { container } = draw(<primitives.Typography as="h2" variant="delta">หัวข้อ</primitives.Typography>)
    expect(container.querySelector('h2')).toHaveTextContent('หัวข้อ')
  })

  it('ไม่ระบุ `as` ก็ยังเป็น span เหมือน stub', () => {
    const { container } = draw(<primitives.Typography>ข้อความ</primitives.Typography>)
    expect(container.querySelector('span')).toHaveTextContent('ข้อความ')
  })
})

describe('TextInput', () => {
  it('type กับ autoComplete ไปถึง <input> จริง', () => {
    draw(
      <primitives.TextInput
        name="accessToken" value="secret" onChange={() => {}}
        label="Access token" type="password" autoComplete="off"
      />,
    )
    const input = screen.getByLabelText('Access token')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveValue('secret')
  })

  it('ไม่ระบุ type ก็ยังเป็น text', () => {
    draw(<primitives.TextInput name="name" value="" onChange={() => {}} label="ชื่อ" />)
    expect(screen.getByLabelText('ชื่อ')).toHaveAttribute('type', 'text')
  })

  // DS v2 ถอด label/error/hint ออกจากตัวอินพุตแล้วย้ายไป Field.* — ช่องที่ไม่ถูกครอบด้วย
  // Field.Root จะไม่มีชื่อใน accessibility tree เลย ไม่ใช่แค่ "ไม่สวย"
  it('ไม่มี label ก็ยังมีชื่อ — ใช้ name เป็นชื่อสำรอง', () => {
    draw(<primitives.TextInput name="startAt" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('startAt')).toBeInTheDocument()
  })

  it('error ที่ส่งมาถูกวาดออกมาให้อ่านได้ ไม่ใช่ถูกกลืน', () => {
    draw(<primitives.TextInput name="name" value="" onChange={() => {}} label="ชื่อ" error="ห้ามว่าง" />)
    expect(screen.getByText('ห้ามว่าง')).toBeInTheDocument()
  })

  it('hint ที่ส่งมาถูกวาดออกมาเช่นกัน', () => {
    draw(<primitives.TextInput name="name" value="" onChange={() => {}} label="ชื่อ" hint="ใช้ภายในเท่านั้น" />)
    expect(screen.getByText('ใช้ภายในเท่านั้น')).toBeInTheDocument()
  })
})

describe('RadioGroup + Radio', () => {
  const group = (
    <primitives.RadioGroup name="mode" value="custom" onChange={() => {}} label="ป้ายแถบเมนู">
      <primitives.Radio value="default">ค่าเริ่มต้น</primitives.Radio>
      <primitives.Radio value="custom">กำหนดเอง</primitives.Radio>
    </primitives.RadioGroup>
  )

  it('label เป็นชื่อของกลุ่มใน accessibility tree ไม่ใช่ข้อความลอย ๆ ข้าง ๆ', () => {
    draw(group)
    expect(screen.getByRole('radiogroup', { name: 'ป้ายแถบเมนู' })).toBeInTheDocument()
  })

  it('มีสมาชิกสองตัวและตัวที่ตรงกับ value ของกลุ่มถูกเลือกอยู่ตัวเดียว', () => {
    draw(group)
    const items = screen.getAllByRole('radio')
    expect(items).toHaveLength(2)
    expect(items.filter((item) => item.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    expect(screen.getByRole('radio', { checked: true })).toHaveAttribute('value', 'custom')
  })

  it('Radio ที่วางไว้นอกกลุ่มพังทันที ไม่ใช่กลายเป็นปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น', () => {
    // DS v2 คือ Radix — `Radio.Item` นอก `Radio.Group` โยน error ของตัวเองอยู่แล้ว
    // ยามของเราทำให้ข้อความบอกทางแก้แทนที่จะบอกชื่อ context ภายในของ Radix
    expect(() => draw(<primitives.Radio value="a">A</primitives.Radio>)).toThrow(/RadioGroup/)
  })
})

describe('Select', () => {
  it('มีชื่อจาก label และแสดงค่าที่เลือกอยู่', () => {
    draw(
      <primitives.Select name="type" value="message" onChange={() => {}} label="ชนิด">
        <primitives.Option value="message">ข้อความ</primitives.Option>
        <primitives.Option value="uri">ลิงก์</primitives.Option>
      </primitives.Select>,
    )
    const trigger = screen.getByRole('combobox', { name: 'ชนิด' })
    expect(trigger).toHaveTextContent('ข้อความ')
  })
})

describe('Button / IconButton', () => {
  it('testId ลงบน <button> ที่กดได้จริง พร้อม disabled และ type', () => {
    draw(<primitives.Button testId="save" disabled type="submit" variant="danger">บันทึก</primitives.Button>)
    const button = screen.getByTestId('save')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('type', 'submit')
  })

  // `AreaList` ของ Plan 02 ส่ง glyph เป็นสตริงล้วน (`☰`, `⛶`) มาเป็นลูก — DS v1 ต้องห่อให้ก่อน
  // เพราะมัน cloneElement ส่วน v2 รับสตริงได้ตรง ๆ เทสต์นี้ตรึงไว้ว่ามันยังรับได้จริง
  it('รับลูกที่เป็นสตริงล้วนได้ และชื่อของปุ่มมาจาก label', () => {
    draw(<primitives.IconButton label="รายการ" testId="view-list" onClick={() => {}}>☰</primitives.IconButton>)
    const button = screen.getByTestId('view-list')
    expect(button).toHaveAccessibleName('รายการ')
    expect(within(button).getByText('☰')).toBeInTheDocument()
  })
})

describe('Modal', () => {
  it('เปิดแล้ววาดหัวข้อเป็น heading จริงใน dialog', () => {
    draw(
      <primitives.Modal open onClose={() => {}} title="เลือก template" footer={<span>ท้าย</span>}>
        เนื้อหา
      </primitives.Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'เลือก template' })).toBeInTheDocument()
    expect(within(dialog).getByText('เนื้อหา')).toBeInTheDocument()
    expect(within(dialog).getByText('ท้าย')).toBeInTheDocument()
  })

  it('ปิดอยู่แล้วไม่มี dialog ใน DOM เลย', () => {
    draw(<primitives.Modal open={false} onClose={() => {}} title="เลือก template">เนื้อหา</primitives.Modal>)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ข้อความที่ผู้ใช้เห็นซึ่ง DS v2 บังคับให้ adapter เป็นคนตั้ง', () => {
  // สเปก §12 — ห้าม hardcode ข้อความที่ผู้ใช้เห็น แม้แต่ aria-label ของปุ่มปิด Alert
  // `closeLabel` ของ Alert ใน DS v2 เป็นพร็อพ **บังคับ** ไม่ใช่ optional เหมือน v1
  it('closeLabel ของ Alert มาจาก port.t ไม่ใช่สตริงอังกฤษที่ฝังไว้', () => {
    draw(<primitives.Alert variant="danger" title="พัง">รายละเอียด</primitives.Alert>)
    expect(screen.getByLabelText('TH:common.close')).toBeInTheDocument()
  })

  it('ป้าย on/off ของ Toggle มาจาก port.t เช่นกัน', () => {
    draw(<primitives.Toggle name="outlines" checked onChange={() => {}} label="แสดงกรอบ" />)
    expect(screen.getByText('TH:common.on')).toBeInTheDocument()
    expect(screen.getByText('TH:common.off')).toBeInTheDocument()
  })

  it('closeLabel ของ Modal ก็มาจาก port.t', () => {
    draw(<primitives.Modal open onClose={() => {}} title="หัวข้อ">เนื้อหา</primitives.Modal>)
    expect(screen.getByLabelText('TH:common.close')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project strapi-v5 tests/admin/primitives.test.tsx
```

คาดว่าล้มด้วย `Cannot find module '../../admin/src/primitives.js'`

- [ ] **Step 3: implement**

`packages/strapi-v5/admin/src/primitives.tsx`

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  Alert as DsAlert, Box, Button as DsButton, Checkbox as DsCheckbox, Divider as DsDivider,
  Field, Flex as DsFlex, IconButton as DsIconButton, Loader as DsLoader, Modal as DsModal,
  Radio as DsRadio, SingleSelect, SingleSelectOption, Textarea as DsTextarea,
  TextInput as DsTextInput, Toggle as DsToggle, Tooltip as DsTooltip, Typography as DsTypography,
} from '@strapi/design-system'
import { usePort, type UIPrimitives } from '@fosivo/line-rich-menu-ui'

/**
 * จับคู่ Design System v2 เข้ากับ `UIPort` — ไฟล์นี้คือ **ทั้งหมด** ที่ต่างจาก v4 ในฝั่ง UI
 * ทุก component ของ `packages/ui` วาดผ่านชุดนี้ ไม่มีตัวไหน import DS โดยตรง (สเปก §5.1)
 *
 * ความต่างเชิงโครงสร้างสามข้อระหว่าง v1 กับ v2 ที่กระจายอยู่ทั้งไฟล์:
 *
 * 1. **อินพุตไม่ถือ label/hint/error ของตัวเองอีกแล้ว** — ทั้งสามย้ายไป `Field.Root` +
 *    `Field.Label` + `Field.Hint` + `Field.Error` ที่ครอบอยู่ อินพุตที่ไม่ถูกครอบจะไม่มีชื่อ
 *    ใน accessibility tree เลย ซึ่งไม่ใช่เรื่องความสวยงามแต่คือช่องที่ screen reader อ่านไม่ออก
 * 2. **พร็อพ polymorphic เปลี่ยนจาก `as` เป็น `tag`** — ส่ง `as` ต่อไปไม่เกิด error แต่ถูกเมิน
 *    ผลคือ `Typography as="h2"` ออกมาเป็น `<span>` และทั้งหน้าไม่มีหัวข้อสักตัว
 * 3. **หลายตัววางอยู่บน Radix** — `Checkbox` ใช้ `onCheckedChange` ไม่ใช่ `onValueChange`,
 *    `Radio` เป็น `Group`/`Item` ที่ `Item` นอก `Group` ใช้ไม่ได้เลย, `Modal` เป็น compound
 *    component ที่ `Root` ถือ `open`/`onOpenChange`
 *
 * บางตัวเรียก `usePort()` เพื่อเอา `t` มาใช้ — ทำได้เพราะ primitive ทุกตัวถูกวาดใต้
 * `<PortProvider>` ของ App.tsx เสมอ และเป็นการอ่าน context ตอน render ไม่ใช่ตอนประกอบ port
 * จึงไม่เป็นวงกลม ที่สำคัญคือมันทำให้ทุก component ในไฟล์นี้เป็นค่าคงที่ระดับโมดูล identity
 * ไม่เปลี่ยนข้าม render — ถ้าเปลี่ยนไปใช้ factory ที่รับ `t` เข้ามาแทน ทุก input จะถูก remount
 * ทุกครั้งที่ `formatMessage` เปลี่ยน identity แล้วผู้ใช้จะพิมพ์ไม่ได้
 */

/** id ที่ไม่ซ้ำกันภายในหน้าเดียว — สำนวนเดียวกับฝั่ง v4 เพื่อให้สองไฟล์อ่านคู่กันได้ */
let localIdCount = 0
function useLocalId(prefix: string): string {
  const [id] = useState(() => `line-rich-menu-${prefix}-${localIdCount++}`)
  return id
}

/**
 * ยามที่บอกว่า `Radio` ตัวนี้อยู่ในกลุ่มจริงหรือเปล่า
 *
 * Radix โยน error ของตัวเองอยู่แล้วเมื่อ `Item` อยู่นอก `Root` แต่ข้อความของมันพูดถึงชื่อ
 * context ภายในของ Radix ซึ่งไม่ได้ชี้ทางแก้ให้คนที่เขียน `packages/ui` เลย ยามตัวนี้จึงมี
 * ไว้เพื่อ "ข้อความ" ไม่ใช่เพื่อ "การพัง" — และทำให้ v4 กับ v5 พังด้วยข้อความเดียวกัน
 */
const RadioGroupGuard = createContext(false)

/** ล้าง chrome ของ `<fieldset>` ที่เบราว์เซอร์ใส่มาให้ ไม่งั้นจะมีกรอบซ้อนกับกรอบของ DS */
const FIELDSET_RESET = { border: 0, margin: 0, padding: 0, minWidth: 0 } as const

export const primitives: UIPrimitives = {
  Button: ({ onClick, disabled, variant, type, children, testId }) => (
    <DsButton
      onClick={onClick}
      disabled={disabled}
      type={type ?? 'button'}
      // ชุดเดียวกับที่ v4 จับคู่ไว้ เพื่อให้สองเวอร์ชันหน้าตาเหมือนกัน — DS v2 มี `danger` เต็ม
      // ด้วย แต่ปุ่มลบในหน้าจอของเราอยู่ในแถวเดียวกับปุ่มอื่น `danger-light` จึงยังเป็นตัวที่ถูก
      variant={variant === 'danger' ? 'danger-light' : variant === 'secondary' ? 'tertiary' : 'default'}
      data-testid={testId}
    >
      {children}
    </DsButton>
  ),

  // ต่างจาก v1 ตรงที่ไอคอนเป็น `children` ไม่ใช่พร็อพ `icon` และไม่มี cloneElement
  // จึงรับสตริงล้วนที่ `AreaList` ส่งมาได้ตรง ๆ ไม่ต้องห่อ
  IconButton: ({ onClick, label, disabled, children, testId }) => (
    <DsIconButton onClick={onClick} label={label} disabled={disabled} data-testid={testId}>
      {children}
    </DsIconButton>
  ),

  TextInput: ({ name, value, onChange, label, hint, error, maxLength, disabled, placeholder, type, autoComplete }) => {
    const id = useLocalId('text-input')
    return (
      <Field.Root id={id} name={name} error={error} hint={hint}>
        {label === undefined ? null : <Field.Label>{label}</Field.Label>}
        <DsTextInput
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label === undefined ? name : undefined}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          type={type ?? 'text'}
          autoComplete={autoComplete}
        />
        <Field.Hint />
        <Field.Error />
      </Field.Root>
    )
  },

  Textarea: ({ name, value, onChange, label, error, rows }) => {
    const id = useLocalId('textarea')
    return (
      <Field.Root id={id} name={name} error={error}>
        {label === undefined ? null : <Field.Label>{label}</Field.Label>}
        <DsTextarea
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label === undefined ? name : undefined}
          rows={rows}
        />
        <Field.Error />
      </Field.Root>
    )
  },

  /**
   * `Select` ของ v1 หายไปใน v2 เหลือ `SingleSelect` ซึ่งส่งค่ามาเป็น `string | number`
   * (ไม่ใช่ event และไม่ใช่สตริงเสมอ) — `String()` ตรงนี้จึงไม่ใช่ของประดับ ถ้าตัวเลือกไหน
   * มี value เป็นตัวเลข ฝั่ง `packages/ui` จะได้ค่าที่เทียบกับสตริงไม่ตรงและช่องจะดูเหมือน
   * ไม่เคยถูกเลือกเลย
   */
  Select: ({ name, value, onChange, label, error, disabled, children }) => {
    const id = useLocalId('select')
    return (
      <Field.Root id={id} name={name} error={error}>
        {label === undefined ? null : <Field.Label>{label}</Field.Label>}
        <SingleSelect
          name={name}
          value={value}
          onChange={(next) => onChange(String(next))}
          aria-label={label === undefined ? name : undefined}
          disabled={disabled}
        >
          {children}
        </SingleSelect>
        <Field.Error />
      </Field.Root>
    )
  },

  Option: ({ value, children }) => <SingleSelectOption value={value}>{children}</SingleSelectOption>,

  // Radix: `onCheckedChange` ส่ง `boolean | 'indeterminate'` — `=== true` จึงจำเป็น
  // ไม่งั้น 'indeterminate' จะกลายเป็น truthy แล้วช่องติ๊กจะติดค้าง
  Checkbox: ({ name, checked, onChange, children }) => (
    <DsCheckbox name={name} checked={checked} onCheckedChange={(next) => onChange(next === true)}>
      {children}
    </DsCheckbox>
  ),

  /**
   * `<fieldset>` + `<legend>` คือรูปเดียวที่ตั้งชื่อให้ "กลุ่ม" ได้โดยไม่ต้องผูก id เอง ส่วน
   * `Radio.Group` ข้างในคือ Radix RadioGroup.Root ที่ถือ value/onValueChange และเป็นตัวที่
   * ถือ `role="radiogroup"` จริง `aria-labelledby` จึงต้องชี้กลับมาที่ `<legend>` ตัวเดียวกัน
   * ไม่ใช่ปล่อยให้มีแต่ `<fieldset>` ข้างนอกที่มีชื่อ
   */
  RadioGroup: ({ name, value, onChange, label, children }) => {
    const legendId = useLocalId('radio-group')
    return (
      <Box tag="fieldset" style={FIELDSET_RESET}>
        {label === undefined ? null : (
          <Box tag="legend" id={legendId} paddingBottom={1}>
            <DsTypography variant="pi" fontWeight="bold" textColor="neutral800">{label}</DsTypography>
          </Box>
        )}
        <DsRadio.Group
          name={name}
          value={value}
          onValueChange={onChange}
          aria-labelledby={label === undefined ? undefined : legendId}
        >
          <RadioGroupGuard.Provider value={true}>
            <DsFlex direction="column" alignItems="flex-start" gap={2}>{children}</DsFlex>
          </RadioGroupGuard.Provider>
        </DsRadio.Group>
      </Box>
    )
  },

  Radio: ({ value, children }) => {
    const inGroup = useContext(RadioGroupGuard)
    if (!inGroup) {
      throw new Error('ui.Radio ถูกวางไว้นอก ui.RadioGroup — สมาชิกต้องอยู่ในกลุ่มที่ถือค่าให้เสมอ')
    }
    return <DsRadio.Item value={value}>{children}</DsRadio.Item>
  },

  // `Toggle` ของ v2 ไม่มีพร็อพ `label` แล้ว (ย้ายไป Field) แต่ยังเป็น `<input>` จริงที่ส่ง
  // event ตามปกติ — ป้าย on/off เป็นข้อความที่ผู้ใช้เห็น จึงต้องผ่าน `t` เหมือนทุกข้อความในสเปก §12
  Toggle: ({ name, checked, onChange, label }) => {
    const { t } = usePort()
    const id = useLocalId('toggle')
    return (
      <Field.Root id={id} name={name}>
        {label === undefined ? null : <Field.Label>{label}</Field.Label>}
        <DsToggle
          name={name}
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          onLabel={t('common.on')}
          offLabel={t('common.off')}
        />
      </Field.Root>
    )
  },

  /**
   * compound component ของ Radix Dialog — `Root` ถือสถานะเปิด/ปิด ส่วน `Header` วาดปุ่มปิด
   * ให้เองพร้อม `closeLabel`
   *
   * `onOpenChange` ยิงทั้งตอนเปิดและตอนปิด — เรียก `onClose()` เฉพาะขาปิด ไม่งั้นการเปิด modal
   * จะสั่งปิดตัวเองทันทีในเฟรมเดียวกัน
   *
   * ยังคืน `null` เมื่อ `open` เป็น false แทนที่จะปล่อยให้ `Root` จัดการ เพราะสัญญาใน port.ts
   * บอกว่า modal ที่ปิดอยู่ต้องไม่มีอะไรใน DOM และ `TemplatePicker` ของ Plan 02 พึ่งข้อนั้น
   * ด้วยการ mount ใหม่ทุกครั้งที่เปิดเพื่อล้าง state ภายในของตัวเอง
   */
  Modal: ({ open, onClose, title, footer, children }) => {
    const { t } = usePort()
    if (!open) return null
    return (
      <DsModal.Root open onOpenChange={(next) => { if (!next) onClose() }}>
        <DsModal.Content>
          <DsModal.Header closeLabel={t('common.close')}>
            {/* หัวข้อของ modal ต้องเป็น heading จริงใน outline ไม่ใช่แค่ตัวอักษรที่ใหญ่กว่าเพื่อน */}
            <DsModal.Title>{title}</DsModal.Title>
          </DsModal.Header>
          <DsModal.Body>{children}</DsModal.Body>
          {footer === undefined ? null : <DsModal.Footer>{footer}</DsModal.Footer>}
        </DsModal.Content>
      </DsModal.Root>
    )
  },

  Typography: ({ variant, textColor, as, children }) => (
    <DsTypography variant={variant} textColor={textColor} tag={as ?? 'span'}>{children}</DsTypography>
  ),

  /**
   * `alignItems` ตกลงที่ `stretch` เมื่อผู้เรียกไม่ได้ระบุ ไม่ใช่ `center` ที่เป็น default ของ DS —
   * เหตุผลเดียวกับฝั่ง v4: ทุกหน้าจอของ `packages/ui` ถูกเขียนและตรวจด้วยตาบน stub ซึ่งใช้
   * default ของ CSS ปล่อยให้เป็น `center` จะทำให้คอลัมน์ของฟอร์มหดเข้ามาอยู่กลางจอทุกอัน
   */
  Flex: ({ direction, gap, alignItems, justifyContent, wrap, children }) => (
    <DsFlex
      direction={direction ?? 'row'}
      gap={gap}
      alignItems={alignItems ?? 'stretch'}
      justifyContent={justifyContent}
      wrap={wrap}
    >
      {children}
    </DsFlex>
  ),

  Divider: () => <DsDivider />,

  // `closeLabel` ของ Alert ใน v2 เป็นพร็อพ **บังคับ** (ต่างจาก v1 ที่ optional) — TypeScript
  // จับได้ถ้าลืม แต่ไม่ได้จับว่ามันมาจาก `t` หรือเป็นสตริงอังกฤษที่ฝังไว้ เทสต์เป็นคนจับข้อนั้น
  Alert: ({ variant, title, onClose, children }) => {
    const { t } = usePort()
    return (
      <Box paddingBottom={2}>
        <DsAlert variant={variant} title={title} onClose={onClose} closeLabel={t('common.close')}>
          {children}
        </DsAlert>
      </Box>
    )
  },

  Loader: ({ children }) => <DsLoader small>{children}</DsLoader>,

  Tooltip: ({ label, children }) => <DsTooltip label={label}>{children}</DsTooltip>,
}
```

- [ ] **Step 4: เขียว**

```bash
pnpm test --project strapi-v5 && pnpm typecheck && pnpm lint
```

ถ้า `Select` ล้มด้วย `combobox` ที่หาไม่เจอ ให้ตรวจ `tests/setup-dom.ts` ก่อนแก้ `primitives.tsx` — Radix Select ต้องการ `hasPointerCapture` และ `scrollIntoView` ครบทั้งคู่ถึงจะ mount ได้

- [ ] **Step 5: commit**

```bash
git add packages/strapi-v5
git commit -m "feat(v5): map Design System v2 onto the UI port"
```

---

## Task 8: ประกอบ `UIPort` จาก hook ของ Strapi 5 · router v6 · ลงทะเบียนแอดมิน

**Files:**
- Create: `packages/strapi-v5/admin/src/adapters.ts`, `port.tsx`, `App.tsx`, `translations.ts`, `pages/List.tsx`, `pages/Editor.tsx`, `strapi-admin.d.ts`
- Modify: `packages/strapi-v5/admin/src/index.ts`
- Test: `packages/strapi-v5/tests/admin/adapters.test.ts`, `packages/strapi-v5/tests/admin/translations.test.ts`, `packages/strapi-v5/tests/admin/register.test.ts`

**Interfaces:**
- Consumes: `UIPort`, `MESSAGES`, `ENDPOINTS`, `PortProvider`, `ChannelSettings`, `RichMenuList`, `RichMenuEditor` จาก `@fosivo/line-rich-menu-ui` · `primitives` จาก Task 7 · `PERMISSION`, `PLUGIN_ID` จาก Task 5
- Produces:
  - `function makeHttp(client: FetchClient): UIPort['http']` · `interface FetchClient`
  - `function makeToast(toggle: (n: { type: string; message: string }) => void): UIPort['toast']`
  - `function makeNav(navigate: (path: string) => void, Link: ComponentType<{ to: string; children?: ReactNode }>): UIPort['nav']`
  - `function makeT(formatMessage: (d: { id: string; defaultMessage: string }, v?: Record<string, unknown>) => string): UIPort['t']`
  - `function usePluginPort(): UIPort`
  - `function prefixTranslations(table: Record<string, string>): Record<string, string>` · `function trads(locales: readonly string[]): { data: Record<string, string>; locale: string }[]`
  - `default { register(app), registerTrads({ locales }) }`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/strapi-v5/tests/admin/adapters.test.ts` — คัดลอกจาก `packages/strapi-v4/tests/admin/adapters.test.ts` ทั้งไฟล์ แล้วเปลี่ยน import path เป็น `../../admin/src/adapters.js` และ **แทนที่ describe ของ `makeToast` ทั้งบล็อก** ด้วย

```ts
describe('makeToast', () => {
  /**
   * v4 ไม่มี type `danger` จึงต้องจับคู่ลง `warning` ส่วน v5 มีครบทั้งสี่ (`info` `warning`
   * `danger` `success`) — การจับคู่จึงหายไปทั้งอัน `danger` ต้องเดินทางถึงปลายทางเป็น `danger`
   * ถ้าใครยก makeToast ของ v4 มาทั้งดุ้น ข้อผิดพลาดจะเงียบสนิท: ผู้ใช้เห็นแถบสีส้มแทนสีแดง
   */
  it('ส่ง type ต่อโดยไม่แปลง — v5 มี danger จริง', () => {
    const toggle = vi.fn()
    makeToast(toggle)({ type: 'danger', message: 'ปล่อยเมนูไม่สำเร็จ' })
    expect(toggle).toHaveBeenCalledWith({ type: 'danger', message: 'ปล่อยเมนูไม่สำเร็จ' })
  })

  /**
   * `message` ของ v5 เป็นสตริงที่แปลแล้ว ไม่ใช่ descriptor `{ id, defaultMessage }` ของ
   * react-intl แบบ v4 — ข้อความจากฝั่ง ui ผ่าน `port.t` มาแล้วจึงส่งต่อได้ตรง ๆ
   * ถ้าส่ง descriptor ไป Strapi 5 จะวาด `[object Object]` ในกล่องแจ้งเตือน
   */
  it('message เป็นสตริง ไม่ใช่ descriptor ของ react-intl', () => {
    const toggle = vi.fn<(n: { type: string; message: unknown }) => void>()
    makeToast(toggle)({ type: 'success', message: 'บันทึกแล้ว' })
    expect(typeof toggle.mock.calls[0]![0].message).toBe('string')
  })

  it('type อื่นก็ส่งต่อตรง ๆ เช่นกัน', () => {
    const toggle = vi.fn()
    makeToast(toggle)({ type: 'warning', message: 'ระวัง' })
    expect(toggle).toHaveBeenCalledWith({ type: 'warning', message: 'ระวัง' })
  })
})
```

และ **แทนที่ describe ของ `makeNav`** ด้วย

```ts
describe('makeNav', () => {
  it('เติม prefix ของที่ปลั๊กอินถูก mount ไว้ให้ path ที่ ui ไม่รู้จัก', () => {
    const navigate = vi.fn()
    makeNav(navigate, () => null).push('/rich-menus/new')
    expect(navigate).toHaveBeenCalledWith('/plugins/line-rich-menu/rich-menus/new')
  })

  it('ไม่เติมซ้ำถ้า path เต็มมาแล้ว', () => {
    const navigate = vi.fn()
    makeNav(navigate, () => null).push('/plugins/line-rich-menu/rich-menus/1')
    expect(navigate).toHaveBeenCalledWith('/plugins/line-rich-menu/rich-menus/1')
  })

  // router v6 ให้ `useNavigate()` ที่เป็นฟังก์ชันตรง ๆ ไม่ใช่ `history` ที่มีเมธอด `push`
  // การรับฟังก์ชันเข้ามาแทนอ็อบเจกต์ทำให้ไฟล์นี้ยังไม่รู้จัก router ตัวไหนเลย
  it('รับฟังก์ชัน navigate ไม่ใช่อ็อบเจกต์ history', () => {
    expect(() => makeNav(() => {}, () => null)).not.toThrow()
  })
})
```

`packages/strapi-v5/tests/admin/translations.test.ts` — คัดลอกจาก v4 ทั้งไฟล์ เปลี่ยนแค่ import path

`packages/strapi-v5/tests/admin/register.test.ts`

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { MESSAGES } from '@fosivo/line-rich-menu-ui'
import admin from '../../admin/src/index.js'
import { prefixTranslations } from '../../admin/src/translations.js'

function register() {
  const addMenuLink = vi.fn()
  const registerPlugin = vi.fn()
  admin.register({ addMenuLink, registerPlugin })
  return {
    link: addMenuLink.mock.calls[0]![0] as Record<string, unknown>,
    plugin: registerPlugin.mock.calls[0]![0] as Record<string, unknown>,
  }
}

describe('register', () => {
  it('เมนูซ้ายชี้ไปยัง path เดียวกับที่ router ของปลั๊กอินรับไว้', () => {
    const { link } = register()
    expect(link['to']).toBe('/plugins/line-rich-menu')
    expect(link['intlLabel']).toEqual({ id: 'line-rich-menu.plugin.name', defaultMessage: 'LINE Rich Menu' })
  })

  it('เมนูซ้ายถูกกั้นด้วยสิทธิ์ read ของปลั๊กอิน', () => {
    expect(register().link['permissions']).toEqual([
      { action: 'plugin::line-rich-menu.read', subject: null },
    ])
  })

  it('มี icon จริง ไม่ใช่ undefined', () => {
    expect(register().link['icon']).toBeTypeOf('function')
  })

  /**
   * ยามที่แพงที่สุดในไฟล์นี้: มันโหลดทั้งต้นไม้ของหน้าจอจริง (App → port → primitives → pages)
   * import ที่พังสักตัวเดียวในนั้นจะแดงที่นี่ แทนที่จะไปแดงเป็นหน้าขาวในแอดมินของลูกค้า
   *
   * ตัวเดียวที่ไม่ใช่ของจริงในต้นไม้นี้คือ `@strapi/strapi/admin` ซึ่ง vitest.config.ts ชี้ไป
   * test double — ดูเหตุผลเต็มในไฟล์ double เอง และดู examples/v5-app (Task 10) ที่พิสูจน์ของจริง
   */
  it('Component ที่ lazy ไว้ resolve เป็น module ที่มี default component จริง', async () => {
    const load = register().link['Component'] as () => Promise<{ default: unknown }>
    expect(load).toBeTypeOf('function')
    expect((await load()).default).toBeTypeOf('function')
  })

  it('ลงทะเบียนตัวปลั๊กอินด้วย id เดียวกับที่ endpoint ทุกเส้นใช้', () => {
    expect(register().plugin).toEqual({
      id: 'line-rich-menu', initializer: undefined, isReady: true, name: 'line-rich-menu',
    })
  })
})

describe('registerTrads', () => {
  /**
   * สเปก §12 บอกว่า v5 ใช้ `registerTrads` เหมือน v4 แต่ helper `prefixPluginTranslations`
   * หายไปพร้อม `@strapi/helper-plugin` ทั้งแพ็กเกจ — Plan 03 เขียนตัวแทนสามบรรทัดไว้แล้ว
   * ไฟล์นั้นจึงย้ายมาทั้งดุ้น และนี่คือด่านที่ยืนยันว่ามันยังทำงานเหมือนเดิม
   */
  it('คืนตารางที่เติม namespace แล้ว พร้อมส่งให้ react-intl ตรง ๆ', async () => {
    expect(await admin.registerTrads({ locales: ['en', 'th', 'fr'] })).toEqual([
      { locale: 'en', data: prefixTranslations(MESSAGES.en) },
      { locale: 'th', data: prefixTranslations(MESSAGES.th) },
    ])
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project strapi-v5 tests/admin
```

คาดว่าล้มด้วย `Cannot find module '../../admin/src/adapters.js'`

- [ ] **Step 3: implement**

`packages/strapi-v5/admin/src/strapi-admin.d.ts`

```ts
/**
 * `@strapi/strapi` ทั้งแพ็กเกจคือ CMS ทั้งตัว — ติดตั้งมันไว้เป็น devDependency เพื่อ import
 * hook สองตัวคือราคาที่ไม่คุ้ม (หลายร้อยเมกะไบต์ต่อการ `pnpm install` ทุกครั้งของทุก job ใน CI
 * และ React tree ของตัวเองที่ทับกับของเราได้) ไฟล์นี้ประกาศเฉพาะสิ่งที่ `port.tsx` ใช้จริง
 *
 * เหตุผลเดียวกับ `packages/strapi-v4/src/admin/design-system-v1.d.ts` และมีข้อจำกัดเดียวกัน:
 * ทุกบรรทัดในนี้คือคำสัญญาที่เราเขียนเอง ซึ่ง TypeScript จะเชื่อโดยไม่มีใครตรวจสอบให้ ตัวที่ตรวจ
 * ของจริงคือ examples/v5-app (Task 10) ซึ่งบูต Strapi 5.52.1 แล้วกดผ่านหน้าจอจริง
 *
 * รูปทรงด้านล่างมาจากคู่มือย้าย v4 → v5 ของ Strapi เอง (`helper-plugin.md`):
 * `useFetchClient` ย้ายที่อยู่โดยรูปทรงไม่เปลี่ยน ส่วน `useNotification` เปลี่ยนจาก "คืนฟังก์ชัน"
 * เป็น "คืนอ็อบเจกต์ที่มี toggleNotification" และ `message` เป็นสตริงที่แปลแล้ว
 */
declare module '@strapi/strapi/admin' {
  export function useFetchClient(): {
    get<T>(url: string): Promise<{ data: T }>
    post<T>(url: string, body?: unknown): Promise<{ data: T }>
    put<T>(url: string, body?: unknown): Promise<{ data: T }>
    del<T>(url: string): Promise<{ data: T }>
  }

  export function useNotification(): {
    toggleNotification(notification: {
      type: 'info' | 'warning' | 'danger' | 'success'
      message: string
      title?: string
      timeout?: number
    }): void
  }
}
```

`packages/strapi-v5/admin/src/adapters.ts` — คัดลอกจาก `packages/strapi-v4/src/admin/adapters.ts` แล้วเปลี่ยนสองฟังก์ชัน

```ts
/**
 * `useNotification` ของ v5 รับ `info | warning | danger | success` ครบ — ไม่ต้องจับคู่
 * `danger` ลง `warning` แบบ v4 อีกแล้ว การยกโค้ดของ v4 มาทั้งดุ้นจะทำให้ความล้มเหลว
 * ทุกครั้งขึ้นเป็นสีส้มแทนสีแดง ซึ่งเป็นความผิดที่ไม่มีเทสต์ไหนของ v4 จับได้เพราะที่นั่นมันถูก
 *
 * `message` ของ v5 เป็นสตริงที่แปลแล้ว ไม่ใช่ descriptor ของ react-intl — ข้อความจากฝั่ง ui
 * ผ่าน `port.t` มาแล้วจึงส่งต่อได้ตรง ๆ ส่ง descriptor ไปจะได้ `[object Object]` บนหน้าจอ
 */
export function makeToast(
  toggle: (notification: { type: string; message: string }) => void,
): UIPort['toast'] {
  return ({ type, message }) => {
    toggle({ type, message })
  }
}

const BASE = `/plugins/${PLUGIN_ID}`

/**
 * `ui` ไม่รู้ว่าตัวเองถูก mount ไว้ที่ไหน — prefix จึงถูกเติมที่นี่ที่เดียว
 *
 * รับ **ฟังก์ชัน** navigate ไม่ใช่อ็อบเจกต์ `history` เพราะ router v6 ให้ `useNavigate()`
 * ที่เป็นฟังก์ชันตรง ๆ (v5 ให้ `useHistory()` ที่มีเมธอด `push`) — การรับฟังก์ชันทำให้ไฟล์นี้
 * ยังไม่ผูกกับ router เวอร์ชันไหนเลย เหมือนที่ v4 ทำได้ด้วยรูปที่ต่างกัน
 */
export function makeNav(
  navigate: (path: string) => void,
  Link: ComponentType<{ to: string; children?: ReactNode }>,
): UIPort['nav'] {
  return {
    push(path) { navigate(path.startsWith(BASE) ? path : `${BASE}${path}`) },
    Link,
  }
}
```

`makeHttp` และ `makeT` คัดลอกมาทั้งดุ้นไม่แก้อะไร — `useFetchClient` ของ v5 คืนรูปเดียวกับของ v4 และ `useIntl().formatMessage` ก็เช่นกัน

`packages/strapi-v5/admin/src/translations.ts` — คัดลอกจาก `packages/strapi-v4/src/admin/translations.ts` ทั้งไฟล์ แล้วเปลี่ยน `import { PLUGIN_ID } from '../server/permissions.js'` เป็น `import { PLUGIN_ID } from './plugin-id.js'`

`packages/strapi-v5/admin/src/plugin-id.ts` — ไฟล์ใหม่ สามบรรทัด

```ts
/**
 * โครงของ v5 แยก `admin/` กับ `server/` เป็นสอง build ที่ tsconfig คนละตัว การ import ข้าม
 * โฟลเดอร์แบบที่ v4 ทำ (`../server/permissions.js`) จะลาก server เข้าบันเดิลของเบราว์เซอร์
 * ค่าคงที่ตัวเดียวจึงถูกประกาศทั้งสองฝั่ง และมีเทสต์บังคับว่าตรงกัน (tests/admin/register.test.ts
 * ตรวจ `to` ของเมนูซ้าย ส่วน tests/package-shape.test.ts ตรวจ `strapi.name` ใน package.json)
 */
export const PLUGIN_ID = 'line-rich-menu'

export const PERMISSION = {
  read: `plugin::${PLUGIN_ID}.read`,
  write: `plugin::${PLUGIN_ID}.write`,
  publish: `plugin::${PLUGIN_ID}.publish`,
  settings: `plugin::${PLUGIN_ID}.settings`,
} as const
```

และแก้ `packages/strapi-v5/admin/src/adapters.ts` ให้ import `PLUGIN_ID` จาก `./plugin-id.js` ด้วย

`packages/strapi-v5/admin/src/port.tsx`

```tsx
import { useMemo } from 'react'
import { useFetchClient, useNotification } from '@strapi/strapi/admin'
import { Link, useNavigate } from 'react-router-dom'
import { useIntl } from 'react-intl'
import type { UIPort } from '@fosivo/line-rich-menu-ui'
import { makeHttp, makeNav, makeT, makeToast, type FetchClient } from './adapters.js'
import { primitives } from './primitives.js'

/**
 * ประกอบ `UIPort` จาก hook ของ Strapi 5 — hook สี่ตัวนี้คือทุกอย่างที่ v4 กับ v5 ต่างกัน
 * ฝั่งนอกไฟล์นี้ (`packages/ui`) ไม่มีบรรทัดไหนรู้จัก Strapi เลย
 *
 * `useMemo` ไม่ใช่การ optimize แต่เป็นข้อกำหนดของ port (ดูคอมเมนต์เหนือ `HttpClient` ใน port.ts):
 * `RichMenuList` ใส่ `http` ไว้ใน dependency array ของ `useEffect` ถ้า port ถูกสร้างใหม่ทุก render
 * effect จะยิงซ้ำไม่รู้จบ และรายการเมนูจะกะพริบเป็นค่าว่างทุกครั้งที่ parent re-render
 *
 * `useNavigate` ของ router v6 คืนฟังก์ชันที่ identity คงที่ตลอดอายุของ router ส่วน
 * `toggleNotification` ของ v5 ถูกห่อด้วย `useCallback` มาแล้ว ทั้งคู่จึงเป็น dependency ที่ใช้ได้จริง
 * — `eslint-plugin-react-hooks` (Task 1) เป็นตัวที่บังคับว่ารายการนี้ครบ ไม่ใช่วินัยของคนเขียน
 */
export function usePluginPort(): UIPort {
  const fetchClient = useFetchClient()
  const { toggleNotification } = useNotification()
  const navigate = useNavigate()
  const { formatMessage } = useIntl()

  return useMemo<UIPort>(() => ({
    ui: primitives,
    http: makeHttp(fetchClient as unknown as FetchClient),
    toast: makeToast((notification) => {
      toggleNotification(notification as Parameters<typeof toggleNotification>[0])
    }),
    nav: makeNav(navigate, Link),
    t: makeT(formatMessage as Parameters<typeof makeT>[0]),
  }), [fetchClient, toggleNotification, navigate, formatMessage])
}
```

`packages/strapi-v5/admin/src/App.tsx`

```tsx
import { Route, Routes } from 'react-router-dom'
import { PortProvider } from '@fosivo/line-rich-menu-ui'
import { usePluginPort } from './port.js'
import { EditorPage } from './pages/Editor.js'
import { ListPage } from './pages/List.js'

/**
 * router v6 — `Routes` + `element` (v5 ใช้ `Switch` + `component` ซึ่งเป็นคนละ API และเป็น
 * หนึ่งในเหตุผลที่ปลั๊กอินสองเวอร์ชันแชร์แพ็กเกจกันไม่ได้ ดูสเปก §2.1)
 *
 * path เป็นแบบสัมพัทธ์ ไม่มี `/plugins/line-rich-menu` นำหน้าเหมือน v4 — Strapi 5 mount
 * ปลั๊กอินไว้ใต้ path นั้นแล้วผ่าน `addMenuLink` ทำให้ router ตัวนี้อยู่ในบริบทที่ base ถูกตัด
 * ให้แล้ว ใส่ path เต็มจะกลายเป็น `/plugins/line-rich-menu/plugins/line-rich-menu/...`
 * ซึ่งไม่ match อะไรเลยและได้หน้าเปล่าโดยไม่มี error
 *
 * v6 ไม่มี `exact` แล้ว — การ match เป็นแบบตรงตัวโดยปริยาย และ `new` กับ `:id` ไม่ชนกัน
 * เพราะ v6 ให้ segment ที่เป็น literal ชนะ dynamic segment เสมอ ไม่ขึ้นกับลำดับที่เขียน
 */
export default function App() {
  const port = usePluginPort()
  return (
    <PortProvider value={port}>
      <Routes>
        <Route path="rich-menus/new" element={<EditorPage />} />
        <Route path="rich-menus/:id" element={<EditorPage />} />
        <Route path="*" element={<ListPage />} />
      </Routes>
    </PortProvider>
  )
}
```

`packages/strapi-v5/admin/src/pages/List.tsx` และ `pages/Editor.tsx` — คัดลอกจาก `packages/strapi-v4/src/admin/pages/` ทั้งสองไฟล์ แล้วแก้เฉพาะการอ่านพารามิเตอร์จาก router: v4 รับ `match.params` ผ่าน `component` prop ส่วน v6 ใช้ `useParams()` เปิดไฟล์ของ v4 อ่านก่อนแล้วทำสองอย่างนี้

1. ลบ props ที่รับ `match`/`history` ออก แล้วใช้ `const { id } = useParams<{ id?: string }>()` แทน
2. เปลี่ยน `import { useHistory } from 'react-router-dom'` (ถ้ามี) เป็น `useNavigate` และเรียกเป็นฟังก์ชัน

`packages/strapi-v5/admin/src/index.ts`

```ts
import { Message } from '@strapi/icons'
import { PERMISSION, PLUGIN_ID } from './plugin-id.js'
import { trads } from './translations.js'

interface AdminApp {
  addMenuLink(link: Record<string, unknown>): void
  registerPlugin(plugin: Record<string, unknown>): void
}

export default {
  register(app: AdminApp): void {
    app.addMenuLink({
      to: `/plugins/${PLUGIN_ID}`,
      icon: Message,
      intlLabel: { id: `${PLUGIN_ID}.plugin.name`, defaultMessage: 'LINE Rich Menu' },
      // เมนูฝั่งซ้ายซ่อนตัวเองจากคนที่ไม่มีสิทธิ์ `read` — ชั้นแรกของ deny by default
      // ชั้นที่บังคับจริงยังเป็น policy ที่ route (Task 5) ไม่ใช่ตรงนี้
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

- [ ] **Step 4: เขียว**

```bash
pnpm test --project strapi-v5 && pnpm typecheck && pnpm lint
```

- [ ] **Step 5: commit**

```bash
git add packages/strapi-v5
git commit -m "feat(v5): wire the plugin admin — router v6, menu link, i18n"
```

---

## Task 9: build ด้วย `@strapi/sdk-plugin` · `verify` · ด่าน runtime deps ใน CI

**Files:**
- Create: `packages/strapi-v5/scripts/check-runtime-deps.mjs`
- Modify: `.github/workflows/ci.yml`, `package.json` (root — เพิ่ม script `verify`)
- Test: ด่านนี้ตรวจที่ `dist` จึงเป็นขั้นใน CI ไม่ใช่ไฟล์ `*.test.ts`

**Interfaces:**
- Consumes: `dist/admin/index.js`, `dist/server/index.js` ที่ `strapi-plugin build` ปล่อยออกมา
- Produces: `pnpm --filter strapi-plugin-line-rich-menu check:deps` ที่ exit 1 พร้อมข้อความ `::error::` เมื่อมีอะไรผิด

- [ ] **Step 1: พิสูจน์ว่าด่านมองเห็นของจริงก่อน**

รัน build จริงหนึ่งรอบแล้วดูว่ามีอะไรอยู่ในบันเดิลบ้าง

```bash
pnpm --filter @fosivo/line-rich-menu-core build
pnpm --filter @fosivo/line-rich-menu-ui build
pnpm --filter strapi-plugin-line-rich-menu build
grep -c 'require("@fosivo' packages/strapi-v5/dist/server/index.js || echo "ไม่มี @fosivo หลงอยู่ — ถูกต้อง"
grep -n 'require("sharp")\|from "sharp"' packages/strapi-v5/dist/admin/index.js || echo "ไม่มี sharp ในบันเดิลของแอดมิน — ถูกต้อง"
```

ถ้า `@fosivo` ยังโผล่ใน `dist/server/index.js` แปลว่ามันหลุดไปอยู่ `dependencies` — กลับไปแก้ `package.json` ก่อนทำ step ถัดไป

- [ ] **Step 2: เขียนด่านที่ต้องล้มเหลว**

`packages/strapi-v5/scripts/check-runtime-deps.mjs`

```js
// ทุก specifier ที่เหลืออยู่ในบันเดิลต้องหาเจอได้จากสิ่งที่ package.json ประกาศไว้
//
// ด่านนี้ตรวจที่ `dist` ซึ่งเป็นสิ่งที่ผู้ใช้ได้รับจริง ต่างจากเทสต์ใน tests/package-shape.test.ts
// ที่ตรวจที่ต้นทาง (package.json) — รูปแบบเดียวกับด่าน browser bundle ของ packages/core ใน CI
// และเป็นฝาแฝดของ scripts/check-runtime-deps.mjs ใน packages/strapi-v4
//
// ต่างจากของ v4 สองข้อ: sdk-plugin ปล่อยทั้ง CJS (`require("x")`) และ ESM (`from "x"`)
// จึงต้องกวาดทั้งสองรูป และมีด่านเพิ่มว่า `sharp` ห้ามโผล่ในบันเดิลของแอดมินเด็ดขาด —
// มันเป็น native module ที่ Vite ของ Strapi 5 จะพยายามลากเข้าเบราว์เซอร์แล้ว build ล้มทั้งแอป
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))

const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
])
const builtin = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

/** `react/jsx-runtime` ต้องนับเป็นแพ็กเกจ `react` ไม่ใช่ชื่อเต็ม */
const packageOf = (specifier) => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const BUNDLES = [
  'dist/server/index.js', 'dist/server/index.mjs',
  'dist/admin/index.js', 'dist/admin/index.mjs',
]

const problems = []
for (const bundle of BUNDLES) {
  const source = readFileSync(`${root}${bundle}`, 'utf8')
  const specifiers = [
    ...[...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]),
    ...[...source.matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1]),
    ...[...source.matchAll(/import\("([^"]+)"\)/g)].map((match) => match[1]),
  ]
  for (const specifier of new Set(specifiers)) {
    if (specifier.startsWith('.') || specifier.startsWith('/') || builtin.has(specifier)) continue
    if (!declared.has(packageOf(specifier))) {
      problems.push(`${bundle} อ้างถึง "${specifier}" แต่ ${packageOf(specifier)} ไม่ได้ประกาศไว้`)
    }
  }
  if (bundle.startsWith('dist/admin') && /["']sharp["']/.test(source)) {
    problems.push(`${bundle} มี sharp อยู่ — บันเดิลของแอดมินรันในเบราว์เซอร์ ต้องไม่มี native module`)
  }
}

const unsupported = Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies })
  .filter(([, range]) => /^(workspace|link|catalog|file):/.test(range))
  .map(([name, range]) => `${name}: "${range}" — npm ติดตั้ง protocol นี้ไม่ได้`)

const all = [...problems, ...unsupported]
if (all.length > 0) {
  for (const line of all) console.error(`::error::${line}`)
  process.exit(1)
}
console.log('runtime deps ok — ทุก specifier ในบันเดิลถูกประกาศไว้และติดตั้งได้จาก npm')
```

พิสูจน์ว่ามันจับได้จริงก่อนเชื่อมัน:

```bash
node -e "const fs=require('fs');const p='packages/strapi-v5/package.json';const j=JSON.parse(fs.readFileSync(p));j.dependencies['@fosivo/line-rich-menu-core']='workspace:*';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"
pnpm --filter strapi-plugin-line-rich-menu check:deps ; echo "exit=$?"
git checkout packages/strapi-v5/package.json
```

ต้องได้ `exit=1` พร้อมบรรทัด `::error::` ถ้าได้ 0 แปลว่าด่านไม่ได้มองอะไรเลย — แก้ก่อนไปต่อ

- [ ] **Step 3: ต่อเข้ากับ CI**

เพิ่มสองขั้นนี้ต่อท้าย job `quality` ใน `.github/workflows/ci.yml` (หลังขั้น `pnpm build` และหลังสองขั้นที่ตรวจ browser bundle ของ core)

```yaml
      - name: ตรวจว่าปลั๊กอิน v4 ติดตั้งได้จาก npm จริง
        run: pnpm --filter strapi-plugin-line-rich-menu-v4 check:deps

      - name: ตรวจว่าปลั๊กอิน v5 ติดตั้งได้จาก npm จริง
        run: pnpm --filter strapi-plugin-line-rich-menu check:deps

      - name: strapi-plugin verify (สเปก §13.4)
        # ด่านทางการของ Strapi เอง: package.json โหลดได้ · มี export ที่ Strapi รู้จัก ·
        # ลำดับคีย์ถูก · ทุกไฟล์ที่ exports อ้างถึงมีอยู่จริงบนดิสก์
        run: pnpm --filter strapi-plugin-line-rich-menu verify
```

และเพิ่ม script ที่ root `package.json`

```json
    "verify": "pnpm --filter strapi-plugin-line-rich-menu verify",
    "check:deps": "pnpm --filter strapi-plugin-line-rich-menu-v4 check:deps && pnpm --filter strapi-plugin-line-rich-menu check:deps",
```

- [ ] **Step 4: เขียว**

```bash
pnpm build && pnpm check:deps && pnpm verify
```

`strapi-plugin verify` ต้องพิมพ์ `✔ Verified package.json` และไม่มีบรรทัด `[ERROR]`

- [ ] **Step 5: commit**

```bash
git add packages/strapi-v5 .github/workflows/ci.yml package.json
git commit -m "build(v5): gate the published bundle on installability and strapi-plugin verify"
```

---

## Task 10: `examples/v5-app` — acceptance gate ที่รัน Strapi 5.52.1 จริง

**Files:**
- Create: `examples/v5-app/package.json`, `.env.example`, `.gitignore`, `config/{admin,database,middlewares,plugins,server}.js`, `src/index.js`, `scripts/seed.js`, `scripts/e2e.sh`, `playwright.config.ts`, `tests/acceptance.spec.ts`, `providers/upload-absolute-url/{index.js,package.json}`, `public/uploads/.gitkeep`, `README.md`
- Modify: `pnpm-workspace.yaml`, `eslint.config.js`, `.gitignore`, `package.json` (root — script `e2e:v5`), `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: tarball ของ `strapi-plugin-line-rich-menu` ที่ `npm pack` ปล่อยออกมา · `tools/line-mock` (Plan 00)
- Produces: `pnpm e2e:v5` ที่จบด้วย exit 0 เมื่อทุกอย่างถูก

- [ ] **Step 1: สร้างแอปและ config**

`examples/v5-app/package.json`

```json
{
  "name": "v5-app",
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
    "@strapi/plugin-users-permissions": "5.52.1",
    "@strapi/strapi": "5.52.1",
    "better-sqlite3": "11.3.0",
    "pg": "8.12.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "strapi-provider-upload-absolute-url": "file:./providers/upload-absolute-url",
    "styled-components": "^6.1.13"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "sharp": "0.35.3"
  },
  "engines": {
    "node": ">=20.15.0"
  }
}
```

`@strapi/plugin-i18n` หายไปจากรายการโดยตั้งใจ — Strapi 5 รวม i18n เข้าแกนแล้ว การประกาศเป็นแพ็กเกจแยกจะทำให้บูตล้มด้วย `plugin i18n is already registered`

`examples/v5-app/config/server.js`, `config/admin.js`, `config/middlewares.js`, `config/database.js`, `src/index.js`, `providers/upload-absolute-url/index.js`, `providers/upload-absolute-url/package.json`, `.gitignore`, `public/uploads/.gitkeep` — คัดลอกจาก `examples/v4-app/` **ทั้งเก้าไฟล์ ไม่แก้อะไรเลยสักบรรทัด** ทุกตัวยืนอยู่บน API ที่สเปก §2.1 ระบุว่าไม่เปลี่ยนระหว่างสองเวอร์ชัน (`strapi.db.connection`, upload REST, รูปแบบของ `config/*.js`) ส่วน `config/database.js` ใช้ path สัมพัทธ์กับตัวเองอยู่แล้ว จึงชี้ไปที่ `.tmp/data.db` ของแอปตัวเองโดยอัตโนมัติ

`examples/v5-app/config/plugins.js`

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
      scheduler: { enabled: env.bool('LINE_RM_SCHEDULER', false), cron: '* * * * *', lockTtlMs: 300000 },
    },
  },

  // เหตุผลเดียวกับใน examples/v4-app: provider นี้ห่อ local provider ไว้เพื่อคืน url แบบสัมบูรณ์
  // เฉพาะไฟล์ที่ชื่อขึ้นต้นด้วย `remote-` ทำให้ทั้งสองกิ่งของ `createImageStore.read`
  // (อ่านจากดิสก์ กับ fetch) ถูกเดินจริงในการบูตครั้งเดียว
  upload: {
    config: {
      provider: 'strapi-provider-upload-absolute-url',
      providerOptions: {
        baseUrl: `http://${env('HOST', '127.0.0.1')}:${env.int('PORT', 1337)}`,
      },
    },
  },
})
```

`examples/v5-app/.env.example` — คัดลอกจาก `examples/v4-app/.env.example` แล้วเปลี่ยน `PORT=1337` เป็น `PORT=1338` และเพิ่ม `E2E_BASE_URL=http://127.0.0.1:1338`

พอร์ตต้องต่างจาก v4 เพราะ CI รันทั้งสองแอปในงานเดียวกันไม่ได้ถ้าใช้พอร์ตเดียวกัน และคนที่รันทั้งคู่บนเครื่องตัวเองจะชนกันเงียบ ๆ โดยที่แอปที่สองไปคุยกับฐานข้อมูลของแอปแรก

`examples/v5-app/scripts/seed.js` — คัดลอกจาก `examples/v4-app/scripts/seed.js` แล้วเปลี่ยนสองบรรทัด

```js
  // Strapi 5 ไม่ export ตัวโรงงานเป็น default อีกแล้ว — `createStrapi()` คือทางเข้าใหม่
  // ของเดิม (`require('@strapi/strapi')()`) จะได้ TypeError: strapiFactory is not a function
  const { createStrapi } = require('@strapi/strapi')
  const strapi = await createStrapi().load()
```

ส่วนที่เหลือของไฟล์เหมือนเดิมทุกบรรทัด — `strapi.db.query('admin::role')`, `strapi.admin.services.user.create` และ `strapi.admin.services.role.assignPermissions` เป็น API ตัวเดียวกันทั้งสองเวอร์ชัน

`examples/v5-app/playwright.config.ts` — คัดลอกจาก `examples/v4-app/playwright.config.ts` แล้วเปลี่ยนสองอย่าง

```ts
  baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:1338',
```

และคอมเมนต์เหนือ `timeout` เป็น

```ts
  // Strapi 5 บูตเร็วกว่า v4 แต่ publish ยังเดินหลาย round trip — 60 วินาทีคือกันค้าง ไม่ใช่เกณฑ์ประสิทธิภาพ
```

`examples/v5-app/scripts/e2e.sh` — คัดลอกจาก `examples/v4-app/scripts/e2e.sh` แล้วแก้สี่จุด

1. `APP_DIR` และ `ROOT_DIR` เหมือนเดิม แต่ชื่อ tarball เปลี่ยน:

```bash
step "แพ็กปลั๊กอินเป็น tarball เหมือนที่ผู้ใช้ได้จาก npm"
(cd "$ROOT_DIR/packages/strapi-v5" && npm pack --pack-destination "$PACK_DIR")
...
npm install --no-audit --no-fund --no-save "$PACK_DIR"/strapi-plugin-line-rich-menu-[0-9]*.tgz
```

glob ต้องเป็น `strapi-plugin-line-rich-menu-[0-9]*.tgz` ไม่ใช่ `strapi-plugin-line-rich-menu-*.tgz` — อย่างหลังจะจับ tarball ของ v4 (`strapi-plugin-line-rich-menu-v4-0.0.0.tgz`) ไปด้วยเมื่อทั้งสองอยู่ในโฟลเดอร์เดียวกัน แล้วแอป v5 จะติดตั้งปลั๊กอินของ v4 ทับ ซึ่งบูตขึ้นแต่ไม่มี route ไหนทำงาน

2. พอร์ตของ Strapi:

```bash
until curl -sf http://127.0.0.1:1338/admin >/dev/null; do
```

และ

```bash
if ! curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:1338/line-rich-menu/channels | grep -qE '^(401|403)$'; then
```

3. ล้างสถานะของรอบก่อน — Strapi 5 ใช้โฟลเดอร์ `.strapi` แทน `.cache`:

```bash
rm -rf .tmp build dist .strapi public/uploads
```

4. เพิ่มขั้นนี้ต่อจาก "ยืนยันว่าปลั๊กอินถูกโหลดจริง" เพราะเป็นความล้มเหลวที่ v5 มีแต่ v4 ไม่มี:

```bash
step "ยืนยันว่าบันเดิลของแอดมินถูก Vite รวมเข้าไปจริง"
# `strapi build` ของ v5 ใช้ Vite ซึ่งจะข้ามปลั๊กอินที่ resolve `./strapi-admin` ไม่ได้
# **โดยไม่ล้ม** — ผลคือ server ทำงานครบทุก route แต่เมนูซ้ายไม่มีลิงก์ของปลั๊กอินเลย
# ซึ่งเป็นความพังที่ curl ฝั่ง API มองไม่เห็นสักนิด
if ! grep -rq "line-rich-menu" build/ 2>/dev/null; then
  echo "::error::บันเดิลของแอดมินไม่มีปลั๊กอินอยู่เลย — ตรวจ exports map และ strapi-plugin verify" >&2
  exit 1
fi
```

- [ ] **Step 2: เขียน acceptance spec**

`examples/v5-app/tests/acceptance.spec.ts` — คัดลอกจาก `examples/v4-app/tests/acceptance.spec.ts` ทั้งไฟล์ แล้วแก้ตามนี้

**ก. id ที่ hardcode เป็น `1` ในตาราง RBAC** — ทั้งใน `guarded` และ `forbidden` เปลี่ยน `/1` ทุกจุดเป็น `/aaaaaaaaaaaaaaaaaaaaaaaa` (ตัว a ยี่สิบสี่ตัว)

เหตุผล: `idParam` ของ v5 ปฏิเสธไม่ได้ทั้งคู่ (ทั้ง `1` และสตริงนั้นผ่าน regex) แต่ค่าที่หน้าตาเหมือน documentId ทำให้เทสต์พิสูจน์สิ่งที่มันตั้งใจจริง ๆ คือ **403 มาจาก policy ไม่ใช่จาก 400 ที่ zod ปฏิเสธก่อน** — ถ้าวันหนึ่ง policy หลุด เทสต์ที่ใช้ `1` อาจยังเขียวเพราะได้ 400 แทน ซึ่งไม่ใช่ 403 แต่ก็ไม่ใช่ 200 เช่นกัน

**ข. เพิ่ม assertion เรื่องรูปทรงของ id** ต่อจากบรรทัดที่อ่าน `channelId = channel.id` ในเทสต์เส้นทางหลัก

```ts
    // documentId ของ Strapi 5 ไม่ใช่ตัวเลข — ถ้ามันเป็นตัวเลข แปลว่า repo หยิบคอลัมน์ `id`
    // มาแทน `documentId` ซึ่งจะ "ทำงาน" ตลอดในแอปที่มีแถวเดียวแล้วพังตอนมีแถวที่สอง
    expect(channelId).not.toMatch(/^\d+$/)
    expect(channelId).toMatch(/^[a-z0-9]{20,32}$/)
```

**ค. เปลี่ยนชื่อและคำอธิบายของ describe สุดท้าย** จาก

```ts
  test('login → เห็นลิงก์ในเมนูซ้าย → เปิดหน้าปลั๊กอินได้ (DS v1 + webpack 5 + router v5)', async ({ page }) => {
```

เป็น

```ts
  test('login → เห็นลิงก์ในเมนูซ้าย → เปิดหน้าปลั๊กอินได้ (DS v2 + Vite + router v6)', async ({ page }) => {
```

**ง. เพิ่มเทสต์นี้ต่อท้ายไฟล์** — มันคือด่านเดียวที่พิสูจน์ว่า lock ยิงใส่คอลัมน์ถูกตัว ซึ่งเทสต์ระดับ unit พิสูจน์ได้แค่ "ยิงใส่ชื่อคอลัมน์นี้" ไม่ใช่ "คอลัมน์นี้มีอยู่จริงและมีค่าที่ตรงกัน"

```ts
test.describe('scheduler บน Strapi 5', () => {
  /**
   * `ScheduleRow.id` ของ v5 คือ `documentId` ส่วน lock query ยิงผ่าน knex ตรง ๆ ซึ่งมองเห็น
   * แต่คอลัมน์ในตาราง ค่า default ของ `ScheduleLockColumns.id` คือ `'id'` — primary key
   * ตัวเลข การส่ง documentId ไปเทียบกับคอลัมน์นั้นได้ `affected === 0` เสมอ แปลว่า claim
   * ไม่เคยสำเร็จ ทุกงานที่ตั้งเวลาไว้ถูกข้ามเงียบ ๆ ทุกนาที
   *
   * เทสต์ระดับ unit (tests/container.test.ts) พิสูจน์ได้แค่ว่าเรา *ตั้งใจ* ยิงใส่ `document_id`
   * ส่วนตัวที่พิสูจน์ว่าคอลัมน์นั้นมีอยู่จริงในสคีมาที่ Strapi 5 สร้าง และค่าในนั้นตรงกับ id ที่
   * ชั้น service ถืออยู่ คือเทสต์นี้เท่านั้น
   */
  test('งานที่ถึงกำหนดถูก claim และทำจนจบ ไม่ใช่ค้างที่ claimed: 0', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id
    const fileId = await uploadImage(request, token, 'scheduled.jpg')

    // ตั้งเวลาไว้ในอดีตหนึ่งนาที เพื่อให้มันถึงกำหนดทันทีที่ tick ถูกยิง
    const past = new Date(Date.now() - 60_000).toISOString()
    const created = await request.post('/line-rich-menu/menus', {
      ...auth(token),
      data: {
        ...menuBody({ name: 'เมนูตั้งเวลา', channelId, imageFileId: fileId, aliasId: 'scheduled' }),
        startAt: past,
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    const menu = await created.json()
    expect(menu.startAt).toBe(past)

    // ต้อง publish ก่อน — set-default ทำกับเมนูที่ยังไม่มีตัวตนบน LINE ไม่ได้
    const published = await request.post(`/line-rich-menu/menus/${menu.id}/publish`, {
      ...auth(token), data: { setAsDefault: false },
    })
    expect(published.status(), await published.text()).toBe(200)

    const ticked = await request.post('/line-rich-menu/schedules/tick', { ...auth(token), data: {} })
    expect(ticked.status(), await ticked.text()).toBe(200)
    const report = await ticked.json()
    expect(report.due).toBeGreaterThanOrEqual(1)
    // นี่คือบรรทัดที่จับความล้มเหลวของคอลัมน์: due > 0 แต่ claimed === 0 คือลายเซ็นของมันเป๊ะ ๆ
    expect(report.claimed, 'claim ล้มทุกครั้ง = lock ยิงใส่คอลัมน์ผิด').toBeGreaterThanOrEqual(1)
    expect(report.failed).toBe(0)

    // ปลายทางจริง: LINE ต้องเห็นเมนูนี้เป็น default หลัง tick
    const current = await (await request.get(`${LINE_MOCK}/v2/bot/user/all/richmenu`, {
      headers: { Authorization: 'Bearer e2e-mock' },
    })).json()
    expect(current.richMenuId).toBe((await (await request.get(
      `/line-rich-menu/menus/${menu.id}`, auth(token),
    )).json()).lineRichMenuId)
  })
})
```

`theChannel`, `menuBody`, `uploadImage`, `login` และ `auth` มาพร้อมกับไฟล์ที่คัดลอกมาจาก v4 อยู่แล้ว — ไม่ต้องเขียนใหม่ ส่วน `LINE_MOCK` ก็เช่นกัน

- [ ] **Step 3: ต่อสายเข้ากับเวิร์กสเปซและ CI**

`pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
  - 'tools/*'
  # examples/* ติดตั้งด้วย npm ต่างหาก — ดูเหตุผลใน docs/.../03-server-and-v4.md Task 20
  # มันต้องเป็นแอป Strapi ที่เหมือนของลูกค้า ไม่ใช่แพ็กเกจในเวิร์กสเปซที่ได้ node_modules พิเศษ
  - '!examples/v4-app'
  - '!examples/v5-app'
allowBuilds:
  esbuild: true
  msw: false
  sharp: true
```

`eslint.config.js` — เปลี่ยน glob ของสองบล็อกที่ผูกกับ `examples/v4-app` ให้ครอบทั้งสองแอป

```js
    files: ['examples/*/**/*.js'],
```

และ

```js
    files: ['examples/*/**/*.ts'],
```

`package.json` ที่ root

```json
    "e2e:v4": "bash examples/v4-app/scripts/e2e.sh",
    "e2e:v5": "bash examples/v5-app/scripts/e2e.sh",
```

`.github/workflows/ci.yml` — เพิ่ม job ใหม่ ซึ่งเป็นสิ่งที่สเปก §13.4 เรียกว่า "e2e matrix: strapi[4.25.x, 5.x] × db[sqlite, postgres] × node 20"

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: quality
    strategy:
      fail-fast: false
      matrix:
        strapi: ['4', '5']
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
    env:
      DATABASE_CLIENT: ${{ matrix.db }}
      DATABASE_HOST: 127.0.0.1
      DATABASE_PORT: '5432'
      DATABASE_NAME: strapi
      DATABASE_USERNAME: strapi
      DATABASE_PASSWORD: strapi
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm e2e:v${{ matrix.strapi }}
      - if: failure()
        name: log ของ Strapi ตอนล้ม
        run: tail -200 examples/v${{ matrix.strapi }}-app/.tmp-strapi.log || true
```

`service` ของ postgres ถูกประกาศไว้ทั้งสี่ช่องของ matrix โดยตั้งใจ — GitHub Actions ไม่มีทางประกาศ service แบบมีเงื่อนไข การรัน container เปล่า ๆ ทิ้งไว้ในรอบ sqlite ราคาถูกกว่าการแตก workflow เป็นสองไฟล์ที่ต้องแก้คู่กันตลอดไป

`.gitignore` — เพิ่มสามบรรทัดนี้ถ้ายังไม่มี

```
examples/*/.tmp*
examples/*/build
examples/*/.strapi
```

- [ ] **Step 4: รันแล้วดูมันเขียว**

```bash
pnpm e2e:v5
```

รอบแรกจะช้า (ติดตั้ง Strapi 5 ทั้งตัว) ถ้าล้ม ให้ไล่ตามลำดับนี้ก่อนแก้โค้ด:

- `strapi-plugin verify` ผ่านไหม (`pnpm verify`) — ถ้าไม่ผ่าน ปัญหาอยู่ที่ `exports` map ไม่ใช่ที่แอป
- `route ของปลั๊กอินไม่ตอบ 401/403` — ปลั๊กอินไม่ถูกลงทะเบียนเลย ตรวจ `config/plugins.js` และชื่อคีย์ `'line-rich-menu'` ว่าตรงกับ `strapi.name` ใน `package.json`
- `บันเดิลของแอดมินไม่มีปลั๊กอินอยู่เลย` — `./strapi-admin` resolve ไม่ได้ ตรวจว่า `dist/admin/index.mjs` มีอยู่จริงในสิ่งที่ `npm pack` ห่อมา (`tar tzf` ดูได้)
- `claimed: 0` ในเทสต์ scheduler — คอลัมน์ของ lock ผิด กลับไปที่ Task 4

- [ ] **Step 5: ให้แน่ใจว่า v4 ยังไม่พัง**

```bash
pnpm e2e:v4
```

- [ ] **Step 6: commit**

```bash
git add examples/v5-app pnpm-workspace.yaml eslint.config.js package.json .gitignore .github/workflows/ci.yml
git commit -m "test(v5): add examples/v5-app as the acceptance gate and run both adapters in CI"
```

---

## Task 11: custom layout ที่ผู้ใช้กดถึงได้จริง

**Files:**
- Modify: `packages/ui/src/components/Preview.tsx`, `packages/ui/src/components/AreaList.tsx`, `packages/ui/src/pages/RichMenuEditor.tsx`, `packages/ui/src/translations/en.json`, `packages/ui/src/translations/th.json`
- Test: `packages/ui/tests/editor.test.tsx` (เพิ่ม describe ใหม่), `packages/ui/tests/area-list.test.tsx` (เพิ่มสองเทสต์)

**Interfaces:**
- Consumes: `CanvasEditorProps.onBoundsChange`, `CanvasEditorProps.snap` (Plan 02 Task 4) · `RichMenuDraft`, `emptyActionForm` (Plan 02 Task 3, 11) · `Bounds` จาก `@fosivo/line-rich-menu-core/browser`
- Produces:
  - `PreviewProps` เพิ่มสองพร็อพ: `onBoundsChange?(index: number, next: Bounds): void` · `snap?: number`
  - `AreaListProps` เพิ่มสองพร็อพ: `onAdd?(): void` · `onRemove?(index: number): void`
  - คีย์แปลใหม่สี่ตัว: `editor.layout.add` · `editor.layout.custom` · `editor.layout.limit` · `editor.layout.remove`

**คำตัดสินที่ task นี้บังคับใช้:** carry-forward ทิ้งคำถามไว้ว่า v1.0 จะ **ต่อสาย** drag/resize หรือ **บันทึกว่าไม่มี** สเปก §17 ตอบไปแล้วในตารางบรรทัด "ขอบเขต v1.0" ว่า **จัดเต็ม — custom layout + หลายแท็บ + ตั้งเวลา + compose รูปแยกช่อง** และ §5.2 อธิบายไว้ว่า custom layout "แทบไม่มีต้นทุนเพิ่ม" ซึ่งเป็นความจริงพอดี: กลไกลาก ปรับขนาด และ snap เขียนเสร็จและมี `canvas-editor-drag.test.tsx` คุมอยู่แล้ว สิ่งที่ขาดคือการส่งพร็อพผ่าน `Preview` กับปุ่มเพิ่ม/ลบช่องสองปุ่ม การปล่อย 1.0 ที่ขัดกับตารางการตัดสินใจของตัวเอง **พร้อมกับ** แบกโค้ดที่ทดสอบแล้วแต่ไม่มีใครเรียกถึง แย่กว่าการต่อสายให้จบ

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

เพิ่ม describe นี้ต่อท้าย `packages/ui/tests/editor.test.tsx` — ใช้ `setup()` และ `chooseTemplate()` ที่ไฟล์นั้นมีอยู่แล้ว และใช้ `fireEvent` ตามสำนวนเดิมของไฟล์ (stub port แปล `t` เป็นคีย์ตรง ๆ ป้ายบนจอจึงเป็นชื่อคีย์)

```tsx
describe('custom layout (สเปก §5.2 · §17 "ขอบเขต v1.0 — จัดเต็ม")', () => {
  const enableCustomLayout = () => {
    fireEvent.click(screen.getByLabelText('editor.layout.custom'))
  }

  /**
   * `CanvasEditor` ตัดสินว่าตัวเองแก้ไขได้หรือไม่จากการมีอยู่ของ `onBoundsChange` และวาดมือจับ
   * เฉพาะตอนแก้ไขได้ (ดู canvas-editor-drag.test.tsx) — การมี/ไม่มี `resize-handle-*` จึงเป็น
   * ตัวชี้ที่ตรงที่สุดว่าพร็อพเดินทางผ่าน `Preview` ไปถึงจริงหรือไม่
   *
   * ก่อน Plan 04 ไม่มีจุดเรียกไหนส่งมันมาเลย ทั้งความสามารถลาก/ปรับขนาดจึงถูกทดสอบไว้แต่
   * ไม่มีทางถูกใช้จากหน้าจอจริงแม้แต่ครั้งเดียว
   */
  it('สวิตช์ปิดอยู่ตอนเริ่ม — ผังสำเร็จรูปแก้ไม่ได้', () => {
    setup()
    chooseTemplate()
    expect(screen.queryAllByTestId(/^resize-handle-/)).toHaveLength(0)
  })

  it('เปิดสวิตช์แล้วมือจับโผล่ครบทุกช่อง', () => {
    setup()
    chooseTemplate()
    const areas = screen.getAllByTestId(/^area-header-/).length
    enableCustomLayout()
    expect(screen.getAllByTestId(/^resize-handle-/)).toHaveLength(areas)
  })

  it('ลากด้วยคีย์บอร์ดแล้วช่องขยับจริง — ค่าไปถึง draft ไม่ใช่แค่ state ภายใน canvas', () => {
    setup()
    chooseTemplate()
    enableCustomLayout()
    // ต้อง scope ที่ `preview-menu` — ชื่อ "A" มีสองที่: ช่องบนผืนผ้าใบ กับหัว accordion ใน AreaList
    const area = within(screen.getByTestId('preview-menu')).getByRole('button', { name: /^A$/ })
    expect(area.style.left).toBe('0%')
    fireEvent.keyDown(area, { key: 'ArrowRight' })
    // `Preview` เป็น controlled — ถ้า bounds ไม่ถูกเขียนกลับลง draft ช่องจะเด้งกลับที่เดิมทันที
    expect(within(screen.getByTestId('preview-menu')).getByRole('button', { name: /^A$/ }).style.left)
      .not.toBe('0%')
  })

  it('เพิ่มช่องได้จนถึง 20 แล้วปุ่มถูกปิด — เพดานของ LINE เอง (สเปก §2.2)', () => {
    setup()
    chooseTemplate()
    enableCustomLayout()

    const before = screen.getAllByTestId(/^area-header-/).length
    fireEvent.click(screen.getByTestId('area-add'))
    expect(screen.getAllByTestId(/^area-header-/)).toHaveLength(before + 1)

    while (screen.getAllByTestId(/^area-header-/).length < 20) {
      fireEvent.click(screen.getByTestId('area-add'))
    }
    expect(screen.getAllByTestId(/^area-header-/)).toHaveLength(20)
    expect(screen.getByTestId('area-add')).toBeDisabled()
  })

  // เหลือศูนย์ช่องแล้ว payload จะถูก LINE ปฏิเสธด้วย "1–20 ช่อง" โดยที่ผู้ใช้ไม่รู้ว่าทำอะไรผิด
  it('ลบช่องได้ แต่ลบช่องสุดท้ายไม่ได้', () => {
    setup()
    chooseTemplate()
    enableCustomLayout()

    while (screen.getAllByTestId(/^area-header-/).length > 1) {
      fireEvent.click(screen.getAllByTestId(/^area-remove-/)[0]!)
    }
    expect(screen.getAllByTestId(/^area-header-/)).toHaveLength(1)
    expect(screen.getByTestId('area-remove-0')).toBeDisabled()
  })

  it('ลบช่องแล้ว action ของช่องที่เหลือไม่เลื่อนตำแหน่ง', () => {
    setup()
    chooseTemplate()
    enableCustomLayout()

    fireEvent.click(screen.getByTestId('area-header-1'))
    fireEvent.change(within(screen.getByTestId('area-body-1')).getByLabelText('action.field.label'), {
      target: { value: 'ช่องที่สอง' },
    })
    fireEvent.click(screen.getByTestId('area-remove-0'))
    fireEvent.click(screen.getByTestId('area-header-0'))
    expect(within(screen.getByTestId('area-body-0')).getByLabelText('action.field.label'))
      .toHaveValue('ช่องที่สอง')
  })

  it('ปุ่มเพิ่ม/ลบไม่โผล่เลยเมื่อสวิตช์ปิดอยู่', () => {
    setup()
    chooseTemplate()
    expect(screen.queryByTestId('area-add')).toBeNull()
    expect(screen.queryByTestId('area-remove-0')).toBeNull()
  })

  /**
   * ผังที่ถูกปรับเองแล้วไม่ตรงกับ template ที่เลือกไว้อีกต่อไป การเก็บชื่อ template ไว้จะทำให้
   * ตอนเปิดกลับมาแก้ ผู้ใช้เห็นชื่อ template ที่ไม่ตรงกับสิ่งที่อยู่บนผืนผ้าใบ แล้วอาจกดใช้ซ้ำ
   * โดยไม่รู้ว่ามันจะทับผังที่ตัวเองปรับไว้ทั้งหมด
   */
  it('เพิ่มช่องแล้ว templateKey ถูกล้าง — ผังไม่ใช่ของ template นั้นอีกแล้ว', async () => {
    const { onSave } = setup()
    chooseTemplate()
    enableCustomLayout()
    fireEvent.click(screen.getByTestId('area-add'))
    fireEvent.click(screen.getByTestId('editor-save-draft'))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect((onSave.mock.calls[0]![0] as RichMenuDraft).templateKey).toBeNull()
  })
})
```

เพิ่มสองเทสต์นี้เข้า `packages/ui/tests/area-list.test.tsx`

```tsx
describe('ปุ่มเพิ่ม/ลบช่อง', () => {
  it('ปุ่มลบอยู่นอก <button> ของ accordion — ปุ่มซ้อนปุ่มเป็น HTML ที่ใช้ไม่ได้', () => {
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <AreaList
          areas={[emptyActionForm(), emptyActionForm()]}
          activeIndex={null}
          view="list"
          onViewChange={() => {}}
          onSelect={() => {}}
          onChange={() => {}}
          onAdd={() => {}}
          onRemove={() => {}}
          aliasOptions={[]}
        />
      </PortProvider>,
    )
    const remove = screen.getByTestId('area-remove-0')
    expect(remove.closest('[data-testid="area-header-0"]')).toBeNull()
  })

  it('ไม่ส่ง onAdd/onRemove มาก็ไม่มีปุ่มไหนโผล่', () => {
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <AreaList
          areas={[emptyActionForm()]}
          activeIndex={null}
          view="list"
          onViewChange={() => {}}
          onSelect={() => {}}
          onChange={() => {}}
          aliasOptions={[]}
        />
      </PortProvider>,
    )
    expect(screen.queryByTestId('area-add')).toBeNull()
    expect(screen.queryByTestId('area-remove-0')).toBeNull()
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project ui tests/editor.test.tsx tests/area-list.test.tsx
```

คาดว่าล้มที่ `Unable to find a label with the text of: editor.layout.custom`

- [ ] **Step 3: implement**

`packages/ui/src/components/Preview.tsx` — เพิ่มสองพร็อพเข้า `PreviewProps` ต่อจาก `errors`

```ts
  /**
   * ส่งมาเมื่อผู้ใช้เปิดโหมดปรับผังเอง — `CanvasEditor` ตัดสินว่าตัวเองแก้ไขได้หรือไม่จากการมีอยู่
   * ของ callback ตัวนี้ (`editable = onBoundsChange !== undefined`) ก่อน Plan 04 ไม่มีจุดเรียก
   * ไหนส่งมันมาเลย ทั้งความสามารถลาก/ปรับขนาดจึงถูกทดสอบไว้แต่ไม่มีทางถูกใช้จากหน้าจอจริง
   */
  onBoundsChange?(index: number, next: Bounds): void
  /** ขนาดช่องกริดในหน่วยพิกเซลของผืนผ้าใบ — ส่งต่อให้ CanvasEditor ตรง ๆ ไม่แปลงอะไร */
  snap?: number
```

เพิ่ม `onBoundsChange, snap` เข้ารายการ destructure ของฟังก์ชัน แล้วส่งต่อในจุดที่วาด `CanvasEditor`

```tsx
          <CanvasEditor
            size={size}
            bounds={bounds}
            showOutlines={showOutlines ?? imageUrl === undefined}
            activeIndex={activeIndex ?? null}
            onSelect={onSelect ?? (() => {})}
            {...(errors === undefined ? {} : { errors })}
            {...(imageUrl === undefined ? {} : { imageUrl })}
            {...(onBoundsChange === undefined ? {} : { onBoundsChange })}
            {...(snap === undefined ? {} : { snap })}
          />
```

`packages/ui/src/components/AreaList.tsx` — เพิ่มสองพร็อพเข้า `AreaListProps`

```ts
  /** ส่งมาเฉพาะตอนที่โหมดปรับผังเองเปิดอยู่ — ไม่ส่ง = ไม่มีปุ่มเพิ่ม/ลบเลยสักปุ่ม */
  onAdd?(): void
  onRemove?(index: number): void
```

เพิ่ม `onAdd, onRemove` เข้ารายการ destructure แล้วเพิ่มปุ่มเพิ่มไว้ต่อจาก `IconButton` สองตัวในแถวหัวข้อ

```tsx
          {onAdd === undefined ? null : (
            <ui.Button
              variant="secondary"
              testId="area-add"
              // เพดาน 20 ช่องเป็นข้อจำกัดของ LINE เอง (สเปก §2.2) ไม่ใช่ตัวเลขที่เราเลือก
              disabled={areas.length >= 20}
              onClick={onAdd}
            >
              {t('editor.layout.add')}
            </ui.Button>
          )}
```

ส่วนปุ่มลบต้องอยู่ **นอก** `<button>` ของ accordion — ปุ่มซ้อนปุ่มเป็น HTML ที่ไม่ถูกต้อง เบราว์เซอร์แต่ละตัวแก้ให้คนละแบบ และ jsdom ก็แก้อีกแบบ ทำให้เทสต์กับของจริงไม่ตรงกัน ห่อทั้งสองอย่างด้วย `<div>` แทน โดยเปลี่ยนโครงในลูป `areas.map` จาก

```tsx
          <section key={index} style={{ border: '1px solid #dcdce4', borderRadius: 4 }}>
            <button ... >
```

เป็น

```tsx
          <section key={index} style={{ border: '1px solid #dcdce4', borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button ... >   {/* เนื้อในของ <button> เหมือนเดิมทุกบรรทัด */}
              </button>
              {onRemove === undefined ? null : (
                <ui.IconButton
                  label={t('editor.layout.remove')}
                  testId={`area-remove-${index}`}
                  // เหลือศูนย์ช่องแล้ว payload จะถูก LINE ปฏิเสธด้วย "1–20 ช่อง" โดยที่ผู้ใช้
                  // ไม่มีทางรู้ว่าตัวเองทำอะไรผิด กันไว้ที่นี่ตั้งแต่ต้น
                  disabled={areas.length <= 1}
                  onClick={() => onRemove(index)}
                >
                  ✕
                </ui.IconButton>
              )}
            </div>
            {open ? ( ... ) : null}
          </section>
```

`packages/ui/src/pages/RichMenuEditor.tsx` — `Bounds` ถูก import ไว้แล้ว (`RichMenuDraft.bounds` ใช้มัน) ไม่ต้องเพิ่ม

เพิ่ม state ต่อจาก `const [outlines, setOutlines] = useState(true)`

```tsx
  const [customLayout, setCustomLayout] = useState(false)
```

เพิ่มสามฟังก์ชันไว้ต่อจาก `applyTemplate`

```tsx
  /**
   * ลาก/ปรับขนาดช่อง — เขียนกลับลง `draft.bounds` ตำแหน่งเดิม ไม่แตะ `draft.areas`
   * เพราะ action ของช่องนั้นไม่ได้เปลี่ยนตามพิกัด
   *
   * `templateKey` ถูกล้างเป็น null ทันทีที่ผู้ใช้ขยับช่องแรก — ผังไม่ตรงกับ template ที่เลือกไว้
   * อีกต่อไป ถ้ายังเก็บชื่อไว้ ตอนเปิดกลับมาแก้ผู้ใช้จะเห็นชื่อ template ที่ไม่ตรงกับสิ่งที่อยู่บน
   * ผืนผ้าใบ แล้วอาจกดใช้ซ้ำโดยไม่รู้ว่ามันจะทับผังที่ตัวเองปรับไว้ทั้งหมด
   */
  const moveBounds = (index: number, next: Bounds) => {
    setDraft((prev) => ({
      ...prev,
      templateKey: null,
      bounds: prev.bounds.map((bounds, i) => (i === index ? next : bounds)),
    }))
  }

  const addArea = () => {
    setDraft((prev) => {
      if (prev.bounds.length >= 20) return prev
      // ช่องใหม่วางมุมซ้ายบน ขนาดหนึ่งในสี่ของผืนผ้าใบ — ตำแหน่งที่มองเห็นแน่นอน ทับช่องเดิม
      // แน่นอนด้วย ซึ่งรับได้เพราะโหมดนี้เปิดอยู่และผู้ใช้ลากต่อได้ทันที (LINE อนุญาตให้ช่องทับกัน)
      const fresh: Bounds = {
        x: 0, y: 0,
        width: Math.round(size.width / 2),
        height: Math.round(size.height / 2),
      }
      return {
        ...prev,
        templateKey: null,
        bounds: [...prev.bounds, fresh],
        areas: [...prev.areas, emptyActionForm()],
      }
    })
  }

  /** ลบช่องพร้อม action ของมันเป็นคู่ — สองอาเรย์นี้ผูกกันด้วย index ล้วน ๆ ตัดข้างเดียวคือ off-by-one ถาวร */
  const removeArea = (index: number) => {
    setDraft((prev) => {
      if (prev.bounds.length <= 1) return prev
      return {
        ...prev,
        templateKey: null,
        bounds: prev.bounds.filter((_, i) => i !== index),
        areas: prev.areas.filter((_, i) => i !== index),
      }
    })
    // index ที่เลือกอยู่/error ที่ค้างอยู่ ผูกกับตำแหน่งเดิมทั้งคู่ ล้างทั้งสองแทนที่จะพยายามเลื่อนตาม
    setActive(null)
    setAreaErrors({})
  }
```

ส่งพร็อพให้ `Preview` โดยเพิ่มบรรทัดนี้ต่อจาก `{...(draft.image === null ? {} : { imageUrl: draft.image.url })}`

```tsx
            {...(customLayout ? { onBoundsChange: moveBounds, snap: 10 } : {})}
```

เพิ่มสวิตช์ต่อจาก `ui.Toggle` ของ `outlines`

```tsx
          <ui.Toggle
            name="custom-layout"
            label={t('editor.layout.custom')}
            checked={customLayout}
            onChange={setCustomLayout}
          />
```

และส่งพร็อพให้ `AreaList` โดยเพิ่มบรรทัดนี้ต่อจาก `errors={areaErrors}`

```tsx
            {...(customLayout ? { onAdd: addArea, onRemove: removeArea } : {})}
```

เพิ่มคีย์แปลใน `packages/ui/src/translations/en.json` (เรียงตามคีย์ — ทั้งสี่ตัวลงระหว่าง `editor.image` กับ `editor.loadFailed`)

```json
  "editor.layout.add": "Add area",
  "editor.layout.custom": "Adjust the layout manually",
  "editor.layout.limit": "A rich menu can have at most 20 tappable areas",
  "editor.layout.remove": "Remove this area",
```

และตำแหน่งเดียวกันใน `th.json`

```json
  "editor.layout.add": "เพิ่มช่อง",
  "editor.layout.custom": "ปรับผังเอง",
  "editor.layout.limit": "เมนูหนึ่งอันมีช่องที่แตะได้ไม่เกิน 20 ช่อง",
  "editor.layout.remove": "ลบช่องนี้",
```

- [ ] **Step 4: เขียว**

```bash
pnpm test --project ui && pnpm typecheck && pnpm lint
```

`i18n.test.ts` จะแดงถ้าคีย์ไม่ครบทั้งสองภาษาหรือเรียงผิด — นั่นคือหน้าที่ของมัน ให้แก้ที่ไฟล์แปล ไม่ใช่ที่เทสต์

- [ ] **Step 5: commit**

```bash
git add packages/ui
git commit -m "feat(ui): let a custom layout be dragged, added and removed from the editor"
```

---

## Task 12: ปิดรายการ Minor ของ `packages/ui` ที่ให้ข้อมูลผิดหรือเป็นยามที่ไม่ได้ยาม

**Files:**
- Modify: `packages/ui/src/components/ImageField.tsx`, `packages/ui/src/components/TemplatePicker.tsx`, `packages/ui/src/components/CanvasEditor.tsx`, `packages/ui/src/pages/RichMenuEditor.tsx`
- Test: `packages/ui/tests/port.test.tsx`, `packages/ui/tests/i18n.test.ts`, `packages/ui/tests/image-field.test.tsx`, `packages/ui/tests/template-picker.test.tsx`, `packages/ui/tests/canvas-editor.test.tsx`

**Interfaces:**
- Produces: `ImageFieldProps` เพิ่ม `error?: string` และ `onErrorChange?(message: string | null): void`

รายการนี้มาจาก "จาก Plan 02's whole-branch review — accepted as Minor, not fixed" ใน carry-forward ทั้งหมด **ไม่ได้เอามาทุกข้อ** — เอาเฉพาะสามชนิดที่ปล่อยไป 1.0 ไม่ได้ คือ (ก) ข้อมูลที่ผิดจริงบนหน้าจอ (ข) ยามที่เขียวโดยไม่ได้บังคับอะไร ซึ่งเป็นความล้มเหลวที่โปรเจกต์นี้บันทึกไว้แล้วสี่ครั้ง และ (ค) การหนีออกจาก escaping ที่วันนี้ยังปลอดภัยเพราะค่าเป็นของเซิร์ฟเวอร์ ข้อที่เหลือ (conditional-spread ceremony, per-file coverage) ยกยอดไปในหัวข้อ "สิ่งที่ยังค้าง" ท้ายไฟล์นี้

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

**ก.** แทนที่เทสต์ `stub port มีครบทุกอย่างที่ UIPort ประกาศไว้` ใน `packages/ui/tests/port.test.tsx` ด้วย

```tsx
  /**
   * เดิมบรรทัดนี้เป็น `expect(Object.keys(port.ui).length).toBeGreaterThanOrEqual(15)` ซึ่ง
   * ไม่ได้พิสูจน์ชื่อของมันเลย: stub มี 16 ตัว การลบทิ้งหนึ่งตัวยังผ่าน และการเพิ่มตัวใหม่เข้า
   * `UIPrimitives` โดยลืม implement ในสอง adapter ก็ยังผ่าน — ยามที่เขียวโดยไม่ได้บังคับอะไร
   *
   * รายการเต็มที่เรียงแล้วบังคับทั้งสองทิศ และเมื่อรายการเปลี่ยน มันจะเปลี่ยนแบบที่เห็นใน diff
   */
  it('stub port มีครบทุกอย่างที่ UIPort ประกาศไว้', () => {
    const port = createStubPort()
    expect(Object.keys(port.ui).sort()).toEqual([
      'Alert', 'Button', 'Checkbox', 'Divider', 'Flex', 'IconButton', 'Loader', 'Modal',
      'Option', 'Radio', 'RadioGroup', 'Select', 'TextInput', 'Textarea', 'Toggle',
      'Tooltip', 'Typography',
    ])
    for (const method of ['get', 'post', 'put', 'del'] as const) {
      expect(typeof port.http[method]).toBe('function')
    }
    expect(typeof port.toast).toBe('function')
    expect(typeof port.nav.push).toBe('function')
    expect(typeof port.t).toBe('function')
  })
```

สิบเจ็ดตัวนี้คือคีย์ทั้งหมดของ `UIPrimitives` ใน `packages/ui/src/port.ts` ณ วันที่เขียนแผนนี้ เรียงแบบที่ `Array.prototype.sort()` เรียง (ซึ่งเทียบด้วย UTF-16 code unit — `'TextInput'` มาก่อน `'Textarea'` เพราะ `I` < `a`) ถ้ารันแล้วแดง **ให้แก้รายการในเทสต์ให้ตรงกับ `port.ts` ตัวจริง** ไม่ใช่แก้ `stub-port.tsx` ให้ตรงกับรายการ — `port.ts` คือสัญญา ส่วนไฟล์อื่นเป็นผู้ทำตาม

**ข.** เพิ่มสองเทสต์เข้า `packages/ui/tests/i18n.test.ts`

```ts
  /**
   * ยามคำทับศัพท์ที่มีอยู่จับได้แค่ค่าที่เหมือนกัน **ทุกไบต์** — `"editor.actions": "Action"`
   * ในไทย เทียบกับ `"Actions"` ในอังกฤษ คือภาษาอังกฤษที่ยังไม่ได้แปล ซึ่งลอดผ่านไปได้ด้วย
   * ตัวอักษรเดียว ยามตัวนี้ถามคำถามที่ตรงกว่า: ค่าภาษาไทยที่ไม่มีอักษรไทยอยู่เลยแม้แต่ตัวเดียว
   */
  it('คำแปลไทยทุกตัวมีอักษรไทยอยู่จริง เว้นแต่เป็นคำทับศัพท์ที่ประกาศไว้', () => {
    const DELIBERATE_LOANWORDS: readonly string[] = [
      'action.field.uri', 'action.type.postback', 'action.type.uri',
      'channel.accessToken', 'channel.channelId', 'channel.channelSecret',
      'editor.heading', 'editor.template', 'plugin.name',
      'template.picker.group.compact', 'template.picker.group.large',
    ]
    const suspicious = Object.entries(MESSAGES.th)
      .filter(([key, value]) => !/[฀-๿]/.test(value) && !DELIBERATE_LOANWORDS.includes(key))
      .map(([key]) => key)
      .sort()
    expect(suspicious).toEqual([])
  })

  /**
   * `chatBar.defaultLabel` ไหลลงช่องที่ถูก schema จำกัดไว้ที่ 14 ตัวอักษร (ข้อจำกัดของ LINE)
   * แอป Strapi ทับคำแปลของปลั๊กอินได้เป็นเรื่องปกติ — คำแปลทับที่ยาว 20 ตัวจะทำให้ผู้ใช้ได้
   * error `too_big` ที่ชี้ไปยังช่องที่เขาแก้ไม่ได้ เพราะมันถูก disable ไว้ในโหมด default
   */
  it('chatBar.defaultLabel ยาวไม่เกิน 14 ตัวทั้งสองภาษา — เพดานของ LINE เอง', () => {
    for (const locale of ['en', 'th'] as const) {
      expect(MESSAGES[locale]['chatBar.defaultLabel']!.length, locale).toBeLessThanOrEqual(14)
    }
  })
```

**ค.** เพิ่มเทสต์นี้เข้า `packages/ui/tests/image-field.test.tsx`

```tsx
  /**
   * `ImageField` เคยถือ error ของตัวเองไว้ ต่างจากพี่น้องทุกตัวที่รับมาเป็นพร็อพ ผลคือ
   * `applyTemplate` เคลียร์มันไม่ได้: อัปรูปผิดสัดส่วน แล้วสลับจาก large เป็น compact
   * แบนเนอร์ยังอ่านว่า "ต้องเป็นสัดส่วนของ template (2500×1686)" ทั้งที่ตอนนี้ template
   * เป็น 2500×843 ไปแล้ว — ข้อมูลที่ผิดจริง ไม่ใช่แค่ค้าง
   */
  it('error ที่ค้างอยู่ถูกล้างเมื่อ template เปลี่ยน', async () => {
    const onErrorChange = vi.fn()
    const { rerender } = render(
      <PortProvider value={createStubPort({ t: (k, v) => `${k}:${v?.['expected'] ?? ''}` })}>
        <ImageField
          value={null}
          size={{ width: 2500, height: 1686 }}
          disabled={false}
          onChange={() => {}}
          error="image.error.ratio:2500×1686"
          onErrorChange={onErrorChange}
        />
      </PortProvider>,
    )
    expect(screen.getByText('image.error.ratio:2500×1686')).toBeInTheDocument()

    rerender(
      <PortProvider value={createStubPort({ t: (k, v) => `${k}:${v?.['expected'] ?? ''}` })}>
        <ImageField
          value={null}
          size={{ width: 2500, height: 843 }}
          disabled={false}
          onChange={() => {}}
          onErrorChange={onErrorChange}
        />
      </PortProvider>,
    )
    expect(screen.queryByText('image.error.ratio:2500×1686')).toBeNull()
  })

  it('error ที่เกิดจากการอัปโหลดถูกรายงานขึ้นไปให้ผู้เรียก ไม่ใช่เก็บไว้เอง', async () => {
    const onErrorChange = vi.fn()
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <ImageField
          value={null}
          size={{ width: 2500, height: 1686 }}
          disabled={false}
          onChange={() => {}}
          onErrorChange={onErrorChange}
        />
      </PortProvider>,
    )
    const file = new File(['x'], 'a.gif', { type: 'image/gif' })
    fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file] } })
    await waitFor(() => expect(onErrorChange).toHaveBeenCalledWith('image.error.format'))
  })
```

**ง.** เพิ่มเทสต์นี้เข้า `packages/ui/tests/template-picker.test.tsx`

```tsx
  /**
   * `<span data-testid>` ที่อยู่ **ข้างใน** `ui.Button` คือรูปแบบต้องห้ามที่ตั้งอยู่ข้าง ๆ
   * รูปแบบที่ถูกต้อง (`testId` บนตัว Button เอง) — วันนี้ไม่มีอะไรผิดเพราะไม่มีเทสต์ไหน
   * `toBeDisabled()` กับสองปุ่มนั้น แต่นั่นคือวิธีที่รูปแบบผิดแพร่กระจาย
   */
  it('testid ทุกตัวอยู่บนปุ่มที่กดได้จริง ไม่ใช่บน span ข้างใน', () => {
    openPicker()
    fireEvent.click(screen.getByTestId('template-option-RICH_MENU_TEMPLATE_205'))
    fireEvent.click(screen.getByTestId('template-apply'))
    for (const id of ['template-confirm', 'template-cancel-confirm']) {
      expect(screen.getByTestId(id).tagName, id).toBe('BUTTON')
    }
  })
```

`openPicker()` คือ helper ที่ไฟล์นี้มีอยู่แล้ว ถ้าชื่อไม่ตรงให้ใช้ตัวที่มีจริงในไฟล์ และเงื่อนไขที่ทำให้กล่องยืนยันโผล่คือ "มี action ที่กรอกไว้แล้วหรือมีรูปแล้ว" — ตั้ง fixture ตามที่ไฟล์นั้นทำอยู่

**จ.** เพิ่มเทสต์นี้เข้า `packages/ui/tests/canvas-editor.test.tsx`

```tsx
  /**
   * ค่านี้มาจากเซิร์ฟเวอร์วันนี้ จึงเป็นการป้องกันเชิงลึก ไม่ใช่รูรั่วที่เปิดอยู่ — แต่ `")` ตัวเดียว
   * ในชื่อไฟล์ก็หลุดออกจาก token `url()` ได้แล้ว และ upload provider ที่ผู้ใช้เลือกเองเป็นคน
   * ตัดสินว่า url หน้าตาเป็นยังไง ไม่ใช่เรา
   */
  it('imageUrl ถูก escape ก่อนใส่ใน url() — `")` ไม่หลุดออกจาก token', () => {
    render(
      <CanvasEditor
        size={{ width: 2500, height: 1686 }}
        bounds={[{ x: 0, y: 0, width: 100, height: 100 }]}
        showOutlines={false}
        activeIndex={null}
        onSelect={() => {}}
        imageUrl={'/uploads/a").evil("b.jpg'}
      />,
    )
    const background = screen.getByTestId('rich-menu-canvas').style.backgroundImage
    // quote ในค่าถูกแปลงเป็น %22 แล้ว เหลือ `"` แค่คู่เปิด-ปิดของ token เท่านั้น
    expect(background).toContain('%22')
    expect(background.match(/"/g)).toHaveLength(2)
    // และยังเหลือ url( ชุดเดียว ไม่ใช่สองชุดที่เกิดจากการหลุดออกจาก token
    expect(background.match(/url\(/g)).toHaveLength(1)
  })
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project ui
```

- [ ] **Step 3: implement**

`packages/ui/src/components/ImageField.tsx` — ย้าย error ออกไปเป็นพร็อพ

```ts
export interface ImageFieldProps {
  value: UploadedImage | null
  size: RichMenuSize
  /** ปิดไว้จนกว่าจะเลือก template — เหมือนปุ่ม Image ของ LINE OA Manager */
  disabled: boolean
  onChange(next: UploadedImage | null): void
  /**
   * error ถูกถือไว้โดยผู้เรียก ไม่ใช่โดย component นี้ — เหมือนพี่น้องทุกตัวในโฟลเดอร์เดียวกัน
   *
   * เหตุผลไม่ใช่ความสม่ำเสมอเชิงสไตล์: `applyTemplate` ในหน้า editor ต้องล้างมันได้เมื่อขนาด
   * ผืนผ้าใบเปลี่ยน ถ้า component ถือไว้เอง แบนเนอร์ "ต้องเป็นสัดส่วน 2500×1686" จะค้างอยู่
   * ทั้งที่ template ปัจจุบันเป็น 2500×843 ไปแล้ว ซึ่งเป็นข้อมูลที่ผิดจริง ไม่ใช่แค่เก่า
   */
  error?: string
  onErrorChange?(message: string | null): void
}
```

แล้วแทนที่ `const [error, setError] = useState<string | null>(null)` ด้วย

```tsx
  const setError = (message: string | null) => { onErrorChange?.(message) }
```

และเปลี่ยนบรรทัดสุดท้ายที่วาด error เป็น

```tsx
      {error === undefined ? null : <ui.Alert variant="danger">{error}</ui.Alert>}
```

`packages/ui/src/pages/RichMenuEditor.tsx` — ถือ error ไว้แทน

```tsx
  const [imageError, setImageError] = useState<string | null>(null)
```

ส่งเข้า `ImageField`

```tsx
            <ImageField
              value={draft.image}
              size={size}
              disabled={draft.templateKey === null}
              onChange={(next) => setDraft((prev) => ({ ...prev, image: next }))}
              onErrorChange={setImageError}
              {...(imageError === null ? {} : { error: imageError })}
            />
```

และล้างมันใน `applyTemplate` ต่อจาก `setFormError(null)`

```tsx
    // ข้อความ "ต้องเป็นสัดส่วนของ template (WxH)" ผูกกับขนาดของ template ตัวเดิม การเปลี่ยน
    // template ทำให้มันกลายเป็นข้อมูลที่ผิด ไม่ใช่แค่เก่า — ต้องหายไปพร้อมกัน
    setImageError(null)
```

`packages/ui/src/components/TemplatePicker.tsx` — ย้าย testid สองตัวขึ้นไปบนปุ่ม

```tsx
            <ui.Button variant="secondary" testId="template-cancel-confirm" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </ui.Button>
            <ui.Button variant="danger" testId="template-confirm" onClick={() => onApply(selected!)}>
              {t('template.picker.confirmDiscard')}
            </ui.Button>
```

`packages/ui/src/components/CanvasEditor.tsx` — escape ค่าใน `url()`

```tsx
/**
 * `url("...")` แบบมี quote คือรูปที่ escape ได้จริง — CSS ยอมให้ใส่ `\"` ข้างใน string ได้
 * ส่วนรูปไม่มี quote (`url(x)`) ไม่มีทาง escape เลย ตัวอักษรอย่าง `")` จึงปิด token ทิ้ง
 * แล้วสิ่งที่ตามมาถูกอ่านเป็น CSS ต่อ วันนี้ค่านี้มาจากเซิร์ฟเวอร์จึงเป็นการป้องกันเชิงลึก
 * แต่ url ที่ผู้ใช้ได้รับมาจาก upload provider ที่เขาเลือกเอง ไม่ใช่จากเรา
 */
const cssUrl = (value: string): string =>
  `url("${value.replace(/[\\"]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}")`
```

แล้วเปลี่ยนบรรทัดที่ 93 เป็น

```tsx
    ...(imageUrl === undefined ? {} : { backgroundImage: cssUrl(imageUrl) }),
```

- [ ] **Step 4: เขียว**

```bash
pnpm test --project ui && pnpm typecheck && pnpm lint
```

- [ ] **Step 5: ตรวจว่าไม่มีอะไรพังฝั่ง adapter**

```bash
pnpm test && pnpm build
```

- [ ] **Step 6: commit**

```bash
git add packages/ui
git commit -m "fix(ui): stop showing a stale image error and make three weak guards real"
```

---

## Task 13: metadata ของแพ็กเกจ · core/ui เป็น private · changesets

**Files:**
- Modify: `packages/core/package.json`, `packages/ui/package.json`, `packages/strapi-v4/package.json`, `packages/strapi-v5/package.json`, `package.json` (root)
- Create: `.changeset/config.json`, `.changeset/README.md`, `docs/RELEASING.md`
- Test: `packages/strapi-v4/tests/package-shape.test.ts` (เพิ่ม describe), `packages/strapi-v5/tests/package-shape.test.ts` (เพิ่ม describe), `packages/core/tests/package-shape.test.ts` (สร้างใหม่)

**Interfaces:**
- Produces: `.changeset/config.json` ที่ `fixed` ผูกสองแพ็กเกจปลั๊กอินไว้ด้วยกัน · `pnpm changeset` / `pnpm changeset version` / `pnpm release` ที่รันได้

**คำตัดสินที่ task นี้บังคับใช้:** carry-forward เขียนไว้ว่า `packages/core` และ `packages/ui` ขาด `publishConfig.access: "public"` และนั่นทำให้ `npm publish` ล้มสำหรับแพ็กเกจที่มี scope — จริงทั้งสองประโยค แต่ Plan 03 ตัดสินใจไปแล้วว่า **ทั้งสองแพ็กเกจจะถูกรวมเข้าบันเดิลของ adapter ไม่ปล่อยขึ้น npm** (ดูคอมเมนต์ใน `packages/strapi-v4/tsup.config.ts`) ทางแก้ที่ตรงกับความจริงจึงไม่ใช่การเติม `publishConfig` แต่คือ `"private": true` ซึ่งทำให้ `npm publish` **ล้มโดยตั้งใจ** และทำให้ changesets ข้ามมันไปเอง ผลพลอยได้: ข้อที่ carry-forward บันทึกว่า "`packages/ui` ลาก `sharp` เข้ากราฟการติดตั้งของทุกผู้บริโภค" หายไปทั้งข้อ เพราะไม่มีผู้บริโภคคนไหนติดตั้งสองแพ็กเกจนี้อีกแล้ว

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`packages/core/tests/package-shape.test.ts` (ไฟล์ใหม่ — ครอบทั้ง core และ ui เพราะทั้งคู่มีข้อบังคับชุดเดียวกัน)

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relative: string) =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8')) as {
    name?: string
    private?: boolean
    publishConfig?: { access?: string }
    scripts?: Record<string, string>
  }

const INTERNAL = [
  ['core', read('../package.json')],
  ['ui', read('../../ui/package.json')],
] as const

/**
 * สองแพ็กเกจนี้เป็นการแบ่งโค้ดภายในระหว่าง adapter v4/v5 ไม่ใช่ API สาธารณะ — Plan 03
 * ตัดสินใจไว้แล้วว่าจะรวมเข้าบันเดิลของ adapter แทนที่จะปล่อยขึ้น npm (ดูคอมเมนต์ใน
 * packages/strapi-v4/tsup.config.ts) `private: true` คือการเขียนคำตัดสินนั้นลงในไฟล์
 * ที่เครื่องมืออ่าน ไม่ใช่แค่ในคอมเมนต์: `npm publish` จะล้มทันที และ changesets จะข้ามมันเอง
 *
 * ทางเลือกที่ carry-forward เสนอ (`publishConfig.access: "public"`) ตั้งอยู่บนสมมติฐานว่า
 * ทั้งสองจะถูกปล่อย ซึ่งไม่ใช่แผนอีกต่อไปแล้ว
 */
describe('แพ็กเกจภายในต้องปล่อยขึ้น npm ไม่ได้', () => {
  for (const [label, pkg] of INTERNAL) {
    it(`${label} ประกาศ private`, () => {
      expect(pkg.private).toBe(true)
    })

    it(`${label} ไม่มี publishConfig ที่ขัดกับ private`, () => {
      expect(pkg.publishConfig).toBeUndefined()
    })

    it(`${label} ไม่มี script ที่รันตอนติดตั้ง (สเปก §11.6)`, () => {
      const forbidden = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']
      expect(forbidden.filter((name) => (pkg.scripts ?? {})[name] !== undefined)).toEqual([])
    })
  }
})
```

เพิ่ม describe นี้เข้า **ทั้งสอง** ไฟล์ `packages/strapi-v4/tests/package-shape.test.ts` และ `packages/strapi-v5/tests/package-shape.test.ts` (ตัวแปร `pkg` มีอยู่แล้วในทั้งสองไฟล์ ให้ขยาย type annotation ของมันด้วย)

```ts
/**
 * เมทาดาทาที่หน้าแพ็กเกจบน npm แสดงและที่ผู้ใช้ใช้ตัดสินใจว่าจะติดตั้งไหม — carry-forward
 * บันทึกว่าทั้งสี่ฟิลด์ยังไม่มีในแพ็กเกจไหนเลย
 *
 * `publishConfig.access` เป็น no-op สำหรับแพ็กเกจที่ไม่มี scope (unscoped เป็น public
 * โดยปริยาย) — ประกาศไว้เพราะความล้มเหลวที่มันกันคือ "วันที่มีคนย้ายไปใช้ scope" ซึ่งจะทำให้
 * `npm publish` ล้มด้วย 402 Payment Required ที่อ่านแล้วไม่มีใครเดาถูกว่าต้องแก้ที่ไหน
 */
describe('เมทาดาทาที่ต้องมีก่อนปล่อย 1.0.0', () => {
  it('มี description, author, repository, homepage, bugs และ keywords ครบ', () => {
    expect(pkg.description).toBeTypeOf('string')
    expect(pkg.description!.length).toBeGreaterThan(20)
    expect(pkg.author).toBeTypeOf('string')
    expect(pkg.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/captainkie/strapi-plugin-line-rich-menu.git',
      directory: expect.stringMatching(/^packages\/strapi-v[45]$/),
    })
    expect(pkg.homepage).toBe('https://github.com/captainkie/strapi-plugin-line-rich-menu#readme')
    expect(pkg.bugs).toEqual({ url: 'https://github.com/captainkie/strapi-plugin-line-rich-menu/issues' })
    expect(pkg.keywords).toEqual(expect.arrayContaining(['strapi', 'strapi-plugin', 'line', 'rich-menu']))
  })

  it('ประกาศ publishConfig.access เป็น public', () => {
    expect(pkg.publishConfig).toEqual({ access: 'public' })
  })

  it('ไม่ได้ private — สองตัวนี้คือของที่ปล่อยจริง', () => {
    expect(pkg.private).not.toBe(true)
  })

  it('สัญญาอนุญาตเป็น AGPL-3.0-only ตรงกับที่ LICENSE ในแพ็กเกจเป็น', () => {
    expect(pkg.license).toBe('AGPL-3.0-only')
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project core --project strapi-v4 --project strapi-v5
```

- [ ] **Step 3: implement**

เพิ่ม `"private": true` เข้า `packages/core/package.json` และ `packages/ui/package.json` (บรรทัดถัดจาก `"version"`)

เพิ่มเข้า `packages/strapi-v4/package.json`

```json
  "author": "Fosivo Labs Co., Ltd. <https://fosivo.com>",
  "homepage": "https://github.com/captainkie/strapi-plugin-line-rich-menu#readme",
  "bugs": { "url": "https://github.com/captainkie/strapi-plugin-line-rich-menu/issues" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/captainkie/strapi-plugin-line-rich-menu.git",
    "directory": "packages/strapi-v4"
  },
  "keywords": ["strapi", "strapi-plugin", "line", "rich-menu", "line-messaging-api", "line-oa"],
  "publishConfig": { "access": "public" },
```

และชุดเดียวกันเข้า `packages/strapi-v5/package.json` โดยเปลี่ยน `directory` เป็น `"packages/strapi-v5"`

`.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "captainkie/strapi-plugin-line-rich-menu" }],
  "commit": false,
  "fixed": [["strapi-plugin-line-rich-menu", "strapi-plugin-line-rich-menu-v4"]],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

`fixed` ไม่ใช่ `linked`: สเปก §17 บรรทัด "กลยุทธ์ปล่อย" เขียนว่า **1.0.0 เต็มทีเดียว ทั้ง v4 และ v5** ซึ่งแปลว่าเลขเวอร์ชันของสองแพ็กเกจต้องเท่ากันเสมอ ไม่ใช่แค่ขยับพร้อมกันเมื่อบังเอิญมีการเปลี่ยนแปลงทั้งคู่ — `linked` ให้อย่างหลัง `fixed` ให้อย่างแรก ผู้ใช้ที่เห็น v4 เป็น 1.2.0 กับ v5 เป็น 1.4.0 จะไม่มีทางรู้ว่าสองตัวนี้คือของชุดเดียวกัน

`ignore` เป็นอาเรย์ว่างโดยตั้งใจ — `packages/core` กับ `packages/ui` ถูกข้ามเพราะ `private: true` ไม่ใช่เพราะรายชื่อในไฟล์นี้ ซึ่งเป็นกลไกที่แข็งแรงกว่าเพราะมันบังคับที่ `npm publish` ด้วย ไม่ใช่แค่ที่ changesets

`.changeset/README.md`

```md
# Changesets

Every change that reaches a published package needs a changeset. Run `pnpm changeset`,
pick the packages, pick the bump, and describe the change in one sentence a plugin user
would understand — not one a maintainer would.

`strapi-plugin-line-rich-menu` and `strapi-plugin-line-rich-menu-v4` are **fixed** together:
they always carry the same version number, because they are one product built twice for two
incompatible Strapi majors. Bumping one bumps the other.

`@fosivo/line-rich-menu-core` and `@fosivo/line-rich-menu-ui` are `private` and are bundled
into both plugins at build time. They are never published, so they never need a changeset.
```

ติดตั้งและเพิ่ม script ที่ root `package.json`

```bash
pnpm add -D -w @changesets/cli @changesets/changelog-github
```

```json
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "pnpm build && changeset publish"
```

`release` ต้อง build ก่อน publish เสมอ — `files` ของทั้งสองแพ็กเกจมีแต่ `dist` การ publish โดยไม่ build จะปล่อย tarball ที่ไม่มีโค้ดอยู่ข้างในเลย และ npm ไม่ได้บ่นอะไรกับเรื่องนั้น

`docs/RELEASING.md`

````md
# Releasing

Two commands in this document are the owner's to run, not CI's, not an agent's:
`npm publish` (via `pnpm release`) and making the repository public. Everything else
below is automated or verifiable ahead of time.

## Before tagging

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck && pnpm lint && pnpm test:coverage`
3. `pnpm build` — the only command that exercises `resolveJsonModule` through tsup's
   `dts: true`, and the only one that produces what `check:deps` and `verify` inspect
4. `pnpm check:deps && pnpm verify`
5. `pnpm e2e:v4 && pnpm e2e:v5`
6. **Check the last nightly mutation run was green.** Mutation testing runs nightly and
   after merge to `main`, never on a pull request — it is far too slow to gate one. That
   means a PR that guts assertions merges green and only breaks the run afterwards. The
   nightly result is therefore a release gate, not background noise:
   `gh run list --workflow ci.yml --json conclusion,name -q '.[] | select(.name=="mutation")' | head -1`

## Publishing (owner only)

```sh
pnpm changeset            # describe the release
pnpm version-packages     # writes versions + CHANGELOG
git commit -am "chore(release): 1.0.0" && git tag v1.0.0
git push --follow-tags
```

The `release` workflow takes it from there: it builds, verifies, and runs
`changeset publish` with `--provenance` under GitHub Actions OIDC. Provenance requires a
**public** repository — on a private one npm rejects the attestation and the publish fails.

To publish by hand instead:

```sh
NPM_CONFIG_PROVENANCE=true pnpm release
```

## After the repository goes public

Three things start working on their own or with one command:

- **CodeQL** — the job in `ci.yml` is gated on `github.event.repository.visibility == 'public'`
  and skips today. GitHub Advanced Security is organisation-only, so it cannot run on a
  personal-account private repo at any price. It begins running by itself.
- **Branch protection** — `.github/rulesets/main.json` is committed but not applied, because
  rulesets are refused on private repos owned by a personal account on the Free plan.
  Apply it once: `gh api -X POST repos/captainkie/strapi-plugin-line-rich-menu/rulesets --input .github/rulesets/main.json`
  Read `.github/rulesets/README.md` first — it explains why zero required approvals is
  correct for a sole maintainer and why `mutation` must never be a required check.
- **npm provenance** — see above.
````

- [ ] **Step 4: เขียว**

```bash
pnpm test && pnpm typecheck
npx changeset status 2>&1 | head -5
```

- [ ] **Step 5: commit**

```bash
git add packages .changeset package.json pnpm-lock.yaml docs/RELEASING.md
git commit -m "chore(release): add package metadata, changesets and the release checklist"
```

---

## Task 14: README — หน้าร้านของทั้งโปรเจกต์

**Files:**
- Create: `README.md`, `docs/screenshots/.gitkeep`, `docs/vitest.config.ts`, `docs/tests/readme.test.ts`, `examples/v4-app/tests/screenshots.spec.ts`, `examples/v4-app/scripts/screenshots.sh`
- Modify: `vitest.config.ts` (root — เพิ่ม project `docs`), `eslint.config.js` (แคบ ignore ของ docs), `package.json` (root — script `screenshots`), `examples/v4-app/playwright.config.ts`, `packages/strapi-v4/package.json`, `packages/strapi-v5/package.json`, `.gitignore`
- Test: `docs/tests/readme.test.ts` ผ่าน vitest project ใหม่ชื่อ `docs`

**Interfaces:**
- Consumes: `examples/v4-app` ที่บูตได้แล้ว (Task 10 ของ Plan 03)
- Produces: `docs/screenshots/{list,editor,channel,rbac}.png` · `README.md` · `pnpm screenshots`

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`tools/preview/vitest.config.ts` มีอยู่แล้วสำหรับ project อื่น — สร้าง project เล็ก ๆ สำหรับเอกสารแทนที่จะยัดเทสต์นี้เข้าแพ็กเกจใดแพ็กเกจหนึ่ง

`docs/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'

// เอกสารเป็นสิ่งที่ผู้ใช้เห็นก่อนโค้ดเสมอ — ปล่อยให้มันผิดได้เงียบ ๆ แปลว่าคนที่ตัดสินใจติดตั้ง
// ตัดสินใจจากข้อมูลที่ผิด project นี้จึงมีเทสต์ของตัวเองเหมือนแพ็กเกจอื่น
export default defineConfig({
  test: {
    name: 'docs',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

เพิ่ม `'docs/vitest.config.ts'` เข้า `projects` ใน `vitest.config.ts` ที่ root

และแคบ ignore ของ ESLint ลง — บล็อกแรกใน `eslint.config.js` ปัจจุบันเขียนว่า `ignores: [..., 'docs/**']` ซึ่งจะกลืนไฟล์เทสต์ตัวใหม่ไปด้วย เปลี่ยนเป็น

```js
  // docs/superpowers/ เก็บสเปกและแผน ไม่ใช่ซอร์ส — ส่วน docs/tests/ กับ docs/vitest.config.ts
  // เป็นโค้ดจริงที่ต้องถูก lint เหมือนทุกไฟล์ในรีโป การ ignore ทั้ง docs/** จะยกเว้นมันไปด้วย
  { ignores: ['**/dist/**', '**/coverage/**', '**/.stryker-tmp/**', 'docs/superpowers/**', 'docs/screenshots/**'] },
```

`docs/tests/readme.test.ts`

```ts
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const readme = readFileSync(`${root}README.md`, 'utf8')

describe('README — สิ่งที่ผู้ใช้เห็นก่อนตัดสินใจติดตั้ง', () => {
  it('บอกชื่อแพ็กเกจของทั้งสองเวอร์ชัน พร้อมคำสั่งติดตั้งที่ก๊อปไปวางได้', () => {
    expect(readme).toContain('npm install strapi-plugin-line-rich-menu')
    expect(readme).toContain('npm install strapi-plugin-line-rich-menu-v4')
  })

  // สเปก §2.1 — v4 เป็นสะพานระหว่างรอ migrate ไม่ใช่เหตุผลให้อยู่ v4 ต่อ
  it('บอกว่า Strapi 4 หมดอายุการสนับสนุนแล้วและปลั๊กอิน v4 คือสะพาน', () => {
    expect(readme).toMatch(/end of life|EOL/i)
    expect(readme).toMatch(/30 April 2026|2026-04-30/)
  })

  it('มีภาพหน้าจอที่มีอยู่จริงบนดิสก์ ไม่ใช่ลิงก์เสีย', () => {
    const images = [...readme.matchAll(/!\[[^\]]*\]\((docs\/screenshots\/[^)]+)\)/g)].map((m) => m[1]!)
    expect(images.length, 'README ต้องมีภาพหน้าจออย่างน้อยสามภาพ').toBeGreaterThanOrEqual(3)
    for (const image of images) {
      expect(existsSync(`${root}${image}`), image).toBe(true)
    }
  })

  it('อธิบายสัญญาอนุญาตคู่ AGPL-3.0 + commercial และลิงก์ไปทั้งสองไฟล์', () => {
    expect(readme).toContain('AGPL-3.0')
    expect(readme).toMatch(/\(LICENSE\)/)
    expect(readme).toMatch(/\(COMMERCIAL-LICENSE\.md\)/)
    expect(readme).toMatch(/commercial licen[cs]e/i)
  })

  it('มีส่วนรับบริจาค', () => {
    expect(readme).toMatch(/^##+ .*(Support|Donate|สนับสนุน)/mi)
  })

  /**
   * สี่ข้อนี้เป็นข้อจำกัดที่ Plan 03 ตัดสินใจรับไว้พร้อมเงื่อนไขว่า "ต้องอยู่ใน README" —
   * ผู้ใช้ที่ไม่รู้ล่วงหน้าจะไปเจอตอนมันพัง ซึ่งเป็นตอนที่แพงที่สุดสำหรับเขา
   */
  it('บอกข้อจำกัดที่รู้อยู่ครบสี่ข้อ', () => {
    expect(readme, 'รูปที่บีบยากอาจใช้เวลาเกิน 10 วินาทีตอน save').toMatch(/10 seconds|proxy timeout/i)
    expect(readme, 'rate limiter เป็น in-memory ต่อ process').toMatch(/in-memory|per process/i)
    expect(readme, 'ตัวอย่าง curl ของ /schedules/tick พร้อม header').toContain('/line-rich-menu/schedules/tick')
    expect(readme, 'aliasId unique ต่อ channel บังคับที่ชั้น application').toMatch(/alias/i)
  })

  it('ตัวอย่าง curl ของ tick มี Authorization header — ไม่งั้นคนที่ก๊อปไปใช้จะเจอ 403 โดยไม่รู้สาเหตุ', () => {
    const block = /curl[^`]*\/line-rich-menu\/schedules\/tick[^`]*/s.exec(readme)?.[0] ?? ''
    expect(block).toContain('Authorization: Bearer')
  })

  it('มีตารางเทียบว่าแพ็กเกจไหนใช้กับ Strapi เวอร์ชันไหน', () => {
    expect(readme).toMatch(/\^?5\.\d|Strapi 5/)
    expect(readme).toMatch(/4\.25/)
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project docs
```

คาดว่าล้มด้วย `ENOENT: no such file or directory, open '.../README.md'`

- [ ] **Step 3: ถ่ายภาพหน้าจอด้วย Playwright ไม่ใช่แคปมือ**

`examples/v4-app/tests/screenshots.spec.ts`

```ts
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

/**
 * ภาพใน README ถ่ายด้วยสคริปต์ ไม่ใช่แคปมือ — ภาพที่แคปมือจะล้าสมัยเงียบ ๆ ทุกครั้งที่ UI
 * เปลี่ยน และไม่มีใครรู้จนกว่าจะมีคนบ่น ส่วนภาพที่ถ่ายด้วยสคริปต์ถูกถ่ายใหม่ด้วยคำสั่งเดียว
 * และเทสต์ใน docs/tests/readme.test.ts บังคับว่าไฟล์ต้องมีอยู่จริง
 *
 * ไฟล์นี้ไม่ได้อยู่ในชุด acceptance (playwright.config.ts จับเฉพาะ acceptance.spec.ts ด้วย
 * `testMatch` ที่เพิ่มใน Step นี้) — มันถูกเรียกจาก scripts/screenshots.sh เท่านั้น
 */
const OUT = fileURLToPath(new URL('../../../docs/screenshots/', import.meta.url))
const ADMIN = { email: process.env['E2E_ADMIN_EMAIL']!, password: process.env['E2E_ADMIN_PASSWORD']! }

async function login(page: Page): Promise<void> {
  await page.goto('/admin/auth/login')
  await page.locator('input[name="email"]').fill(ADMIN.email)
  await page.locator('input[name="password"]').fill(ADMIN.password)
  await page.getByRole('button', { name: /login/i }).click()
  await expect(page).not.toHaveURL(/\/admin\/auth\//, { timeout: 20_000 })
}

test('ถ่ายภาพสี่ภาพที่ README ใช้', async ({ page }) => {
  await mkdir(OUT, { recursive: true })
  // ขนาดคงที่เพื่อให้ภาพชุดถัดไปเทียบกับชุดนี้ได้ตรง ๆ ใน diff
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)

  await page.goto('/admin/plugins/line-rich-menu')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.screenshot({ path: `${OUT}list.png` })

  await page.goto('/admin/plugins/line-rich-menu/rich-menus/new')
  await expect(page.getByTestId('open-template-picker')).toBeVisible()
  await page.screenshot({ path: `${OUT}editor.png`, fullPage: true })

  await page.getByTestId('open-template-picker').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: `${OUT}templates.png` })
  await page.keyboard.press('Escape')

  await page.goto('/admin/settings/line-rich-menu')
    .catch(async () => { await page.goto('/admin/plugins/line-rich-menu') })
  await page.screenshot({ path: `${OUT}channel.png` })
})
```

`examples/v4-app/scripts/screenshots.sh` — คัดลอกจาก `examples/v4-app/scripts/e2e.sh` ทั้งไฟล์ แล้วเปลี่ยนสองบรรทัดสุดท้าย

```bash
step "ถ่ายภาพหน้าจอ"
export E2E_TMPDIR="$TMPDIR"
npx playwright install chromium >/dev/null 2>&1 || npx playwright install --with-deps chromium
npx playwright test tests/screenshots.spec.ts
```

และเพิ่ม `testMatch` เข้า `examples/v4-app/playwright.config.ts` เพื่อไม่ให้ชุด acceptance หยิบไฟล์ภาพหน้าจอไปรันด้วย

```ts
  testDir: './tests',
  // ภาพหน้าจอถูกถ่ายด้วยสคริปต์แยก (scripts/screenshots.sh) ไม่ใช่ส่วนหนึ่งของ acceptance gate
  // — มันช้า ใช้ viewport คงที่ และล้มด้วยเหตุผลที่ไม่เกี่ยวกับความถูกต้องของปลั๊กอิน
  testMatch: process.env['E2E_SCREENSHOTS'] === '1' ? '**/screenshots.spec.ts' : '**/acceptance.spec.ts',
```

โดยใน `screenshots.sh` ต้อง `export E2E_SCREENSHOTS=1` ก่อนเรียก playwright

เพิ่ม script ที่ root `package.json`

```json
    "screenshots": "bash examples/v4-app/scripts/screenshots.sh",
```

รัน

```bash
pnpm screenshots
ls -la docs/screenshots/
```

- [ ] **Step 4: เขียน README**

`README.md`

````md
# LINE Rich Menu for Strapi

Design, schedule and publish [LINE](https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/)
rich menus from inside the Strapi admin panel — templates, a drag-and-drop canvas, multi-tab
menus via aliases, scheduled display periods, and a publish path that cleans up after itself
when LINE says no.

![The rich menu list](docs/screenshots/list.png)

## Which package do I install?

| Your Strapi | Package | Status |
|---|---|---|
| 5.x | `strapi-plugin-line-rich-menu` | The one to use |
| 4.25.x | `strapi-plugin-line-rich-menu-v4` | A bridge while you migrate |

Strapi 4 reached **end of life on 30 April 2026** — no more security patches, from anyone,
at any price. The v4 package exists because paying customers are still running 4.25.x, not
because staying on 4 is a reasonable place to build something new. It is npm-only and will
not be listed on the Strapi Marketplace.

```sh
# Strapi 5
npm install strapi-plugin-line-rich-menu

# Strapi 4.25.x
npm install strapi-plugin-line-rich-menu-v4
```

## Configure

`config/plugins.js`

```js
module.exports = ({ env }) => ({
  'line-rich-menu': {
    enabled: true,
    config: {
      // AES-256-GCM key for channel access tokens at rest.
      // Omit it and the plugin derives one from APP_KEYS[0] instead.
      encryptionKey: env('LINE_RM_ENCRYPTION_KEY'),
      scheduler: { enabled: true, cron: '* * * * *', lockTtlMs: 300000 },
    },
  },
})
```

Then give a role the four permissions under **Settings → Roles → Plugins → LINE Rich Menu**:

| Permission | Lets a user |
|---|---|
| `read` | See menus and channels — token previews only, never the token |
| `write` | Create and edit drafts |
| `publish` | Push to LINE, set the default menu, run reconcile |
| `settings` | Add channels and paste access tokens |

`settings` is deliberately separate from `publish`: you can let someone ship menus without
ever letting them see the LINE OA's access token.

![The editor](docs/screenshots/editor.png)
![Template picker](docs/screenshots/templates.png)

## Known limits

Four things worth knowing before you find them the hard way.

**Images are normalised when you save, not when you publish.** A hard-to-compress image
walks the whole size ladder through mozjpeg; several composed areas can take **over 10
seconds** inside one `POST /line-rich-menu/menus`. If you sit behind a proxy with a short
timeout, raise it. Doing this work in a queue would change that endpoint's contract to
`202 Accepted`, which is a 1.x change, not a patch.

**The publish rate limiter is in-memory, per process.** Run three instances and you get
three times the ceiling. That is still far below LINE's own limit, so it protects you from
a stuck retry loop rather than from LINE.

**`aliasId` is unique per channel, enforced in the application, not the database.** Two
simultaneous requests using the same alias can in theory both pass the check. Closing that
properly needs a hand-written unique index.

**Running the scheduler yourself.** Set `scheduler.enabled: false` if you run several
instances or a serverless deployment, then drive it from outside. The endpoint is an admin
route like every other one — no exceptions (that is a security decision, not an oversight),
so it needs an admin API token:

```sh
curl -X POST https://your-strapi.example.com/line-rich-menu/schedules/tick \
  -H "Authorization: Bearer $STRAPI_ADMIN_API_TOKEN" \
  -H 'Content-Type: application/json' -d '{}'
```

## Licence

Dual-licensed.

- **[AGPL-3.0](LICENSE)** by default. Self-host it, modify it, ship it — but if you run a
  modified version as a network service, the people using that service get its source.
  A Strapi instance is network software, so the AGPL's network clause is the operative one.
- **[Commercial](COMMERCIAL-LICENSE.md)** if you need to embed it in a closed-source
  product, run it inside a hosted Strapi you offer to others without publishing your
  changes, or ship it to a client as part of a closed deliverable.

Contact **Fosivo Labs Co., Ltd.** — <https://fosivo.com>

## Support this work

This plugin is free under the AGPL and will stay that way. If it saved you a week, you can
say thanks:

- [GitHub Sponsors](https://github.com/sponsors/captainkie)
- [Buy Me a Coffee](https://buymeacoffee.com/captainkie)
- Or buy a [commercial licence](COMMERCIAL-LICENSE.md) — that funds it directly

Bug reports and reproductions are worth as much as money and take less of it.

## Development

```sh
pnpm install
pnpm test          # 600+ unit tests, no Strapi booted
pnpm build
pnpm e2e:v4        # boots Strapi 4.25.11 against a mock LINE API
pnpm e2e:v5        # boots Strapi 5.52.1 against the same mock
```

`docs/RELEASING.md` has the release checklist. `docs/DEMO.md` has the demo deployment.
````

ทั้งสองแพ็กเกจต้องมี README ของตัวเองด้วย เพราะ npm แสดง README ของแพ็กเกจ ไม่ใช่ของ repo ให้ทำ symlink ไม่ได้ (npm ไม่ตาม symlink ตอน pack) ใช้การคัดลอกในขั้น build แทน โดยเพิ่ม `"README.md"` เข้า `files` ของทั้งสองแพ็กเกจ แล้วเพิ่มขั้นนี้เข้า `docs/RELEASING.md` ใต้ "Before tagging" ข้อ 3

```sh
cp README.md packages/strapi-v4/README.md
cp README.md packages/strapi-v5/README.md
```

และเพิ่ม `packages/*/README.md` เข้า `.gitignore` — มันเป็นของที่สร้างจากไฟล์อื่น การ commit ทั้งสามฉบับแปลว่ามีสามที่ให้ลืมแก้

- [ ] **Step 5: เขียว**

```bash
pnpm test --project docs
```

- [ ] **Step 6: commit**

```bash
git add README.md docs examples/v4-app package.json vitest.config.ts .gitignore
git commit -m "docs: add the README, real screenshots and the licence and donate sections"
```

---

## Task 15: demo hosting — build ใน CI แล้ว deploy image ที่เสร็จแล้ว (สเปก §14)

**Files:**
- Create: `examples/v4-app/Dockerfile`, `examples/v4-app/.dockerignore`, `render.yaml`, `docs/DEMO.md`, `.github/workflows/demo-image.yml`
- Test: `docs/tests/demo.test.ts`

**Interfaces:**
- Consumes: tarball ของ `strapi-plugin-line-rich-menu-v4` · `examples/v4-app`
- Produces: image ที่ `ghcr.io/captainkie/line-rich-menu-demo:<sha>` และ `render.yaml` ที่ Render อ่านได้

**คำตัดสินที่ task นี้บังคับใช้:** สเปก §14 เลือก **Render (free, Docker) + Neon (free Postgres) + Cloudinary (free media)** และระบุกับดักไว้ตรง ๆ ว่า `strapi build` (webpack บน v4) จะ OOM บนเครื่อง 512 MB ของ Render — ต้อง build admin ใน Docker image ตอน CI แล้ว deploy image ที่เสร็จแล้ว **ห้าม build บนเครื่อง Render** §14 ยังระบุว่า **deploy demo ตัวเดียวก่อน คือ v4** เพราะเป็นของที่ขาย และ 750 instance-hours/เดือนของ Render ไม่พอสำหรับสองตัว งานนี้จึงทำ v4 อย่างเดียวและบันทึกไว้ว่า v5 ตามทีหลัง

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`docs/tests/demo.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const dockerfile = readFileSync(`${root}examples/v4-app/Dockerfile`, 'utf8')
const renderYaml = readFileSync(`${root}render.yaml`, 'utf8')
const demoDoc = readFileSync(`${root}docs/DEMO.md`, 'utf8')

describe('Dockerfile ของ demo (สเปก §14)', () => {
  /**
   * กับดักที่สเปกระบุไว้ตรง ๆ: `strapi build` บน v4 คือ webpack ซึ่งกิน RAM เกิน 512 MB
   * ของ Render free แล้วโดน OOM killer เก็บกลางทาง — อาการที่ผู้ใช้เห็นคือ deploy ค้างแล้ว
   * ล้มโดยไม่มี stack trace ทางแก้คือ build ตอนสร้าง image ใน CI ไม่ใช่ตอนบูตบน Render
   */
  it('build admin ตอนสร้าง image ไม่ใช่ตอนบูต', () => {
    expect(dockerfile).toMatch(/RUN\s+npm run build/)
    expect(dockerfile).toMatch(/CMD\s+\[?["']?npx["']?[, ]+["']?strapi["']?[, ]+["']?start/)
    expect(dockerfile).not.toMatch(/CMD[^\n]*build/)
  })

  it('ติดตั้งปลั๊กอินจาก tarball เหมือนที่ผู้ใช้ได้จาก npm ไม่ใช่ลิงก์จากเวิร์กสเปซ', () => {
    expect(dockerfile).toMatch(/\.tgz/)
    expect(dockerfile).not.toMatch(/workspace:/)
  })

  it('รันด้วยผู้ใช้ที่ไม่ใช่ root', () => {
    expect(dockerfile).toMatch(/^USER\s+(?!root)/m)
  })

  it('ตรึงเวอร์ชันของ base image ไม่ใช่ latest', () => {
    const from = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1]!)
    expect(from.length).toBeGreaterThan(0)
    for (const image of from) {
      expect(image, image).not.toMatch(/:latest$|^[^:]+$/)
    }
  })
})

describe('render.yaml', () => {
  it('ใช้ image ที่ build แล้ว ไม่ใช่ให้ Render build เอง', () => {
    expect(renderYaml).toMatch(/image:/)
    expect(renderYaml).not.toMatch(/^\s*buildCommand:/m)
  })

  it('ประกาศตัวแปรที่จำเป็นทุกตัวโดยไม่มีค่าจริงอยู่ในไฟล์', () => {
    for (const name of [
      'APP_KEYS', 'ADMIN_JWT_SECRET', 'API_TOKEN_SALT', 'TRANSFER_TOKEN_SALT',
      'DATABASE_URL', 'LINE_RM_ENCRYPTION_KEY',
      'CLOUDINARY_NAME', 'CLOUDINARY_KEY', 'CLOUDINARY_SECRET',
    ]) {
      expect(renderYaml, name).toContain(name)
    }
    // ค่าลับต้องมาจาก dashboard ไม่ใช่จากไฟล์ที่ commit — gitleaks จะจับได้อยู่แล้วถ้าหลุด
    // แต่ด่านนี้จับก่อนถึงขั้นนั้น และบอกเหตุผลได้ชัดกว่า
    expect(renderYaml).not.toMatch(/sk_live|-----BEGIN|["'][A-Za-z0-9+/]{40,}["']/)
  })
})

describe('docs/DEMO.md', () => {
  it('บอกว่าทำไมไม่ build บน Render', () => {
    expect(demoDoc).toMatch(/OOM|512\s?MB/i)
  })

  it('บอกว่า demo เป็น v4 ตัวเดียวก่อน และทำไม', () => {
    expect(demoDoc).toMatch(/750/)
    expect(demoDoc).toMatch(/v4/)
  })

  it('บอกว่า demo ชี้ไป line-mock ไม่ใช่ LINE จริง', () => {
    expect(demoDoc).toMatch(/line-mock|mock/i)
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project docs tests/demo.test.ts
```

- [ ] **Step 3: implement**

`examples/v4-app/Dockerfile`

```dockerfile
# ---------- ขั้นที่ 1: แพ็กปลั๊กอินให้เป็น tarball เหมือนที่ผู้ใช้ได้จาก npm ----------
# ทำในนี้แทนที่จะ COPY dist เข้ามาตรง ๆ เพราะ tarball เป็นสิ่งเดียวที่พิสูจน์ `files` allowlist
# กับไฟล์ shim ที่ root ไปพร้อมกัน — เหตุผลเดียวกับที่ scripts/e2e.sh ทำ (Plan 03 Task 20)
FROM node:20.20.0-bookworm-slim AS plugin
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY tools ./tools
RUN pnpm install --frozen-lockfile --ignore-scripts=false
RUN pnpm --filter @fosivo/line-rich-menu-core --filter @fosivo/line-rich-menu-ui --filter strapi-plugin-line-rich-menu-v4 build
RUN cd packages/strapi-v4 && npm pack --pack-destination /tmp

# ---------- ขั้นที่ 2: build admin ----------
# สเปก §14: `strapi build` บน v4 คือ webpack ซึ่งกิน RAM เกิน 512 MB ของ Render free
# แล้วโดน OOM killer เก็บกลางทาง ขั้นนี้จึงเกิดที่ CI เสมอ ไม่ใช่บนเครื่องปลายทาง
FROM node:20.20.0-bookworm-slim AS build
WORKDIR /app
COPY examples/v4-app/package.json examples/v4-app/package-lock.json ./
COPY examples/v4-app/providers ./providers
RUN npm ci --no-audit --no-fund
COPY --from=plugin /tmp/strapi-plugin-line-rich-menu-v4-*.tgz /tmp/plugin.tgz
RUN npm install --no-audit --no-fund --no-save /tmp/plugin.tgz
COPY examples/v4-app/config ./config
COPY examples/v4-app/src ./src
COPY examples/v4-app/public ./public
ENV NODE_ENV=production
RUN npm run build

# ---------- ขั้นที่ 3: runtime ----------
FROM node:20.20.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=1337
COPY --from=build --chown=node:node /app /app
# demo เปิดสาธารณะ — process ที่รันเป็น root ในคอนเทนเนอร์ที่รับคำขอจากอินเทอร์เน็ตคือ
# การขยายผลของช่องโหว่ใด ๆ ที่อาจมี ไม่ใช่แค่พิธีกรรม
USER node
EXPOSE 1337
CMD ["npx", "strapi", "start"]
```

`examples/v4-app/.dockerignore`

```
node_modules
.tmp
build
.cache
.strapi
public/uploads/*
!public/uploads/.gitkeep
.env
*.log
```

`render.yaml`

```yaml
# Render อ่านไฟล์นี้ตอนสร้างบริการ — image ถูก build ไว้แล้วโดย .github/workflows/demo-image.yml
# ไม่มี `buildCommand` โดยตั้งใจ: `strapi build` ของ v4 คือ webpack ซึ่ง OOM บน 512 MB
# ของ Render free (สเปก §14) ทุกอย่างที่ต้องคอมไพล์เกิดที่ CI แล้วทั้งหมด
services:
  - type: web
    name: line-rich-menu-demo
    runtime: image
    plan: free
    region: singapore
    image:
      url: ghcr.io/captainkie/line-rich-menu-demo:latest
    healthCheckPath: /admin
    envVars:
      # ทุกตัวที่ sync: false ต้องกรอกในหน้า dashboard ครั้งเดียว — ห้ามมีค่าจริงในไฟล์นี้
      - key: APP_KEYS
        sync: false
      - key: ADMIN_JWT_SECRET
        generateValue: true
      - key: API_TOKEN_SALT
        generateValue: true
      - key: TRANSFER_TOKEN_SALT
        generateValue: true
      - key: LINE_RM_ENCRYPTION_KEY
        generateValue: true
      # Neon — ฟรีถาวรและ scale-to-zero หลัง 5 นาที ต่างจาก Supabase/Aiven ที่ pause ถาวร
      - key: DATABASE_CLIENT
        value: postgres
      - key: DATABASE_URL
        sync: false
      - key: DATABASE_SSL
        value: 'true'
      # Cloudinary — จำเป็น ไม่ใช่ทางเลือก: ดิสก์ของ Render free เป็น ephemeral
      # ไฟล์ที่อัปไว้จะหายทุกครั้งที่ deploy ซึ่งทำให้ demo พังในแบบที่คนดูตีความว่าปลั๊กอินพัง
      - key: CLOUDINARY_NAME
        sync: false
      - key: CLOUDINARY_KEY
        sync: false
      - key: CLOUDINARY_SECRET
        sync: false
      # demo ยิงใส่ tools/line-mock ที่ deploy คู่กัน ไม่ใช่ LINE จริง — ดู docs/DEMO.md
      - key: LINE_API_BASE_URL
        sync: false
      - key: LINE_API_DATA_BASE_URL
        sync: false
      - key: LINE_RM_SCHEDULER
        value: 'true'
```

`.github/workflows/demo-image.yml`

```yaml
name: Demo image

# build ที่นี่ ไม่ใช่บน Render — ดู render.yaml และ docs/DEMO.md
on:
  push:
    branches: [main]
    paths:
      - 'packages/**'
      - 'examples/v4-app/**'
      - '.github/workflows/demo-image.yml'
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: examples/v4-app/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/line-rich-menu-demo:latest
            ghcr.io/${{ github.repository_owner }}/line-rich-menu-demo:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`docs/DEMO.md`

```md
# Demo deployment

Spec §14 picked **Render** (free web service, Docker) + **Neon** (free Postgres) +
**Cloudinary** (free media). Everything below is prepared; connecting the pieces is one
pass through three dashboards and is the owner's call, not CI's.

## Why the image is built in CI

`strapi build` on Strapi 4 is webpack, and webpack needs more than the 512 MB a free Render
instance has. It does not fail cleanly — the OOM killer takes it mid-build and the deploy
just stops. So the admin bundle is built inside `examples/v4-app/Dockerfile` by
`.github/workflows/demo-image.yml`, and Render only ever runs an image that is already
finished. `render.yaml` has no `buildCommand` for exactly this reason; do not add one.

## Why only v4 for now

Render's free tier gives 750 instance-hours a month. One always-on service uses about 730 of
them. Two services would starve each other, and one of them would be the demo of the thing
we actually sell. Spec §14 chose v4 for that reason. A v5 demo comes after 1.0 ships, either
on a second account or by retiring the v4 one.

## Why the demo talks to a mock

The demo points `LINE_API_BASE_URL` at a deployed copy of `tools/line-mock`, not at
`api.line.me`. A public demo with a real channel access token in it is a token anyone can
take. The mock behaves like the real API for everything the demo shows, including the
failure paths that trigger compensation.

Cold start is around a minute on Render free, and that is fine here: rich menu images are
uploaded **from** us **to** `api-data.line.me`, so nothing external ever needs to reach the
demo. (A public URL only becomes necessary if you demo postback webhooks — use
`cloudflared tunnel` for that locally.)

## One-time setup

1. **Neon** — create a free project, copy the pooled connection string into `DATABASE_URL`.
2. **Cloudinary** — create a free account, copy cloud name / key / secret. Required, not
   optional: Render free has an ephemeral disk, so uploads vanish on every deploy.
3. **Render** — New → Blueprint → point it at this repo. It reads `render.yaml`, pulls
   `ghcr.io/captainkie/line-rich-menu-demo:latest`, and asks for the `sync: false` values.
4. Deploy `tools/line-mock` as a second free service and put its URL into
   `LINE_API_BASE_URL` and `LINE_API_DATA_BASE_URL`.
5. Open `/admin`, create the first admin user, and seed one channel with any fake token —
   the mock accepts anything.

**Rejected alternatives.** Fly.io no longer has a free tier (a 7-day, 2 VM-hour trial only).
Koyeb closed free-tier signups after the Mistral acquisition in early 2026. Fallbacks if
Render changes: Northflank, Zeabur, Back4App.
```

- [ ] **Step 4: เขียว**

```bash
pnpm test --project docs
docker build -f examples/v4-app/Dockerfile -t line-rich-menu-demo:local .
```

การ build ในเครื่องเป็นขั้นที่ช้าที่สุดของ task นี้ (ราว 5–10 นาทีรอบแรก) แต่เป็นขั้นเดียวที่พิสูจน์ว่า Dockerfile ทำงานจริง เทสต์ข้างบนพิสูจน์ได้แค่รูปทรงของมัน

- [ ] **Step 5: commit**

```bash
git add examples/v4-app/Dockerfile examples/v4-app/.dockerignore render.yaml docs .github/workflows/demo-image.yml
git commit -m "ci: build the demo image in CI so Render never runs webpack"
```

---

## Task 16: workflow ของการปล่อย + ประตูสุดท้าย

**Files:**
- Create: `.github/workflows/release.yml`, `docs/tests/release.test.ts`
- Modify: `docs/RELEASING.md`

**Interfaces:**
- Consumes: `.changeset/config.json` (Task 13) · `pnpm build`, `pnpm check:deps`, `pnpm verify` (Task 9)
- Produces: workflow ที่รอ tag แล้วรัน `changeset publish` พร้อม provenance

- [ ] **Step 1: เขียน test ที่ต้องล้มเหลว**

`docs/tests/release.test.ts`

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const release = readFileSync(`${root}.github/workflows/release.yml`, 'utf8')
const releasing = readFileSync(`${root}docs/RELEASING.md`, 'utf8')

describe('workflow ของการปล่อย (สเปก §11.6 · §13.4)', () => {
  /**
   * `id-token: write` คือทั้งหมดที่ทำให้ `--provenance` ทำงาน — ไม่มีมันแล้ว npm จะปฏิเสธ
   * attestation ด้วยข้อความที่ไม่ได้ชี้ไปที่ permission เลย และเรื่องนี้จะถูกค้นพบตอนกด publish
   * จริงเท่านั้น ซึ่งเป็นครั้งเดียวที่เราไม่อยากค้นพบอะไร
   */
  it('ขอ id-token: write สำหรับ OIDC', () => {
    expect(release).toMatch(/id-token:\s*write/)
  })

  it('เปิด provenance ตอน publish', () => {
    expect(release).toMatch(/NPM_CONFIG_PROVENANCE:\s*['"]?true/)
  })

  it('build ก่อน publish เสมอ — files มีแต่ dist', () => {
    const publishAt = release.indexOf('changeset publish')
    const buildAt = release.indexOf('pnpm build')
    expect(buildAt).toBeGreaterThanOrEqual(0)
    expect(buildAt).toBeLessThan(publishAt)
  })

  it('ผ่านด่านเดียวกับ CI ก่อนปล่อย ไม่ใช่ปล่อยแล้วค่อยรู้', () => {
    for (const gate of ['pnpm typecheck', 'pnpm lint', 'pnpm test', 'pnpm check:deps', 'pnpm verify']) {
      expect(release, gate).toContain(gate)
    }
  })

  it('ยิงจาก tag เท่านั้น ไม่ใช่จากทุก push เข้า main', () => {
    expect(release).toMatch(/tags:\s*\n\s*-\s*['"]?v\*/)
    expect(release).not.toMatch(/branches:\s*\[\s*main\s*\]/)
  })

  it('ใช้ secret ของ npm ไม่ใช่ค่าที่ฝังไว้', () => {
    expect(release).toContain('${{ secrets.NPM_TOKEN }}')
  })
})

describe('docs/RELEASING.md', () => {
  it('บอกว่าสองคำสั่งสุดท้ายเป็นของเจ้าของ', () => {
    expect(releasing).toMatch(/owner's/i)
  })

  it('บอกว่า provenance ต้องการ repo แบบ public', () => {
    expect(releasing).toMatch(/public/)
  })

  it('มีคำสั่งเดียวที่ apply ruleset ได้หลัง repo เป็น public', () => {
    expect(releasing).toContain('rulesets --input .github/rulesets/main.json')
  })

  // mutation รันกลางคืนและหลัง merge เท่านั้น — PR ที่ถอด assertion ออกจะ merge เขียวแล้ว
  // ไปพังตอนกลางคืน ผลลัพธ์ของรอบล่าสุดจึงเป็นประตูของการปล่อย ไม่ใช่เสียงรบกวนพื้นหลัง
  it('นับรอบ mutation ของคืนล่าสุดเป็นประตู ไม่ใช่ของประดับ', () => {
    expect(releasing).toMatch(/mutation/i)
    expect(releasing).toContain('gh run list')
  })
})
```

- [ ] **Step 2: รันแล้วดูมันแดง**

```bash
pnpm test --project docs tests/release.test.ts
```

- [ ] **Step 3: implement**

`.github/workflows/release.yml`

```yaml
name: Release

# ยิงจาก tag เท่านั้น ไม่ใช่จากทุก push เข้า main — การปล่อยเป็นการตัดสินใจของคน
# `pnpm version-packages` เขียนเวอร์ชัน แล้วคนเป็นคน tag และ push ตามลำดับใน docs/RELEASING.md
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: read
  # ทั้งหมดที่ทำให้ `--provenance` ทำงาน — ไม่มีบรรทัดนี้ npm จะปฏิเสธ attestation
  # ด้วยข้อความที่ไม่ได้ชี้กลับมาที่ permission เลย
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: npm
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - run: pnpm install --frozen-lockfile

      # ด่านชุดเดียวกับ CI — ปล่อยของที่ยังไม่ผ่านด่านคือการค้นพบปัญหาหลังจากที่ถอนคืนไม่ได้แล้ว
      # (npm unpublish ทำได้แค่ 72 ชั่วโมงแรกและทิ้งเวอร์ชันนั้นไว้เป็นหลุมถาวร)
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
      - run: pnpm check:deps
      - run: pnpm verify

      # README ของแพ็กเกจคือสิ่งที่ npm แสดง ไม่ใช่ของ repo — คัดลอกตอนนี้ ไม่ commit ไว้
      - name: คัดลอก README เข้าแพ็กเกจที่จะปล่อย
        run: |
          cp README.md packages/strapi-v4/README.md
          cp README.md packages/strapi-v5/README.md

      - name: changeset publish
        run: pnpm exec changeset publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          # provenance ต้องการ repo แบบ public — บน private repo npm ปฏิเสธ attestation
          # และ job นี้จะล้มที่ขั้นนี้ ซึ่งเป็นพฤติกรรมที่ถูก ไม่ใช่สิ่งที่ควรปิดด้วยการเอาบรรทัดนี้ออก
          NPM_CONFIG_PROVENANCE: 'true'
```

เพิ่มหัวข้อนี้ต่อท้าย `docs/RELEASING.md`

```md
## What is prepared but deliberately not done

Two things in this repository are one command away and stay that way until the owner runs
them. Neither is an oversight; both are decisions that belong to a person.

| Action | Command | Why it waits |
|---|---|---|
| Publish 1.0.0 to npm | `git tag v1.0.0 && git push --follow-tags` | Publishing a name is irreversible in practice — `npm unpublish` works for 72 hours and leaves the version as a permanent hole |
| Make the repository public | GitHub → Settings → Danger Zone | It turns on CodeQL, unblocks rulesets and is what npm provenance requires — and it exposes every commit in the history at once |

Everything that can be checked ahead of either one is checked by `.github/workflows/release.yml`,
which runs the same gates as CI and then stops at `changeset publish`.
```

- [ ] **Step 4: เขียว**

```bash
pnpm test --project docs
```

- [ ] **Step 5: ประตูสุดท้ายของทั้งแผน**

รันชุดเต็มหนึ่งรอบจากสภาพสะอาด แล้วเทียบผลกับตารางใน "Self-Review" ท้ายไฟล์นี้

```bash
git status --short --branch
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test:coverage
pnpm build && pnpm check:deps && pnpm verify
pnpm e2e:v4
pnpm e2e:v5
```

จากนั้นไล่หาเศษที่ค้าง — สามรูปแบบนี้คือ "งานที่ยังไม่เสร็จ" ไม่ใช่ "งานที่เสร็จแบบมีหมายเหตุ"

```bash
grep -rn "TODO\|FIXME\|XXX" packages examples --include='*.ts' --include='*.tsx' --include='*.js' | grep -v node_modules
grep -rn "\.skip\|\.only" packages examples --include='*.test.ts' --include='*.test.tsx' --include='*.spec.ts' | grep -v node_modules
```

ทั้งสองคำสั่งต้องไม่คืนอะไรเลย

- [ ] **Step 6: commit**

```bash
git add .github/workflows/release.yml docs
git commit -m "ci: publish with npm provenance from a tag, and stop before pressing the button"
```

---

## Self-Review

**1. ความครอบคลุมต่อสเปก**

| สเปก | Task | สถานะ |
|---|---|---|
| §2.1 entry point เป็น `exports` map (`./strapi-server`, `./strapi-admin`) | 1 | ครอบ — มีเทสต์ตรวจทั้งการมีอยู่ ลำดับคีย์ และการไม่มีไฟล์ shim ที่ root |
| §2.1 admin bundler เป็น Vite | 1, 9, 10 | ครอบ — `strapi-plugin build` ใช้ Vite ข้างใน และ e2e มีด่านตรวจว่าปลั๊กอินอยู่ในบันเดิลจริง |
| §2.1 admin helper เป็น `@strapi/strapi/admin` | 8 | ครอบ — พร้อม module shim และคำอธิบายว่าทำไมไม่ devDepend ทั้ง CMS |
| §2.1 Design System v2 · Icons v2 | 7 | ครอบ — `Field.*`, `tag`, Radix ทั้งสามกลุ่มมีเทสต์คุม |
| §2.1 router v6 (`useNavigate`, `Routes`) | 8 | ครอบ |
| §2.1 styled-components v6 | 1 | ครอบ — peer range `^6.0.0` มีเทสต์ตรึง |
| §2.1 `strapi.documents()` คืน `documentId` | 3 | ครอบ — พร้อมเทสต์ที่ห้ามหยิบคอลัมน์ `id` มาแทน |
| §2.1 `strapi.cron.add` · `strapi.db.connection` เหมือนกันทั้งสองเวอร์ชัน | 4, 6 | ครอบ — แต่ **การต่อสาย lock ไม่เหมือน** ดูคำตัดสินข้อ 4 |
| §2.1 upload REST เหมือนกัน | 3, 10 | ครอบ — path เดียวกัน แต่ service ฝั่งเซิร์ฟเวอร์รับไฟล์คนละรูปทรง |
| §2.1 v4 เป็น npm-only ไม่ลง Marketplace + README ต้องระบุว่าเป็นสะพาน | 14 | ครอบ — มีเทสต์บังคับว่า README พูดถึง EOL และวันที่ |
| §3.1 `packages/strapi-v5` build ด้วย `@strapi/sdk-plugin` | 1, 9 | ครอบ |
| §3.1 `examples/v5-app` | 10 | ครอบ |
| §6.1 ข้อ 1 entry point ตามรูปแบบของเวอร์ชัน | 1 | ครอบ |
| §6.1 ข้อ 2 implement `UIPort` | 7, 8 | ครอบ |
| §6.1 ข้อ 3 data access adapter (`documents()`) | 3 | ครอบ |
| §6.1 ข้อ 4 content-type · route · permission · cron · i18n | 2, 5, 6, 8 | ครอบ |
| §6.2 `Repo<T>` และ id เป็น string เสมอ | 3 | ครอบ |
| §6.3 Community Edition | 6 | ครอบ — ยกมาจาก v4 ทั้งดุ้น ไม่ต้องเขียนโค้ดเพิ่ม |
| §11.6 ไม่มี postinstall | 1, 13 | ครอบ — เทสต์ในสามแพ็กเกจ |
| §11.6 `npm publish --provenance` ผ่าน OIDC | 16 | ครอบ |
| §11.6 lockfile ตรึง · Dependabot | — | มีอยู่แล้วจาก Plan 00 ไม่ต้องทำอะไรเพิ่ม |
| §11.6 CI gate: gitleaks · osv-scanner · CodeQL | 13 (เอกสาร) | ครอบบางส่วน — gitleaks/osv รันอยู่แล้ว ส่วน CodeQL ถูกกั้นด้วย visibility ดู `docs/RELEASING.md` |
| §12 `en` เป็นค่าเริ่มต้น · `th` · source of truth ที่ `packages/ui/src/translations` | 8, 11, 12 | ครอบ — พร้อมยามใหม่สองตัวใน `i18n.test.ts` |
| §12 v5 ใช้ `registerTrads` จาก `@strapi/strapi/admin` | 8 | ครอบ **โดยเบี่ยงจากตัวอักษร** — ดูคำตัดสินข้อ 6 |
| §13.4 `strapi-plugin verify` (v5) | 9 | ครอบ |
| §13.4 e2e matrix strapi[4,5] × db[sqlite,postgres] × node 20 | 10 | ครอบ |
| §13.4 (บน tag) changesets publish + npm provenance | 13, 16 | ครอบ |
| §14 Render + Neon + Cloudinary · ห้าม build บน Render · v4 ตัวเดียวก่อน | 15 | ครอบ |
| §17 ขอบเขต v1.0 "จัดเต็ม — custom layout" | 11 | ครอบ — เป็นข้อที่ตอบคำถามค้างของ carry-forward |
| §17 กลยุทธ์ปล่อย "1.0.0 เต็มทีเดียว ทั้ง v4 และ v5" | 13 | ครอบ — `fixed` ใน changesets ไม่ใช่ `linked` |
| §17 npm scope: plugin unscoped · core/ui ใช้ `@fosivo/` | 13 | ครอบ **โดยเบี่ยงจากตัวอักษร** — ดูคำตัดสินข้อ 2 |

**2. ความครอบคลุมต่อ carry-forward**

| รายการ | Task | สถานะ |
|---|---|---|
| CodeQL ถูกกั้นด้วย `repository.visibility == 'public'` | 13 | บันทึกใน `docs/RELEASING.md` พร้อมบอกว่ามันเริ่มเองวันที่ repo เปิด |
| `.github/rulesets/main.json` committed แต่ยังไม่ apply | 13 | บันทึกพร้อมคำสั่งเดียวที่ apply ได้ และมีเทสต์บังคับว่าคำสั่งนั้นอยู่ในเอกสาร |
| mutation รันกลางคืน ไม่ใช่บน PR → PR ที่ถอด assertion merge เขียวได้ | 16 | ปิดด้วยการทำให้ผลของรอบล่าสุดเป็นประตูของการปล่อย พร้อมคำสั่ง `gh run list` ที่ตรวจได้ |
| `core`/`ui` ไม่มี description · repository · author · `publishConfig.access` | 13 | ปิดด้วย `private: true` แทน — ดูคำตัดสินข้อ 2 |
| `pnpm -r build` ไม่เคยอยู่ในชุดที่ verify | 13, 16 | อยู่ใน `docs/RELEASING.md` ข้อ 3 และเป็นขั้นบังคับใน `release.yml` |
| **คำถามค้าง: v1.0 ships custom layout หรือ documents its absence** | 11 | **ตอบแล้ว — ต่อสายให้ใช้ได้จริง** เหตุผลอยู่ใน Task 11 |
| ยาม i18n จับได้แค่ค่าที่เหมือนกันทุกไบต์ | 12 | ปิดด้วยยาม "คำแปลไทยที่ไม่มีอักษรไทย" |
| `ImageField` ถือ error เอง → ข้อความผิดค้างบนจอ | 12 | ปิด |
| `TemplatePicker` ห่อ testid ด้วย `<span>` ใน `ui.Button` | 12 | ปิด |
| `port.test.tsx` assert `toBeGreaterThanOrEqual(15)` | 12 | ปิดด้วยรายการคีย์ที่เรียงแล้ว |
| `chatBar.defaultLabel` ไม่มียามความยาว | 12 | ปิด |
| `CanvasEditor` ใส่ `url(${imageUrl})` ไม่ escape | 12 | ปิด |
| `eslint-plugin-react-hooks` ยังไม่ติดตั้ง | 1 | ปิด — เปิดเป็น `error` ทั้งสามที่ที่มี React |
| `packages/ui` ลาก `sharp` เข้ากราฟการติดตั้งของผู้บริโภค | 13 | หายไปทั้งข้อ — ไม่มีผู้บริโภคคนไหนติดตั้ง `ui` อีกแล้ว |
| conditional-spread ceremony (`exactOptionalPropertyTypes` ปิดอยู่) | — | **ยังค้าง** ดู "สิ่งที่ยังค้าง" |
| per-file coverage บังคับไม่ได้เพราะ `packages/ui` ยังไม่ผ่าน | — | **ยังค้าง** ดู "สิ่งที่ยังค้าง" |
| การทดสอบ integration ลงได้แค่ขั้นบันไดบนสุด | — | **ยังค้าง** — เป็นของ `packages/core` ไม่ใช่ของแผนนี้ |
| Thai error messages สามตัวใน `crypto.ts`/`client.ts` | — | **ยังค้าง** ดู "สิ่งที่ยังค้าง" |
| `Number(null)` → `maxAttempts` clamp เป็น 1 เงียบ ๆ | — | **ยังค้าง** — นอกสัญญาของ type ที่ประกาศไว้ |

**3. ความสอดคล้องของ type ระหว่าง task**

- `StrapiV5` (Task 2) → ใช้โดย Task 3, 4, 5, 6 · `documents(uid)` คืน `DocumentsApi` ซึ่ง Task 3 เรียกครบทั้งห้าเมธอด
- `Repo<T>` (Plan 03) → Task 3 คืน · Task 4 ประกอบเข้า `Services` · Task 5 ใช้ผ่าน `Services`
- `Services` (Task 4) → Task 5 (`menu-write.ts`, controllers) และ Task 6 (`tick.ts`) รับตรงกัน
- `SCHEDULE_ID_COLUMN` (Task 4) → เทสต์ใน Task 4 อ้างถึงตัวเดียวกัน ไม่ได้พิมพ์สตริงซ้ำ
- `idParam` (Task 5) → `menuInputSchema.channelId` และ `listQuerySchema.channel` ใช้ตัวเดียวกัน
- `PLUGIN_ID` / `PERMISSION` — Task 5 ประกาศฝั่ง server, Task 8 ประกาศฝั่ง admin ที่ `plugin-id.ts` **สองไฟล์ต่างกันโดยตั้งใจ** (โครง build แยกกัน) และมีเทสต์สองตัวคนละที่ยึดค่าไว้ให้ตรงกัน
- `UIPrimitives` (Plan 02 `port.ts`) → Task 7 implement ครบ · Task 12 ตรึงรายการคีย์ในเทสต์
- `PreviewProps.onBoundsChange` (Task 11) ตรงกับ `CanvasEditorProps.onBoundsChange` (Plan 02) เป๊ะทั้งชื่อและลายเซ็น
- `ImageFieldProps.error` / `onErrorChange` (Task 12) → `RichMenuEditor` เป็นผู้ถือ state และเป็นจุดเดียวที่ล้างมัน

**4. ค้นหารูปแบบที่ห้ามมี**

รันคำสั่งนี้กับไฟล์แผนก่อนถือว่าเสร็จ — ต้องไม่คืนอะไรเลย

```bash
grep -nE "TBD|เหมือน Task|similar to Task|ทำแบบเดียวกับ|\.\.\.$" docs/superpowers/plans/2026-08-20-line-rich-menu-04-v5-and-release.md
```

ทุกจุดที่บอกว่า "คัดลอกจาก v4" ระบุไฟล์ต้นทางเต็ม ๆ พร้อมรายการสิ่งที่ต้องแก้เป็นข้อ ๆ — ไม่มีที่ไหนบอกแค่ว่า "ทำแบบเดียวกัน"

---

## คำตัดสินที่แผนนี้ทำ

ทุกข้อคือจุดที่สเปกเงียบ หรือสองส่วนของสเปกดึงกันคนละทาง บันทึกไว้พร้อมเหตุผลบรรทัดเดียว ข้อที่มีเครื่องหมาย **[ต้องมีคนตรวจซ้ำ]** คือข้อที่ผู้รีวิวควรอ่านสองรอบ

1. **โครงของ v5 เป็น `admin/src` + `server/src` ไม่ใช่ `src/admin` + `src/server` แบบ v4** — เพราะ `strapi-plugin build` คำนวณ path ของ tsconfig สำหรับ emit `.d.ts` จากชื่อ export key ตรง ๆ (`./strapi-admin` → `./admin/tsconfig.build.json`) โครงอื่นทำให้ dts ไม่ออก

2. **`packages/core` และ `packages/ui` เป็น `private: true` ไม่ปล่อยขึ้น npm** — Plan 03 ตัดสินใจรวมมันเข้าบันเดิลของ adapter ไปแล้ว (`noExternal` ใน tsup ของ v4 และเป็นพฤติกรรม default ของ sdk-plugin ฝั่ง v5) `private` คือการเขียนคำตัดสินนั้นลงในไฟล์ที่เครื่องมืออ่าน ไม่ใช่แค่ในคอมเมนต์ **[ต้องมีคนตรวจซ้ำ]** — §17 บรรทัด "npm scope" อ่านได้ว่าทั้งสองจะถูกปล่อยในนาม Fosivo Labs ถ้าเจ้าของต้องการจอง scope ไว้จริง ๆ ให้ปล่อยเวอร์ชัน `0.0.0` ที่ว่างเปล่าครั้งเดียวแล้วคง `private` ไว้ในรีโป

3. **`validation.ts` ย้ายทั้งดุ้นไม่ได้** — โน้ตส่งต่อของ Plan 03 บอกว่าย้ายได้เกือบทั้งหมด ซึ่งจริงทุกบรรทัดยกเว้น `idParam` ที่เป็น `/^\d+$/` การยกมาตรง ๆ จะทำให้ทุก route ที่มี `:id` ตอบ 400 ตั้งแต่คำขอแรก

4. **`lock.ts` ย้ายได้ แต่การต่อสายเข้ากับมันย้ายไม่ได้** — `ScheduleRow.id` ของ v5 คือ `documentId` ส่วน lock ยิงผ่าน knex ที่มองเห็นแต่คอลัมน์ ต้องส่ง `columns: { id: 'document_id' }` ไม่งั้น `claim` คืน false เสมอและงานที่ตั้งเวลาไว้ถูกข้ามเงียบ ๆ ทุกนาที **[ต้องมีคนตรวจซ้ำ]** — นี่คือความล้มเหลวที่เงียบที่สุดในทั้งแผน `tick` จะรายงาน `{ due: n, claimed: 0 }` ซึ่งแยกจาก "ไม่มีงานถึงกำหนด" ไม่ออกด้วยตา Task 10 จึงมีเทสต์ e2e เฉพาะสำหรับข้อนี้

5. **คอลัมน์ของ audit เปลี่ยนชนิด: `richMenuId`/`channelId` เป็น `string`, `actorId` ยังเป็น `integer`** — สองตัวแรกเก็บ `documentId` ส่วน admin user ของ Strapi 5 ยังใช้ id ตัวเลข และค่า sentinel ของขาล้มเหลวใน `channels.create` เปลี่ยนจาก `'0'` เป็น `'(none)'` เพราะ `'0'` บนคอลัมน์ string อ่านได้เหมือน documentId จริง

6. **i18n ไม่มี "build step ที่คัดลอกไฟล์แปล" ตามตัวอักษรของ §12** — Plan 03 เลือก import `MESSAGES` จาก `packages/ui` ตรง ๆ ซึ่งให้ผลเดียวกันแต่ไม่มีขั้นตอนให้ลืมรัน แผนนี้เดินตามทางเดิมสำหรับ v5

7. **เทสต์ฝั่งแอดมินของ v5 ใช้ jsdom + testing-library ไม่ใช่ `renderToStaticMarkup` แบบ v4** — DS v2 วางบน Radix ซึ่ง Modal/Tooltip วาดผ่าน portal และ Select/Radio ต้องการ pointer API การ render บนเซิร์ฟเวอร์คืน markup ว่างสำหรับตัวที่สำคัญที่สุด

8. **`@strapi/strapi` ไม่ถูกติดตั้งเป็น devDependency — ใช้ module shim + test double แทน** — แพ็กเกจนั้นคือ CMS ทั้งตัว การติดตั้งเพื่อ import hook สองตัวคือราคาที่ CI ต้องจ่ายทุก job **[ต้องมีคนตรวจซ้ำ]** — ราคาของทางนี้คือรูปทรงของ hook เป็นคำสัญญาที่เราเขียนเอง ตัวที่พิสูจน์ของจริงคือ `examples/v5-app` เท่านั้น ถ้าผู้รีวิวเห็นว่าไม่พอ ทางแก้คือเพิ่ม devDependency ไม่ใช่เพิ่มเทสต์

9. **v1.0 ต่อสาย custom layout ให้ใช้ได้จริง ไม่ใช่บันทึกว่าไม่มี** — §17 ระบุขอบเขต v1.0 ว่า "จัดเต็ม — custom layout" และกลไกทั้งหมดเขียนเสร็จพร้อมเทสต์แล้ว เหลือแค่การส่งพร็อพกับปุ่มสองปุ่ม

10. **`fixed` ไม่ใช่ `linked` ใน changesets** — §17 เขียนว่า "1.0.0 เต็มทีเดียว ทั้ง v4 และ v5" ซึ่งแปลว่าเลขเวอร์ชันต้องเท่ากันเสมอ ไม่ใช่แค่ขยับพร้อมกันเมื่อบังเอิญมีการเปลี่ยนแปลงทั้งคู่

11. **README ถูกคัดลอกเข้าแพ็กเกจตอนปล่อย ไม่ commit ไว้สามฉบับ** — npm แสดง README ของแพ็กเกจ ไม่ใช่ของ repo และ npm ไม่ตาม symlink ตอน pack การ commit สามฉบับแปลว่ามีสามที่ให้ลืมแก้

12. **ภาพหน้าจอถ่ายด้วย Playwright ไม่ใช่แคปมือ** — ภาพที่แคปมือจะล้าสมัยเงียบ ๆ ทุกครั้งที่ UI เปลี่ยน

13. **demo ทำ v4 ตัวเดียวและ deploy ไม่ใช่ส่วนหนึ่งของ CI** — §14 เลือก v4 เพราะ 750 instance-hours/เดือนของ Render ไม่พอสำหรับสองตัว ส่วน CI สร้าง image เท่านั้น การ deploy เป็นการเชื่อม dashboard สามที่ซึ่งเป็นของเจ้าของ

14. **พอร์ตของ `examples/v5-app` เป็น 1338 ไม่ใช่ 1337** — CI รันทั้งสองแอปในงานเดียวกันไม่ได้ถ้าใช้พอร์ตเดียวกัน และคนที่รันทั้งคู่บนเครื่องตัวเองจะชนกันเงียบ ๆ

15. **glob ของ tarball ใน `e2e.sh` ของ v5 ต้องเป็น `strapi-plugin-line-rich-menu-[0-9]*.tgz`** — `*` ธรรมดาจะจับ tarball ของ v4 ไปด้วยเมื่อทั้งสองอยู่ในโฟลเดอร์เดียวกัน แล้วแอป v5 จะติดตั้งปลั๊กอินของ v4 ทับ ซึ่งบูตขึ้นแต่ไม่มี route ไหนทำงาน

---

## สิ่งที่ยังค้าง — ส่งต่อหลัง 1.0

รายการนี้ต้องถูกเพิ่มเข้า `docs/superpowers/plans/2026-08-20-line-rich-menu-carry-forward.md` เป็นหัวข้อใหม่ "For after 1.0" ในขั้นสุดท้ายของ Task 16

- **conditional-spread ceremony** — `{...(x === undefined ? {} : { x })}` อยู่ในห้าไฟล์ของ `packages/ui` และแผนนี้เพิ่มอีกสามจุด (Task 11 และ 12) `exactOptionalPropertyTypes` ยังปิดอยู่ใน `tsconfig.base.json` ทางแก้จริงคือเปิดมัน ซึ่งจะทำให้ ceremony มีความหมาย แต่เป็นการเปลี่ยนที่กระเพื่อมทั้งรีโปและไม่ควรทำระหว่างเตรียมปล่อย
- **per-file coverage** — `perFile: true` บังคับได้เฉพาะใน `thresholds` ระดับบนสุด และการเปิดที่นั่นต้องให้ `packages/ui` ผ่านก่อน ซึ่งยังขาดอยู่หลายไฟล์ (ตารางอยู่ใน carry-forward) Task 11 กับ 12 เพิ่มเทสต์ให้ `Preview`, `AreaList`, `ImageField`, `CanvasEditor` และ `RichMenuEditor` ซึ่งน่าจะลดช่องว่างลง — วัดใหม่หลัง 1.0 แล้วค่อยตัดสิน
- **ข้อความภาษาไทยสามจุดใน `core`** — `crypto.ts` สองจุดและ `client.ts` หนึ่งจุด อยู่นอกเส้นทาง validation จึงเป็นข้อความสำหรับนักพัฒนา แต่ §12 ให้ `en` เป็นค่าเริ่มต้นและสามจุดนี้ไม่สอดคล้องกับที่เหลือ
- **`Number(null)` ทำให้ `maxAttempts` clamp เป็น 1 เงียบ ๆ** — นอกสัญญาของ type ที่ประกาศไว้ แต่เข้าถึงได้จาก adapter ที่เป็น JavaScript ล้วนซึ่งส่ง environment variable ที่เป็นสตริงว่าง
- **integration test ของ image pipeline ลงได้แค่ขั้นบันไดบนสุด** — ทั้งสองเคสป้อนรูปสีเดียวที่พอดีที่ 2500px ขั้นบันไดจึงไม่เคยลง ซึ่งเป็นความล้มเหลวที่เทสต์นั้นถูกเขียนมาเพื่อจับ
- **`prepareImage` ยังทำงานในคำขอ save** — ทางแก้จริงคือคิวงาน ซึ่งเปลี่ยน `POST /menus` เป็น 202 คือการเปลี่ยนสัญญา ไม่ใช่การแก้ภายใน README ของ Task 14 บอกข้อจำกัดนี้ไว้แล้ว
- **`aliasId` unique ต่อ channel บังคับที่ชั้น application** — สอง request พร้อมกันยังลอดได้ตามทฤษฎี ต้องมี unique index ที่เขียนด้วย migration เอง
- **`toHttpError` มีตาราง code → status ที่ต้องขยายทุกครั้งที่ `core` เพิ่ม typed error** — และตอนนี้มีสองสำเนา (v4 กับ v5) ที่ต้องแก้คู่กัน code ที่ไม่รู้จักตกเป็น 500 `internal_error` ซึ่งปลอดภัยแต่เงียบ
- **demo ของ v5** — §14 ให้ทำ v4 ก่อนเพราะโควตาของ Render ตัว v5 ตามมาหลัง 1.0 บนบัญชีที่สองหรือหลังปลด v4

---

## แผนถัดไป

ไม่มี Plan 05 — จบแผนนี้แล้วสิ่งที่เหลือคือสองคำสั่งที่เป็นของเจ้าของ ตามที่ `docs/RELEASING.md` และ design notes ข้อ 4 ระบุไว้ตรงกัน:

```sh
git tag v1.0.0 && git push --follow-tags     # ปล่อยขึ้น npm
# GitHub → Settings → Danger Zone            # เปิด repo เป็น public
```

รายการใน "สิ่งที่ยังค้าง" ข้างบนเป็นวัตถุดิบของ 1.1 ไม่ใช่ของ 1.0

---

# คำตัดสินของ controller ต่อสามข้อที่แผนติดธงไว้

**ข้อ 2 — `core` และ `ui` เป็น `private: true`** — **รับ** การรวมเข้าบันเดิลถูกตัดสินไปแล้วใน Plan 03
และ `private` คือการเขียนคำตัดสินนั้นลงในไฟล์ที่เครื่องมืออ่านจริง ไม่ใช่แค่คอมเมนต์ ส่วนการจอง
scope `@fosivo` ด้วยการปล่อยเวอร์ชันเปล่า **เป็นการกระทำที่มองออกไปข้างนอกและย้อนกลับไม่ได้ —
เป็นการตัดสินใจของเจ้าของ ไม่ใช่ของแผนหรือของ agent ตัวไหน** แผนเตรียมทางไว้ได้ แต่ห้ามลงมือเอง

**ข้อ 4 — `lock.ts` ต้องได้ `columns: { id: 'document_id' }`** — **รับ พร้อมข้อบังคับเพิ่ม** แผนเรียกมัน
ว่าความล้มเหลวที่เงียบที่สุดในแผนได้ถูกต้อง `claim` ที่คืน false เสมอทำให้ `tick` รายงาน
`{ due: n, claimed: 0 }` ซึ่งแยกจาก "ไม่มีงานถึงกำหนด" ไม่ออกด้วยตา และไม่มี log ไหนผิดปกติเลย
e2e ที่ Task 10 เตรียมไว้เป็นทางที่ถูก **แต่ต้องพิสูจน์ว่ามันแดงจริงก่อนเชื่อ** — ถอด `columns` ออก
รันแล้วต้องเห็นมันล้ม แล้วค่อยใส่กลับ ตามมาตรฐาน S3 ของโปรเจกต์นี้ ประตูที่ยังไม่เคยเห็นแดง
ไม่ใช่ประตู และโปรเจกต์นี้เจอมาแล้วสี่ตัว

**ข้อ 8 — ไม่ติดตั้ง `@strapi/strapi` ใช้ shim แทน** — **รับ** ราคาที่แผนบอกไว้ตรงไปตรงมา คือรูปทรง
ของ hook กลายเป็นคำสัญญาที่เราเขียนเอง และตัวพิสูจน์จริงคือ `examples/v5-app` เท่านั้น เหตุผลที่
รับคือ **ฝั่ง v4 เดินทางนี้มาแล้วและ acceptance app จับ D1 ได้จริง** ซึ่งเป็นบั๊กที่ทำให้ทั้งเส้นทาง
save → normalize → publish ตายสนิทและ unit test 608 ตัวมองไม่เห็น รูปแบบนี้จึงพิสูจน์ตัวเองแล้ว
ว่าใช้ได้ ไม่ใช่การหวังให้โชคดี — โดยมีเงื่อนไขว่า Task 10 ต้องเป็น acceptance ที่เข้มเท่า Task 20
ของ Plan 03 ไม่ใช่แค่ "บูตขึ้น"

**และข้อที่แผนไม่ได้ติดธงแต่ผมย้ำ:** บทเรียนจาก D1 คือ **ของปลอมที่ใจดีกว่าระบบจริง เปลี่ยนบั๊ก
integration ให้เป็นเทสต์ที่เขียว** fake ของ `documents()` ใน Task 3 ต้องตัด relation ทิ้งเมื่อไม่ได้ขอ
`populate` เหมือนที่ fake ของ `entityService` ถูกแก้ไปแล้ว ไม่ใช่คืนให้เสมอ
