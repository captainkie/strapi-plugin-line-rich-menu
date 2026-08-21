/**
 * ตัวแทนของ `@strapi/strapi/admin` ในเทสต์ — **ไม่ใช่ของจริง** และไม่ได้อ้างว่าเป็น
 *
 * สิ่งที่เทสต์ในแพ็กเกจนี้พิสูจน์ได้จริงคือ "สายไฟเหนือ hook ต่อถูก": port ถูกประกอบครั้งเดียว
 * ต่อชุด dependency, `.data` ถูกแกะ, FormData ไม่ถูกแปลงร่าง, path ถูกเติม prefix
 * สิ่งที่พิสูจน์ไม่ได้คือ "hook ของ Strapi 5 คืนค่ารูปนี้จริงไหม" — ตัวที่พิสูจน์ข้อนั้นคือ
 * examples/v5-app ใน Task 10 ซึ่งบูต Strapi 5.52.1 ตัวจริงและกดผ่านหน้าจอจริง
 *
 * รูปทรงด้านล่างอ้างอิงจากคู่มือย้าย v4 → v5 ของ Strapi (`helper-plugin.md`):
 * `useFetchClient` ย้ายมาจาก `@strapi/helper-plugin` โดยรูปทรงไม่เปลี่ยน ส่วน `useNotification`
 * เปลี่ยนจาก "คืนฟังก์ชัน" เป็น "คืนอ็อบเจกต์ที่มี toggleNotification" และ `message` กลายเป็น
 * สตริงที่แปลแล้ว ไม่ใช่ descriptor ของ react-intl อีกต่อไป
 */
export interface FetchResponse<T> { data: T }

export function useFetchClient(): {
  get<T>(url: string): Promise<FetchResponse<T>>
  post<T>(url: string, body?: unknown): Promise<FetchResponse<T>>
  put<T>(url: string, body?: unknown): Promise<FetchResponse<T>>
  del<T>(url: string): Promise<FetchResponse<T>>
} {
  throw new Error('useFetchClient ของจริงถูกพิสูจน์ที่ examples/v5-app ไม่ใช่ที่นี่')
}

export function useNotification(): {
  toggleNotification(notification: { type: string; message: string }): void
} {
  throw new Error('useNotification ของจริงถูกพิสูจน์ที่ examples/v5-app ไม่ใช่ที่นี่')
}
