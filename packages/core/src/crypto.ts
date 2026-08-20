import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { CryptoEnvelopeError } from './errors.js'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const KEY_BYTES = 32
const HKDF_INFO = 'line-rich-menu:secretbox:v1'

export function deriveKey(secret: string): Buffer {
  const derived = hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.alloc(0),
    Buffer.from(HKDF_INFO, 'utf8'),
    KEY_BYTES,
  )
  return Buffer.from(derived)
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptSecret(envelope: string, key: Buffer): string {
  const parts = envelope.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new CryptoEnvelopeError('รูปแบบ envelope ไม่ถูกต้องหรือเป็นเวอร์ชันที่ไม่รองรับ')
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(parts[1]!, 'base64url'))
    decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3]!, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // ไม่ส่งต่อ error เดิม เพราะอาจมีข้อมูลที่ไม่ควรหลุด
    throw new CryptoEnvelopeError('ถอดรหัสไม่สำเร็จ — ข้อมูลถูกแก้ไขหรือ key ไม่ตรง')
  }
}

export function redactSecret(plaintext: string): string {
  return plaintext.length > 4 ? `••••••••${plaintext.slice(-4)}` : '••••••••'
}
