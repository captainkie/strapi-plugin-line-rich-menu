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
afterAll(async () => { await app.close() })

const payload = {
  size: { width: 2500, height: 843 },
  selected: false,
  name: 'm',
  chatBarText: 'm',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'message' as const, text: 'hi' } }],
}

describe('line-mock รองรับการอ่านสถานะที่ compensation ต้องใช้', () => {
  it('ยังไม่มี default → getDefault คืน null · ตั้งแล้ว → คืน id นั้น', async () => {
    const client = new LineClient({ accessToken: 'x', apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })
    expect(await client.getDefault()).toBeNull()

    const id = await client.createRichMenu(payload)
    await client.setDefault(id)
    expect(await client.getDefault()).toBe(id)

    await client.clearDefault()
    expect(await client.getDefault()).toBeNull()
  })

  it('ยังไม่มี alias → getAlias คืน null · สร้างแล้ว → คืนปลายทาง', async () => {
    const client = new LineClient({ accessToken: 'x', apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })
    expect(await client.getAlias('tab-x')).toBeNull()

    const id = await client.createRichMenu(payload)
    await client.createAlias('tab-x', id)
    expect(await client.getAlias('tab-x')).toBe(id)
  })
})
