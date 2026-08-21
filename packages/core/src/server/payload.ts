import { validateRichMenu } from '../schema.js'
import { sizeNameFor } from '../templates.js'
import type { Bounds, RichMenuPayload, RichMenuSize } from '../types.js'
import { AliasNotPublishedError, MenuNotReadyError } from './errors.js'
import { canvasFor } from './images.js'
import type { RichMenuRow } from './types.js'

/**
 * `chatBarText` เป็นฟิลด์บังคับของ LINE เสมอ ส่วนโหมด default (สเปก §5.5) แปลว่า
 * "ผู้ใช้ไม่อยากตั้งเอง ให้ระบบเติมให้" — ค่าที่เติมจึงต้องไม่ขึ้นกับภาษาของ admin ที่กด save
 * ไม่งั้นเมนูเดียวกันจะได้แถบแชทคนละคำขึ้นกับว่าใครกด publish
 */
export const DEFAULT_CHAT_BAR_TEXT = 'Menu'

export function resolveChatBarText(menu: Pick<RichMenuRow, 'chatBarMode' | 'chatBarText'>): string {
  return menu.chatBarMode === 'custom' ? menu.chatBarText : DEFAULT_CHAT_BAR_TEXT
}

/**
 * `bounds` ถูกวาดบนผืนผ้าใบตามชื่อขนาด (`large` = 2500×1686) แต่ `normalize` มีสิทธิ์
 * ลดขั้นบันไดลงเมื่อบีบไม่ลง 1 MB ถ้าเอา `size` ใหม่ไปคู่กับ `bounds` เดิม ทุกช่องจะล้นกรอบ
 * และ `validateRichMenu` จะปฏิเสธทั้งเมนู — ซึ่งอ่านเหมือนบั๊กของผู้ใช้ทั้งที่เป็นของเรา
 *
 * `clamp` ด้านล่างไม่ใช่ของฟุ่มเฟือย — การปัดเศษขึ้นสองครั้ง (x และ width) ทำให้ผลรวม
 * เกินขอบได้หนึ่งพิกเซล ซึ่งพอที่จะถูกปฏิเสธจริง
 */
export function scaleBounds(bounds: Bounds, from: RichMenuSize, to: RichMenuSize): Bounds {
  if (from.width === to.width && from.height === to.height) return { ...bounds }

  const ratioX = to.width / from.width
  const ratioY = to.height / from.height
  const x = Math.round(bounds.x * ratioX)
  const y = Math.round(bounds.y * ratioY)
  return {
    x,
    y,
    width: Math.max(1, Math.min(Math.round(bounds.width * ratioX), to.width - x)),
    height: Math.max(1, Math.min(Math.round(bounds.height * ratioY), to.height - y)),
  }
}

/** สเปก §9 — alias ใช้ได้ก็ต่อเมื่อเมนูปลายทาง publish ไปแล้วจริงและมี id จาก LINE */
export function publishedAliasesOf(menus: readonly RichMenuRow[]): Set<string> {
  return new Set(
    menus
      .filter((m) => m.status === 'published' && m.aliasId !== null && m.lineRichMenuId !== null)
      .map((m) => m.aliasId!),
  )
}

export function buildPayload(menu: RichMenuRow, publishedAliases: ReadonlySet<string>): RichMenuPayload {
  if (menu.normalizedSize === null || menu.normalizedFileId === null) {
    throw new MenuNotReadyError('no_image')
  }
  if (menu.areas.length === 0) throw new MenuNotReadyError('no_areas')

  // แถวที่ `size` กับขั้นบันไดของรูปคนละตระกูลกันเกิดได้เมื่อผู้ใช้เปลี่ยน template ข้ามตระกูล
  // แล้ว save ล้มกลางทาง — ปล่อยผ่านแปลว่าเมนูบน LINE จะมีสัดส่วนไม่ตรงกับรูปที่อัปไป
  if (sizeNameFor(menu.normalizedSize) !== menu.size) throw new MenuNotReadyError('no_image')

  for (const area of menu.areas) {
    if (area.action.type === 'richmenuswitch' && !publishedAliases.has(area.action.richMenuAliasId)) {
      throw new AliasNotPublishedError(area.action.richMenuAliasId)
    }
  }

  const declared = canvasFor(menu.size)
  return validateRichMenu({
    size: menu.normalizedSize,
    selected: menu.selected,
    name: menu.name.slice(0, 300),
    chatBarText: resolveChatBarText(menu),
    areas: menu.areas.map((area) => ({
      bounds: scaleBounds(area.bounds, declared, menu.normalizedSize!),
      action: area.action,
    })),
  })
}
