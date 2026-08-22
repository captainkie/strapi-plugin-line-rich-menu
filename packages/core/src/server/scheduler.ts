import type { LineClient } from '../line/client.js'
import { errorCodeOf } from './audit.js'
import type { AuditWriter } from './audit.js'
import { MenuNotFoundError } from './errors.js'
import type { ScheduleLock } from './lock.js'
import { linkMemberChunk } from './members.js'
import type { LinkMemberChunkDeps, MemberRow } from './members.js'
import { clearChannelDefault, setMenuAsDefault, swapMenuAlias } from './menu-ops.js'
import type { LoggerLike } from './scrub.js'
import type { Repo, RichMenuRow, ScheduleRow } from './types.js'

export interface TickReport {
  due: number
  claimed: number
  done: number
  failed: number
}

/**
 * ต่างจาก `MenuOpsDeps` ตรงที่ไม่ถือ `client` ตัวเดียวไว้ล่วงหน้า — scheduler รันงานของหลาย
 * channel ปนกันในรอบเดียว จึงต้องได้ client **ของ channel ที่งานนั้นสังกัด** เป็นราย ๆ ไป
 * ตัว scheduler ไม่รู้ (และไม่ควรรู้) ว่า token ถูกเก็บ/ถอดรหัสอย่างไร adapter เป็นคนตอบให้
 */
export interface SchedulerOps {
  menus: Repo<RichMenuRow>
  audit: AuditWriter
  clientFor(channelId: string): Promise<LineClient>
  /**
   * optional เพราะ v4/v5 wire เข้ามาคนละ task (Task 5/6) — ตัว scheduler เองต้องรองรับ 'link-members'
   * ตั้งแต่ task นี้ แต่ยัง "ไม่มีของจริงให้ใช้" จนกว่า adapter จะต่อสาย ถ้าไม่ระบุแล้วงาน
   * 'link-members' เข้ามาพอดี ต้องโยน error ทันที ไม่ใช่ข้ามงานไปเงียบ ๆ (ดูเหตุผลที่ run())
   */
  members?: Repo<MemberRow>
}

export interface SchedulerDeps {
  schedules: Repo<ScheduleRow>
  lock: ScheduleLock
  ops: SchedulerOps
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

      // ประกอบ client ครั้งเดียวต่อ channel ต่อหนึ่งรอบ ไม่ใช่ครั้งเดียวต่อหนึ่งแถว — การประกอบ
      // หมายถึงถอดรหัส access token หนึ่งครั้ง งานสิบแถวของ channel เดียวกันจึงไม่ต้องถอดสิบครั้ง
      const clients = new Map<string, Promise<LineClient>>()
      const clientFor = (channelId: string): Promise<LineClient> => {
        const cached = clients.get(channelId)
        if (cached !== undefined) return cached
        const created = deps.ops.clientFor(channelId)
        clients.set(channelId, created)
        return created
      }

      for (const row of due) {
        if (!await deps.lock.claim(row.id, deps.owner)) continue
        report.claimed += 1

        try {
          await run(row, clientFor)
          report.done += 1
          await deps.lock.release(row.id, deps.owner, 'done', null)
        } catch (error) {
          report.failed += 1
          // งานหนึ่งที่ล้มต้องไม่หยุดรอบทั้งรอบ — ไม่งั้นตารางเวลาของเมนูอื่นพังตามไปด้วย
          deps.logger.error('line-rich-menu: scheduled operation failed', { scheduleId: row.id, error })
          await deps.lock.release(row.id, deps.owner, 'failed', errorCodeOf(error))
        }
      }

      // (I3) มีงานถึงเวลาแล้วแต่ claim ไม่ติดสักงานเดียว — สองคำอธิบายที่เป็นไปได้คือ worker อื่น
      // แย่ง lock ไปหมดพอดี (ชนกันจริง ไม่ใช่บั๊ก) กับ `claim` พังเงียบ ๆ ทุกครั้ง (ชื่อ/ค่าคอลัมน์ผิด
      // แล้ว UPDATE ไม่โดนแถวไหนเลยตลอดไป) ทั้งสองเคสแยกจากกันไม่ได้จากรายงานตัวเลขล้วน ๆ แต่ทั้งคู่
      // สมควรมีคนมาดู — ยิ่งเคสหลังอันตรายเพราะไม่มี error ให้เห็นเลย มีแต่ `{ due: N, claimed: 0 }`
      // เงียบ ๆ ทุกนาทีจนกว่าจะมีคนสังเกตว่าตารางเวลาไม่เคยรันสักงาน (ดูรายละเอียดที่ lock.ts)
      if (report.due > 0 && report.claimed === 0) {
        deps.logger.warn(
          'line-rich-menu: schedules are due but none could be claimed — total lock contention or a broken lock',
          report,
        )
      }

      return report
    },
  }

  async function run(
    row: ScheduleRow,
    clientFor: (channelId: string) => Promise<LineClient>,
  ): Promise<void> {
    // cron ไม่มีผู้ใช้ที่กดปุ่ม — actor เป็น null และ content type ต้องยอมให้ null ได้ (Task 14)
    const actorId = null

    // schedule ผูกกับเมนู และเมนูผูกกับ channel ของตัวเอง — channel ของงานนี้จึงอ่านจากเมนู
    // ไม่ใช่รับมาจากผู้เรียก ตารางเวลาไม่มีคอลัมน์ channel และไม่ควรมี: เมนูย้าย channel เมื่อไหร่
    // ค่าที่ denormalize ไว้จะค้างชี้ของเดิมทันที ส่วนการอ่านจากเมนูถูกเสมอตามนิยาม
    const menu = await deps.ops.menus.findOne(row.richMenuId)
    if (menu === null) throw new MenuNotFoundError(`rich menu ${row.richMenuId} does not exist`)

    const ops = {
      client: await clientFor(menu.channelId),
      menus: deps.ops.menus,
      audit: deps.ops.audit,
    }

    switch (row.op) {
      case 'set-default':
        await setMenuAsDefault(ops, { menuId: row.richMenuId, actorId })
        return
      case 'swap-alias':
        await swapMenuAlias(ops, { menuId: row.richMenuId, actorId })
        return
      case 'clear-default':
        // clear-default เป็น op ระดับ channel แต่ schedule ผูกกับเมนู — ใช้ channel ของเมนูนั้น
        await clearChannelDefault(ops, { channelId: menu.channelId, actorId })
        return
      case 'link-members': {
        // ตั้งใจไม่ narrow ผ่าน `deps.ops.members` ตรง ๆ — แยกเป็นตัวแปรท้องถิ่นก่อน เพื่อไม่ให้
        // TS ต้อง reason เรื่อง narrowing ข้าม `await` ด้านล่าง (property access ผ่าน object คนละที)
        const membersRepo = deps.ops.members
        if (membersRepo === undefined) {
          // แผลเป็นเดิมของไฟล์นี้คือ lock ที่พังเงียบ ๆ แล้วดูเหมือน "ไม่มีงานถึงเวลา" ทุกนาที
          // (ดูคอมเมนต์ I3 ท้าย tick()) กรณีนี้คือแผลแบบเดียวกันจากอีกทาง — adapter ที่ลืมต่อ
          // ops.members ต้องเห็น error ตั้งแต่งานแรก ไม่ใช่ tick เงียบ ๆ ไปเรื่อย ๆ โดยไม่มีใครถูกลิงก์
          throw new Error(
            'line-rich-menu: schedule op "link-members" requires ops.members — adapter did not wire it in',
          )
        }

        const chunkDeps: LinkMemberChunkDeps = { client: ops.client, members: membersRepo, now: deps.now }
        let cursor = row.cursor

        // วนทุก chunk ภายในติ๊กเดียว แต่เขียน cursor ลงแถว schedule "หลังจบทุกชุด" ไม่ใช่ตอนจบลูป —
        // ถ้า process ตายกลางทาง (เช่น ชุดที่สิบสองจากยี่สิบ) รอบถัดไปต้องอ่าน cursor ที่ค้างไว้แล้ว
        // ต่อจากตรงนั้น ถ้าย้ายการเขียนไปไว้หลังลูปจบ crash กลางทางจะทำให้ cursor ไม่ถูกบันทึกเลย
        // รอบถัดไปจึงเริ่มใหม่ตั้งแต่คนแรก ยิง bulkLink ซ้ำให้คนที่ทำไปแล้วโดยไม่มีที่ไหนบันทึกไว้เลย
        // ว่าเคยส่งไปแล้ว — ไม่ใช่แค่ช้า แต่เป็นบั๊กที่ตรวจไม่ออกจนกว่าจะมีคนสังเกตว่าโดนส่งซ้ำ
        for (;;) {
          const result = await linkMemberChunk(chunkDeps, {
            richMenuId: row.richMenuId,
            channelId: menu.channelId,
            cursor,
          })
          if (result.processed === 0) break
          cursor = result.nextCursor
          await deps.schedules.update(row.id, { cursor })
          if (cursor === null) break
        }
        return
      }
    }
  }
}
