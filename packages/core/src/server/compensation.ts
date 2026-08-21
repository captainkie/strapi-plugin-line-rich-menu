import { LineNotFoundError } from '../errors.js'
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
 * ผลของการคืนสถานะ — ผู้เรียกต้องรู้ว่า "คืนไม่สำเร็จ" ก่อนตัดสินใจลบเมนูที่เพิ่งสร้าง
 *
 * `true` หมายรวมถึง "ไม่มีอะไรต้องคืน" ด้วย — ขั้นที่ไม่เคยถูกแตะย่อมไม่ต้องถูกคืน
 */
export interface RestoreOutcome {
  defaultRestored: boolean
  aliasRestored: boolean
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
 *
 * แต่ "กลืน error ไว้" ต้องไม่แปลว่า "ผู้เรียกไม่รู้" — เดิมฟังก์ชันนี้คืน `void` ผู้เรียกจึงลบเมนู
 * ที่เพิ่งสร้างทิ้งเสมอโดยไม่มีทางรู้ว่าการคืน default เพิ่งล้มไป เคสที่น่าจะเกิดที่สุด (ไม่ใช่เคสพิสดาร)
 * คือ `deleteOld` ล้มด้วย 500 แล้ว `setDefault` ของการคืนค่าล้มด้วยเหตุผลเดียวกัน จากนั้นเมนูใหม่
 * ถูกลบสำเร็จ → default บน LINE ชี้เมนูที่ไม่มีอยู่แล้ว และ end user ทุกคนเปิดแชทมาไม่เห็นเมนูเลย
 */
export async function restorePriorState(
  client: LineRestorer,
  prior: PriorState,
  /**
   * `attempted` คือขั้นที่ถูก *พยายาม* ไม่ใช่ขั้นที่ทำสำเร็จ — ขั้นที่ล้มหลัง LINE รับคำสั่งไปแล้ว
   * (socket ตายก่อนได้ response) ต้องถูกคืนค่าด้วย ดูเหตุผลเต็มที่ `publish.ts`
   */
  input: { aliasId: string | null; attempted: readonly Step[] },
  logger: LoggerLike,
): Promise<RestoreOutcome> {
  const did = (kind: Step['kind']) => input.attempted.some((step) => step.kind === kind)

  async function attempt(what: string, run: () => Promise<void>): Promise<boolean> {
    try {
      await run()
      return true
    } catch (error) {
      logger.error(`line-rich-menu: failed to restore ${what} during compensation`, { error })
      return false
    }
  }

  // ไม่มีอะไรต้องคืน = คืนสำเร็จ ผู้เรียกจึงตัดสินใจจากค่าเดียวได้โดยไม่ต้องรู้ว่าขั้นไหนถูกเดินบ้าง
  let defaultRestored = true
  let aliasRestored = true

  if (did('setDefault')) {
    defaultRestored = await attempt('default rich menu', async () => {
      if (prior.defaultRichMenuId === null) await client.clearDefault()
      else await client.setDefault(prior.defaultRichMenuId)
    })
  }

  if (did('upsertAlias') && input.aliasId !== null) {
    const aliasId = input.aliasId
    aliasRestored = await attempt(`alias ${aliasId}`, async () => {
      if (prior.aliasTarget === null) {
        // ปลายทางที่ต้องการคือ "alias นี้ไม่มีอยู่" — 404 แปลว่ามันไม่มีอยู่แล้ว ซึ่ง *คือ* ผลลัพธ์นั้น
        // ไม่ใช่ความล้มเหลว เคสนี้เกิดจริงตั้งแต่ compensation ไล่จากขั้นที่ถูก "พยายาม": `upsertAlias`
        // ที่ล้มก่อน alias จะถูกสร้างจะพามาถึงตรงนี้ทุกครั้ง และถ้านับว่าล้ม เมนูใหม่จะถูกปล่อยค้าง
        // ทุกครั้งที่ createAlias ล้ม (ดู `safeToDelete` ใน publish.ts)
        await client.deleteAlias(aliasId).catch((error: unknown) => {
          if (!(error instanceof LineNotFoundError)) throw error
        })
      } else {
        await client.updateAlias(aliasId, prior.aliasTarget)
      }
    })
  }

  return { defaultRestored, aliasRestored }
}
