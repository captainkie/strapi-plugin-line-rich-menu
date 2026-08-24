import { ValidationError } from '../errors.js'
import { ChannelNotFoundError } from './errors.js'
import { openChannelSecrets, sealAccessToken, sealChannelSecrets, sealSecret, toChannelRecord } from './secrets.js'
import type { ChannelRecord, ChannelRow, ChannelWithSecrets, Repo } from './types.js'

export interface ChannelInput {
  name: string
  channelId: string
  channelAccessToken: string
  channelSecret?: string | null
  isDefault?: boolean
  /**
   * Task 9/10 — ไม่มีในสเปกเดิมของ `ChannelInput` เพราะไม่มีผู้เขียนคนไหนต้องการมันจนกว่าจะถึง
   * ปุ่ม activate/deactivate ของ member audience `ChannelRow.memberRichMenuId` (types.ts) required
   * มาตั้งแต่ Task 7/8 แต่ `update()` ไม่เคยรับพารามิเตอร์นี้เข้ามาเขียนเลย — ไม่มีทาง set/clear
   * มันได้จริงนอกจากไปเขียน repo ตรง ๆ ซึ่ง `Services` (ทั้ง v4 และ v5) ไม่ได้ expose repo ดิบไว้
   * ให้ controller เข้าถึง อยู่ที่นี่ (ไม่ใช่ซ้ำสองใน controllers/members.ts ของสอง adapter)
   * เพราะเป็นข้อเท็จจริงเดียวกันของทั้งสอง adapter
   */
  memberRichMenuId?: string | null
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

      // ปิดผนึกแต่ละฟิลด์แยกกัน คนละเงื่อนไข ไม่ผูกกับอีกฟิลด์เลย — ของเดิมส่งทั้งคู่เข้า
      // `sealChannelSecrets` ก้อนเดียว ซึ่งมีสองบั๊ก: (1) `PUT { channelAccessToken }` ส่ง
      // `channelSecret: undefined` เข้าไปด้วย ฟังก์ชันคืน `channelSecret: null` แล้วทับ envelope
      // เดิมทิ้ง — หมุน token ซึ่งเป็นสิ่งที่ผู้ใช้ทำพอดีตอนสงสัยว่า credential รั่ว กลับไปทำลาย secret
      // ที่ไม่ได้แตะเลย (2) `PUT { channelSecret }` อย่างเดียวไม่ส่ง token มา จึง `resealed = {}`
      // ทั้งก้อน — ได้ 200 แต่ไม่มีอะไรเปลี่ยนจริงสักฟิลด์
      //
      // ใช้ `sealAccessToken`/`sealSecret` แยกตัว ไม่ใช่ `sealChannelSecrets` ก้อนเดียว เพราะฟิลด์
      // ที่ไม่ถูกส่งมาต้อง **ไม่ถูกแตะเลย** — จะเอา ciphertext เดิมของ `current` มาผ่าน
      // `sealChannelSecrets` อีกฟิลด์ไม่ได้ เพราะฟังก์ชันนั้น encrypt สิ่งที่รับเข้ามาเสมอ ถ้าป้อน
      // ciphertext เข้าไปจะกลายเป็นเข้ารหัสซ้อนสองชั้นแล้วถอดกลับไม่ได้อีกเลย
      const resealed: Partial<{ channelAccessToken: string; accessTokenLast4: string; channelSecret: string | null }> = {}
      if (input.channelAccessToken !== undefined) {
        Object.assign(resealed, sealAccessToken(input.channelAccessToken, key))
      }
      if (input.channelSecret !== undefined) {
        resealed.channelSecret = sealSecret(input.channelSecret, key)
      }

      await repo.update(id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.channelId === undefined ? {} : { channelId: input.channelId }),
        ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
        ...(input.memberRichMenuId === undefined ? {} : { memberRichMenuId: input.memberRichMenuId }),
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
