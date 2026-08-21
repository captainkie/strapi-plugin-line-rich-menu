import { mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type APIRequestContext } from '@playwright/test'

const ADMIN = { email: process.env['E2E_ADMIN_EMAIL']!, password: process.env['E2E_ADMIN_PASSWORD']! }
const AUTHOR = { email: process.env['E2E_AUTHOR_EMAIL']!, password: process.env['E2E_AUTHOR_PASSWORD']! }
const READER = { email: process.env['E2E_READER_EMAIL']!, password: process.env['E2E_READER_PASSWORD']! }

/** ยิงตรงไปที่ tools/line-mock เพื่อดูว่า "สิ่งที่ LINE ได้รับจริง" คืออะไร ไม่ใช่ดูจากคำตอบของปลั๊กอิน */
const LINE_MOCK = process.env['LINE_API_BASE_URL'] ?? 'http://127.0.0.1:4011'

/**
 * token ที่ channel ของชุดนี้ถือ — ต้องเป็นตัวเดียวกับที่ใช้ยิงถาม mock ตรง ๆ ด้วย
 *
 * mock แยก store ตาม access token (หนึ่ง token = หนึ่ง OA) เหมือน LINE จริง การถามด้วย token
 * อื่นจึงได้ store เปล่าของ OA ที่ไม่มีอะไรอยู่เลย ไม่ใช่สิ่งที่ปลั๊กอินเพิ่งเขียนลงไป — และนั่นคือ
 * คุณสมบัติที่ต้องการ ไม่ใช่ความไม่สะดวก: ก่อนหน้านี้ mock ใช้ store ใบเดียวไม่ว่า token เป็นอะไร
 * ข้อบกพร่องข้าม channel ทุกชนิดจึงมองไม่เห็นจากด่านนี้โดยโครงสร้าง
 */
const CHANNEL_ACCESS_TOKEN = process.env['E2E_CHANNEL_ACCESS_TOKEN'] ?? 'e2e-access-token-ABCD'
const lineAuth = { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }

/**
 * id ที่ไม่มีอยู่จริง แต่ **หน้าตาเหมือน documentId ของ Strapi 5** — ใช้ในตาราง RBAC ทั้งสองตาราง
 *
 * ของ v4 ใช้ `1` ตรง ๆ ได้เพราะ `idParam` ที่นั่นเป็น `/^\d+$/` ส่วน `idParam` ของ v5 รับทั้ง
 * `1` และสตริงนี้ (ทั้งคู่ผ่าน `/^[A-Za-z0-9_-]{1,64}$/`) ตารางนี้จึงยังเขียวถ้าใช้ `1` — แต่จะ
 * เขียวด้วยเหตุผลที่อ่อนลง สิ่งที่ตารางนี้ตั้งใจพิสูจน์คือ **403 มาจาก policy** ถ้าวันหนึ่ง policy
 * หลุดออกจาก route ค่าที่หน้าตาเหมือน id จริงจะเดินต่อเข้าไปถึง handler แล้วได้ 404 ซึ่งต่างจาก
 * 403 ชัดเจน ส่วนค่าที่ zod ปฏิเสธก่อนจะได้ 400 ซึ่ง "ไม่ใช่ 200" เหมือนกันและกลบความต่างนั้นทิ้ง
 */
const DOC_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'

/**
 * `createImageStore.write` สร้างโฟลเดอร์ชั่วคราวชื่อขึ้นต้นด้วย prefix นี้แล้วลบทิ้งใน finally
 * ต้องเป็น tmpdir **ตัวเดียวกับที่โปรเซส Strapi ใช้** ไม่งั้นด่านนี้จะเขียวโดยไม่ได้มองอะไรเลย
 * สคริปต์ `scripts/e2e.sh` ตั้ง TMPDIR ให้ทั้งสองฝั่งเท่ากันแล้วส่งค่ามาทาง E2E_TMPDIR
 */
const TEMP_ROOT = process.env['E2E_TMPDIR'] ?? tmpdir()
const TEMP_PREFIX = 'line-rich-menu-'

const leftoverTempDirs = async (): Promise<string[]> =>
  (await readdir(TEMP_ROOT)).filter((name) => name.startsWith(TEMP_PREFIX)).sort()

/**
 * จำ token ไว้ต่อหนึ่งอีเมล — ไม่ใช่การ optimise
 *
 * `/admin/login` ของ Strapi มี rate limit ของตัวเอง (koa2-ratelimit, 5 ครั้งต่อ 5 นาทีต่อ IP)
 * ชุดนี้มีเทสต์ RBAC สามสิบกว่าตัวที่แต่ละตัวต้องมี token การ login ใหม่ทุกเทสต์จึงชน 429
 * กลางทางเสมอ แล้วเทสต์จะแดงด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่มันตั้งใจจะพิสูจน์เลย
 */
const tokens = new Map<string, string>()

async function login(request: APIRequestContext, who: { email: string; password: string }): Promise<string> {
  const cached = tokens.get(who.email)
  if (cached !== undefined) return cached

  const response = await request.post('/admin/login', { data: who })
  expect(response.ok(), `login ของ ${who.email} ต้องสำเร็จ: ${await response.text()}`).toBe(true)
  const token = (await response.json()).data.token as string
  tokens.set(who.email, token)
  return token
}

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

/** JPEG ทึบสีเดียวขนาด 2500×1686 สร้างสด ๆ เพื่อไม่ต้องมีไฟล์ binary ใน repo */
async function makeImage(): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp({ create: { width: 2500, height: 1686, channels: 3, background: { r: 20, g: 120, b: 210 } } })
    .jpeg({ quality: 85 })
    .toBuffer()
}

async function uploadImage(request: APIRequestContext, token: string, name: string): Promise<number> {
  const response = await request.post('/upload', {
    ...auth(token),
    multipart: { files: { name, mimeType: 'image/jpeg', buffer: await makeImage() } },
  })
  expect(response.ok(), `อัปโหลด ${name} ต้องสำเร็จ: ${await response.text()}`).toBe(true)
  return (await response.json())[0].id as number
}

const menuBody = (over: { name: string; channelId: string; imageFileId: number; aliasId: string | null }) => ({
  name: over.name,
  channelId: over.channelId,
  size: 'large',
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom',
  selected: true,
  templateKey: null,
  areas: [{
    bounds: { x: 0, y: 0, width: 2500, height: 1686 },
    action: { type: 'message', text: 'สวัสดี' },
  }],
  imageFileId: over.imageFileId,
  areaImages: [],
  aliasId: over.aliasId,
  startAt: null,
  endAt: null,
})

/**
 * เทสต์ในไฟล์นี้เดินต่อกันเป็นเรื่องเดียว (workers: 1, fullyParallel: false) แต่ **ห้าม**
 * ส่ง id ต่อกันด้วยตัวแปรระดับโมดูล — Playwright ทิ้ง worker แล้วสร้างใหม่ทันทีที่เทสต์ตัวไหนล้ม
 * สถานะระดับโมดูลจึงถูกรีเซ็ตกลางชุด แล้วเทสต์ที่เหลือแดงด้วยค่าว่างแทนที่จะแดงด้วยเหตุผลจริง
 *
 * เกิดมาแล้วจริง: เทสต์แรกล้มหนึ่งข้อ กลายเป็นสี่ข้อแดง โดยสามข้อชี้ไปผิดที่ทั้งหมด
 * (`channelId` ว่าง → 404, → 400 "id must be numeric") การอ่าน id กลับจาก API ทุกครั้ง
 * ทำให้ต้นเหตุจริงเหลือข้อเดียวเสมอ
 */
async function theChannel(request: APIRequestContext, token: string): Promise<{ id: string }> {
  const response = await request.get('/line-rich-menu/channels', auth(token))
  expect(response.status(), await response.text()).toBe(200)
  const rows = await response.json()
  expect(rows.length, 'เทสต์แรกของชุดต้องสร้าง channel ไว้ให้แล้ว').toBeGreaterThan(0)
  return rows[0]
}

/** เหตุผลเดียวกับ `theChannel` — อ่าน id กลับจาก API เสมอ ไม่ใช่ถือ id ค้างจากเทสต์อื่น */
async function theMenu(request: APIRequestContext, token: string, channelId: string): Promise<Record<string, unknown>> {
  const list = await request.get(`/line-rich-menu/menus?channel=${channelId}`, auth(token))
  expect(list.status(), await list.text()).toBe(200)
  const rows = await list.json()
  expect(rows.length, 'เทสต์แรกของชุดต้องสร้างเมนูไว้ให้แล้ว').toBeGreaterThan(0)

  const detail = await request.get(`/line-rich-menu/menus/${rows[0].id}`, auth(token))
  expect(detail.status(), await detail.text()).toBe(200)
  return detail.json()
}

test.describe('เส้นทางหลัก', () => {
  test('login → สร้าง channel → สร้างเมนู → อัปรูป → publish → เห็น published', async ({ request }) => {
    const token = await login(request, ADMIN)

    const channelResponse = await request.post('/line-rich-menu/channels', {
      ...auth(token),
      data: { name: 'ร้านทดสอบ', channelId: '1650000000', channelAccessToken: CHANNEL_ACCESS_TOKEN },
    })
    expect(channelResponse.status(), await channelResponse.text()).toBe(200)
    const channel = await channelResponse.json()
    const channelId = channel.id as string

    // documentId ของ Strapi 5 ไม่ใช่ตัวเลข — ถ้ามันเป็นตัวเลข แปลว่า repo หยิบคอลัมน์ `id`
    // มาแทน `documentId` ซึ่งจะ "ทำงาน" ตลอดในแอปที่มีแถวเดียวแล้วพังตอนมีแถวที่สอง
    expect(channelId).not.toMatch(/^\d+$/)
    expect(channelId).toMatch(/^[a-z0-9]{20,32}$/)

    // สเปก §11.2 — token เต็มต้องไม่เคยออกจากฝั่งเซิร์ฟเวอร์
    expect(JSON.stringify(channel)).not.toContain(CHANNEL_ACCESS_TOKEN)
    expect(channel).toEqual({
      id: channel.id,
      name: 'ร้านทดสอบ',
      channelId: '1650000000',
      accessTokenPreview: '••••••••ABCD',
      isDefault: false,
    })

    // ก่อนจะเชื่อว่า "ไม่มีโฟลเดอร์ชั่วคราวเหลือ" ต้องพิสูจน์ก่อนว่าตัวสแกนมองเห็นของจริง
    // (STANDING-CORRECTIONS S3 — ยามที่เขียวโดยไม่ได้บังคับอะไรเคยเกิดบนโปรเจกต์นี้สี่ครั้งแล้ว)
    const sentinel = join(TEMP_ROOT, `${TEMP_PREFIX}sentinel`)
    await mkdir(sentinel, { recursive: true })
    expect(await leftoverTempDirs()).toEqual([`${TEMP_PREFIX}sentinel`])
    await rm(sentinel, { recursive: true, force: true })
    expect(await leftoverTempDirs()).toEqual([])

    const fileId = await uploadImage(request, token, 'menu.jpg')

    const created = await request.post('/line-rich-menu/menus', {
      ...auth(token),
      data: menuBody({ name: 'เมนูหลัก', channelId, imageFileId: fileId, aliasId: 'main' }),
    })
    expect(created.status(), await created.text()).toBe(201)
    const menu = await created.json()
    // normalize เกิดตอน save ไม่ใช่ตอน publish (design notes ข้อ 3)
    expect(menu.normalizedFileId).not.toBeNull()
    expect(menu.normalizedSize).toEqual({ width: 2500, height: 1686 })

    // `createImageStore.write` เขียนลงดิสก์ชั่วคราวแล้วต้องเก็บกวาดเสมอ — ไม่มีเทสต์ระดับ unit
    // ตัวไหนแตะเส้นนี้เลยเพราะ upload plugin ของ Strapi mock ที่ขอบนั้นไม่ได้จริง
    expect(await leftoverTempDirs()).toEqual([])

    // ไฟล์ที่ normalize แล้วต้องเป็นไฟล์จริงใน upload plugin ไม่ใช่แค่ตัวเลขที่ดูเหมือน id
    const fileResponse = await request.get(`/upload/files/${menu.normalizedFileId}`, auth(token))
    expect(fileResponse.ok(), await fileResponse.text()).toBe(true)
    const file = await fileResponse.json()
    expect({ mime: file.mime, width: file.width, height: file.height })
      .toEqual({ mime: 'image/jpeg', width: 2500, height: 1686 })

    const storedBytes = await (await request.get(file.url)).body()
    expect(storedBytes.length).toBeGreaterThan(0)

    const published = await request.post(`/line-rich-menu/menus/${menu.id}/publish`, {
      ...auth(token),
      data: { setAsDefault: true },
    })
    expect(published.status(), await published.text()).toBe(200)
    const outcome = await published.json()
    expect(outcome.status).toBe('published')

    // ปลายทางจริง: ไบต์ที่ LINE ได้รับต้องเป็นไบต์ชุดเดียวกับที่ upload plugin เก็บไว้
    // นี่คือจุดที่ ImageStore.write → read → uploadContent ถูกพิสูจน์ครบวงเป็นครั้งแรก
    const onLine = await (await request.get(
      `${LINE_MOCK}/v2/bot/richmenu/${outcome.lineRichMenuId}`,
      lineAuth,
    )).json()
    expect(onLine.image).toEqual({
      mime: 'image/jpeg',
      bytes: storedBytes.length,
      width: 2500,
      height: 1686,
    })

    expect(await leftoverTempDirs()).toEqual([])

    const list = await request.get(`/line-rich-menu/menus?channel=${channelId}`, auth(token))
    const rows = await list.json()
    expect(rows).toHaveLength(1)
    // ทั้งค่า ไม่ใช่ objectContaining — ฟิลด์ที่หายไปคือ regression ที่เทสต์นี้มีไว้จับ (S4)
    expect({ ...rows[0], updatedAt: typeof rows[0].updatedAt }).toEqual({
      id: menu.id,
      title: 'เมนูหลัก',
      status: 'published',
      channelId,
      aliasId: 'main',
      updatedAt: 'string',
    })
  })

  test('reconcile ไม่เห็นเมนูกำพร้าหลัง publish ที่สำเร็จ', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channel = await theChannel(request, token)
    const report = await request.get(`/line-rich-menu/channels/${channel.id}/reconcile`, auth(token))
    expect(report.status(), await report.text()).toBe(200)
    expect(await report.json()).toEqual({ orphans: [], missing: [] })
  })

  /**
   * I3 — `claim`/`release` ของ knex lock ไม่เคยรันกับฐานข้อมูลจริงมาก่อนเลย: ด่านนี้เคยยิง tick
   * กับตารางที่ไม่มี schedule ค้างอยู่สักแถว (`due: 0`) ทำให้ทั้งสองเมธอดได้เจอแค่ของปลอมของ
   * เทสต์ระดับ unit เท่านั้น ความล้มเหลวสองแบบของ lock ตัวจริงก็เงียบทั้งคู่: ชื่อคอลัมน์ผิด
   * โยน error ที่ถูกกลืนเข้า log บรรทัดเดียวทุกนาที ส่วนค่าผิด (เช่นเทียบ state ผิดค่า) ทำให้
   * `claim` คืน false ตลอดกาล ซึ่งดูเหมือน contention เฉย ๆ ไม่มีอะไรบอกว่าตารางเวลาไม่เคยรันเลย
   *
   * ด่านนี้จึงต้อง seed schedule ที่ due จริง ๆ ผ่านเส้นทางที่ผู้ใช้ใช้จริง — PUT เมนูพร้อม
   * `startAt` ในอดีต (ไม่ใช่เขียนแถวลง DB ตรง ๆ) เพื่อพิสูจน์ทั้งขา `writeDisplayPeriod` ที่สร้าง
   * schedule และขา lock/tick ที่ claim/run มันในคำสั่งเดียวกัน แล้วยืนยันว่า `due`/`claimed`/`done`
   * ไม่ใช่แค่ตัวเลขคงที่จากของปลอมอีกต่อไป
   */
  test('tick ที่ยิงจากภายนอกทำงานได้และไม่ล้ม — เจองาน due จริงและ claim/run ผ่าน DB จริง', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id
    const menu = await theMenu(request, token, channelId)

    const past = new Date(Date.now() - 60_000).toISOString()
    const updated = await request.put(`/line-rich-menu/menus/${menu['id']}`, {
      ...auth(token),
      data: {
        name: menu['name'], channelId: menu['channelId'], size: menu['size'],
        chatBarText: menu['chatBarText'], chatBarMode: menu['chatBarMode'], selected: menu['selected'],
        templateKey: menu['templateKey'], areas: menu['areas'], imageFileId: menu['imageFileId'],
        areaImages: menu['areaImages'], aliasId: menu['aliasId'],
        startAt: past, endAt: null,
      },
    })
    expect(updated.status(), await updated.text()).toBe(200)

    const response = await request.post('/line-rich-menu/schedules/tick', { ...auth(token), data: {} })
    expect(response.status(), await response.text()).toBe(200)
    expect(await response.json()).toEqual({ due: 1, claimed: 1, done: 1, failed: 0 })
  })

  test('ImageStore.read เดินกิ่ง fetch ได้จริงเมื่อ provider คืน url แบบสัมบูรณ์', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id
    const fileId = await uploadImage(request, token, 'remote-menu.jpg')

    // ถ้าไฟล์นี้ยังได้ url สัมพัทธ์ แปลว่าเทสต์กำลังจะเขียวโดยเดินกิ่งเดิม — ล้มที่นี่ดีกว่า
    const file = await (await request.get(`/upload/files/${fileId}`, auth(token))).json()
    expect(file.url.startsWith('http://'), `ต้องเป็น url สัมบูรณ์ แต่ได้ ${file.url}`).toBe(true)

    const created = await request.post('/line-rich-menu/menus', {
      ...auth(token),
      data: menuBody({ name: 'เมนูรีโมต', channelId, imageFileId: fileId, aliasId: 'remote' }),
    })
    expect(created.status(), await created.text()).toBe(201)
    const menu = await created.json()
    expect(menu.normalizedFileId).not.toBeNull()
    expect(menu.normalizedSize).toEqual({ width: 2500, height: 1686 })
    expect(await leftoverTempDirs()).toEqual([])
  })
})

test.describe('RBAC — role ที่ไม่มีสิทธิ์ต้องได้ 403 ทุกเส้น (สเปก §13.2 ข้อ 1)', () => {
  const guarded: [string, string][] = [
    ['GET', '/line-rich-menu/channels'],
    ['POST', '/line-rich-menu/channels'],
    ['PUT', `/line-rich-menu/channels/${DOC_ID}`],
    ['POST', `/line-rich-menu/channels/${DOC_ID}/test`],
    ['GET', `/line-rich-menu/channels/${DOC_ID}/reconcile`],
    ['GET', '/line-rich-menu/menus'],
    ['GET', `/line-rich-menu/menus/${DOC_ID}`],
    ['POST', '/line-rich-menu/menus'],
    ['PUT', `/line-rich-menu/menus/${DOC_ID}`],
    ['DELETE', `/line-rich-menu/menus/${DOC_ID}`],
    ['POST', `/line-rich-menu/menus/${DOC_ID}/publish`],
    ['POST', `/line-rich-menu/menus/${DOC_ID}/default`],
    ['DELETE', `/line-rich-menu/menus/${DOC_ID}/default`],
    // เส้นนี้ตกไปจากตารางของ v4 — มันมีอยู่จริงทั้งใน routes/admin.ts และ packages/ui/src/api.ts
    ['DELETE', `/line-rich-menu/channels/${DOC_ID}/orphans/rich-menu-does-not-exist`],
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

/**
 * ขอบที่ตาราง RBAC ของ Task 17 พิสูจน์ไม่ได้: role ที่ **มีสิทธิ์ read จริง ๆ** ต้องอ่านได้
 * และต้องถูกกันจาก `settings` / `write` / `publish` โดย Strapi ตัวจริง ไม่ใช่โดยความตั้งใจของเรา
 *
 * นี่คือสิ่งที่ทำให้ "มอบสิทธิ์ปล่อยเมนูได้โดยไม่ต้องให้เห็น channel access token"
 * กลายเป็นข้อเท็จจริงแทนที่จะเป็นคำอธิบายในดีไซน์
 */
test.describe('RBAC — role ที่มีแค่ read', () => {
  test('อ่านได้จริง และเห็นแค่ preview ของ token', async ({ request }) => {
    const token = await login(request, READER)

    const channels = await request.get('/line-rich-menu/channels', auth(token))
    expect(channels.status(), await channels.text()).toBe(200)
    const rows = await channels.json()
    expect(rows).toEqual([{
      id: rows[0]?.id,
      name: 'ร้านทดสอบ',
      channelId: '1650000000',
      accessTokenPreview: '••••••••ABCD',
      isDefault: false,
    }])

    const menus = await request.get('/line-rich-menu/menus', auth(token))
    expect(menus.status()).toBe(200)
    expect(await menus.text()).not.toContain('e2e-access-token')
  })

  const forbidden: [string, string, string][] = [
    ['settings', 'POST', '/line-rich-menu/channels'],
    ['settings', 'PUT', `/line-rich-menu/channels/${DOC_ID}`],
    ['settings', 'POST', `/line-rich-menu/channels/${DOC_ID}/test`],
    ['write', 'POST', '/line-rich-menu/menus'],
    ['write', 'PUT', `/line-rich-menu/menus/${DOC_ID}`],
    ['write', 'DELETE', `/line-rich-menu/menus/${DOC_ID}`],
    ['publish', 'POST', `/line-rich-menu/menus/${DOC_ID}/publish`],
    ['publish', 'POST', `/line-rich-menu/menus/${DOC_ID}/default`],
    ['publish', 'DELETE', `/line-rich-menu/menus/${DOC_ID}/default`],
    ['publish', 'GET', `/line-rich-menu/channels/${DOC_ID}/reconcile`],
    ['publish', 'DELETE', `/line-rich-menu/channels/${DOC_ID}/orphans/rich-menu-does-not-exist`],
    ['publish', 'POST', '/line-rich-menu/schedules/tick'],
  ]

  for (const [permission, method, path] of forbidden) {
    test(`${method} ${path} ต้องการ ${permission} → 403`, async ({ request }) => {
      const token = await login(request, READER)
      const response = await request.fetch(path, method === 'GET' || method === 'DELETE'
        ? { method, ...auth(token) }
        : { method, ...auth(token), data: {} })
      expect(response.status()).toBe(403)
      expect(await response.text()).not.toContain('e2e-access-token')
    })
  }
})

test.describe('บันเดิลของ admin โหลดขึ้นจริง', () => {
  test('login → เห็นลิงก์ในเมนูซ้าย → เปิดหน้าปลั๊กอินได้ (DS v2 + Vite + router v6)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))

    await page.goto('/admin/auth/login')
    // เลือกด้วย name ไม่ใช่ getByLabel — ปุ่มโชว์/ซ่อนรหัสผ่านของ Strapi มี aria-label ที่มีคำว่า
    // password อยู่ด้วย ทำให้ getByLabel(/password/i) เจอสองตัวแล้วล้มด้วย strict mode
    await page.locator('input[name="email"]').fill(ADMIN.email)
    await page.locator('input[name="password"]').fill(ADMIN.password)
    await page.getByRole('button', { name: /login/i }).click()

    // ต้อง **ออกจาก** หน้า login จริง ๆ — `waitForURL(/\/admin(\/.*)?$/)` จับ `/admin/auth/login`
    // ได้ด้วย จึงผ่านแม้ตอนที่ login ล้ม (เจอจริงตอนโดน rate limit ของ `/admin/login`)
    // แล้วเทสต์จะไปแดงที่ assertion ถัดไปโดยชี้ไปผิดที่ทั้งหมด
    await expect(page).not.toHaveURL(/\/admin\/auth\//, { timeout: 20_000 })

    // ลิงก์ในเมนูซ้ายมาจาก `app.addMenuLink` ของ admin/src/index.ts — ถ้ามันขึ้น แปลว่า export
    // `./strapi-admin` ถูก Vite ของ Strapi 5 resolve และรวมร่างสำเร็จ ไม่ใช่แค่มีอยู่ใน node_modules
    await expect(page.getByRole('link', { name: /line rich menu/i })).toBeVisible()

    await page.goto('/admin/plugins/line-rich-menu')

    // ปุ่มนี้อยู่ในหน้าของอะแดปเตอร์ (ListPage) และวาดด้วย primitive ที่จับคู่กับ DS v2
    // ถ้ามันขึ้น แปลว่า port ทั้งชุดถูกฉีดสำเร็จและไม่มี primitive ตัวไหนเป็น undefined
    await expect(page.getByTestId('create-menu')).toBeVisible()
    await expect(page.getByText('เมนูหลัก')).toBeVisible()

    // บันเดิลที่ "ขึ้นแล้วพัง" อ่านเหมือนผ่านถ้าดูแค่ว่า element โผล่ — React จับ error ของ
    // ตัวเองไว้ได้ในบางกรณี ด่านนี้จึงดูที่ error ของหน้าจริง ๆ ด้วย
    expect(errors).toEqual([])
  })
})

test.describe('scheduler บน Strapi 5', () => {
  /**
   * `ScheduleRow.id` ของ v5 คือ `documentId` ส่วน lock query ยิงผ่าน knex ตรง ๆ ซึ่งมองเห็น
   * แต่คอลัมน์ในตาราง ค่า default ของ `ScheduleLockColumns.id` คือ `'id'` — primary key
   * ตัวเลข การส่ง documentId ไปเทียบกับคอลัมน์นั้นได้ `affected === 0` เสมอ แปลว่า claim
   * ไม่เคยสำเร็จ ทุกงานที่ตั้งเวลาไว้ถูกข้ามเงียบ ๆ ทุกนาที โดย tick รายงาน `{ due: n, claimed: 0 }`
   * ซึ่งหน้าตาเหมือน contention ธรรมดาทุกประการ
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
    expect(report.done).toBeGreaterThanOrEqual(1)
    expect(report.failed).toBe(0)

    // ปลายทางจริง: LINE ต้องเห็นเมนูนี้เป็น default หลัง tick
    //
    // ต้องถามด้วย `lineAuth` เท่านั้น — mock แยก store ตาม access token แล้ว การถามด้วย
    // token อื่น (เช่นค่าคงที่ที่ไม่ตรงกับ channel) จะได้ 404 ของ OA เปล่า แล้ว richMenuId
    // เป็น undefined ทั้งสองฝั่ง ซึ่งเทียบกันติดได้ทั้งที่ default ไม่เคยถูกตั้งจริง
    const current = await request.get(`${LINE_MOCK}/v2/bot/user/all/richmenu`, lineAuth)
    expect(current.status(), await current.text()).toBe(200)

    const detail = await request.get(`/line-rich-menu/menus/${menu.id}`, auth(token))
    expect(detail.status(), await detail.text()).toBe(200)
    const lineRichMenuId = (await detail.json()).lineRichMenuId
    expect(lineRichMenuId, 'เมนูที่ publish แล้วต้องมี lineRichMenuId').not.toBeNull()
    expect((await current.json()).richMenuId).toBe(lineRichMenuId)
  })
})
