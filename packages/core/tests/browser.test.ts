import { describe, expect, it } from 'vitest'
import * as browserEntry from '../src/browser.js'

// packages/core/src/browser.ts คือ subpath "./browser" — ต้องไม่มีอะไรที่ import sharp
// หรือ node:crypto รั่วเข้ามา (ดูเหตุผลเต็มใน src/browser.ts และ tsup.config.ts)
// เทสต์นี้ยืนยันที่ต้นทาง (src) ไม่ใช่ dist — dist ถูกตรวจแยกด้วย grep หลัง build

describe('subpath "./browser" — โค้ดที่ปลอดภัยจะรันในเบราว์เซอร์', () => {
  it('มี symbol ที่ไม่ผูก Node runtime ครบ — templates, schema, errors, thumbnail, types', () => {
    expect(browserEntry.TEMPLATES).toBeDefined()
    expect(browserEntry.LINE_ALLOWED_SIZES).toBeDefined()
    expect(browserEntry.isAllowedCanvas).toBeTypeOf('function')
    expect(browserEntry.sizeNameFor).toBeTypeOf('function')
    expect(browserEntry.validateRichMenu).toBeTypeOf('function')
    expect(browserEntry.renderTemplateSvg).toBeTypeOf('function')
    expect(browserEntry.areaLabel).toBeTypeOf('function')
    expect(browserEntry.ValidationError).toBeTypeOf('function')
    expect(browserEntry.CoreError).toBeTypeOf('function')
  })

  it('ไม่มี symbol ที่ต้องพึ่ง sharp (image pipeline) เลย', () => {
    expect((browserEntry as Record<string, unknown>)['normalize']).toBeUndefined()
    expect((browserEntry as Record<string, unknown>)['compose']).toBeUndefined()
    expect((browserEntry as Record<string, unknown>)['inspectImage']).toBeUndefined()
  })

  it('ไม่มี symbol ที่ต้องพึ่ง node:crypto หรือยิง network (LineClient) เลย', () => {
    expect((browserEntry as Record<string, unknown>)['encryptSecret']).toBeUndefined()
    expect((browserEntry as Record<string, unknown>)['decryptSecret']).toBeUndefined()
    expect((browserEntry as Record<string, unknown>)['LineClient']).toBeUndefined()
  })

  it('ทำงานได้จริงโดยไม่ต้องมี Node runtime API ของ sharp/crypto — render thumbnail ของ template แรกได้', () => {
    const t = browserEntry.TEMPLATES['RICH_MENU_TEMPLATE_201']!
    const svg = browserEntry.renderTemplateSvg(t.bounds, t.size)
    expect(svg.startsWith('<svg')).toBe(true)
  })
})
