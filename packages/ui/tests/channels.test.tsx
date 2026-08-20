import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ENDPOINTS } from '../src/api.js'
import { PortProvider } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'
import { ChannelSettings } from '../src/pages/ChannelSettings.js'

const channels = [
  { id: 'c1', name: 'ร้านทดสอบ', channelId: '1650000000', accessTokenPreview: '••••••••abcd', isDefault: true },
]

function setup(overrides: { get?: unknown; post?: unknown; t?: (key: string, values?: Record<string, string | number>) => string } = {}) {
  const base = createStubPort({ t: overrides.t ?? ((k) => k) })
  const get = overrides.get ?? vi.fn(async () => channels)
  const post = overrides.post ?? vi.fn(async () => ({}))
  const port = { ...base, http: { ...base.http, get, post } as typeof base.http }
  render(<PortProvider value={port}><ChannelSettings /></PortProvider>)
  return { get, post }
}

describe('ChannelSettings', () => {
  it('แสดง channel ที่มีอยู่', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('ร้านทดสอบ')).toBeInTheDocument())
  })

  // สเปก §11.2 — token เต็มต้องไม่เคยออกจากเซิร์ฟเวอร์
  it('แสดงเฉพาะสี่ตัวท้ายของ token ไม่เคยแสดงค่าเต็ม', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('••••••••abcd')).toBeInTheDocument())
  })

  it('เพิ่ม channel ใหม่ได้', async () => {
    const post = vi.fn(async () => ({}))
    setup({ post })
    await waitFor(() => expect(screen.getByTestId('add-channel')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('add-channel'))
    fireEvent.change(screen.getByLabelText('channel.name'), { target: { value: 'ร้านใหม่' } })
    fireEvent.change(screen.getByLabelText('channel.channelId'), { target: { value: '1660000000' } })
    fireEvent.change(screen.getByLabelText('channel.accessToken'), { target: { value: 'token' } })
    fireEvent.click(screen.getByTestId('save-channel'))
    // S4 — ยืนยันทั้ง body ที่ส่งไป ไม่ใช่ objectContaining บางฟิลด์ (ที่ยังผ่านได้แม้ฟิลด์อื่นหายไป)
    await waitFor(() => expect(post).toHaveBeenCalledWith(ENDPOINTS.channels, {
      name: 'ร้านใหม่', channelId: '1660000000', channelSecret: '', accessToken: 'token',
    }))
  })

  // ต้องใช้ t ที่ interpolate จริง (ไม่ใช่ identity `(k) => k` ที่ทิ้ง values ทั้งก้อน) เพราะข้อความ
  // ไทยวางชื่อ OA ไว้กลางประโยค ("เชื่อมต่อกับ {name} แล้ว") ไม่ใช่ท้ายสุดแบบอังกฤษ — เทสต์นี้ต้องพิสูจน์
  // ทั้งว่าชื่อไปถึง values ของ t() จริง และวางกลางประโยคได้ ไม่ใช่แค่ปรากฏอยู่ที่ไหนก็ได้ในข้อความ
  it('ปุ่ม Test connection แสดงชื่อ OA ที่ยิงเจอจริง โดยวางกลางประโยคผ่าน t()', async () => {
    const MESSAGES: Record<string, string> = { 'channel.testOk': 'เชื่อมต่อกับ {name} แล้ว' }
    const t = (key: string, values?: Record<string, string | number>) => {
      const template = MESSAGES[key] ?? key
      return values === undefined
        ? template
        : Object.entries(values).reduce((s, [name, value]) => s.replaceAll(`{${name}}`, String(value)), template)
    }
    const post = vi.fn(async () => ({ userId: 'U1', basicId: '@abc', displayName: 'ร้านที่ยิงเจอ' }))
    setup({ post, t })
    await waitFor(() => expect(screen.getByTestId('test-c1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('test-c1'))
    await waitFor(() => expect(screen.getByText('เชื่อมต่อกับ ร้านที่ยิงเจอ แล้ว')).toBeInTheDocument())
    expect(post).toHaveBeenCalledWith(ENDPOINTS.channelTest('c1'), undefined)
  })

  // S1 — Alert primitive วาด role="status" ไม่ใช่ "alert"
  it('บอกเมื่อ Test connection ล้ม ไม่ปล่อยเงียบ', async () => {
    const post = vi.fn(async () => { throw new Error('401') })
    setup({ post })
    await waitFor(() => expect(screen.getByTestId('test-c1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('test-c1'))
    await waitFor(() => expect(screen.getByText('channel.testFailed')).toBeInTheDocument())
  })

  // channelSecret/accessToken เป็น bearer credential — ใครอ่านค่านี้ได้จากจอก็โพสต์แทนธุรกิจได้ทันที
  // (หน้านี้ถูก demo/screen-share จริง ไม่ใช่ความเสี่ยงทางทฤษฎี) ต้อง mask ด้วย input type password เสมอ
  it('ซ่อนค่า channel secret และ access token ด้วย input type password', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('add-channel')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('add-channel'))
    expect(screen.getByLabelText('channel.channelSecret')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('channel.accessToken')).toHaveAttribute('type', 'password')
  })

  // token ที่พิมพ์ไว้ไม่มีเหตุผลต้องค้างใน state หลังส่งให้เซิร์ฟเวอร์ไปแล้ว — เปิดฟอร์มซ้ำต้องไม่เห็นของเก่า
  it('เคลียร์ token ที่พิมพ์ไว้ออกจากฟอร์มหลังบันทึกสำเร็จ', async () => {
    const post = vi.fn(async () => ({}))
    setup({ post })
    await waitFor(() => expect(screen.getByTestId('add-channel')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('add-channel'))
    fireEvent.change(screen.getByLabelText('channel.name'), { target: { value: 'ร้านใหม่' } })
    fireEvent.change(screen.getByLabelText('channel.accessToken'), { target: { value: 'secret-token' } })
    fireEvent.click(screen.getByTestId('save-channel'))
    await waitFor(() => expect(screen.queryByTestId('save-channel')).not.toBeInTheDocument())
    fireEvent.click(screen.getByTestId('add-channel'))
    expect(screen.getByLabelText('channel.accessToken')).toHaveValue('')
  })
})
