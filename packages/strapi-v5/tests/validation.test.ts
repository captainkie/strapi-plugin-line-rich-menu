import { describe, expect, it } from 'vitest'
import { channelCreateSchema, idParam, listQuerySchema, menuInputSchema } from '../server/src/validation.js'

const menu = {
  name: 'เมนูหลัก',
  channelId: 'ch0000000000000000000001',
  size: 'large' as const,
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom' as const,
  selected: true,
  templateKey: null,
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'ไง' } }],
  imageFileId: 3,
  areaImages: [],
  aliasId: 'main',
  startAt: null,
  endAt: null,
}

/**
 * โน้ตส่งต่อของ Plan 03 บอกว่า `validation.ts` "ย้ายไปได้เกือบทั้งดุ้น" — จริงทุกบรรทัดยกเว้น
 * บรรทัดเดียวนี้ และมันเป็นบรรทัดที่ทำให้ทั้งปลั๊กอินใช้ไม่ได้ถ้าย้ายมาตรง ๆ
 *
 * v4 ใช้ `z.string().regex(/^\d+$/)` เพราะ id ของ v4 เป็นตัวเลข ส่วน documentId ของ v5
 * เป็นสตริงตัวอักษรผสมตัวเลข 24 ตัว regex ของ v4 จะปฏิเสธมันทุกตัว ผลคือ **ทุก route ที่มี
 * `:id` ตอบ 400 `validation_failed` เสมอ** ตั้งแต่คำขอแรก ซึ่งอ่านเหมือนฝั่ง UI ส่งของผิด
 */
describe('idParam ของ Strapi 5', () => {
  it('รับ documentId ที่เป็นตัวอักษรผสมตัวเลข', () => {
    expect(idParam.parse('kx91p2m4c7v0b8n3q5r6t7y8')).toBe('kx91p2m4c7v0b8n3q5r6t7y8')
  })

  it('ยังรับสตริงตัวเลขล้วน — id ของ admin user ที่ไหลมาทาง path ก็ยังต้องผ่าน', () => {
    expect(idParam.parse('7')).toBe('7')
  })

  it('ปฏิเสธค่าที่ว่าง ค่าที่ยาวเกินจริง และค่าที่มีอักขระที่ไม่ใช่ id', () => {
    for (const bad of ['', 'a'.repeat(65), '../../etc/passwd', 'ab cd', "a'or'1"]) {
      expect(() => idParam.parse(bad), bad).toThrow()
    }
  })
})

describe('menuInputSchema', () => {
  it('รับ payload ที่ครบและถูกต้อง', () => {
    expect(menuInputSchema.parse(menu).channelId).toBe('ch0000000000000000000001')
  })

  it('channelId เป็น documentId ไม่ใช่ตัวเลข', () => {
    expect(() => menuInputSchema.parse({ ...menu, channelId: 'ch0000000000000000000001' })).not.toThrow()
  })

  it('ปฏิเสธฟิลด์แปลกปลอม (สเปก §11.3 — .strict() ทุกตัว)', () => {
    expect(() => menuInputSchema.parse({ ...menu, extra: true })).toThrow()
  })

  it('chatBarText เกิน 14 ตัวไม่ผ่าน — ข้อจำกัดของ LINE เอง', () => {
    expect(() => menuInputSchema.parse({ ...menu, chatBarText: 'ก'.repeat(15) })).toThrow()
  })

  it('areas สูงสุด 20 ช่อง — เกินนี้ปฏิเสธ', () => {
    expect(() => menuInputSchema.parse({ ...menu, areas: Array.from({ length: 21 }, () => menu.areas[0]) })).toThrow()
  })

  /**
   * Task 20 item 1 (ui-core H2) — "Save draft" ต้องบันทึกงานที่ยังไม่เสร็จได้จริง เดิม `areas`
   * บังคับ `min(1)` และ `action` ต้องครบทุกฟิลด์ (ใช้ `actionSchema` เข้มเดิม) ทำให้ create/update
   * ปฏิเสธร่างที่ยังไม่ได้เลือก template หรือกรอก action ไม่ครบ — ปุ่มที่สอง (Save draft) จึงใช้
   * บันทึกงานค้างไม่ได้เลยสักครั้ง (ดู `RichMenuEditor.tsx` — draft ข้ามการ validate โดยเจตนา)
   * ต้อง**ทำลาย guard นี้ก่อนเชื่อ**: ก่อนแก้ ทั้งสอง case ด้านล่างโยน ZodError ทั้งคู่
   */
  it('ยอมรับ areas ว่างเปล่า — ร่างที่ยังไม่ได้เลือก template ต้องบันทึกได้', () => {
    expect(() => menuInputSchema.parse({ ...menu, areas: [] })).not.toThrow()
  })

  it('ยอมรับ action ที่กรอกไม่ครบ (text ว่าง) ในร่าง — ปุ่ม Save draft ต้องใช้ได้จริง', () => {
    const incomplete = [{ bounds: menu.areas[0]!.bounds, action: { type: 'message', text: '' } }]
    expect(() => menuInputSchema.parse({ ...menu, areas: incomplete })).not.toThrow()
  })

  it('ยังปฏิเสธ action ที่ผิดรูปแบบสิ้นเชิง (type ไม่รู้จัก) แม้เป็นร่าง — ผ่อนแค่ "ไม่ครบ" ไม่ใช่ผ่อนทุกอย่าง', () => {
    const bogus = [{ bounds: menu.areas[0]!.bounds, action: { type: 'not-a-real-type', text: '' } }]
    expect(() => menuInputSchema.parse({ ...menu, areas: bogus })).toThrow()
  })

  // v4 มีเทสต์นี้อยู่แล้ว (tests/validation.test.ts) แต่ v5 ไม่เคยมี — เพิ่มไว้เป็นคู่กัน โดยเฉพาะ
  // ตอนนี้ที่ areas/action ผ่อนลงสำหรับร่าง (ข้างบน) เทสต์นี้คือด่านที่พิสูจน์ว่า "ผ่อนแค่ว่างได้"
  // ไม่ใช่ "ผ่อนรูปแบบ" — scheme อันตรายต้องยังโดนปฏิเสธที่ขอบของ route เหมือนเดิมทุกประการ
  it('ปฏิเสธ uri scheme ที่อันตราย ตั้งแต่ขอบของ route แม้ areas จะผ่อนลงสำหรับร่างแล้วก็ตาม', () => {
    for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      expect(() => menuInputSchema.parse({
        ...menu, areas: [{ bounds: menu.areas[0]!.bounds, action: { type: 'uri', uri } }],
      }), uri).toThrow()
    }
  })

  it('imageFileId ยังเป็นตัวเลข — ไฟล์ของ upload plugin ไม่ใช่ document', () => {
    expect(() => menuInputSchema.parse({ ...menu, imageFileId: 'abc' })).toThrow()
    expect(menuInputSchema.parse({ ...menu, imageFileId: null }).imageFileId).toBeNull()
  })

  it('aliasId ต้องเป็น slug ที่ LINE รับได้', () => {
    expect(() => menuInputSchema.parse({ ...menu, aliasId: 'Main Menu' })).toThrow()
  })

  // สเปกงานนี้ #4 — เกตนี้ต้องอยู่ที่ขอบของ route ด้วย ไม่ใช่แค่ในฟอร์ม เพราะ RBAC กันคนนอกได้
  // แต่ไม่ได้การันตีว่าผู้เรียกคือฟอร์มของเรา (คำขอที่ข้ามฟอร์มมาตรง ๆ ต้องโดนปฏิเสธเหมือนกัน)
  describe('ช่วงเวลาแสดงผล (startAt/endAt)', () => {
    it('ปฏิเสธเมื่อ endAt มาก่อน startAt', () => {
      expect(() => menuInputSchema.parse({
        ...menu, startAt: '2026-09-30T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z',
      })).toThrow()
    })

    it('ปฏิเสธเมื่อ endAt เท่ากับ startAt เป๊ะ — ช่วงเวลายาวเป็นศูนย์ไม่แสดงเมนูให้ใครเลย', () => {
      expect(() => menuInputSchema.parse({
        ...menu, startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z',
      })).toThrow()
    })

    it('ยอมรับเมื่อ endAt อยู่หลัง startAt', () => {
      expect(() => menuInputSchema.parse({
        ...menu, startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z',
      })).not.toThrow()
    })

    it('ยอมรับเมื่อฝั่งใดฝั่งหนึ่งเป็น null — ยังไม่ระบุไม่ใช่ช่วงเวลาที่ต้องเรียงลำดับ', () => {
      expect(() => menuInputSchema.parse({
        ...menu, startAt: null, endAt: '2026-09-30T00:00:00.000Z',
      })).not.toThrow()
      expect(() => menuInputSchema.parse({
        ...menu, startAt: '2026-09-01T00:00:00.000Z', endAt: null,
      })).not.toThrow()
    })
  })

  /**
   * Task 13 fix round 4 (task-13-findings-3.md) — the schema half of the guard whose acceptance
   * half lives in examples/v5-app/tests/acceptance.spec.ts (audience สมาชิก). Reverting
   * `menuInputSchema` alone (re-adding `.default('all')`) brings the whole Critical back even with
   * `saveMenu`'s conditional-spread fix untouched: zod would turn "absent" into `'all'` *before*
   * `saveMenu` ever sees `input.audience === undefined`, so the round-3 unit test in
   * menu-write.test.ts — which calls `saveMenu` directly and never runs zod — cannot catch it.
   *
   * Assert the key is absent, not `=== undefined`. Both forms actually go red under the mutation
   * below: `saveMenu`'s spread omits the key entirely rather than writing `undefined`, and
   * `repo.ts` guards `patch.audience !== undefined` a second time, so `{audience: undefined}` and
   * `{}` reach the database identically. `in` is preferred because it states the contract itself —
   * zod must not synthesise the key at all — rather than passing by accident of two downstream
   * guards that a later refactor could remove.
   * `menu` above never included an `audience` key — that omission is the whole point here, it's
   * the exact shape the real editor's PUT sends (see api.ts of ui).
   *
   * Mutation check (required by task-13-findings-3.md): re-add `.default('all')` to
   * `menuInputSchema` here, confirm this test goes RED, revert.
   */
  it('ไม่ส่ง audience มาเลย — คีย์นี้ต้องหายไปจากผลลัพธ์ ไม่ใช่ถูกเติมเป็น all', () => {
    const parsed = menuInputSchema.parse(menu)
    expect('audience' in parsed, 'zod ต้องไม่เติม audience ให้เอง — omitted แปลว่าไม่แก้').toBe(false)
  })
})

describe('listQuerySchema', () => {
  it('channel เป็น documentId', () => {
    expect(listQuerySchema.parse({ channel: 'ch0000000000000000000001' }).channel)
      .toBe('ch0000000000000000000001')
  })

  it('ปฏิเสธ query แปลกปลอม', () => {
    expect(() => listQuerySchema.parse({ nope: '1' })).toThrow()
  })
})

describe('channelCreateSchema', () => {
  it('ปฏิเสธ token ที่ว่าง', () => {
    expect(() => channelCreateSchema.parse({ name: 'ร้าน', channelId: '165', channelAccessToken: '' })).toThrow()
  })
})
