import { randomUUID } from 'node:crypto'
import type { BatchOperation, LineClient } from '../line/client.js'
import type { AuditWriter } from './audit.js'
import { MenuNotFoundError, MenuNotMembersAudienceError, MenuNotReadyError } from './errors.js'
import type { Repo, RichMenuRow } from './types.js'

export interface MenuOpsDeps {
  client: LineClient
  menus: Repo<RichMenuRow>
  audit: AuditWriter
}

/**
 * Task 9/10 — export ออกมาแทนที่จะเป็น local function ให้ทั้ง strapi-v5 และ strapi-v4 import
 * เข้าไปใช้ตรง ๆ ใน controllers/members.ts's `activate` เมนูที่ยังไม่เคย publish ไม่มี
 * lineRichMenuId ให้ผูกสมาชิกด้วย ต้องใช้ code `menu_not_ready` เดียวกับที่ publish ใช้อยู่แล้ว
 * ไม่ใช่เขียนด่านเดียวกันซ้ำสองรอบในสอง adapter (นั่นคือรูปเดิมที่เคยทำให้ token-leak guard
 * มีอยู่แค่ฝั่งเดียว)
 */
export async function publishedMenuOrThrow(menus: Repo<RichMenuRow>, menuId: string): Promise<RichMenuRow> {
  const menu = await menus.findOne(menuId)
  if (menu === null) throw new MenuNotFoundError(`rich menu ${menuId} does not exist`)
  // ตั้ง default ให้เมนูที่ยังไม่เคยขึ้น LINE ไม่ได้ — id ที่จะส่งไปยังไม่มีอยู่จริง
  if (menu.status !== 'published' || menu.lineRichMenuId === null) {
    throw new MenuNotReadyError('not_published')
  }
  return menu
}

/**
 * Task 13 ruling — export ออกมาเหมือน `publishedMenuOrThrow` ข้างบน ให้ทั้ง strapi-v5 และ strapi-v4
 * เรียกจุดเดียวกันจาก `controllers/members.ts`'s `activateOrSync` แทนเขียนด่านนี้ซ้ำสองรอบในสอง
 * adapter — บทเรียนเดียวกับที่คอมเมนต์ของ `publishedMenuOrThrow` เตือนไว้แล้ว (token-leak guard
 * เคยมีอยู่แค่ฝั่งเดียวเพราะแยกเขียน)
 *
 * เรียก**หลัง** `publishedMenuOrThrow` เสมอ ไม่ใช่แทนที่ — เมนูต้องผ่านทั้งสองด่าน: publish แล้ว
 * (มี `lineRichMenuId` ให้ผูก) และ `audience: 'members'` (เป็นเมนูที่ถูกประกาศไว้สำหรับสมาชิกจริง ๆ)
 * ไม่ตรวจ audience ก่อน publish เพราะ error ที่ผู้ใช้ควรเห็นก่อนคือ "ยัง publish ไม่ได้" ถ้าทั้งสอง
 * อย่างผิดพร้อมกัน — แก้ปัญหาที่ปิดกั้นกว่าก่อน
 */
export function assertMembersAudience(menu: RichMenuRow): void {
  if (menu.audience !== 'members') {
    throw new MenuNotMembersAudienceError(menu.id)
  }
}

export async function setMenuAsDefault(
  deps: MenuOpsDeps,
  input: { menuId: string; actorId: string | null },
): Promise<void> {
  const menu = await publishedMenuOrThrow(deps.menus, input.menuId)
  const previous = await deps.client.getDefault()

  await deps.audit.around(
    {
      actorId: input.actorId,
      action: 'set-default',
      richMenuId: menu.id,
      channelId: menu.channelId,
      before: { defaultRichMenuId: previous },
    },
    async () => { await deps.client.setDefault(menu.lineRichMenuId!) },
    () => ({ defaultRichMenuId: menu.lineRichMenuId }),
  )
}

export async function clearChannelDefault(
  deps: MenuOpsDeps,
  input: { channelId: string; actorId: string | null },
): Promise<void> {
  const previous = await deps.client.getDefault()

  await deps.audit.around(
    {
      actorId: input.actorId,
      action: 'clear-default',
      // ไม่ผูกกับเมนูตัวใดตัวหนึ่ง — การล้าง default เป็นการกระทำระดับ channel
      richMenuId: null,
      channelId: input.channelId,
      before: { defaultRichMenuId: previous },
    },
    async () => { await deps.client.clearDefault() },
    () => ({ defaultRichMenuId: null }),
  )
}

export async function swapMenuAlias(
  deps: MenuOpsDeps,
  input: { menuId: string; actorId: string | null },
): Promise<void> {
  const menu = await publishedMenuOrThrow(deps.menus, input.menuId)
  if (menu.aliasId === null) throw new MenuNotReadyError('not_published')

  const aliasId = menu.aliasId
  const target = menu.lineRichMenuId!
  const previous = await deps.client.getAlias(aliasId)

  await deps.audit.around(
    {
      actorId: input.actorId,
      action: 'swap-alias',
      richMenuId: menu.id,
      channelId: menu.channelId,
      before: { aliasId, richMenuId: previous },
    },
    async () => {
      // POST /richmenu/alias สร้างใหม่ ส่วน POST /richmenu/alias/{id} ชี้ใหม่ — คนละ endpoint
      // การเรียกผิดตัวได้ 400 กลับมา จึงต้องอ่านก่อนว่ามีอยู่แล้วหรือยัง
      if (previous === null) await deps.client.createAlias(aliasId, target)
      else await deps.client.updateAlias(aliasId, target)
    },
    () => ({ aliasId, richMenuId: target }),
  )
}

/**
 * Task 12 — ที่เดียวในทั้ง repo ที่ยิง `POST /v2/bot/richmenu/batch` จุดประสงค์ต่างจาก
 * `unlink-members` (ที่ deactivate ตั้งไว้ให้ scheduler ทำทีละ chunk — ดู `enqueueUnlinkMembers`
 * ในแต่ละ adapter): เส้นนั้นปลดได้เฉพาะคนที่แถว line-member ของเรายังอ้างถึงอยู่ ส่วนคนที่แถวถูกลบไป
 * ระหว่าง LINE ล่ม หรือถูกผูกไว้ตั้งแต่ก่อนฟีเจอร์นี้มีอยู่ ไม่มีแถวให้เราชี้ไปหาคนเหล่านั้นอีกเลย
 * `batch` ของ LINE เจาะจงด้วย richMenuId ฝั่งเขาเอง จึงเข้าถึงคนกลุ่มนี้ได้โดยไม่ต้องรู้จักใครเลย
 * — นี่คือเหตุผลเดียวที่ยอมรับต้นทุนของมัน (โควตา 3 ครั้ง/ชม./account)
 *
 * `validateBatch` ก่อนเสมอ (ตรวจ payload ไม่กินโควตา) ตามด้วย `batchControl` ตัวจริงครั้งเดียว —
 * ไม่มี retry เพิ่มชั้นนี้ `LineClient#send` มี retry ของตัวเองอยู่แล้วสำหรับ 429/5xx และใช้
 * `resumeRequestKey` เดียวกันตลอดการ retry ภายในคำขอเดียวกันนั้น (ดูคอมเมนต์ที่ `batchControl`
 * ใน client.ts) — `randomUUID()` ที่นี่จึงสุ่มใหม่ต่อการเรียกฟังก์ชันนี้หนึ่งครั้งเท่านั้น ไม่ใช่ต่อ
 * การ retry แต่ละรอบ: กดปุ่มนี้สองครั้งที่ต่างกันของผู้ใช้ต้องนับเป็นคนละคำขอสำหรับ LINE
 *
 * request id จาก `batchControl` (ถ้ามี) เก็บไว้ใน audit.after เพื่อ debug เท่านั้น — ตาม ruling ของ
 * Task 1: `batchControl` เองไม่เคยโยนเพราะ header หาย (คืน `null` เฉย ๆ) และฟังก์ชันนี้ไม่พยายาม
 * อ่าน progress ต่อเลย ปฏิบัติการปลด (ซึ่งจำเป็นและทำได้ไม่บ่อย) ต้องไม่ถูกเงื่อนไข "อ่าน progress
 * ไม่ได้" ทำให้ล้มไปด้วย
 */
export async function unlinkAllFromMenu(
  deps: MenuOpsDeps,
  input: { menuId: string; actorId: string | null },
): Promise<{ requestId: string | null }> {
  const menu = await publishedMenuOrThrow(deps.menus, input.menuId)
  const operations: BatchOperation[] = [{ type: 'unlink', from: menu.lineRichMenuId! }]

  return deps.audit.around(
    {
      actorId: input.actorId,
      action: 'unlink-all',
      // id ฝั่ง LINE ไม่ใช่ id แถวเมนูของเรา — unlink-all เป็นงานระดับสมาชิกเหมือน unlink-members
      // (คำถามหลังเกิดเหตุคือ "ใครยังถือเมนูตัวไหนอยู่บน LINE") ไม่ใช่งานระดับเมนูแบบ set-default/
      // swap-alias/delete ที่เก็บ id แถวของเราเพราะสิ่งที่ถูกกระทำคือแถวนั้นเอง (ดูคอมเมนต์เต็มที่
      // AuditRow.richMenuId ใน types.ts — บั๊กนี้เคยเกิดมาแล้วจริงกับ link-members ใน Task 4)
      richMenuId: menu.lineRichMenuId,
      channelId: menu.channelId,
      before: null,
    },
    async () => {
      await deps.client.validateBatch(operations)
      const requestId = await deps.client.batchControl(operations, randomUUID())
      return { requestId }
    },
    (value) => value,
  )
}

export interface ReconcileReport {
  /** อยู่บน LINE แต่ไม่มีแถวไหนใน DB อ้างถึง */
  orphans: string[]
  /** DB บอกว่า published แต่ LINE ไม่มีแล้ว */
  missing: string[]
}

/**
 * สเปก §8 ข้อ 3 — **รายงานอย่างเดียว ไม่ลบให้** เพราะเมนูที่ไม่รู้จักอาจถูกสร้างจาก
 * LINE OA Manager โดยตรงหรือจากระบบอื่นของลูกค้า การลบอัตโนมัติคือการทำลายของคนอื่น
 */
export async function reconcileChannel(
  deps: MenuOpsDeps,
  input: { channelId: string },
): Promise<ReconcileReport> {
  const onLine = new Set((await deps.client.listRichMenus()).map((menu) => menu.richMenuId))
  const rows = await deps.menus.findMany({ filters: { channelId: input.channelId } })
  const known = new Set(rows.map((row) => row.lineRichMenuId).filter((id): id is string => id !== null))

  return {
    orphans: [...onLine].filter((id) => !known.has(id)).sort(),
    missing: rows
      .filter((row) => row.status === 'published' && row.lineRichMenuId !== null && !onLine.has(row.lineRichMenuId))
      .map((row) => row.lineRichMenuId!)
      .sort(),
  }
}

/**
 * สเปก §8 ข้อ 3 ท่อนที่สอง — "ให้ผู้ใช้กดลบเอง" เมนูกำพร้าไม่มีแถวใน DB ให้ผูก ตัวมันเองคือ
 * lineRichMenuId เท่านั้น จึงลบด้วย id ฝั่ง LINE ตรง ๆ ไม่ผ่าน publishedMenuOrThrow เหมือน op อื่น
 *
 * ต้องเรียก reconcileChannel ใหม่แล้วตรวจว่า id ที่ขอมาอยู่ใน orphans จริง ห้ามเชื่อ id ที่ client
 * ส่งมาเฉย ๆ — รายงานที่ผู้ใช้เห็นอาจเก่าไปหลายนาทีแล้ว (มีคนเพิ่ง publish ทับ id เดียวกัน หรือ
 * เมนูที่เคยกำพร้าถูกลบไปแล้วจากที่อื่น) ถ้าไม่ตรวจซ้ำ ผู้ใช้ที่มีสิทธิ์ publish จะลบเมนูที่กำลัง
 * ใช้งานอยู่จริงได้ด้วยการเดา id ซึ่งเป็นการยกระดับสิทธิ์ที่แผงหน้าจอไม่ได้ตั้งใจให้
 */
export async function deleteOrphan(
  deps: MenuOpsDeps,
  input: { channelId: string; lineRichMenuId: string; actorId: string | null },
): Promise<void> {
  const report = await reconcileChannel(deps, { channelId: input.channelId })
  if (!report.orphans.includes(input.lineRichMenuId)) {
    throw new MenuNotReadyError('not_published')
  }

  await deps.audit.around(
    {
      actorId: input.actorId,
      action: 'delete',
      // ไม่ผูกกับแถวเมนูตัวใดตัวหนึ่งใน DB — กำพร้าคือเมนูที่ไม่มีแถวให้ผูกอยู่แล้ว
      richMenuId: null,
      channelId: input.channelId,
      before: { lineRichMenuId: input.lineRichMenuId },
    },
    async () => { await deps.client.deleteRichMenu(input.lineRichMenuId) },
  )
}
