import { useMemo } from 'react'
import { useFetchClient, useNotification } from '@strapi/strapi/admin'
import { Link, useNavigate } from 'react-router-dom'
import { useIntl } from 'react-intl'
import type { UIPort } from '@fosivo/line-rich-menu-ui'
import { makeHttp, makeNav, makeT, makeToast, type FetchClient } from './adapters.js'
import { primitives } from './primitives.js'

/**
 * ประกอบ `UIPort` จาก hook ของ Strapi 5 — hook สี่ตัวนี้คือทุกอย่างที่ v4 กับ v5 ต่างกัน
 * ฝั่งนอกไฟล์นี้ (`packages/ui`) ไม่มีบรรทัดไหนรู้จัก Strapi เลย
 *
 * `useMemo` ไม่ใช่การ optimize แต่เป็นข้อกำหนดของ port (ดูคอมเมนต์เหนือ `HttpClient` ใน port.ts):
 * `RichMenuList` ใส่ `http` ไว้ใน dependency array ของ `useEffect` ถ้า port ถูกสร้างใหม่ทุก render
 * effect จะยิงซ้ำไม่รู้จบ และรายการเมนูจะกะพริบเป็นค่าว่างทุกครั้งที่ parent re-render
 *
 * `useNavigate` ของ router v6 คืนฟังก์ชันที่ identity คงที่ตลอดอายุของ router ส่วน
 * `toggleNotification` ของ v5 ถูกห่อด้วย `useCallback` มาแล้ว ทั้งคู่จึงเป็น dependency ที่ใช้ได้จริง
 * — `eslint-plugin-react-hooks` (Task 1) เป็นตัวที่บังคับว่ารายการนี้ครบ ไม่ใช่วินัยของคนเขียน
 */
export function usePluginPort(): UIPort {
  const fetchClient = useFetchClient()
  const { toggleNotification } = useNotification()
  const navigate = useNavigate()
  const { formatMessage } = useIntl()

  return useMemo<UIPort>(() => ({
    ui: primitives,
    http: makeHttp(fetchClient as unknown as FetchClient),
    toast: makeToast((notification) => {
      toggleNotification(notification as Parameters<typeof toggleNotification>[0])
    }),
    /**
     * cast ที่ `Link` เพราะพร็อพ `to` ของ router v6 เป็น `To = string | Partial<Path>` ซึ่ง
     * "กว้างกว่า" `string` ที่ port ประกาศไว้ — component ที่รับค่ากว้างกว่าย่อมใช้แทนตัวที่รับ
     * แคบกว่าได้เสมอ TypeScript ปฏิเสธเพราะฟิลด์ `propTypes` ที่ติดมากับ `ForwardRefExoticComponent`
     * เป็น invariant ไม่ใช่เพราะการเรียกใช้จริงจะพัง (v4 ผ่านได้เพราะ @types ของ router v5
     * ประกาศ `Link` ไว้คนละรูป) — จุดนี้จึงเป็นที่เดียวที่ยอมให้มี cast ไม่ใช่ `adapters.ts`
     */
    nav: makeNav(navigate, Link as UIPort['nav']['Link']),
    t: makeT(formatMessage as Parameters<typeof makeT>[0]),
  }), [fetchClient, toggleNotification, navigate, formatMessage])
}
