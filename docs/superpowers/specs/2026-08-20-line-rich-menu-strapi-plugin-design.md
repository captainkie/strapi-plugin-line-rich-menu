# LINE Rich Menu Builder — Strapi Plugin (v4 + v5)

- **วันที่:** 2026-08-20
- **สถานะ:** Design approved — รอทำ implementation plan
- **เป้าหมายรีลีส:** 1.0.0 ครบฟีเจอร์ทีเดียว รองรับ Strapi 4 และ 5
- **ผู้ปล่อย:** Fosivo Labs
- **สภาพแวดล้อมเป้าหมายแรก:** Strapi 4.25.11 / Node 20.20.0 / Community Edition

---

## 1. เป้าหมายและขอบเขต

### 1.1 สิ่งที่จะสร้าง

Plugin สำหรับ Strapi ที่ให้ผู้ดูแลระบบสร้าง จัดการ และ publish **LINE rich menu** ได้จากหน้า admin panel
โดยไม่ต้องเข้า LINE Official Account Manager ปล่อยเป็น package สาธารณะบน npm

### 1.2 กลุ่มเป้าหมาย

- ทีมที่ใช้ Strapi เป็น backend ให้ LINE OA (ทั้งของตัวเองและของลูกค้า)
- ลูกค้าปัจจุบันที่ยังอยู่บน **Strapi 4.25.11 / Node 20 / Community Edition** — คือกรณีใช้งานจริงกรณีแรก
- ทีมภายในที่ standardize บน Strapi 5 แล้ว

### 1.3 อยู่ในขอบเขต (v1.0.0)

| ฟีเจอร์ | รายละเอียด |
|---|---|
| Template สำเร็จรูป | 12 แบบ (compact 101–105, large 201–207) พร้อม bounds พิกัดจริง |
| Custom layout | ลาก/ปรับ bounds เองบน canvas พร้อม snap-to-grid |
| Image pipeline | อัปโหลดรูปเดียว หรืออัปแยกช่องแล้ว compose อัตโนมัติ บีบให้ผ่านข้อจำกัด LINE |
| Action ต่อช่อง | action มาตรฐานของ LINE เท่านั้น |
| Publish / set default | สร้างบน LINE + อัปรูป + ตั้งเป็นเมนู default |
| เมนูหลายแท็บ | `richmenuswitch` + alias จัดการอัตโนมัติ |
| ตั้งเวลา | cron สลับเมนูตามเวลา พร้อม lock กันยิงซ้ำ |
| หลาย LINE OA | หลาย channel ในระบบเดียว |
| i18n | อังกฤษ + ไทย |
| RBAC | permission แยก read / create / update / publish / settings |
| Mock mode | โหมดจำลอง LINE API สำหรับ demo และ CI |

### 1.4 นอกขอบเขต (ตั้งใจตัด)

- **Custom action type** ที่ผูกกับธุรกิจเฉพาะราย — v1.0 รองรับเฉพาะ action มาตรฐานของ LINE
  (ถ้าจำเป็นภายหลัง ค่อยเปิดเป็น extension point ผ่าน plugin config ไม่ hardcode)
- **Per-user / per-group rich menu** (`linkRichMenuIdToUser`) — client มีให้ใน core แต่ยังไม่มี UI เพราะ plugin ไม่มี user list ของ LINE
- **สถิติการกด / A/B test** — LINE ไม่มี API ให้ ต้องทำ tracking เองผ่าน postback ซึ่งเกินขอบเขต v1.0
- **Rich message / imagemap** — คนละ API คนละ domain

---

## 2. ข้อจำกัดที่ยืนยันแล้ว

### 2.1 Strapi

| | Strapi 4.25.x | Strapi 5.x |
|---|---|---|
| Entry point | ไฟล์ `strapi-server.js` / `strapi-admin.js` ที่ root ของ package | `exports` map ใน package.json (`./strapi-server`, `./strapi-admin`) |
| Admin bundler | webpack 5 | Vite |
| Admin helper | `@strapi/helper-plugin` ^4.25 | `@strapi/strapi/admin` |
| Design System | v1.x | v2.x |
| Icons | `@strapi/icons` ^1.x | `@strapi/icons` ^2.x |
| Router | `react-router-dom` v5 (`useHistory`, `Switch`) | v6 (`useNavigate`, `Routes`) |
| styled-components | v5 | v6 |
| DB layer | `strapi.entityService` (numeric id) | `strapi.documents()` (`documentId`) |
| Cron | `strapi.cron.add` | `strapi.cron.add` (เหมือนกัน) |
| knex | `strapi.db.connection` | `strapi.db.connection` (เหมือนกัน) |
| Upload REST | `POST /upload` | `POST /upload` (เหมือนกัน) |

**สรุป:** plugin ของ v4 กับ v5 ไม่ cross-compatible กัน และ Marketplace ประกาศ compatibility แยกเวอร์ชัน
ไม่มี pattern "แพ็กเกจเดียวรองรับสองเวอร์ชัน" ที่ Strapi รองรับอย่างเป็นทางการ

**Strapi 4 EOL:** หยุด bug fix ตั้งแต่ ต.ค. 2025 หยุด security patch 30 เม.ย. 2026 และ v5.46.0 มาร์กเป็น EOL ในโค้ดเบสแล้ว
→ package สำหรับ v4 จะเป็น **npm-only ไม่ลง Marketplace** และ README ต้องระบุชัดว่าเป็นสะพานระหว่างรอ migrate ไม่ใช่เหตุผลให้อยู่ v4 ต่อ

### 2.2 LINE Messaging API

- รูป: JPEG หรือ PNG **≤ 1 MB**
- ขนาดที่รับ: `2500x1686`, `2500x843`, `1200x810`, `1200x405`, `800x540`, `800x270`
- ช่องที่แตะได้: **สูงสุด 20 ช่อง** ต่อเมนู
- `chatBarText`: สูงสุด 14 ตัวอักษร
- **rich menu ที่สร้างแล้วแก้ไม่ได้** — ต้องสร้างใหม่แล้วสลับ
- มี `POST /v2/bot/richmenu/validate` ให้ตรวจ payload ก่อนสร้างจริง
- อัปรูปผ่าน multipart ไปที่ `api-data.line.me` → **ไม่ต้องมี public HTTPS ฝั่งเรา**

---

## 3. สถาปัตยกรรม

### 3.1 โครงสร้าง monorepo

```
line-rich-menu/                          pnpm workspace + changesets
├─ packages/
│  ├─ core/        @fosivo/line-rich-menu-core   ไม่มี Strapi dependency
│  ├─ ui/          @fosivo/line-rich-menu-ui     React, ไม่มี Strapi/DS/router dependency
│  ├─ strapi-v5/   strapi-plugin-line-rich-menu     peer: @strapi/strapi ^5.0.0
│  └─ strapi-v4/   strapi-plugin-line-rich-menu-v4  peer: @strapi/strapi ^4.25.0
├─ examples/
│  ├─ v4-app/      Strapi 4.25.x จริง (yalc link)   acceptance gate หลัก
│  └─ v5-app/      Strapi 5.x จริง
├─ tools/
│  └─ line-mock/   fastify เลียน LINE Messaging API  ใช้ทั้งใน CI และโหมด demo
└─ .github/workflows/ci.yml               matrix: strapi[4,5] × db[sqlite,postgres] × node 20
```

**เครื่องมือ build**

- `core`, `ui` → `tsup` (ESM + CJS + d.ts)
- `strapi-v5` → `@strapi/sdk-plugin` (`strapi-plugin build` / `watch:link` / `verify`)
- `strapi-v4` → `tsup` + ไฟล์ shim `strapi-server.js` / `strapi-admin.js` ที่ root ที่ re-export จาก `dist/`
  (sdk-plugin เล็งเฉพาะ v5 ใช้กับ v4 ไม่ได้)

### 3.2 หลักการแบ่ง

ความเสี่ยงส่วนใหญ่ของงานนี้ (LINE API, image pipeline, publish state machine) **ไม่เกี่ยวกับ Strapi เลย**
จึงยกออกไปไว้ใน `core` ที่ทดสอบได้โดยไม่ต้องบูต Strapi
`ui` ถือ UI ทั้งหมดโดยไม่ผูกกับ Design System เวอร์ชันใด
เหลือให้ adapter แต่ละตัวรับผิดชอบเฉพาะสิ่งที่ต่างกันจริง ๆ ระหว่าง v4 กับ v5

---

## 4. `core` — โดเมนล้วน ไม่มี Strapi

### 4.1 `templates.ts`

พอร์ตมาจากโค้ด SvelteKit ที่มีอยู่ก่อนหน้า (เก็บไว้นอก repo นี้) โดย:

- คง `richMenuLayout` ทั้ง 12 template พร้อม `bounds` พิกัดจริงไว้ครบ
- ตัด `import ...png` ออกทั้งหมด — thumbnail วาดจาก `bounds` เป็น SVG แทน (ดู 5.3)
- ตัด `table: TemplateXXX` (Svelte component) ออกทั้งหมด — ดูข้อ 5.2
- ตัด action type ที่เป็น custom ของธุรกิจเฉพาะรายออก เหลือเฉพาะ action มาตรฐานของ LINE
- เพิ่ม catalog ขนาดที่ LINE รับทั้ง 6 ขนาด (เดิมมีแค่ 2)

```ts
export interface Bounds { x: number; y: number; width: number; height: number }
export interface RichMenuSize { width: number; height: number }
export interface TemplateDef {
  key: string;                 // 'RICH_MENU_TEMPLATE_201'
  size: RichMenuSize;
  areaCount: number;
  bounds: Bounds[];            // พิกัดจริง ไม่ใช่เปอร์เซ็นต์
  // ไม่มีฟิลด์ thumbnail — วาดเป็น SVG จาก bounds ตอน render (ดู 5.3)
}
export const TEMPLATES: Record<string, TemplateDef>;
export const LINE_ALLOWED_SIZES: RichMenuSize[];
```

**การจับคู่ `size` กับพิกเซลจริง** — ฟิลด์ `size` ใน content-type เก็บแค่ `large` / `compact`
ส่วนพิกเซลจริงเลือกตอน publish ตามตารางนี้:

| `size` | ขนาดที่ลองไล่ลง (ใหญ่ไปเล็ก) |
|---|---|
| `large` | `2500x1686` → `1200x810` → `800x540` |
| `compact` | `2500x843` → `1200x405` → `800x270` |

`normalize` เริ่มจากขนาดใหญ่สุดเสมอ แล้ว**ลดลงขั้นถัดไปก็ต่อเมื่อบีบ quality จนสุดแล้วยังเกิน 1 MB**
ทำให้ได้คุณภาพสูงสุดที่ผ่านข้อจำกัดโดยไม่ต้องให้ผู้ใช้เลือกพิกเซลเอง

**เทสต์:** ทุก template ต้องผ่าน — bounds ทุกช่องอยู่ในกรอบ, ไม่มีช่องกว้าง/สูงเป็น 0, จำนวนช่อง ≤ 20

### 4.2 `line/client.ts`

fetch client บาง ๆ รับ `accessToken` + `baseUrl` (สลับไป line-mock ได้)

```ts
createRichMenu(payload)            POST   /v2/bot/richmenu
validateRichMenu(payload)          POST   /v2/bot/richmenu/validate
uploadContent(id, buffer, mime)    POST   https://api-data.line.me/v2/bot/richmenu/{id}/content
setDefault(id)                     POST   /v2/bot/user/all/richmenu/{id}
clearDefault()                     DELETE /v2/bot/user/all/richmenu
getRichMenu(id) / list()           GET    /v2/bot/richmenu/{id} | /list
deleteRichMenu(id)                 DELETE /v2/bot/richmenu/{id}
createAlias(aliasId, richMenuId)   POST   /v2/bot/richmenu/alias
updateAlias(aliasId, richMenuId)   POST   /v2/bot/richmenu/alias/{aliasId}
deleteAlias(aliasId)               DELETE /v2/bot/richmenu/alias/{aliasId}
listAliases()                      GET    /v2/bot/richmenu/alias/list
getBotInfo()                       GET    /v2/bot/info          ใช้กับปุ่ม Test connection
linkToUser(userId, id)             POST   /v2/bot/user/{userId}/richmenu/{id}   มีใน API ยังไม่มี UI
```

- retry แบบ exponential backoff เฉพาะ 429 และ 5xx (สูงสุด 3 ครั้ง)
- แปล error ของ LINE เป็น typed error: `LineValidationError`, `LineRateLimitError`, `LineAuthError`, `LineServerError`
- ไม่ log access token ไม่ว่ากรณีใด

**เทสต์:** msw mock ครอบทุก endpoint + เคส 429 ต้อง retry แล้วสำเร็จ + เคส 401 ต้องไม่ retry

### 4.3 `image/pipeline.ts`

```ts
normalize(input: Buffer, target: RichMenuSize): Promise<{buffer, mime, width, height, bytes}>
compose(areas: {bounds, image: Buffer}[], target: RichMenuSize): Promise<Buffer>
```

ขั้นตอนของ `normalize`:

1. ตรวจ mime — รับเฉพาะ `image/jpeg` และ `image/png` นอกนั้น reject
2. resize แบบ `cover` ไปที่ `target` (ขนาดที่ LINE รับเท่านั้น)
3. ถ้ามี alpha จริง → คง PNG ไว้ ไม่งั้นแปลงเป็น JPEG
4. **ไล่บีบจนกว่าจะ ≤ 1 MB** — JPEG: quality 90 → 80 → 70 → 60 · PNG: palette + compressionLevel 9 แล้วถ้ายังไม่ผ่านให้ flatten เป็น JPEG
5. ถ้ายังเกิน 1 MB หลังผ่านทุกทาง → โยน `ImageTooLargeError` พร้อมบอกขนาดที่ได้

`compose` วาดรูปแต่ละช่องลงบน canvas ขนาด `target` ตามพิกัด `bounds` แล้วส่งต่อเข้า `normalize`

**เทสต์:** รัน sharp จริงบน fixture (รูปมือถือ 4000x3000 ~6MB, PNG โปร่งใส, รูปเล็กเกิน) แล้ว assert byte size และ dimension

### 4.4 `publish/machine.ts`

state machine บริสุทธิ์ — **คืนแผนเป็น step list ไม่ยิง network เอง** ผู้เรียก (ฝั่ง Strapi service) เป็นคนรัน

```ts
type Step =
  | { kind: 'validate';    payload: RichMenuPayload }
  | { kind: 'create';      payload: RichMenuPayload }
  | { kind: 'uploadImage'; image: Buffer; mime: string }
  | { kind: 'upsertAlias'; aliasId: string }
  | { kind: 'setDefault' }
  | { kind: 'deleteOld';   lineRichMenuId: string }

plan(menu: RichMenuRecord): Step[]
compensate(completed: Step[], failedAt: Step): Step[]
```

ทำให้ลำดับ publish และการ rollback ทดสอบได้แบบ property test โดยไม่ต้องมี network เลย

### 4.5 `schema.ts`

zod schema ตามสเปก LINE:

- `areas.length` ≤ 20 และ ≥ 1
- ทุก `bounds` ต้องอยู่ในกรอบ `size` (LINE อนุญาตให้ซ้อนทับกันได้ จึงไม่ห้าม overlap)
- `chatBarText` 1–14 ตัวอักษร
- `name` ≤ 300 ตัวอักษร
- action แต่ละชนิดตรวจฟิลด์ตามชนิด (`uri` ต้องเป็น URL, `postback.data` ≤ 300 ตัวอักษร ฯลฯ)

---

## 5. `ui` — React ที่ไม่รู้จัก Strapi

### 5.1 UIPort — สัญญาที่ adapter ต้อง implement

`packages/ui` มี dependency ได้แค่ `react` (peer) และ `core`
**ห้าม import**: `@strapi/design-system`, `@strapi/helper-plugin`, `@strapi/strapi/admin`, `styled-components`, `react-router-dom`, `react-intl`

```ts
export interface UIPort {
  ui: {
    Button; IconButton; TextInput; Textarea; Select; Option; Checkbox;
    Toggle; Modal; Typography; Flex; Divider; Alert; Loader; Tooltip;
  };
  http:  { get(url); post(url, body); put(url, body); del(url) };
  toast: (msg: { type: 'success' | 'warning' | 'danger'; message: string }) => void;
  nav:   { push(path: string): void; Link: ComponentType<{to: string}> };
  t:     (id: string, values?: Record<string, unknown>) => string;
}
export const PortProvider: ComponentType<{value: UIPort; children: ReactNode}>;
export const usePort: () => UIPort;
```

**บังคับใช้:** `ui` มีชุดเทสต์ที่รันด้วย stub port ล้วน + ESLint rule `no-restricted-imports` บล็อกแพ็กเกจข้างบน
ถ้ามีใคร import DS เข้ามา CI พังทันที

### 5.2 สองอย่างที่จงใจไม่ผ่าน port

**CanvasEditor** — เขียนด้วย `div` + inline style + ไฟล์ CSS ธรรมดา ไม่แตะ DS ไม่แตะ styled-components
overlay ทุกช่องคำนวณจาก `bounds` เป็นเปอร์เซ็นต์:

```
left   = bounds.x      / size.width  * 100%
top    = bounds.y      / size.height * 100%
width  = bounds.width  / size.width  * 100%
height = bounds.height / size.height * 100%
```

ผลพลอยได้: **custom layout แทบไม่มีต้นทุนเพิ่ม** เพราะ component เดียวกันเรนเดอร์ bounds อะไรก็ได้
(โค้ดเดิมใช้ `<table>` hardcode `width: 33.33%` แยก 12 ไฟล์ ซึ่งไม่ต้องพอร์ตมาเลย)

**การอัปโหลดรูป** — ไม่เรียก Media Library UI ของ Strapi (v4 กับ v5 ต่างกันมาก) แต่ `POST /upload`
ซึ่งเป็น endpoint เดียวกันทั้งสองเวอร์ชัน แล้วเก็บ file id ที่ได้กลับมา

### 5.3 หน้าจอ

| หน้า | ที่อยู่ | เนื้อหา |
|---|---|---|
| Channels | Settings section | เพิ่ม/แก้ LINE OA: name, channelId, channelSecret, accessToken + ปุ่ม Test connection ที่ยิง `GET /v2/bot/info` แล้วโชว์ชื่อ OA |
| Rich menus | เมนูหลัก | ตารางกรองตาม channel, badge สถานะ, action: Edit / Duplicate / Publish / Set default / Delete |
| Editor | `/rich-menus/:id` | 3 pane — ซ้าย: template picker · กลาง: canvas + overlay · ขวา: ฟอร์ม action ของช่องที่เลือก<br>แท็บ: Design · Areas · Tabs (alias) · Schedule |
| Preview | modal | กรอบมือถือจำลอง + chat bar |

**Thumbnail ของ template สร้างเป็น SVG จาก `bounds` ตอน runtime** ไม่ bundle ไฟล์ภาพใด ๆ

เดิมตั้งใจใช้ชุด PNG guide ของ LINE แต่การแนบภาพของ LINE ไปกับ npm package สาธารณะมีคำถามเรื่องสิทธิ์
และในเมื่อ `bounds` มีพิกัดครบอยู่แล้ว การวาด `<rect>` ตามพิกัดจึงให้ผลลัพธ์ที่ถูกต้องกว่า คมทุกความละเอียด
และทำให้ **template ที่ผู้ใช้สร้างเองมี thumbnail อัตโนมัติ** ด้วยโค้ดเดียวกัน — ไม่มีไฟล์ภาพ 54 ไฟล์ให้ดูแล

### 5.4 form state กับ payload เป็นคนละรูปทรง — ต้องมี mapper คั่น

ยืนยันจากโค้ด SvelteKit ที่ใช้งานจริงก่อนหน้านี้: ฟอร์มเก็บ action เป็น object **แบน ที่มีทุกฟิลด์เสมอ**
(`label`, `text`, `uri`, `altUri`, `data`, `displayText` เป็น string ที่ default เป็น `''`) แล้วตรวจตามชนิดด้วย refine
ส่วน `core` เก็บเป็น discriminated union ตามสเปก LINE

ทั้งสองแบบถูก แต่คนละหน้าที่ และ **ต้องมีตัวแปลงคั่นอย่างชัดเจน** ใน `packages/ui`:

```
ActionFormState  ──toPayload()──▶  Action (discriminated union)  ──▶ LINE
      ▲                                     │
      └──────────── fromPayload() ◀──────────┘
```

- `toPayload()` ตัดฟิลด์ที่ไม่เกี่ยวกับชนิดที่เลือกทิ้ง — ถ้าไม่ตัด `''` จะหลุดไปถึง LINE แล้วโดนปฏิเสธ
- `fromPayload()` เติมฟิลด์ที่ขาดให้เป็น `''` — ทำให้ผู้ใช้**สลับชนิด action ไปกลับได้โดยไม่สูญเสียสิ่งที่พิมพ์ไว้**

ถ้าไม่มีชั้นนี้จะเจออาการใดอาการหนึ่งเสมอ: สลับชนิดแล้วข้อมูลที่พิมพ์หาย หรือ payload มีฟิลด์ว่างติดไป
mapper ตัวนี้เป็นฟังก์ชันบริสุทธิ์ จึงเป็นชิ้นที่ทดสอบง่ายที่สุดชิ้นหนึ่งของ `ui` และต้องมี round-trip test
(`fromPayload(toPayload(x))` ต้องรักษาฟิลด์ที่ผู้ใช้กรอกไว้)

### 5.5 chat bar มีสองสวิตช์ ไม่ใช่ค่าเดียว

LINE OA Manager แยกเป็นสองเรื่อง และผู้ใช้เข้าใจแบบนั้น:

| สวิตช์ | ตัวเลือก | ไปลงที่ payload |
|---|---|---|
| ข้อความบนแถบแชท | ใช้ค่าเริ่มต้น / กำหนดเอง (1–14 ตัว) | `chatBarText` |
| สถานะตอนเปิดแชท | กางเมนูไว้ / ยุบไว้ | `selected` |

`chatBarText` เป็นฟิลด์บังคับของ LINE API เสมอ — โหมด "ใช้ค่าเริ่มต้น" คือฝั่งเราเติมให้
จึงต้องเก็บ **โหมดที่ผู้ใช้เลือก** ลง DB ด้วย ไม่ใช่เก็บแต่ผลลัพธ์ ไม่งั้นตอนเปิดเมนูที่เซฟไว้กลับมาจะแยกไม่ออกว่า
ข้อความที่เห็นเป็นสิ่งที่ผู้ใช้พิมพ์เองหรือเป็นค่าที่ระบบเติม (ดู 7.1 ฟิลด์ `chatBarMode`)

---

## 6. Adapter

### 6.1 สิ่งที่ adapter แต่ละตัวรับผิดชอบ (ประมาณ 300–400 บรรทัด/ตัว)

1. Entry point ตามรูปแบบของเวอร์ชันนั้น
2. implement `UIPort` โดย map ไป Design System และ helper ของเวอร์ชันตัวเอง
3. Data access adapter — v4 ใช้ `strapi.entityService`, v5 ใช้ `strapi.documents()`
4. ลงทะเบียน content-type, route (`type: 'admin'`), permission, cron, i18n

### 6.2 Data access adapter

```ts
export interface Repo<T> {
  findMany(params): Promise<T[]>;
  findOne(id): Promise<T | null>;
  create(data): Promise<T>;
  update(id, data): Promise<T>;
  delete(id): Promise<void>;
}
```

- v5: `strapi.documents(uid)` — คืน `documentId` เป็น string
- v4: `strapi.entityService` — คืน `id` เป็น number

ฝั่ง service ที่ใช้ร่วมกันมองเห็นเป็น `id: string` เสมอ (v4 adapter แปลง number → string ที่ขอบ)

### 6.3 หมายเหตุ Community Edition

plugin RBAC action ลงทะเบียนได้ปกติบน CE แต่ CE ไม่มี custom role
→ permission จะไปโผล่ใน role มาตรฐาน 3 ตัว (Super Admin / Editor / Author) เท่านั้น ไม่กระทบดีไซน์

---

## 7. Data model

### 7.1 Content types (plugin-owned)

```
line-channel
  name                string, required
  channelId           string, required, unique
  channelSecret       text, encrypted
  channelAccessToken  text, encrypted, required
  isDefault           boolean

rich-menu
  name                string, required, max 300
  channel             relation → line-channel, required
  size                enum: large | compact
  chatBarText         string, 1–14 chars, required
  chatBarMode         enum: default | custom     ผู้ใช้เลือกเอง หรือระบบเติมให้ (ดู 5.5)
  selected            boolean            เปิดเมนูค้างไว้ตอนเข้าแชทไหม
  templateKey         string             null = custom layout
  areas               json               [{ bounds, action }]
  image               relation → plugin::upload.file
  areaImages          json               [{ index, fileId }]  สำหรับโหมด compose แยกช่อง
  aliasId             string, unique per channel
  status              enum: draft | publishing | published | failed
  lineRichMenuId      string             id ที่ LINE คืนมา
  publishedAt         datetime
  lastError           text

rich-menu-schedule
  richMenu            relation → rich-menu, required
  runAt               datetime, required
  op                  enum: set-default | clear-default | swap-alias
  state               enum: pending | running | done | failed
  lockedBy            string
  lockedAt            datetime
  lastError           text

rich-menu-audit       ดูรายละเอียดใน 11.5 — append-only
```

### 7.2 Plugin config

```js
// config/plugins.js
'line-rich-menu': {
  enabled: true,
  config: {
    encryptionKey: env('LINE_RM_ENCRYPTION_KEY'),  // ไม่ตั้ง = derive จาก APP_KEYS[0]
    scheduler: { enabled: true, cron: '* * * * *', lockTtlMs: 300000 },
    lineApiBaseUrl:     'https://api.line.me',       // ชี้ไป line-mock ได้
    lineApiDataBaseUrl: 'https://api-data.line.me',
    mockMode: false,
  }
}
```

### 7.3 รูปภาพ

ใช้ relation ไป `plugin::upload.file` ไม่เก็บไฟล์เอง
→ ผู้ใช้ได้ upload provider เดิม (local / S3 / Cloudinary) ฟรี และทำงานเหมือนกันทั้ง v4 และ v5

---

## 8. Publish state machine

rich menu บน LINE **แก้ไม่ได้หลังสร้าง** → การ "แก้ไข" คือสร้างใหม่ + สลับ + ลบเก่า

```
draft
  │
  ├─ validate  (POST /v2/bot/richmenu/validate)
  │     └─ ✗ → failed          ยังไม่แตะอะไรบน LINE เลย ไม่มีขยะค้าง
  │
  ├─ create    (POST /v2/bot/richmenu)
  │     └─ ✓ → เขียน lineRichMenuId ลง DB ทันที ก่อนทำขั้นต่อไป
  │
  ├─ uploadImage
  │     └─ ✗ → compensate: DELETE เมนูที่เพิ่งสร้าง → failed
  │
  ├─ upsertAlias / setDefault
  │     └─ ✗ → compensate: DELETE เมนูที่เพิ่งสร้าง → failed
  │
  └─ deleteOld (ลบเมนูเวอร์ชันก่อนหน้าบน LINE) → published
```

**สามข้อที่ทำให้ไม่เละ**

1. **pre-flight ด้วย `/richmenu/validate`** — จับ payload ผิดก่อนสร้างจริง ไม่ทิ้งขยะบน LINE
2. **เขียน `lineRichMenuId` ลง DB ทันทีที่ create สำเร็จ** — process ตายกลางทางก็ยังมีข้อมูลให้ reconcile job เก็บกวาด
3. **reconcile job** — เทียบ `GET /v2/bot/richmenu/list` กับ DB แล้วรายงานเมนูกำพร้า (ไม่ลบอัตโนมัติ เพราะอาจมีเมนูที่สร้างจากที่อื่น) ให้ผู้ใช้กดลบเอง

---

## 9. เมนูหลายแท็บ (alias)

**ปัญหา:** A → B → C ผูกกันด้วย `richmenuswitch` พอแก้ B rich menu id เปลี่ยน A กับ C ที่ชี้ id ตรง ๆ พังหมด

**ทางแก้:** ทุกเมนูที่ publish จะมี alias เสมอ โดย `aliasId` มาจาก slug ที่ผู้ใช้ตั้ง (ไม่ใช่ id ที่ LINE สุ่ม)
และ action `richmenuswitch` ชี้ที่ alias เท่านั้น

```
แก้ B → สร้าง B' บน LINE → POST /richmenu/alias/{b-alias} ให้ชี้ B' → ลบ B
A กับ C ไม่ต้องแตะเลย
```

→ alias เป็นพฤติกรรม default ไม่ใช่ option
→ dropdown เลือกปลายทางใน editor list จาก slug ของเมนูอื่นใน channel เดียวกัน อ่านรู้เรื่องกว่า id สุ่ม
→ validation: ถ้า action ชี้ไป alias ที่ยังไม่ถูก publish จะ error พร้อมบอกว่าต้อง publish เมนูไหนก่อน

---

## 10. การตั้งเวลา

`strapi.cron.add` มี API เหมือนกันทั้ง 4.25 และ 5

ทุกนาที job จะดึง schedule ที่ `runAt <= now` และ `state = pending` แล้ว **แย่ง lock ด้วย conditional UPDATE**:

```sql
UPDATE rich_menu_schedules
   SET locked_by = ?, locked_at = NOW()
 WHERE id = ?
   AND (locked_by IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
```

ตรวจ affected rows = 1 ค่อยทำงานต่อ ใช้ `strapi.db.connection` (knex) ซึ่งมีทั้งสองเวอร์ชัน ไม่ต้องพึ่ง Redis

สำหรับคนที่รัน serverless หรือหลาย instance: ปิด `scheduler.enabled` แล้วยิง `POST /line-rich-menu/schedules/tick`
จากข้างนอกแทนได้

---

## 11. ความปลอดภัย

### 11.1 Threat model โดยย่อ

| สินทรัพย์ที่ต้องปกป้อง | ผู้คุกคาม | ผลถ้าหลุด |
|---|---|---|
| `channelAccessToken` ของ LINE OA | admin role ต่ำกว่า, ผู้อ่าน DB/backup, log aggregator | ยึด OA ได้เต็ม — ส่งข้อความหาผู้ติดตามทุกคน |
| `channelSecret` | เหมือนกัน | ปลอมลายเซ็น webhook ได้ |
| สิทธิ์ publish | admin ที่ควรมีแค่สิทธิ์แก้ draft | เปลี่ยนเมนูที่ผู้ใช้ปลายทางเห็นจริง |
| Strapi admin session | XSS ใน admin panel | เท่ากับยึดทุกอย่างข้างบน |

หลักที่ยึด: **ป้องกันหลายชั้น ไม่พึ่ง RBAC ชั้นเดียว** และ **ไม่มีทางที่ token จะออกจากระบบได้ ไม่ว่าทาง response, log, หรือ error**

### 11.2 การเก็บความลับ

- `channelAccessToken` / `channelSecret` เข้ารหัส **AES-256-GCM**
  - IV สุ่มใหม่ 96-bit **ต่อ record** เก็บคู่กับ auth tag — ห้ามใช้ IV ซ้ำเด็ดขาด
  - key มาจาก config `encryptionKey` ถ้าไม่ตั้งจะ derive จาก `APP_KEYS[0]` ด้วย HKDF-SHA256 (info string คงที่)
  - รูปแบบที่เก็บ: `v1.<iv_b64>.<tag_b64>.<ciphertext_b64>` — มี version prefix ไว้รองรับการหมุน key ในอนาคต
- **เอกสารต้องเตือนชัด:** หมุน `APP_KEYS` โดยไม่ได้ตั้ง `encryptionKey` = อ่าน token เดิมไม่ออก ต้องกรอกใหม่
- repository layer **ตัดฟิลด์ลับออกโดยปริยาย** — ต้องเรียก `withSecrets()` อย่างจงใจถึงจะได้มา
  ป้องกันเคสคลาสสิกที่ `populate: '*'` หรือ endpoint ใหม่เผลอ leak
- API response redact เสมอ — คืนแค่ 4 ตัวท้าย (`••••••••abcd`)
- logger มี **scrubber** กรอง key ที่ชื่อเข้าข่าย (`token`, `secret`, `authorization`) ทุก log level

### 11.3 การตรวจ input

- zod ตรวจที่ **ขอบของ route ทุกเส้น** ก่อนถึง service — `strict()` ปฏิเสธฟิลด์แปลกปลอม
- **รูปอัปโหลด**: ตรวจ magic bytes ด้วย `sharp.metadata()` ไม่เชื่อ `Content-Type` ที่ client ส่งมา
  - จำกัดขนาดไฟล์ขาเข้าก่อน decode
  - ตั้ง `limitInputPixels` ของ sharp กัน **decompression bomb** (PNG เล็ก ๆ ที่ขยายเป็นหลายพันล้านพิกเซล)
- **ตัด image-by-URL ออกจาก v1.0 โดยเจตนา** — ฟีเจอร์ "วางลิงก์รูป" คือช่อง SSRF ตรง ๆ (ยิงเข้า metadata endpoint ของ cloud ได้) ไม่คุ้มกับที่ได้
- `uri` action: บังคับ scheme `https`, `http`, `tel`, หรือ `line` เท่านั้น ปฏิเสธ `javascript:`, `data:`, `file:`
- ทุก query ที่เขียนด้วย knex ใช้ **binding เท่านั้น** ห้าม string interpolation แม้แต่ใน lock query

### 11.4 การควบคุมสิทธิ์

- ทุก route เป็น `type: 'admin'` + policy `admin::hasPermissions` — **deny by default**
- permission แยกละเอียด:

  | uid | ครอบคลุม |
  |---|---|
  | `read` | ดูรายการและ draft |
  | `create` / `update` | แก้ draft |
  | `publish` | ยิงขึ้น LINE / ตั้ง default / สลับ alias |
  | `settings` | จัดการ channel และ token |

  แยก `settings` ออกจาก `publish` เพื่อให้มอบสิทธิ์สร้างเมนูได้โดยที่คนนั้นไม่มีวันเห็น token
- **rate limit ที่ endpoint publish** — token bucket ต่อ channel กันทั้งการกดรัวและกันชน rate limit ของ LINE เอง

### 11.5 Audit log

การเปลี่ยนเมนู default คือการเปลี่ยนสิ่งที่ผู้ใช้ปลายทางเห็นจริง จึงต้องตอบได้เสมอว่า **ใครทำ เมื่อไหร่ จากอะไรเป็นอะไร**

```
rich-menu-audit
  actor        relation → admin::user
  action       enum: publish | set-default | clear-default | swap-alias | delete | channel-update
  richMenu     relation → rich-menu (nullable)
  channel      relation → line-channel
  before       json     สถานะก่อนหน้า (redact แล้ว)
  after        json     สถานะหลัง (redact แล้ว)
  result       enum: success | failure
  errorCode    string
  createdAt    datetime
```

เขียน audit **ในทุกเส้นทาง รวมถึงตอนล้มเหลว** และเป็น append-only (ไม่มี route ให้แก้/ลบ)

### 11.6 Supply chain และ CI security

- **ไม่มี `postinstall` script** ในทุก package ที่ปล่อย
- `npm publish --provenance` ผ่าน GitHub Actions OIDC → ผู้ใช้ตรวจได้ว่า artifact มาจาก commit ไหนจริง ๆ
- lockfile ตรึงและ commit, Dependabot เปิด, บังคับ 2FA บนบัญชี npm
- CI gate: **gitleaks** (secret scanning), **osv-scanner / npm audit** (dependency CVE), **CodeQL** (SAST)
- `sharp` เป็น native dependency — ตรึงเวอร์ชันและทดสอบบน Node 20 ทั้ง glibc และ musl ถ้าจะแนะนำ Docker Alpine

### 11.7 การจัดการ error

`core` โยน typed error ที่มี **error code** ไม่ใช่ข้อความดิบจาก LINE
เพราะ error body ของ LINE อาจสะท้อน payload ที่ส่งไป (ซึ่งเคยมีเคสที่มี header ติดไปด้วย)
ชั้น UI เป็นคนแปล code เป็นข้อความตามภาษา — ได้ทั้งความปลอดภัยและ i18n ในตัวเดียว

---

## 12. i18n

- ภาษา: `en` (default) และ `th`
- v4: `registerTrads` + `prefixPluginTranslations` จาก `@strapi/helper-plugin`
- v5: `registerTrads` จาก `@strapi/strapi/admin`
- ไฟล์ translation อยู่ใน adapter (คนละรูปแบบ import) แต่ **เนื้อหาแชร์กัน** — เก็บ source of truth ไว้ที่
  `packages/ui/src/translations/{en,th}.json` แล้ว build step ของแต่ละ adapter copy ไป
- ข้อความ error จาก `core` เป็น error code ไม่ใช่ข้อความ → แปลที่ชั้น UI

---

## 13. Testing และ CI

### 13.1 ระดับการทดสอบ

| ชั้น | เครื่องมือ | ครอบอะไร | เกณฑ์ |
|---|---|---|---|
| `core` | vitest + msw + sharp จริง | LINE client ทุก endpoint, retry/backoff, image pipeline บน fixture จริง, state machine, zod schema | **coverage ≥ 90% ทั้ง line และ branch** |
| `core` | **fast-check** (property-based) | bounds ที่สุ่มมาต้องผ่าน/ไม่ผ่าน validation อย่างสม่ำเสมอ · ทุกจุดที่ publish ล้มต้องมี compensation ที่ไม่ทิ้งขยะ | ไม่มี counterexample |
| `core` | **Stryker** (mutation testing) | จับเทสต์ที่รันผ่านแต่ไม่ได้ assert อะไรจริง | mutation score ≥ 75% |
| `ui` | vitest + testing-library + **stub port** | ทุกหน้าจอเรนเดอร์และโต้ตอบได้โดยไม่มี Strapi | coverage ≥ 80% |
| `ui` | ESLint `no-restricted-imports` | บล็อก `@strapi/*`, `styled-components`, `react-router-dom`, `react-intl` | CI พังทันทีถ้ามีคนแอบ import |
| adapter | `examples/v4-app`, `examples/v5-app` + Playwright | smoke จริง: login → สร้าง → อัปรูป → publish → เห็น published | ผ่านทั้งสองเวอร์ชัน |
| security | vitest | ดู 13.2 | ทุกข้อต้องผ่าน |

### 13.2 ชุดทดสอบด้านความปลอดภัย (บังคับ ไม่ใช่ nice-to-have)

1. **RBAC matrix** — วนทุก route × ทุก role ยืนยันว่า role ที่ไม่มีสิทธิ์ได้ 403 ทุกเส้น ไม่มีข้อยกเว้น
2. **ไม่มีทางที่ token จะรั่ว** — เรียกทุก endpoint แล้ว assert ว่า plaintext token **ไม่ปรากฏใน response body ใด ๆ เลย** (ค้นทั้ง object แบบ deep)
3. **log scrubbing** — ดัก logger ระหว่างเทสต์ทั้งชุด แล้ว assert ว่าไม่มี token โผล่ในบรรทัดไหนเลย
4. **encryption round-trip** — เข้ารหัส/ถอดถูกต้อง, IV ไม่ซ้ำข้าม record, ข้อมูลที่ถูกแก้ 1 ไบต์ต้อง**ถอดไม่ผ่าน** (auth tag ทำงาน)
5. **decompression bomb** — PNG bomb ต้องถูกปฏิเสธ ไม่ใช่ทำให้ process ตาย
6. **magic byte** — ไฟล์ที่ตั้งชื่อ `.png` แต่เนื้อในเป็นอย่างอื่นต้องถูกปฏิเสธ
7. **URI scheme** — `javascript:`, `data:`, `file:` ต้องถูกปฏิเสธ
8. **audit completeness** — ทุก action ที่แตะ LINE ต้องมีแถว audit ทั้งกรณีสำเร็จและล้มเหลว

### 13.3 การทดสอบ image pipeline

ไม่ใช้ byte-exact snapshot เพราะผลลัพธ์ของ sharp ต่างกันตามเวอร์ชัน libvips
ใช้แทนด้วย: **dimension ต้องตรงเป๊ะ · byte size ≤ 1 MB · perceptual hash ต่างจาก golden ไม่เกิน threshold**

Fixture ที่ต้องมี: รูปมือถือ 4000×3000 ~6 MB · PNG โปร่งใส · รูปเล็กกว่าเป้า · ภาพที่บีบยาก (noise เต็มเฟรม) · PNG bomb

### 13.4 CI pipeline

```
typecheck → lint (+ import guard) → unit (core, ui) → mutation (core, nightly)
   → build ทุก package → strapi-plugin verify (v5)
   → e2e matrix: strapi[4.25.x, 5.x] × db[sqlite, postgres] × node 20
   → coverage gate → gitleaks → osv-scanner → CodeQL
   → (บน tag) changesets publish + npm provenance
```

`tools/line-mock` ทำให้ทั้ง pipeline รันได้โดยไม่ต้องมี credential จริง
มี job แยกแบบ manual สำหรับยิงใส่ LINE จริงด้วย secret ของ sandbox OA ก่อนปล่อยเวอร์ชันใหญ่

---

## 14. Demo hosting

**ที่เลือก: Render (free web service, Docker) + Neon (free Postgres) + Cloudinary (free media)**

| ส่วน | เหตุผล |
|---|---|
| Render free | 512 MB, ไม่ต้องใช้บัตร, ไม่หมดอายุ แลกกับ cold start ~1 นาที ซึ่งรับได้สำหรับ demo |
| Neon free | always-free จริง ไม่ pause ถาวร scale-to-zero หลัง 5 นาที (Supabase/Aiven pause เมื่อ inactive) |
| Cloudinary | จำเป็น เพราะ disk ของ Render free เป็น ephemeral ไฟล์หายทุก deploy |

**กับดักที่ต้องเลี่ยง:** `strapi build` (webpack บน v4) จะ OOM บน 512 MB
→ build admin ใน Docker image ตอน CI แล้ว deploy image ที่ build เสร็จแล้ว **ห้าม build บนเครื่อง Render**

**ตัวที่ตัดทิ้ง:** Fly.io ไม่มี free tier แล้ว (เหลือ trial 2 VM-hours / 7 วัน) · Koyeb ปิดรับ free tier ใหม่หลังถูก Mistral ซื้อต้นปี 2026
**สำรอง:** Northflank, Zeabur, Back4App

**deploy demo ตัวเดียวก่อน คือ v4** เพราะเป็นของที่ขาย (Render free ให้ 750 instance-hours/เดือน สองตัวจะเบียดกัน)

rich menu อัปรูปแบบ multipart ไป `api-data.line.me` → ไม่ต้องมี public HTTPS ให้ LINE เรียกกลับ cold start จึงไม่กระทบ
(จะต้องมี public URL ก็ต่อเมื่อ demo postback webhook — ตอน dev ใช้ `cloudflared tunnel`)

---

## 15. ลำดับงานและประมาณการ

| Phase | งาน | วัน |
|---|---|---|
| 0 | monorepo (pnpm + changesets) + CI skeleton + `tools/line-mock` | 1 |
| 1 | `core`: port templates, LINE client, image pipeline, state machine + เทสต์ | 3–4 |
| 2 | `ui`: UIPort, CanvasEditor, 4 หน้าจอ + stub-port tests | 3–4 |
| 3 | **v4 adapter** + `examples/v4-app` — **acceptance gate** | 2 |
| 4 | v5 adapter + `examples/v5-app` | 1–1.5 |
| 5 | security hardening: encryption, audit log, RBAC matrix, rate limit, security test suite | 1.5–2 |
| 6 | i18n th/en, docs, deploy demo, CI security gate, publish 1.0.0 | 1.5–2 |
| | **รวม** | **~14–17 วัน** |

**ทำไม v4 ก่อน v5 ทั้งที่ทีมอยู่ v5:** v4 เป็นสภาพแวดล้อมที่คับแคบกว่า (DS v1, webpack, router v5, entityService)
ถ้า UIPort ผ่าน v4 ได้ v5 เป็นการเติมที่ง่ายกว่า — กลับกันคือกับดักที่ทำ v5 เสร็จสวยแล้วมาพบว่า v4 รองรับไม่ได้

---

## 16. ความเสี่ยง

| ความเสี่ยง | ระดับ | การรับมือ |
|---|---|---|
| UIPort abstraction รั่ว — มี component ที่ DS v1/v2 ต่างกันจนแชร์ไม่ได้ | กลาง | จำกัด primitive ไว้ 15 ตัว ตัวไหนต่างมาก (เช่น Modal) ให้ adapter เขียนเองเต็ม ๆ ได้ ไม่ฝืน |
| Strapi 4 EOL → ลูกค้าอยู่บนแพลตฟอร์มไม่มี security patch | สูง (ธุรกิจ) | ระบุใน README ชัดเจน + ออกแบบให้ถอด v4 adapter ออกได้โดยไม่แตะ core/ui |
| Render free OOM ตอน build | กลาง | build ใน CI แล้ว deploy prebuilt Docker image |
| LINE เปลี่ยน API / เพิ่มข้อจำกัด | ต่ำ | client อยู่ที่เดียวใน `core` แก้จุดเดียว + contract test |
| รูปบีบไม่ลง 1 MB ในบางเคส | ต่ำ | มี fallback chain ครบและโยน error ที่บอกขนาดจริง ไม่ปล่อยให้ publish แล้วค่อยพัง |
| การ publish ล้มกลางทางทิ้งขยะบน LINE | กลาง | validate ก่อน + เขียน id ทันที + reconcile job |

---

## 17. สิ่งที่ตัดสินใจแล้ว

| ประเด็น | ผลสรุป |
|---|---|
| ปลายทาง | ปล่อย npm สาธารณะ (v5 ลง Marketplace, v4 npm-only) |
| ขอบเขต v1.0 | จัดเต็ม — custom layout + หลายแท็บ + ตั้งเวลา + compose รูปแยกช่อง |
| Custom action ของธุรกิจ | ตัดออก เหลือเฉพาะ action มาตรฐาน LINE |
| สถาปัตยกรรม | Approach A — monorepo: core + ui + 2 adapters |
| กลยุทธ์ปล่อย | 1.0.0 เต็มทีเดียว ทั้ง v4 และ v5 |
| ลำดับ build | v4 ก่อน v5 |
| npm scope | plugin ใช้ชื่อ unscoped (`strapi-plugin-line-rich-menu`, `strapi-plugin-line-rich-menu-v4`) · core/ui ใช้ `@fosivo/` (ปล่อยในนาม Fosivo Labs) |
| Demo hosting | Render + Neon + Cloudinary, deploy v4 ตัวเดียวก่อน |

---

## 18. อ้างอิง

- [Strapi v4 EOL notice](https://github.com/strapi/strapi/issues/24240)
- [Strapi v4 → v5 migration resources](https://strapi.io/blog/strapi-v4-to-v5-migration-resources)
- [Strapi 5 plugin creation](https://docs.strapi.io/cms/plugins-development/create-a-plugin)
- [LINE rich menus overview](https://developers.line.biz/en/docs/messaging-api/rich-menus-overview/)
- [LINE switch rich menus](https://developers.line.biz/en/docs/messaging-api/switch-rich-menus/)
- [LINE Messaging API reference](https://developers.line.biz/en/reference/messaging-api/)
- [Neon vs Supabase free tier 2026](https://agentdeals.dev/neon-vs-supabase)
- [Fly.io free tier 2026](https://www.saaspricepulse.com/blog/flyio-free-tier-2026)
- [@strapi/helper-plugin](https://www.npmjs.com/package/@strapi/helper-plugin)
- โค้ด SvelteKit เดิมที่ใช้เป็นต้นทางของ `templates.ts` (เก็บไว้นอก repo นี้)
