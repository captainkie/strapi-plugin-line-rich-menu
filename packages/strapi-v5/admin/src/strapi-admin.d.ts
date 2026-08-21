/**
 * `@strapi/strapi` ทั้งแพ็กเกจคือ CMS ทั้งตัว — ติดตั้งมันไว้เป็น devDependency เพื่อ import
 * hook สองตัวคือราคาที่ไม่คุ้ม (หลายร้อยเมกะไบต์ต่อการ `pnpm install` ทุกครั้งของทุก job ใน CI
 * และ React tree ของตัวเองที่ทับกับของเราได้) ไฟล์นี้ประกาศเฉพาะสิ่งที่ `port.tsx` ใช้จริง
 *
 * เหตุผลเดียวกับ `packages/strapi-v4/src/admin/design-system-v1.d.ts` และมีข้อจำกัดเดียวกัน:
 * ทุกบรรทัดในนี้คือคำสัญญาที่เราเขียนเอง ซึ่ง TypeScript จะเชื่อโดยไม่มีใครตรวจสอบให้ ตัวที่ตรวจ
 * ของจริงคือ examples/v5-app (Task 10) ซึ่งบูต Strapi 5.52.1 แล้วกดผ่านหน้าจอจริง
 *
 * รูปทรงด้านล่างมาจากคู่มือย้าย v4 → v5 ของ Strapi เอง (`helper-plugin.md`):
 * `useFetchClient` ย้ายที่อยู่โดยรูปทรงไม่เปลี่ยน ส่วน `useNotification` เปลี่ยนจาก "คืนฟังก์ชัน"
 * เป็น "คืนอ็อบเจกต์ที่มี toggleNotification" และ `message` เป็นสตริงที่แปลแล้ว
 */
declare module '@strapi/strapi/admin' {
  export function useFetchClient(): {
    get<T>(url: string): Promise<{ data: T }>
    post<T>(url: string, body?: unknown): Promise<{ data: T }>
    put<T>(url: string, body?: unknown): Promise<{ data: T }>
    del<T>(url: string): Promise<{ data: T }>
  }

  export function useNotification(): {
    toggleNotification(notification: {
      type: 'info' | 'warning' | 'danger' | 'success'
      message: string
      title?: string
      timeout?: number
    }): void
  }
}
