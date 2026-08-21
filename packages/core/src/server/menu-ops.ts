import type { LineClient } from '../line/client.js'
import type { AuditWriter } from './audit.js'
import { MenuNotFoundError, MenuNotReadyError } from './errors.js'
import type { Repo, RichMenuRow } from './types.js'

export interface MenuOpsDeps {
  client: LineClient
  menus: Repo<RichMenuRow>
  audit: AuditWriter
}

async function publishedMenuOrThrow(menus: Repo<RichMenuRow>, menuId: string): Promise<RichMenuRow> {
  const menu = await menus.findOne(menuId)
  if (menu === null) throw new MenuNotFoundError(`rich menu ${menuId} does not exist`)
  // ตั้ง default ให้เมนูที่ยังไม่เคยขึ้น LINE ไม่ได้ — id ที่จะส่งไปยังไม่มีอยู่จริง
  if (menu.status !== 'published' || menu.lineRichMenuId === null) {
    throw new MenuNotReadyError('not_published')
  }
  return menu
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
