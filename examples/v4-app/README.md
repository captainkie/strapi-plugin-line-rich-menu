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

## รันทีละขั้นด้วยมือ

    cp .env.example .env
    pnpm --filter @fosivo/line-mock start &          # จาก root ของ repo
    pnpm build                                        # จาก root ของ repo
    (cd ../../packages/strapi-v4 && npm pack --pack-destination /tmp)
    npm install
    npm install /tmp/strapi-plugin-line-rich-menu-v4-*.tgz
    npm run build && npm run seed
    npm start
    npm run test:e2e

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
