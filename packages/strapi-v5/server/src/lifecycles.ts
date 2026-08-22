// @strapi/utils ไม่ export ValidationError เป็นชื่อตรง ๆ ที่ root — มีแต่ namespace `errors`
// (`export * as errors from './errors'` — ตรวจกับ dist/index.d.ts ของจริงที่ติดตั้งอยู่ ไม่ใช่เดา)
import { errors as strapiErrors } from '@strapi/utils'
import {
  errorCodeOf, isLineUserId, type MemberRow, type Repo,
} from '@fosivo/line-rich-menu-core'
import { getServices, type Services } from './container.js'
import { UID } from './content-types/index.js'
import type { LifecycleEvent, StrapiV5 } from './strapi.js'

/**
 * primary key ตัวเลขที่ค่าหนึ่งใน event ของ `db.lifecycles` ชี้ถึง
 *
 * `db.lifecycles` อยู่**ใต้** document service เสมอ: `transformData` แปลง documentId ของ relation
 * เป็น entity id ให้ก่อนที่ `data` จะลงมาถึงชั้นนี้ และ `entries.update`/`entries.delete` ยิงด้วย
 * `where: { id }` ที่เป็น primary key ทั้งคู่ (ตรวจกับ `@strapi/core` ตัวจริงที่ติดตั้งอยู่ใน
 * examples/v5-app/node_modules ไม่ใช่เดาจากเอกสาร) — "สตริง documentId" จึงไม่ใช่รูปที่เป็นไปได้
 * ที่นี่ ส่วนสิ่งที่ห่อตัวเลขไว้ยังไม่แน่นอน (เลขดิบ, `{id}`, `{connect:[...]}`, `{set:[...]}`)
 * จึงยังต้องเผื่อ
 *
 * ค่าที่ไม่ใช่จำนวนเต็มคืน null แทนที่จะเดาต่อ — ผู้เรียกทุกรายแปล null เป็น "แปลไม่ได้"
 * แล้วเดินเส้นทาง fail closed ไม่ใช่ข้ามเงื่อนไขไปเงียบ ๆ
 */
function primaryKeyOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value === 'string') return /^\d+$/.test(value) ? Number(value) : null
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj['id'] !== undefined) return primaryKeyOf(obj['id'])
    const list = obj['connect'] ?? obj['set']
    if (Array.isArray(list) && list.length > 0) return primaryKeyOf(list[0])
  }
  return null
}

/**
 * แปล primary key ตัวเลขของชั้น db เป็น `documentId` ที่ชั้น service ของเราใช้เป็น id ทุกที่
 *
 * นี่คือรากของทั้งสอง finding ใน Task 13 รอบแรก: `Repo.findOne` วิ่งผ่าน `documents().findOne`
 * ซึ่งรับแต่ documentId ยิงเลข primary key เข้าไปได้ null ทุกครั้งโดยไม่มี error อะไรให้เห็น —
 * beforeUpdate จึงหาแถวตัวเองไม่เจอ (แล้วกฎ fail closed ปฏิเสธการแก้ไขธรรมดา) และ afterDelete
 * ก็ไม่มีทางรู้ channel ของแถวที่เพิ่งหายไป `db.query()` เป็นชั้นเดียวที่ยังค้นด้วย primary key ได้
 */
async function documentIdByPk(strapi: StrapiV5, uid: string, value: unknown): Promise<string | null> {
  const pk = primaryKeyOf(value)
  if (pk === null) return null
  const row = await strapi.db.query(uid).findOne({ where: { id: pk } })
  const documentId = (row as { documentId?: unknown } | null)?.documentId
  return typeof documentId === 'string' ? documentId : null
}

/**
 * ตรวจก่อนเขียนเสมอ — ตรงข้ามกับ `linkNewMember`/`unlinkDeletedMember` ที่ต้องกลืน error ของ LINE
 * ไว้ ที่นี่คือ input ผิดจากผู้ใช้เอง ต้องบอกก่อนที่จะเขียนอะไรลง DB เลย ไม่ใช่เขียนแล้วค่อยแก้
 *
 * `ids` มาถึงที่นี่ในภาษาของชั้น service แล้ว (documentId ล้วน ๆ) ไม่ใช่ภาษาของ event — การแปล
 * เป็นหน้าที่ของผู้เรียกที่รู้ว่าตัวเองอยู่ adapter ไหน (`documentIdByPk` ข้างบน / `idOf` ของ v4)
 * ฟังก์ชันนี้จึงเทียบ `row.id !== exceptId` กับ `filters.channelId` ได้ตรง ๆ โดยไม่ต้องรู้เลยว่า
 * Strapi เวอร์ชันไหนเรียก id ว่าอะไร
 *
 * `exceptId: null` หมายถึง "ยังไม่รู้ว่าแถวไหนคือแถวตัวเอง" (สถานการณ์ของ `beforeCreate` ที่ยังไม่
 * มีแถวอยู่จริง) ไม่ใช่ "ไม่มีแถวไหนถูกยกเว้น" — ทั้งสองแบบมีผลเหมือนกันทางคณิตศาสตร์
 * (`row.id !== null` เป็นจริงเสมอ) แต่ตั้งชื่อพารามิเตอร์ตามความหมายไว้ให้อ่านง่ายกว่า
 */
export async function validateMemberWrite(
  members: Pick<Repo<MemberRow>, 'findMany' | 'findOne'>,
  data: Record<string, unknown>,
  ids: { channelId: string | null; exceptId: string | null },
): Promise<void> {
  const { exceptId } = ids
  const lineUserId = data['lineUserId']
  // beforeUpdate ที่แก้แค่ displayName ไม่ส่ง lineUserId มาด้วย — ไม่มีอะไรให้ตรวจ ค่าที่เคยผ่าน
  // ด่านนี้ตอน create แล้วยังคงเดิมอยู่
  if (typeof lineUserId !== 'string') return

  if (!isLineUserId(lineUserId)) {
    throw new strapiErrors.ValidationError('lineUserId must be a valid LINE user id (U + 32 hex characters)', {
      path: 'lineUserId',
    })
  }

  let channelId = ids.channelId
  // beforeUpdate ที่แก้แค่ lineUserId ไม่ส่ง channel มาด้วย — อ่าน channel ของแถวเดิมจาก DB ตรง ๆ
  // แทนเมื่อมี exceptId (คือกำลังแก้ไขแถวที่มีอยู่จริง) ให้เช็คซ้ำวิ่งกับ channel จริงเสมอ
  if (channelId === null && exceptId !== null) {
    const existing = await members.findOne(exceptId)
    channelId = existing?.channelId ?? null
  }
  // กฎ: ด่านนี้ห้ามถูกข้ามเงียบ ๆ เด็ดขาด — ถ้าเช็คไม่ได้จริง ๆ ต้องปฏิเสธการเขียน ไม่ใช่ปล่อยผ่าน
  //
  // เดิมตรงนี้ `return` เมื่อ channelId ยังเป็น null คิดว่าเป็นแค่ "ไม่รู้ channel เฉย ๆ ปล่อยผ่านดีกว่า
  // ปฏิเสธของถูก" — แต่ที่จริงมันเปิดช่องเดิม (ข้ามการเช็คซ้ำทั้งด่าน) กลับมาอีกทางหนึ่ง: `exceptId`
  // ไม่ null แต่ `members.findOne(exceptId)` คืน null (แถวถูกลบไปพร้อมกัน หรือ where ของ query นั้น
  // ไม่ได้กรองด้วย id เลย) `existing?.channelId ?? null` ก็เป็น null เหมือนกัน แล้วโค้ดเดิมก็ปล่อย
  // ผ่านเงียบ ๆ อีกครั้ง
  //
  // ความไม่สมมาตรที่ถูกต้อง: `members.findOne` ที่ throw ปลอดภัยอยู่แล้ว (exception หลุดออกไปที่
  // beforeUpdate เอง ทำให้ Strapi ปฏิเสธการเขียนเป็น 500 ที่ไม่สวยแต่ก็ปฏิเสธจริง) ส่วนที่คืน null
  // คือด้านที่อันตราย เพราะมันดูเหมือนคำตอบที่สำเร็จ — throw ValidationError ตรงนี้ทำให้ทั้งสองทาง
  // จบที่ผลเดียวกัน (ปฏิเสธการเขียน) แทนที่ทางหนึ่งจะแอบผ่านไปเงียบ ๆ
  if (channelId === null) {
    throw new strapiErrors.ValidationError(
      'cannot verify lineUserId uniqueness without a channel — resend the write with channel included',
      { path: 'lineUserId' },
    )
  }

  // ความซ้ำคือ (channel, lineUserId) ไม่ใช่ lineUserId เดี่ยว ๆ — คนเดียวกันมี user id คนละตัว
  // ต่าง OA กันได้ตามปกติ กฎ column เดียวจะปฏิเสธข้อมูลที่ถูกต้อง
  const siblings = await members.findMany({ filters: { channelId } })
  const taken = siblings.some((row) => row.lineUserId === lineUserId && row.id !== exceptId)
  if (taken) {
    throw new strapiErrors.ValidationError('lineUserId is already used in this channel', { path: 'lineUserId' })
  }
}

/**
 * ผูก LINE user เข้ากับเมนูสมาชิกของ channel ทันทีที่แถวถูกสร้าง
 *
 * LINE ล่มต้องไม่ทำให้บันทึกสมาชิกไม่ได้ — งานที่กรอกไปแล้วหายแพงกว่าสถานะที่ซ่อมได้ ฟังก์ชันนี้จึง
 * ถูกเรียก**หลัง**แถวถูกเขียนสำเร็จเท่านั้น (จาก afterCreate ไม่ใช่ beforeCreate) และไม่ throw
 * ออกไปเลยไม่ว่าจะพังตรงไหน — ล้มแล้ว `linkedAt` ยังเป็น null คือเครื่องหมายบอกตรง ๆ ว่า "ยังไม่เคย
 * บอก LINE สำเร็จ" ไม่ใช่ปมค้าง — แก้ได้ทีหลังด้วยปุ่ม re-sync (งานถัดไปในแผน)
 *
 * กฎคือ "ไม่มีอะไรหลังการเขียนที่สำเร็จแล้วหลุดออกไปได้" ไม่ใช่แค่ "ห่อคำเรียก LINE" —
 * `channels.findOne` เองก็โยน `ChannelNotFoundError` ได้จริง (channel ถูกลบพร้อมกัน หรือ id ค้าง)
 * ต้องอยู่ใน try เหมือนกัน ไม่งั้นแถวสมาชิกเขียนสำเร็จไปแล้วแต่ throw กลับเข้า Content Manager
 * อยู่ดี — พังตรงจุดเดียวกับที่ทั้งฟังก์ชันนี้มีไว้กันไม่ให้พัง
 */
export async function linkNewMember(services: Services, row: MemberRow): Promise<void> {
  // richMenuId ต้องอยู่นอก try เพื่อให้ catch อ้างถึงได้ (audit ต้องการค่านี้แม้ล้มตั้งแต่ก่อนรู้ค่าจริง)
  // แต่การ**อ่าน**มันทั้งหมดต้องอยู่ในนี้ — ไม่ใช่แค่ค่าเริ่มต้น
  let richMenuId: string | null = null
  try {
    // ไม่ถอดรหัส token ก่อนรู้ว่าจะใช้จริง — ถ้า channel ยังไม่มีเมนูสำหรับสมาชิกก็ return ตรงนี้เลย
    // โดยไม่แตะ withSecrets()/LINE เลย
    const summary = await services.channels.findOne(row.channelId)
    richMenuId = summary.memberRichMenuId
    if (richMenuId === null) return

    const channel = await services.channels.withSecrets().findOne(row.channelId)
    await services.clientFor(channel).linkToUser(row.lineUserId, richMenuId)
    await services.members.update(row.id, { linkedRichMenuId: richMenuId, linkedAt: new Date().toISOString() })
    await services.audit.write({
      actorId: null, action: 'link-members', richMenuId, channelId: row.channelId,
      before: null, after: { memberId: row.id }, result: 'success', errorCode: null,
    })
  } catch (error) {
    services.logger.error('line-rich-menu: link new member failed', { memberId: row.id, error })
    await services.audit.write({
      actorId: null, action: 'link-members', richMenuId, channelId: row.channelId,
      before: null, after: null, result: 'failure', errorCode: errorCodeOf(error),
    })
  }
}

/**
 * ถอน LINE user ออกจากเมนูที่เคยผูกไว้ เมื่อแถวสมาชิกถูกลบ — กลืน error ของ LINE เหมือนกับ
 * `linkNewMember` ทุกประการ ด้วยเหตุผลเดียวกัน (การลบแถวสำเร็จไปแล้ว จะให้ throw กลับไปแปลว่า
 * Content Manager ต้องเลิกทำสิ่งที่ทำสำเร็จแล้วจริง ๆ ไม่ได้)
 */
export async function unlinkDeletedMember(services: Services, row: MemberRow): Promise<void> {
  // ไม่เคย link กับ LINE สำเร็จเลย (สมัครแล้วผูกไม่ติดตั้งแต่แรก หรือยังไม่มีเมนูสมาชิกตอนนั้น) —
  // ไม่มีอะไรให้ unlink ทั้งฝั่ง LINE
  if (row.linkedRichMenuId === null) return

  try {
    const channel = await services.channels.withSecrets().findOne(row.channelId)
    await services.clientFor(channel).unlinkFromUser(row.lineUserId)
    await services.audit.write({
      actorId: null, action: 'unlink-members', richMenuId: row.linkedRichMenuId, channelId: row.channelId,
      before: { memberId: row.id }, after: null, result: 'success', errorCode: null,
    })
  } catch (error) {
    services.logger.error('line-rich-menu: unlink deleted member failed', { memberId: row.id, error })
    await services.audit.write({
      actorId: null, action: 'unlink-members', richMenuId: row.linkedRichMenuId, channelId: row.channelId,
      before: null, after: null, result: 'failure', errorCode: errorCodeOf(error),
    })
  }
}

/**
 * คีย์เดียวที่ subscriber นี้ใช้ใน `event.state` — ดูคอมเมนต์ที่ `LifecycleEvent.state` ใน
 * strapi.ts ว่าทำไมมันปลอดภัยจากการลบที่วิ่งพร้อมกันโดยไม่ต้องคีย์ด้วย id เอง
 */
const DELETED_MEMBER = 'deletedMember'

/** ค่าที่อ่านกลับมาคือค่าที่ `beforeDelete` ของเราเองใส่ไว้ (state ถูกคีย์ด้วย subscriber) การ cast
 * ตรงนี้จึงไม่ใช่การเดารูปของข้อมูลที่ Strapi ประกอบมาให้ ต่างจาก `event.result` ที่เคยพึ่งอยู่ */
function stashedMember(event: LifecycleEvent): MemberRow | null {
  return (event.state?.[DELETED_MEMBER] ?? null) as MemberRow | null
}

/** beforeCreate/beforeUpdate ต่างกันแค่ว่ามีแถวเดิมให้ยกเว้นหรือยัง — `where` ที่ไม่มีของ create
 * ให้ exceptId เป็น null ตามความหมายพอดี ไม่ต้องแยกทางเดิน */
async function validateWrite(strapi: StrapiV5, event: LifecycleEvent): Promise<void> {
  const services = getServices(strapi)
  const data = event.params.data ?? {}
  await validateMemberWrite(services.members, data, {
    channelId: await documentIdByPk(strapi, UID.channel, data['channel']),
    exceptId: await documentIdByPk(strapi, UID.member, event.params.where?.['id']),
  })
}

/**
 * ลงทะเบียน lifecycle ของ `line-member` เข้ากับ `strapi.db.lifecycles` — จุดเดียวที่การแก้ไข
 * รายชื่อสมาชิกด้วยมือใน Content Manager (สเปก §Non-goals: ไม่มี webhook ไม่มี CSV) ไปถึง LINE จริง
 *
 * ตามแพทเทิร์นเดียวกับ `registerPermissions`/`registerCron` ใน bootstrap.ts — เรียกครั้งเดียวตอนบูต
 */
export function registerMemberLifecycles(strapi: StrapiV5): void {
  strapi.db.lifecycles.subscribe({
    models: [UID.member],

    async beforeCreate(event: LifecycleEvent) {
      await validateWrite(strapi, event)
    },

    async beforeUpdate(event: LifecycleEvent) {
      await validateWrite(strapi, event)
    },

    async afterCreate(event: LifecycleEvent) {
      const documentId = event.result?.['documentId']
      if (typeof documentId !== 'string') return
      const services = getServices(strapi)
      // อ่านกลับผ่าน services.members (documents() + populate:['channel']) แทนที่จะเชื่อรูปของ
      // event.result ตรง ๆ — แถวยังอยู่จริงตอนนี้ (ยังไม่ถูกลบ) จึงอ่านซ้ำได้เสมอ ผลคือได้ MemberRow
      // ที่ channelId ถูกต้องแน่นอน ไม่ต้องพึ่งการเดารูป relation ที่ไม่มีเอกสารรับรอง
      const row = await services.members.findOne(documentId)
      if (row !== null) await linkNewMember(services, row)
    },

    /**
     * อ่านแถวไว้ตอนที่ยังอ่านได้ — `event.result` ของ afterDelete ไม่เคยมี `channel` ติดมา
     * (`entries.delete` ยิง `db.query().delete()` โดยไม่ส่ง populate ไปเลย) และพอถึงตอนนั้นแถวก็
     * หายไปแล้ว จะอ่านซ้ำก็ไม่ได้ ผลคือสมาชิกที่ถูกลบถือเมนูค้างตลอดไปโดยมีแค่บรรทัด log
     *
     * error ที่นี่ต้องไม่หลุดออกไป ไม่ใช่เพราะกลัว error แต่เพราะ throw จาก beforeDelete จะ
     * **ยกเลิกการลบ** — กฎเดียวกับ linkNewMember/unlinkDeletedMember: สิ่งที่ผู้ใช้สั่งต้องสำเร็จ
     * ส่วนงานฝั่ง LINE ที่ตามไม่ทันเป็นสถานะที่ซ่อมได้ทีหลัง
     */
    async beforeDelete(event: LifecycleEvent) {
      const services = getServices(strapi)
      try {
        const documentId = await documentIdByPk(strapi, UID.member, event.params.where?.['id'])
        // เคสนี้ไม่ throw (documentIdByPk แค่คืน null) จึงไม่ตกไปที่ catch ข้างล่างเอง — แต่ผลลัพธ์
        // ปลายทางเหมือนกันทุกประการ (afterDelete ข้าม unlink เงียบ ๆ) ถ้าไม่ log ไว้ตรงนี้ด้วย จะไม่มี
        // ร่องรอยอะไรเลยว่าทำไมสมาชิกที่ถูกลบถึงยังถือเมนูค้างอยู่
        if (documentId === null) {
          services.logger.error(
            'line-rich-menu: capture member before delete failed — cannot resolve documentId from where clause',
            { where: event.params.where },
          )
        }
        event.state = {
          ...event.state,
          [DELETED_MEMBER]: documentId === null ? null : await services.members.findOne(documentId),
        }
      } catch (error) {
        services.logger.error('line-rich-menu: capture member before delete failed', { error })
      }
    },

    async afterDelete(event: LifecycleEvent) {
      const row = stashedMember(event)
      if (row !== null) await unlinkDeletedMember(getServices(strapi), row)
    },
  })
}
