// @strapi/utils ไม่ export ValidationError เป็นชื่อตรง ๆ ที่ root — มีแต่ namespace `errors`
// (`export * as errors from './errors'`) เหมือนกับที่ v5 ใช้ทุกประการ ต่างแค่ major version ของ
// แพ็กเกจ (^4.x ที่นี่ ผูกกับ @strapi/strapi ^4.25.0 ของปลั๊กอินนี้)
import { errors as strapiErrors } from '@strapi/utils'
import {
  errorCodeOf, isLineUserId, type MemberRow, type Repo,
} from '@fosivo/line-rich-menu-core'
import { getServices, type Services } from './container.js'
import { UID } from './content-types/index.js'
import type { LifecycleEvent, StrapiV4 } from './strapi.js'

/**
 * `data.channel`/`where.id` ที่ event ของ `db.lifecycles` ส่งมาไม่มีเอกสารระบุรูปตรง ๆ ว่าที่ระดับนี้
 * (ก่อน entityService แนบ relation ให้) จะเป็นเลข id ดิบ, object ที่ populate แล้ว (`{id}`), หรือรูป
 * `{connect:[...]}`/`{set:[...]}` ที่ยังไม่ทันแปลง — เผื่อไว้ทุกแบบ ค่าที่แกะไม่ออกคืน null แล้ว
 * ผู้เรียกเดินเส้นทาง fail closed ต่อ ไม่ใช่ข้ามเงื่อนไขที่ต้องใช้ค่านี้ไปเงียบ ๆ
 *
 * v4 ไม่มี documentId เหมือน v5 มีแต่ primary key ตัวเลขตัวเดียว (`id`) ซึ่งเป็นตัวระบุเดียวกับที่
 * `MemberRow.id`/`channelId` ของชั้น service ใช้ — ที่นี่จึงไม่ต้องแปลอะไรต่อ ต่างจาก v5 ที่ต้อง
 * ยิง `db.query` แปล primary key เป็น documentId ก่อน (ดู `documentIdByPk` ที่นั่น)
 */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
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
 * `ids` มาถึงที่นี่ในภาษาของชั้น service แล้ว ไม่ใช่ภาษาของ event — การแปลเป็นหน้าที่ของผู้เรียก
 * ที่รู้ว่าตัวเองอยู่ adapter ไหน (ที่ v4 คือ `idOf` เฉย ๆ เพราะสองภาษานี้เป็นภาษาเดียวกัน ส่วนที่
 * v5 ต้องยิง `db.query` แปล primary key เป็น documentId ก่อน) ฟังก์ชันนี้จึงเทียบ id ตรง ๆ ได้
 * โดยไม่ต้องรู้เลยว่า Strapi เวอร์ชันไหนเรียก id ว่าอะไร
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
  // `MemberRow.id` ของ v4 คือ primary key ตัวเลขตัวเดียวกับที่ `where.id` อ้างถึงเป๊ะ ๆ เสมอ
  // (ต่างจาก v5 ที่ต้องแปลก่อน — ดู `documentIdByPk` ที่นั่น) แต่ findOne ก็ยังคืน null ได้จริง
  // ด้วยเหตุอื่น (แถวถูกลบไปพร้อมกัน หรือ where ของ query นั้นไม่ได้กรองด้วย id เลย เช่น bulk
  // update ทั้งชุด) — กฎเดียวกับ v5 จึงยังจำเป็นเหมือนกัน: null ที่ดูเหมือนคำตอบสำเร็จต้องปฏิเสธ
  // การเขียน ไม่ใช่ปล่อยผ่านเงียบ ๆ
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
 * อยู่ดี — บั๊กเดิมที่ v5 เจอและแก้ไปแล้ว (Task 7) ใช้ได้กับ v4 เป๊ะ ๆ เพราะ `channels` มาจาก
 * `createChannelService` ตัวเดียวกันในชั้น core ไม่ใช่โค้ดที่ต่างกันระหว่างสอง adapter
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
async function validateWrite(strapi: StrapiV4, event: LifecycleEvent): Promise<void> {
  const services = getServices(strapi)
  const data = event.params.data ?? {}
  await validateMemberWrite(services.members, data, {
    channelId: idOf(data['channel']),
    exceptId: idOf(event.params.where?.['id']),
  })
}

/**
 * ลงทะเบียน lifecycle ของ `line-member` เข้ากับ `strapi.db.lifecycles` — จุดเดียวที่การแก้ไข
 * รายชื่อสมาชิกด้วยมือใน Content Manager (สเปก §Non-goals: ไม่มี webhook ไม่มี CSV) ไปถึง LINE จริง
 *
 * `db.lifecycles.subscribe` ไม่ใช่ของ v5 เท่านั้น — v4 ใช้ `@strapi/database` แพ็กเกจเดียวกัน จึงมี
 * API ตัวนี้เหมือนกัน ตามแพทเทิร์นเดียวกับ `registerPermissions`/`registerCron` ใน bootstrap.ts —
 * เรียกครั้งเดียวตอนบูต
 */
export function registerMemberLifecycles(strapi: StrapiV4): void {
  strapi.db.lifecycles.subscribe({
    models: [UID.member],

    async beforeCreate(event: LifecycleEvent) {
      await validateWrite(strapi, event)
    },

    async beforeUpdate(event: LifecycleEvent) {
      await validateWrite(strapi, event)
    },

    async afterCreate(event: LifecycleEvent) {
      const id = event.result?.['id']
      if (typeof id !== 'number' && typeof id !== 'string') return
      const services = getServices(strapi)
      // อ่านกลับผ่าน services.members (entityService + populate:['channel']) แทนที่จะเชื่อรูปของ
      // event.result ตรง ๆ — แถวยังอยู่จริงตอนนี้ (ยังไม่ถูกลบ) จึงอ่านซ้ำได้เสมอ ผลคือได้ MemberRow
      // ที่ channelId ถูกต้องแน่นอน ไม่ต้องพึ่งการเดารูป relation ที่ไม่มีเอกสารรับรอง
      const row = await services.members.findOne(String(id))
      if (row !== null) await linkNewMember(services, row)
    },

    /**
     * อ่านแถวไว้ตอนที่ยังอ่านได้ — `event.result` ของ afterDelete ไม่เคยมี `channel` ติดมา
     * (`entityService.delete` ยิง `db.query().delete({ where: { id } })` โดยไม่ส่ง populate ไปเลย)
     * และพอถึงตอนนั้นแถวก็หายไปแล้ว จะอ่านซ้ำก็ไม่ได้ ผลคือสมาชิกที่ถูกลบถือเมนูค้างตลอดไปโดยมีแค่
     * บรรทัด log
     *
     * error ที่นี่ต้องไม่หลุดออกไป ไม่ใช่เพราะกลัว error แต่เพราะ throw จาก beforeDelete จะ
     * **ยกเลิกการลบ** — กฎเดียวกับ linkNewMember/unlinkDeletedMember: สิ่งที่ผู้ใช้สั่งต้องสำเร็จ
     * ส่วนงานฝั่ง LINE ที่ตามไม่ทันเป็นสถานะที่ซ่อมได้ทีหลัง
     */
    async beforeDelete(event: LifecycleEvent) {
      const services = getServices(strapi)
      try {
        const id = idOf(event.params.where?.['id'])
        event.state = {
          ...event.state,
          [DELETED_MEMBER]: id === null ? null : await services.members.findOne(id),
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
