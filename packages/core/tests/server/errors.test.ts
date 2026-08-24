import { describe, expect, it } from 'vitest'
import { CoreError } from '../../src/errors.js'
import {
  AliasNotPublishedError, ChannelNotFoundError, EncryptionKeyMissingError,
  MenuActiveForMembersError, MenuChannelLockedError, MenuDefaultUnknownError,
  MenuDisplayPeriodNotAllowedError, MenuIsAccountDefaultError, MenuNotAllAudienceError,
  MenuNotFoundError, MenuNotMembersAudienceError, MenuNotReadyError,
  PublishRateLimitedError,
} from '../../src/server/errors.js'

describe('error ของชั้น service (server/errors.ts)', () => {
  it('ทุก error มี code ตามสเปก §11.7 — เช็คทุกคลาส ไม่ใช่แค่บางตัว', () => {
    expect(new PublishRateLimitedError(1000).code).toBe('publish_rate_limited')
    expect(new MenuNotReadyError('no_image').code).toBe('menu_not_ready')
    expect(new AliasNotPublishedError('alias-1').code).toBe('alias_not_published')
    expect(new ChannelNotFoundError('x').code).toBe('channel_not_found')
    expect(new MenuNotFoundError('x').code).toBe('menu_not_found')
    expect(new EncryptionKeyMissingError('x').code).toBe('encryption_key_missing')
    expect(new MenuNotMembersAudienceError('m1').code).toBe('menu_not_members_audience')
    expect(new MenuActiveForMembersError('m1', 'audience').code).toBe('menu_active_for_members')
    expect(new MenuNotAllAudienceError('m1').code).toBe('menu_not_all_audience')
    expect(new MenuChannelLockedError('m1').code).toBe('menu_channel_locked')
    expect(new MenuDisplayPeriodNotAllowedError().code).toBe('menu_display_period_not_allowed')
    expect(new MenuIsAccountDefaultError('m1').code).toBe('menu_is_account_default')
    expect(new MenuDefaultUnknownError('m1', new Error('x')).code).toBe('menu_default_unknown')
  })

  /**
   * Task 22 / review H-1 — สอง error นี้ต้องแยก code กันจริง ไม่ใช่แค่ตั้งชื่อคลาสต่างกัน: ทางแก้ที่
   * ข้อความบอกคนละอย่างกันคนละเรื่อง (ล้าง default ของบัญชี vs แก้การเชื่อมต่อ LINE แล้วลองใหม่)
   * ถ้ารวมเป็น code เดียว UI จะบอกวิธีแก้ผิดครึ่งหนึ่งของเวลาทั้งหมด
   */
  it('error ใหม่ของ Task 22 บอกทางแก้คนละทาง และไม่ใช่ code เดียวกัน', () => {
    const isDefault = new MenuIsAccountDefaultError('m-1')
    const unknown = new MenuDefaultUnknownError('m-1', new Error('boom'))

    expect(isDefault.code).not.toBe(unknown.code)
    expect(isDefault.message).toContain('clear the account default first')
    expect(isDefault.message).toContain('DELETE /menus/:id/default')
    expect(unknown.message).toContain("fix the channel's LINE connection and try again")
    // ต้นเหตุจริงถูกเก็บไว้ให้ log เห็น ไม่ได้ถูกทิ้งตอนห่อ
    expect((unknown.reason as Error).message).toBe('boom')
  })

  /**
   * Task 17 — `MenuActiveForMembersError` ตัวเดียว code เดียว ใช้กับสามปฏิบัติการที่ถูกปฏิเสธด้วย
   * ข้อเท็จจริงเดียวกันและแก้ด้วยวิธีเดียวกัน ต่างกันแค่ท่อนท้ายที่บอกว่ากำลังปฏิเสธอะไร — ถ้าท่อนนั้น
   * ไม่ต่างกันจริง การรวม code ก็คือการทิ้งข้อมูลที่ operator ต้องใช้ไป ไม่ใช่การจัดระเบียบ
   */
  it('MenuActiveForMembersError บอกวิธีแก้เดียวกันทั้งสามปฏิบัติการ แต่บอกด้วยว่ากำลังปฏิเสธอะไร', () => {
    const remedy = "rich menu m-1 is currently the channel's member menu; turn the members toggle off before "
    expect(new MenuActiveForMembersError('m-1', 'audience').message)
      .toBe(`${remedy}changing its audience away from 'members'`)
    expect(new MenuActiveForMembersError('m-1', 'publish').message).toBe(`${remedy}publishing it again`)
    expect(new MenuActiveForMembersError('m-1', 'delete').message).toBe(`${remedy}deleting it`)
  })

  // ข้อความของ error พวกนี้เป็นที่เดียวในโค้ดที่บันทึกว่า "แล้วต้องทำยังไงต่อ" ไว้ตรงจุดที่ปฏิเสธจริง
  // (ผู้เรียกเห็นแต่ `code` ทาง HTTP) — เช็คว่ามันบอกทางออกจริง ไม่ใช่แค่บอกว่าถูกปฏิเสธ
  it('error ใหม่ของ Task 17 บอกทางแก้ ไม่ใช่แค่บอกว่าถูกปฏิเสธ', () => {
    expect(new MenuNotAllAudienceError('m-2').message).toBe(
      "rich menu m-2 is not audience:'all'; making it the account default would show it to "
      + "every follower — change its audience to 'all' first",
    )
    expect(new MenuNotAllAudienceError('m-2').menuId).toBe('m-2')
    expect(new MenuChannelLockedError('m-3').message).toBe(
      "rich menu m-3 already exists on its channel's LINE account; it cannot be moved to another channel",
    )
    expect(new MenuChannelLockedError('m-3').menuId).toBe('m-3')
    expect(new MenuDisplayPeriodNotAllowedError().message).toBe(
      'a display period makes the menu the account default for everyone at its start time, so a menu '
      + "with audience:'members' cannot have one — clear the display period or change the audience to 'all'",
    )
  })

  // Task 14b item 3 — ข้อความต้องบอก **วิธีแก้** (ปิดสวิตช์สมาชิกก่อน) ไม่ใช่แค่บอกว่าถูกปฏิเสธ
  // ผู้เรียกเห็นแต่ `code` ทาง HTTP (`toHttpError` ไม่ส่ง message ต่อ) ข้อความนี้จึงเป็นของนักพัฒนา
  // และของ log — แต่มันคือที่เดียวในโค้ดที่บันทึกว่า "แล้วต้องทำยังไง" ไว้ตรงจุดที่ปฏิเสธจริง
  it('MenuActiveForMembersError พก menuId และบอกให้ปิดสวิตช์สมาชิกก่อน', () => {
    const e = new MenuActiveForMembersError('m-77', 'audience')
    expect(e.menuId).toBe('m-77')
    expect(e.message).toBe(
      "rich menu m-77 is currently the channel's member menu; "
      + "turn the members toggle off before changing its audience away from 'members'",
    )
  })

  it('MenuNotMembersAudienceError พก menuId จริงใน message', () => {
    const e = new MenuNotMembersAudienceError('m-99')
    expect(e.menuId).toBe('m-99')
    expect(e.message).toBe("rich menu m-99 is not audience:'members', cannot be activated for members")
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
