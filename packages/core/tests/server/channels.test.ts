import { describe, expect, it } from 'vitest'
import { deriveKey } from '../../src/crypto.js'
import { ValidationError } from '../../src/errors.js'
import { createChannelService } from '../../src/server/channels.js'
import { ChannelNotFoundError } from '../../src/server/errors.js'
import type { ListParams, Repo } from '../../src/server/types.js'
import type { ChannelRow } from '../../src/server/types.js'

const key = deriveKey('unit-test-key')
const TOKEN = 'aBcDeFgH1234567890-channel-access-token-WXYZ'

/** repo ในหน่วยความจำที่รองรับเฉพาะ filter แบบเท่ากับ ซึ่งเป็นทั้งหมดที่ service ตัวนี้ใช้ */
function fakeRepo(seed: ChannelRow[] = []): Repo<ChannelRow> & { rows: ChannelRow[] } {
  const rows = [...seed]
  let next = seed.length + 1
  return {
    rows,
    async findMany(params?: ListParams) {
      const filters = params?.filters ?? {}
      return rows.filter((row) => Object.entries(filters).every(
        ([field, want]) => (row as unknown as Record<string, unknown>)[field] === want,
      ))
    },
    async findOne(id) { return rows.find((row) => row.id === id) ?? null },
    async create(data) {
      const row = { id: String(next++), ...data } as ChannelRow
      rows.push(row)
      return row
    },
    async update(id, data) {
      const index = rows.findIndex((row) => row.id === id)
      if (index < 0) throw new Error('missing')
      rows[index] = { ...rows[index]!, ...data }
      return rows[index]!
    },
    async delete(id) {
      const index = rows.findIndex((row) => row.id === id)
      if (index >= 0) rows.splice(index, 1)
    },
  }
}

function deepContains(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value.includes(needle)
  if (Array.isArray(value)) return value.some((v) => deepContains(v, needle))
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((v) => deepContains(v, needle))
  }
  return false
}

const input = { name: 'ร้านทดสอบ', channelId: '1650000000', channelAccessToken: TOKEN, channelSecret: 'shh' }

describe('createChannelService — เส้นทางปกติไม่มีความลับติดมา', () => {
  it('create เก็บลง repo เป็น ciphertext ไม่ใช่ plaintext', async () => {
    const repo = fakeRepo()
    await createChannelService({ repo, key }).create(input)
    expect(deepContains(repo.rows, TOKEN)).toBe(false)
    expect(repo.rows[0]!.channelAccessToken.startsWith('v1.')).toBe(true)
    expect(repo.rows[0]!.accessTokenLast4).toBe('WXYZ')
  })

  it('create คืน record ที่ไม่มีทั้ง plaintext และ ciphertext', async () => {
    const created = await createChannelService({ repo: fakeRepo(), key }).create(input)
    expect(created.accessTokenPreview).toBe('••••••••WXYZ')
    expect(deepContains(created, TOKEN)).toBe(false)
    expect(deepContains(created, 'v1.')).toBe(false)
  })

  it('list คืนทุก channel โดยไม่มีความลับแม้แต่ตัวเดียว', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    await service.create(input)
    await service.create({ ...input, channelId: '1650000001', channelAccessToken: `${TOKEN}2` })
    const rows = await service.list()
    expect(rows).toHaveLength(2)
    expect(deepContains(rows, TOKEN)).toBe(false)
  })

  it('ปฏิเสธ channelId ซ้ำด้วย ValidationError ที่ path ชี้ไปช่องที่ผิด', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    await service.create(input)
    await expect(service.create(input)).rejects.toThrow(ValidationError)
    await service.create(input).catch((error: ValidationError) => {
      expect(error.issues).toEqual([
        { path: 'channelId', code: 'channel_id_taken', message: 'channelId is already registered' },
      ])
    })
  })

  it('ตั้ง isDefault ตัวใหม่แล้วตัวเก่าถูกปลด — มี default ได้ทีละตัว', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    const first = await service.create({ ...input, isDefault: true })
    await service.create({ ...input, channelId: '1650000001', isDefault: true })
    expect((await service.findOne(first.id)).isDefault).toBe(false)
  })

  it('findOne ที่ไม่มีจริงโยน ChannelNotFoundError ไม่ใช่คืน null', async () => {
    await expect(createChannelService({ repo: fakeRepo(), key }).findOne('404'))
      .rejects.toThrow(ChannelNotFoundError)
  })
})

describe('update', () => {
  it('ไม่ส่ง token มาด้วย = ไม่แตะ envelope เดิม', async () => {
    const repo = fakeRepo()
    const service = createChannelService({ repo, key })
    const created = await service.create(input)
    const before = repo.rows[0]!.channelAccessToken

    await service.update(created.id, { name: 'ชื่อใหม่' })

    expect(repo.rows[0]!.channelAccessToken).toBe(before)
    expect(repo.rows[0]!.name).toBe('ชื่อใหม่')
  })

  it('ส่ง token ใหม่มา = ปิดผนึกใหม่และ last4 ตามไปด้วย', async () => {
    const repo = fakeRepo()
    const service = createChannelService({ repo, key })
    const created = await service.create(input)

    const updated = await service.update(created.id, { channelAccessToken: 'brand-new-token-6789' })

    expect(updated.accessTokenPreview).toBe('••••••••6789')
    expect(deepContains(repo.rows, 'brand-new-token-6789')).toBe(false)
  })
})

describe('withSecrets — ทางเดียวที่จะได้ plaintext', () => {
  it('findOne คืน token จริง', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    const created = await service.create(input)
    const opened = await service.withSecrets().findOne(created.id)
    expect(opened.channelAccessToken).toBe(TOKEN)
    expect(opened.channelSecret).toBe('shh')
  })

  it('findDefault เลือกตัวที่ตั้ง isDefault ไว้', async () => {
    const service = createChannelService({ repo: fakeRepo(), key })
    await service.create({ ...input, channelAccessToken: 'other-token-0000' })
    await service.create({ ...input, channelId: '1650000001', isDefault: true })
    expect((await service.withSecrets().findDefault()).channelId).toBe('1650000001')
  })

  it('ไม่มี channel เลย findDefault โยน ChannelNotFoundError', async () => {
    await expect(createChannelService({ repo: fakeRepo(), key }).withSecrets().findDefault())
      .rejects.toThrow(ChannelNotFoundError)
  })
})
