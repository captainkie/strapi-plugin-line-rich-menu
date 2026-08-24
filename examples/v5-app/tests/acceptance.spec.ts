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
      // Task 5/6 เพิ่มคอลัมน์นี้ให้ channel (ตัวชี้เมนูสมาชิกที่กำลัง active) — ก่อน Task 13
      // ไม่มีใครรัน acceptance ตัวจริงเลยตั้งแต่ตอนนั้น เทสต์นี้เลยไม่เคยรู้ว่ามันโผล่มาใน response
      // จริงแล้ว (STANDING-CORRECTIONS: ด่านที่ toEqual ทั้งก้อนมีไว้จับฟิลด์ที่หายไป ไม่ใช่ให้ตามแก้
      // เงียบ ๆ ทุกครั้งที่มันเปลี่ยน — แต่ฟิลด์นี้คือของจริงที่ตั้งใจเพิ่ม ไม่ใช่ leak)
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
    // Task 20 item 7 (final-tests-findings.md M2) — หกเส้นทางใหม่ของงานสมาชิก (routes/admin.ts) ไม่
    // เคยถูกใส่ในตารางนี้เลยสักเส้น มีแค่ `activate` ที่ได้เทสต์ 403 เฉพาะกิจแยกไว้ท้ายไฟล์ (role READER
    // ไม่ใช่ AUTHOR ที่ไม่มีสิทธิ์อะไรเลย) — ที่เหลืออีกห้าเส้นไม่เคยถูกพิสูจน์ว่า 403 มาจาก policy จริง
    // บน adapter นี้เลย ใส่ทั้งหกเส้นเข้าตารางนี้เพื่อความสมมาตรกับเส้นทางเก่าทุกเส้นข้างบน
    ['POST', `/line-rich-menu/menus/${DOC_ID}/audience/activate`],
    ['POST', `/line-rich-menu/menus/${DOC_ID}/audience/deactivate`],
    ['POST', `/line-rich-menu/menus/${DOC_ID}/audience/sync`],
    ['POST', `/line-rich-menu/menus/${DOC_ID}/audience/unlink-all`],
    ['GET', `/line-rich-menu/channels/${DOC_ID}/audience`],
    ['GET', `/line-rich-menu/members/${DOC_ID}/verify`],
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
    // Task 20 item 7 (final-tests-findings.md M2) — คู่ขนานกับหกเส้นที่เพิ่มเข้า `guarded` ข้างบน
    // แต่ตรวจมุมกลับ: role ที่มี read แล้วต้องการ publish เพิ่ม ไม่ใช่ role ที่ไม่มีสิทธิ์อะไรเลย
    // ทั้งหกเส้นต้องการ PERMISSION.publish เหมือนกันหมด (routes/admin.ts)
    ['publish', 'POST', `/line-rich-menu/menus/${DOC_ID}/audience/activate`],
    ['publish', 'POST', `/line-rich-menu/menus/${DOC_ID}/audience/deactivate`],
    ['publish', 'POST', `/line-rich-menu/menus/${DOC_ID}/audience/sync`],
    ['publish', 'POST', `/line-rich-menu/menus/${DOC_ID}/audience/unlink-all`],
    ['publish', 'GET', `/line-rich-menu/channels/${DOC_ID}/audience`],
    ['publish', 'GET', `/line-rich-menu/members/${DOC_ID}/verify`],
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

/**
 * Task 13 — ด่านสุดท้ายที่พิสูจน์คำตอบของสามคำถามของฟีเจอร์ audience สมาชิก (ดู task-13-brief.md)
 * ด้วยการสังเกตพฤติกรรมจริงบน Strapi 5 ตัวจริง ไม่ใช่เดาจากโค้ด — ทั้งสามข้อมีคำตอบแล้ว (ผลของ task
 * นี้เอง) คำถามยังอยู่ตรงนี้เพื่อบอกว่าด่านข้างล่างพิสูจน์อะไร ไม่ใช่เพราะยังไม่รู้คำตอบ:
 * 1) `afterDelete` ของ Strapi ส่ง channel ที่ populate มาให้ lifecycle จริงไหม
 * 2) `beforeUpdate` ได้ identifier ที่ resolve แถวเดิมได้จริงไหม (documentId vs id)
 * 3) payload update ที่ไม่ส่ง `channel` มา ยัง establish channel ได้จริงไหม
 *
 * วางเป็นบล็อกสุดท้ายของไฟล์โดยตั้งใจ — activate/deactivate ข้างล่างตั้ง schedule แถวใหม่แล้ว
 * เรียก tick จบในคำขอเดียวกันเอง (controllers/members.ts) แต่ยังไม่อยากเสี่ยงให้มันไปปนกับด่าน
 * "งานที่ถึงกำหนดถูก claim" ข้างบนที่นับ due/claimed/done ของทั้งฐานข้อมูลแบบเป๊ะ ๆ
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
): Promise<{ data: { documentId: string } }> {
  const response = await createMemberRaw(request, token, data)
  expect(response.status(), await response.text()).toBe(201)
  return response.json()
}

/**
 * เมนู "ของสมาชิก" ผ่านเส้นทางที่ผู้ใช้จริงเดิน — อัปโหลดรูป → สร้างเมนูพร้อม `audience: 'members'`
 * → publish
 *
 * **Task 13 ruling ปิดช่องนี้แล้ว**: เดิม `menuInputSchema` เป็น `.strict()` และไม่มีคีย์ `audience`
 * เลย ส่ง `audience: 'members'` ไปใน body ตอนนั้นจะโดน zod ปฏิเสธด้วย 400 — ตอนนี้ schema มีคีย์
 * `audience` แล้ว เป็น `z.enum(['all', 'members']).optional()` **ไม่มี** `.default('all')` (Task 13
 * fix round 3 ถอดออก — การมี default กลายเป็นบั๊กเงียบที่ round 4 ปิดช่อง ดูคอมเมนต์ที่
 * validation.ts) ไม่ส่งคีย์นี้มาแปลว่า "ไม่แก้" ไม่ใช่ "ตั้งเป็น all" — `saveMenu` เขียนมันลง patch
 * จริงก็ต่อเมื่อถูกส่งมาเท่านั้น และ repo ของทั้งสอง adapter เขียนคอลัมน์นี้กลับ DB จริง (ดู
 * validation.ts / menu-write.ts / repo.ts) เมนูที่สร้างผ่านฟังก์ชันนี้จึงมี `audience: 'members'`
 * ในฐานข้อมูลจริง ไม่ใช่ default 'all' เหมือนก่อนหน้านี้ — `audience` เป็นพารามิเตอร์ ไม่ใช่ค่าคงที่
 * เพราะเทสต์ท้ายไฟล์ต้องการเมนูที่เหลือเป็น 'all' ด้วย (เพื่อพิสูจน์ว่า activate ปฏิเสธมันจริง) —
 * 'all' ของเมนูใหม่มาจาก default ของคอลัมน์บน content-type (content-types/rich-menu.ts) ไม่ใช่จาก
 * schema ชั้นนี้
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

    /**
     * ===================== Task 17 / final review BLOCKER =====================
     *
     * เมนูที่ประกาศตัวว่าเป็นของสมาชิก ต้องไม่มีทางกลายเป็น default ของบัญชี ซึ่งผู้ติดตาม
     * **ทุกคน** เห็น ไม่ใช่แค่สมาชิก — ก่อน Task 17 นี่คือเส้นทาง**บังคับ**: ปุ่ม publish
     * ปุ่มเดียวใน editor ส่ง `setAsDefault: true` ตายตัว และสวิตช์สมาชิกทำงานได้ก็ต่อเมื่อ
     * เมนู publish แล้วเท่านั้น เมนูสมาชิกทุกตัวจึงถูกยัดให้ทุกคนก่อนจะได้เป็นของสมาชิก
     *
     * ปิดทั้งสองประตูที่ตั้ง default ได้ และยืนยันจาก **ฝั่ง LINE จริง** ว่า default ไม่ขยับ —
     * ไม่ใช่แค่ดู status code เพราะ "ปฏิเสธหลังจากตั้ง default ไปแล้ว" คือความเสียหายเดิมทุกประการ
     *
     * ยิงตรงนี้ก่อน activate โดยตั้งใจ: pointer ของ channel ยังว่าง ด่าน `menu_active_for_members`
     * (H1 ข้างล่าง) จึงยังไม่ทำงาน สิ่งที่ปฏิเสธคำขอนี้คือด่าน audience ล้วน ๆ
     */
    const accountDefault = async (): Promise<string | null> => {
      const response = await request.get(`${LINE_MOCK}/v2/bot/user/all/richmenu`, lineAuth)
      return response.status() === 200 ? (await response.json()).richMenuId as string : null
    }
    const defaultBefore = await accountDefault()

    const publishAsDefault = await request.post(`/line-rich-menu/menus/${memberMenu.id}/publish`, {
      ...auth(token), data: { setAsDefault: true },
    })
    expect(publishAsDefault.status(), await publishAsDefault.text()).toBe(409)
    expect(await publishAsDefault.json()).toMatchObject({ error: { code: 'menu_not_all_audience' } })

    const setDefaultDirect = await request.post(`/line-rich-menu/menus/${memberMenu.id}/default`, {
      ...auth(token), data: {},
    })
    expect(setDefaultDirect.status(), await setDefaultDirect.text()).toBe(409)
    expect(await setDefaultDirect.json()).toMatchObject({ error: { code: 'menu_not_all_audience' } })

    expect(await accountDefault(),
      'default ของบัญชีต้องยังเป็นเมนูเดิม ไม่ใช่เมนูสมาชิกที่เพิ่งถูกปฏิเสธไป').toBe(defaultBefore)

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

    /**
     * ===================== Task 17 / final review H1 + H2 =====================
     *
     * เมนูที่ **เป็นเมนูสมาชิกของ channel อยู่ตอนนี้** publish ซ้ำไม่ได้ และลบแถวทิ้งไม่ได้
     *
     * publish ซ้ำ: LINE ออก id ใหม่ทุกครั้ง แถวถูกเขียน id ใหม่ แล้วตัวเก่าถูกลบทิ้ง — สมาชิกทุกคน
     * หลุดจากเมนูที่ถูกลบ ขณะที่ `channel.memberRichMenuId` ยังชี้ id ที่ไม่มีอยู่แล้ว สวิตช์อ่านว่า
     * "ปิด" และสมาชิกใหม่ยังถูกแจกเมนูที่ถูกลบต่อไป
     * ลบแถว: `deactivate` เริ่มด้วย `menus.findOne(id)` แล้ว 404 — pointer กลับเป็น null ผ่าน
     * ผลิตภัณฑ์ไม่ได้อีกเลย
     *
     * วางตรงนี้เพราะเป็นจุดที่ memberMenu live จริง (activate รันแล้ว สมาชิกถือเมนูอยู่จริงบน LINE)
     * — สถานะที่ทำให้ด่านนี้มีความหมาย ไม่ใช่เขียวเพราะไม่มีอะไรให้ปฏิเสธ
     */
    const republishWhileLive = await request.post(`/line-rich-menu/menus/${memberMenu.id}/publish`, {
      ...auth(token), data: { setAsDefault: false },
    })
    expect(republishWhileLive.status(), await republishWhileLive.text()).toBe(409)
    expect(await republishWhileLive.json())
      .toMatchObject({ error: { code: 'menu_active_for_members' } })

    const deleteWhileLive = await request.delete(
      `/line-rich-menu/menus/${memberMenu.id}`, auth(token))
    expect(deleteWhileLive.status(), await deleteWhileLive.text()).toBe(409)
    expect(await deleteWhileLive.json())
      .toMatchObject({ error: { code: 'menu_active_for_members' } })

    // ปฏิเสธจริง ไม่ใช่ปฏิเสธหลังทำไปแล้ว — แถวยังอยู่ ชี้เมนูตัวเดิม และสมาชิกยังถือตัวเดิมอยู่บน LINE
    const stillThere = await request.get(`/line-rich-menu/menus/${memberMenu.id}`, auth(token))
    expect(stillThere.status(), await stillThere.text()).toBe(200)
    expect((await stillThere.json()).lineRichMenuId).toBe(memberMenu.lineRichMenuId)
    for (const uid of uids) {
      const onLine = await request.get(`${LINE_MOCK}/v2/bot/user/${uid}/richmenu`, lineAuth)
      expect(onLine.status(), 'สมาชิกต้องยังถือเมนูเดิมอยู่หลังคำขอถูกปฏิเสธ').toBe(200)
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
      `/content-manager/collection-types/${MEMBER_UID}/${toDelete.data.documentId}`, auth(token))
    expect(deleted.status(), await deleted.text()).toBe(200)

    const afterDelete = await request.get(`${LINE_MOCK}/v2/bot/user/${toDeleteUid}/richmenu`, lineAuth)
    // expect.soft ไม่ใช่ expect ธรรมดา — ด่านนี้กับด่าน rename ข้างล่างจับคนละครึ่งของรากเดียวกัน
    // (ตัวระบุที่ event ส่งมาเป็น primary key ตัวเลข ไม่ใช่ documentId ที่ชั้น service ใช้) การหยุด
    // ที่ด่านแรกจะทำให้รอบเดียวที่ยิงกับ Strapi จริงบอกได้แค่ว่าครึ่งไหนพัง ไม่ใช่ทั้งคู่ — เทสต์
    // ทั้งก้อนยังถูกนับว่าแดงถ้า soft assertion ไหนพัง
    expect.soft(afterDelete.status(),
      'finding ที่ 1 (task-13-findings): afterDelete ไม่มี channel ติดมาให้ — beforeDelete ต้องอ่าน ' +
      'แถวเก็บไว้ก่อน ถ้าด่านนี้แดง แปลว่าสมาชิกที่ถูกลบถือเมนูค้างอยู่ตลอดไปอย่างเงียบ ๆ')
      .toBe(404)

    // === Task 19 item 1 — ลบสมาชิกหลายแถวพร้อมกันจาก Content Manager ต้องปลดจาก LINE ด้วย ===
    //
    // ต้องยิงผ่าน **endpoint จริงของ Content Manager** (`actions/bulkDelete`) เท่านั้น การเรียก
    // lifecycle ตรง ๆ คือสิ่งที่ทำให้บั๊กนี้รอดมาได้: เส้นทางลบยกชุดของ v4 ยิง
    // `beforeDeleteMany`/`afterDeleteMany` ส่วน subscriber ลงทะเบียนไว้แค่ `beforeDelete`/`afterDelete`
    // ผลคือติ๊กสี่สิบแถวแล้วกดลบ = ไม่มีใครถูกปลดสักคน และเมื่อแถวหายไปแล้ว `unlink-members` ก็ตาม
    // เก็บไม่ได้อีกเลย (v5 เดินคนละทางคือลบทีละ document จึงยิงคู่เดี่ยว — ด่านนี้ปักความจริงข้อนั้นไว้
    // ให้ทั้งสอง adapter เท่ากัน ถ้า Strapi เปลี่ยนไปใช้ deleteMany เมื่อไหร่ ด่านนี้จะแดงทันที)
    //
    // `keepUid` คือครึ่งที่ทำให้ด่านนี้มีความหมาย — "ปลดทุกคนในตาราง" ก็ทำให้สองด่านแรกเขียวได้
    const bulkUids = [uidOf('d'), uidOf('e')]
    const keepUid = uidOf('f')
    const bulkTargets: { data: { documentId: string } }[] = []
    for (const lineUserId of bulkUids) {
      bulkTargets.push(await createMember(request, token, { channelId, lineUserId }))
    }
    await createMember(request, token, { channelId, lineUserId: keepUid })

    for (const lineUserId of [...bulkUids, keepUid]) {
      const linked = await request.get(`${LINE_MOCK}/v2/bot/user/${lineUserId}/richmenu`, lineAuth)
      expect(linked.status(), 'สมาชิกที่เพิ่งสร้างต้องถูกผูกอัตโนมัติก่อนจะลบยกชุด').toBe(200)
    }

    const bulkDeleted = await request.post(
      `/content-manager/collection-types/${MEMBER_UID}/actions/bulkDelete`,
      { ...auth(token), data: { documentIds: bulkTargets.map((row) => row.data.documentId) } })
    expect(bulkDeleted.status(), await bulkDeleted.text()).toBe(200)
    expect((await bulkDeleted.json()).count).toBe(bulkUids.length)

    for (const lineUserId of bulkUids) {
      const gone = await request.get(`${LINE_MOCK}/v2/bot/user/${lineUserId}/richmenu`, lineAuth)
      expect.soft(gone.status(),
        'Task 19 item 1: ลบยกชุดจาก Content Manager แล้วสมาชิกยังถือเมนูอยู่ — บน v5 เส้นทางนี้ลบ ' +
        'ทีละ document จึงยิง beforeDelete/afterDelete ถ้าด่านนี้แดง แปลว่า Strapi เปลี่ยนไปใช้ ' +
        'deleteMany แล้ว และ v5 ต้องลงทะเบียนคู่ *Many เหมือน v4')
        .toBe(404)
    }

    const untouched = await request.get(`${LINE_MOCK}/v2/bot/user/${keepUid}/richmenu`, lineAuth)
    expect.soft(untouched.status(),
      'คนที่ไม่ได้ถูกติ๊กต้องไม่ถูกปลด — ถ้าด่านนี้แดง แปลว่าการลบยกชุดกวาดเกินสิ่งที่ถูกเลือก')
      .toBe(200)

    // === finding ที่ 2: beforeUpdate ต้อง resolve แถวเดิมจากตัวระบุที่ event ส่งมาได้จริง ===
    //
    // สมาชิกแยกต่างหากอีกคู่ — ไม่มี afterUpdate lifecycle เลย (ดู registerMemberLifecycles) การแก้
    // lineUserId ที่นี่จึงไม่ไปสั่งอะไรฝั่ง LINE ใหม่ ถ้าใช้ uids/late ข้างบนปนกันจะไปทำให้ด่าน
    // "ทุกคนตกกลับไปที่ default" ท้ายเทสต์นี้แดงด้วยเหตุผลที่ไม่เกี่ยวกับ finding นี้เลย
    const renameFrom = await createMember(request, token, { channelId, lineUserId: uidOf('5') })
    await createMember(request, token, { channelId, lineUserId: uidOf('6') }) // เป้าหมายให้ชนซ้ำ

    // เปลี่ยน lineUserId เป็นค่าที่ไม่ซ้ำใคร โดย **ไม่ส่ง channel มาด้วย** — เหมือนฟอร์มที่แก้ทีละ
    // ฟิลด์จริง ถ้า exceptId resolve แถวเดิมไม่ได้ validateMemberWrite จะ throw "cannot verify
    // lineUserId uniqueness" (fail closed โดยตั้งใจ — ดูคอมเมนต์ยาวที่ validateMemberWrite ใน
    // lifecycles.ts) แม้ค่าใหม่จะถูกต้องและไม่ซ้ำใครเลยก็ตาม
    const legitRename = await request.put(
      `/content-manager/collection-types/${MEMBER_UID}/${renameFrom.data.documentId}`,
      { ...auth(token), data: { lineUserId: uidOf('a') } })
    // soft เหมือนด่านของ finding ที่ 1 ข้างบน — ถ้า exceptId ไม่ resolve จริง ด่าน collide ข้างล่าง
    // ยังต้องได้รันเพื่อแยกว่า "resolve ไม่ได้" กับ "เช็คซ้ำเสีย" เป็นคนละอาการกัน
    expect.soft(legitRename.status(), await legitRename.text()).toBe(200)

    // ย้ายกลับไปชนกับ uidOf('6') ที่ยังใช้อยู่จริง — ต้องโดนปฏิเสธด้วยเหตุผล "ซ้ำ" ไม่ใช่ "verify
    // channel ไม่ได้" ทั้งคู่ตอบ 400 เหมือนกัน ข้อความเท่านั้นที่แยกสองอาการออกจากกัน: ถ้าที่นี่ขึ้น
    // "cannot verify" แปลว่า exceptId ไม่ resolve จริง และ legitRename ข้างบนที่ผ่านได้ 200 ก็มาจาก
    // ช่องโหว่คนละจุด ไม่ใช่เพราะ resolve ติดจริง
    const collide = await request.put(
      `/content-manager/collection-types/${MEMBER_UID}/${renameFrom.data.documentId}`,
      { ...auth(token), data: { lineUserId: uidOf('6') } })
    expect.soft(collide.status(), await collide.text()).toBe(400)
    const collideText = await collide.text()
    expect.soft(collideText,
      `finding ที่ 2 (task-13-findings): ต้องถูกปฏิเสธเพราะ "ซ้ำ" ไม่ใช่เพราะ verify channel ไม่ได้ — ` +
      `ได้: ${collideText}`).toContain('already used')

    // === Task 13 fix round 4 (task-13-findings-3.md) — ordinary edit ของเมนูสมาชิกที่ active
    // อยู่จริง ผ่านเส้นทางที่ผู้ใช้จริงเดิน (real zod schema + real saveMenu + real DB) ===
    //
    // ครึ่งที่สองของ Critical เดิม (`.default('all')` ใน validation.ts) ไม่มีเทสต์ไหนจับได้เลย
    // แม้แต่เทสต์ mutation-checked ของ round 3 (menu-write.test.ts) เพราะมันเรียก saveMenu ตรง ๆ
    // ข้าม zod ไปทั้งดุ้น — ด่านนี้ยิงผ่าน HTTP จริง (PUT /line-rich-menu/menus/:id) ด้วย body
    // รูปทรงของ partial update ที่ผู้เรียก API ยังส่งได้ (menuBody() ไม่มีคีย์ audience อยู่แล้ว —
    // ตั้งแต่ Task 14b item 1 editor เองส่งคีย์นี้มาทุกครั้ง เส้นนี้จึงเป็นของผู้เรียกอื่น) เปลี่ยนแค่ name —
    // memberMenu ยัง active อยู่ตรงนี้ (activate รันไปแล้วข้างบน, deactivate ยังไม่รัน) ซึ่งเป็น
    // สถานะเดียวกับความเสียหายจริงของ Critical: label ถูกรีเซ็ตเป็น all เงียบ ๆ ทั้งที่เมนูยัง live
    // กับสมาชิกจริงอยู่ — วางไว้ก่อน deactivate โดยตั้งใจ (ดู placement note ใน task-13-findings-3.md)
    const beforeOrdinaryEdit = await request.get(`/line-rich-menu/menus/${memberMenu.id}`, auth(token))
    expect(beforeOrdinaryEdit.status(), await beforeOrdinaryEdit.text()).toBe(200)
    const menuBeforeEdit = await beforeOrdinaryEdit.json()

    const ordinaryEdit = await request.put(`/line-rich-menu/menus/${memberMenu.id}`, {
      ...auth(token),
      // เปลี่ยนแค่ name — ไม่มีคีย์ audience อยู่ในนี้เลยสักตัว
      data: menuBody({
        name: 'เมนูสมาชิก (แก้ชื่อแล้ว)',
        channelId,
        imageFileId: menuBeforeEdit.imageFileId,
        aliasId: menuBeforeEdit.aliasId,
      }),
    })
    expect(ordinaryEdit.status(), await ordinaryEdit.text()).toBe(200)

    const afterOrdinaryEdit = await request.get(`/line-rich-menu/menus/${memberMenu.id}`, auth(token))
    expect(afterOrdinaryEdit.status(), await afterOrdinaryEdit.text()).toBe(200)
    const menuAfterEdit = await afterOrdinaryEdit.json()
    expect(menuAfterEdit.name).toBe('เมนูสมาชิก (แก้ชื่อแล้ว)') // sanity — พิสูจน์ว่า PUT เขียนจริง
    expect(menuAfterEdit.audience,
      'Task 13 fix round 4: แก้เมนูสมาชิกแบบธรรมดา (ไม่ส่ง audience มาเลย) ต้องไม่รีเซ็ต audience ' +
      'เป็น all — mutation check: คืน .default(\'all\') ใน validation.ts แล้วด่านนี้ต้องแดง')
      .toBe('members')

    // แค่ label รอดยังไม่พอ — ความเสียหายจริงของ Critical คือเมนูยัง live กับสมาชิกอยู่ทั้งที่ label
    // ถูกรีเซ็ต ด่านนี้แยก "label รอด" ออกจาก "label รอด และยังผูกกับสมาชิกจริงอยู่"
    const audienceAfterEdit = await request.get(`/line-rich-menu/channels/${channelId}/audience`, auth(token))
    expect(audienceAfterEdit.status(), await audienceAfterEdit.text()).toBe(200)
    expect((await audienceAfterEdit.json()).memberRichMenuId,
      'channel.memberRichMenuId ต้องยังชี้ไปที่เมนูนี้อยู่ — ไม่ใช่แค่ label audience ที่รอด')
      .toBe(memberMenu.lineRichMenuId)

    // === Task 14b item 3 — ถอดป้าย 'members' ออกจากเมนูที่ยัง live กับสมาชิกอยู่ ต้องถูกปฏิเสธ ===
    //
    // ประตูใหม่ที่ item 1 เปิดขึ้นมา: เมื่อฟอร์มตั้ง `audience` ได้ มันก็ล้างได้ ซึ่งพาไปลงสถานะ
    // เดียวกับที่ 409 `menu_not_members_audience` (Task 13) มีไว้กันไม่ให้เกิดพอดี — label 'all'
    // ขณะที่สมาชิกจริงยังถือเมนูนี้อยู่ และหน้าจอมองไม่เห็นเลยเพราะ 'all' อ่าน active จาก default
    // ของ LINE ไม่ใช่จาก pointer ยิงผ่าน HTTP จริงที่นี่ ไม่ใช่แค่ unit test — บทเรียนเดียวกับที่
    // round 4 เจอ: ยามที่มีอยู่แต่กับของปลอมเคยพลาดครึ่งหนึ่งของ Critical มาแล้วบนสาขานี้
    //
    // วางไว้ตรงนี้เพราะเป็นจุดเดียวในไฟล์ที่ memberMenu ยัง active จริง (activate รันแล้ว,
    // deactivate ยังไม่รัน) — สถานะที่ทำให้ด่านนี้มีความหมาย ไม่ใช่เขียวเพราะไม่มีอะไรให้ปฏิเสธ
    const strippedWhileLive = await request.put(`/line-rich-menu/menus/${memberMenu.id}`, {
      ...auth(token),
      data: {
        ...menuBody({
          name: 'เมนูสมาชิก (แก้ชื่อแล้ว)',
          channelId,
          imageFileId: menuBeforeEdit.imageFileId,
          aliasId: menuBeforeEdit.aliasId,
        }),
        audience: 'all',
      },
    })
    expect(strippedWhileLive.status(), await strippedWhileLive.text()).toBe(409)
    expect(await strippedWhileLive.json()).toMatchObject({ error: { code: 'menu_active_for_members' } })

    // ปฏิเสธจริง ไม่ใช่ปฏิเสธหลังเขียนไปแล้ว — อ่านกลับทั้งสองด้าน (label กับ pointer) เหมือนที่
    // ด่าน round 4 ข้างบนทำ เพราะความเสียหายจริงคือทั้งสองอย่างไม่ตรงกัน ไม่ใช่แค่ status code
    const afterRefusal = await request.get(`/line-rich-menu/menus/${memberMenu.id}`, auth(token))
    expect(afterRefusal.status(), await afterRefusal.text()).toBe(200)
    expect((await afterRefusal.json()).audience,
      'คำขอที่ถูกปฏิเสธต้องไม่เขียนอะไรลงไปเลย').toBe('members')
    const audienceAfterRefusal = await request.get(`/line-rich-menu/channels/${channelId}/audience`, auth(token))
    expect(audienceAfterRefusal.status(), await audienceAfterRefusal.text()).toBe(200)
    expect((await audienceAfterRefusal.json()).memberRichMenuId).toBe(memberMenu.lineRichMenuId)

    // ...แต่การบันทึกธรรมดาของ editor ตัวใหม่ (ซึ่ง**ส่ง** audience: 'members' มาด้วยทุกครั้งตั้งแต่
    // item 1) ต้องยังผ่าน — ถ้าด่านข้างบนดูแค่ "มีคีย์ audience ไหม" เมนูสมาชิกที่ใช้งานอยู่จะแก้
    // อะไรไม่ได้เลยสักอย่าง ซึ่งแย่กว่าปัญหาที่มันตั้งใจแก้
    const ordinaryEditFromNewEditor = await request.put(`/line-rich-menu/menus/${memberMenu.id}`, {
      ...auth(token),
      data: {
        ...menuBody({
          name: 'เมนูสมาชิก (ฟอร์มใหม่)',
          channelId,
          imageFileId: menuBeforeEdit.imageFileId,
          aliasId: menuBeforeEdit.aliasId,
        }),
        audience: 'members',
      },
    })
    expect(ordinaryEditFromNewEditor.status(), await ordinaryEditFromNewEditor.text()).toBe(200)
    expect((await ordinaryEditFromNewEditor.json()).name).toBe('เมนูสมาชิก (ฟอร์มใหม่)')

    // ปิดสวิตช์แล้วทุกคนตกกลับไปที่ default
    const deactivated = await request.post(
      `/line-rich-menu/menus/${memberMenu.id}/audience/deactivate`, auth(token))
    expect(deactivated.status(), await deactivated.text()).toBe(204)
    for (const uid of [...uids, late]) {
      const after = await request.get(`${LINE_MOCK}/v2/bot/user/${uid}/richmenu`, lineAuth)
      expect(after.status()).toBe(404)
    }

    /**
     * === Task 17, ครึ่งที่พิสูจน์ว่า H1 เป็นยาม ไม่ใช่การล็อกเมนูสมาชิกไว้ห้ามแก้ตลอดกาล ===
     *
     * "ปิดสวิตช์สมาชิกก่อน" ที่ข้อความของ 409 บอกให้ทำ เพิ่งเกิดขึ้นจริงบรรทัดบน (deactivate ปลด
     * ทุกคนแล้ว) — publish ซ้ำต้องผ่านได้จริงตอนนี้ เมนูตัวเดียวกันเป๊ะ audience เดิม (ยังเป็น
     * 'members') ต่างจากเคสที่ถูกปฏิเสธข้างบนแค่ pointer ของ channel ถูกล้างไปแล้วเท่านั้น
     *
     * id ใหม่ที่ได้กลับมาคือหลักฐานว่าทำไมด่านนั้นต้องปฏิเสธแทนที่จะซ่อมให้: LINE ออก id ใหม่ทุก
     * publish สมาชิกทุกคนต้องถูกผูกใหม่อยู่ดีไม่ว่าทางไหน เลือกได้แค่ว่าต้นทุนนั้นจะมองเห็นหรือถูกซ่อน
     */
    const republishAfterDeactivate = await request.post(
      `/line-rich-menu/menus/${memberMenu.id}/publish`, { ...auth(token), data: { setAsDefault: false } })
    expect(republishAfterDeactivate.status(), await republishAfterDeactivate.text()).toBe(200)
    const republished = await republishAfterDeactivate.json()
    expect(republished.status).toBe('published')
    expect(republished.lineRichMenuId, 'LINE ออก id ใหม่ทุก publish').not.toBe(memberMenu.lineRichMenuId)

    // === Task 14b item 3, ครึ่งที่สอง — เมนูที่ไม่ได้ active อยู่ ต้องเปลี่ยน audience ได้ตามปกติ ===
    //
    // ยามที่ปฏิเสธทุกอย่างก็ "ไม่มีบั๊ก" เหมือนกัน — ด่านนี้คือสิ่งเดียวที่แยก "ยาม" ออกจาก
    // "ฟิลด์ที่ล็อกถาวร" เป็นเมนูตัวเดียวกับข้างบนเป๊ะ ต่างกันแค่ deactivate เพิ่งรันไป (pointer
    // ของ channel ถูกล้างแล้ว) ซึ่งคือ "ปิดสวิตช์สมาชิกก่อน" ที่ข้อความของ 409 บอกให้ทำพอดี
    const strippedAfterDeactivate = await request.put(`/line-rich-menu/menus/${memberMenu.id}`, {
      ...auth(token),
      data: {
        ...menuBody({
          name: 'เมนูสมาชิก (กลับเป็นของทุกคน)',
          channelId,
          imageFileId: menuBeforeEdit.imageFileId,
          aliasId: menuBeforeEdit.aliasId,
        }),
        audience: 'all',
      },
    })
    expect(strippedAfterDeactivate.status(), await strippedAfterDeactivate.text()).toBe(200)
    expect((await strippedAfterDeactivate.json()).audience,
      'ปิดสวิตช์แล้วต้องเปลี่ยน audience ได้จริง ไม่ใช่ถูกปฏิเสธต่อไป — ไม่งั้น 409 ข้างบนก็คือการ ' +
      'ล็อกฟิลด์นี้ถาวร ไม่ใช่ยาม').toBe('all')

    /**
     * ===================== Task 17 item 5 — ช่วงเวลาแสดงผลบนเมนูสมาชิก =====================
     *
     * `writeDisplayPeriod` แปลง startAt/endAt เป็นแถว `set-default`/`clear-default` โดยไม่ดู
     * audience เลย เมนูสมาชิกที่มีช่วงเวลาแสดงผลจึงถูกยัดให้ผู้ติดตามทุกคนเมื่อถึงเวลาเริ่ม —
     * ประตูที่สองของ BLOCKER เดียวกัน แต่มาแบบตั้งเวลาไว้ล่วงหน้า
     *
     * สองคำขอนี้ต่างกัน **ฟิลด์เดียว** คือ audience — นั่นคือทั้งหมดที่แยก "ยาม" ออกจาก
     * "ปิดฟีเจอร์ช่วงเวลาแสดงผลทิ้ง" (สเปก §5.7 ยังต้องใช้ได้กับเมนูของทุกคนเหมือนเดิม)
     */
    const period = { startAt: '2026-12-01T00:00:00.000Z', endAt: '2026-12-31T00:00:00.000Z' }
    const periodBase = menuBody({
      name: 'เมนูสมาชิก (ช่วงเวลา)',
      channelId,
      imageFileId: menuBeforeEdit.imageFileId,
      aliasId: menuBeforeEdit.aliasId,
    })

    const periodOnMembers = await request.put(`/line-rich-menu/menus/${memberMenu.id}`, {
      ...auth(token), data: { ...periodBase, ...period, audience: 'members' },
    })
    expect(periodOnMembers.status(), await periodOnMembers.text()).toBe(409)
    expect(await periodOnMembers.json())
      .toMatchObject({ error: { code: 'menu_display_period_not_allowed' } })

    const periodOnAll = await request.put(`/line-rich-menu/menus/${memberMenu.id}`, {
      ...auth(token), data: { ...periodBase, ...period, audience: 'all' },
    })
    expect(periodOnAll.status(), await periodOnAll.text()).toBe(200)
    const withPeriod = await periodOnAll.json()
    expect({ startAt: withPeriod.startAt, endAt: withPeriod.endAt },
      'ช่วงเวลาแสดงผลของเมนูทุกคนต้องถูกเขียนลงจริง ไม่ใช่แค่ตอบ 200').toEqual(period)

    // ล้างช่วงเวลาก่อนลบแถว — ไม่ทิ้งงานที่ค้างชี้เมนูที่ไม่มีอยู่แล้วไว้ให้ scheduler
    const clearedPeriod = await request.put(`/line-rich-menu/menus/${memberMenu.id}`, {
      ...auth(token), data: { ...periodBase, startAt: null, endAt: null, audience: 'all' },
    })
    expect(clearedPeriod.status(), await clearedPeriod.text()).toBe(200)

    /**
     * === Task 17, ครึ่งที่พิสูจน์ว่า H2 เป็นยาม ไม่ใช่การห้ามลบเมนูสมาชิกตลอดกาล ===
     * pointer ของ channel ถูกล้างไปแล้วตั้งแต่ deactivate — ลบได้จริง และหายไปจริง
     */
    const deleteAfterDeactivate = await request.delete(
      `/line-rich-menu/menus/${memberMenu.id}`, auth(token))
    expect(deleteAfterDeactivate.status(), await deleteAfterDeactivate.text()).toBe(204)
    const gone = await request.get(`/line-rich-menu/menus/${memberMenu.id}`, auth(token))
    expect(gone.status(), await gone.text()).toBe(404)
  })

  /**
   * ===================== Task 17 / deferred item 3 — ย้าย channel =====================
   *
   * `saveMenu` เขียน `channelId` จาก input ตรง ๆ ทุกครั้ง การย้ายเมนูสมาชิกที่ยัง live อยู่ไป
   * channel อื่นโดยคงป้าย `'members'` ไว้ จึงข้าม `assertAudienceChangeAllowed` ทั้งด่าน (มัน
   * return early ที่ `next === 'members'` ก่อนจะได้อ่าน channel ด้วยซ้ำ) ผลคือ pointer ของ channel
   * ต้นทางยังชี้เมนูที่ย้ายไปแล้ว ส่วน `deactivate` ไปอ่าน channel ปลายทาง — ล้างของต้นทางไม่ได้อีก
   * เลย สถานะเดียวกับการลบแถวทิ้ง (H2) เป๊ะ ๆ
   *
   * ไม่มีเส้นทางจาก editor ที่ทำแบบนี้ได้ (ฟอร์มส่ง channelId เดิมกลับมาเสมอ) — แต่นั่นคือเหตุผลที่
   * ด่านต้องอยู่ที่ชั้น API ไม่ใช่ที่ฟอร์ม และเป็นเหตุผลที่ด่านนี้ต้องมีเทสต์ที่ยิง API จริง
   *
   * ใช้เมนู 'เมนูหลัก' (aliasId: 'main') ที่ publish ไปแล้วตั้งแต่ด่านแรกสุดของไฟล์ ไม่ publish เมนู
   * ใหม่ที่นี่ — publish rate limiter (capacity 3 ต่อ channel) แชร์กันทั้งไฟล์ (เหตุผลเดียวกับที่
   * ด่าน 'activate เมนูที่ audience เป็น all' ข้างล่างอธิบายไว้)
   */
  test('ย้าย channel ของเมนูที่ขึ้น LINE แล้วถูกปฏิเสธด้วย 409 menu_channel_locked', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id

    // ชื่อของ channel ที่สองต้องเรียง**หลัง**ของเดิมเสมอ — `theChannel` ของไฟล์นี้หยิบแถวแรกจาก
    // GET /channels ซึ่งเรียงตามชื่อ ถ้าตัวใหม่แย่งตำแหน่งแถวแรก ทุกเทสต์ที่เหลือจะไปทำงานกับ
    // channel ผิดตัวเงียบ ๆ ใช้ชื่อเดิมแล้วต่อท้าย (prefix เดียวกัน ยาวกว่า = เรียงหลังเสมอ)
    const second = await request.post('/line-rich-menu/channels', {
      ...auth(token),
      data: {
        name: 'ร้านทดสอบสอง', channelId: '1650000001',
        channelAccessToken: 'e2e-access-token-second-WXYZ',
      },
    })
    expect(second.status(), await second.text()).toBe(200)
    const secondId = (await second.json()).id as string
    expect((await theChannel(request, token)).id,
      'channel ที่สองต้องไม่แย่งตำแหน่งแถวแรกของ theChannel').toBe(channelId)

    const list = await request.get(`/line-rich-menu/menus?channel=${channelId}`, auth(token))
    expect(list.status(), await list.text()).toBe(200)
    const rows = await list.json() as { id: string; aliasId: string | null }[]
    const mainMenu = rows.find((row) => row.aliasId === 'main')
    expect(mainMenu, 'ด่านแรกสุดของไฟล์ต้องสร้างเมนู aliasId: main ไว้ให้แล้ว').toBeDefined()

    const detailResponse = await request.get(`/line-rich-menu/menus/${mainMenu!.id}`, auth(token))
    expect(detailResponse.status(), await detailResponse.text()).toBe(200)
    const detail = await detailResponse.json()
    expect(detail.lineRichMenuId, 'เมนูนี้ต้อง publish ไปแล้วจริง ไม่งั้นด่านนี้เขียวเพราะไม่มีอะไรให้กัน')
      .not.toBeNull()

    const body = (targetChannelId: string) => ({
      ...menuBody({
        name: detail.name, channelId: targetChannelId,
        imageFileId: detail.imageFileId, aliasId: detail.aliasId,
      }),
      audience: 'all',
    })

    const moved = await request.put(`/line-rich-menu/menus/${mainMenu!.id}`, {
      ...auth(token), data: body(secondId),
    })
    expect(moved.status(), await moved.text()).toBe(409)
    expect(await moved.json()).toMatchObject({ error: { code: 'menu_channel_locked' } })

    // ปฏิเสธจริง ไม่ใช่ปฏิเสธหลังเขียนไปแล้ว — แถวต้องยังสังกัด channel เดิม
    const afterRefusal = await request.get(`/line-rich-menu/menus/${mainMenu!.id}`, auth(token))
    expect((await afterRefusal.json()).channelId).toBe(channelId)

    // คู่ที่พิสูจน์ว่านี่คือยาม ไม่ใช่การล็อกเมนูที่ publish แล้วห้ามแก้ — คำขอเดียวกันเป๊ะ
    // ต่างกันแค่ channelId เป็นตัวเดิม ซึ่งคือสิ่งที่ฟอร์มส่งมาทุกครั้งที่กด Save
    const savedInPlace = await request.put(`/line-rich-menu/menus/${mainMenu!.id}`, {
      ...auth(token), data: body(channelId),
    })
    expect(savedInPlace.status(), await savedInPlace.text()).toBe(200)
    expect((await savedInPlace.json()).channelId).toBe(channelId)
  })

  /**
   * finding ที่ 2 (task-13-findings) เป็นเทสต์ของตัวเอง ไม่ใช่แค่หนึ่งขั้นในเส้นทางยาวข้างบน
   *
   * Content Manager ส่ง PUT มาเฉพาะฟิลด์ที่ถูกแก้ ไม่ได้แนบ `channel` มาด้วยทุกครั้ง กฎ fail closed
   * ของ validateMemberWrite จึงต้องหา channel จากแถวเดิมให้เจอ ไม่ใช่ปฏิเสธการแก้ไขที่ไม่มีอะไรผิด —
   * บน v5 ตัวระบุที่ lifecycle ได้รับคือ primary key ตัวเลข ต้องแปลเป็น documentId ก่อนถึงจะหาเจอ
   * (ดู `documentIdByPk` ใน lifecycles.ts)
   *
   * ยืนยันค่าที่เขียนลงจริงด้วยการอ่านกลับ ไม่ใช่แค่ status 200 — การเขียนที่ถูกปฏิเสธเงียบ ๆ กับ
   * การเขียนที่สำเร็จแยกกันไม่ออกถ้าดูแค่ code เดียว
   */
  test('แก้ lineUserId ผ่าน Content Manager โดยไม่ส่ง channel มาด้วย ต้องสำเร็จ', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id
    const member = await createMember(request, token, { channelId, lineUserId: uidOf('b') })
    const path = `/content-manager/collection-types/${MEMBER_UID}/${member.data.documentId}`

    const renamed = await request.put(path, { ...auth(token), data: { lineUserId: uidOf('c') } })
    expect(renamed.status(), await renamed.text()).toBe(200)

    const reloaded = await request.get(path, auth(token))
    expect(reloaded.status(), await reloaded.text()).toBe(200)
    expect((await reloaded.json()).data.lineUserId).toBe(uidOf('c'))
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
    const response = await request.post(
      `/line-rich-menu/menus/${DOC_ID}/audience/activate`, auth(token))
    expect(response.status()).toBe(403)
  })

  test('uid ผิดรูปแบบถูกปฏิเสธตั้งแต่ตอนสร้าง member', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id
    const response = await createMemberRaw(request, token, { channelId, lineUserId: 'not-a-uid' })
    expect(response.status(), await response.text()).toBe(400)
  })
})

/**
 * ===================== Task 16 — แถวที่มีอยู่ก่อนคอลัมน์ `audience` =====================
 *
 * ด่านนี้เป็นด่านเดียวในไฟล์ที่ **ไม่ได้** เริ่มจากแถวที่ Strapi สร้างให้ และนั่นคือทั้งหมดของมัน
 *
 * `default: 'all'` บน content-type ไม่เคยกลายเป็น DEFAULT ของฐานข้อมูล — Strapi ใส่ค่านั้นให้ตอน
 * *สร้างแถว* ผ่าน document/entity service เท่านั้น (คอลัมน์จริงคือ varchar nullable ไม่มี default
 * ทั้งบน SQLite และ PostgreSQL 16 — task-15-report.md §"Step 2") ทุกเทสต์ที่เหลือในรีโปนี้เขียนแถว
 * ผ่านเส้นทางนั้นเสมอ จึงได้ 'all' มาฟรีทุกครั้ง และ **ไม่มีตัวไหนแตะข้อบกพร่องนี้ได้เลยโดยโครงสร้าง**
 * — สิบสามงานกับหกรอบรีวิวผ่านมันไปด้วยเหตุผลนี้ข้อเดียว
 *
 * ด่านนี้จึงเขียนคอลัมน์ให้เป็น NULL ตรง ๆ ผ่านไดรเวอร์ฐานข้อมูล ข้าม document service ทั้งดุ้น
 * ซึ่งเป็นรูปทรงเดียวกับแถวของแอปที่อัปเกรดมาจาก 1.0.0 เป๊ะ ๆ แล้วถามสองคำถามที่ผู้ใช้ถามจริง:
 * เปิดดูแล้วเห็นอะไร และกด Save แล้วผ่านไหม
 */

/**
 * ค่าเดียวกับที่ config/database.js อ่าน — ต้องเป็นชุดเดียวกับที่โปรเซส Strapi บูตมา ไม่งั้นด่านนี้
 * จะไปเขียนฐานข้อมูลคนละใบกับที่ API ตอบมา แล้วแดงด้วยเหตุผลที่ไม่เกี่ยวกับปลั๊กอินเลย
 */
const DATABASE_CLIENT = process.env['DATABASE_CLIENT'] ?? 'sqlite'

/** ผิวขั้นต่ำของ better-sqlite3 เท่าที่ใช้จริง — แพ็กเกจนี้ไม่มี type ของตัวเองมาให้ */
interface SqliteStatement {
  reader: boolean
  run(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}
interface SqliteDatabase {
  prepare(statement: string): SqliteStatement
  close(): void
}

/**
 * ยิง SQL ตรง ๆ ด้วยไดรเวอร์ตัวเดียวกับที่แอปประกาศไว้ใน dependencies (better-sqlite3 / pg)
 * ไม่ใช่ knex ที่ติดมาแบบ transitive กับ @strapi/database — ตัวหลังหายไปได้เงียบ ๆ วันที่ Strapi
 * เปลี่ยนกราฟ dependency ของตัวเอง แล้วด่านนี้จะพังด้วยเหตุผลที่ไม่ใช่ของมัน
 *
 * `?` เป็น placeholder กลาง แล้วแปลงเป็น `$1, $2, …` ให้ pg ตอนยิง — สองไดรเวอร์นี้ใช้คนละสำนวน
 */
async function runSql(statement: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  if (DATABASE_CLIENT === 'postgres') {
    const { Client } = await import('pg')
    const client = new Client((() => {
      // ตรงกับ config/database.js ของแอปนี้ ซึ่งรับได้ทั้ง DATABASE_URL เดี่ยว ๆ (Neon/Render)
      // และชุด HOST/PORT/NAME/USERNAME/PASSWORD ที่ matrix ของ CI ใช้
      const url = process.env['DATABASE_URL']
      return url === undefined || url === ''
        ? {
            host: process.env['DATABASE_HOST'] ?? '127.0.0.1',
            port: Number(process.env['DATABASE_PORT'] ?? '5432'),
            database: process.env['DATABASE_NAME'] ?? 'strapi',
            user: process.env['DATABASE_USERNAME'] ?? 'strapi',
            password: process.env['DATABASE_PASSWORD'] ?? 'strapi',
          }
        : { connectionString: url, ssl: process.env['DATABASE_SSL'] !== 'false' }
    })())
    await client.connect()
    try {
      let placeholder = 0
      const result = await client.query(statement.replace(/\?/g, () => `$${++placeholder}`), params)
      return result.rows as Record<string, unknown>[]
    } finally {
      await client.end()
    }
  }

  const loaded = await import('better-sqlite3')
  // better-sqlite3 เป็น CommonJS ล้วน — Playwright แปลงไฟล์นี้เป็น CJS แล้วห่อด้วย interop ตัวจริง
  // จึงอยู่ที่ `.default` ส่วนตัวโมดูลเองเป็น fallback ให้ runtime ที่ไม่ได้ห่อ
  const Database = ((loaded as { default?: unknown }).default ?? loaded) as new (file: string) => SqliteDatabase
  // path เดียวกับ config/database.js — ไฟล์เดียวกับที่ Strapi เปิดอยู่จริง
  const database = new Database(join(__dirname, '..', process.env['DATABASE_FILENAME'] ?? '.tmp/data.db'))
  try {
    const prepared = database.prepare(statement)
    if (!prepared.reader) {
      prepared.run(...params)
      return []
    }
    return prepared.all(...params) as Record<string, unknown>[]
  } finally {
    database.close()
  }
}

/** ค่าดิบในคอลัมน์ ไม่ผ่าน repo/API — จุดเดียวที่แยก "แถวถูกซ่อมแล้ว" ออกจาก "ขาอ่านกลบให้" ได้ */
async function storedAudience(menuId: string): Promise<unknown> {
  const rows = await runSql(
    'SELECT audience FROM rich_menus WHERE document_id = ?', [menuId])
  expect(rows.length, `ต้องเจอแถวเมนู ${menuId} ในตาราง rich_menus พอดีหนึ่งแถว`).toBe(1)
  return rows[0]!['audience']
}

/** ทำให้แถวกลับไปมีรูปทรงของก่อนอัปเกรด — เขียน NULL ตรง ๆ ข้าม document service ที่เติม default ให้ */
async function makeAudienceLegacyNull(menuId: string): Promise<void> {
  await runSql('UPDATE rich_menus SET audience = NULL WHERE document_id = ?', [menuId])
  // ถ้า UPDATE ไม่โดนแถวไหนเลย (ชื่อคอลัมน์คีย์ผิด, ฐานข้อมูลคนละใบ) ทุก assertion ที่เหลือจะเขียว
  // เพราะแถวยังเป็น 'all' อยู่แล้ว — ด่านนี้คือสิ่งเดียวที่กันไม่ให้เทสต์ทั้งชุดเขียวโดยไม่ได้ทดสอบอะไร
  expect(await storedAudience(menuId),
    'แถวต้องเป็น NULL จริง ๆ ก่อนเริ่มถาม ไม่งั้นด่านที่เหลือเขียวฟรี').toBeNull()
}

test.describe('audience ของเมนูที่มีอยู่ก่อนคอลัมน์ (อัปเกรดจาก 1.0.0)', () => {
  test('เมนูที่ audience เป็น NULL ในฐานข้อมูล อ่านได้เป็น all และ save จาก editor ผ่าน', async ({ request }) => {
    const token = await login(request, ADMIN)
    const channelId = (await theChannel(request, token)).id
    const fileId = await uploadImage(request, token, 'legacy-audience.jpg')

    const created = await request.post('/line-rich-menu/menus', {
      ...auth(token),
      data: menuBody({
        name: 'เมนูที่สร้างไว้ตั้งแต่ 1.0.0', channelId, imageFileId: fileId, aliasId: 'legacy-audience',
      }),
    })
    expect(created.status(), await created.text()).toBe(201)
    const menuId = (await created.json()).id as string

    await makeAudienceLegacyNull(menuId)

    // 1) ขาอ่านของหน้า editor — เดิมได้ null กลับมา แล้ว radio group วาดออกมาโดยไม่มีตัวไหนถูกเลือก
    const detailResponse = await request.get(`/line-rich-menu/menus/${menuId}`, auth(token))
    expect(detailResponse.status(), await detailResponse.text()).toBe(200)
    const detail = await detailResponse.json()
    // สองด่านขาอ่านนี้เป็น `expect.soft` โดยตั้งใจ ไม่ใช่เพราะมันสำคัญน้อยกว่า — ถ้าเป็นด่านแข็ง
    // เทสต์จะหยุดตรงนี้ตอนการแปลงพัง แล้วด่านที่สำคัญที่สุดของไฟล์นี้ (PUT ต้องได้ 200 ไม่ใช่ 400)
    // จะไม่เคยถูกรันเลยในรอบที่มันควรแดง — mutation check จะเห็นแค่อาการเดียวจากสามอาการ
    expect.soft(detail.audience,
      'แถวที่เก่ากว่าคอลัมน์ต้องอ่านได้เป็น all — mutation check: ถอด `audienceOrAll` ใน repo.ts ' +
      'ออกแล้วด่านนี้ต้องแดงด้วย null').toBe('all')

    // 2) ขาอ่านของหน้ารายการ — คนละเส้นทางกับ findOne และเป็นเส้นที่วาดคอลัมน์ Audience
    const listResponse = await request.get('/line-rich-menu/menus', auth(token))
    expect(listResponse.status(), await listResponse.text()).toBe(200)
    const listed = (await listResponse.json() as { id: string; audience: string }[])
      .find((row) => row.id === menuId)
    expect(listed, 'เมนูต้องยังอยู่ในรายการ').toBeDefined()
    expect.soft(listed!.audience,
      "หน้ารายการวาด t(`audience.${menu.audience}`) — null พาไปที่คีย์ audience.null ที่ไม่มีอยู่จริง")
      .toBe('all')

    // 3) ความเสียหายที่ผู้ใช้เจอจริง: กด Save เมนูเก่าโดยแก้แค่ชื่อ
    //
    // body ตรงนี้เป็นรูปทรงของ Editor.tsx เป๊ะ ๆ — **ส่ง `audience: detail.audience` มาด้วยเสมอ**
    // (ตั้งแต่ Task 14b item 1) ซึ่งเป็นเหตุผลที่ข้อบกพร่องนี้กลายเป็น 400: `menuInputSchema` เป็น
    // `z.enum([...]).optional()` ซึ่งปฏิเสธ `null` — optional ไม่ใช่ nullable ผู้ใช้จึงบันทึกไม่ได้
    // ด้วย error บนฟิลด์ที่ตัวเองไม่ได้แตะ ต้องยืนยัน 200 ไม่ใช่แค่ค่าที่อ่านได้ เพราะ 400 นี่แหละ
    // คืออาการที่คนใช้งานจริงเจอ
    const editorSave = await request.put(`/line-rich-menu/menus/${menuId}`, {
      ...auth(token),
      data: {
        name: 'เมนูที่สร้างไว้ตั้งแต่ 1.0.0 (แก้ชื่อแล้ว)',
        channelId: detail.channelId,
        size: detail.size,
        chatBarText: detail.chatBarText,
        chatBarMode: detail.chatBarMode,
        selected: detail.selected,
        templateKey: detail.templateKey,
        audience: detail.audience,
        areas: detail.areas,
        imageFileId: detail.imageFileId,
        areaImages: [],
        aliasId: detail.aliasId,
        startAt: detail.startAt ?? null,
        endAt: detail.endAt ?? null,
      },
    })
    expect(editorSave.status(),
      `การกด Save เมนูเก่าโดยแก้แค่ชื่อ ต้องได้ 200 ไม่ใช่ 400 validation_failed บน audience: ` +
      `${await editorSave.text()}`).toBe(200)
    expect((await editorSave.json()).name).toBe('เมนูที่สร้างไว้ตั้งแต่ 1.0.0 (แก้ชื่อแล้ว)')

    // 4) แถวถูกซ่อมจริงในฐานข้อมูล ไม่ใช่แค่ถูกกลบตอนอ่าน — ถ้ายังเป็น NULL แปลว่าขาเขียนไม่เคยเห็น
    // ค่าที่ขาอ่านแปลงให้เลย แล้วเครื่องมืออื่นที่อ่านตารางตรง ๆ ยังเจอค่าที่ model บอกว่าเป็นไปไม่ได้
    expect(await storedAudience(menuId),
      'หลังบันทึก คอลัมน์ต้องถือสตริง all จริง ไม่ใช่ NULL ที่ขาอ่านกลบไว้').toBe('all')
  })
})

/**
 * ===================== Task 22 / review H-1 — relabel เมนูที่เป็น account default ของบัญชี =====================
 *
 * ครึ่งที่เหลือของ class เดียวกับ H1/H2 ของ Task 17 ข้างบน: ที่นั่นกันไม่ให้เมนูป้าย 'members' ถูกตั้ง
 * เป็น default ของบัญชี ที่นี่กันทางกลับ — เมนูที่ **เป็น** default ของบัญชีอยู่แล้วถูกติดป้าย 'members'
 * ทีหลัง ซึ่งลงเอยที่สถานะเดียวกันเป๊ะ (ดู `assertNotAccountDefault` ใน core/server/menu-ops.ts และ
 * finding H-1 ใน review-17-20-21-findings.md) เส้นทางที่ brief ต้องการพิสูจน์คือของจริงที่ปุ่ม publish
 * ปุ่มเดียวของ editor สำหรับเมนู audience: 'all' ส่งอยู่แล้ว (`setAsDefault: true` เสมอ):
 *   1) สร้างเมนู audience: 'all' แล้ว publish พร้อม setAsDefault: true → เป็น default ของบัญชีจริง
 *   2) PUT relabel เป็น 'members' → ต้องถูกปฏิเสธ
 *
 * channel ของตัวเองแยกต่างหาก ไม่ใช้ 'ร้านทดสอบ' ร่วมกับเทสต์อื่นทั้งไฟล์ ด้วยสองเหตุผล: (ก) LINE mock
 * แยก store ตาม access token (หนึ่ง token = หนึ่ง OA) ดังนั้น "default ของบัญชี" ที่เทสต์นี้ตั้ง/อ่าน
 * เป็นถังของตัวเองล้วน ๆ ไม่ปนกับ default ที่เทสต์อื่นตั้งไว้ (โดยเฉพาะ 'เมนูตั้งเวลา' ที่ describe
 * 'scheduler บน Strapi 5' ข้างบนเปลี่ยน default ของ 'ร้านทดสอบ' ไปแล้ว) (ข) 'ร้านทดสอบ' มีเมนู
 * 'เมนูหลัก' ที่ด่าน "activate เมนูที่ audience เป็น all" ยังอ้างว่า audience ต้องเป็น 'all' อยู่ —
 * brief บอกว่า "ถ้าต้องการเมนู ให้สร้างของตัวเอง ไม่ใช้ซ้ำกับเมนูที่เทสต์อื่น assert อยู่" การแยก channel
 * ทำให้ข้อนี้เป็นจริงโดยไม่ต้องระวังทีละบรรทัด และไม่ต้องแย่งโควตา publish rate limiter (คีย์ด้วย
 * channelId — capacity 3 ต่อ channel) กับเทสต์อื่นด้วย — วางเป็นบล็อกสุดท้ายของไฟล์เพื่อไม่ให้กระทบ
 * เทสต์อื่นที่พึ่งลำดับสถานะของไฟล์นี้อยู่ (ไม่มีอะไรรันต่อจากนี้ให้เสีย)
 */
test.describe('Task 22 / review H-1 — relabel เมนูที่เป็น account default ของบัญชี', () => {
  test(
    'publish เป็น default ของบัญชีแล้ว relabel เป็น members ถูกปฏิเสธ — จับคู่กับเมนูที่ไม่ใช่ default ' +
    'ซึ่งต้อง relabel ได้ปกติ',
    async ({ request }) => {
      const token = await login(request, ADMIN)

      const ACCESS_TOKEN = 'e2e-access-token-h1-QRST'
      const h1Auth = { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }

      const channelResponse = await request.post('/line-rich-menu/channels', {
        ...auth(token),
        data: { name: 'ร้านทดสอบ H-1', channelId: '1650000002', channelAccessToken: ACCESS_TOKEN },
      })
      expect(channelResponse.status(), await channelResponse.text()).toBe(200)
      const channelId = (await channelResponse.json()).id as string

      // ===== ข้อ 1 (H-1): publish เป็น account default จริง ผ่านเส้นทางที่ editor เดินจริง =====
      const fileId = await uploadImage(request, token, 'h1-default.jpg')
      const created = await request.post('/line-rich-menu/menus', {
        ...auth(token),
        data: menuBody({ name: 'เมนู H-1 (default)', channelId, imageFileId: fileId, aliasId: 'h1-default' }),
      })
      expect(created.status(), await created.text()).toBe(201)
      const menu = await created.json()
      expect(menu.audience, 'เมนูใหม่ต้องเป็น all จาก default ของคอลัมน์').toBe('all')

      // ปุ่ม publish ปุ่มเดียวของ editor สำหรับเมนู audience: all ส่ง setAsDefault: true เสมอ — นี่คือ
      // เส้นทางจริงที่ H-1 ข้อ 1 อธิบายไว้ ไม่ใช่การจำลองสถานการณ์ที่เดินไม่ถึงจากหน้าจอ
      const published = await request.post(`/line-rich-menu/menus/${menu.id}/publish`, {
        ...auth(token), data: { setAsDefault: true },
      })
      expect(published.status(), await published.text()).toBe(200)
      const outcome = await published.json()

      // ยืนยันจากฝั่ง LINE จริง ไม่ใช่เดาจาก status code ของ publish — ต้องเป็น default จริง ๆ
      const defaultAfterPublish = await request.get(`${LINE_MOCK}/v2/bot/user/all/richmenu`, h1Auth)
      expect(defaultAfterPublish.status(), await defaultAfterPublish.text()).toBe(200)
      expect((await defaultAfterPublish.json()).richMenuId).toBe(outcome.lineRichMenuId)

      // ===== ข้อ 2 (H-1): relabel เป็น members ต้องถูกปฏิเสธ (assertNotAccountDefault ใน core) =====
      const relabelDefault = await request.put(`/line-rich-menu/menus/${menu.id}`, {
        ...auth(token),
        data: {
          ...menuBody({ name: 'เมนู H-1 (default)', channelId, imageFileId: fileId, aliasId: 'h1-default' }),
          audience: 'members',
        },
      })
      expect(relabelDefault.status(), await relabelDefault.text()).toBe(409)
      expect(await relabelDefault.json()).toMatchObject({ error: { code: 'menu_is_account_default' } })

      // ปฏิเสธจริง ไม่ใช่ปฏิเสธหลังเขียนไปแล้ว — แถวต้องยังเป็น all และ default ของบัญชีต้องไม่ขยับ
      const afterRefusal = await request.get(`/line-rich-menu/menus/${menu.id}`, auth(token))
      expect(afterRefusal.status(), await afterRefusal.text()).toBe(200)
      expect((await afterRefusal.json()).audience, 'คำขอที่ถูกปฏิเสธต้องไม่เขียนอะไรลงไป').toBe('all')
      const defaultAfterRefusal = await request.get(`${LINE_MOCK}/v2/bot/user/all/richmenu`, h1Auth)
      expect((await defaultAfterRefusal.json()).richMenuId).toBe(outcome.lineRichMenuId)

      /**
       * ===== การจับคู่ (ไม่ optional): เมนู publish แล้วแต่ไม่ใช่ account default ต้อง relabel ได้ปกติ
       *
       * ยามที่ปฏิเสธไม่มีเงื่อนไขก็ผ่านด่านข้างบนได้เหมือนกัน — ด่านนี้เท่านั้นที่แยก "ยาม" ออกจาก
       * "ห้าม relabel เมนู publish แล้วทุกตัวเป็น members" ซึ่งพังการแก้ไขปกติทั้งหมด การจับคู่แบบนี้
       * เคยจับข้อบกพร่องจริงมาแล้วสองครั้งบนแบรนช์นี้ (ดู task-22-brief.md)
       */
      const fileId2 = await uploadImage(request, token, 'h1-notdefault.jpg')
      const created2 = await request.post('/line-rich-menu/menus', {
        ...auth(token),
        data: menuBody({
          name: 'เมนู H-1 (ไม่ใช่ default)', channelId, imageFileId: fileId2, aliasId: 'h1-not-default',
        }),
      })
      expect(created2.status(), await created2.text()).toBe(201)
      const menu2 = await created2.json()

      const published2 = await request.post(`/line-rich-menu/menus/${menu2.id}/publish`, {
        ...auth(token), data: { setAsDefault: false },
      })
      expect(published2.status(), await published2.text()).toBe(200)

      // default ของบัญชียังต้องเป็นเมนูแรก — publish แบบ setAsDefault: false ต้องไม่แตะมัน ถ้าด่านนี้
      // แดง แปลว่าเมนูตัวที่สองดันกลายเป็น default ไปแล้ว และด่านคู่ข้างล่างจะเขียวเพราะไม่มีอะไรให้ผ่าน
      const defaultBeforeRelabel2 = await request.get(`${LINE_MOCK}/v2/bot/user/all/richmenu`, h1Auth)
      expect((await defaultBeforeRelabel2.json()).richMenuId,
        'เมนูตัวที่สองต้อง publish แบบไม่ใช่ default').toBe(outcome.lineRichMenuId)

      const relabelNotDefault = await request.put(`/line-rich-menu/menus/${menu2.id}`, {
        ...auth(token),
        data: {
          ...menuBody({
            name: 'เมนู H-1 (ไม่ใช่ default)', channelId, imageFileId: fileId2, aliasId: 'h1-not-default',
          }),
          audience: 'members',
        },
      })
      expect(relabelNotDefault.status(), await relabelNotDefault.text()).toBe(200)
      expect((await relabelNotDefault.json()).audience).toBe('members')
    },
  )
})
