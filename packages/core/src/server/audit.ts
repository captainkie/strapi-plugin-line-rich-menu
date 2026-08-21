import { scrub, type LoggerLike } from './scrub.js'
import type { AuditAction, AuditResult, AuditRow, Repo } from './types.js'

export interface AuditEntry {
  actorId: string | null
  action: AuditAction
  richMenuId: string | null
  channelId: string
  before?: unknown
  after?: unknown
  result: AuditResult
  errorCode?: string | null
}

export type AuditContext = Omit<AuditEntry, 'result' | 'after' | 'errorCode'>

export interface AuditWriter {
  write(entry: AuditEntry): Promise<void>
  /**
   * ห่องานหนึ่งชิ้นให้มีแถว audit เสมอ ไม่ว่าจะจบทางไหน
   * รูปแบบ `try { ...; await audit() }` ข้าม audit ทุกครั้งที่โยน ซึ่งเป็นเคสที่ §11.5
   * ต้องการมากที่สุด — "ใครกด publish แล้วพัง" มีค่าพอ ๆ กับ "ใครกด publish แล้วสำเร็จ"
   */
  around<T>(context: AuditContext, run: () => Promise<T>, describeAfter?: (value: T) => unknown): Promise<T>
}

export function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && code.length > 0 ? code : 'unknown_error'
}

export function createAuditWriter(deps: { repo: Repo<AuditRow>; logger: LoggerLike }): AuditWriter {
  const { repo, logger } = deps

  async function persist(entry: AuditEntry): Promise<void> {
    await repo.create({
      actorId: entry.actorId,
      action: entry.action,
      richMenuId: entry.richMenuId,
      channelId: entry.channelId,
      before: scrub(entry.before ?? null),
      after: scrub(entry.after ?? null),
      result: entry.result,
      errorCode: entry.errorCode ?? null,
    })
  }

  /**
   * audit ที่เขียนไม่ลงต้องไม่กลายเป็น error ที่ผู้ใช้เห็นแทน error จริง
   * ถ้า publish ล้มเพราะ token หมดอายุ แล้ว audit ล้มตามเพราะตารางหาย ผู้ใช้ต้องเห็นข้อแรก
   * แถวที่หายไปถูกบันทึกไว้ที่ logger แทน — ผู้ตรวจจึงยังเห็นว่ามีช่องโหว่ตรงไหน
   *
   * FLAG สำหรับผู้รีวิว: อีกทางที่เถียงได้คือ "publish ที่ audit ไม่ได้ ต้องถือว่าล้ม"
   * เลือกทางนี้เพราะการกลบ error ต้นทางทำให้ debug ไม่ได้เลย และ LINE ก็ถูกแตะไปแล้วจริง ๆ
   */
  async function persistQuietly(entry: AuditEntry): Promise<void> {
    try {
      await persist(entry)
    } catch (error) {
      logger.error('line-rich-menu: failed to write audit row', { entry: scrub(entry), error })
    }
  }

  return {
    write: persistQuietly,

    async around(context, run, describeAfter) {
      let value: Awaited<ReturnType<typeof run>>
      try {
        value = await run()
      } catch (error) {
        await persistQuietly({ ...context, result: 'failure', after: null, errorCode: errorCodeOf(error) })
        throw error
      }
      await persistQuietly({
        ...context,
        result: 'success',
        after: describeAfter === undefined ? null : describeAfter(value),
        errorCode: null,
      })
      return value
    },
  }
}
