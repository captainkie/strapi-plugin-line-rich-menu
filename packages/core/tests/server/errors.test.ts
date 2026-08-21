import { describe, expect, it } from 'vitest'
import { CoreError } from '../../src/errors.js'
import {
  AliasNotPublishedError, ChannelNotFoundError, EncryptionKeyMissingError, MenuNotFoundError,
  MenuNotReadyError, PublishRateLimitedError,
} from '../../src/server/errors.js'

describe('error ของชั้น service (server/errors.ts)', () => {
  it('ทุก error มี code ตามสเปก §11.7 — เช็คทุกคลาส ไม่ใช่แค่บางตัว', () => {
    expect(new PublishRateLimitedError(1000).code).toBe('publish_rate_limited')
    expect(new MenuNotReadyError('no_image').code).toBe('menu_not_ready')
    expect(new AliasNotPublishedError('alias-1').code).toBe('alias_not_published')
    expect(new ChannelNotFoundError('x').code).toBe('channel_not_found')
    expect(new MenuNotFoundError('x').code).toBe('menu_not_found')
    expect(new EncryptionKeyMissingError('x').code).toBe('encryption_key_missing')
  })

  it('เป็นลูกของ CoreError และ Error ทั้งหมด', () => {
    const e = new ChannelNotFoundError('channel not found')
    expect(e).toBeInstanceOf(CoreError)
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('ChannelNotFoundError')
  })

  it('PublishRateLimitedError พก retryAfterMs และ message บอกจำนวน ms จริง', () => {
    const e = new PublishRateLimitedError(2500)
    expect(e.retryAfterMs).toBe(2500)
    expect(e.message).toBe('publish rate limit hit, retry in 2500ms')
  })

  it('MenuNotReadyError พก reason จริงใน message — เช็คทุก reason ที่เป็นไปได้', () => {
    expect(new MenuNotReadyError('no_image').reason).toBe('no_image')
    expect(new MenuNotReadyError('no_image').message).toBe('menu is not ready to publish: no_image')
    expect(new MenuNotReadyError('no_areas').message).toBe('menu is not ready to publish: no_areas')
    expect(new MenuNotReadyError('no_channel').message).toBe('menu is not ready to publish: no_channel')
    expect(new MenuNotReadyError('not_published').message).toBe(
      'menu is not ready to publish: not_published',
    )
  })

  it('AliasNotPublishedError พก aliasId จริงใน message', () => {
    const e = new AliasNotPublishedError('promo-2026')
    expect(e.aliasId).toBe('promo-2026')
    expect(e.message).toBe('alias "promo-2026" is not published yet')
  })

  it('ChannelNotFoundError / MenuNotFoundError / EncryptionKeyMissingError รับ message ตรง ๆ', () => {
    expect(new ChannelNotFoundError('channel "c1" not found').message).toBe('channel "c1" not found')
    expect(new MenuNotFoundError('menu "m1" not found').message).toBe('menu "m1" not found')
    expect(new EncryptionKeyMissingError('no encryption key configured').message).toBe(
      'no encryption key configured',
    )
  })
})
