import { describe, expect, it, vi } from 'vitest'
import { REDACTED, createScrubbedLogger, scrub } from '../../src/server/scrub.js'

const TOKEN = 'aBcDeFgH1234567890-channel-access-token'

describe('scrub', () => {
  it('แทนค่าใต้คีย์ที่ชื่อเข้าข่าย ไม่ว่าตัวพิมพ์ใหญ่เล็กหรือลึกแค่ไหน', () => {
    const input = {
      name: 'ร้านทดสอบ',
      channelAccessToken: TOKEN,
      nested: { CHANNEL_SECRET: 's3cr3t', headers: { Authorization: `Bearer ${TOKEN}` } },
      list: [{ token: TOKEN }, { safe: 'ok' }],
    }
    expect(scrub(input)).toEqual({
      name: 'ร้านทดสอบ',
      channelAccessToken: REDACTED,
      nested: { CHANNEL_SECRET: REDACTED, headers: { Authorization: REDACTED } },
      list: [{ token: REDACTED }, { safe: 'ok' }],
    })
  })

  it('ไม่แตะค่าที่ไม่เข้าข่าย รวมตัวเลข boolean และ null', () => {
    expect(scrub({ id: 7, isDefault: true, lastError: null, size: 'large' }))
      .toEqual({ id: 7, isDefault: true, lastError: null, size: 'large' })
  })

  it('ตัด Bearer ที่ฝังอยู่ในสตริงออก แม้คีย์จะไม่เข้าข่าย', () => {
    expect(scrub({ message: `request failed: Bearer ${TOKEN} rejected` }))
      .toEqual({ message: `request failed: Bearer ${REDACTED} rejected` })
    expect(scrub(`Bearer ${TOKEN}`)).toBe(`Bearer ${REDACTED}`)
  })

  it('ไม่วนไม่รู้จบเมื่อเจอ object ที่อ้างถึงตัวเอง', () => {
    const cyclic: Record<string, unknown> = { name: 'a' }
    cyclic['self'] = cyclic
    expect(scrub(cyclic)).toEqual({ name: 'a', self: '[circular]' })
  })

  it('ตัดที่ความลึก 8 แทนที่จะไล่ลงไปไม่จบ', () => {
    let deep: Record<string, unknown> = { bottom: 'reached' }
    for (let i = 0; i < 12; i++) deep = { down: deep }
    expect(JSON.stringify(scrub(deep))).toContain(REDACTED)
    expect(JSON.stringify(scrub(deep))).not.toContain('reached')
  })

  it('แปลง Error เป็น object ที่มี name message code — ไม่ใช่ {} ว่างเปล่า', () => {
    class Typed extends Error { readonly code = 'line_auth_failed' }
    expect(scrub(new Typed('LINE rejected credential')))
      .toEqual({ name: 'Typed', message: 'LINE rejected credential', code: 'line_auth_failed' })
  })

  it('Error ธรรมดาที่ไม่มี code ไม่ถูกใส่ฟิลด์ code มาลอย ๆ', () => {
    expect(scrub(new Error('plain failure')))
      .toEqual({ name: 'Error', message: 'plain failure' })
  })
})

describe('createScrubbedLogger', () => {
  it('กรองทุกระดับ ไม่ใช่แค่ error', () => {
    const base = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const logger = createScrubbedLogger(base)

    logger.debug('publishing', { channelAccessToken: TOKEN })
    logger.info('publishing', { channelAccessToken: TOKEN })
    logger.warn('publishing', { channelAccessToken: TOKEN })
    logger.error('publishing', { channelAccessToken: TOKEN })

    const everything = JSON.stringify([
      base.debug.mock.calls, base.info.mock.calls, base.warn.mock.calls, base.error.mock.calls,
    ])
    expect(everything).not.toContain(TOKEN)
    expect(base.error).toHaveBeenCalledWith('publishing', { channelAccessToken: REDACTED })
  })
})
