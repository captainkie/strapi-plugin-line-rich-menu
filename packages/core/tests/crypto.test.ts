import { describe, expect, it } from 'vitest'
import { CryptoEnvelopeError } from '../src/errors.js'
import { decryptSecret, deriveKey, encryptSecret, redactSecret } from '../src/crypto.js'

const key = deriveKey('app-key-หนึ่ง-ที่ยาวพอสมควร')

describe('crypto envelope', () => {
  it('เข้ารหัสแล้วถอดกลับได้ค่าเดิม', () => {
    const token = 'channel-access-token-abcdef123456'
    expect(decryptSecret(encryptSecret(token, key), key)).toBe(token)
  })

  it('ciphertext ไม่มีข้อความต้นฉบับปรากฏอยู่เลย', () => {
    const token = 'super-secret-token'
    expect(encryptSecret(token, key)).not.toContain(token)
  })

  it('IV ต่างกันทุกครั้ง แม้เข้ารหัสข้อความเดียวกัน', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(encryptSecret('same', key).split('.')[1]!)
    expect(seen.size).toBe(200)
  })

  it('ถ้า ciphertext ถูกแก้แม้ไบต์เดียว ต้องถอดไม่ผ่าน (auth tag ทำงาน)', () => {
    const env = encryptSecret('tamper-me', key)
    const parts = env.split('.')
    const ct = Buffer.from(parts[3]!, 'base64url')
    ct[0] = ct[0]! ^ 0x01
    const tampered = [parts[0], parts[1], parts[2], ct.toString('base64url')].join('.')
    expect(() => decryptSecret(tampered, key)).toThrow(CryptoEnvelopeError)
  })

  it('ถ้า auth tag ถูกแก้ ต้องถอดไม่ผ่าน', () => {
    const parts = encryptSecret('tamper-tag', key).split('.')
    const tag = Buffer.from(parts[2]!, 'base64url')
    tag[0] = tag[0]! ^ 0x01
    const tampered = [parts[0], parts[1], tag.toString('base64url'), parts[3]].join('.')
    expect(() => decryptSecret(tampered, key)).toThrow(CryptoEnvelopeError)
  })

  it('ถอดด้วย key ผิดต้องไม่ผ่าน', () => {
    const env = encryptSecret('x', key)
    expect(() => decryptSecret(env, deriveKey('อีก key หนึ่ง'))).toThrow(CryptoEnvelopeError)
  })

  it('ปฏิเสธ envelope ที่รูปแบบผิดหรือ version ไม่รู้จัก', () => {
    expect(() => decryptSecret('ไม่ใช่ envelope', key)).toThrow(CryptoEnvelopeError)
    expect(() => decryptSecret('v9.a.b.c', key)).toThrow(CryptoEnvelopeError)
  })

  it('deriveKey ให้ผลคงที่สำหรับ secret เดิม และยาว 32 ไบต์', () => {
    expect(deriveKey('abc').equals(deriveKey('abc'))).toBe(true)
    expect(deriveKey('abc')).toHaveLength(32)
    expect(deriveKey('abc').equals(deriveKey('abd'))).toBe(false)
  })

  it('redactSecret โชว์แค่ 4 ตัวท้าย', () => {
    expect(redactSecret('abcdefghijkl')).toBe('••••••••ijkl')
    expect(redactSecret('abc')).toBe('••••••••')
  })
})
