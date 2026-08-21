import type { ComponentType, ReactNode } from 'react'
import type { UIPort } from '@fosivo/line-rich-menu-ui'
import { PLUGIN_ID } from '../server/permissions.js'

export interface FetchClient {
  get<T>(url: string): Promise<{ data: T }>
  post<T>(url: string, body?: unknown): Promise<{ data: T }>
  put<T>(url: string, body?: unknown): Promise<{ data: T }>
  del<T>(url: string): Promise<{ data: T }>
}

/**
 * `useFetchClient` ของ v4 เป็น axios ที่แนบ JWT ของ admin ให้แล้ว — หน้าที่ตรงนี้มีแค่แกะ `.data`
 *
 * ไม่มี try/catch โดยตั้งใจ: axios reject ให้เองเมื่อ status ไม่ใช่ 2xx และ `HttpClient` ใน port.ts
 * บังคับกติกานั้นไว้ ทุกหน้าจอของ `packages/ui` แสดงความล้มเหลวผ่าน promise ที่ reject อย่างเดียว
 * การดักไว้แล้วคืนค่าว่างจะกลายเป็น "โหลดสำเร็จแต่ไม่มีข้อมูล" ซึ่งแยกจากของจริงไม่ออก
 *
 * ห้ามแปลง body เด็ดขาด: `ImageField` ของ Plan 02 ยิง `POST /upload` ด้วย `FormData`
 * ซึ่ง axios ตั้ง boundary ของ multipart ให้เอง การ JSON.stringify ให้จะทำให้อัปรูปไม่ได้เลย
 */
export function makeHttp(client: FetchClient): UIPort['http'] {
  // เขียน `<T>` ซ้ำที่นี่ไม่ใช่ของประดับ — ถ้าไม่ส่งต่อ type parameter ให้ client ตัว TypeScript
  // จะ infer `T = unknown` ตอนเรียกจริงแล้ว `.data` กลายเป็น `unknown` ทั้งสี่เมธอด
  return {
    async get<T>(url: string): Promise<T> { return (await client.get<T>(url)).data },
    async post<T>(url: string, body?: unknown): Promise<T> { return (await client.post<T>(url, body)).data },
    async put<T>(url: string, body?: unknown): Promise<T> { return (await client.put<T>(url, body)).data },
    async del<T>(url: string): Promise<T> { return (await client.del<T>(url)).data },
  }
}

/**
 * `useNotification` ของ 4.25 รับ `info | warning | softWarning | success` — ไม่มี `danger`
 * จึงจับคู่ `danger` กับ `warning` ซึ่งเป็นชนิดที่ชัดที่สุดที่ v4 มี (v5 มี `danger` จริง)
 *
 * เลือก "แสดงผิดสี" แทน "ไม่แสดงเลย" เพราะความล้มเหลวที่เงียบสนิทแย่กว่าความล้มเหลวที่สีไม่ตรง
 */
export function makeToast(
  toggle: (message: { type: string; message: { id: string; defaultMessage: string } }) => void,
): UIPort['toast'] {
  return ({ type, message }) => {
    toggle({
      type: type === 'danger' ? 'warning' : type,
      // ข้อความถูกแปลมาแล้วจาก port.t ฝั่ง ui — ส่งเป็น defaultMessage ให้ react-intl ใช้ตรง ๆ
      message: { id: `${PLUGIN_ID}.toast`, defaultMessage: message },
    })
  }
}

const BASE = `/plugins/${PLUGIN_ID}`

/** `ui` ไม่รู้ว่าตัวเองถูก mount ไว้ที่ไหน — prefix จึงถูกเติมที่นี่ที่เดียว */
export function makeNav(
  history: { push(path: string): void },
  Link: ComponentType<{ to: string; children?: ReactNode }>,
): UIPort['nav'] {
  return {
    push(path) { history.push(path.startsWith(BASE) ? path : `${BASE}${path}`) },
    Link,
  }
}

export function makeT(
  formatMessage: (
    descriptor: { id: string; defaultMessage: string },
    values?: Record<string, unknown>,
  ) => string,
): UIPort['t'] {
  return (key, values) =>
    formatMessage({ id: `${PLUGIN_ID}.${key}`, defaultMessage: key }, values)
}
