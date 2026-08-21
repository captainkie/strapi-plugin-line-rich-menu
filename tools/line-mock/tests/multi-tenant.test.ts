import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LineClient, LineNotFoundError } from '@fosivo/line-rich-menu-core'
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

const clientFor = (accessToken: string) =>
  new LineClient({ accessToken, apiBaseUrl: baseUrl, apiDataBaseUrl: baseUrl })

/**
 * ของปลอมใบนี้ยืนแทน API ที่เป็น multi-tenant — ตอนที่มันตรวจแค่ว่า "มี Bearer header อยู่"
 * แล้วใช้ store ใบเดียวไม่ว่า token จะเป็นอะไร ข้อบกพร่องข้าม channel **ทุกชนิด** มองไม่เห็น
 * จากด่าน acceptance โดยโครงสร้าง: scheduler ที่ยิงเมนูของ OA หนึ่งด้วย token ของอีก OA หนึ่ง
 * จะ "ทำงานได้" อย่างสมบูรณ์แบบในนั้น เพราะทั้งสอง OA ใช้ store ใบเดียวกัน
 *
 * เทสต์ชุดนี้จึงไม่ได้ทดสอบปลั๊กอิน แต่ทดสอบว่าของปลอมเข้มเท่าของจริงพอที่จะจับเรื่องนั้นได้
 */
describe('line-mock แยก store ตาม access token — หนึ่ง token คือหนึ่ง OA', () => {
  it('เมนูของ OA หนึ่งไม่โผล่ในรายการของอีก OA', async () => {
    const a = clientFor('token-a')
    const b = clientFor('token-b')

    const idA = await a.createRichMenu(payload)
    expect(await a.listRichMenus()).toEqual([{ richMenuId: idA }])
    expect(await b.listRichMenus()).toEqual([])

    const idB = await b.createRichMenu(payload)
    // id ต้องไม่ซ้ำข้าม OA ด้วย ไม่งั้นคำขอที่ใช้ id ผิด OA จะ "บังเอิญเจอ" แทนที่จะได้ 404
    expect(idB).not.toBe(idA)
    expect(await a.listRichMenus()).toEqual([{ richMenuId: idA }])
  })

  it('ตั้ง default ด้วย id ของ OA อื่นต้องได้ 404 ไม่ใช่สำเร็จเงียบ ๆ', async () => {
    const a = clientFor('token-default-a')
    const b = clientFor('token-default-b')

    const idA = await a.createRichMenu(payload)
    await expect(b.setDefault(idA)).rejects.toBeInstanceOf(LineNotFoundError)
  })

  it('default ของแต่ละ OA แยกกัน — ตั้งของ A แล้ว B ต้องยังไม่มี default', async () => {
    const a = clientFor('token-sep-a')
    const b = clientFor('token-sep-b')

    const idA = await a.createRichMenu(payload)
    await a.setDefault(idA)

    expect(await a.getDefault()).toBe(idA)
    expect(await b.getDefault()).toBeNull()
  })

  it('alias ของแต่ละ OA แยกกัน — ชื่อเดียวกันชี้คนละเมนูได้', async () => {
    const a = clientFor('token-alias-a')
    const b = clientFor('token-alias-b')

    const idA = await a.createRichMenu(payload)
    const idB = await b.createRichMenu(payload)
    await a.createAlias('tab-a', idA)
    await b.createAlias('tab-a', idB)

    expect(await a.getAlias('tab-a')).toBe(idA)
    expect(await b.getAlias('tab-a')).toBe(idB)
  })

  it('ลบเมนูของ OA อื่นไม่ได้ — ได้ 404 และเมนูนั้นยังอยู่', async () => {
    const a = clientFor('token-del-a')
    const b = clientFor('token-del-b')

    const idA = await a.createRichMenu(payload)
    await expect(b.deleteRichMenu(idA)).rejects.toBeInstanceOf(LineNotFoundError)
    expect(await a.listRichMenus()).toEqual([{ richMenuId: idA }])
  })
})
