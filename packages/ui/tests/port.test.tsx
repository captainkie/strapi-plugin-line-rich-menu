import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortProvider, usePort } from '../src/port.js'
import { createStubPort } from '../src/stub-port.js'

function Probe() {
  const port = usePort()
  return <span>{port.t('probe.key')}</span>
}

describe('UIPort', () => {
  it('component ที่อยู่ใน PortProvider เห็น port ที่ฉีดเข้าไป', () => {
    const port = createStubPort({ t: (key) => `แปลแล้ว:${key}` })
    render(<PortProvider value={port}><Probe /></PortProvider>)
    expect(screen.getByText('แปลแล้ว:probe.key')).toBeInTheDocument()
  })

  it('เรียก usePort นอก provider ต้องพังทันทีพร้อมบอกวิธีแก้ ไม่ใช่คืน undefined เงียบ ๆ', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/PortProvider/)
    spy.mockRestore()
  })

  it('stub port มีครบทุกอย่างที่ UIPort ประกาศไว้', () => {
    const port = createStubPort()
    expect(Object.keys(port.ui).length).toBeGreaterThanOrEqual(15)
    for (const method of ['get', 'post', 'put', 'del'] as const) {
      expect(typeof port.http[method]).toBe('function')
    }
    expect(typeof port.toast).toBe('function')
    expect(typeof port.nav.push).toBe('function')
    expect(typeof port.t).toBe('function')
  })

  it('stub port รับ override เฉพาะบางส่วนได้ โดยไม่ต้องประกอบใหม่ทั้งก้อน', () => {
    const toast = vi.fn()
    const port = createStubPort({ toast })
    port.toast({ type: 'success', message: 'ok' })
    expect(toast).toHaveBeenCalledOnce()
    expect(typeof port.t).toBe('function')
  })
})
