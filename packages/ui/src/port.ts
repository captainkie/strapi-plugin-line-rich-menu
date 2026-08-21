import { createContext, createElement, useContext, type ComponentType, type ReactNode } from 'react'

/**
 * component ทุกตัวของแพ็กเกจนี้วาดด้วยชุดนี้ ไม่ใช่ด้วย Design System โดยตรง
 * Strapi 4 ใช้ DS v1 และ Strapi 5 ใช้ DS v2 ซึ่ง API ต่างกันมาก การรับผ่าน port
 * ทำให้เขียน component ครั้งเดียวแล้ว adapter สองตัวเป็นคนจับคู่ให้เอง
 */
export interface UIPrimitives {
  /** `testId` คือ data-testid ที่ต้องลงเอยบน element ที่ toBeDisabled()/click จับต้องได้จริง — adapter แต่ละตัว map ไปยังพร็อพที่ design system ของตัวเองรับ หรือ spread ตรง ๆ ก็ได้ */
  Button: ComponentType<{ onClick?: () => void; disabled?: boolean; variant?: 'default' | 'secondary' | 'danger'; type?: 'button' | 'submit'; children?: ReactNode; testId?: string }>
  IconButton: ComponentType<{ onClick?: () => void; label: string; disabled?: boolean; children?: ReactNode; testId?: string }>
  /**
   * `type: 'password'` มาสก์ bearer credential เช่น LINE channel access token — ค่า default 'text' ทำให้จุดเรียกเดิมไม่ต้องแก้
   *
   * `autoComplete` ต้องไปถึง attribute `autocomplete` ของ `<input>` จริง ไม่ใช่ถูก adapter กลืนทิ้ง:
   * ช่องที่เป็น `type="password"` แต่ไม่ได้บอกอะไรไว้ จะถูกเบราว์เซอร์เสนอให้ "บันทึกรหัสผ่าน"
   * แล้ว token ของ LINE จะไปนอนอยู่ใน credential store ของผู้ใช้และซิงก์ข้ามเครื่องเขาไปด้วย
   */
  TextInput: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; hint?: string; error?: string; maxLength?: number; disabled?: boolean; placeholder?: string; type?: 'text' | 'password'; autoComplete?: string }>
  Textarea: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; error?: string; rows?: number }>
  Select: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; error?: string; disabled?: boolean; children?: ReactNode }>
  Option: ComponentType<{ value: string; children?: ReactNode }>
  Checkbox: ComponentType<{ name: string; checked: boolean; onChange: (checked: boolean) => void; children?: ReactNode }>
  /**
   * กลุ่มเป็นเจ้าของทั้ง `value` และ `onChange` ส่วนสมาชิกบอกแค่ว่าตัวเองคือค่าไหน — ไม่ใช่
   * radio เดี่ยว ๆ ที่ถือ `checked` ของตัวเองแล้วจับกลุ่มกันด้วย attribute `name` เฉย ๆ
   *
   * DS v2 (Strapi 5) วางอยู่บน Radix ซึ่ง radio group คือ `Root` ที่ถือ value/onValueChange
   * ครอบ `Item` — `Item` ที่อยู่นอก `Root` ใช้ไม่ได้เลย ถ้า port ไม่มีที่ให้วาด `Root` adapter
   * ฝั่ง v5 จะไม่มีทาง implement ได้ไม่ว่าจะเขียนภายในตัวเองเก่งแค่ไหน รูปนี้จึงลง Radix ได้ตรง ๆ
   * และฝั่ง v4 ก็แค่ `<fieldset>` ครอบ radio ของ DS v1 ตามเดิม
   *
   * `label` ต้องลงเอยเป็นชื่อของกลุ่มใน accessibility tree (เช่น `<legend>` ของ `<fieldset>`)
   * ไม่ใช่ข้อความลอย ๆ ข้าง ๆ ไม่งั้นคนใช้ screen reader จะได้ยิน radio หลายตัวโดยไม่รู้ว่าตัวไหนคู่กับตัวไหน
   */
  RadioGroup: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; children?: ReactNode }>
  Radio: ComponentType<{ value: string; children?: ReactNode }>
  Toggle: ComponentType<{ name: string; checked: boolean; onChange: (checked: boolean) => void; label?: string }>
  Modal: ComponentType<{ open: boolean; onClose: () => void; title: string; footer?: ReactNode; children?: ReactNode }>
  /**
   * `variant` คุมแค่ขนาด/น้ำหนักตัวอักษร ส่วน `as` คือ element ที่ออกมาจริง — ต้องแยกกัน เพราะ
   * ไม่มี `as` แปลว่าไม่มีอะไรในแพ็กเกจนี้เป็นหัวข้อได้เลย หน้า editor จึงเคยไม่มี `<h1>`/`<h2>`
   * สักตัว คนใช้ screen reader ที่ไล่หน้าด้วยรายการหัวข้อ (วิธีปกติที่สุด) ได้หน้าเปล่า
   * ทั้งที่ตาเห็นหัวข้ออยู่หลายอัน — Typography ของ DS ทั้งสองเวอร์ชันรับ `as`/`tag` อยู่แล้ว
   */
  Typography: ComponentType<{ variant?: 'alpha' | 'beta' | 'delta' | 'omega' | 'pi'; textColor?: 'neutral600' | 'neutral800' | 'danger600' | 'success600' | 'warning600'; as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span'; children?: ReactNode }>
  /**
   * `alignItems` กับ `justifyContent` ใช้ union คนละชุด เพราะ CSS สองตัวนี้รับค่าไม่เหมือนกัน —
   * เดิมใช้ชุดเดียวกันทั้งคู่ ทำให้เขียน `alignItems="space-between"` (ไม่ใช่ค่าของ align-items)
   * หรือ `justifyContent="baseline"` (ไม่ใช่ค่าของ justify-content) ได้โดยไม่มี type error
   * แล้วไปเงียบ ๆ ตอน render จริง เพราะเบราว์เซอร์ทิ้งค่าที่ไม่รู้จักโดยไม่บ่น
   *
   * `gap` คือ "ลำดับใน spacing scale ของ design system" ไม่ใช่พิกเซล — DS ทั้งสองเวอร์ชันรับเลข
   * แบบนี้ (`gap={4}` ≈ 16px ในแอดมินจริง) adapter จึงส่งต่อได้ตรง ๆ ไม่ต้องแปลง ส่วน stub วาดเป็น
   * พิกเซลดิบ ซึ่งเป็นค่าประมาณที่ยอมรับไว้แล้ว (ดูคอมเมนต์ที่ Flex ใน stub-port.tsx)
   */
  Flex: ComponentType<{ direction?: 'row' | 'column'; gap?: number; alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline'; justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly'; wrap?: 'wrap' | 'nowrap'; children?: ReactNode }>
  Divider: ComponentType<Record<string, never>>
  Alert: ComponentType<{ variant: 'success' | 'warning' | 'danger'; title?: string; onClose?: () => void; children?: ReactNode }>
  Loader: ComponentType<{ children?: ReactNode }>
  Tooltip: ComponentType<{ label: string; children?: ReactNode }>
}

/**
 * ตัว client ต้องคงที่ข้าม render (referentially stable) — `RichMenuList` ใส่ `http` ไว้ใน
 * dependency array ของ `useEffect` adapter ที่ประกอบ port ขึ้นใหม่กลางฟังก์ชัน component
 * (เช่น `{ http: { get: (u) => useFetchClient().get(u) ... } }` เขียนสด ๆ ใน JSX) จะได้ object
 * ใหม่ทุกรอบ render ทำให้ effect ยิงซ้ำไม่รู้จบ รายการเมนูกะพริบเป็นค่าว่างทุกครั้งที่ parent
 * re-render — สร้างครั้งเดียวไว้นอก component หรือห่อด้วย `useMemo` เสมอ
 *
 * ข้อกำหนดของแต่ละเมธอดอยู่ที่ตัวเมธอดเอง — ทั้งสี่ตัวใช้กติกา "ไม่ใช่ 2xx ต้อง reject" ร่วมกัน
 */
export interface HttpClient {
  /**
   * ต้อง reject เมื่อ HTTP status ไม่ใช่ 2xx — component ทุกตัวในแพ็กเกจนี้แสดงความล้มเหลวผ่าน
   * promise ที่ reject อย่างเดียว ไม่มีที่ไหนอ่าน status code เอง (ดู `ChannelSettings`,
   * `RichMenuList`, `ImageField`) adapter ที่เขียนทับด้วย `fetch()` เปล่า ๆ โดยไม่เช็ค `res.ok`
   * จะ resolve ให้กับ 403/500 ด้วย ผลคือผู้ใช้เห็นรายการ channel ว่าง รายการเมนูว่าง และการอัปโหลด
   * ที่ "สำเร็จ" ทั้งที่ไม่มีอะไรถูกอัปเลย — ทั้งหมดนี้ไม่มี error ให้เห็นสักจุดเดียว
   */
  get<T>(url: string): Promise<T>
  /**
   * `body` ที่เป็น `FormData` ต้องส่งต่อให้ transport ตามเดิม ห้าม `JSON.stringify` และห้ามตั้ง
   * `Content-Type` เอง (ต้องปล่อยให้เบราว์เซอร์ใส่ boundary ให้) — `ImageField` อัปรูปด้วย FormData
   * ทางนี้ทางเดียว adapter ที่ stringify ทุก body เหมือนกันหมดจะส่ง `{}` ออกไป การอัปรูปจึงล้มทุกครั้ง
   * โดยผู้ใช้เห็นแค่ "อัปโหลดไม่สำเร็จ" ไม่มีอะไรชี้ว่าสาเหตุอยู่ที่ adapter — `body?: unknown`
   * ไม่ได้บอกเรื่องนี้ด้วยตัวมันเอง
   */
  post<T>(url: string, body?: unknown): Promise<T>
  /** กติกาเดียวกับ `post` ทั้งเรื่อง non-2xx และการส่ง `FormData` ต่อโดยไม่แปลง */
  put<T>(url: string, body?: unknown): Promise<T>
  /** กติกาเดียวกับ `get` — non-2xx ต้อง reject ไม่ใช่ resolve เป็นค่าว่าง */
  del<T>(url: string): Promise<T>
}

export interface ToastMessage {
  type: 'success' | 'warning' | 'danger'
  message: string
}

export interface Nav {
  push(path: string): void
  Link: ComponentType<{ to: string; children?: ReactNode }>
}

export interface UIPort {
  ui: UIPrimitives
  http: HttpClient
  toast(message: ToastMessage): void
  nav: Nav
  /** สเปก §12 — ข้อความที่ผู้ใช้เห็นต้องผ่านตัวนี้เสมอ ห้าม hardcode ใน component */
  t(key: string, values?: Record<string, string | number>): string
}

const PortContext = createContext<UIPort | null>(null)

export function PortProvider({ value, children }: { value: UIPort; children: ReactNode }) {
  return createElement(PortContext.Provider, { value }, children)
}

export function usePort(): UIPort {
  const port = useContext(PortContext)
  if (port === null) {
    throw new Error(
      'usePort ถูกเรียกนอก PortProvider — adapter ต้องครอบหน้าจอด้วย <PortProvider value={...}>',
    )
  }
  return port
}
