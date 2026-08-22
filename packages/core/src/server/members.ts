import type { LineClient } from '../line/client.js'
import { MAX_BULK_USER_IDS } from '../line/client.js'
import type { Repo } from './types.js'

export interface MemberRow {
  id: string
  channelId: string
  lineUserId: string
  displayName: string | null
  linkedRichMenuId: string | null
  linkedAt: string | null
}

/**
 * LINE user id: `U` ตามด้วย hex ตัวพิมพ์เล็ก 32 ตัว — LINE ไม่เคยออก id ตัวพิมพ์ใหญ่
 * ใช้คัดกรองข้อมูลนำเข้า (เช่น import CSV ในงานถัดไป) ก่อนที่ค่าผิดรูปแบบจะเดินทางไปถึง
 * bulkLink แล้วโดน LINE ปฏิเสธทั้งชุดโดยไม่บอกว่า id ไหนคือตัวที่ผิด
 */
const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/

export function isLineUserId(value: string): boolean {
  return LINE_USER_ID_PATTERN.test(value)
}

export interface LinkMemberChunkDeps {
  client: Pick<LineClient, 'bulkLink'>
  members: Repo<MemberRow>
  now(): Date
}

export interface LinkMemberChunkInput {
  richMenuId: string
  channelId: string
  /** id ของสมาชิกคนสุดท้ายที่ทำไปแล้ว หรือ `null` เมื่อเริ่ม pass แรกของ channel นี้ */
  cursor: string | null
}

export interface LinkMemberChunkResult {
  processed: number
  nextCursor: string | null
}

/**
 * เพจแบบ keyset (`id > cursor`) ไม่ใช่ offset — หัวใจของฟังก์ชันนี้ ห้ามเปลี่ยนโดยไม่คิดใหม่ทั้งหมด
 *
 * ถ้าใช้ offset (`start: n`) แล้วมีคนถูกลบออกจากรายชื่อระหว่างงานวิ่งอยู่ (เช่น unfollow บอท)
 * แถวทุกแถวหลังจากตำแหน่งที่ลบจะเลื่อนขึ้นหนึ่งตำแหน่งทันที รอบถัดไปที่ขอ "เริ่มที่ offset เดิม"
 * จะข้ามสมาชิกคนที่เลื่อนเข้ามาแทนที่ไปเงียบ ๆ — ไม่มี error ไม่มี log ไม่มีอะไรบันทึกไว้เลยว่า
 * คนคนนั้นไม่เคยได้เมนู keyset ไม่มีปัญหานี้เพราะ "แถวที่ id นี้" ไม่ขยับที่ไม่ว่าแถวอื่นจะหายไปกี่แถว
 */
export async function linkMemberChunk(
  deps: LinkMemberChunkDeps,
  input: LinkMemberChunkInput,
): Promise<LinkMemberChunkResult> {
  const rows = await deps.members.findMany({
    filters: { channelId: input.channelId },
    ...(input.cursor === null ? {} : { idGreaterThan: input.cursor }),
    sort: 'id:asc',
    limit: MAX_BULK_USER_IDS,
  })

  if (rows.length === 0) return { processed: 0, nextCursor: null }

  // ยิงครั้งเดียวทั้งชุด — bulkLink เองปฏิเสธถ้าเกิน MAX_BULK_USER_IDS อยู่แล้ว (Task 1)
  // ที่นี่แค่ไม่ส่งเกินเพดานตั้งแต่ต้นด้วย limit ข้างบน ไม่ได้พึ่งการเช็คซ้ำ
  await deps.client.bulkLink(input.richMenuId, rows.map((row) => row.lineUserId))

  const linkedAt = deps.now().toISOString()
  for (const row of rows) {
    await deps.members.update(row.id, { linkedRichMenuId: input.richMenuId, linkedAt })
  }

  // ชุดที่ได้สั้นกว่าเพดาน แปลว่าไม่มีแถวเหลือให้หน้าถัดไปแล้ว — ไม่มีทางรู้ "หมดจริงไหม" ด้วยวิธีอื่น
  // เพราะ repo ไม่มี count แยกให้เทียบ นี่คือสัญญาณเดียวที่มีอยู่แล้วโดยไม่ต้อง query เพิ่ม
  const last = rows[rows.length - 1]!
  const nextCursor = rows.length < MAX_BULK_USER_IDS ? null : last.id
  return { processed: rows.length, nextCursor }
}
