import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LineClient } from '@fosivo/line-rich-menu-core'
import { createServer } from '../src/server.js'

let baseUrl = ''
const app = createServer()

beforeAll(async () => {
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (typeof address === 'object' && address) baseUrl = `http://127.0.0.1:${address.port}`
})
afterAll(() => app.close())

const payload = {
  size: { width: 2500, height: 843 },
  selected: false,
  name: 'mock menu',
  chatBarText: 'menu',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'message' as const, text: 'hi' } }],
}

describe('line-mock ทำงานเข้ากันได้กับ LineClient จริง', () => {
  it('รองรับวงจร publish ครบ: create → upload → alias → setDefault → list → delete', async () => {
    const client = new LineClient({ accessToken: 'anything', apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })

    await client.validateRichMenu(payload)
    const id = await client.createRichMenu(payload)
    expect(id).toMatch(/^richmenu-/)

    await client.uploadContent(id, Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png')
    await client.createAlias('tab-a', id)
    await client.setDefault(id)

    expect(await client.listRichMenus()).toHaveLength(1)
    expect(await client.listAliases()).toEqual([{ richMenuAliasId: 'tab-a', richMenuId: id }])

    await client.deleteAlias('tab-a')
    await client.deleteRichMenu(id)
    expect(await client.listRichMenus()).toHaveLength(0)
  })

  it('ตอบ 400 พร้อม details เมื่อ payload ผิด เหมือน LINE จริง', async () => {
    const res = await fetch(`${baseUrl}/v2/bot/richmenu`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
      body: JSON.stringify({ ...payload, chatBarText: '' }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { details: unknown[] }).details.length).toBeGreaterThan(0)
  })

  it('ตอบ 401 เมื่อไม่มี Authorization header', async () => {
    const res = await fetch(`${baseUrl}/v2/bot/info`)
    expect(res.status).toBe(401)
  })

  it('getBotInfo คืนข้อมูล OA จำลอง', async () => {
    const client = new LineClient({ accessToken: 'x', apiBaseUrl: baseUrl })
    expect((await client.getBotInfo()).displayName).toBe('Mock LINE OA')
  })
})

// token แยกจาก describe อื่นในไฟล์นี้โดยตั้งใจ — กันไม่ให้ state ของ links ปนกับ store ที่เทสต์อื่น
// สร้างไว้ก่อนหน้า แม้จะไม่จำเป็นเพราะทุกเทสต์ด้านล่าง set สถานะที่ต้องใช้เองก่อนเช็คอยู่แล้ว
const LINK_TOKEN = 'link-state'

async function postRaw(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${LINK_TOKEN}` },
    body: JSON.stringify(body),
  })
}

// bulk/link, bulk/unlink, batch ตอบ 202 แบบไม่มี body (เหมือนของจริง) — .json() ตรงบนนั้นจะ throw
// เพราะ body ว่าง จึงต้องอ่านเป็น text ก่อนแล้วค่อย parse เฉพาะตอนมีเนื้อจริง
async function post(path: string, body: unknown): Promise<unknown> {
  const text = await (await postRaw(path, body)).text()
  return text.length > 0 ? JSON.parse(text) : undefined
}

async function getRaw(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${LINK_TOKEN}` } })
}

async function get(path: string): Promise<unknown> {
  const text = await (await getRaw(path)).text()
  return text.length > 0 ? JSON.parse(text) : undefined
}

async function del(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { method: 'DELETE', headers: { authorization: `Bearer ${LINK_TOKEN}` } })
}

describe('line-mock เก็บ per-user rich menu link state ให้ e2e อ่านกลับได้จริง', () => {
  it('bulk/link ผูกเมนูให้ทุก uid แล้วอ่านกลับได้ทีละคน', async () => {
    await post('/v2/bot/richmenu/bulk/link', { richMenuId: 'rm-1', userIds: ['U1', 'U2'] })
    expect(await get('/v2/bot/user/U1/richmenu')).toMatchObject({ richMenuId: 'rm-1' })
    expect(await get('/v2/bot/user/U2/richmenu')).toMatchObject({ richMenuId: 'rm-1' })
  })

  it('bulk/link ตอบ 202 และปฏิเสธเกิน 500 ด้วย 400 เหมือนของจริง', async () => {
    expect((await postRaw('/v2/bot/richmenu/bulk/link', { richMenuId: 'rm-1', userIds: ['U1'] })).status).toBe(202)
    const tooMany = Array.from({ length: 501 }, (_, i) => `U${i}`)
    expect((await postRaw('/v2/bot/richmenu/bulk/link', { richMenuId: 'rm-1', userIds: tooMany })).status).toBe(400)
  })

  it('batch unlink ปลดทุกคนที่ถือเมนูนั้น ไม่แตะคนที่ถือเมนูอื่น', async () => {
    await post('/v2/bot/richmenu/bulk/link', { richMenuId: 'rm-1', userIds: ['U1'] })
    await post('/v2/bot/richmenu/bulk/link', { richMenuId: 'rm-2', userIds: ['U2'] })
    await post('/v2/bot/richmenu/batch', { operations: [{ type: 'unlink', from: 'rm-1' }], resumeRequestKey: 'k1' })
    expect((await getRaw('/v2/bot/user/U1/richmenu')).status).toBe(404)
    expect(await get('/v2/bot/user/U2/richmenu')).toMatchObject({ richMenuId: 'rm-2' })
  })

  it('DELETE /v2/bot/user/:id/richmenu ปลดคนเดียว', async () => {
    await post('/v2/bot/richmenu/bulk/link', { richMenuId: 'rm-1', userIds: ['U1', 'U2'] })
    await del('/v2/bot/user/U1/richmenu')
    expect((await getRaw('/v2/bot/user/U1/richmenu')).status).toBe(404)
    expect(await get('/v2/bot/user/U2/richmenu')).toMatchObject({ richMenuId: 'rm-1' })
  })

  it('POST /v2/bot/user/:id/richmenu/:richMenuId (ผูกทีละคน) บันทึก link จริง ไม่ใช่แค่ตอบ 200 เฉย ๆ', async () => {
    const client = new LineClient({ accessToken: LINK_TOKEN, apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })
    await client.linkToUser('U9', 'rm-single')
    expect(await get('/v2/bot/user/U9/richmenu')).toMatchObject({ richMenuId: 'rm-single' })
  })

  it('POST /v2/bot/richmenu/validate/batch ตรวจ operations เหมือน batch จริงแต่ไม่แตะ state', async () => {
    await post('/v2/bot/richmenu/bulk/link', { richMenuId: 'rm-3', userIds: ['U5'] })
    expect((await postRaw('/v2/bot/richmenu/validate/batch', { operations: [{ type: 'unlink', from: 'rm-3' }] })).status).toBe(200)
    // ไม่แตะ state จริง — U5 ต้องยังถือ rm-3 อยู่หลังเรียก validate
    expect(await get('/v2/bot/user/U5/richmenu')).toMatchObject({ richMenuId: 'rm-3' })
    expect((await postRaw('/v2/bot/richmenu/validate/batch', { operations: [{ type: 'unlinkAll' }, { type: 'unlink', from: 'rm-3' }] })).status).toBe(400)
  })

  it('GET /v2/bot/richmenu/progress/batch ตอบ succeeded เสมอ (mock ไม่มีคิว)', async () => {
    const res = await post('/v2/bot/richmenu/batch', { operations: [{ type: 'unlinkAll' }], resumeRequestKey: 'k2' }) as { requestId: string }
    const progress = await get(`/v2/bot/richmenu/progress/batch?requestId=${res.requestId}`) as { phase: string }
    expect(progress.phase).toBe('succeeded')
  })
})
