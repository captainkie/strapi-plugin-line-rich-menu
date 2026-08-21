import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { compensate, plan, type Step } from '../../src/publish/machine.js'

describe('plan', () => {
  it('เริ่มด้วย validate เสมอ เพื่อไม่ทิ้งขยะบน LINE เมื่อ payload ผิด', () => {
    expect(plan({ setAsDefault: false })[0]).toEqual({ kind: 'validate' })
  })

  it('กรณีพื้นฐานไม่มี alias, default, เมนูเก่า — ได้ทั้งสามขั้นตรงเป๊ะ ไม่ขาดไม่เกิน', () => {
    expect(plan({ setAsDefault: false })).toEqual([
      { kind: 'validate' }, { kind: 'create' }, { kind: 'uploadImage' },
    ])
  })

  it('ไม่ใส่ขั้น upsertAlias เมื่อไม่ได้ระบุ aliasId', () => {
    expect(plan({ setAsDefault: false }).some((s) => s.kind === 'upsertAlias')).toBe(false)
  })

  it('สร้างก่อนอัปรูปเสมอ เพราะต้องมี richMenuId ก่อน', () => {
    const steps = plan({ setAsDefault: false }).map((s) => s.kind)
    expect(steps.indexOf('create')).toBeLessThan(steps.indexOf('uploadImage'))
  })

  it('ลบเมนูเก่าเป็นขั้นสุดท้ายเสมอ', () => {
    const steps = plan({ setAsDefault: true, aliasId: 'tab-a', previousLineRichMenuId: 'rm-old' })
    expect(steps.at(-1)).toEqual({ kind: 'deleteOld', lineRichMenuId: 'rm-old' })
  })

  it('ไม่มีขั้นลบเมนูเก่า ถ้ายังไม่เคย publish', () => {
    expect(plan({ setAsDefault: true }).some((s) => s.kind === 'deleteOld')).toBe(false)
  })

  it('ใส่ขั้น alias เมื่อระบุ aliasId', () => {
    expect(plan({ setAsDefault: false, aliasId: 'tab-a' }))
      .toContainEqual({ kind: 'upsertAlias', aliasId: 'tab-a' })
  })

  it('ไม่ใส่ขั้น setDefault เมื่อไม่ได้ขอ', () => {
    expect(plan({ setAsDefault: false }).some((s) => s.kind === 'setDefault')).toBe(false)
  })

  it('อัปเดต alias ก่อนตั้ง default — ให้ปลายทางพร้อมก่อนสลับให้ผู้ใช้เห็น', () => {
    const steps = plan({ setAsDefault: true, aliasId: 'tab-a' }).map((s) => s.kind)
    expect(steps.indexOf('upsertAlias')).toBeLessThan(steps.indexOf('setDefault'))
  })
})

describe('compensate', () => {
  it('ไม่ต้องชดเชยถ้ายังไม่ทันสร้างอะไรบน LINE', () => {
    expect(compensate([{ kind: 'validate' }])).toEqual([])
  })

  it('ลบเมนูที่เพิ่งสร้างถ้าล้มหลังจาก create', () => {
    expect(compensate([{ kind: 'validate' }, { kind: 'create' }]))
      .toEqual([{ kind: 'deleteCreated' }])
  })

  // ครอบเฉพาะ "เมนูกำพร้า" เท่านั้น — machine.ts เป็นฟังก์ชันบริสุทธิ์ที่ไม่รู้ว่า alias หรือ default
  // เคยมีค่าอะไรอยู่ก่อน จึงพิสูจน์เรื่องสถานะไม่ได้โดยหลักการ ตัวที่พิสูจน์เรื่องนั้นคือ
  // property test ใน tests/server/publish.test.ts ซึ่งมี LINE จำลองที่จำสถานะจริง
  it('property: ล้มกลางทางที่จุดไหนก็ต้องไม่ทิ้ง *เมนู* กำพร้าไว้บน LINE', () => {
    fc.assert(
      fc.property(
        fc.record({
          setAsDefault: fc.boolean(),
          aliasId: fc.option(fc.constantFrom('tab-a', 'tab-b'), { nil: undefined }),
          previousLineRichMenuId: fc.option(fc.constant('rm-old'), { nil: undefined }),
        }),
        fc.nat(),
        (input, cut) => {
          const steps = plan(input)
          const completed = steps.slice(0, cut % (steps.length + 1))
          const created = completed.some((s: Step) => s.kind === 'create')
          const fixes = compensate(completed)
          // สร้างแล้วต้องมีคำสั่งลบ ยังไม่สร้างต้องไม่มีคำสั่งลบ
          expect(fixes.some((f) => f.kind === 'deleteCreated')).toBe(created)
        },
      ),
      { numRuns: 500 },
    )
  })
})
