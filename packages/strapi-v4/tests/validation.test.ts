import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  channelCreateSchema, idParam, lineRichMenuIdParam, listQuerySchema, menuInputSchema, publishBodySchema,
} from '../src/server/validation.js'

const validMenu = {
  name: 'เมนูหลัก',
  channelId: '10',
  size: 'large',
  chatBarText: 'เปิดเมนู',
  chatBarMode: 'custom',
  selected: true,
  templateKey: 'RICH_MENU_TEMPLATE_201',
  areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'hi' } }],
  imageFileId: 11,
  areaImages: [],
  aliasId: 'tab-a',
  startAt: null,
  endAt: null,
}

describe('menuInputSchema', () => {
  it('ยอมรับ input ที่ถูกต้อง', () => {
    expect(menuInputSchema.parse(validMenu)).toMatchObject({ name: 'เมนูหลัก', channelId: '10' })
  })

  it('ปฏิเสธฟิลด์แปลกปลอมที่ระดับบนสุด', () => {
    expect(() => menuInputSchema.parse({ ...validMenu, isAdmin: true })).toThrow(ZodError)
  })

  it('ปฏิเสธฟิลด์แปลกปลอมที่อยู่ลึกใน action ด้วย — ไม่ใช่แค่ระดับบนสุด', () => {
    expect(() => menuInputSchema.parse({
      ...validMenu,
      areas: [{ bounds: validMenu.areas[0]!.bounds, action: { type: 'message', text: 'hi', evil: 1 } }],
    })).toThrow(ZodError)
  })

  it('ปฏิเสธ uri scheme ที่อันตราย ตั้งแต่ขอบของ route', () => {
    for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      expect(() => menuInputSchema.parse({
        ...validMenu,
        areas: [{ bounds: validMenu.areas[0]!.bounds, action: { type: 'uri', uri } }],
      }), uri).toThrow(ZodError)
    }
  })

  it('จำกัดจำนวนช่องที่สูงสุด 20 และ chatBarText ที่ 14 ตัว', () => {
    expect(() => menuInputSchema.parse({
      ...validMenu, areas: Array.from({ length: 21 }, () => validMenu.areas[0]),
    })).toThrow(ZodError)
    expect(() => menuInputSchema.parse({ ...validMenu, chatBarText: 'x'.repeat(15) })).toThrow(ZodError)
  })

  /**
   * Task 20 item 1 (ui-core H2) — "Save draft" ต้องบันทึกงานที่ยังไม่เสร็จได้จริง เดิม `areas`
   * บังคับ `min(1)` และ `action` ต้องครบทุกฟิลด์ ทำให้ create/update ปฏิเสธร่างที่ยังไม่ได้เลือก
   * template หรือกรอก action ไม่ครบ — ปุ่มที่สอง (Save draft) จึงใช้บันทึกงานค้างไม่ได้เลยสักครั้ง
   * ต้อง**ทำลาย guard นี้ก่อนเชื่อ**: ก่อนแก้ ทั้งสอง case ด้านล่างโยน ZodError ทั้งคู่
   */
  it('ยอมรับ areas ว่างเปล่า — ร่างที่ยังไม่ได้เลือก template ต้องบันทึกได้', () => {
    expect(() => menuInputSchema.parse({ ...validMenu, areas: [] })).not.toThrow()
  })

  it('ยอมรับ action ที่กรอกไม่ครบ (text ว่าง) ในร่าง — ปุ่ม Save draft ต้องใช้ได้จริง', () => {
    const incomplete = [{ bounds: validMenu.areas[0]!.bounds, action: { type: 'message', text: '' } }]
    expect(() => menuInputSchema.parse({ ...validMenu, areas: incomplete })).not.toThrow()
  })

  it('aliasId ต้องเป็น slug ที่ LINE ยอมรับ', () => {
    expect(() => menuInputSchema.parse({ ...validMenu, aliasId: 'Tab A!' })).toThrow(ZodError)
    expect(menuInputSchema.parse({ ...validMenu, aliasId: null }).aliasId).toBeNull()
  })

  // สเปกงานนี้ #4 — เกตนี้ต้องอยู่ที่ขอบของ route ด้วย ไม่ใช่แค่ในฟอร์ม เพราะ RBAC กันคนนอกได้
  // แต่ไม่ได้การันตีว่าผู้เรียกคือฟอร์มของเรา (คำขอที่ข้ามฟอร์มมาตรง ๆ ต้องโดนปฏิเสธเหมือนกัน)
  describe('ช่วงเวลาแสดงผล (startAt/endAt)', () => {
    it('ปฏิเสธเมื่อ endAt มาก่อน startAt', () => {
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: '2026-09-30T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z',
      })).toThrow(ZodError)
    })

    it('ปฏิเสธเมื่อ endAt เท่ากับ startAt เป๊ะ — ช่วงเวลายาวเป็นศูนย์ไม่แสดงเมนูให้ใครเลย', () => {
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z',
      })).toThrow(ZodError)
    })

    it('ยอมรับเมื่อ endAt อยู่หลัง startAt', () => {
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-09-30T00:00:00.000Z',
      })).not.toThrow()
    })

    it('ยอมรับเมื่อฝั่งใดฝั่งหนึ่งเป็น null — ยังไม่ระบุไม่ใช่ช่วงเวลาที่ต้องเรียงลำดับ', () => {
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: null, endAt: '2026-09-30T00:00:00.000Z',
      })).not.toThrow()
      expect(() => menuInputSchema.parse({
        ...validMenu, startAt: '2026-09-01T00:00:00.000Z', endAt: null,
      })).not.toThrow()
    })
  })

  /**
   * Task 13 fix round 4 (task-13-findings-3.md) — the schema half of the guard whose acceptance
   * half lives in examples/v4-app/tests/acceptance.spec.ts (audience สมาชิก). Reverting
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
   * `validMenu` above never included an `audience` key — that omission is the whole point here.
   *
   * Task 14b item 1 changed *who* sends that shape, not whether it must keep working. The editor
   * now has an Audience control and its PUT always carries `audience` (seeded from the row it
   * loaded), so this body is no longer the editor's — it is every *other* caller: scripts,
   * customer integrations, anything issuing a partial update. For them "absent" must still mean
   * "unchanged", which is exactly what this test pins. The assertion is unchanged; only this
   * sentence is, because leaving a comment that names the wrong caller is how the next person
   * checking gets stopped by something false.
   *
   * Mutation check (required by task-13-findings-3.md): re-add `.default('all')` to
   * `menuInputSchema` here, confirm this test goes RED, revert.
   */
  it('ไม่ส่ง audience มาเลย — คีย์นี้ต้องหายไปจากผลลัพธ์ ไม่ใช่ถูกเติมเป็น all', () => {
    const parsed = menuInputSchema.parse(validMenu)
    expect('audience' in parsed, 'zod ต้องไม่เติม audience ให้เอง — omitted แปลว่าไม่แก้').toBe(false)
  })
})

describe('channelCreateSchema', () => {
  it('บังคับให้มี token และปฏิเสธฟิลด์แปลกปลอม', () => {
    expect(() => channelCreateSchema.parse({ name: 'x', channelId: '1' })).toThrow(ZodError)
    expect(() => channelCreateSchema.parse({
      name: 'x', channelId: '1', channelAccessToken: 't', role: 'super-admin',
    })).toThrow(ZodError)
  })
})

describe('idParam · listQuerySchema · publishBodySchema', () => {
  it('id ต้องเป็นตัวเลขล้วน', () => {
    expect(idParam.parse('12')).toBe('12')
    expect(() => idParam.parse('12; DROP TABLE x')).toThrow(ZodError)
  })

  it('query ที่ไม่รู้จักถูกปฏิเสธ', () => {
    expect(listQuerySchema.parse({ channel: '10' })).toEqual({ channel: '10' })
    expect(() => listQuerySchema.parse({ channel: '10', limit: '99999' })).toThrow(ZodError)
  })

  it('body ของ publish ว่างได้ และ default เป็นไม่ตั้ง default', () => {
    expect(publishBodySchema.parse(undefined)).toEqual({ setAsDefault: false })
  })

  it('lineRichMenuId ต้องไม่ว่างและไม่ยาวเกิน 64 ตัว', () => {
    expect(lineRichMenuIdParam.parse('richmenu-abc123')).toBe('richmenu-abc123')
    expect(() => lineRichMenuIdParam.parse('')).toThrow(ZodError)
    expect(() => lineRichMenuIdParam.parse('x'.repeat(65))).toThrow(ZodError)
  })
})
