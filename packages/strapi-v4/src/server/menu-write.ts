import {
  ValidationError, assertAudienceChangeAllowed, assertChannelChangeAllowed,
  assertDisplayPeriodAllowed, imageFingerprint, prepareImage,
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
/**
 * op ที่ "ช่วงเวลาแสดงผล" เป็นเจ้าของจริง ๆ — และเป็นชุดเดียวที่ `writeDisplayPeriod` ลบได้
 *
 * (Task 19 item 6) เดิมมันลบ **ทุกแถว pending** ของเมนูนั้น ซึ่งถูกต้องตอนที่ตารางนี้มีแค่สอง op
 * แต่แบรนช์นี้เพิ่ม `link-members`/`unlink-members` เข้ามาในตารางเดียวกันโดยไม่ได้แคบเงื่อนไขตาม
 * ผลคือการกด Save เมนูธรรมดา ๆ ลบงานผูก/ปลดสมาชิกของตัวเองทิ้งเงียบ ๆ: สวิตช์ยังอ่านว่าเปิด
 * (`memberRichMenuId` ไม่ถูกแตะ) แต่ไม่มีงานเหลือให้ใครวิ่ง สมาชิกที่ยังไม่ถูกผูกจะไม่ถูกผูกเลย
 *
 * ประกาศเป็นค่าคงที่แยกไว้ ไม่ใช่เงื่อนไขอินไลน์ — op ตัวที่หกในอนาคตต้องถูกเพิ่มเข้ามาที่นี่
 * อย่างจงใจ ไม่ใช่ตกอยู่ในขอบเขตการลบโดยปริยายเหมือนที่เกิดขึ้นกับสองตัวนี้
 */
const DISPLAY_PERIOD_OPS: readonly ScheduleRow['op'][] = ['set-default', 'clear-default']

export async function writeDisplayPeriod(
  schedules: Repo<ScheduleRow>,
  menuId: string,
  period: DisplayPeriod,
): Promise<void> {
  // `ListParams.filters` เทียบเท่ากับอย่างเดียว (ดู core/server/types.ts) กรอง op ต่อในหน่วยความจำ
  // แทนการยิงสองคำสั่ง — จำนวนแถว pending ต่อเมนูหนึ่งตัวมีได้ไม่กี่แถวตามนิยามของตารางนี้
  const existing = await schedules.findMany({ filters: { richMenuId: menuId, state: 'pending' } })
  const owned = existing.filter((row) => DISPLAY_PERIOD_OPS.includes(row.op))
  await Promise.all(owned.map((row) => schedules.delete(row.id)))

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
  // Task 14b item 3 — เมื่อฟอร์มเซ็ต `audience` ได้แล้ว มันก็ **ล้าง**ได้ด้วย: สลับเมนูสมาชิกที่ยัง
  // live อยู่กลับเป็น 'all' จะพาไปลงสถานะที่ 409 `menu_not_members_audience` มีไว้กันไม่ให้เกิดพอดี
  // (label 'all' + สมาชิกยังถืออยู่จริง + หน้าจอมองไม่เห็นเพราะ 'all' อ่าน active จาก default ของ LINE)
  // ปฏิเสธที่นี่แทนที่จะ deactivate ให้เองเงียบ ๆ ตามหลักของ Task 13 ruling: การกระทำทำตามเจตนา
  // ไม่ใช่เขียนทับเจตนา — ตรรกะทั้งหมดอยู่ที่ `assertAudienceChangeAllowed` ใน core เพื่อให้สอง
  // adapter เรียกด่านเดียวกันจริง ๆ ไม่ใช่ถือสำเนาที่วันหนึ่งจะไม่ตรงกัน
  //
  // อ่าน channel ของ **แถวเดิม** (`existing.channelId`) ไม่ใช่ `input.channelId` — pointer
  // `memberRichMenuId` ที่ต้องตรวจอยู่บน channel ที่เมนูนี้สังกัดอยู่ตอนนี้ การย้ายเมนูข้าม channel
  // พร้อมกับถอดป้ายในคำขอเดียวจึงยังถูกจับได้ ไม่ใช่หลุดไปเพราะบังเอิญไปอ่าน channel ปลายทางแทน
  // ข้ามการอ่านนี้ไปเลยเมื่อ caller ไม่ส่ง `audience` มา ("ไม่ส่งมา" = "ไม่เปลี่ยน" — ไม่มีอะไรให้ตรวจ)
  if (existing !== null && input.audience !== undefined) {
    const owner = await services.channels.findOne(existing.channelId)
    assertAudienceChangeAllowed({
      menu: existing,
      next: input.audience,
      memberRichMenuId: owner.memberRichMenuId,
    })
  }

  // Task 17 / deferred item 3 — ย้ายเมนูที่มีตัวจริงอยู่บนบัญชี LINE ของ channel เดิมแล้วไป channel
  // อื่นไม่ได้ ด่านข้างบนจับเคสนี้ไม่ได้เลยเพราะมัน return early ที่ `next === 'members'` ก่อนจะได้
  // อ่าน channel ด้วยซ้ำ — ย้ายเมนูสมาชิกที่ยัง live อยู่ข้าม channel โดยคงป้าย 'members' ไว้จึงลอด
  // ผ่านทั้งด่าน แล้วจบที่ pointer ของ channel ต้นทางชี้เมนูที่ไม่ได้อยู่ที่นั่นแล้ว ส่วน `deactivate`
  // ไปอ่าน channel ปลายทาง — ล้างของต้นทางไม่ได้อีกเลย เหมือนเคสลบแถวทิ้ง (H2) เป๊ะ ๆ
  // เข้าถึงได้จาก admin API เท่านั้น ไม่ใช่จาก editor (ซึ่งส่ง channelId เดิมกลับมาเสมอ)
  if (existing !== null) {
    assertChannelChangeAllowed({ menu: existing, next: input.channelId })
  }

  // Task 17 item 5 — ช่วงเวลาแสดงผลถูกเก็บเป็นแถว `set-default`/`clear-default` (ดู
  // `writeDisplayPeriod` ข้างบน) เมนูสมาชิกที่มีช่วงเวลาแสดงผลจึงถูกยัดให้ผู้ติดตามทุกคนเมื่อถึงเวลา
  // เริ่ม — ประตูที่สองของ BLOCKER เดียวกันกับ `setAsDefault` แต่มาแบบตั้งเวลาไว้ล่วงหน้า
  //
  // ใช้ audience **ผลลัพธ์** ของคำขอนี้ ไม่ใช่ค่าเดิมของแถว: "ไม่ส่งมา" = "ไม่เปลี่ยน" (กฎเดียวกับ
  // ที่ patch ข้างล่างใช้) และเมนูใหม่ที่ไม่ส่ง audience มาได้ 'all' จากคอลัมน์ default ของ
  // content-type — ไม่งั้นการเปลี่ยนเป็น members พร้อมตั้งช่วงเวลาในคำขอเดียวจะลอดผ่าน
  assertDisplayPeriodAllowed({
    audience: input.audience ?? existing?.audience ?? 'all',
    startAt: input.startAt,
    endAt: input.endAt,
  })

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
    // input.audience เป็น undefined เมื่อ caller ไม่ส่งฟิลด์นี้มาเลย (ตั้งแต่ Task 14b item 1
    // editor ส่งมาทุกครั้งแล้ว เหลือแต่ผู้เรียก API อื่นที่ยังละคีย์นี้ได้ — ดูคอมเมนต์ที่
    // validation.ts) ไม่ใส่คีย์นี้ใน patch เลยตอนนั้น ไม่ใช่ใส่เป็น undefined — ความหมาย
    // ปกติของ partial update คือ "ไม่ส่งมา" แปลว่า "ไม่เปลี่ยน" ไม่ใช่ "ตั้งเป็นค่า default" (Task 13
    // fix round 3, task-13-findings-2.md — `.default('all')` ตัวเดิมใน validation.ts ทำให้ทุก save
    // เขียนทับ audience เดิมเป็น 'all' เงียบ ๆ แม้เมนูยัง live กับสมาชิกจริงอยู่)
    ...(input.audience === undefined ? {} : { audience: input.audience }),
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
