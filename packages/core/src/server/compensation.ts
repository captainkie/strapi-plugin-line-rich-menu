import type { Step } from '../publish/machine.js'
import type { LoggerLike } from './scrub.js'

export interface PriorState {
  /** เมนูที่เป็น default ของ channel อยู่ก่อนหน้า — `null` = ยังไม่เคยตั้ง */
  defaultRichMenuId: string | null
  /** ปลายทางของ alias ก่อนหน้า — `null` = alias นี้ยังไม่เคยมี */
  aliasTarget: string | null
}

export interface LineReader {
  getDefault(): Promise<string | null>
  getAlias(aliasId: string): Promise<string | null>
}

export interface LineRestorer {
  setDefault(richMenuId: string): Promise<void>
  clearDefault(): Promise<void>
  updateAlias(aliasId: string, richMenuId: string): Promise<void>
  deleteAlias(aliasId: string): Promise<void>
}

/**
 * อ่านเฉพาะสิ่งที่กำลังจะไปแตะ — ไม่ใช่ทุกอย่างเสมอ
 * การเรียก `getDefault()` ทุกครั้งที่ publish ทั้งที่ไม่ได้จะตั้ง default คือหนึ่ง round trip
 * ต่อการ publish ที่ไม่ได้ใช้ และเป็นอีกหนึ่งจุดที่ล้มได้โดยไม่มีเหตุผล
 */
export async function capturePriorState(
  client: LineReader,
  input: { aliasId: string | null; willSetDefault: boolean },
): Promise<PriorState> {
  return {
    defaultRichMenuId: input.willSetDefault ? await client.getDefault() : null,
    aliasTarget: input.aliasId === null ? null : await client.getAlias(input.aliasId),
  }
}

/**
 * คืนสถานะให้ตรงกับที่ `capturePriorState` อ่านไว้ ก่อนที่ผู้เรียกจะลบเมนูที่เพิ่งสร้าง
 *
 * ทำไมไม่แก้ด้วยการสลับลำดับขั้นแทน: ถ้าเลื่อน `upsertAlias` ไปท้ายสุด `setDefault` จะกลายเป็น
 * ขั้นที่สำเร็จก่อนแล้วมีขั้นหลังล้ม → LINE เหลือ default ที่ชี้เมนูที่กำลังจะถูกลบ ซึ่งแย่กว่า
 * alias ค้าง เพราะผู้ใช้ปลายทางเห็นผลทันที
 *
 * แต่ละขั้นถูกห่อ try/catch แยกกัน — การคืน default ที่ล้มต้องไม่ทำให้ alias ไม่ถูกคืนตามไปด้วย
 * และไม่ว่ากรณีใด error ของการคืนค่าต้องไม่กลบ error จริงที่ทำให้ต้องมาคืนค่าตั้งแต่แรก
 */
export async function restorePriorState(
  client: LineRestorer,
  prior: PriorState,
  input: { aliasId: string | null; completed: readonly Step[] },
  logger: LoggerLike,
): Promise<void> {
  const did = (kind: Step['kind']) => input.completed.some((step) => step.kind === kind)

  async function attempt(what: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
    } catch (error) {
      logger.error(`line-rich-menu: failed to restore ${what} during compensation`, { error })
    }
  }

  if (did('setDefault')) {
    await attempt('default rich menu', async () => {
      if (prior.defaultRichMenuId === null) await client.clearDefault()
      else await client.setDefault(prior.defaultRichMenuId)
    })
  }

  if (did('upsertAlias') && input.aliasId !== null) {
    const aliasId = input.aliasId
    await attempt(`alias ${aliasId}`, async () => {
      if (prior.aliasTarget === null) await client.deleteAlias(aliasId)
      else await client.updateAlias(aliasId, prior.aliasTarget)
    })
  }
}
