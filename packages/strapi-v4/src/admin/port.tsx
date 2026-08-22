import { useMemo } from 'react'
import { useTheme } from '@strapi/design-system'
import { useFetchClient, useNotification } from '@strapi/helper-plugin'
import { Link, useHistory } from 'react-router-dom'
import { useIntl } from 'react-intl'
import type { UIPort } from '@fosivo/line-rich-menu-ui'
import { makeHttp, makeNav, makeT, makeToast, type FetchClient } from './adapters.js'
import { primitives } from './primitives.js'

/**
 * ประกอบ `UIPort` จาก hook ของ Strapi 4 — hook ทั้งสี่ตัวนี้คือทุกอย่างที่ v4 กับ v5 ต่างกัน
 * ฝั่งนอกไฟล์นี้ (`packages/ui`) ไม่มีบรรทัดไหนรู้จัก Strapi เลย
 *
 * `react-intl` และ `react-router-dom` ถูก import ที่นี่ได้ เพราะไฟล์นี้อยู่ในอะแดปเตอร์
 * ESLint บล็อกทั้งสองตัวเฉพาะใน `packages/ui` ซึ่งเป็นที่ที่มันเป็นปัญหาจริง
 *
 * `useMemo` ไม่ใช่การ optimize แต่เป็นข้อกำหนดของ port (ดูคอมเมนต์เหนือ `HttpClient` ใน port.ts):
 * `RichMenuList` ใส่ `http` ไว้ใน dependency array ของ `useEffect` ถ้า port ถูกสร้างใหม่ทุก render
 * effect จะยิงซ้ำไม่รู้จบ — hook ทั้งสี่ตัวของ v4 คืนค่าที่คงที่อยู่แล้ว (`useFetchClient` ห่อด้วย
 * `useMemo`, `useNotification` ห่อด้วย `useCallback`) จึงเป็น dependency ที่ใช้ได้จริง
 */
export function usePluginPort(): UIPort {
  const fetchClient = useFetchClient()
  const toggleNotification = useNotification()
  const history = useHistory()
  const { formatMessage } = useIntl()
  // ธีมปัจจุบันของ Strapi (สว่าง/มืดตามที่ผู้ใช้ตั้งไว้) — `ThemeProvider` ครอบทั้งแอดมินไว้อยู่แล้ว
  // เสมอในแอปจริง ค่านี้จึงสลับตามธีมจริงโดยอัตโนมัติ ไม่ใช่ค่าคงที่ (สเปกงานนี้ #5)
  const { colors } = useTheme()

  return useMemo<UIPort>(() => ({
    ui: primitives,
    http: makeHttp(fetchClient as unknown as FetchClient),
    // `makeToast` เป็นตัวที่ทำให้ชนิดแคบลงเอง (danger → warning) แต่ลายเซ็นของมันประกาศ `type`
    // เป็น string เพื่อไม่ให้ adapters.ts ต้องรู้จัก type ของ `@strapi/helper-plugin` ซึ่งเป็น
    // แพ็กเกจที่หายไปทั้งตัวใน Strapi 5 — cast จึงมาอยู่ตรงนี้จุดเดียว ไม่ใช่ในไฟล์ที่จะย้ายไป Plan 04
    toast: makeToast((notification) => {
      toggleNotification(notification as Parameters<typeof toggleNotification>[0])
    }),
    nav: makeNav(history, Link),
    t: makeT(formatMessage as Parameters<typeof makeT>[0]),
    // ดูคอมเมนต์ที่ `ThemeColors` ใน port.ts ของ packages/ui — สี่ตัวนี้คือทั้งหมดที่ CanvasEditor/
    // AreaList/TemplatePicker ต้องใช้นอกเหนือจาก Typography
    theme: {
      border: colors.neutral200,
      surface: colors.neutral150,
      strongText: colors.neutral800,
      mutedText: colors.neutral600,
    },
  }), [fetchClient, toggleNotification, history, formatMessage, colors])
}
