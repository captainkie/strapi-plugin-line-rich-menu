import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { emptyActionForm, fromAction, toAction } from '../src/action-form.js'

describe('toAction', () => {
  it('ตัดฟิลด์ที่ไม่เกี่ยวกับชนิดที่เลือกทิ้ง', () => {
    const state = { ...emptyActionForm(), type: 'message' as const, text: 'สวัสดี', uri: 'https://a.test' }
    expect(toAction(state)).toEqual({ type: 'message', text: 'สวัสดี' })
  })

  it('ไม่ส่งฟิลด์ที่เป็นค่าว่างไปให้ LINE — LINE ปฏิเสธ payload ที่มีสตริงว่าง', () => {
    const action = toAction({ ...emptyActionForm(), type: 'message', text: 'hi', label: '' })
    expect(Object.keys(action)).toEqual(['type', 'text'])
  })

  it('ใส่ label เมื่อผู้ใช้กรอกมา', () => {
    const action = toAction({ ...emptyActionForm(), type: 'message', text: 'hi', label: 'ปุ่ม' })
    expect(action).toEqual({ type: 'message', text: 'hi', label: 'ปุ่ม' })
  })

  it('altUri กลายเป็น { desktop } ตามรูปแบบจริงของ LINE ไม่ใช่สตริงแบน', () => {
    const action = toAction({
      ...emptyActionForm(), type: 'uri', uri: 'https://m.test', altUri: 'https://d.test',
    })
    expect(action).toEqual({ type: 'uri', uri: 'https://m.test', altUri: { desktop: 'https://d.test' } })
  })

  it('camera / cameraRoll / location ต้องมี label เสมอตามสเปก LINE', () => {
    for (const type of ['camera', 'cameraRoll', 'location'] as const) {
      expect(toAction({ ...emptyActionForm(), type, label: 'เปิด' })).toEqual({ type, label: 'เปิด' })
    }
  })

  it('datetimepicker พก mode มาด้วย', () => {
    const action = toAction({ ...emptyActionForm(), type: 'datetimepicker', data: 'd=1', mode: 'date' })
    expect(action).toEqual({ type: 'datetimepicker', data: 'd=1', mode: 'date' })
  })

  it('richmenuswitch พก aliasId และ data', () => {
    const action = toAction({
      ...emptyActionForm(), type: 'richmenuswitch', richMenuAliasId: 'tab-b', data: 'to=b',
    })
    expect(action).toEqual({ type: 'richmenuswitch', richMenuAliasId: 'tab-b', data: 'to=b' })
  })
})

describe('fromAction', () => {
  it('เติมฟิลด์ที่ขาดเป็นสตริงว่าง เพื่อให้ฟอร์มผูกค่าได้ทุกช่อง', () => {
    const state = fromAction({ type: 'message', text: 'hi' })
    expect(state.uri).toBe('')
    expect(state.data).toBe('')
    expect(state.text).toBe('hi')
  })

  it('แบน altUri.desktop กลับมาเป็นช่องเดียวสำหรับฟอร์ม', () => {
    const state = fromAction({ type: 'uri', uri: 'https://m.test', altUri: { desktop: 'https://d.test' } })
    expect(state.altUri).toBe('https://d.test')
  })
})

describe('round trip', () => {
  it('fromAction(toAction(x)) รักษาทุกฟิลด์ที่เกี่ยวกับชนิดนั้นไว้ครบ', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom('message', 'uri', 'postback', 'clipboard'),
          label: fc.string({ minLength: 1, maxLength: 20 }),
          text: fc.string({ minLength: 1, maxLength: 300 }),
          uri: fc.constantFrom('https://a.test', 'http://b.test', 'tel:0812345678'),
          data: fc.string({ minLength: 1, maxLength: 300 }),
          clipboardText: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        (partial) => {
          const state = { ...emptyActionForm(), ...partial }
          const round = fromAction(toAction(state))
          expect(round.type).toBe(state.type)
          if (state.type === 'message') expect(round.text).toBe(state.text)
          if (state.type === 'uri') expect(round.uri).toBe(state.uri)
          if (state.type === 'postback') expect(round.data).toBe(state.data)
          if (state.type === 'clipboard') expect(round.clipboardText).toBe(state.clipboardText)
          expect(round.label).toBe(state.label)
        },
      ),
      { numRuns: 300 },
    )
  })
})
