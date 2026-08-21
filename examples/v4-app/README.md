# examples/v4-app

Strapi **4.25.11** ของจริง ใช้เป็น acceptance gate ของ Plan 03 ไม่ใช่ตัวอย่างประกอบ

แอปนี้ **ไม่ได้อยู่ใน pnpm workspace** โดยตั้งใจ — มันต้องเป็นสภาพแวดล้อมเดียวกับของลูกค้า
คือ `node_modules` ที่ติดตั้งด้วย npm และปลั๊กอินที่ติดตั้งจาก tarball ของ `npm pack`
ไม่ใช่ซอร์สที่ลิงก์มา วิธีนี้พิสูจน์ `files` allowlist และไฟล์ shim ที่ root ไปพร้อมกัน

## รันทั้งชุดด้วยคำสั่งเดียว

จาก root ของ repo:

    pnpm e2e:v4

สคริปต์ (`scripts/e2e.sh`) จะ build เวิร์กสเปซ, เปิด `tools/line-mock`, `npm pack` ปลั๊กอิน,
ติดตั้งแอปกับ tarball, build admin, seed ผู้ใช้, บูต Strapi แล้วรัน Playwright — และตายทันที
พร้อม log ถ้าขั้นไหนล้ม สลับฐานข้อมูลด้วย `DATABASE_CLIENT=postgres pnpm e2e:v4`

> เทสต์ชุดนี้ **ต้องเริ่มจากฐานข้อมูลเปล่า** (มันยืนยันว่ามี channel อยู่ตัวเดียวเป๊ะ)
> ขา sqlite ถูกล้างให้เองทุกรอบด้วยการลบ `.tmp/` ส่วนขา postgres ต้อง drop schema เอง
> ก่อนรันซ้ำบนเครื่อง — บน CI ไม่ต้องทำอะไรเพราะ service container เกิดใหม่ทุก job

## รันทีละขั้นด้วยมือ

    cp .env.example .env
    pnpm --filter @fosivo/line-mock start &          # จาก root ของ repo
    pnpm build                                        # จาก root ของ repo
    (cd ../../packages/strapi-v4 && npm pack --pack-destination ../../examples/v4-app/.pack)
    mv .pack/strapi-plugin-line-rich-menu-v4-*.tgz .pack/strapi-plugin-line-rich-menu-v4.tgz
    npm install --no-save
    npm install --no-save .pack/strapi-plugin-line-rich-menu-v4.tgz
    npm run build && npm run seed
    npm start
    npm run test:e2e

### ทำไมต้อง `.pack/` กับ `--no-save`

Strapi 4 ค้นหาปลั๊กอินจาก **`dependencies` ใน package.json ของแอป** เท่านั้น
(`core/loaders/plugins/get-enabled-plugins.js` อ่าน `info.dependencies`) ไฟล์ที่อยู่ใน
`node_modules` แต่ไม่ได้ถูกประกาศไว้จะถูกมองข้ามเงียบ ๆ แล้ว `config/plugins.js` จะล้มด้วย
`Error loading the plugin line-rich-menu because line-rich-menu is not installed`
ปลั๊กอินจึงถูกประกาศไว้ที่ `file:.pack/strapi-plugin-line-rich-menu-v4.tgz` — path สัมพัทธ์
กับตัวแอปและชื่อที่ไม่ผูกกับเลขเวอร์ชัน เพื่อให้ไฟล์ที่ commit ใช้ได้บนทุกเครื่อง

`package-lock.json` ที่ commit ไว้ **ต้องไม่มีแถวของปลั๊กอิน** เพราะ tarball ถูกแพ็กใหม่ทุกรอบ
แล้ว `integrity` ที่ commit ไว้จะค้างเป็นของรอบก่อนทันทีที่ซอร์สเปลี่ยน ผลที่วัดได้จริงมีสองแบบ
และแย่ทั้งคู่ — บนเครื่องที่มี npm cache อยู่แล้ว `npm install` จะติดตั้งของเก่าเงียบ ๆ
(รอบนั้นเทสต์โค้ดของเมื่อวานโดยรายงานว่า `added 1 package` สำเร็จ) ส่วนบน CI ที่ cache ว่าง
มันจะล้มด้วย `EINTEGRITY` ทันที `--no-save` คือสิ่งที่กันแถวนั้นไม่ให้ถูกเขียนกลับ และ
`scripts/e2e.sh` มีด่านตรวจทั้งสองอย่าง: แถวใน lock และ checksum ของ `dist` ที่ติดตั้งจริง

## เทสต์ในนี้พิสูจน์อะไร

| ชั้น | สิ่งที่พิสูจน์ |
|---|---|
| เส้นทางหลัก | login → สร้าง channel (token ถูกเข้ารหัส ไม่หลุดกลับมา) → อัปรูป → save (normalize) → publish → `published` |
| ImageStore | ไบต์ที่ LINE ได้รับ = ไบต์ที่ upload plugin เก็บไว้ · ไม่มีโฟลเดอร์ชั่วคราวค้าง · กิ่ง `fetch()` ของ `read()` ถูกเดินจริง |
| RBAC | role ที่ไม่มีสิทธิ์ → 403 ทั้ง 14 เส้น · role ที่มีแค่ `read` อ่านได้แต่ถูกกันจาก `settings`/`write`/`publish` |
| บันเดิล admin | หน้าปลั๊กอินเรนเดอร์ได้จริงบน DS v1 + webpack 5 + router v5 และไม่มี error หลุดขึ้น console |

## ผู้ใช้ที่ seed ไว้

| env prefix | role ของ Strapi | สิทธิ์ของปลั๊กอิน |
|---|---|---|
| `E2E_ADMIN` | `strapi-super-admin` | ครบทุกอย่าง |
| `E2E_AUTHOR` | `strapi-author` | ไม่มีเลย — ใช้พิสูจน์ 403 |
| `E2E_READER` | `strapi-editor` | `read` ตัวเดียว (สิทธิ์เดิมของ role ถูกแทนที่ทั้งชุด) |

## `providers/upload-absolute-url` มีไว้ทำไม

`createImageStore.read()` มีสองกิ่ง: อ่านจากดิสก์เมื่อ provider คืน url สัมพัทธ์ (local)
และ `fetch()` เมื่อ provider คืน url เต็ม (S3, Cloudinary) ถ้าใช้ local provider เปล่า ๆ
กิ่งหลังจะไม่เคยถูกเดินเลยทั้งแผน provider ตัวนี้คือ local provider ตัวจริงที่ถูกห่อไว้บาง ๆ
ให้คืน url สัมบูรณ์ **เฉพาะไฟล์ที่ชื่อขึ้นต้นด้วย `remote-`** เท่านั้น เส้นทางหลักจึงยังเป็น
local provider แท้ ๆ เหมือนที่ลูกค้าได้ ส่วนกิ่ง fetch ถูกพิสูจน์ในการบูตครั้งเดียวกัน

ไฟล์นี้เป็นของแอปตัวอย่าง ไม่ได้ถูกปล่อยขึ้น npm พร้อมปลั๊กอิน
