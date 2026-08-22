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
 * `data.channel`/`where.documentId` ที่ event ของ `db.lifecycles` ส่งมาไม่มีเอกสารระบุรูปตรง ๆ
 * ว่าที่ระดับนี้ (ก่อน `attachRelations` ของ entity-manager) จะเป็นสตริง documentId ดิบ,
 * object ที่ populate แล้ว (`{documentId}`), หรือรูป `{connect:[...]}`/`{set:[...]}` ที่ document
 * service ยังไม่ทันแปลง — เผื่อไว้ทุกแบบ ผิดจากรูปจริงมากที่สุดคือคืน null แล้วข้ามเงื่อนไขที่ต้องใช้
 * ค่านี้ไป (เช่นข้ามการเช็คซ้ำข้าม channel) ไม่ใช่ปฏิเสธข้อมูลที่ถูกต้องหรือ throw ใส่ผู้ใช้
 */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj['documentId'] === 'string') return obj['documentId']
    if (typeof obj['id'] === 'string' || typeof obj['id'] === 'number') return String(obj['id'])
    const list = obj['connect'] ?? obj['set']
    if (Array.isArray(list) && list.length > 0) return idOf(list[0])
  }
  return null
}

/**
 * ตรวจก่อนเขียนเสมอ — ตรงข้ามกับ `linkNewMember`/`unlinkDeletedMember` ที่ต้องกลืน error ของ LINE
 * ไว้ ที่นี่คือ input ผิดจากผู้ใช้เอง ต้องบอกก่อนที่จะเขียนอะไรลง DB เลย ไม่ใช่เขียนแล้วค่อยแก้
 *
 * `exceptId: null` หมายถึง "ยังไม่รู้ว่าแถวไหนคือแถวตัวเอง" (สถานการณ์ของ `beforeCreate` ที่ยังไม่
 * มีแถวอยู่จริง) ไม่ใช่ "ไม่มีแถวไหนถูกยกเว้น" — ทั้งสองแบบมีผลเหมือนกันทางคณิตศาสตร์
 * (`row.id !== null` เป็นจริงเสมอ) แต่ตั้งชื่อพารามิเตอร์ตามความหมายไว้ให้อ่านง่ายกว่า
 */
export async function validateMemberWrite(
  members: Pick<Repo<MemberRow>, 'findMany' | 'findOne'>,
  data: Record<string, unknown>,
  exceptId: string | null,
): Promise<void> {
  const lineUserId = data['lineUserId']
  // beforeUpdate ที่แก้แค่ displayName ไม่ส่ง lineUserId มาด้วย — ไม่มีอะไรให้ตรวจ ค่าที่เคยผ่าน
  // ด่านนี้ตอน create แล้วยังคงเดิมอยู่
  if (typeof lineUserId !== 'string') return

  if (!isLineUserId(lineUserId)) {
    throw new strapiErrors.ValidationError('lineUserId must be a valid LINE user id (U + 32 hex characters)', {
      path: 'lineUserId',
    })
  }

  let channelId = idOf(data['channel'])
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
  // ไม่ null แต่ `members.findOne(exceptId)` คืน null (หาแถวไม่เจอ เช่น exceptId ผิดรูปเพราะ
  // where.id เป็น primary key ตัวเลขไม่ใช่ documentId — ดูคอมเมนต์ที่ idOf/registerMemberLifecycles)
  // `existing?.channelId ?? null` ก็เป็น null เหมือนกัน แล้วโค้ดเดิมก็ปล่อยผ่านเงียบ ๆ อีกครั้ง
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

/** สร้าง `MemberRow` จากแถวดิบของ `documents()` — ใช้เฉพาะ afterDelete ที่แถวถูกลบไปแล้วจริง จะ
 * เรียก `services.members.findOne` ซ้ำไม่ได้อีก ต้องพึ่งสิ่งที่ event เก็บมาให้เท่านั้น (ดูคอมเมนต์
 * ที่ `idOf` เรื่องความไม่แน่นอนของรูป `channel`) */
function memberRowFromDeletedEntity(entity: Record<string, unknown>): MemberRow | null {
  const id = entity['documentId']
  if (typeof id !== 'string') return null
  return {
    id,
    channelId: idOf(entity['channel']) ?? '',
    lineUserId: typeof entity['lineUserId'] === 'string' ? entity['lineUserId'] : '',
    displayName: typeof entity['displayName'] === 'string' ? entity['displayName'] : null,
    linkedRichMenuId: typeof entity['linkedRichMenuId'] === 'string' ? entity['linkedRichMenuId'] : null,
    linkedAt: typeof entity['linkedAt'] === 'string' ? entity['linkedAt'] : null,
  }
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
      const services = getServices(strapi)
      await validateMemberWrite(services.members, event.params.data ?? {}, null)
    },

    async beforeUpdate(event: LifecycleEvent) {
      const services = getServices(strapi)
      // ตัวเองต้องไม่ถูกนับเป็น "แถวอื่นที่ชนกัน" ตอนแก้ไข — เอา documentId ของแถวที่กำลังแก้ (ถ้า
      // event บอกมา) มาเป็น exceptId; ถ้าบอกมาแค่ id ตัวเลข (primary key) จะไม่ตรงกับ MemberRow.id
      // (documentId) เลยสักครั้ง เช็คซ้ำจึงยังทำงานถูก แค่ "ยกเว้นตัวเอง" อาจไม่เกิดในเคสนั้น
      const exceptId = idOf(event.params.where?.['documentId'] ?? event.params.where?.['id'])
      await validateMemberWrite(services.members, event.params.data ?? {}, exceptId)
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

    async afterDelete(event: LifecycleEvent) {
      if (event.result === undefined) return
      // แถวถูกลบไปแล้วจริง — อ่านซ้ำผ่าน services.members ไม่ได้อีก ต้องพึ่ง event.result ที่
      // entity-manager แนบมาให้ (ดูคอมเมนต์ที่ memberRowFromDeletedEntity/idOf เรื่องความไม่แน่นอน
      // ของ populate สำหรับ relation ที่ระดับนี้)
      const row = memberRowFromDeletedEntity(event.result)
      if (row !== null) await unlinkDeletedMember(getServices(strapi), row)
    },
  })
}
