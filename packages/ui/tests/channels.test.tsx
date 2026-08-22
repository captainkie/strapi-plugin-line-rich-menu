import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ENDPOINTS } from '../src/api.js'
import { PortProvider } from '../src/port.js'
import { createRejectingHttpClient, createStubPort } from '../src/stub-port.js'
import { ChannelSettings } from '../src/pages/ChannelSettings.js'

const channels = [
  { id: 'c1', name: 'ร้านทดสอบ', channelId: '1650000000', accessTokenPreview: '••••••••abcd', isDefault: true },
]

function setup(overrides: {
  get?: unknown; post?: unknown; del?: unknown
  t?: (key: string, values?: Record<string, string | number>) => string
} = {}) {
  const base = createStubPort({ t: overrides.t ?? ((k) => k) })
  const get = overrides.get ?? vi.fn(async () => channels)
  const post = overrides.post ?? vi.fn(async () => ({}))
  const del = overrides.del ?? vi.fn(async () => ({}))
  const port = { ...base, http: { ...base.http, get, post, del } as typeof base.http }
  render(<PortProvider value={port}><ChannelSettings /></PortProvider>)
  return { get, post, del }
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
      name: 'ร้านใหม่', channelId: '1660000000', channelSecret: '', channelAccessToken: 'token',
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

  // port.ts กำหนดว่า http client ต้อง reject เมื่อ status ไม่ใช่ 2xx — ข้อกำหนดที่ไม่มีเทสต์ไหน
  // มองเห็นได้ก็เป็นแค่คอมเมนต์ ไม่ใช่สัญญา สองเทสต์นี้คือจุดที่ทำให้มันมีผลจริง: ถ้า adapter ตัวไหน
  // resolve ให้กับ 403 หน้านี้จะเงียบสนิท (ได้รายการว่าง / บันทึกที่ "สำเร็จ") แทนที่จะบอกผู้ใช้
  it('โหลดรายการ channel ล้มเหลว ต้องขึ้น error ไม่ใช่แสดงรายการว่างเหมือนไม่มีข้อมูล', async () => {
    const port = createStubPort({ t: (k) => k, http: createRejectingHttpClient() })
    render(<PortProvider value={port}><ChannelSettings /></PortProvider>)
    await waitFor(() => expect(screen.getByText('channel.loadFailed')).toBeInTheDocument())
  })

  // ใช้ client ที่ reject เฉพาะ post (ไม่ใช่ทั้งก้อน) เพราะกรณีจริงคือ "รายการโหลดมาได้ปกติ
  // แต่การบันทึกล้ม" — ถ้าให้ get reject ด้วย error ของการโหลดจะมาทับ error ของการบันทึกทีหลัง
  // แล้วเทสต์จะเขียว/แดงด้วยเหตุผลของ fixture ไม่ใช่ของสิ่งที่มันอ้างว่าพิสูจน์
  it('บันทึก channel ล้มเหลว ต้องขึ้น error และไม่ล้างฟอร์มทิ้งเหมือนบันทึกสำเร็จ', async () => {
    setup({ post: createRejectingHttpClient().post })
    await waitFor(() => expect(screen.getByTestId('add-channel')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('add-channel'))
    fireEvent.change(screen.getByLabelText('channel.name'), { target: { value: 'ร้านใหม่' } })
    fireEvent.click(screen.getByTestId('save-channel'))
    await waitFor(() => expect(screen.getByText('channel.saveFailed')).toBeInTheDocument())
    // ค่าที่พิมพ์ไว้ต้องยังอยู่ให้แก้ต่อ ไม่ใช่ถูกล้างแบบเดียวกับตอนบันทึกสำเร็จ
    expect(screen.getByLabelText('channel.name')).toHaveValue('ร้านใหม่')
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

  // มาสก์อย่างเดียวไม่พอ — ช่อง type="password" ที่ไม่ได้บอกอะไรไว้ จะถูกเบราว์เซอร์เสนอให้
  // "บันทึกรหัสผ่าน" แล้ว bearer token ของ LINE จะไปอยู่ใน credential store ของผู้ใช้และซิงก์
  // ข้ามเครื่องเขาไปด้วย ทั้งที่ไม่มีอะไรในหน้านี้เป็นการล็อกอินเลย
  it('ไม่ยื่น credential ให้ password manager ของเบราว์เซอร์เก็บ', async () => {
    setup()
    await waitFor(() => expect(screen.getByTestId('add-channel')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('add-channel'))
    expect(screen.getByLabelText('channel.channelSecret')).toHaveAttribute('autocomplete', 'off')
    expect(screen.getByLabelText('channel.accessToken')).toHaveAttribute('autocomplete', 'off')
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

  // สเปก §8 ข้อ 3 ท่อนที่สอง — reconcile ต้องมีปุ่มเรียกจริงในหน้านี้ ไม่ใช่ endpoint ที่ไม่มีใครยิง
  describe('ตรวจสอบเมนูกำพร้า (reconcile)', () => {
    const REPORT = { orphans: ['richmenu-stray'], missing: ['richmenu-gone'] }

    function setupReconciled(overrides: Parameters<typeof setup>[0] = {}) {
      const get = overrides.get ?? vi.fn(async (url: string) => (
        url === ENDPOINTS.channelReconcile('c1') ? REPORT : channels
      ))
      return setup({ ...overrides, get })
    }

    it('กดปุ่มตรวจสอบแล้วเรียก endpoint reconcile ของ channel ที่ถูกต้อง และแสดงทั้งสองรายการ', async () => {
      const { get } = setupReconciled()
      await waitFor(() => expect(screen.getByTestId('reconcile-c1')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('reconcile-c1'))

      await waitFor(() => expect(get).toHaveBeenCalledWith(ENDPOINTS.channelReconcile('c1')))
      await waitFor(() => expect(screen.getByText('richmenu-stray')).toBeInTheDocument())
      expect(screen.getByText('richmenu-gone')).toBeInTheDocument()
    })

    it('orphans มีปุ่มลบรายตัว ส่วน missing แสดงอย่างเดียวไม่มีปุ่ม', async () => {
      setupReconciled()
      fireEvent.click(await screen.findByTestId('reconcile-c1'))
      await screen.findByText('richmenu-stray')

      expect(screen.getByTestId('delete-orphan-richmenu-stray')).toBeInTheDocument()
      expect(screen.queryByTestId('delete-orphan-richmenu-gone')).not.toBeInTheDocument()
    })

    // หัวใจของฝั่ง UI ในข้อนี้ — กด delete ต้องแค่เปิดกล่องยืนยัน ไม่ยิง request ทันที และข้อความ
    // ยืนยันต้องมี id ที่จะลบอยู่ในนั้นจริง (ไม่ใช่ raw key ที่ผู้ใช้อ่านไม่รู้เรื่องว่ากำลังจะลบตัวไหน)
    it('ปุ่มลบเปิดกล่องยืนยันที่มี id อยู่ในข้อความ และยิง DELETE เฉพาะหลังกดยืนยันเท่านั้น', async () => {
      const t = (key: string, values?: Record<string, string | number>) => {
        if (key === 'channel.reconcile.deleteConfirm.body') {
          return `ลบ ${String(values?.['id'])} ออกจาก LINE ถาวร กู้คืนไม่ได้`
        }
        return key
      }
      const { del } = setupReconciled({ t })
      fireEvent.click(await screen.findByTestId('reconcile-c1'))
      await screen.findByText('richmenu-stray')

      fireEvent.click(screen.getByTestId('delete-orphan-richmenu-stray'))
      expect(del).not.toHaveBeenCalled()
      expect(await screen.findByText('ลบ richmenu-stray ออกจาก LINE ถาวร กู้คืนไม่ได้')).toBeInTheDocument()

      fireEvent.click(screen.getByTestId('confirm-delete-orphan'))
      await waitFor(() => expect(del).toHaveBeenCalledWith(ENDPOINTS.channelOrphan('c1', 'richmenu-stray')))
    })

    it('ลบสำเร็จแล้วเอารายการนั้นออกจากผังทันที', async () => {
      setupReconciled()
      fireEvent.click(await screen.findByTestId('reconcile-c1'))
      await screen.findByText('richmenu-stray')

      fireEvent.click(screen.getByTestId('delete-orphan-richmenu-stray'))
      fireEvent.click(screen.getByTestId('confirm-delete-orphan'))

      await waitFor(() => expect(screen.queryByTestId('delete-orphan-richmenu-stray')).not.toBeInTheDocument())
    })

    it('ตรวจสอบล้มเหลว ต้องขึ้น error ไม่ใช่แสดงรายการว่างเหมือนไม่มีของกำพร้า', async () => {
      const get = vi.fn(async (url: string) => {
        if (url === ENDPOINTS.channelReconcile('c1')) throw new Error('500')
        return channels
      })
      setupReconciled({ get })
      fireEvent.click(await screen.findByTestId('reconcile-c1'))

      await waitFor(() => expect(screen.getByText('channel.reconcile.failed')).toBeInTheDocument())
    })

    it('ลบล้มเหลว ต้องขึ้น error และปิดกล่องยืนยัน แถวกำพร้ายังอยู่เหมือนเดิม', async () => {
      const del = vi.fn(async () => { throw new Error('500') })
      setupReconciled({ del })
      fireEvent.click(await screen.findByTestId('reconcile-c1'))
      await screen.findByText('richmenu-stray')

      fireEvent.click(screen.getByTestId('delete-orphan-richmenu-stray'))
      fireEvent.click(screen.getByTestId('confirm-delete-orphan'))

      await waitFor(() => expect(screen.getByText('channel.reconcile.deleteFailed')).toBeInTheDocument())
      expect(screen.queryByTestId('confirm-delete-orphan')).not.toBeInTheDocument()
      expect(screen.getByTestId('delete-orphan-richmenu-stray')).toBeInTheDocument()
    })

    it('ไม่มีเมนูกำพร้าหรือรายการที่หายไป ต้องขึ้นข้อความว่างของแต่ละฝั่ง', async () => {
      const get = vi.fn(async (url: string) => (
        url === ENDPOINTS.channelReconcile('c1') ? { orphans: [], missing: [] } : channels
      ))
      setupReconciled({ get })
      fireEvent.click(await screen.findByTestId('reconcile-c1'))

      await waitFor(() => expect(screen.getByText('channel.reconcile.orphans.empty')).toBeInTheDocument())
      expect(screen.getByText('channel.reconcile.missing.empty')).toBeInTheDocument()
    })

    it('กดปุ่มตรวจสอบซ้ำที่ channel เดิมเป็นการปิดแผง ไม่ใช่โหลดซ้ำ', async () => {
      const { get } = setupReconciled()
      fireEvent.click(await screen.findByTestId('reconcile-c1'))
      await screen.findByText('richmenu-stray')

      fireEvent.click(screen.getByTestId('reconcile-c1'))

      expect(screen.queryByText('richmenu-stray')).not.toBeInTheDocument()
      expect(get).toHaveBeenCalledTimes(2) // channels ตอน mount + reconcile ครั้งเดียวตอนเปิด ไม่ใช่ตอนปิด
    })
  })

  /**
   * หัวข้อของหน้าเป็นของ `ui.Page` ไม่ใช่ของ component นี้
   *
   * ตอนที่ ChannelSettings ยังอยู่ท้ายหน้ารายการ `<h1>` ของมันคือหัวข้อของท่อนหนึ่งในหน้า
   * พอย้ายมาเป็นหน้าของตัวเอง (pages/Channels.tsx) หน้านั้นตั้ง title เป็นข้อความเดียวกัน —
   * ผลคือ `<h1>` สองอันที่เขียนเหมือนกันเป๊ะซ้อนกัน ทั้งบนจอและใน accessibility tree
   * ไม่มีเทสต์ไหนจับได้เลย สคริปต์ถ่ายภาพต่างหากที่ล้ม (strict mode ของ Playwright เจอสองอัน)
   * ด่านนี้จึงมีไว้กันไม่ให้มันถูกใส่กลับเข้ามาโดยไม่มีใครรู้
   */
  it('ไม่มีหัวข้อของตัวเอง — หน้าที่ประกอบมันเป็นเจ้าของ title', () => {
    setup()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})
