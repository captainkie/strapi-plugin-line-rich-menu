import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PortProvider, type HttpClient } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { ImageField } from '../src/components/ImageField.js'

const SIZE = { width: 2500, height: 1686 }

function file(name = 'menu.png', type = 'image/png') {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

/**
 * jsdom ไม่ decode รูปจริง จึงต้องปลอมขนาดที่ Image จะรายงานกลับมา
 *
 * นิยามเฉพาะ naturalWidth/naturalHeight (ไม่ใส่ width/height) โดยตั้งใจ — ถ้า
 * implementation อ่านผิด property (rendered dimensions แทน intrinsic) จะได้
 * `undefined`, สัดส่วนกลายเป็น NaN, และ test ล้มเหลวอย่างชัดเจน
 */
function stubImageSize(width: number, height: number) {
  class StubImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = width
    naturalHeight = height
    set src(_v: string) { queueMicrotask(() => this.onload?.()) }
  }
  vi.stubGlobal('Image', StubImage)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} })
}

function setup(port = createStubPort({ t: (k) => k })) {
  const onChange = vi.fn()
  render(
    <PortProvider value={port}>
      <ImageField value={null} size={SIZE} disabled={false} onChange={onChange} />
    </PortProvider>,
  )
  return { onChange }
}

// stubImageSize แทนที่ global ทั้งก้อน (Image, URL) — ถ้าไม่ unstub ท้าย test
// จะหลุดข้าม test ถัดไปในไฟล์เดียวกัน
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ImageField', () => {
  it('ปิดไว้จนกว่าจะเลือก template — ปุ่ม Image ของ LINE ก็ทำแบบนี้', () => {
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <ImageField value={null} size={SIZE} disabled onChange={vi.fn()} />
      </PortProvider>,
    )
    expect(screen.getByTestId('image-input')).toBeDisabled()
  })

  it('ปฏิเสธไฟล์ที่ไม่ใช่ jpeg หรือ png ตั้งแต่ยังไม่ยิงเซิร์ฟเวอร์', async () => {
    const post = vi.fn()
    const { onChange } = setup(createStubPort({ t: (k) => k, http: { ...createStubPort().http, post } }))
    fireEvent.change(screen.getByTestId('image-input'), {
      target: { files: [file('a.gif', 'image/gif')] },
    })
    await waitFor(() => expect(screen.getByText('image.error.format')).toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  // สเปก §5.6 ข้อ 3
  it('ปฏิเสธรูปที่สัดส่วนไม่ตรงกับผืนผ้าใบ ก่อนอัปโหลด', async () => {
    stubImageSize(1000, 1000)
    const post = vi.fn()
    setup(createStubPort({ t: (k) => k, http: { ...createStubPort().http, post } }))
    fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
    await waitFor(() => expect(screen.getByText('image.error.ratio')).toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })

  it('อัปโหลดผ่าน POST /upload เมื่อรูปผ่านเกณฑ์ และคืนไฟล์ที่ได้กลับไป', async () => {
    stubImageSize(2500, 1686)
    const post = vi.fn(async () => [{ id: 7, url: '/uploads/menu.png', width: 2500, height: 1686 }])
    // post คืนค่า array ที่เป็น type คงที่ ในขณะที่ HttpClient['post'] เป็น generic <T> — cast
    // เฉพาะตรงจุดที่ประกอบเข้า http เท่านั้น เพื่อให้ตัวแปร post ด้านล่างยังเป็น Mock เต็มรูปแบบ
    const { onChange } = setup(createStubPort({ t: (k) => k, http: { ...createStubPort().http, post: post as unknown as HttpClient['post'] } }))
    fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/upload', expect.any(FormData))
    expect(onChange).toHaveBeenCalledWith({ id: 7, url: '/uploads/menu.png', width: 2500, height: 1686 })
  })

  it('แจ้ง error เมื่อเซิร์ฟเวอร์ปฏิเสธ และไม่ตั้งค่าเป็นรูปที่อัปไม่สำเร็จ', async () => {
    stubImageSize(2500, 1686)
    const post = vi.fn(async () => { throw new Error('boom') })
    const { onChange } = setup(createStubPort({ t: (k) => k, http: { ...createStubPort().http, post } }))
    fireEvent.change(screen.getByTestId('image-input'), { target: { files: [file()] } })
    await waitFor(() => expect(screen.getByText('image.error.upload')).toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ลบรูปที่เลือกไว้ได้', () => {
    const onChange = vi.fn()
    render(
      <PortProvider value={createStubPort({ t: (k) => k })}>
        <ImageField
          value={{ id: 1, url: '/uploads/a.png', width: 2500, height: 1686 }}
          size={SIZE} disabled={false} onChange={onChange}
        />
      </PortProvider>,
    )
    fireEvent.click(screen.getByTestId('image-remove'))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
