import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AuditRow, ChannelRow, ImageStore, ListParams, Repo, RichMenuRow, ScheduleRow,
} from '@fosivo/line-rich-menu-core'
import { MenuNotReadyError } from '@fosivo/line-rich-menu-core'
import { UID } from './content-types/index.js'
import type { DocumentParams, StrapiV5 } from './strapi.js'

type Entity = Record<string, unknown>

/**
 * `documentId` ของ relation ที่ populate มาแล้ว — คืน `null` เมื่อไม่ได้ populate หรือไม่มีค่า
 *
 * ห้ามใช้ `entity.id` แทน: `id` คือ primary key ของแถว ส่วน `documentId` คือตัวระบุที่ทั้ง
 * Document Service และชั้น service ของเราใช้ ในตารางที่มีแถวเดียวสองค่านี้แยกกันไม่ออกด้วยตา
 * แต่พอมีหลายแถวเมื่อไหร่ การหยิบผิดตัวจะทำให้ทุกคำขอชี้ไปแถวอื่น
 *
 * ไม่มีทางลัดสำหรับค่าที่เป็นสตริงดิบ ๆ โดยตั้งใจ — `documents()` คืน relation เป็นอ็อบเจกต์เสมอ
 * เมื่อถูก populate และไม่คืนคีย์นั้นเลยเมื่อไม่ถูกขอ ไม่มีรูปทรงที่สามที่จะรองรับ การเผื่อไว้
 * เท่ากับเพิ่มกิ่งที่ไม่มีเทสต์ไหนไปถึงได้จริง
 */
const documentIdOf = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const id = (value as { documentId?: unknown }).documentId
  return typeof id === 'string' ? id : null
}

/**
 * id ของไฟล์ใน upload plugin ยังเป็นตัวเลขใน Strapi 5 — media ไม่ใช่ document
 *
 * ตรวจกับของจริงแล้ว ไม่ได้เดา: `upload.findOne(id)` ของ @strapi/upload@5.x ยิง
 * `strapi.db.query('plugin::upload.file').findOne({ where: { id } })` ตรง ๆ และ
 * `traverseEntityRelations` ของ Document Service ข้าม attribute ที่ `type` ไม่ใช่ `'relation'`
 * ไปเลย — media เป็น `type: 'media'` จึงไม่เคยถูกแปลง documentId ให้ ค่าที่ส่งเข้าไปและที่คืน
 * กลับมาจึงเป็นตัวเลขทั้งคู่ เหมือน v4 ทุกประการ
 */
const fileIdOf = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const id = (value as { id?: unknown }).id
  return typeof id === 'number' ? id : null
}

const orNull = <T>(value: unknown): T | null => (value === undefined || value === null ? null : value as T)

/**
 * ตัวช่วยประกาศ repo หนึ่งตัว — คู่ขนานกับ `define` ใน packages/strapi-v4/src/server/repo.ts
 * ต่างกันแค่ว่า id เดินทางใน object พารามิเตอร์แทนที่จะเป็น argument ตัวที่สอง และไม่มี
 * `Number()` ที่ไหนเลย เพราะ `documentId` เป็นสตริงอยู่แล้วทั้งขาเข้าและขาออก (สเปก §6.2)
 */
function define<TRow extends { id: string }>(
  strapi: StrapiV5,
  uid: string,
  shape: {
    toRow(entity: Entity): TRow
    toData(patch: Partial<TRow>): Entity
    mapFilters?(filters: NonNullable<ListParams['filters']>): Record<string, unknown>
    populate?: readonly string[]
  },
): Repo<TRow> {
  const populate = shape.populate === undefined ? {} : { populate: [...shape.populate] }

  const params = (input?: ListParams): DocumentParams => ({
    ...populate,
    ...(input?.filters === undefined
      ? {}
      : { filters: shape.mapFilters === undefined ? input.filters : shape.mapFilters(input.filters) }),
    ...(input?.sort === undefined ? {} : { sort: input.sort }),
    ...(input?.limit === undefined ? {} : { limit: input.limit }),
    ...(input?.start === undefined ? {} : { start: input.start }),
  })

  return {
    async findMany(input) {
      const rows = await strapi.documents(uid).findMany(params(input))
      return (rows as Entity[]).map(shape.toRow)
    },
    async findOne(id) {
      const entity = await strapi.documents(uid).findOne({ documentId: id, ...populate })
      return entity === null || entity === undefined ? null : shape.toRow(entity as Entity)
    },
    // `populate` ต้องไปกับขาเขียนด้วย ไม่ใช่แค่ขาอ่าน — `documents().create/update` คืน document
    // ที่ **ไม่มี relation ติดมา** ถ้าไม่ขอ กติกาเดียวกับ `entityService` ของ v4 เป๊ะ ๆ
    //
    // ที่ v4 มันแพงเพราะไม่ใช่แค่เรื่องหน้าตาของ response: `saveMenu` ตัดสินใจว่าจะ normalize รูป
    // หรือไม่จากค่าที่ `create` คืนมา พอ `imageFileId` เป็น null เสมอ `prepareImage` จึงไม่เคยถูก
    // เรียกเลยสักครั้ง เมนูทุกอันมี `normalizedFileId` เป็น null ตลอดกาลและ publish ส่งรูปไม่ได้
    async create(data) {
      const created = await strapi.documents(uid).create({ ...populate, data: shape.toData(data) })
      return shape.toRow(created as Entity)
    },
    async update(id, data) {
      const updated = await strapi.documents(uid).update({ documentId: id, ...populate, data: shape.toData(data) })
      return shape.toRow(updated as Entity)
    },
    async delete(id) {
      await strapi.documents(uid).delete({ documentId: id })
    },
  }
}

export function createChannelRepo(strapi: StrapiV5): Repo<ChannelRow> {
  return define<ChannelRow>(strapi, UID.channel, {
    toRow: (entity) => ({
      id: entity['documentId'] as string,
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

export function createMenuRepo(strapi: StrapiV5): Repo<RichMenuRow> {
  return define<RichMenuRow>(strapi, UID.menu, {
    populate: ['channel', 'image', 'normalizedImage'],
    mapFilters: (filters) => {
      const { channelId, ...rest } = filters
      // `channelId` ในชั้น service คือ relation ชื่อ `channel` — v5 กรอง relation ด้วย documentId
      // ของปลายทาง ไม่ใช่ด้วยตัวเลขแบบ v4 จุดเดียวในโค้ดเบสที่รู้เรื่องนี้
      return channelId === undefined || channelId === null
        ? rest
        : { ...rest, channel: { documentId: String(channelId) } }
    },
    toRow: (entity) => {
      const width = entity['normalizedWidth']
      const height = entity['normalizedHeight']
      return {
        id: entity['documentId'] as string,
        name: entity['name'] as string,
        channelId: documentIdOf(entity['channel']) ?? '',
        size: entity['size'] as RichMenuRow['size'],
        chatBarText: (entity['chatBarText'] as string | undefined) ?? '',
        chatBarMode: entity['chatBarMode'] as RichMenuRow['chatBarMode'],
        selected: entity['selected'] === true,
        templateKey: orNull<string>(entity['templateKey']),
        areas: (entity['areas'] as RichMenuRow['areas'] | undefined) ?? [],
        imageFileId: fileIdOf(entity['image']),
        areaImages: (entity['areaImages'] as RichMenuRow['areaImages'] | undefined) ?? [],
        normalizedFileId: fileIdOf(entity['normalizedImage']),
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
      // `set` เขียนทับ relation ทั้งชุด ต่างจาก `connect` ที่เพิ่มเข้าไป — เมนูมี channel ได้ตัวเดียว
      // การใช้ connect จะสะสม relation ทุกครั้งที่ save แทนที่จะย้าย
      if (patch.channelId !== undefined) data['channel'] = { set: [patch.channelId] }
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

export function createScheduleRepo(strapi: StrapiV5): Repo<ScheduleRow> {
  return define<ScheduleRow>(strapi, UID.schedule, {
    populate: ['richMenu'],
    mapFilters: (filters) => {
      const { richMenuId, ...rest } = filters
      return richMenuId === undefined || richMenuId === null
        ? rest
        : { ...rest, richMenu: { documentId: String(richMenuId) } }
    },
    toRow: (entity) => ({
      id: entity['documentId'] as string,
      richMenuId: documentIdOf(entity['richMenu']) ?? '',
      runAt: entity['runAt'] as string,
      op: entity['op'] as ScheduleRow['op'],
      state: entity['state'] as ScheduleRow['state'],
      lockedBy: orNull<string>(entity['lockedBy']),
      lockedAt: orNull<string>(entity['lockedAt']),
      lastError: orNull<string>(entity['lastError']),
    }),
    toData: (patch) => {
      const data: Entity = {}
      if (patch.richMenuId !== undefined) data['richMenu'] = { set: [patch.richMenuId] }
      if (patch.runAt !== undefined) data['runAt'] = patch.runAt
      if (patch.op !== undefined) data['op'] = patch.op
      if (patch.state !== undefined) data['state'] = patch.state
      if (patch.lockedBy !== undefined) data['lockedBy'] = patch.lockedBy
      if (patch.lockedAt !== undefined) data['lockedAt'] = patch.lockedAt
      if (patch.lastError !== undefined) data['lastError'] = patch.lastError
      return data
    },
  })
}

/** `null` ต้องอยู่รอดเป็น `null` — `Number(null)` คือ 0 ซึ่งจะกลายเป็น "actor คนที่ id 0" */
const numberOrNull = (value: string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value)

export function createAuditRepo(strapi: StrapiV5): Repo<AuditRow> {
  return define<AuditRow>(strapi, UID.audit, {
    toRow: (entity) => ({
      id: entity['documentId'] as string,
      actorId: entity['actorId'] === null || entity['actorId'] === undefined ? null : String(entity['actorId']),
      action: entity['action'] as AuditRow['action'],
      richMenuId: orNull<string>(entity['richMenuId']),
      channelId: (entity['channelId'] as string | undefined) ?? '',
      before: entity['before'] ?? null,
      after: entity['after'] ?? null,
      result: entity['result'] as AuditRow['result'],
      errorCode: orNull<string>(entity['errorCode']),
    }),
    // ต่างจาก v4 ตรงที่ richMenuId/channelId ไม่ถูกแปลงเป็นตัวเลข — คอลัมน์ของ v5 เป็น string
    // และค่าที่ใส่คือ documentId ส่วน actorId ยังเป็นตัวเลขเพราะ admin user ของ v5 ยังใช้ id ตัวเลข
    toData: (patch) => ({
      actorId: numberOrNull(patch.actorId),
      action: patch.action,
      richMenuId: patch.richMenuId ?? null,
      channelId: patch.channelId,
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
 * ขาอ่านไม่ใช้ `documents('plugin::upload.file')` เพราะไฟล์ไม่ใช่ document ในสายตาของ upload —
 * `upload.findOne(id)` ยิง `db.query(...).findOne({ where: { id } })` ด้วย id ตัวเลขตรง ๆ
 * ส่วน provider แบบ local คืน url สัมพัทธ์ (`/uploads/x.jpg`) จึงอ่านจากดิสก์ ขณะที่ S3/Cloudinary
 * คืน url เต็มจึง fetch — ครอบทั้งสองแบบโดยไม่ต้องรู้ว่า provider ตัวไหนถูกติดตั้ง
 *
 * ขาเขียนต่างจาก v4 ตรงรูปทรงของไฟล์: upload service ของ v5 อ่าน `originalFilename`,
 * `mimetype` และ `filepath` (formidable v3) ไม่ใช่ `name`, `type`, `path` (formidable v1/v2)
 * และรับเป็นอาเรย์เสมอ ส่งของ v4 ไปจะได้ไฟล์ชื่อ `unamed` mime `application/octet-stream`
 * ที่ LINE ปฏิเสธตอน publish โดยไม่มีอะไรใน log ของ Strapi ผิดปกติเลย
 */
export function createImageStore(strapi: StrapiV5): ImageStore {
  const uploadService = () => strapi.plugin('upload').service<{
    upload(args: { data: unknown; files: unknown[] }): Promise<{ id: number }[]>
    findOne(id: number, populate?: unknown): Promise<{ url?: string } | null>
  }>('upload')

  return {
    async read(fileId) {
      // Task 20 item 6 (strapi-v5 M3) — ทั้งสองจุดเคยโยน `Error` เปล่า ๆ ไม่มี `code` ทั้งที่
      // สถานการณ์นี้เกิดขึ้นได้ปกติ (ไฟล์ที่เมนูอ้างถึงถูกลบจาก Media Library ไปแล้ว ไม่ใช่ของแปลก)
      // `toHttpError` (ดูคอมเมนต์ที่นั่น) จับ error ที่ไม่มี code ไม่ได้เลย จึงตอบ 500 `internal_error`
      // ทั้งที่ไม่ใช่เซิร์ฟเวอร์พัง — `read` อยู่บนเส้นทาง**เขียน**ด้วย (ผ่าน `saveMenu` →
      // `prepareImage`) ไม่ใช่แค่ตอน publish ใช้ `MenuNotReadyError('no_image')` ซึ่งมี `code:
      // 'menu_not_ready'` (แม็ปเป็น 409 อยู่แล้วใน STATUS_BY_CODE) — เดินตามแพทเทิร์นเดียวกับที่
      // `areaImages` entry ที่ index เกิน `areas.length` โยนไว้แล้ว (`no_areas`, packages/core/src/
      // server/images.ts:57-58) ไม่ใช่ประดิษฐ์ code ใหม่สำหรับสถานการณ์เดียวกันในเชิงผู้ใช้
      const file = await uploadService().findOne(fileId)
      const url = file?.url
      if (url === undefined) throw new MenuNotReadyError('no_image')

      if (url.startsWith('http://') || url.startsWith('https://')) {
        const response = await fetch(url)
        if (!response.ok) throw new MenuNotReadyError('no_image')
        return Buffer.from(await response.arrayBuffer())
      }
      return readFile(join(strapi.dirs.static.public, url))
    },

    async write({ buffer, mime, filename }) {
      const directory = await mkdtemp(join(tmpdir(), 'line-rich-menu-'))
      const filepath = join(directory, filename)
      try {
        await writeFile(filepath, buffer)
        const uploaded = await uploadService().upload({
          data: { fileInfo: { name: filename, alternativeText: null, caption: null } },
          files: [{ filepath, originalFilename: filename, mimetype: mime, size: buffer.length }],
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
