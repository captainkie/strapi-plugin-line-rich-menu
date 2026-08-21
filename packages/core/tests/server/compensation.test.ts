import { describe, expect, it, vi } from 'vitest'
import type { Step } from '../../src/publish/machine.js'
import { capturePriorState, restorePriorState } from '../../src/server/compensation.js'

const silent = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function restorer() {
  return {
    setDefault: vi.fn(async () => {}),
    clearDefault: vi.fn(async () => {}),
    updateAlias: vi.fn(async () => {}),
    deleteAlias: vi.fn(async () => {}),
  }
}

describe('capturePriorState', () => {
  it('อ่าน default ก็ต่อเมื่อจะไปตั้ง default และอ่าน alias ก็ต่อเมื่อมี alias', async () => {
    const client = {
      getDefault: vi.fn(async () => 'richmenu-old'),
      getAlias: vi.fn(async () => 'richmenu-aliased'),
    }
    expect(await capturePriorState(client, { aliasId: null, willSetDefault: false }))
      .toEqual({ defaultRichMenuId: null, aliasTarget: null })
    expect(client.getDefault).not.toHaveBeenCalled()
    expect(client.getAlias).not.toHaveBeenCalled()

    expect(await capturePriorState(client, { aliasId: 'tab-a', willSetDefault: true }))
      .toEqual({ defaultRichMenuId: 'richmenu-old', aliasTarget: 'richmenu-aliased' })
    expect(client.getAlias).toHaveBeenCalledWith('tab-a')
  })
})

describe('restorePriorState', () => {
  const attemptedAll: Step[] = [
    { kind: 'validate' }, { kind: 'create' }, { kind: 'uploadImage' },
    { kind: 'upsertAlias', aliasId: 'tab-a' }, { kind: 'setDefault' },
  ]

  it('alias ที่เราสร้างขึ้นใหม่เอง ต้องถูกลบทิ้ง ไม่ใช่ปล่อยชี้ไปเมนูที่กำลังจะถูกลบ', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: null, aliasTarget: null },
      { aliasId: 'tab-a', attempted: attemptedAll }, silent)
    expect(client.deleteAlias).toHaveBeenCalledWith('tab-a')
    expect(client.updateAlias).not.toHaveBeenCalled()
  })

  it('alias ที่มีอยู่ก่อน ต้องถูกชี้กลับไปที่ปลายทางเดิม', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: null, aliasTarget: 'richmenu-previous' },
      { aliasId: 'tab-a', attempted: attemptedAll }, silent)
    expect(client.updateAlias).toHaveBeenCalledWith('tab-a', 'richmenu-previous')
    expect(client.deleteAlias).not.toHaveBeenCalled()
  })

  it('default ที่มีอยู่ก่อน ต้องถูกตั้งกลับ', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: 'richmenu-old', aliasTarget: null },
      { aliasId: null, attempted: attemptedAll }, silent)
    expect(client.setDefault).toHaveBeenCalledWith('richmenu-old')
    expect(client.clearDefault).not.toHaveBeenCalled()
  })

  it('ไม่เคยมี default มาก่อน ต้องล้างทิ้ง ไม่ใช่ปล่อยให้ชี้เมนูที่กำลังจะถูกลบ', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: null, aliasTarget: null },
      { aliasId: null, attempted: attemptedAll }, silent)
    expect(client.clearDefault).toHaveBeenCalled()
  })

  it('ไม่แตะอะไรเลยถ้ายังไม่ทันทำขั้นที่เปลี่ยนสถานะ', async () => {
    const client = restorer()
    await restorePriorState(client, { defaultRichMenuId: 'richmenu-old', aliasTarget: 'x' },
      { aliasId: 'tab-a', attempted: [{ kind: 'validate' }, { kind: 'create' }] }, silent)
    expect(client.setDefault).not.toHaveBeenCalled()
    expect(client.clearDefault).not.toHaveBeenCalled()
    expect(client.updateAlias).not.toHaveBeenCalled()
    expect(client.deleteAlias).not.toHaveBeenCalled()
  })

  it('การคืนค่าที่ล้มเองต้องถูก log แล้วไปต่อ ไม่ใช่หยุดครึ่งทาง', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const client = restorer()
    client.setDefault.mockRejectedValueOnce(new Error('LINE ล่ม'))

    await restorePriorState(client, { defaultRichMenuId: 'richmenu-old', aliasTarget: 'richmenu-previous' },
      { aliasId: 'tab-a', attempted: attemptedAll }, logger)

    expect(logger.error).toHaveBeenCalled()
    expect(client.updateAlias).toHaveBeenCalledWith('tab-a', 'richmenu-previous')
  })

  /**
   * "กลืน error ไว้แล้วไปต่อ" ถูกต้องแล้ว แต่ต้องไม่แปลว่าผู้เรียกไม่รู้ — ผู้เรียกกำลังจะตัดสินใจว่า
   * จะลบเมนูที่เพิ่งสร้างทิ้งหรือไม่ และคำตอบนั้นขึ้นกับว่าการคืนค่าสำเร็จหรือเปล่าล้วน ๆ
   */
  describe('รายงานผลกลับให้ผู้เรียกตัดสินใจ', () => {
    it('คืนครบทั้งคู่ → true ทั้งคู่', async () => {
      expect(await restorePriorState(restorer(), { defaultRichMenuId: 'richmenu-old', aliasTarget: 'x' },
        { aliasId: 'tab-a', attempted: attemptedAll }, silent))
        .toEqual({ defaultRestored: true, aliasRestored: true })
    })

    it('ไม่มีอะไรต้องคืน ก็นับว่าคืนสำเร็จ — ผู้เรียกจะได้ไม่ต้องรู้ว่าขั้นไหนถูกเดินบ้าง', async () => {
      expect(await restorePriorState(restorer(), { defaultRichMenuId: 'richmenu-old', aliasTarget: 'x' },
        { aliasId: 'tab-a', attempted: [{ kind: 'validate' }, { kind: 'create' }] }, silent))
        .toEqual({ defaultRestored: true, aliasRestored: true })
    })

    it('คืน default ล้ม → defaultRestored เป็น false แต่ alias ยังถูกคืนและรายงานแยกกัน', async () => {
      const client = restorer()
      client.setDefault.mockRejectedValueOnce(new Error('LINE ล่ม'))
      expect(await restorePriorState(client, { defaultRichMenuId: 'richmenu-old', aliasTarget: 'richmenu-previous' },
        { aliasId: 'tab-a', attempted: attemptedAll }, silent))
        .toEqual({ defaultRestored: false, aliasRestored: true })
    })

    it('คืน alias ล้ม → aliasRestored เป็น false', async () => {
      const client = restorer()
      client.updateAlias.mockRejectedValueOnce(new Error('LINE ล่ม'))
      expect(await restorePriorState(client, { defaultRichMenuId: 'richmenu-old', aliasTarget: 'richmenu-previous' },
        { aliasId: 'tab-a', attempted: attemptedAll }, silent))
        .toEqual({ defaultRestored: true, aliasRestored: false })
    })

    it('ล้าง default ที่ล้ม (ไม่เคยมี default มาก่อน) ก็นับเป็นคืนไม่สำเร็จเหมือนกัน', async () => {
      const client = restorer()
      client.clearDefault.mockRejectedValueOnce(new Error('LINE ล่ม'))
      expect(await restorePriorState(client, { defaultRichMenuId: null, aliasTarget: null },
        { aliasId: null, attempted: attemptedAll }, silent))
        .toEqual({ defaultRestored: false, aliasRestored: true })
    })
  })
})
