import type { ComponentType, ReactNode } from 'react'
import type { UIPort } from '@fosivo/line-rich-menu-ui'
import { PLUGIN_ID } from './plugin-id.js'

export interface FetchClient {
  get<T>(url: string): Promise<{ data: T }>
  post<T>(url: string, body?: unknown): Promise<{ data: T }>
  put<T>(url: string, body?: unknown): Promise<{ data: T }>
  del<T>(url: string): Promise<{ data: T }>
}

/**
 * `useFetchClient` ของ v5 เป็น axios ที่แนบ JWT ของ admin ให้แล้ว — หน้าที่ตรงนี้มีแค่แกะ `.data`
 * (รูปทรงเดียวกับ v4 เป๊ะ ๆ ไฟล์นี้จึงยกมาได้ทั้งดุ้น ต่างกันแค่ `makeToast` กับ `makeNav`)
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
 * `useNotification` ของ v5 รับ `info | warning | danger | success` ครบ — ไม่ต้องจับคู่
 * `danger` ลง `warning` แบบ v4 อีกแล้ว การยกโค้ดของ v4 มาทั้งดุ้นจะทำให้ความล้มเหลว
 * ทุกครั้งขึ้นเป็นสีส้มแทนสีแดง ซึ่งเป็นความผิดที่ไม่มีเทสต์ไหนของ v4 จับได้เพราะที่นั่นมันถูก
 *
 * `message` ของ v5 เป็นสตริงที่แปลแล้ว ไม่ใช่ descriptor ของ react-intl — ข้อความจากฝั่ง ui
 * ผ่าน `port.t` มาแล้วจึงส่งต่อได้ตรง ๆ ส่ง descriptor ไปจะได้ `[object Object]` บนหน้าจอ
 */
export function makeToast(
  toggle: (notification: { type: string; message: string }) => void,
): UIPort['toast'] {
  return ({ type, message }) => {
    toggle({ type, message })
  }
}

const BASE = `/plugins/${PLUGIN_ID}`

/**
 * `ui` ไม่รู้ว่าตัวเองถูก mount ไว้ที่ไหน — prefix จึงถูกเติมที่นี่ที่เดียว
 *
 * รับ **ฟังก์ชัน** navigate ไม่ใช่อ็อบเจกต์ `history` เพราะ router v6 ให้ `useNavigate()`
 * ที่เป็นฟังก์ชันตรง ๆ (v5 ให้ `useHistory()` ที่มีเมธอด `push`) — การรับฟังก์ชันทำให้ไฟล์นี้
 * ยังไม่ผูกกับ router เวอร์ชันไหนเลย เหมือนที่ v4 ทำได้ด้วยรูปที่ต่างกัน
 */
export function makeNav(
  navigate: (path: string) => void,
  Link: ComponentType<{ to: string; children?: ReactNode }>,
): UIPort['nav'] {
  return {
    push(path) { navigate(path.startsWith(BASE) ? path : `${BASE}${path}`) },
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
