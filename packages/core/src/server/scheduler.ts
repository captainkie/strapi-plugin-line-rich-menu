import type { LineClient } from '../line/client.js'
import { errorCodeOf } from './audit.js'
import type { AuditWriter } from './audit.js'
import { MenuNotFoundError } from './errors.js'
import type { ScheduleLock } from './lock.js'
import { linkMemberChunk, unlinkMemberChunk } from './members.js'
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
   * optional เพราะ v4/v5 wire เข้ามาคนละ task (Task 5/6) — ตัว scheduler เองต้องรองรับ
   * 'link-members'/'unlink-members' ตั้งแต่ task นี้ แต่ยัง "ไม่มีของจริงให้ใช้" จนกว่า adapter
   * จะต่อสาย ถ้าไม่ระบุแล้วงานสองชนิดนั้นเข้ามาพอดี ต้องโยน error ทันที ไม่ใช่ข้ามไปเงียบ ๆ
   * (ดูเหตุผลที่ run())
   */
  members?: Repo<MemberRow>
  /**
   * (Task 19 item 5) อ่าน `memberRichMenuId` ปัจจุบันของ channel — pointer ตัวเดียวที่บอกว่า
   * "ตอนนี้เมนูสมาชิกของ channel นี้คือตัวไหน" งาน `link-members` ถามค่านี้ก่อนทุกชุด เพื่อหยุด
   * เองเมื่อผู้ดูแลกดปิดระหว่างที่มันกำลังวิ่ง (ดูเหตุผลเต็มที่จุดเรียกใน `run()`)
   *
   * **required ไม่ใช่ optional** ต่างจาก `members` ข้างบนที่เป็น optional ด้วยเหตุผลทางประวัติศาสตร์
   * (v4/v5 ต่อสายกันคนละ task) — adapter ตัวใหม่ที่ลืมต่อสายตัวนี้ต้องคอมไพล์ไม่ผ่านทันที ไม่ใช่
   * เงียบไปทั้งเส้นทางแล้วปล่อยให้งานที่ควรหยุดวิ่งต่อจนจบ ซึ่งเป็นแผลเป็น "ประกาศไว้แต่ไม่เคยต่อสาย"
   * ที่แบรนช์นี้เจอมาแล้วสี่ครั้ง
   *
   * คืนเฉพาะ pointer ไม่ใช่ `ChannelRow` ทั้งก้อน — scheduler ไม่มีเหตุผลต้องเห็น ciphertext ของ
   * token (การประกอบ client เป็นหน้าที่ของ `clientFor` ซึ่งแยกอยู่แล้ว)
   */
  memberRichMenuIdOf(channelId: string): Promise<string | null>
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

    /**
     * (Task 19 item 4) เรียกทุกจบ chunk ของงานที่วนหลายชุดในหนึ่ง `run()` — `false` แปลว่าแถวไม่ใช่
     * ของเราแล้ว (มีคนแย่งไปตอน TTL หมดก่อนที่ heartbeat ตัวแรกจะทัน) ซึ่งเป็นสภาพที่ไม่ควรเกิดขึ้น
     * อีกเลยเมื่อมี heartbeat แล้ว จึง log ระดับ warn ไว้ให้มีคนมาดู
     *
     * (review-19 M2) เดิมคอมเมนต์ตรงนี้อ้างว่า "ไม่ต้องหยุดงานกลางคัน เพราะ release ของเรามีเงื่อนไข
     * lockedBy = owner อยู่แล้ว จึงเขียนทับผลของเจ้าของใหม่ไม่ได้" — จริงกับ `release` เท่านั้น ไม่จริง
     * กับ `deps.schedules.update(row.id, { cursor })` ที่ทั้งสอง op เรียกก่อนตัวนี้ทุกชุด ซึ่งเป็น
     * plain update ไม่มีเงื่อนไข owner เลย ถ้าเดินหน้าต่อหลัง heartbeat คืน `false` งานจะเขียน cursor
     * ทับผลของเจ้าของใหม่ไปเรื่อย ๆ ทุกชุดที่เหลือ — คือ "cursor ถอยหลัง" ที่ item 4 ทั้งหมดถูกสร้างมา
     * เพื่อกำจัด ผู้เรียกจึงต้อง**หยุดลูปทันที**เมื่อค่าที่คืนมาเป็น `false` ไม่ใช่แค่ log แล้ววิ่งต่อ —
     * ฟังก์ชันนี้จึงคืน `boolean` ให้ผู้เรียกตัดสินใจ แทนที่จะกลืนผลไว้เองแล้วคืน `void`
     */
    const keepClaim = async (): Promise<boolean> => {
      if (await deps.lock.heartbeat(row.id, deps.owner)) return true
      deps.logger.warn(
        'line-rich-menu: lost the claim on a running schedule — another worker may be running it concurrently',
        { scheduleId: row.id, op: row.op, owner: deps.owner },
      )
      return false
    }

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

        // id ที่ LINE ออกให้ ไม่ใช่ id ของแถวเมนูในฐานข้อมูลเรา — เดิมตรงนี้ส่ง `row.richMenuId`
        // (ตัวเดียวกับที่ใช้ `menus.findOne` บรรทัดบน) ซึ่งพังสองชั้น: LINE ปฏิเสธ id ที่ตัวเอง
        // ไม่เคยออก และค่าเดียวกันนั้นถูกประทับลง `linkedRichMenuId` ของสมาชิกทุกคน ทำให้ฝั่ง
        // unlink ที่เลือกคนจาก `linkedRichMenuId = menu.lineRichMenuId` หาไม่เจอสักคน ของปลอมใน
        // เทสต์รับพารามิเตอร์นี้เป็น `_richMenuId` แล้วทิ้งทุกตัว บั๊กจึงอยู่รอดมาสามรอบรีวิว
        const lineRichMenuId = menu.lineRichMenuId
        // เมนูถูก unpublish หลังงานถูกตั้ง — ไม่มี id ให้ผูกใครได้ เหมือน case 'unlink-members'
        if (lineRichMenuId === null) return

        const chunkDeps: LinkMemberChunkDeps = {
          client: ops.client, members: membersRepo, now: deps.now, logger: deps.logger,
        }
        let cursor = row.cursor

        // (Task 19 item 7) งานผูกสมาชิกยกชุดคือปฏิบัติการที่แตะ LINE หนักที่สุดในผลิตภัณฑ์นี้ แต่เดิม
        // มันเป็น op เดียวในห้าตัวที่ไม่เขียนแถว audit เลยสักแถว ไม่ว่าจะสำเร็จหรือล้ม — ผลคือบั๊กของ
        // กลไก enrolment ทุกตัว (cursor ค้าง, แถวหาย, claim ซ้อน, deactivate ไม่หยุดงาน) มองไม่เห็น
        // จากภายนอกโดยสิ้นเชิง ห่อด้วย `audit.around` แบบเดียวกับ 'unlink-members' ข้างล่างเป๊ะ ๆ
        //
        // `complete` คือสิ่งที่ทำให้ enrolment ที่ทำได้ครึ่งเดียวแยกออกจาก enrolment ที่จบครบได้ใน
        // แถวเดียว — ตัวเลขคนอย่างเดียวตอบไม่ได้ว่า "7,000 คน" คือทั้งหมดที่มีอยู่หรือแค่ที่ทำทัน
        await deps.ops.audit.around(
          {
            actorId,
            action: 'link-members',
            // id ฝั่ง LINE ไม่ใช่ id ของแถวเมนู — ธรรมเนียมของงานระดับสมาชิก (ดู AuditRow.richMenuId)
            richMenuId: lineRichMenuId,
            channelId: menu.channelId,
            before: null,
          },
          async () => {
            let linked = 0
            let vanished = 0
            // ไม่ครบ = ยังมีคนที่ยังไม่ได้เมนู ตั้งต้นเป็น "ครบ" แล้วให้ทางออกที่ผิดปกติเป็นคนคว่ำ
            let complete = true
            try {
              // วนทุก chunk ภายในติ๊กเดียว แต่เขียน cursor ลงแถว schedule "หลังจบแต่ละชุด" ไม่ใช่ตอนจบ
              // ลูป — ถ้า process ตายกลางทาง (เช่น ชุดที่สิบสองจากยี่สิบ) รอบถัดไปต้องอ่าน cursor ที่
              // ค้างไว้แล้วต่อจากตรงนั้น ถ้าย้ายการเขียนไปไว้หลังลูปจบ crash กลางทางจะทำให้ cursor ไม่ถูก
              // บันทึกเลย รอบถัดไปจึงเริ่มใหม่ตั้งแต่คนแรก ยิง bulkLink ซ้ำให้คนที่ทำไปแล้วโดยไม่มีที่ไหน
              // บันทึกไว้เลยว่าเคยส่งไปแล้ว — ไม่ใช่แค่ช้า แต่เป็นบั๊กที่ตรวจไม่ออกจนกว่าจะมีคนสังเกตว่าโดนส่งซ้ำ
              // (review-19 M3) เก็บ nextCursor ของชุดก่อนหน้าไว้เทียบ — `undefined` ตั้งต้นเพื่อไม่ให้
              // ชนกับ `null` ที่เป็นค่า nextCursor จริงได้ (ชุดสุดท้ายที่ได้แถวน้อยกว่าเพดาน) ดูเหตุผล
              // เต็มที่จุดเทียบด้านล่าง
              let previousCursor: string | null | undefined
              for (;;) {
                // (Task 19 item 5) ถามก่อน **ทุกชุด** ว่า channel ยังชี้มาที่เมนูนี้อยู่ไหม
                //
                // เปิดสวิตช์บน channel ที่มีสมาชิกหลักหมื่น คำขอ activate ค้างอยู่ระหว่างไล่ chunk
                // อีกแท็บกดปิด — งาน unlink ปลดคนที่ผูกไปแล้วออก แต่งาน link ที่ยังวิ่งอยู่เดินหน้า
                // ผูกคนที่เหลือต่อจาก cursor ของมันจนจบ ผลคือสมาชิกถือเมนูที่ channel ไม่ได้ชี้ไปแล้ว
                // และไม่มีงานไหนตามเก็บ เพราะงานปลดจบไปก่อนที่คนกลุ่มนั้นจะถูกผูก
                //
                // หนึ่ง read ต่อชุด บนงานที่ยิง LINE อยู่แล้วหนึ่งครั้งต่อชุด
                //
                // (review-19 M1) เดิมคอมเมนต์ตรงนี้อ้างว่านี่คือเช็คแบบเดียวที่ **ปิด** ช่องนี้จริง
                // ไม่ใช่ทำให้มันแคบลง — ไม่จริง: ระหว่างเช็คผ่านกับ `bulkLink` ของชุดเดียวกันยังมี
                // await boundary อยู่ ถ้า deactivate แทรกเข้ามาพอดีช่วงนั้น (ล้าง pointer → retire →
                // ตั้งงาน unlink-members → ระบายจนหมด) ชุดนี้จะผูกคนเพิ่มหลังการระบายเสร็จไปแล้วโดยไม่
                // มีงานไหนตามเก็บ — เช็คนี้แค่ทำให้หน้าต่างนั้นแคบลงเหลือชุดเดียว ตัวที่ปิดหน้าต่างนั้น
                // จริงคือการตั้งงาน unlink-members เพิ่มด้านล่าง (ทำตอนรู้ตัวว่า pointer ขยับแล้ว) —
                // เหลือมุมเดียวที่ยังไม่ปิด: ถ้าชุดที่แข่งกับ deactivate ดันเป็น**ชุดสุดท้ายพอดี**
                // (nextCursor เป็น null เอง จบงานตามปกติ ไม่ใช่เพราะ pointer ขยับ) ลูปจะไม่กลับมาเช็ค
                // pointer อีกเลยเพราะมันจบไปแล้ว — ไม่มีงาน unlink-members สำรองให้ตรงนั้น ยังต้องพึ่ง
                // การกดปิดซ้ำเหมือนก่อนแก้ (ดู task-19-report.md)
                if (await deps.ops.memberRichMenuIdOf(menu.channelId) !== lineRichMenuId) {
                  complete = false
                  deps.logger.info(
                    'line-rich-menu: link-members stopped early because the channel no longer points at this menu',
                    { scheduleId: row.id, richMenuId: lineRichMenuId, channelId: menu.channelId, linked },
                  )
                  // (review-19 M1) ตั้งงาน unlink-members อีกแถวไว้กวาดคนที่ชุดก่อนหน้านี้อาจผูกไป
                  // แล้ว**หลัง**ที่งานปลดของ deactivate ระบายจนหมด (ดูคอมเมนต์ข้างบน) — sweep ของ
                  // unlink-members เป็น idempotent และจบเองเมื่อไม่มีใครถือเมนูนี้แล้ว
                  // (`unlinkMemberChunk` คืนชุดว่าง) ตั้งซ้ำแม้ deactivate เคยตั้งไปแล้วรอบหนึ่งจึงไม่มี
                  // ต้นทุนเพิ่มนอกจากแถวหนึ่งที่จบด้วยชุดว่างทันทีถ้าไม่มีอะไรให้กวาดจริง
                  await deps.schedules.create({
                    richMenuId: menu.id, runAt: deps.now().toISOString(), op: 'unlink-members',
                    state: 'pending', lockedBy: null, lockedAt: null, lastError: null, cursor: null,
                  })
                  break
                }

                const result = await linkMemberChunk(chunkDeps, {
                  richMenuId: lineRichMenuId,
                  channelId: menu.channelId,
                  cursor,
                })
                if (result.processed === 0) break
                // (review-19 M3) มิเรอร์ guard "ชุดว่างไม่มีวันจริง" ของ 'unlink-members' ข้างล่าง —
                // ถ้า adapter ไหนทำ `idGreaterThan` หลุดจาก `mapFilters` ไปวันหนึ่ง `linkMemberChunk`
                // จะคืนสมาชิก 500 คนแรกซ้ำทุกชุด `nextCursor` ไม่ขยับเลย ลูปนี้จะไม่มีวันเจอทั้ง
                // "ชุดว่าง" และ `cursor === null` เอง — ก่อน item 4 claim จะหมดอายุในห้านาทีแล้วมีคน
                // (หรือ I3) มาเห็น ตอนนี้ heartbeat ต่ออายุให้ทุกชุด งานจึงถือ lock และยิง bulkLink
                // ซ้ำไม่รู้จบโดยไม่มีอะไรให้สังเกตจากภายนอกเลย — `idGreaterThan` pin ไว้แล้วทั้งสอง
                // adapter จึงเป็น defence-in-depth ไม่ใช่บั๊กที่ยังมีชีวิตอยู่
                if (result.nextCursor === previousCursor) {
                  throw new Error(
                    'line-rich-menu: link-members made no progress — members repo did not advance the cursor',
                  )
                }
                previousCursor = result.nextCursor
                linked += result.processed
                vanished += result.vanished
                cursor = result.nextCursor
                await deps.schedules.update(row.id, { cursor })
                // (Task 19 item 4) ต่ออายุ claim ทุกจบชุด — งานที่ยังมีชีวิตต้องถือ lock ของตัวเอง
                // ไว้ได้ ส่วนงานที่ process ตายไปแล้วต้องยังหมดอายุตามเดิม (heartbeat หยุดไปเอง
                // พร้อมกับ process) ถ้าไม่ต่ออายุ tick นาทีถัดไปจะ claim แถวเดิมซ้ำแล้ววิ่งซ้อนกับ
                // ตัวเอง — cursor ถอยหลังได้ และตัวหนึ่งจบแล้วปล่อย lock ขณะที่อีกตัวยังวิ่งอยู่
                //
                // (review-19 M2) `false` แปลว่าแถวนี้ไม่ใช่ของเราแล้ว (อีก worker แย่งไปตอน TTL หมด
                // ก่อน heartbeat รอบนี้จะทัน) — ต้องหยุดที่นี่ ไม่ใช่วนต่อแล้วเขียน cursor ทับผลของ
                // เจ้าของใหม่ไปเรื่อย ๆ ทุกชุดที่เหลือ (`schedules.update` สองบรรทัดข้างบนเป็น plain
                // update ไม่มีเงื่อนไข owner ต่างจาก `release`) `complete` เป็น `false` ด้วยเหตุผล
                // เดียวกับตอน pointer ขยับ: เรายังไม่รู้ว่าเจ้าของใหม่จะทำงานนี้ต่อจนจบไหม แถว audit
                // ของ**ความพยายามครั้งนี้**จึงต้องไม่บอกว่าครบ
                if (!await keepClaim()) { complete = false; break }
                if (cursor === null) break
              }
            } catch (error) {
              // แถว failure ของ `around` รับ `after` มาจาก `auditAfter` บนตัว error เท่านั้น (ดู
              // audit.ts:auditAfterOf) — ไม่ติดไว้ตรงนี้ แถวที่ล้มจะบอกได้แค่ error code ส่วนคำถามที่
              // สำคัญกว่าหลังเกิดเหตุ ("ผูกไปได้กี่คนก่อนล้ม คนที่เหลือยังไม่ได้เมนู") ไม่มีคำตอบอยู่ที่ไหนเลย
              if (error !== null && typeof error === 'object') {
                Object.assign(error, { auditAfter: { linked, vanished, complete: false } })
              }
              throw error
            }
            return { linked, vanished, complete }
          },
          (value) => value,
        )
        return
      }
      case 'unlink-members': {
        const membersRepo = deps.ops.members
        if (membersRepo === undefined) {
          throw new Error(
            'line-rich-menu: schedule op "unlink-members" requires ops.members — adapter did not wire it in',
          )
        }

        // เมนูที่ยังไม่เคยขึ้น LINE ไม่มีทางมีใครถืออยู่ — ไม่ใช่ความผิดพลาด แค่ไม่มีงานให้ทำ
        // (เมนูถูก unpublish ไปก่อนที่งานจะได้วิ่ง เป็นทางที่เกิดขึ้นได้จริง)
        const lineRichMenuId = menu.lineRichMenuId
        if (lineRichMenuId === null) return

        // ไม่เขียนอะไรลงแถว schedule ระหว่างวนเลย ต่างจาก 'link-members' ข้างบน — ไม่มี cursor
        // ให้เขียน และไม่ควรมี (เหตุผลเต็มอยู่ที่ `unlinkMemberChunk` ใน members.ts)
        await deps.ops.audit.around(
          {
            actorId,
            action: 'unlink-members',
            // id ฝั่ง LINE ไม่ใช่ id ของแถวเมนู — ธรรมเนียมของงานระดับสมาชิก (ดู AuditRow.richMenuId)
            richMenuId: lineRichMenuId,
            channelId: menu.channelId,
            before: null,
          },
          async () => {
            let processed = 0
            let previousLastId: string | null = null
            for (;;) {
              const result = await unlinkMemberChunk(
                { client: ops.client, members: membersRepo, logger: deps.logger },
                { richMenuId: lineRichMenuId, channelId: menu.channelId },
              )
              if (result.processed === 0) return processed
              // ชุดเดิมซ้ำแปลว่าแถวไม่เคยหลุดจาก query ที่หามันเจอ (repo แม็ป filter หรือ update
              // ผิดคอลัมน์) เงื่อนไข "ชุดว่าง" จะไม่มีวันจริง — ปล่อยไว้คือ tick ค้างทั้ง process
              // โดยไม่มี error ให้ใครเห็น ยอมให้งานล้มพร้อมเหตุผลดีกว่าค้างเงียบ ๆ
              if (result.lastId === previousLastId) {
                throw new Error(
                  'line-rich-menu: unlink-members made no progress — members repo did not clear linkedRichMenuId',
                )
              }
              previousLastId = result.lastId
              processed += result.processed
              // งานปลดก็วนหลายชุดในหนึ่ง run() เหมือนกัน จึงหมดอายุ claim ระหว่างทางได้เหมือนกันเป๊ะ
              //
              // (review-19 M2) `false` แปลว่าแถวนี้ไม่ใช่ของเราแล้ว — หยุดที่นี่แล้วคืนจำนวนที่ปลด
              // ไปได้จริง ไม่ใช่วนต่อ ที่นี่ไม่มี write ที่ไม่ owner-guard ให้ห่วงเหมือนฝั่ง link
              // ('unlink-members' ไม่เขียน cursor เลย) แต่ยิง bulkUnlink/`members.update` ต่อไปเรื่อย ๆ
              // ขณะที่อีก worker อาจกำลังทำแถวเดียวกันอยู่พร้อมกันก็ไม่ใช่พฤติกรรมที่ควรปล่อยให้เกิด
              if (!await keepClaim()) return processed
            }
          },
          (processed) => ({ unlinked: processed }),
        )
        return
      }
    }
  }
}
