import {
  ValidationError, imageFingerprint, prepareImage,
  type Repo, type RichMenuRow, type ScheduleRow,
} from '@fosivo/line-rich-menu-core'
import type { Services } from './container.js'
import type { MenuInput } from './validation.js'

function sourceOf(row: Pick<RichMenuRow, 'size' | 'imageFileId' | 'areaImages' | 'areas'>) {
  return {
    sizeName: row.size,
    imageFileId: row.imageFileId,
    areaImages: row.areaImages,
    areas: row.areas,
  }
}

/**
 * alias ต้องไม่ซ้ำ **ภายใน channel เดียวกัน** (สเปก §7.1) ซึ่ง Strapi 4 ประกาศเป็น
 * composite unique ที่ระดับ schema ไม่ได้ — ข้อบังคับจึงอยู่ตรงนี้ และใช้ ValidationError
 * ที่มี `path` เพื่อให้ฟอร์มชี้ลงช่อง aliasId ได้ตรง ๆ
 */
async function assertAliasFree(services: Services, input: MenuInput, exceptId: string | null): Promise<void> {
  if (input.aliasId === null) return
  const siblings = await services.menus.findMany({ filters: { channelId: input.channelId } })
  if (siblings.some((row) => row.aliasId === input.aliasId && row.id !== exceptId)) {
    throw new ValidationError('aliasId is already used in this channel', [
      { path: 'aliasId', code: 'alias_id_taken', message: 'aliasId is already used in this channel' },
    ])
  }
}

/** ช่วงเวลาแสดงผลตามที่ฟอร์มเห็น (สเปก §5.7) — ทั้งสองค่าเป็น ISO string หรือ null */
export interface DisplayPeriod {
  startAt: string | null
  endAt: string | null
}

/**
 * ช่วงเวลาแสดงผลในฟอร์ม (สเปก §5.7) ถูกเก็บเป็นแถว schedule ไม่ใช่คอลัมน์บนเมนู —
 * `startAt` คือ `set-default` และ `endAt` คือ `clear-default` ทำให้ §10 กับหน้าจอเป็นเรื่องเดียวกัน
 * แทนที่ของเดิมทั้งหมดทุกครั้งที่ save เพื่อไม่ให้เหลือคิวจากค่าที่ผู้ใช้แก้ทิ้งไปแล้ว
 *
 * รับ `Repo<ScheduleRow>` ไม่ใช่ `Services` ทั้งก้อน เพราะสองฟังก์ชันนี้เป็นคู่ round trip
 * ที่เทสต์ของ repo (`tests/repo.test.ts`) เรียกตรง ๆ กับ repo ที่ประกอบจาก strapi ปลอม —
 * เดิมเทสต์นั้นถือสำเนาของตัวเองไว้ จึงพิสูจน์ได้แค่ fixture ของมันเอง ไม่ใช่ของจริง
 */
export async function writeDisplayPeriod(
  schedules: Repo<ScheduleRow>,
  menuId: string,
  period: DisplayPeriod,
): Promise<void> {
  const existing = await schedules.findMany({ filters: { richMenuId: menuId, state: 'pending' } })
  await Promise.all(existing.map((row) => schedules.delete(row.id)))

  if (period.startAt !== null) {
    await schedules.create({ richMenuId: menuId, runAt: period.startAt, op: 'set-default', state: 'pending' })
  }
  if (period.endAt !== null) {
    await schedules.create({ richMenuId: menuId, runAt: period.endAt, op: 'clear-default', state: 'pending' })
  }
}

/** ขาอ่านของ `writeDisplayPeriod` — แถวที่ไม่มีต้องอ่านกลับมาเป็น `null` ไม่ใช่ `undefined` */
export async function readDisplayPeriod(
  schedules: Repo<ScheduleRow>,
  menuId: string,
): Promise<DisplayPeriod> {
  const rows = await schedules.findMany({ filters: { richMenuId: menuId, state: 'pending' } })
  return {
    startAt: rows.find((row) => row.op === 'set-default')?.runAt ?? null,
    endAt: rows.find((row) => row.op === 'clear-default')?.runAt ?? null,
  }
}

export async function saveMenu(
  services: Services,
  input: MenuInput,
  existing: RichMenuRow | null,
  // อยู่ในลายเซ็นแต่ยังไม่ถูกใช้ — การ save draft ไม่เขียน audit (สเปก §11.5 นับเฉพาะสิ่งที่แตะ LINE)
  // แต่พารามิเตอร์ต้องอยู่ เพราะ controller ทุกตัวส่ง actor เข้ามาแล้ว และ Task ถัดไปที่เพิ่ม
  // audit ของ draft จะได้ไม่ต้องไล่แก้ call site ทั้งหมด
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _actorId: string | null,
): Promise<RichMenuRow> {
  // Task 20 item 4 (strapi-v5 M2) — ยืนยันว่า channel มีอยู่จริง**ก่อน**ให้ `documents().create`/
  // `update` เขียนความสัมพันธ์ `channel: { set: [channelId] }` เอง ถ้าไม่เช็คตรงนี้ ปลายทาง
  // (transformDataIdsVisitor ของ Strapi 5) จะโยน `@strapi/utils` ValidationError ดิบที่ไม่มี `code`
  // เข้ามาที่นี่ — `toHttpError` (ดูคอมเมนต์ที่นั่น) จับ error ที่ไม่มี code ไม่ได้เลยแม้จะเป็นเคส
  // "ผู้ใช้ส่งของผิด" ล้วน ๆ (channelId ที่ไม่มีอยู่จริง ไม่ใช่เซิร์ฟเวอร์พัง) กลายเป็น 500
  // `internal_error` ผู้เรียกแยกไม่ออกว่าตัวเองผิดหรือเซิร์ฟเวอร์พัง `channels.findOne` โยน
  // `ChannelNotFoundError` (`code: 'channel_not_found'`) อยู่แล้วซึ่ง `STATUS_BY_CODE` แม็ปเป็น 404
  // ให้เอง ไม่ต้องเพิ่ม code ใหม่ — ผลลัพธ์ (channel record) ไม่ถูกใช้ต่อ เช็คแค่ว่ามีอยู่จริง
  await services.channels.findOne(input.channelId)

  await assertAliasFree(services, input, existing?.id ?? null)

  const patch: Partial<RichMenuRow> = {
    name: input.name,
    channelId: input.channelId,
    size: input.size,
    chatBarText: input.chatBarText,
    chatBarMode: input.chatBarMode,
    selected: input.selected,
    templateKey: input.templateKey,
    areas: input.areas,
    imageFileId: input.imageFileId,
    areaImages: input.areaImages,
    aliasId: input.aliasId,
  }

  const saved = existing === null
    ? await services.menus.create({ ...patch, status: 'draft' })
    : await services.menus.update(existing.id, patch)

  // normalize เกิดตรงนี้ ไม่ใช่ตอน publish (design notes ข้อ 3) และเกิดเฉพาะตอนที่สิ่งที่
  // ทำให้ผลของมันเปลี่ยนจริง ๆ เปลี่ยน — แก้ข้อความปุ่มไม่ควรทำให้ต้องบีบรูปใหม่ห้าวินาที
  const changed = existing === null
    || existing.normalizedFileId === null
    || imageFingerprint(sourceOf(existing)) !== imageFingerprint(sourceOf(saved))

  let result = saved
  if (changed) {
    if (saved.imageFileId !== null || saved.areaImages.length > 0) {
      const prepared = await prepareImage({ store: services.store }, sourceOf(saved), saved.id)
      result = await services.menus.update(saved.id, prepared)
    } else {
      // (I5) ผู้ใช้เพิ่งลบรูปทิ้ง (`changed` เป็น true เพราะ fingerprint รวม imageFileId ด้วย) แต่ไม่มี
      // แหล่งรูปเหลือให้ normalize เลย — ผลลัพธ์ normalize เดิมต้องถูกล้างไปด้วย ไม่ใช่ค้างไว้เฉย ๆ
      // ไม่งั้น publish จะยังส่งรูปที่ผู้ใช้เพิ่งลบไป และ `no_image` guard ใน publish.ts ก็ไม่มีทาง
      // ทำงานเพราะ normalizedFileId ยังไม่ใช่ null
      result = await services.menus.update(saved.id, {
        normalizedFileId: null, normalizedMime: null, normalizedSize: null,
      })
    }
  }

  await writeDisplayPeriod(services.schedules, saved.id, input)
  return result
}
