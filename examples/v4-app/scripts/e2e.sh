#!/usr/bin/env bash
#
# ประตูเดียวของ Task 20 — `pnpm e2e:v4` เรียกไฟล์นี้
#
# ลำดับในนี้ไม่ใช่แค่ความสะดวก: ปลั๊กอินต้องถูก **แพ็กเป็น tarball แล้วติดตั้งด้วย npm**
# ไม่ใช่ลิงก์จากเวิร์กสเปซ เพราะ tarball คือสิ่งเดียวที่พิสูจน์ `files` allowlist กับไฟล์ shim
# ที่ root ไปพร้อมกัน — ถ้าลืมใส่ `strapi-server.js` ใน `files` การลิงก์ซอร์สจะไม่มีทางจับได้
# และปลั๊กอินจะติดตั้งขึ้น import ขึ้น แล้วไม่โหลด โดยไม่มีอะไรใน log บอกสาเหตุ
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$APP_DIR/../.." && pwd)"
PACK_DIR="$APP_DIR/.pack"

MOCK_PID=""
STRAPI_PID=""

# เก็บกวาดโดยดูจาก **พอร์ต** ไม่ใช่จากรูปแบบ command line
#
# `pnpm --filter ... start` แตกลูกเป็น `node .../tsx/dist/cli.mjs src/server.ts` แล้วแตกต่อ
# อีกชั้นเป็น `node --require .../preflight.cjs ... src/server.ts` — ไม่มีชั้นไหนมีสตริง
# `tsx src/server.ts` อยู่ใน command line เลย `pkill -f 'tsx src/server.ts'` ของเดิมจึงไม่เคย
# ฆ่าอะไรได้สักตัว ผลที่วัดได้จริง: mock ของรอบก่อนยังฟังพอร์ต 4010 ข้ามรอบ mock ตัวใหม่
# bind ไม่ติด (EADDRINUSE) แล้วตายเงียบ ๆ ลงไฟล์ log ส่วนด่าน readiness ได้ 200 จากตัวเก่า
# แล้วทั้งรอบเดินต่อโดยคุยกับ mock ที่ยังถือ rich menu ของรอบก่อน — reconcile จึงรายงาน
# เมนูกำพร้าที่ไม่มีอยู่จริง (และในทางกลับกันก็เขียวได้ทั้งที่ไม่ได้ทดสอบอะไร)
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
  free_port 1337 || true
  free_port 4010 || true
}
trap cleanup EXIT

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

step "build เวิร์กสเปซ"
(cd "$ROOT_DIR" && pnpm build)

step "เริ่ม LINE mock ที่ 4010"
free_port 4010 || { echo "::error::พอร์ต 4010 ยังถูกใช้อยู่และฆ่าไม่ลง" >&2; exit 1; }
free_port 1337 || { echo "::error::พอร์ต 1337 ยังถูกใช้อยู่และฆ่าไม่ลง" >&2; exit 1; }
(cd "$ROOT_DIR" && pnpm --filter @fosivo/line-mock start >"$APP_DIR/.tmp-line-mock.log" 2>&1) &
MOCK_PID=$!
until curl -sf -H 'Authorization: Bearer wait' http://127.0.0.1:4010/v2/bot/info >/dev/null; do sleep 1; done

# ด่านนี้ถามว่า "ตัวที่ตอบอยู่คือตัวที่เราเพิ่งเริ่มหรือเปล่า" ไม่ใช่แค่ "มีอะไรตอบไหม" —
# ตัวที่เพิ่งเริ่มต้องยังไม่มี rich menu สักอัน ถ้ามี แปลว่ากำลังคุยกับตัวค้างจากรอบก่อน
# ไม่พึ่ง lsof เพราะด่านนี้ต้องทำงานได้แม้บนเครื่องที่ไม่มี lsof ติดตั้ง
mock_menus="$(curl -sf -H 'Authorization: Bearer wait' http://127.0.0.1:4010/v2/bot/richmenu/list)"
if [ "$mock_menus" != '{"richmenus":[]}' ]; then
  echo "::error::mock ที่พอร์ต 4010 ไม่ใช่ตัวที่รอบนี้เพิ่งเริ่ม — ยังถือ rich menu ของรอบก่อนอยู่" >&2
  echo "  /v2/bot/richmenu/list ตอบ: $mock_menus" >&2
  tail -20 "$APP_DIR/.tmp-line-mock.log" >&2
  exit 1
fi

step "แพ็กปลั๊กอินเป็น tarball เหมือนที่ผู้ใช้ได้จาก npm"
# แพ็กลง `.pack/` ของแอปแล้วตั้งชื่อคงที่ (ไม่มีเลขเวอร์ชัน) เพราะ package.json ของแอปต้อง
# **ประกาศปลั๊กอินไว้ใน dependencies จริง ๆ** — Strapi 4 ค้นหาปลั๊กอินจาก `info.dependencies`
# ของแอปเท่านั้น (`core/loaders/plugins/get-enabled-plugins.js`) ไฟล์ที่อยู่ใน node_modules
# แต่ไม่ได้ถูกประกาศไว้จะถูกมองข้ามเงียบ ๆ แล้ว `config/plugins.js` จะล้มด้วย
# "because line-rich-menu is not installed"
#
# path ต้องเป็นแบบสัมพัทธ์กับตัวแอปและชื่อต้องไม่ผูกกับเวอร์ชัน ไม่งั้น npm จะเขียน
# path ของเครื่องที่รัน (`file:../../../../../../../../tmp/...tgz`) กลับลง package.json
# กับ package-lock.json แล้วถูก commit ไป — ซึ่งพังทันทีบนเครื่องอื่นและใน CI
rm -rf "$PACK_DIR"
mkdir -p "$PACK_DIR"
(cd "$ROOT_DIR/packages/strapi-v4" && npm pack --pack-destination "$PACK_DIR")
mv "$PACK_DIR"/strapi-plugin-line-rich-menu-v4-*.tgz "$PACK_DIR/strapi-plugin-line-rich-menu-v4.tgz"

step "ติดตั้งแอปตัวอย่างและปลั๊กอินจาก tarball"
cd "$APP_DIR"
[ -f .env ] || cp .env.example .env

# อ่าน .env เองแทน `set -a; . ./.env` — ค่าที่ตั้งมาจากภายนอก **ต้องชนะไฟล์เสมอ**
# การ source ไฟล์ตรง ๆ เขียนทับตัวแปรที่ตั้งมาแล้ว ซึ่งแปลว่าขา postgres ของ matrix ใน CI
# (ที่ส่ง DATABASE_CLIENT=postgres เข้ามาทาง env) จะถูก `.env` ดึงกลับไปเป็น sqlite เงียบ ๆ
# แล้วเขียวทั้งสองขาโดยไม่เคยแตะ Postgres เลยแม้แต่ครั้งเดียว — ด่านที่เขียวโดยไม่บังคับอะไร
# แบบเดียวกับที่ STANDING-CORRECTIONS S3 เตือนไว้ (เกิดมาแล้วสี่ครั้งบนโปรเจกต์นี้)
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
# package-lock.json ที่ commit ไว้ **ต้องไม่มี** แถวของปลั๊กอิน เพราะ tarball ถูกแพ็กใหม่ทุกรอบ
# แล้ว integrity ที่ commit ไว้จะค้างเป็นของรอบก่อนทันทีที่ซอร์สเปลี่ยน ผลที่วัดได้จริงมีสองแบบ
# และแย่ทั้งคู่: บนเครื่องที่มี npm cache อยู่แล้ว `npm install` จะ **ติดตั้งของเก่าเงียบ ๆ**
# (รอบนั้นเทสต์โค้ดของเมื่อวาน) ส่วนบน CI ที่ cache ว่าง มันจะล้มด้วย EINTEGRITY ทันที
if grep -q '"node_modules/strapi-plugin-line-rich-menu-v4"' package-lock.json; then
  echo "::error::package-lock.json มีแถวของ strapi-plugin-line-rich-menu-v4 อยู่ — ลบทิ้งก่อน commit" >&2
  echo "แถวนั้นตรึง integrity ของ tarball รอบก่อนไว้ ทำให้รอบนี้ได้ของเก่าเงียบ ๆ หรือล้มด้วย EINTEGRITY" >&2
  exit 1
fi

# `--no-save` ทั้งสองคำสั่งด้วยเหตุผลเดียวกัน — ปลั๊กอินยัง **ถูกประกาศไว้ใน dependencies**
# ของ package.json ตามปกติ (Strapi 4 ต้องเห็นมันที่นั่นถึงจะโหลด) แค่ไม่ให้ npm เขียนผลลัพธ์
# ของการติดตั้งกลับลงไฟล์ที่ commit
rm -rf node_modules/strapi-plugin-line-rich-menu-v4
npm install --no-audit --no-fund --no-save
npm install --no-audit --no-fund --no-save "$PACK_DIR/strapi-plugin-line-rich-menu-v4.tgz"

# ไบต์ใน node_modules ต้องเป็นไบต์ของ tarball รอบนี้ ไม่ใช่ของที่ npm หยิบมาจาก cache
# ด่านนี้พิสูจน์ตัวเองมาแล้ว: ตอนที่ lock ยังตรึง integrity ไว้ npm รายงาน "added 1 package"
# สำเร็จทุกอย่าง แต่ dist ใน node_modules เป็นของรอบก่อน — ไม่มีอะไรอื่นในสคริปต์นี้จับได้เลย
packed_sha="$(tar -xzOf "$PACK_DIR/strapi-plugin-line-rich-menu-v4.tgz" package/dist/server/index.js | shasum -a 256 | cut -d' ' -f1)"
installed_sha="$(shasum -a 256 < node_modules/strapi-plugin-line-rich-menu-v4/dist/server/index.js | cut -d' ' -f1)"
if [ "$packed_sha" != "$installed_sha" ]; then
  echo "::error::node_modules ไม่ได้ไบต์ของ tarball รอบนี้ (packed=$packed_sha installed=$installed_sha)" >&2
  exit 1
fi

step "ล้างสถานะของรอบก่อน"
rm -rf .tmp build .cache public/uploads
mkdir -p public/uploads .tmp/e2e-tmp
touch public/uploads/.gitkeep

step "build admin แล้ว seed ผู้ใช้"
npm run build
node scripts/seed.js

step "บูต Strapi"
# TMPDIR ตัวเดียวกันทั้งสองฝั่ง เพื่อให้ด่าน "ไม่มีโฟลเดอร์ชั่วคราวค้าง" ใน acceptance.spec.ts
# มองเห็นของจริง ไม่ใช่มองโฟลเดอร์ที่ไม่มีใครเขียนลงไปตั้งแต่แรก
export TMPDIR="$APP_DIR/.tmp/e2e-tmp"
npx strapi start >"$APP_DIR/.tmp-strapi.log" 2>&1 &
STRAPI_PID=$!
until curl -sf http://127.0.0.1:1337/admin >/dev/null; do
  if ! kill -0 "$STRAPI_PID" 2>/dev/null; then
    echo "Strapi ตายระหว่างบูต — log ท้าย 60 บรรทัด:" >&2
    tail -60 "$APP_DIR/.tmp-strapi.log" >&2
    exit 1
  fi
  sleep 2
done

step "ยืนยันว่าปลั๊กอินถูกโหลดจริง ไม่ใช่แค่ติดตั้งสำเร็จ"
# ปลั๊กอินที่ติดตั้งขึ้นแต่ไม่ถูกโหลดคือความล้มเหลวที่เงียบที่สุดของ Strapi 4 — Strapi บูตผ่าน
# ปกติทุกอย่าง ไม่มีอะไรใน log บอก แต่ไม่มี route ไหนของปลั๊กอินอยู่จริง 401/403 คือหลักฐานว่า
# route ถูกลงทะเบียนแล้วและ policy ทำงาน ส่วน 404 คือหลักฐานว่ามันไม่ได้ถูกโหลดเลย
if ! curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:1337/line-rich-menu/channels | grep -qE '^(401|403)$'; then
  echo "::error::route ของปลั๊กอินไม่ตอบ 401/403 — แปลว่ามันไม่ได้ถูกลงทะเบียนเลย" >&2
  curl -s -i http://127.0.0.1:1337/line-rich-menu/channels | head -20 >&2
  exit 1
fi

step "รัน Playwright"
export E2E_TMPDIR="$TMPDIR"
npx playwright install chromium >/dev/null 2>&1 || npx playwright install --with-deps chromium
npm run test:e2e
