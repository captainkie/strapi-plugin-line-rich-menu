# examples/v5-app

Strapi **5.52.1** ของจริง ใช้เป็น acceptance gate ของ Plan 04 ไม่ใช่ตัวอย่างประกอบ

แอปนี้ **ไม่ได้อยู่ใน pnpm workspace** โดยตั้งใจ — มันต้องเป็นสภาพแวดล้อมเดียวกับของลูกค้า
คือ `node_modules` ที่ติดตั้งด้วย npm และปลั๊กอินที่ติดตั้งจาก tarball ของ `npm pack`
ไม่ใช่ซอร์สที่ลิงก์มา วิธีนี้พิสูจน์ `files` allowlist กับ `exports` map ไปพร้อมกัน

## พอร์ตต่างจาก examples/v4-app โดยตั้งใจ

| | v4-app | v5-app |
|---|---|---|
| Strapi | 1337 | **1338** |
| `tools/line-mock` | 4010 | **4011** |

CI รันทั้งสองแอปในงานเดียวกันไม่ได้ถ้าใช้พอร์ตเดียวกัน และคนที่รันทั้งคู่บนเครื่องตัวเองจะชนกัน
เงียบ ๆ โดยที่แอปที่สองไปคุยกับฐานข้อมูลและ mock ของแอปแรก

## รันทั้งชุดด้วยคำสั่งเดียว

จาก root ของ repo:

    pnpm e2e:v5

สคริปต์ (`scripts/e2e.sh`) จะ build เวิร์กสเปซ, เปิด `tools/line-mock`, `npm pack` ปลั๊กอิน,
ติดตั้งแอปกับ tarball, build admin, seed ผู้ใช้, บูต Strapi แล้วรัน Playwright — และตายทันที
พร้อม log ถ้าขั้นไหนล้ม สลับฐานข้อมูลด้วย `DATABASE_CLIENT=postgres pnpm e2e:v5`

> เทสต์ชุดนี้ **ต้องเริ่มจากฐานข้อมูลเปล่า** (มันยืนยันว่ามี channel อยู่ตัวเดียวเป๊ะ)
> ขา sqlite ถูกล้างให้เองทุกรอบด้วยการลบ `.tmp/` ส่วนขา postgres ต้อง drop schema เอง
> ก่อนรันซ้ำบนเครื่อง — บน CI ไม่ต้องทำอะไรเพราะ service container เกิดใหม่ทุก job

## สิ่งที่ต่างจาก v4-app นอกจากพอร์ต

| จุด | ทำไม |
|---|---|
| ไม่มี `@strapi/plugin-i18n` ใน `dependencies` | Strapi 5 รวม i18n เข้าแกนแล้ว การประกาศเป็นแพ็กเกจแยกทำให้บูตล้มด้วย `plugin i18n is already registered` |
| `scripts/seed.js` ใช้ `createStrapi()` | Strapi 5 ไม่ export ตัวโรงงานเป็น default อีกแล้ว ของเดิมได้ `TypeError: strapiFactory is not a function` |
| ล้าง `.strapi/` และ `dist/` เพิ่ม | Strapi 5 เก็บของชั่วคราวไว้ที่ `.strapi/` แทน `.cache/` และ `strapi build` ปล่อยผลลัพธ์ลงทั้ง `build/` และ `dist/` |
| มีด่าน "บันเดิลของแอดมินมีปลั๊กอินอยู่" | `strapi build` ของ v5 ใช้ Vite ซึ่ง **ข้ามปลั๊กอินที่ resolve `./strapi-admin` ไม่ได้โดยไม่ล้ม** ผลคือ API ครบทุกเส้นแต่เมนูซ้ายว่างเปล่า — curl ฝั่ง API มองไม่เห็นเลย |
| glob ของ tarball เป็น `-[0-9]*.tgz` | `strapi-plugin-line-rich-menu-*.tgz` จับ tarball ของ v4 (`...-v4-0.0.0.tgz`) ไปด้วยเมื่ออยู่โฟลเดอร์เดียวกัน แล้วแอป v5 จะติดตั้งปลั๊กอินของ v4 ซึ่งบูตขึ้นแต่ไม่มี route ไหนทำงาน |
| ตาราง RBAC ใช้ id ที่หน้าตาเหมือน `documentId` | `idParam` ของ v5 รับทั้ง `1` และสตริง 24 ตัวอักษร ค่าที่หน้าตาเหมือน id จริงทำให้ 403 มาจาก policy จริง ๆ ไม่ใช่จาก 400 ที่ zod ปฏิเสธก่อน |

## เทสต์ในนี้พิสูจน์อะไร

| ชั้น | สิ่งที่พิสูจน์ |
|---|---|
| ปลั๊กอินถูกโหลด | `/line-rich-menu/channels` ตอบ 401/403 ไม่ใช่ 404 — "ติดตั้งขึ้นแต่ไม่ถูกโหลด" คือความพังที่เงียบที่สุด |
| เส้นทางหลัก | login → สร้าง channel (token ถูกเข้ารหัส ไม่หลุดกลับมา · id เป็น `documentId` ไม่ใช่ตัวเลข) → อัปรูป → save (normalize) → publish → `published` |
| ImageStore | ไบต์ที่ LINE ได้รับ = ไบต์ที่ upload plugin เก็บไว้ · ไม่มีโฟลเดอร์ชั่วคราวค้าง · กิ่ง `fetch()` ของ `read()` ถูกเดินจริง |
| RBAC | role ที่ไม่มีสิทธิ์ → 403 ทั้ง 15 เส้น · role ที่มีแค่ `read` อ่านได้แต่ถูกกันจาก `settings`/`write`/`publish` |
| scheduler | schedule ที่ถึงกำหนดถูก **claim ได้จริง** (`document_id` มีอยู่จริงในสคีมาและค่าตรงกับ id ที่ชั้น service ถือ) แล้วทำจนจบถึง LINE |
| บันเดิล admin | หน้าปลั๊กอินเรนเดอร์ได้จริงบน DS v2 + Vite + router v6 และไม่มี error หลุดขึ้น console |

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

## `package-lock.json` ต้องไม่มีแถวของปลั๊กอิน

tarball ถูกแพ็กใหม่ทุกรอบ แล้ว `integrity` ที่ commit ไว้จะค้างเป็นของรอบก่อนทันทีที่ซอร์สเปลี่ยน
ผลที่วัดได้จริงมีสองแบบและแย่ทั้งคู่ — บนเครื่องที่มี npm cache อยู่แล้ว `npm install` จะติดตั้ง
ของเก่าเงียบ ๆ (รอบนั้นเทสต์โค้ดของเมื่อวานโดยรายงานว่า `added 1 package` สำเร็จ) ส่วนบน CI
ที่ cache ว่าง มันจะล้มด้วย `EINTEGRITY` ทันที `--no-save` คือสิ่งที่กันแถวนั้นไม่ให้ถูกเขียนกลับ
และ `scripts/e2e.sh` มีด่านตรวจทั้งสองอย่าง: แถวใน lock และ checksum ของ `dist` ที่ติดตั้งจริง
