import { ValidationError } from '../errors.js'
import { ChannelNotFoundError } from './errors.js'
import { openChannelSecrets, sealChannelSecrets, toChannelRecord } from './secrets.js'
import type { ChannelRecord, ChannelRow, ChannelWithSecrets, Repo } from './types.js'

export interface ChannelInput {
  name: string
  channelId: string
  channelAccessToken: string
  channelSecret?: string | null
  isDefault?: boolean
}

export interface SecretChannelReader {
  findOne(id: string): Promise<ChannelWithSecrets>
  findDefault(): Promise<ChannelWithSecrets>
}

export interface ChannelService {
  list(): Promise<ChannelRecord[]>
  findOne(id: string): Promise<ChannelRecord>
  create(input: ChannelInput): Promise<ChannelRecord>
  update(id: string, input: Partial<ChannelInput>): Promise<ChannelRecord>
  /** ทางเดียวที่จะได้ plaintext — ชื่อยาวและต้องเรียกเองโดยตั้งใจ ตามสเปก §11.2 */
  withSecrets(): SecretChannelReader
}

export function createChannelService(deps: { repo: Repo<ChannelRow>; key: Buffer }): ChannelService {
  const { repo, key } = deps

  async function rowOrThrow(id: string): Promise<ChannelRow> {
    const row = await repo.findOne(id)
    if (row === null) throw new ChannelNotFoundError(`channel ${id} does not exist`)
    return row
  }

  /** LINE OA หนึ่งตัวคือ channel หนึ่งตัว การมี default สองตัวไม่มีความหมายที่ตีความได้ */
  async function clearOtherDefaults(exceptId: string): Promise<void> {
    const others = await repo.findMany({ filters: { isDefault: true } })
    await Promise.all(
      others.filter((row) => row.id !== exceptId).map((row) => repo.update(row.id, { isDefault: false })),
    )
  }

  async function assertChannelIdFree(channelId: string, exceptId?: string): Promise<void> {
    const taken = await repo.findMany({ filters: { channelId } })
    if (taken.some((row) => row.id !== exceptId)) {
      // ใช้ ValidationError ของ core ไม่ใช่ error ชนิดใหม่ เพราะ `issues[].path` คือสิ่งที่
      // ฟอร์มฝั่ง UI (Plan 02) เอาไปชี้ error ลงช่องที่ผิดอยู่แล้ว — ชนิดใหม่จะไปโผล่บนหัวฟอร์มแทน
      throw new ValidationError('channelId is already registered', [
        { path: 'channelId', code: 'channel_id_taken', message: 'channelId is already registered' },
      ])
    }
  }

  return {
    async list() {
      return (await repo.findMany({ sort: 'name' })).map(toChannelRecord)
    },

    async findOne(id) {
      return toChannelRecord(await rowOrThrow(id))
    },

    async create(input) {
      await assertChannelIdFree(input.channelId)
      const created = await repo.create({
        name: input.name,
        channelId: input.channelId,
        isDefault: input.isDefault === true,
        ...sealChannelSecrets(input, key),
      })
      if (input.isDefault === true) await clearOtherDefaults(created.id)
      return toChannelRecord(await rowOrThrow(created.id))
    },

    async update(id, input) {
      const current = await rowOrThrow(id)
      if (input.channelId !== undefined) await assertChannelIdFree(input.channelId, id)

      // ไม่ส่ง token มา = ไม่ได้ตั้งใจเปลี่ยน token ไม่ใช่ตั้งใจล้างทิ้ง
      // ถ้าปิดผนึก undefined ทับ envelope เดิม channel ที่ใช้งานอยู่จะพังทันทีที่ผู้ใช้แก้แค่ชื่อ
      const resealed = input.channelAccessToken === undefined
        ? {}
        : sealChannelSecrets(
            { channelAccessToken: input.channelAccessToken, channelSecret: input.channelSecret },
            key,
          )

      await repo.update(id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.channelId === undefined ? {} : { channelId: input.channelId }),
        ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
        ...resealed,
      })
      if (input.isDefault === true) await clearOtherDefaults(id)
      return toChannelRecord(await rowOrThrow(current.id))
    },

    withSecrets() {
      return {
        async findOne(id) {
          return openChannelSecrets(await rowOrThrow(id), key)
        },
        async findDefault() {
          const marked = await repo.findMany({ filters: { isDefault: true } })
          const chosen = marked[0] ?? (await repo.findMany({ limit: 1 }))[0]
          if (chosen === undefined) throw new ChannelNotFoundError('no LINE channel is configured')
          return openChannelSecrets(chosen, key)
        },
      }
    },
  }
}
