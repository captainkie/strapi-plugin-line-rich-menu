import { describe, expect, it, vi } from 'vitest'
import { MAX_OUTPUT_BYTES } from '../../src/image/guards.js'
import { MenuNotReadyError } from '../../src/server/errors.js'
import { canvasFor, imageFingerprint, prepareImage } from '../../src/server/images.js'
import type { ImageStore } from '../../src/server/images.js'
import { solidJpeg, transparentPng } from '../fixtures/make-fixtures.js'

// เหตุผลเดียวกับ tests/image/pipeline.test.ts — mozjpeg บีบจริง ช้ากว่า 5000ms บน CI ได้
vi.setConfig({ testTimeout: 20_000 })

function fakeStore(files: Record<number, Buffer>): ImageStore & { written: { mime: string; bytes: number }[] } {
  const written: { mime: string; bytes: number }[] = []
  let next = 900
  return {
    written,
    async read(fileId) {
      const found = files[fileId]
      if (found === undefined) throw new Error(`no file ${fileId}`)
      return found
    },
    async write({ buffer, mime }) {
      written.push({ mime, bytes: buffer.length })
      return { id: next++ }
    },
  }
}

describe('canvasFor', () => {
  it('map ชื่อขนาดไปเป็นผืนผ้าใบที่ LINE รับ', () => {
    expect(canvasFor('large')).toEqual({ width: 2500, height: 1686 })
    expect(canvasFor('compact')).toEqual({ width: 2500, height: 843 })
  })
})

describe('prepareImage — รูปเดียว', () => {
  it('normalize แล้วเก็บไฟล์ใหม่ คืนขั้นบันไดที่ลงจริง', async () => {
    const store = fakeStore({ 11: await solidJpeg(4000, 3000) })
    const prepared = await prepareImage({ store }, {
      sizeName: 'large', imageFileId: 11, areaImages: [], areas: [],
    }, '7')

    expect(prepared.normalizedFileId).toBe(900)
    expect(prepared.normalizedMime).toBe('image/jpeg')
    expect(prepared.normalizedSize).toEqual({ width: 2500, height: 1686 })
    expect(store.written[0]!.bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
  })

  it('PNG ที่มี alpha จริงยังคงเป็น PNG', async () => {
    const store = fakeStore({ 12: await transparentPng(2500, 843) })
    const prepared = await prepareImage({ store }, {
      sizeName: 'compact', imageFileId: 12, areaImages: [], areas: [],
    }, '7')
    expect(prepared.normalizedMime).toBe('image/png')
    expect(prepared.normalizedSize).toEqual({ width: 2500, height: 843 })
  })

  it('ไม่มีรูปเลยโยน MenuNotReadyError("no_image") ไม่ใช่ปล่อยไปพังตอน publish', async () => {
    await expect(prepareImage({ store: fakeStore({}) }, {
      sizeName: 'large', imageFileId: null, areaImages: [], areas: [],
    }, '7')).rejects.toThrow(MenuNotReadyError)
  })
})

describe('prepareImage — โหมด compose แยกช่อง', () => {
  it('วางรูปแต่ละช่องลงผืนผ้าใบแล้ว normalize ต่อ', async () => {
    const store = fakeStore({ 21: await solidJpeg(1250, 1686), 22: await solidJpeg(1250, 1686) })
    const areas = [
      { bounds: { x: 0, y: 0, width: 1250, height: 1686 }, action: { type: 'message' as const, text: 'a' } },
      { bounds: { x: 1250, y: 0, width: 1250, height: 1686 }, action: { type: 'message' as const, text: 'b' } },
    ]

    const prepared = await prepareImage({ store }, {
      sizeName: 'large',
      imageFileId: null,
      areaImages: [{ index: 0, fileId: 21 }, { index: 1, fileId: 22 }],
      areas,
    }, '7')

    expect(prepared.normalizedSize).toEqual({ width: 2500, height: 1686 })
    expect(store.written).toHaveLength(1)
  })

  it('areaImages ที่ชี้ไป index ที่ไม่มี area โยน MenuNotReadyError("no_areas")', async () => {
    const store = fakeStore({ 21: await solidJpeg(1250, 1686) })
    await expect(prepareImage({ store }, {
      sizeName: 'large', imageFileId: null, areaImages: [{ index: 5, fileId: 21 }], areas: [],
    }, '7')).rejects.toThrow(MenuNotReadyError)
  })
})

describe('imageFingerprint', () => {
  it('เหมือนเดิมเมื่อไม่มีอะไรเกี่ยวกับรูปเปลี่ยน', () => {
    const base = {
      sizeName: 'large' as const, imageFileId: 11, areaImages: [], areas: [
        { bounds: { x: 0, y: 0, width: 100, height: 100 }, action: { type: 'message' as const, text: 'a' } },
      ],
    }
    expect(imageFingerprint(base)).toBe(imageFingerprint({ ...base, areas: [
      { bounds: { x: 0, y: 0, width: 100, height: 100 }, action: { type: 'message' as const, text: 'เปลี่ยนข้อความ' } },
    ] }))
  })

  it('ต่างเมื่อ file, ขนาด หรือ bounds เปลี่ยน', () => {
    const base = { sizeName: 'large' as const, imageFileId: 11, areaImages: [], areas: [] }
    expect(imageFingerprint(base)).not.toBe(imageFingerprint({ ...base, imageFileId: 12 }))
    expect(imageFingerprint(base)).not.toBe(imageFingerprint({ ...base, sizeName: 'compact' }))
    expect(imageFingerprint(base)).not.toBe(imageFingerprint({
      ...base,
      areas: [{ bounds: { x: 0, y: 0, width: 10, height: 10 }, action: { type: 'message', text: 'a' } }],
    }))
  })
})
