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
PACK_DIR="${RUNNER_TEMP:-/tmp}"
DATABASE_CLIENT="${DATABASE_CLIENT:-sqlite}"
export DATABASE_CLIENT

MOCK_PID=""
STRAPI_PID=""
cleanup() {
  # ฆ่าทั้งกลุ่ม: `pnpm --filter ... start` กับ `npx strapi start` ต่างก็แตกลูกออกไปอีกชั้น
  # การ kill แค่ PID ที่ $! คืนมาจึงทิ้งโปรเซสลูกค้างพอร์ตไว้ให้รอบถัดไปชน
  [ -n "$STRAPI_PID" ] && kill "$STRAPI_PID" 2>/dev/null || true
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null || true
  pkill -f 'tsx src/server.ts' 2>/dev/null || true
  pkill -f 'strapi start' 2>/dev/null || true
}
trap cleanup EXIT

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

step "build เวิร์กสเปซ"
(cd "$ROOT_DIR" && pnpm build)

step "เริ่ม LINE mock ที่ 4010"
(cd "$ROOT_DIR" && pnpm --filter @fosivo/line-mock start >"$APP_DIR/.tmp-line-mock.log" 2>&1) &
MOCK_PID=$!
until curl -sf -H 'Authorization: Bearer wait' http://127.0.0.1:4010/v2/bot/info >/dev/null; do sleep 1; done

step "แพ็กปลั๊กอินเป็น tarball เหมือนที่ผู้ใช้ได้จาก npm"
(cd "$ROOT_DIR/packages/strapi-v4" && npm pack --pack-destination "$PACK_DIR")

step "ติดตั้งแอปตัวอย่างและปลั๊กอินจาก tarball"
cd "$APP_DIR"
[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a
export DATABASE_CLIENT
npm install --no-audit --no-fund
npm install --no-audit --no-fund "$PACK_DIR"/strapi-plugin-line-rich-menu-v4-*.tgz

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
grep -q "line-rich-menu" "$APP_DIR/.tmp-strapi.log" || true
if ! curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:1337/line-rich-menu/channels | grep -qE '^(401|403)$'; then
  echo "::error::route ของปลั๊กอินไม่ตอบ 401/403 — แปลว่ามันไม่ได้ถูกลงทะเบียนเลย" >&2
  curl -s -i http://127.0.0.1:1337/line-rich-menu/channels | head -20 >&2
  exit 1
fi

step "รัน Playwright"
export E2E_TMPDIR="$TMPDIR"
npx playwright install chromium >/dev/null 2>&1 || npx playwright install --with-deps chromium
npm run test:e2e
