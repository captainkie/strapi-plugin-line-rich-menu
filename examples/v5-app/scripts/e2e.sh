#!/usr/bin/env bash
#
# ประตูเดียวของ Task 10 — `pnpm e2e:v5` เรียกไฟล์นี้
#
# ลำดับในนี้ไม่ใช่แค่ความสะดวก: ปลั๊กอินต้องถูก **แพ็กเป็น tarball แล้วติดตั้งด้วย npm**
# ไม่ใช่ลิงก์จากเวิร์กสเปซ เพราะ tarball คือสิ่งเดียวที่พิสูจน์ `files` allowlist กับ `exports` map
# ไปพร้อมกัน — ถ้า `dist/admin/index.mjs` ไม่ได้ถูกห่อไปด้วย การลิงก์ซอร์สจะไม่มีทางจับได้
# และปลั๊กอินจะติดตั้งขึ้น บูตขึ้น แล้วไม่มีลิงก์ในเมนูซ้าย โดยไม่มีอะไรใน log บอกสาเหตุ
#
# พอร์ตทั้งสองตัวต่างจาก examples/v4-app โดยตั้งใจ (Strapi 1338 ไม่ใช่ 1337 · mock 4011
# ไม่ใช่ 4010) เพื่อให้ทั้งสองแอปรันในงานเดียวกันของ CI และบนเครื่องเดียวกันได้พร้อมกัน
# ถ้าใช้พอร์ตเดียวกัน แอปที่สองจะไปคุยกับฐานข้อมูลและ mock ของแอปแรกอย่างเงียบ ๆ
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$APP_DIR/../.." && pwd)"
PACK_DIR="$APP_DIR/.pack"

STRAPI_PORT=1338
MOCK_PORT=4011

MOCK_PID=""
STRAPI_PID=""

# เก็บกวาดโดยดูจาก **พอร์ต** ไม่ใช่จากรูปแบบ command line — เหตุผลเต็มอยู่ใน
# examples/v4-app/scripts/e2e.sh โดยย่อคือ `pnpm --filter ... start` แตกลูกหลายชั้นจน
# ไม่มีชั้นไหนมีสตริงที่ `pkill -f` จับได้ แล้ว mock ของรอบก่อนจะค้างข้ามรอบ ทำให้ด่าน
# readiness ได้ 200 จากตัวเก่าและทั้งรอบเดินต่อโดยคุยกับ store ของเมื่อวาน
listeners() { lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null || true; }

free_port() {
  local port="$1" pids signal
  for signal in TERM TERM TERM KILL; do
    pids="$(listeners "$port")"
    [ -z "$pids" ] && return 0
    # shellcheck disable=SC2086
    kill "-$signal" $pids 2>/dev/null || true
    sleep 1
  done
  [ -z "$(listeners "$port")" ]
}

cleanup() {
  [ -n "$STRAPI_PID" ] && kill "$STRAPI_PID" 2>/dev/null || true
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null || true
  free_port "$STRAPI_PORT" || true
  free_port "$MOCK_PORT" || true
}
trap cleanup EXIT

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

step "build เวิร์กสเปซ"
(cd "$ROOT_DIR" && pnpm build)

# token ของ channel ที่ acceptance.spec.ts สร้าง — ประกาศไว้ที่เดียวเพื่อให้ด่าน readiness
# ข้างล่างถาม mock ด้วย store ใบเดียวกับที่เทสต์จะเขียนลงไปจริง
export E2E_CHANNEL_ACCESS_TOKEN='e2e-access-token-ABCD'

step "เริ่ม LINE mock ที่ $MOCK_PORT"
free_port "$MOCK_PORT" || { echo "::error::พอร์ต $MOCK_PORT ยังถูกใช้อยู่และฆ่าไม่ลง" >&2; exit 1; }
free_port "$STRAPI_PORT" || { echo "::error::พอร์ต $STRAPI_PORT ยังถูกใช้อยู่และฆ่าไม่ลง" >&2; exit 1; }
# ส่ง PORT ให้ mock แบบชัดเจนแทนที่จะพึ่งค่าปริยาย 4010 ของมัน — ตัวแปรชื่อ `PORT` เป็นตัวเดียว
# กับที่ Strapi ใช้ ถ้าปล่อยให้มันรับค่าจาก environment ที่ไหลมาจากข้างนอก mock จะไปแย่ง
# พอร์ตของ Strapi แทน แล้วล้มด้วย EADDRINUSE กลางรอบโดยไม่มีอะไรชี้ว่าทำไม
(cd "$ROOT_DIR" && PORT="$MOCK_PORT" pnpm --filter @fosivo/line-mock start >"$APP_DIR/.tmp-line-mock.log" 2>&1) &
MOCK_PID=$!
until curl -sf -H 'Authorization: Bearer wait' "http://127.0.0.1:$MOCK_PORT/v2/bot/info" >/dev/null; do
  if ! kill -0 "$MOCK_PID" 2>/dev/null; then
    echo "::error::line-mock ตายระหว่างบูต — log ท้าย 40 บรรทัด:" >&2
    tail -40 "$APP_DIR/.tmp-line-mock.log" >&2
    exit 1
  fi
  sleep 1
done

# ด่านนี้ถามว่า "ตัวที่ตอบอยู่คือตัวที่เราเพิ่งเริ่มหรือเปล่า" ไม่ใช่แค่ "มีอะไรตอบไหม" —
# ตัวที่เพิ่งเริ่มต้องยังไม่มี rich menu สักอัน ถ้ามี แปลว่ากำลังคุยกับตัวค้างจากรอบก่อน
#
# ต้องถามด้วย **token ตัวเดียวกับที่เทสต์ใช้** เพราะ mock แยก store ตาม access token แล้ว
# (หนึ่ง token = หนึ่ง OA เหมือน LINE จริง) — ถามด้วย token อื่นจะได้ store เปล่าเสมอ แล้วด่านนี้
# จะเขียวให้กับ mock ค้างจากรอบก่อนทุกครั้ง ซึ่งคือสิ่งที่มันมีไว้จับพอดี
mock_menus="$(curl -sf -H "Authorization: Bearer $E2E_CHANNEL_ACCESS_TOKEN" "http://127.0.0.1:$MOCK_PORT/v2/bot/richmenu/list")"
if [ "$mock_menus" != '{"richmenus":[]}' ]; then
  echo "::error::mock ที่พอร์ต $MOCK_PORT ไม่ใช่ตัวที่รอบนี้เพิ่งเริ่ม — ยังถือ rich menu ของรอบก่อนอยู่" >&2
  echo "  /v2/bot/richmenu/list ตอบ: $mock_menus" >&2
  tail -20 "$APP_DIR/.tmp-line-mock.log" >&2
  exit 1
fi

step "แพ็กปลั๊กอินเป็น tarball เหมือนที่ผู้ใช้ได้จาก npm"
# แพ็กลง `.pack/` ของแอปแล้วตั้งชื่อคงที่ (ไม่มีเลขเวอร์ชัน) เพราะ package.json ของแอปต้อง
# **ประกาศปลั๊กอินไว้ใน dependencies จริง ๆ** — Strapi ค้นหาปลั๊กอินจาก `info.dependencies`
# ของแอปเท่านั้น ไฟล์ที่อยู่ใน node_modules แต่ไม่ได้ถูกประกาศไว้จะถูกมองข้ามเงียบ ๆ
# แล้ว `config/plugins.js` จะล้มด้วย "because line-rich-menu is not installed"
#
# glob ต้องเป็น `strapi-plugin-line-rich-menu-[0-9]*.tgz` ไม่ใช่ `strapi-plugin-line-rich-menu-*.tgz`
# — อย่างหลังจับ tarball ของ v4 (`strapi-plugin-line-rich-menu-v4-0.0.0.tgz`) ไปด้วยเมื่อทั้งสอง
# อยู่ในโฟลเดอร์เดียวกัน แล้วแอป v5 จะติดตั้งปลั๊กอินของ v4 ทับ ซึ่ง **บูตขึ้นได้** แต่ไม่มี route
# ไหนทำงาน ตอนนี้ PACK_DIR แยกต่อแอปอยู่แล้วจึงยังไม่ชน แต่ด่านนี้ราคาศูนย์และกันวันที่ใครย้ายมันรวม
rm -rf "$PACK_DIR"
mkdir -p "$PACK_DIR"
(cd "$ROOT_DIR/packages/strapi-v5" && npm pack --pack-destination "$PACK_DIR")
mv "$PACK_DIR"/strapi-plugin-line-rich-menu-[0-9]*.tgz "$PACK_DIR/strapi-plugin-line-rich-menu.tgz"

# `exports` map ชี้ไปที่ `./dist/admin/index.mjs` — ถ้ามันไม่ได้ถูกห่อมากับ tarball
# Vite ของ `strapi build` จะ resolve `./strapi-admin` ไม่ได้แล้ว **ข้ามปลั๊กอินไปเงียบ ๆ**
# ผลคือ server ครบทุก route แต่เมนูซ้ายไม่มีลิงก์เลย ด่านนี้จับตั้งแต่ก่อนติดตั้ง
# อ่านรายการครั้งเดียวเก็บไว้ แล้วค้นจากตัวแปรด้วย here-string — **ห้ามเป็น pipeline**
#
# เดิมเขียนว่า `tar tzf ... | grep -qx "$required"` ซึ่งพังในแบบที่มองไม่เห็นจากเครื่องตัวเอง:
# `grep -q` ออกทันทีที่เจอบรรทัดแรกที่ตรง ทำให้ `tar` ที่ยังเขียนอยู่โดน SIGPIPE แล้วจบด้วยสถานะ
# ไม่ใช่ศูนย์ พอสคริปต์ตั้ง `set -o pipefail` ไว้ สถานะของทั้ง pipeline จึงกลายเป็นล้มเหลว **ทั้งที่
# grep เจอของที่หา** แล้ว `!` ก็กลับค่าอีกชั้น ผลคือด่านนี้ฟ้องว่าไฟล์หายในตอนที่ไฟล์อยู่ครบ
#
# มันขึ้นกับจังหวะล้วน ๆ: รายการ 43 บรรทัดเล็กพอที่ tar จะเขียนจบก่อน grep ออกบนเครื่องพัฒนา
# จึงเขียวเสมอในเครื่อง และแดงทุกครั้งบน runner ของ CI ที่ตารางเวลาต่างกัน — ด่านที่ฟ้องผิดแบบนี้
# อันตรายพอ ๆ กับด่านที่ไม่ฟ้อง เพราะคนถัดไปจะปิดมันทิ้งแทนที่จะแก้
#
# `-F` ด้วย เพราะ path มีจุด และในโหมด regex จุดแปลว่า "ตัวอะไรก็ได้" ซึ่งหลวมกว่าที่ตั้งใจ
tarball_entries="$(tar tzf "$PACK_DIR/strapi-plugin-line-rich-menu.tgz")"
for required in package/dist/server/index.js package/dist/server/index.mjs \
                package/dist/admin/index.js package/dist/admin/index.mjs; do
  if ! grep -qxF -- "$required" <<<"$tarball_entries"; then
    echo "::error::tarball ไม่มี $required — ตรวจ files allowlist กับ exports map ใน package.json" >&2
    printf '%s\n' "$tarball_entries" >&2
    exit 1
  fi
done

step "ติดตั้งแอปตัวอย่างและปลั๊กอินจาก tarball"
cd "$APP_DIR"
[ -f .env ] || cp .env.example .env

# อ่าน .env เองแทน `set -a; . ./.env` — ค่าที่ตั้งมาจากภายนอก **ต้องชนะไฟล์เสมอ**
# การ source ไฟล์ตรง ๆ เขียนทับตัวแปรที่ตั้งมาแล้ว ซึ่งแปลว่าขา postgres ของ matrix ใน CI
# (ที่ส่ง DATABASE_CLIENT=postgres เข้ามาทาง env) จะถูก `.env` ดึงกลับไปเป็น sqlite เงียบ ๆ
# แล้วเขียวทั้งสองขาโดยไม่เคยแตะ Postgres เลยแม้แต่ครั้งเดียว — ด่านที่เขียวโดยไม่บังคับอะไร
# แบบเดียวกับที่ STANDING-CORRECTIONS S2 เตือนไว้
# กติกาเดียวกับที่ playwright.config.ts ใช้ เพื่อให้ทั้งสองโปรเซสเห็นค่าชุดเดียวกัน
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"
  case "$key" in *[!A-Z0-9_]*|'') continue ;; esac
  eval "current=\${$key+set}"
  [ "${current:-}" = set ] && continue
  export "$key=${line#*=}"
done < .env

# ลำดับความสำคัญจึงเป็น env ภายนอก > .env > ค่าปริยาย — ไม่ใช่ .env ทับทุกอย่าง
export DATABASE_CLIENT="${DATABASE_CLIENT:-sqlite}"
echo "DATABASE_CLIENT=$DATABASE_CLIENT"

# .env อาจถูกคัดลอกไว้ตั้งแต่ก่อนที่พอร์ตจะเปลี่ยน — ถ้าปล่อยผ่าน Strapi จะฟังคนละพอร์ตกับที่
# ด่านข้างล่างและ Playwright ยิงไปหา แล้วรอบทั้งรอบจะค้างที่ readiness โดยไม่บอกว่าเพราะอะไร
if [ "${PORT:-}" != "$STRAPI_PORT" ]; then
  echo "::error::PORT=${PORT:-<ว่าง>} แต่สคริปต์นี้รอที่ $STRAPI_PORT — แก้ .env ให้ตรงกับ .env.example" >&2
  exit 1
fi

# package-lock.json ที่ commit ไว้ **ต้องไม่มี** แถวของปลั๊กอิน เพราะ tarball ถูกแพ็กใหม่ทุกรอบ
# แล้ว integrity ที่ commit ไว้จะค้างเป็นของรอบก่อนทันทีที่ซอร์สเปลี่ยน ผลที่วัดได้จริงมีสองแบบ
# และแย่ทั้งคู่: บนเครื่องที่มี npm cache อยู่แล้ว `npm install` จะ **ติดตั้งของเก่าเงียบ ๆ**
# (รอบนั้นเทสต์โค้ดของเมื่อวาน) ส่วนบน CI ที่ cache ว่าง มันจะล้มด้วย EINTEGRITY ทันที
if [ -f package-lock.json ] && grep -q '"node_modules/strapi-plugin-line-rich-menu"' package-lock.json; then
  echo "::error::package-lock.json มีแถวของ strapi-plugin-line-rich-menu อยู่ — ลบทิ้งก่อน commit" >&2
  echo "แถวนั้นตรึง integrity ของ tarball รอบก่อนไว้ ทำให้รอบนี้ได้ของเก่าเงียบ ๆ หรือล้มด้วย EINTEGRITY" >&2
  exit 1
fi

# `--no-save` ทั้งสองคำสั่งด้วยเหตุผลเดียวกัน — ปลั๊กอินยัง **ถูกประกาศไว้ใน dependencies**
# ของ package.json ตามปกติ (Strapi ต้องเห็นมันที่นั่นถึงจะโหลด) แค่ไม่ให้ npm เขียนผลลัพธ์
# ของการติดตั้งกลับลงไฟล์ที่ commit
rm -rf node_modules/strapi-plugin-line-rich-menu
npm install --no-audit --no-fund --no-save
npm install --no-audit --no-fund --no-save "$PACK_DIR/strapi-plugin-line-rich-menu.tgz"

# ไบต์ใน node_modules ต้องเป็นไบต์ของ tarball รอบนี้ ไม่ใช่ของที่ npm หยิบมาจาก cache
# ด่านนี้พิสูจน์ตัวเองมาแล้วในฝั่ง v4: ตอนที่ lock ยังตรึง integrity ไว้ npm รายงาน
# "added 1 package" สำเร็จทุกอย่าง แต่ dist ใน node_modules เป็นของรอบก่อน
packed_sha="$(tar -xzOf "$PACK_DIR/strapi-plugin-line-rich-menu.tgz" package/dist/server/index.js | shasum -a 256 | cut -d' ' -f1)"
installed_sha="$(shasum -a 256 < node_modules/strapi-plugin-line-rich-menu/dist/server/index.js | cut -d' ' -f1)"
if [ "$packed_sha" != "$installed_sha" ]; then
  echo "::error::node_modules ไม่ได้ไบต์ของ tarball รอบนี้ (packed=$packed_sha installed=$installed_sha)" >&2
  exit 1
fi

step "ล้างสถานะของรอบก่อน"
# Strapi 5 เก็บของชั่วคราวไว้ที่ `.strapi/` แทน `.cache/` ของ v4 และ `strapi build` ปล่อย
# ผลลัพธ์ลงทั้ง `build/` และ `dist/` — เหลือของรอบก่อนไว้แม้แถวเดียวก็ทำให้ด่าน
# "บันเดิลของแอดมินมีปลั๊กอินอยู่" เขียวจากไฟล์เมื่อวาน ซึ่งเป็นด่านที่มีไว้จับตรงกันข้ามพอดี
rm -rf .tmp build dist .strapi public/uploads
mkdir -p public/uploads .tmp/e2e-tmp
touch public/uploads/.gitkeep

step "build admin แล้ว seed ผู้ใช้"
npm run build
node scripts/seed.js

step "ยืนยันว่าบันเดิลของแอดมินถูก Vite รวมปลั๊กอินเข้าไปจริง"
# `strapi build` ของ v5 ใช้ Vite ซึ่งจะข้ามปลั๊กอินที่ resolve `./strapi-admin` ไม่ได้
# **โดยไม่ล้ม** — ผลคือ server ทำงานครบทุก route แต่เมนูซ้ายไม่มีลิงก์ของปลั๊กอินเลย
# ซึ่งเป็นความพังที่ curl ฝั่ง API มองไม่เห็นสักนิด
if ! grep -rq "line-rich-menu" build/ 2>/dev/null; then
  echo "::error::บันเดิลของแอดมินไม่มีปลั๊กอินอยู่เลย — ตรวจ exports map และ strapi-plugin verify" >&2
  exit 1
fi

step "บูต Strapi"
# TMPDIR ตัวเดียวกันทั้งสองฝั่ง เพื่อให้ด่าน "ไม่มีโฟลเดอร์ชั่วคราวค้าง" ใน acceptance.spec.ts
# มองเห็นของจริง ไม่ใช่มองโฟลเดอร์ที่ไม่มีใครเขียนลงไปตั้งแต่แรก
export TMPDIR="$APP_DIR/.tmp/e2e-tmp"
npx strapi start >"$APP_DIR/.tmp-strapi.log" 2>&1 &
STRAPI_PID=$!
until curl -sf "http://127.0.0.1:$STRAPI_PORT/admin" >/dev/null; do
  if ! kill -0 "$STRAPI_PID" 2>/dev/null; then
    echo "Strapi ตายระหว่างบูต — log ท้าย 60 บรรทัด:" >&2
    tail -60 "$APP_DIR/.tmp-strapi.log" >&2
    exit 1
  fi
  sleep 2
done

step "ยืนยันว่าปลั๊กอินถูกโหลดจริง ไม่ใช่แค่ติดตั้งสำเร็จ"
# ปลั๊กอินที่ติดตั้งขึ้นแต่ไม่ถูกโหลดคือความล้มเหลวที่เงียบที่สุดของ Strapi — บูตผ่านปกติทุกอย่าง
# ไม่มีอะไรใน log บอก แต่ไม่มี route ไหนของปลั๊กอินอยู่จริง 401/403 คือหลักฐานว่า route
# ถูกลงทะเบียนแล้วและ policy ทำงาน ส่วน 404 คือหลักฐานว่ามันไม่ได้ถูกโหลดเลย
if ! curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$STRAPI_PORT/line-rich-menu/channels" | grep -qE '^(401|403)$'; then
  echo "::error::route ของปลั๊กอินไม่ตอบ 401/403 — แปลว่ามันไม่ได้ถูกลงทะเบียนเลย" >&2
  curl -s -i "http://127.0.0.1:$STRAPI_PORT/line-rich-menu/channels" | head -20 >&2
  tail -60 "$APP_DIR/.tmp-strapi.log" >&2
  exit 1
fi

step "รัน Playwright"
export E2E_TMPDIR="$TMPDIR"
npx playwright install chromium >/dev/null 2>&1 || npx playwright install --with-deps chromium
npm run test:e2e
