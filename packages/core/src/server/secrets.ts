import { decryptSecret, deriveKey, encryptSecret } from '../crypto.js'
import { EncryptionKeyMissingError } from './errors.js'
import type { ChannelRecord, ChannelRow, ChannelWithSecrets } from './types.js'

export interface EncryptionKeySource {
  encryptionKey?: string | null
  appKeys?: readonly string[] | null
}

/**
 * สเปก §11.2 — key มาจาก config `encryptionKey` ถ้าไม่ตั้งจะ derive จาก `APP_KEYS[0]`
 *
 * ทั้งสองทางเดินผ่าน `deriveKey` (HKDF-SHA256 info คงที่) เหมือนกัน ไม่ใช่แค่ทางหลัง —
 * ทำให้ `encryptionKey` เป็นสตริงยาวเท่าไหร่ก็ได้โดยไม่ต้องบังคับให้ผู้ใช้หา 32 ไบต์มาเอง
 * และทำให้มีทางเดียวที่ key ถูกสร้าง ไม่ต้องเดาว่า envelope ตัวนี้มาจาก path ไหน
 *
 * โยนทิ้งเมื่อไม่มีทั้งสองทาง แทนที่จะ derive จากค่าว่าง — key ที่คาดเดาได้แปลว่า
 * ใครที่อ่าน DB ได้ก็ถอด token ได้ ซึ่งเท่ากับไม่ได้เข้ารหัสเลย
 */
export function resolveEncryptionKey(source: EncryptionKeySource): Buffer {
  const explicit = source.encryptionKey?.trim()
  if (explicit !== undefined && explicit.length > 0) return deriveKey(explicit)

  const fromAppKeys = source.appKeys?.[0]?.trim()
  if (fromAppKeys !== undefined && fromAppKeys.length > 0) return deriveKey(fromAppKeys)

  throw new EncryptionKeyMissingError(
    'set config.encryptionKey or APP_KEYS[0] before storing LINE credentials',
  )
}

export interface ChannelSecretsInput {
  channelAccessToken: string
  channelSecret?: string | null
}

export interface SealedChannelSecrets {
  channelAccessToken: string
  channelSecret: string | null
  accessTokenLast4: string
}

/**
 * `> 4` ไม่ใช่ `>= 4` โดยตั้งใจ — ต้องตรงกับเงื่อนไขใน `redactSecret` ของ core
 * ไม่งั้น token ยาว 4 ตัวพอดีจะถูกแสดงทั้งตัว ซึ่งกรณีนั้นคือ "สั้นเกินกว่าจะปิดอะไรได้"
 */
export function lastFourOf(plaintext: string): string {
  return plaintext.length > 4 ? plaintext.slice(-4) : ''
}

export function previewOf(last4: string): string {
  return last4.length === 4 ? `••••••••${last4}` : '••••••••'
}

export function sealChannelSecrets(input: ChannelSecretsInput, key: Buffer): SealedChannelSecrets {
  const secret = input.channelSecret?.trim()
  return {
    channelAccessToken: encryptSecret(input.channelAccessToken, key),
    channelSecret: secret !== undefined && secret.length > 0 ? encryptSecret(secret, key) : null,
    accessTokenLast4: lastFourOf(input.channelAccessToken),
  }
}

/**
 * เส้นทางนี้ **ไม่ถอดรหัสอะไรเลย** — preview มาจากคอลัมน์ `accessTokenLast4` ที่เขียนไว้ตอน seal
 * เหตุผล: การกันข้อมูลรั่วแบบ "ถอดมาแล้วอย่าลืม redact" พังทันทีที่มีใครลืม
 * ส่วนแบบนี้พังไม่ได้เพราะ plaintext ไม่เคยถูกสร้างขึ้นบนเส้นทาง list/get ตั้งแต่ต้น
 */
export function toChannelRecord(row: ChannelRow): ChannelRecord {
  return {
    id: row.id,
    name: row.name,
    channelId: row.channelId,
    accessTokenPreview: previewOf(row.accessTokenLast4),
    isDefault: row.isDefault,
  }
}

export function openChannelSecrets(row: ChannelRow, key: Buffer): ChannelWithSecrets {
  return {
    ...toChannelRecord(row),
    channelAccessToken: decryptSecret(row.channelAccessToken, key),
    channelSecret: row.channelSecret === null ? null : decryptSecret(row.channelSecret, key),
  }
}
