import { mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type APIRequestContext } from '@playwright/test'

const ADMIN = { email: process.env['E2E_ADMIN_EMAIL']!, password: process.env['E2E_ADMIN_PASSWORD']! }
const AUTHOR = { email: process.env['E2E_AUTHOR_EMAIL']!, password: process.env['E2E_AUTHOR_PASSWORD']! }
const READER = { email: process.env['E2E_READER_EMAIL']!, password: process.env['E2E_READER_PASSWORD']! }

/** ยิงตรงไปที่ tools/line-mock เพื่อดูว่า "สิ่งที่ LINE ได้รับจริง" คืออะไร ไม่ใช่ดูจากคำตอบของปลั๊กอิน */
const LINE_MOCK = process.env['LINE_API_BASE_URL'] ?? 'http://127.0.0.1:4010'

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
    // สเปก §11.2 — token เต็มต้องไม่เคยออกจากฝั่งเซิร์ฟเวอร์
    expect(JSON.stringify(channel)).not.toContain(CHANNEL_ACCESS_TOKEN)
    expect(channel).toEqual({
      id: channel.id,
      name: 'ร้านทดสอบ',
      channelId: '1650000000',
      accessTokenPreview: '••••••••ABCD',
      isDefault: false,
      // Task 5/6 เพิ่มคอลัมน์นี้ให้ channel (ตัวชี้เมนูสมาชิกที่กำลัง active) — เพิ่งถูกจับได้ตอนรัน
      // acceptance ตัวจริงครั้งแรกว่าหายไปจาก literal นี้เหมือนกับที่ v5 เจอ (toChannelRecord ใน
      // core/server/secrets.ts คืนฟิลด์นี้มาให้ทั้งสอง adapter เหมือนกัน) — ฟิลด์นี้คือของจริงที่
      // ตั้งใจเพิ่ม ไม่ใช่ leak
      memberRichMenuId: null,
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
    // `imageUrl` เป็นชื่อไฟล์ที่ upload provider ตั้งเอง (มีแฮชต่อท้าย) จึงเทียบด้วยชนิดเหมือน
    // `updatedAt` — และการเทียบชนิดที่นี่มีความหมายจริง ไม่ใช่การยอมแพ้: `null` เป็น `'object'`
    // ด่านนี้จึงแดงทันทีถ้าเมนูที่มีรูปกลับได้ `imageUrl: null` ซึ่งเป็นรูปแบบที่หน้ารายการพังพอดี
    //
    // Task 13 — `audience`/`lineRichMenuId` เพิ่งถูกจับได้ตอนรัน acceptance ตัวจริงครั้งแรกว่าหายไป
    // จาก literal นี้: `toSummary` (controllers/menus.ts) คืนทั้งสองฟิลด์มาตั้งแต่ Task 11 แต่ไม่มี
    // ใครรัน suite นี้กับ Strapi จริงมาก่อนเลยจนถึงตอนนี้ (ดูคอมเมนต์อื่น ๆ ในไฟล์นี้ที่พูดเรื่อง
    // เดียวกัน) `toEqual` เทียบทั้งก้อนจึงแดงทันทีที่รันจริงครั้งแรก — เพิ่มสองฟิลด์นี้เข้าไปแทนที่จะ
    // เปลี่ยนเป็น objectContaining ซึ่งจะปิดทางจับ regression ในอนาคตทิ้งไปด้วย
    expect({
      ...rows[0],
      updatedAt: typeof rows[0].updatedAt,
      imageUrl: typeof rows[0].imageUrl,
    }).toEqual({
      id: menu.id,
      title: 'เมนูหลัก',
      status: 'published',
      channelId,
      aliasId: 'main',
      updatedAt: 'string',
      audience: 'all',
      lineRichMenuId: outcome.lineRichMenuId,
      // ห้าฟิลด์ล่างนี้คือสิ่งที่หน้ารายการแบบ LINE วาดออกมา — ภาพย่อ (size + areas),
      // คอลัมน์ action (areas) และคอลัมน์ช่วงเวลา ถ้าหายไปหน้าจอจะว่างโดยไม่มีอะไรพัง
      size: 'large',
      areas: [{
        bounds: { x: 0, y: 0, width: 2500, height: 1686 },
        action: { type: 'message', text: 'สวัสดี' },
      }],
      imageUrl: 'string',
      startAt: null,
      endAt: null,
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
      // ยังไม่มีเทสต์ไหนก่อนหน้านี้ (ไฟล์นี้รันตามลำดับ, workers: 1) เรียก audience/activate เลย —
      // ยังเป็นค่าเริ่มต้น null อยู่ ไม่ใช่ค่าจาก 'audience สมาชิก' ที่อยู่ท้ายไฟล์
      memberRichMenuId: null,
    }])

    const menus = await request.get('/line-rich-menu/menus', auth(token))
    expect(menus.status()).toBe(200)
    expect(await menus.text()).not.toContain('e2e-access-token')
  })

  const forbidden: [string, string, string][] = [
    ['settings', 'POST', '/line-rich-menu/channels'],
    ['settings', 'PUT', '/line-rich-menu/channels/1'],
    ['settings', 'POST', '/line-rich-menu/channels/1/test'],
    ['write', 'POST', '/line-rich-menu/menus'],
    ['write', 'PUT', '/line-rich-menu/menus/1'],
    ['write', 'DELETE', '/line-rich-menu/menus/1'],
    ['publish', 'POST', '/line-rich-menu/menus/1/publish'],
    ['publish', 'POST', '/line-rich-menu/menus/1/default'],
    ['publish', 'DELETE', '/line-rich-menu/menus/1/default'],
    ['publish', 'GET', '/line-rich-menu/channels/1/reconcile'],
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
  test('login → เห็นลิงก์ในเมนูซ้าย → เปิดหน้าปลั๊กอินได้ (DS v1 + webpack 5 + router v5)', async ({ page }) => {
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

    // ลิงก์ในเมนูซ้ายมาจาก `app.addMenuLink` ของ strapi-admin.js — ถ้ามันขึ้น แปลว่าไฟล์ shim
    // ฝั่ง admin ถูก webpack ของ Strapi หยิบไปรวมร่างสำเร็จ ไม่ใช่แค่มีอยู่ใน node_modules
    await expect(page.getByRole('link', { name: /line rich menu/i })).toBeVisible()

    await page.goto('/admin/plugins/line-rich-menu')

    // ปุ่มนี้อยู่ในหน้าของอะแดปเตอร์ (ListPage) และวาดด้วย primitive ที่จับคู่กับ DS v1
    // ถ้ามันขึ้น แปลว่า port ทั้งชุดถูกฉีดสำเร็จและไม่มี primitive ตัวไหนเป็น undefined
    await expect(page.getByTestId('create-menu')).toBeVisible()

    // การ์ด "เมนูที่ใช้อยู่" (Task 11) ยิง audience ของ channel แยกจากรายการ แล้ววาดชื่อเมนู
    // default ตัวปัจจุบัน — ซึ่งคือ 'เมนูหลัก' ที่ด่านแรกของไฟล์ publish ด้วย setAsDefault: true
    // รอให้มันวาดเสร็จก่อน ไม่ใช่เพราะอยากเช็คการ์ด (แม้จะได้ด่านนั้นมาฟรี ๆ ด้วย) แต่เพราะด่าน
    // ถัดไปต้องเจอหน้าที่มีชื่อเมนูครบทั้งสองที่ **ทุกรอบ** ไม่ใช่บางรอบ — เทสต์ที่ผลขึ้นกับว่า
    // fetch ไหนตอบก่อน บอกอะไรไม่ได้เลยทั้งตอนเขียวและตอนแดง (แดงมาแล้วจริงด้วยเหตุนี้)
    await expect(page.getByTestId('current-all')).toHaveText('เมนูหลัก')

    // ชื่อเมนูจึงอยู่สองที่: `<span>` ของการ์ด กับปุ่มเปิดพรีวิวในแถวของรายการ — `getByText`
    // จับได้ทั้งคู่แล้วล้ม strict mode เจาะไปที่ปุ่มของแถวแทน เพราะสิ่งที่ด่านนี้ต้องพิสูจน์คือ
    // "ตารางรายการวาดออกมาจริง" ส่วน `.first()` จะผ่านได้แม้มีแต่การ์ดและรายการล้มไม่ขึ้นสักแถว
    // ซึ่งกลับหัวกลับหางกับสิ่งที่ด่านนี้มีไว้จับพอดี
    await expect(page.getByRole('button', { name: 'เมนูหลัก' })).toBeVisible()

    // `toBeVisible()` เฉย ๆ ผ่านได้แม้ปุ่มถูก disabled อยู่ — `disabled={channelId === null}`
    // ใน ListPage.tsx ต้องเจอ channel จริงที่ fetch เสร็จแล้วถึงจะเปิดปุ่ม ด่านเดิมจึงพิสูจน์แค่ว่า
    // ปุ่มโผล่ ไม่ได้พิสูจน์ว่ามันกดได้ — คลิกจริงคือด่านเดียวที่ปุ่มที่ disabled ผ่านไม่ได้
    // (Playwright ล้มด้วย timeout แทนที่จะเงียบเหมือน toBeVisible)
    await expect(page.getByTestId('create-menu')).toBeEnabled()
    await page.getByTestId('create-menu').click()
    await expect(page).toHaveURL(/\/rich-menus\/new/)
    await expect(page.getByTestId('open-template-picker')).toBeVisible()

    // บันเดิลที่ "ขึ้นแล้วพัง" อ่านเหมือนผ่านถ้าดูแค่ว่า element โผล่ — React จับ error ของ
    // ตัวเองไว้ได้ในบางกรณี ด่านนี้จึงดูที่ error ของหน้าจริง ๆ ด้วย
    expect(errors).toEqual([])
  })
})

/**
 * Task 13 — ด่านสุดท้ายที่พิสูจน์คำตอบของสามคำถามของฟีเจอร์ audience สมาชิก (ดู task-13-brief.md)
 * ด้วยการสังเกตพฤติกรรมจริงบน Strapi 4 ตัวจริง ไม่ใช่เดาจากโค้ด — ทั้งสามข้อมีคำตอบแล้ว (ผลของ task
 * นี้เอง) คำถามยังอยู่ตรงนี้เพื่อบอกว่าด่านข้างล่างพิสูจน์อะไร ไม่ใช่เพราะยังไม่รู้คำตอบ:
 * 1) `afterDelete` ของ Strapi ส่ง channel ที่ populate มาให้ lifecycle จริงไหม
 * 2) `beforeUpdate` ได้ identifier ที่ resolve แถวเดิมได้จริงไหม
 * 3) payload update ที่ไม่ส่ง `channel` มา ยัง establish channel ได้จริงไหม
 *
 * v4 ไม่มีความกำกวมของ documentId เหมือน v5 (ดูคอมเมนต์ที่ lifecycles.ts:idOf ของฝั่ง v4 —
 * `where.id` คือ primary key ตัวเลขตัวเดียวกับที่ `MemberRow.id` ใช้อยู่แล้วเสมอ) แต่ยังต้องรัน
 * ชุดนี้กับ v4 จริงเหมือนกัน เพราะคำถามที่ 1 (afterDelete populate) กับ 3 (payload ไม่ส่ง channel)
 * เป็นพฤติกรรมของ `@strapi/database` lifecycles ไม่ใช่เรื่องเฉพาะ v5 — ไม่มีเอกสารรับรองรูปทรงที่
 * event.result/event.params.data ส่งมาในเวอร์ชันไหนเลย ต้องดูจากของจริงทั้งสองฝั่ง
 *
 * uid ของ LINE ต้องเป็น `U` + hex ตัวพิมพ์เล็ก 32 ตัว (isLineUserId ใน core) — ใช้ตัวอักษร hex
 * ซ้ำ (0-9, a-f) เพราะมันคือ hex ที่ถูกต้องด้วย และอ่านแยกแต่ละ uid ออกจากกันง่ายกว่า uuid สุ่ม
 */
const uidOf = (hexDigit: string) => `U${hexDigit.repeat(32)}`
const MEMBER_UID = 'plugin::line-rich-menu.line-member'

/**
 * `line-member` เป็นตัวเดียวในปลั๊กอินที่เปิดใน Content Manager (สเปก §Non-goals: สมาชิกจัดการ
 * ด้วยมือผ่าน Content Manager ไม่มี REST ของตัวเอง) — ต้องยิงผ่าน `/content-manager/collection-types`
 * ไม่ใช่ path ของปลั๊กอินเอง Content Manager ส่ง body ดิบเป็นฟิลด์ของ entity ตรง ๆ (ไม่ห่อ `data`
 * อีกชั้น — ต่างจาก route ของปลั๊กอินเองที่ผ่าน zod) `channel` คือชื่อ attribute ของ relation
 * ตามที่ประกาศใน content-types/line-member.ts ไม่ใช่ `channelId` แบบที่ route ของปลั๊กอินใช้
 */
async function createMemberRaw(
  request: APIRequestContext, token: string, data: { channelId: string; lineUserId: string },
) {
  return request.post(`/content-manager/collection-types/${MEMBER_UID}`, {
    ...auth(token),
    data: { channel: data.channelId, lineUserId: data.lineUserId },
  })
}

async function createMember(
  request: APIRequestContext, token: string, data: { channelId: string; lineUserId: string },
): Promise<{ id: number }> {
  const response = await createMemberRaw(request, token, data)
  // Task 13 — เพิ่งถูกจับได้ตอนรัน acceptance ตัวจริงครั้งแรกว่า Content Manager ของ Strapi 4 ตอบ
  // 200 สำหรับ POST ที่สร้างสำเร็จ ไม่ใช่ 201 แบบ route ของปลั๊กอินเอง (เข้าใจผิดยกมาจากแพทเทิร์นของ
  // route ปลั๊กอินซึ่งผ่าน zod และตอบ 201 เอง — Content Manager เป็นคนละ endpoint คนละ convention)
  // v5 ยืนยันแล้วว่าตอบ 201 จริง (ดู acceptance.spec.ts ของ v5) — ต่างกันตามเวอร์ชัน ไม่ใช่ error
  expect(response.status(), await response.text()).toBe(200)
  return response.json()
}

/**
 * เมนู "ของสมาชิก" ผ่านเส้นทางที่ผู้ใช้จริงเดิน — อัปโหลดรูป → สร้างเมนูพร้อม `audience: 'members'`
 * → publish
 *
 * **Task 13 ruling ปิดช่องนี้แล้ว**: เดิม `menuInputSchema` เป็น `.strict()` และไม่มีคีย์ `audience`
 * เลย ส่ง `audience: 'members'` ไปใน body ตอนนั้นจะโดน zod ปฏิเสธด้วย 400 — ตอนนี้ schema มีคีย์
 * `audience` แล้ว (enum `'all' | 'members'`, default `'all'`) `saveMenu` เขียนมันลง patch จริง
 * และ repo ของทั้งสอง adapter เขียนคอลัมน์นี้กลับ DB จริง (ดู validation.ts / menu-write.ts / repo.ts)
 * เมนูที่สร้างผ่านฟังก์ชันนี้จึงมี `audience: 'members'` ในฐานข้อมูลจริง ไม่ใช่ default 'all' เหมือน
 * ก่อนหน้านี้ — `audience` เป็นพารามิเตอร์ ไม่ใช่ค่าคงที่ เพราะเทสต์ท้ายไฟล์ต้องการเมนูที่เหลือเป็น
 * 'all' ด้วย (เพื่อพิสูจน์ว่า activate ปฏิเสธมันจริง)
 */
async function publishedMenu(
  request: APIRequestContext, token: string, channelId: string,
  over: { name: string; aliasId: string; audience?: 'all' | 'members' },
): Promise<{ id: string; lineRichMenuId: string }> {
  const fileId = await uploadImage(request, token, `${over.aliasId}.jpg`)
  const created = await request.post('/line-rich-menu/menus', {
    ...auth(token),
    data: {
      ...menuBody({ name: over.name, channelId, imageFileId: fileId, aliasId: over.aliasId }),
      audience: over.audience ?? 'members',
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const menu = await created.json()
  expect(menu.audience, 'audience ที่ส่งไปตอนสร้างต้องเขียนลงจริง ไม่ใช่ค่า default เงียบ ๆ')
    .toBe(over.audience ?? 'members')

  const published = await request.post(`/line-rich-menu/menus/${menu.id}/publish`, {
    ...auth(token), data: { setAsDefault: false },
  })
  expect(published.status(), await published.text()).toBe(200)
  const outcome = await published.json()
  return { id: menu.id as string, lineRichMenuId: outcome.lineRichMenuId as string }
}

test.describe('audience สมาชิก', () => {
  test('สมาชิกเห็นเมนูของตัวเอง คนอื่นเห็น default', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id
    const memberMenu = await publishedMenu(
      request, token, channelId, { name: 'เมนูสมาชิก', aliasId: 'members-menu' })

    // สมาชิกสามคนก่อนเปิดสวิตช์
    const uids = ['1', '2', '3'].map(uidOf)
    for (const lineUserId of uids) await createMember(request, token, { channelId, lineUserId })

    const activated = await request.post(
      `/line-rich-menu/menus/${memberMenu.id}/audience/activate`, auth(token))
    // controllers/members.ts:activateOrSync ตอบ 204 ไม่ใช่ 200 — task-13-brief.md เขียน 200 ไว้ผิด
    expect(activated.status(), await activated.text()).toBe(204)

    // ยืนยันจากฝั่ง LINE ไม่ใช่จากฐานข้อมูลของเราเอง — ต้องแนบ lineAuth เสมอ mock แยก store ตาม
    // access token (ดูคอมเมนต์ที่ CHANNEL_ACCESS_TOKEN ด้านบนไฟล์) ไม่แนบจะไปถามอีก store ที่ว่าง
    // เปล่าเสมอ แล้วด่านนี้จะ 404 ตลอดไม่ว่าฟีเจอร์จะทำงานจริงหรือไม่ — เขียวหรือแดงผิดเหตุผลทั้งคู่
    for (const uid of uids) {
      const onLine = await request.get(`${LINE_MOCK}/v2/bot/user/${uid}/richmenu`, lineAuth)
      expect(onLine.status(), await onLine.text()).toBe(200)
      expect((await onLine.json()).richMenuId).toBe(memberMenu.lineRichMenuId)
    }

    // สมาชิกที่เพิ่มทีหลังได้เมนูโดยไม่ต้องกดอะไรอีก — พิสูจน์ afterCreate ของ lifecycles.ts
    const late = uidOf('9')
    await createMember(request, token, { channelId, lineUserId: late })
    const lateOnLine = await request.get(`${LINE_MOCK}/v2/bot/user/${late}/richmenu`, lineAuth)
    expect(lateOnLine.status(), await lateOnLine.text()).toBe(200)
    expect((await lateOnLine.json()).richMenuId).toBe(memberMenu.lineRichMenuId)

    // === คำถามที่ 1: afterDelete ของ Strapi ส่ง channel ที่ populate มาให้ lifecycle จริงไหม ===
    // คำตอบ: ไม่ — `beforeDelete` จึงต้องอ่านแถวเก็บไว้ก่อนแถวถูกลบจริง แล้ว stash ผ่าน `event.state`
    // ให้ `afterDelete` อ่านต่อ (`stashedMember` ใน lifecycles.ts) ถ้า `beforeDelete` resolve
    // identifier ไม่ออก จะ stash เป็น null แล้ว afterDelete ข้าม unlink ไปเงียบ ๆ (มี log แล้ว — ดู
    // beforeDelete) คนที่ถูกลบจะถือเมนูค้างอยู่ตลอดไปถ้ากลไก stash นี้พังจริง ใช้สมาชิกแยกต่างหาก
    // ไม่ปนกับ uids/late ข้างบน
    const toDeleteUid = uidOf('7')
    const toDelete = await createMember(request, token, { channelId, lineUserId: toDeleteUid })
    const beforeDelete = await request.get(`${LINE_MOCK}/v2/bot/user/${toDeleteUid}/richmenu`, lineAuth)
    expect(beforeDelete.status(), 'สมาชิกที่เพิ่งสร้างต้องถูกผูกอัตโนมัติก่อนจะลบ').toBe(200)

    const deleted = await request.delete(
      `/content-manager/collection-types/${MEMBER_UID}/${toDelete.id}`, auth(token))
    expect(deleted.status(), await deleted.text()).toBe(200)

    const afterDelete = await request.get(`${LINE_MOCK}/v2/bot/user/${toDeleteUid}/richmenu`, lineAuth)
    // expect.soft ไม่ใช่ expect ธรรมดา — ด่านนี้กับด่าน rename ข้างล่างจับคนละครึ่งของงานเดียวกัน
    // (lifecycle ต้องหาแถวที่ event พูดถึงให้เจอ) การหยุดที่ด่านแรกจะทำให้รอบเดียวที่ยิงกับ Strapi
    // จริงบอกได้แค่ว่าครึ่งไหนพัง ไม่ใช่ทั้งคู่ — เทสต์ทั้งก้อนยังถูกนับว่าแดงถ้า soft assertion ไหนพัง
    expect.soft(afterDelete.status(),
      'finding ที่ 1 (task-13-findings): afterDelete ไม่มี channel ติดมาให้ — beforeDelete ต้องอ่าน ' +
      'แถวเก็บไว้ก่อน ถ้าด่านนี้แดง แปลว่าสมาชิกที่ถูกลบถือเมนูค้างอยู่ตลอดไปอย่างเงียบ ๆ')
      .toBe(404)

    // === finding ที่ 2: beforeUpdate ต้อง resolve แถวเดิมจากตัวระบุที่ event ส่งมาได้จริง ===
    //
    // สมาชิกแยกต่างหากอีกคู่ — ไม่มี afterUpdate lifecycle เลย (ดู registerMemberLifecycles) การแก้
    // lineUserId ที่นี่จึงไม่ไปสั่งอะไรฝั่ง LINE ใหม่ ถ้าใช้ uids/late ข้างบนปนกันจะไปทำให้ด่าน
    // "ทุกคนตกกลับไปที่ default" ท้ายเทสต์นี้แดงด้วยเหตุผลที่ไม่เกี่ยวกับ finding นี้เลย
    const renameFrom = await createMember(request, token, { channelId, lineUserId: uidOf('5') })
    await createMember(request, token, { channelId, lineUserId: uidOf('6') }) // เป้าหมายให้ชนซ้ำ

    // เปลี่ยน lineUserId เป็นค่าที่ไม่ซ้ำใคร โดย **ไม่ส่ง channel มาด้วย** — เหมือนฟอร์มที่แก้ทีละ
    // ฟิลด์จริง ถ้า exceptId (ที่ event.params.where ส่งมา) resolve แถวเดิมไม่ได้
    // validateMemberWrite จะ throw "cannot verify lineUserId uniqueness" (fail closed โดยตั้งใจ —
    // ดูคอมเมนต์ยาวที่ validateMemberWrite ใน lifecycles.ts) แม้ค่าใหม่จะถูกต้องและไม่ซ้ำใครเลยก็ตาม
    const legitRename = await request.put(
      `/content-manager/collection-types/${MEMBER_UID}/${renameFrom.id}`,
      { ...auth(token), data: { lineUserId: uidOf('a') } })
    // soft เหมือนด่านของ finding ที่ 1 ข้างบน — ถ้า exceptId ไม่ resolve จริง ด่าน collide ข้างล่าง
    // ยังต้องได้รันเพื่อแยกว่า "resolve ไม่ได้" กับ "เช็คซ้ำเสีย" เป็นคนละอาการกัน
    expect.soft(legitRename.status(), await legitRename.text()).toBe(200)

    // ย้ายกลับไปชนกับ uidOf('6') ที่ยังใช้อยู่จริง — ต้องโดนปฏิเสธด้วยเหตุผล "ซ้ำ" ไม่ใช่ "verify
    // channel ไม่ได้" ทั้งคู่ตอบ 400 เหมือนกัน ข้อความเท่านั้นที่แยกสองอาการออกจากกัน: ถ้าที่นี่ขึ้น
    // "cannot verify" แปลว่า exceptId ไม่ resolve จริง และ legitRename ข้างบนที่ผ่านได้ 200 ก็มาจาก
    // ช่องโหว่คนละจุด ไม่ใช่เพราะ resolve ติดจริง
    const collide = await request.put(
      `/content-manager/collection-types/${MEMBER_UID}/${renameFrom.id}`,
      { ...auth(token), data: { lineUserId: uidOf('6') } })
    expect.soft(collide.status(), await collide.text()).toBe(400)
    const collideText = await collide.text()
    expect.soft(collideText,
      `finding ที่ 2 (task-13-findings): ต้องถูกปฏิเสธเพราะ "ซ้ำ" ไม่ใช่เพราะ verify channel ไม่ได้ — ` +
      `ได้: ${collideText}`).toContain('already used')

    // ปิดสวิตช์แล้วทุกคนตกกลับไปที่ default
    const deactivated = await request.post(
      `/line-rich-menu/menus/${memberMenu.id}/audience/deactivate`, auth(token))
    expect(deactivated.status(), await deactivated.text()).toBe(204)
    for (const uid of [...uids, late]) {
      const after = await request.get(`${LINE_MOCK}/v2/bot/user/${uid}/richmenu`, lineAuth)
      expect(after.status()).toBe(404)
    }
  })

  /**
   * finding ที่ 2 (task-13-findings) เป็นเทสต์ของตัวเอง ไม่ใช่แค่หนึ่งขั้นในเส้นทางยาวข้างบน
   *
   * Content Manager ส่ง PUT มาเฉพาะฟิลด์ที่ถูกแก้ ไม่ได้แนบ `channel` มาด้วยทุกครั้ง กฎ fail closed
   * ของ validateMemberWrite จึงต้องหา channel จากแถวเดิมให้เจอ ไม่ใช่ปฏิเสธการแก้ไขที่ไม่มีอะไรผิด —
   * ที่ v4 ตัวระบุตรงกันอยู่แล้ว ด่านนี้จึงเป็นตัวยืนยันว่า fix ที่ทำให้ v5 ผ่านไม่ได้ทำฝั่งนี้พัง
   *
   * ยืนยันค่าที่เขียนลงจริงด้วยการอ่านกลับ ไม่ใช่แค่ status 200 — การเขียนที่ถูกปฏิเสธเงียบ ๆ กับ
   * การเขียนที่สำเร็จแยกกันไม่ออกถ้าดูแค่ code เดียว
   */
  test('แก้ lineUserId ผ่าน Content Manager โดยไม่ส่ง channel มาด้วย ต้องสำเร็จ', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id
    const member = await createMember(request, token, { channelId, lineUserId: uidOf('b') })
    const path = `/content-manager/collection-types/${MEMBER_UID}/${member.id}`

    const renamed = await request.put(path, { ...auth(token), data: { lineUserId: uidOf('c') } })
    expect(renamed.status(), await renamed.text()).toBe(200)

    const reloaded = await request.get(path, auth(token))
    expect(reloaded.status(), await reloaded.text()).toBe(200)
    expect((await reloaded.json()).lineUserId).toBe(uidOf('c'))
  })

  /**
   * Task 13 ruling — activate ต้องปฏิเสธเมนูที่ publish แล้วแต่ audience ไม่ใช่ 'members' (ดู
   * assertMembersAudience ใน core/server/menu-ops.ts) — ก่อนหน้านี้ด่านนี้พิสูจน์ไม่ได้เลยเพราะ
   * ไม่มีเส้นทาง HTTP ไหนสร้างเมนู audience: 'members' ได้จริง (ดูคอมเมนต์เดิมที่เคยอยู่บน
   * publishedMenu) ตอนนี้ที่ปิดช่องเขียนแล้ว ด่านนี้จึงพิสูจน์ครึ่งที่ขาดไป: เมนู 'members' activate
   * ได้ (ด่านหลักข้างบน) และเมนู 'all' activate ไม่ได้ (ด่านนี้) — ไม่ใช่แค่เช็ค status code แต่ต้อง
   * ยืนยันด้วยว่า channel.memberRichMenuId ไม่ถูกแตะเลย ผ่าน endpoint audience จริง ไม่ใช่เดาจากโค้ด
   *
   * ใช้เมนู 'เมนูหลัก' (aliasId: 'main') ที่ publish ไปแล้วตั้งแต่ด่านแรกสุดของไฟล์ (audience: 'all'
   * ซึ่งเป็นค่า default ตอนนั้น ไม่เคยส่ง audience มาเลย) แทนที่จะ publish เมนูใหม่ที่นี่ — publish
   * rate limiter (capacity: 3, คีย์ด้วย channelId — ดู core/server/rate-limit.ts) แชร์ channel
   * เดียวกันกับทุกด่านในไฟล์นี้และเติมช้ากว่าที่ suite ทั้งไฟล์ publish กัน publish เมนูใหม่ตรงนี้อีก
   * ครั้งจะชน 429 โดยไม่เกี่ยวอะไรกับสิ่งที่ด่านนี้ตั้งใจพิสูจน์เลย
   */
  test('activate เมนูที่ audience เป็น all ถูกปฏิเสธด้วย 409 menu_not_members_audience', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id

    const list = await request.get(`/line-rich-menu/menus?channel=${channelId}`, auth(token))
    expect(list.status(), await list.text()).toBe(200)
    const rows = await list.json() as
      { id: string; aliasId: string | null; audience: string; lineRichMenuId: string | null }[]
    const allMenu = rows.find((row) => row.aliasId === 'main')
    expect(allMenu, 'ด่านแรกสุดของไฟล์ต้องสร้างเมนู aliasId: main ไว้ให้แล้ว').toBeDefined()
    expect(allMenu!.audience, 'เมนูนี้ต้องยังเป็น all — ไม่มีด่านไหนก่อนหน้าเปลี่ยนมัน').toBe('all')

    const activated = await request.post(
      `/line-rich-menu/menus/${allMenu!.id}/audience/activate`, auth(token))
    expect(activated.status(), await activated.text()).toBe(409)
    expect(await activated.json()).toMatchObject({ error: { code: 'menu_not_members_audience' } })

    // ปฏิเสธจริง ไม่ใช่ปฏิเสธแล้วยังเผลอเขียน pointer ไปแล้ว — เช็คจาก endpoint audience จริง
    const audienceState = await request.get(`/line-rich-menu/channels/${channelId}/audience`, auth(token))
    expect(audienceState.status(), await audienceState.text()).toBe(200)
    expect((await audienceState.json()).memberRichMenuId).not.toBe(allMenu!.lineRichMenuId)
  })

  test('role ที่มีแค่ read เปิดสวิตช์ไม่ได้ (activate ต้องการ publish)', async ({ request }) => {
    const token = await login(request, READER)
    // v4 ใช้ literal '1' เหมือนตาราง RBAC ข้างบนของไฟล์นี้ — idParam ของ v4 คือ /^\d+$/ (ตัวเลขล้วน)
    // ไม่มีความกำกวมแบบ documentId ของ v5 ให้ต้องเลี่ยงด้วยค่าที่หน้าตาเหมือน id จริง (ดู DOC_ID ที่
    // v5 acceptance.spec.ts)
    const response = await request.post('/line-rich-menu/menus/1/audience/activate', auth(token))
    expect(response.status()).toBe(403)
  })

  test('uid ผิดรูปแบบถูกปฏิเสธตั้งแต่ตอนสร้าง member', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id
    const response = await createMemberRaw(request, token, { channelId, lineUserId: 'not-a-uid' })
    expect(response.status(), await response.text()).toBe(400)
  })
})
