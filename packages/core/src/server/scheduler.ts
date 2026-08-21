import { errorCodeOf } from './audit.js'
import { MenuNotFoundError } from './errors.js'
import type { ScheduleLock } from './lock.js'
import { clearChannelDefault, setMenuAsDefault, swapMenuAlias, type MenuOpsDeps } from './menu-ops.js'
import type { LoggerLike } from './scrub.js'
import type { Repo, ScheduleRow } from './types.js'

export interface TickReport {
  due: number
  claimed: number
  done: number
  failed: number
}

export interface SchedulerDeps {
  schedules: Repo<ScheduleRow>
  lock: ScheduleLock
  ops: MenuOpsDeps
  logger: LoggerLike
  now(): Date
  /** ตัวระบุ process ที่จะถูกเขียนลง `lockedBy` — v4 adapter ใช้ `${hostname}:${pid}` */
  owner: string
  batchSize?: number
}

export function createScheduler(deps: SchedulerDeps): { tick(): Promise<TickReport> } {
  const batchSize = deps.batchSize ?? 25

  return {
    async tick(): Promise<TickReport> {
      const at = deps.now().getTime()

      // ดึงทั้ง pending และ running — `running` ที่ค้างจาก worker ที่ตายไปแล้วต้องถูกหยิบซ้ำได้
      // ตัวที่ตัดสินว่าหยิบได้จริงไหมคือเงื่อนไข lock หมดอายุใน `lock.claim` ไม่ใช่ตรงนี้
      // (`ListParams.filters` เทียบเท่ากับอย่างเดียว จึงต้องยิงสองครั้งแล้วรวม ไม่ใช่ IN)
      const candidates = [
        ...await deps.schedules.findMany({ filters: { state: 'pending' } }),
        ...await deps.schedules.findMany({ filters: { state: 'running' } }),
      ]

      const due = candidates
        .filter((row) => Date.parse(row.runAt) <= at)
        .sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt))
        .slice(0, batchSize)

      const report: TickReport = { due: due.length, claimed: 0, done: 0, failed: 0 }

      for (const row of due) {
        if (!await deps.lock.claim(row.id, deps.owner)) continue
        report.claimed += 1

        try {
          await run(row)
          report.done += 1
          await deps.lock.release(row.id, deps.owner, 'done', null)
        } catch (error) {
          report.failed += 1
          // งานหนึ่งที่ล้มต้องไม่หยุดรอบทั้งรอบ — ไม่งั้นตารางเวลาของเมนูอื่นพังตามไปด้วย
          deps.logger.error('line-rich-menu: scheduled operation failed', { scheduleId: row.id, error })
          await deps.lock.release(row.id, deps.owner, 'failed', errorCodeOf(error))
        }
      }

      return report
    },
  }

  async function run(row: ScheduleRow): Promise<void> {
    // cron ไม่มีผู้ใช้ที่กดปุ่ม — actor เป็น null และ content type ต้องยอมให้ null ได้ (Task 14)
    const actorId = null

    switch (row.op) {
      case 'set-default':
        await setMenuAsDefault(deps.ops, { menuId: row.richMenuId, actorId })
        return
      case 'swap-alias':
        await swapMenuAlias(deps.ops, { menuId: row.richMenuId, actorId })
        return
      case 'clear-default': {
        // clear-default เป็น op ระดับ channel แต่ schedule ผูกกับเมนู — ต้องหา channel จากเมนูนั้น
        const menu = await deps.ops.menus.findOne(row.richMenuId)
        if (menu === null) throw new MenuNotFoundError(`rich menu ${row.richMenuId} does not exist`)
        await clearChannelDefault(deps.ops, { channelId: menu.channelId, actorId })
        return
      }
    }
  }
}
