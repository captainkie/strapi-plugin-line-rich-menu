import { randomUUID } from 'node:crypto'
import type { BatchOperation, LineClient } from '../line/client.js'
import type { AuditWriter } from './audit.js'
import {
  MenuActiveForMembersError, MenuChannelLockedError, MenuDisplayPeriodNotAllowedError,
  MenuNotAllAudienceError, MenuNotFoundError, MenuNotMembersAudienceError, MenuNotReadyError,
  type MemberMenuOperation,
} from './errors.js'
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

/**
 * Task 14b item 3 — ด่านตรงข้ามของ `assertMembersAudience` ข้างบน: ที่นั่นกันไม่ให้ **activate**
 * เมนูที่ไม่ใช่ของสมาชิก ที่นี่กันไม่ให้ **ถอด** ป้าย `'members'` ออกจากเมนูที่กำลังเป็นเมนูสมาชิก
 * อยู่จริง สองด่านนี้ปิดวงเดียวกันคนละทาง ก่อนมีตัวนี้ ช่องที่เหลือคือ: ตั้ง audience เป็น members
 * → activate → กลับมาแก้ audience เป็น all ผ่านฟอร์ม ซึ่งพาไปลงสถานะที่ด่านแรกมีไว้กันพอดี
 * (ดูคอมเมนต์เต็มที่ `MenuActiveForMembersError` ใน errors.ts)
 *
 * อยู่ใน core ไม่ใช่ใน `menu-write.ts` ของแต่ละ adapter ด้วยเหตุผลเดียวกับ `assertMembersAudience`
 * และ `publishedMenuOrThrow` — ด่านที่เขียนซ้ำสองรอบคือด่านที่วันหนึ่งจะมีอยู่แค่ฝั่งเดียว
 * (บทเรียนจริงจาก token-leak guard ที่เคยมีอยู่บน adapter เดียว)
 *
 * รับ `memberRichMenuId` เป็นค่าดิบ ไม่ใช่ `ChannelRow` ทั้งก้อน — ฟังก์ชันนี้ไม่ต้องรู้อะไรเกี่ยวกับ
 * channel มากกว่านั้นเลย และผู้เรียกทั้งสอง adapter อ่านค่านี้จาก repo ของตัวเองคนละรูปกันอยู่แล้ว
 *
 * `next === undefined` (caller ไม่ส่งฟิลด์มา = "ไม่เปลี่ยน") ต้องผ่านเสมอ ไม่ใช่ถูกตีความเป็นการ
 * ถอดป้าย — นั่นคือกฎเดียวกับที่ `saveMenu` ใช้ตัดสินว่าจะเขียน `audience` ลง patch ไหม และเป็นสิ่งที่
 * เทสต์ round 4 ของ Task 13 คุ้มครองอยู่
 */
export function assertAudienceChangeAllowed(input: {
  menu: Pick<RichMenuRow, 'id' | 'audience' | 'lineRichMenuId'>
  next: 'all' | 'members' | undefined
  memberRichMenuId: string | null
}): void {
  // ไม่ส่งมา = ไม่เปลี่ยน; ยังเป็น members = ไม่ใช่การถอดป้าย
  if (input.next === undefined || input.next === 'members') return
  // ป้ายเดิมไม่ใช่ members อยู่แล้ว — ไม่มีอะไรให้ถอด (เช่น all → all)
  if (input.menu.audience !== 'members') return
  // เมนูที่ไม่เคยขึ้น LINE เป็นเมนูสมาชิกของ channel ไหนไม่ได้ (activate ผ่าน publishedMenuOrThrow
  // เสมอ) — เช็คตรงนี้ชัด ๆ ไม่ปล่อยให้ไปเทียบ `null === null` ข้างล่างแล้วปฏิเสธเมนูร่างที่ไม่มี
  // ใครถืออยู่จริง ทั้งที่ channel นั้นก็แค่ยังไม่มีเมนูสมาชิกเลย
  if (input.menu.lineRichMenuId === null) return
  if (input.memberRichMenuId !== input.menu.lineRichMenuId) return
  throw new MenuActiveForMembersError(input.menu.id, 'audience')
}

/**
 * Task 17 / final review BLOCKER — คู่ตรงข้ามของ `assertMembersAudience` ข้างบนแบบตรงตัว: ที่นั่น
 * กันไม่ให้เมนูที่ไม่ใช่ของสมาชิกถูก **activate ให้สมาชิก** ที่นี่กันไม่ให้เมนูที่ไม่ใช่ของทุกคนถูก
 * **ตั้งเป็น default ของบัญชี** ซึ่งคือการยัดมันให้ผู้ติดตามทุกคน ไม่ใช่แค่สมาชิก
 *
 * เรียกจากสามที่ที่ตั้ง default ได้จริง และต้องครบทั้งสาม ไม่ใช่แค่ที่ที่ UI เดินผ่าน:
 * `publishMenu` (เฉพาะเมื่อ `setAsDefault`), `setMenuAsDefault` (`POST /menus/:id/default` และ op
 * `set-default` ของ scheduler ใช้ตัวเดียวกัน) — ดูคอมเมนต์เต็มที่ `MenuNotAllAudienceError`
 *
 * อยู่ใน core ไม่ใช่ในแต่ละ adapter ด้วยเหตุผลเดิมของไฟล์นี้ทั้งไฟล์: ด่านที่เขียนซ้ำสองรอบคือด่าน
 * ที่วันหนึ่งจะมีอยู่แค่ฝั่งเดียว
 */
export function assertAllAudience(menu: Pick<RichMenuRow, 'id' | 'audience'>): void {
  if (menu.audience !== 'all') {
    throw new MenuNotAllAudienceError(menu.id)
  }
}

/**
 * Task 17 / final review H1+H2 — เมนูที่ **เป็นเมนูสมาชิกของ channel อยู่ตอนนี้** ห้ามถูก publish
 * ซ้ำและห้ามถูกลบแถวทิ้ง ทั้งสองทางพาไปลงสถานะเดียวกัน: pointer ของ channel ชี้ id ที่ไม่มีอยู่จริง
 * อีกแล้ว สวิตช์อ่านว่า "ปิด" ทั้งที่สมาชิกยังค้างอยู่ และไม่มีทางล้าง pointer ผ่านผลิตภัณฑ์ได้เลย
 * (`deactivate` 404 ที่ `menus.findOne` ในเคสลบ) — เหตุผลเต็มอยู่ที่ `MenuActiveForMembersError`
 *
 * เงื่อนไขเดียวกับครึ่งท้ายของ `assertAudienceChangeAllowed` เป๊ะ ๆ และตั้งใจให้ตรงกัน: "เมนูนี้คือ
 * ตัวที่ pointer ชี้อยู่จริงไหม" — เทียบด้วย `lineRichMenuId` ไม่ใช่ `menu.id` เพราะ pointer เก็บ id
 * ฝั่ง LINE เมนูร่างที่ยังไม่เคยขึ้น LINE (`lineRichMenuId === null`) ผ่านเสมอ ไม่ใช่ไปเทียบ
 * `null === null` แล้วปฏิเสธการลบร่างของ channel ที่บังเอิญยังไม่มีเมนูสมาชิกเลย
 *
 * รับ `memberRichMenuId` เป็นค่าดิบเหมือน `assertAudienceChangeAllowed` — ผู้เรียกทั้งสอง adapter
 * อ่านค่านี้จาก repo ของตัวเองคนละรูปกันอยู่แล้ว และ core ไม่ต้องรู้จัก channel มากกว่านี้
 */
export function assertNotChannelMemberMenu(input: {
  menu: Pick<RichMenuRow, 'id' | 'lineRichMenuId'>
  memberRichMenuId: string | null
  operation: Exclude<MemberMenuOperation, 'audience'>
}): void {
  if (input.menu.lineRichMenuId === null) return
  if (input.memberRichMenuId !== input.menu.lineRichMenuId) return
  throw new MenuActiveForMembersError(input.menu.id, input.operation)
}

/**
 * Task 17 / deferred item 3 — ห้ามย้ายเมนูที่มีตัวจริงอยู่บน LINE แล้วไป channel อื่น
 * (เหตุผลเต็มที่ `MenuChannelLockedError`)
 *
 * `next === undefined` ต้องผ่านเสมอด้วยกฎเดียวกับ `assertAudienceChangeAllowed`: "ไม่ส่งมา" คือ
 * "ไม่เปลี่ยน" และ `next === menu.channelId` (ฟอร์มส่งค่าเดิมกลับมาทุกครั้ง) ก็ไม่ใช่การย้าย —
 * ถ้าด่านนี้ดูแค่ "มีคีย์ channelId ไหม" เมนูที่ publish แล้วจะแก้อะไรไม่ได้เลยสักอย่าง ซึ่งแย่กว่า
 * ปัญหาที่มันตั้งใจแก้ (บทเรียนเดียวกับ Task 14b item 3 round 2)
 */
export function assertChannelChangeAllowed(input: {
  menu: Pick<RichMenuRow, 'id' | 'channelId' | 'lineRichMenuId'>
  next: string | undefined
}): void {
  if (input.next === undefined || input.next === input.menu.channelId) return
  // ยังไม่เคยขึ้น LINE — ร่างย้าย channel ได้ตามปกติ ไม่มีอะไรค้างอยู่ฝั่งบัญชีเดิม
  if (input.menu.lineRichMenuId === null) return
  throw new MenuChannelLockedError(input.menu.id)
}

/**
 * Task 17 item 5 — ช่วงเวลาแสดงผลบนเมนูสมาชิก (เหตุผลเต็มที่ `MenuDisplayPeriodNotAllowedError`)
 *
 * `audience` ที่ส่งเข้ามาต้องเป็น audience **ผลลัพธ์** ของคำขอนี้ (ค่าที่ส่งมา ถ้าไม่ส่งก็ค่าเดิมของ
 * แถว ถ้าเป็นเมนูใหม่ก็ค่า default ของคอลัมน์) ไม่ใช่ค่าเดิมเสมอ — ไม่งั้นการเปลี่ยนเป็น members
 * พร้อมกับตั้งช่วงเวลาในคำขอเดียวจะลอดผ่านทั้งที่เป็นสถานะเดียวกับที่ด่านนี้มีไว้กัน
 */
export function assertDisplayPeriodAllowed(input: {
  audience: 'all' | 'members'
  startAt: string | null
  endAt: string | null
}): void {
  if (input.audience !== 'members') return
  if (input.startAt === null && input.endAt === null) return
  throw new MenuDisplayPeriodNotAllowedError()
}

export async function setMenuAsDefault(
  deps: MenuOpsDeps,
  input: { menuId: string; actorId: string | null },
): Promise<void> {
  const menu = await publishedMenuOrThrow(deps.menus, input.menuId)
  // Task 17 — เรียก**หลัง** publishedMenuOrThrow ด้วยเหตุผลเดียวกับที่ `assertMembersAudience` เรียก
  // หลังมัน (ดูคอมเมนต์ที่นั่น): ถ้าเมนูผิดทั้งสองอย่างพร้อมกัน error ที่ควรเห็นก่อนคือตัวที่ปิดกั้น
  // กว่า ทางนี้ครอบทั้ง `POST /menus/:id/default` และ op `set-default` ของ scheduler เพราะทั้งคู่
  // ลงมาที่ฟังก์ชันเดียวกันนี้ — แถว `set-default` ของเมนูสมาชิกที่ค้างอยู่ในฐานข้อมูลที่อัปเกรดมา
  // จึงล้มเป็นงาน failed พร้อม lastError แทนที่จะยัดเมนูสมาชิกให้ผู้ติดตามทุกคนตามเวลาที่ตั้งไว้
  assertAllAudience(menu)
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
