import { describe, expect, it } from 'vitest'
import { CryptoEnvelopeError } from '../../src/errors.js'
import { deriveKey, redactSecret } from '../../src/crypto.js'
import { EncryptionKeyMissingError } from '../../src/server/errors.js'
import {
  lastFourOf, openChannelSecrets, previewOf, resolveEncryptionKey,
  sealChannelSecrets, toChannelRecord,
} from '../../src/server/secrets.js'
import type { ChannelRow } from '../../src/server/types.js'

const TOKEN = 'aBcDeFgH1234567890+/channel-access-token-XYZ9'
// ค่าพวกนี้คือ *ข้อความที่ถูกเข้ารหัส* ในเทสต์ ไม่ใช่ key — รูปร่างของมันไม่มีผลต่อสิ่งที่เทสต์พิสูจน์
// เดิม SECRET เป็นเลขฐานสิบหก 32 ตัว ซึ่ง gitleaks จับว่าเป็นความลับจริงและทำให้ CI แดง
// การเขียนให้ดูปลอมชัดเจนแก้ที่ต้นเหตุ ส่วนการใส่ allowlist จะปิดปากตัวตรวจไว้เฉย ๆ แล้ววันหนึ่ง
// ความลับจริงที่หลุดเข้ามาในไฟล์เทสต์ก็จะผ่านไปด้วย
const SECRET = 'not-a-real-channel-secret-for-tests-only'

function rowFrom(key: Buffer, overrides: Partial<ChannelRow> = {}): ChannelRow {
  const sealed = sealChannelSecrets({ channelAccessToken: TOKEN, channelSecret: SECRET }, key)
  return {
    id: '1', name: 'ร้านทดสอบ', channelId: '1650000000', isDefault: true,
    ...sealed, ...overrides,
  }
}

/** ค้นทุกซอกของ object ว่ามีสตริงต้องห้ามโผล่ไหม — สเปก §13.2 ข้อ 2 */
function deepContains(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle)
  if (Array.isArray(value)) return value.some((v) => deepContains(v, needle))
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((v) => deepContains(v, needle))
  }
  return false
}

describe('resolveEncryptionKey', () => {
  it('ใช้ config.encryptionKey เมื่อมี', () => {
    expect(resolveEncryptionKey({ encryptionKey: 'from-config', appKeys: ['from-app-keys'] }))
      .toEqual(deriveKey('from-config'))
  })

  it('derive จาก APP_KEYS[0] เมื่อไม่ได้ตั้ง encryptionKey', () => {
    expect(resolveEncryptionKey({ encryptionKey: null, appKeys: ['from-app-keys', 'second'] }))
      .toEqual(deriveKey('from-app-keys'))
  })

  it('ถือว่าค่าว่างหรือช่องว่างล้วนคือไม่ได้ตั้ง', () => {
    expect(resolveEncryptionKey({ encryptionKey: '   ', appKeys: ['from-app-keys'] }))
      .toEqual(deriveKey('from-app-keys'))
  })

  it('โยน EncryptionKeyMissingError เมื่อไม่มีทั้งสองทาง', () => {
    expect(() => resolveEncryptionKey({})).toThrow(EncryptionKeyMissingError)
    expect(() => resolveEncryptionKey({ encryptionKey: '', appKeys: [] })).toThrow(EncryptionKeyMissingError)
    expect(() => resolveEncryptionKey({ appKeys: ['  '] })).toThrow(EncryptionKeyMissingError)
  })
})

describe('seal / open', () => {
  const key = deriveKey('unit-test-key')

  it('round trip ได้ค่าเดิมทั้งสองฟิลด์', () => {
    const opened = openChannelSecrets(rowFrom(key), key)
    expect(opened.channelAccessToken).toBe(TOKEN)
    expect(opened.channelSecret).toBe(SECRET)
  })

  it('IV ไม่ซ้ำข้าม record — ปิดผนึกข้อความเดียวกันสองครั้งได้ envelope คนละอัน', () => {
    const a = sealChannelSecrets({ channelAccessToken: TOKEN }, key)
    const b = sealChannelSecrets({ channelAccessToken: TOKEN }, key)
    expect(a.channelAccessToken).not.toBe(b.channelAccessToken)
    expect(openChannelSecrets(rowFrom(key, a), key).channelAccessToken)
      .toBe(openChannelSecrets(rowFrom(key, b), key).channelAccessToken)
  })

  it('แก้ ciphertext ไป 1 ไบต์แล้วถอดไม่ผ่าน — auth tag ทำงาน', () => {
    const row = rowFrom(key)
    const parts = row.channelAccessToken.split('.')
    const flipped = parts[3]!.startsWith('A') ? `B${parts[3]!.slice(1)}` : `A${parts[3]!.slice(1)}`
    const tampered: ChannelRow = { ...row, channelAccessToken: [parts[0], parts[1], parts[2], flipped].join('.') }
    expect(() => openChannelSecrets(tampered, key)).toThrow(CryptoEnvelopeError)
  })

  it('channelSecret ที่ไม่ได้กรอกยังเป็น null ทั้งขาไปและขากลับ', () => {
    const sealed = sealChannelSecrets({ channelAccessToken: TOKEN, channelSecret: '  ' }, key)
    expect(sealed.channelSecret).toBeNull()
    expect(openChannelSecrets(rowFrom(key, sealed), key).channelSecret).toBeNull()
  })
})

describe('preview', () => {
  const key = deriveKey('unit-test-key')

  it('toChannelRecord ไม่มี plaintext และไม่มี ciphertext ติดมาเลย', () => {
    const row = rowFrom(key)
    const record = toChannelRecord(row)
    expect(deepContains(record, TOKEN)).toBe(false)
    expect(deepContains(record, SECRET)).toBe(false)
    expect(deepContains(record, row.channelAccessToken)).toBe(false)
    expect(record.accessTokenPreview).toBe('••••••••XYZ9')
  })

  it('รูปแบบตรงกับ redactSecret ของ core เป๊ะ รวมเคสสั้นและเคสยาว 4 ตัวพอดี', () => {
    for (const value of [TOKEN, 'abcd', 'abc', '', 'abcde']) {
      expect(previewOf(lastFourOf(value))).toBe(redactSecret(value))
    }
  })
})
