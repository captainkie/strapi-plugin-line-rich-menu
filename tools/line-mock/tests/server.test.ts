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
