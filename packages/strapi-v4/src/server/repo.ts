import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AuditRow, ChannelRow, ImageStore, ListParams, MemberRow, Repo, RichMenuRow, ScheduleRow,
} from '@fosivo/line-rich-menu-core'
import { UID } from './content-types/index.js'
import type { StrapiV4 } from './strapi.js'

type Entity = Record<string, unknown>

const asString = (value: unknown): string => String(value)
const relationId = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const id = (value as { id?: unknown }).id
  return typeof id === 'number' ? id : null
}
const orNull = <T>(value: unknown): T | null => (value === undefined || value === null ? null : value as T)

/**
 * ตัวช่วยประกาศ repo หนึ่งตัว — ทุกตัวใช้ `entityService` เหมือนกัน ต่างกันแค่การแปลงรูปทรง
 * v5 จะเขียนตัวเทียบเท่าด้วย `documents()` โดยที่ชั้น service ไม่รู้เรื่องเลย (สเปก §6.2)
 */
function define<TRow extends { id: string }>(
  strapi: StrapiV4,
  uid: string,
  shape: {
    toRow(entity: Entity): TRow
    toData(patch: Partial<TRow>): Entity
    mapFilters?(filters: NonNullable<ListParams['filters']>): Record<string, unknown>
    populate?: readonly string[]
  },
): Repo<TRow> {
  const populate = shape.populate === undefined ? {} : { populate: [...shape.populate] }

  const params = (input?: ListParams) => {
    // idGreaterThan อยู่นอก `filters` โดยตั้งใจในสเปกของ core (ดูคอมเมนต์ที่ ListParams ใน
    // core/server/types.ts) — ไม่ใช่ equality key อีกตัว แต่ปลายทางจริงของมันคือเงื่อนไข WHERE
    // เดียวกับ filters ทั้งหมด รวมเข้าด้วยกันตรงนี้ก่อนส่งให้ mapFilters เพราะถ้าไม่รวม mapFilters
    // ของ member repo จะไม่มีทางเห็นค่านี้เลย (มันมองเห็นแค่ input.filters) — findMany จะคืน
    // สมาชิกทั้งชุดทุก chunk แล้วงาน link-members จะวนไม่รู้จบ (ดู scheduler.ts / members.ts)
    const rawFilters = input?.filters === undefined && input?.idGreaterThan === undefined
      ? undefined
      : { ...input?.filters, ...(input?.idGreaterThan === undefined ? {} : { idGreaterThan: input.idGreaterThan }) }

    return {
      ...populate,
      ...(rawFilters === undefined
        ? {}
        : { filters: shape.mapFilters === undefined ? rawFilters : shape.mapFilters(rawFilters) }),
      ...(input?.sort === undefined ? {} : { sort: input.sort }),
      ...(input?.limit === undefined ? {} : { limit: input.limit }),
      ...(input?.start === undefined ? {} : { start: input.start }),
    }
  }

  return {
    async findMany(input) {
      const rows = await strapi.entityService.findMany(uid, params(input))
      return (rows as Entity[]).map(shape.toRow)
    },
    async findOne(id) {
      const entity = await strapi.entityService.findOne(uid, Number(id), populate)
      return entity === null || entity === undefined ? null : shape.toRow(entity as Entity)
    },
    // `populate` ต้องส่งไปกับขาเขียนด้วย ไม่ใช่แค่ขาอ่าน — `entityService.create/update` ของ v4
    // คืน entity ที่ **ไม่มี relation ติดมา** ถ้าไม่ขอ ผลคือแถวในฐานข้อมูลถูกต้องทุกอย่าง
    // แต่ object ที่คืนกลับมามี `channel`/`image` เป็น undefined แล้ว `toRow` แปลงเป็น
    // `channelId: "null"` กับ `imageFileId: null`
    //
    // ไม่ใช่แค่เรื่องหน้าตาของ response: `saveMenu` ตัดสินใจว่าจะ normalize รูปหรือไม่จากค่าที่
    // `create` คืนมา พอ `imageFileId` เป็น null เสมอ `prepareImage` จึงไม่เคยถูกเรียกเลย
    // สักครั้ง เมนูทุกอันจึงมี `normalizedFileId` เป็น null ตลอดกาลและ publish ส่งรูปไม่ได้
    async create(data) {
      const created = await strapi.entityService.create(uid, { ...populate, data: shape.toData(data) })
      return shape.toRow(created as Entity)
    },
    async update(id, data) {
      const updated = await strapi.entityService.update(uid, Number(id), { ...populate, data: shape.toData(data) })
      return shape.toRow(updated as Entity)
    },
    async delete(id) {
      await strapi.entityService.delete(uid, Number(id))
    },
  }
}

export function createChannelRepo(strapi: StrapiV4): Repo<ChannelRow> {
  return define<ChannelRow>(strapi, UID.channel, {
    toRow: (entity) => ({
      id: asString(entity['id']),
      name: entity['name'] as string,
      channelId: entity['channelId'] as string,
      channelAccessToken: (entity['channelAccessToken'] as string | undefined) ?? '',
      channelSecret: orNull<string>(entity['channelSecret']),
      accessTokenLast4: (entity['accessTokenLast4'] as string | undefined) ?? '',
      isDefault: entity['isDefault'] === true,
    }),
    toData: (patch) => ({ ...patch }),
  })
}

export function createMenuRepo(strapi: StrapiV4): Repo<RichMenuRow> {
  return define<RichMenuRow>(strapi, UID.menu, {
    populate: ['channel', 'image', 'normalizedImage'],
    mapFilters: (filters) => {
      const { channelId, ...rest } = filters
      // `channelId` ในชั้น service คือ relation ชื่อ `channel` ในฐานข้อมูล — จุดเดียวที่รู้เรื่องนี้
      return channelId === undefined || channelId === null ? rest : { ...rest, channel: Number(channelId) }
    },
    toRow: (entity) => {
      const width = entity['normalizedWidth']
      const height = entity['normalizedHeight']
      return {
        id: asString(entity['id']),
        name: entity['name'] as string,
        channelId: asString(relationId(entity['channel'])),
        size: entity['size'] as RichMenuRow['size'],
        chatBarText: (entity['chatBarText'] as string | undefined) ?? '',
        chatBarMode: entity['chatBarMode'] as RichMenuRow['chatBarMode'],
        selected: entity['selected'] === true,
        templateKey: orNull<string>(entity['templateKey']),
        areas: (entity['areas'] as RichMenuRow['areas'] | undefined) ?? [],
        imageFileId: relationId(entity['image']),
        areaImages: (entity['areaImages'] as RichMenuRow['areaImages'] | undefined) ?? [],
        normalizedFileId: relationId(entity['normalizedImage']),
        normalizedMime: orNull<RichMenuRow['normalizedMime']>(entity['normalizedMime']),
        normalizedSize: typeof width === 'number' && typeof height === 'number' ? { width, height } : null,
        aliasId: orNull<string>(entity['aliasId']),
        status: entity['status'] as RichMenuRow['status'],
        lineRichMenuId: orNull<string>(entity['lineRichMenuId']),
        // `publishedAt` ในชั้น service คือคอลัมน์ `linePublishedAt` — ชื่อเดิมถูก Strapi จองไว้
        publishedAt: orNull<string>(entity['linePublishedAt']),
        lastError: orNull<string>(entity['lastError']),
        // Strapi เขียน updatedAt ให้เอง — `toData` จึงไม่มีทางเขียนกลับ และไม่ควรมี
        updatedAt: (entity['updatedAt'] as string | undefined) ?? '',
      }
    },
    toData: (patch) => {
      const data: Entity = {}
      if (patch.name !== undefined) data['name'] = patch.name
      if (patch.channelId !== undefined) data['channel'] = Number(patch.channelId)
      if (patch.size !== undefined) data['size'] = patch.size
      if (patch.chatBarText !== undefined) data['chatBarText'] = patch.chatBarText
      if (patch.chatBarMode !== undefined) data['chatBarMode'] = patch.chatBarMode
      if (patch.selected !== undefined) data['selected'] = patch.selected
      if (patch.templateKey !== undefined) data['templateKey'] = patch.templateKey
      if (patch.areas !== undefined) data['areas'] = patch.areas
      if (patch.imageFileId !== undefined) data['image'] = patch.imageFileId
      if (patch.areaImages !== undefined) data['areaImages'] = patch.areaImages
      if (patch.normalizedFileId !== undefined) data['normalizedImage'] = patch.normalizedFileId
      if (patch.normalizedMime !== undefined) data['normalizedMime'] = patch.normalizedMime
      if (patch.normalizedSize !== undefined) {
        data['normalizedWidth'] = patch.normalizedSize === null ? null : patch.normalizedSize.width
        data['normalizedHeight'] = patch.normalizedSize === null ? null : patch.normalizedSize.height
      }
      if (patch.aliasId !== undefined) data['aliasId'] = patch.aliasId
      if (patch.status !== undefined) data['status'] = patch.status
      if (patch.lineRichMenuId !== undefined) data['lineRichMenuId'] = patch.lineRichMenuId
      if (patch.publishedAt !== undefined) data['linePublishedAt'] = patch.publishedAt
      if (patch.lastError !== undefined) data['lastError'] = patch.lastError
      return data
    },
  })
}

export function createScheduleRepo(strapi: StrapiV4): Repo<ScheduleRow> {
  return define<ScheduleRow>(strapi, UID.schedule, {
    populate: ['richMenu'],
    mapFilters: (filters) => {
      const { richMenuId, ...rest } = filters
      return richMenuId === undefined || richMenuId === null ? rest : { ...rest, richMenu: Number(richMenuId) }
    },
    toRow: (entity) => ({
      id: asString(entity['id']),
      richMenuId: asString(relationId(entity['richMenu'])),
      runAt: entity['runAt'] as string,
      op: entity['op'] as ScheduleRow['op'],
      state: entity['state'] as ScheduleRow['state'],
      lockedBy: orNull<string>(entity['lockedBy']),
      lockedAt: orNull<string>(entity['lockedAt']),
      lastError: orNull<string>(entity['lastError']),
      // id ของสมาชิกคนสุดท้ายที่ทำไปแล้วของงาน link-members (keyset ไม่ใช่ offset) — งานชนิดอื่น
      // ไม่แตะคอลัมน์นี้เลยจึงเป็น null เสมอสำหรับพวกมัน (ดู cursor ใน core/server/types.ts)
      cursor: orNull<string>(entity['cursor']),
    }),
    toData: (patch) => {
      const data: Entity = {}
      if (patch.richMenuId !== undefined) data['richMenu'] = Number(patch.richMenuId)
      if (patch.runAt !== undefined) data['runAt'] = patch.runAt
      if (patch.op !== undefined) data['op'] = patch.op
      if (patch.state !== undefined) data['state'] = patch.state
      if (patch.lockedBy !== undefined) data['lockedBy'] = patch.lockedBy
      if (patch.lockedAt !== undefined) data['lockedAt'] = patch.lockedAt
      if (patch.lastError !== undefined) data['lastError'] = patch.lastError
      if (patch.cursor !== undefined) data['cursor'] = patch.cursor
      return data
    },
  })
}

export function createMemberRepo(strapi: StrapiV4): Repo<MemberRow> {
  return define<MemberRow>(strapi, UID.member, {
    populate: ['channel'],
    mapFilters: (filters) => {
      // `idGreaterThan`/`channelId` แปลไปคนละทาง แม้จะยิงผ่าน mapFilters ตัวเดียวกัน: channelId
      // เป็น relation (แพทเทิร์นเดียวกับ menu/schedule repo ด้านบน) ส่วน idGreaterThan เป็น
      // เงื่อนไขบน `id` ตัวเลข primary key ของแถวเอง ไม่ใช่ relation — ต้อง $gt ไม่ใช่ equality
      // ถึงจะเป็น "id มากกว่า" จริง และต้องแปลงเป็นตัวเลขก่อนเทียบกับคอลัมน์ตัวเลข
      const { channelId, idGreaterThan, ...rest } = filters
      const out: Record<string, unknown> = { ...rest }
      if (channelId !== undefined && channelId !== null) out['channel'] = Number(channelId)
      if (idGreaterThan !== undefined && idGreaterThan !== null) out['id'] = { $gt: Number(idGreaterThan) }
      return out
    },
    // ไม่มี mapSort: `id:asc` ที่ core ส่งมาคือคอลัมน์ตัวเลขเดียวกับที่ idGreaterThan กรองอยู่แล้ว
    // (ต่างจาก v5 ที่ id ของชั้น service คือ documentId แต่ default sort ของ Strapi คือ id ตัวเลข
    // คนละคอลัมน์ — v4 ไม่มีช่องว่างแบบนั้นเพราะมี id คอลัมน์เดียว ไม่ต้องแปลอะไร)
    toRow: (entity) => ({
      id: asString(entity['id']),
      channelId: asString(relationId(entity['channel'])),
      lineUserId: (entity['lineUserId'] as string | undefined) ?? '',
      displayName: orNull<string>(entity['displayName']),
      linkedRichMenuId: orNull<string>(entity['linkedRichMenuId']),
      linkedAt: orNull<string>(entity['linkedAt']),
    }),
    toData: (patch) => {
      const data: Entity = {}
      if (patch.channelId !== undefined) data['channel'] = Number(patch.channelId)
      if (patch.lineUserId !== undefined) data['lineUserId'] = patch.lineUserId
      if (patch.displayName !== undefined) data['displayName'] = patch.displayName
      if (patch.linkedRichMenuId !== undefined) data['linkedRichMenuId'] = patch.linkedRichMenuId
      if (patch.linkedAt !== undefined) data['linkedAt'] = patch.linkedAt
      return data
    },
  })
}

/** `null` ต้องอยู่รอดเป็น `null` — `Number(null)` คือ 0 ซึ่งจะกลายเป็น "actor คนที่ id 0" */
const numberOrNull = (value: string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value)

export function createAuditRepo(strapi: StrapiV4): Repo<AuditRow> {
  return define<AuditRow>(strapi, UID.audit, {
    toRow: (entity) => ({
      id: asString(entity['id']),
      actorId: entity['actorId'] === null || entity['actorId'] === undefined ? null : asString(entity['actorId']),
      action: entity['action'] as AuditRow['action'],
      richMenuId: entity['richMenuId'] === null || entity['richMenuId'] === undefined ? null : asString(entity['richMenuId']),
      channelId: asString(entity['channelId']),
      before: entity['before'] ?? null,
      after: entity['after'] ?? null,
      result: entity['result'] as AuditRow['result'],
      errorCode: orNull<string>(entity['errorCode']),
    }),
    toData: (patch) => ({
      actorId: numberOrNull(patch.actorId),
      action: patch.action,
      richMenuId: numberOrNull(patch.richMenuId),
      channelId: numberOrNull(patch.channelId),
      before: patch.before ?? null,
      after: patch.after ?? null,
      result: patch.result,
      errorCode: patch.errorCode ?? null,
    }),
  })
}

/**
 * อ่าน/เขียนไฟล์ผ่าน upload plugin ของ Strapi (สเปก §7.3 — ปลั๊กอินไม่เก็บไฟล์เอง)
 *
 * ขาอ่าน: provider แบบ local คืน url สัมพัทธ์ (`/uploads/x.jpg`) จึงอ่านจากดิสก์ ส่วน S3/Cloudinary
 * คืน url เต็มจึง fetch — ครอบทั้งสองแบบโดยไม่ต้องรู้ว่า provider ตัวไหนถูกติดตั้ง
 *
 * ขาเขียน: upload service ของ v4 รับไฟล์แบบ formidable ซึ่งต้องมี `path` บนดิสก์จริง
 * จึงเขียนลง temp ก่อนแล้วลบทิ้งเสมอใน finally
 */
export function createImageStore(strapi: StrapiV4): ImageStore {
  const uploadService = () => strapi.plugin('upload').service<{
    upload(args: { data: unknown; files: unknown }): Promise<{ id: number }[]>
  }>('upload')

  return {
    async read(fileId) {
      const file = await strapi.entityService.findOne('plugin::upload.file', fileId) as { url?: string } | null
      const url = file?.url
      if (url === undefined) throw new Error(`upload file ${fileId} has no url`)

      if (url.startsWith('http://') || url.startsWith('https://')) {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`failed to read upload file ${fileId}: ${response.status}`)
        return Buffer.from(await response.arrayBuffer())
      }
      return readFile(join(strapi.dirs.static.public, url))
    },

    // ไฟล์ที่ถูกลบไปจาก Media Library แล้วคืน `null` ไม่โยน — หน้ารายการที่มีเมนูสิบอันต้องไม่ล้ม
    // ทั้งหน้าเพราะรูปของเมนูเดียวหายไป ต่างจาก `read()` ข้างบนที่อยู่บนเส้นทาง publish
    async url(fileId) {
      const file = await strapi.entityService.findOne('plugin::upload.file', fileId) as { url?: string } | null
      return file?.url ?? null
    },

    async write({ buffer, mime, filename }) {
      const directory = await mkdtemp(join(tmpdir(), 'line-rich-menu-'))
      const path = join(directory, filename)
      try {
        await writeFile(path, buffer)
        const uploaded = await uploadService().upload({
          data: { fileInfo: { name: filename, alternativeText: null, caption: null } },
          files: { path, name: filename, type: mime, size: buffer.length },
        })
        const first = uploaded[0]
        if (first === undefined) throw new Error('upload returned no file')
        return { id: first.id }
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  }
}
