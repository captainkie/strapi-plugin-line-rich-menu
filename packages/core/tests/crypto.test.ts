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

  it('redactSecret ที่ขอบเขต 4 ตัวพอดี ยังไม่โชว์ตัวท้ายเลย (> ไม่ใช่ >=)', () => {
    expect(redactSecret('abcd')).toBe('••••••••')
    expect(redactSecret('abcde')).toBe('••••••••bcde')
  })

  it('envelope ขึ้นต้นด้วยเวอร์ชัน v1 เสมอ และมีครบ 4 ส่วนคั่นด้วยจุด', () => {
    const env = encryptSecret('versioned', key)
    const parts = env.split('.')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('v1')
  })

  it('IV ที่ผลิตยาว 12 ไบต์เสมอ (base64url 12 ไบต์ = 16 ตัวอักษร ไม่มี padding)', () => {
    const parts = encryptSecret('iv-length-check', key).split('.')
    expect(Buffer.from(parts[1]!, 'base64url')).toHaveLength(12)
  })

  it('ปฏิเสธเพราะจำนวนส่วนผิด แม้ version ส่วนแรกจะถูกต้อง', () => {
    expect(() => decryptSecret('v1.a.b', key)).toThrow(CryptoEnvelopeError)
    expect(() => decryptSecret('v1.a.b.c.d', key)).toThrow(CryptoEnvelopeError)
  })

  it('ปฏิเสธเพราะ version ผิด แม้จำนวนส่วนจะครบ 4', () => {
    const validParts = encryptSecret('right-shape-wrong-version', key).split('.')
    const wrongVersion = ['v2', validParts[1], validParts[2], validParts[3]].join('.')
    expect(() => decryptSecret(wrongVersion, key)).toThrow(CryptoEnvelopeError)
  })

  it('message ของ error บอกสาเหตุที่ต่างกันจริงระหว่างรูปแบบผิดกับถอดรหัสไม่ผ่าน', () => {
    expect(() => decryptSecret('not.an.envelope', key)).toThrowError(
      'รูปแบบ envelope ไม่ถูกต้องหรือเป็นเวอร์ชันที่ไม่รองรับ',
    )
    const parts = encryptSecret('tamper-for-message', key).split('.')
    const ct = Buffer.from(parts[3]!, 'base64url')
    ct[0] = ct[0]! ^ 0x01
    const tampered = [parts[0], parts[1], parts[2], ct.toString('base64url')].join('.')
    expect(() => decryptSecret(tampered, key)).toThrowError(
      'ถอดรหัสไม่สำเร็จ — ข้อมูลถูกแก้ไขหรือ key ไม่ตรง',
    )
  })
})
