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
  /**
   * ตัวเลือกวันที่ — สเปกงานนี้ #4 ("อย่าวาดปฏิทินเอง") ยืมจาก design system ของแต่ละเวอร์ชันแทน:
   * DS v1 (Strapi 4) มี `DatePicker` ที่ห่อ Field ให้เองครบ ส่วน DS v2 (Strapi 5) ก็มี `DatePicker`
   * เหมือนกันแต่ต้องห่อ `Field.Root` เอง (ดูแพทเทิร์นเดียวกับ `TextInput` ในไฟล์ primitives.tsx
   * ของแต่ละ adapter) — ทั้งสองเวอร์ชันจึงได้ธีมมืด/สว่างของ Strapi, คีย์บอร์ด, locale และ
   * accessibility มาฟรี ไม่ต้องเขียนเอง
   *
   * `value`/`onChange` เป็น `Date | null` ตรง ๆ ตาม prop ของ DS ทั้งสองเวอร์ชัน (ซึ่งใช้ `Date`
   * เหมือนกัน ต่างแค่ `undefined` vs `| null` — ที่นี่บังคับ `| null` ให้ตรงกับแพทเทิร์น optional
   * อื่นทั้งไฟล์นี้) เก็บแค่ "วันที่" (เวลาในนั้นไม่มีความหมาย ใช้ `ui.TimePicker` แยกสำหรับเวลา)
   */
  DatePicker: ComponentType<{ name: string; value: Date | null; onChange: (value: Date | null) => void; label?: string; error?: string; disabled?: boolean }>
  /**
   * ตัวเลือกเวลา — คู่กับ `ui.DatePicker` ด้านบนเสมอ (LINE เองก็แยกวันที่/เวลาเป็นสองช่อง ไม่ใช่
   * ช่องเดียว — ดูคอมเมนต์ที่ `MainSettings.tsx`) `value` เป็นสตริง `'HH:mm'` แบบ 24 ชั่วโมงเสมอ
   * (รูปแบบเดียวกับที่ DS ทั้งสองเวอร์ชันใช้ภายใน) ไม่ใช่ `Date` เพราะเวลาอย่างเดียวไม่มี "วัน" ผูกอยู่
   */
  TimePicker: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; error?: string; disabled?: boolean }>
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
  /**
   * padding, max-width และหัวหน้า (header) เป็นเรื่อง **version-specific** เหมือนสมาชิกอื่นทุก
   * ตัวในไฟล์นี้ — DS v1 (Strapi 4) ให้ `HeaderLayout`/`ContentLayout` มาจาก `@strapi/design-system`
   * ส่วน DS v2 (Strapi 5) ย้ายชุดเดียวกันไปอยู่ที่ `Layouts`/`Page` ของ `@strapi/admin/strapi-admin`
   * แทน คนละแพ็กเกจคนละพร็อพ ถ้า `packages/ui` วาดกรอบเองด้วย `<div style={{ padding: ... }}>`
   * เลขที่ hardcode ไว้จะดูใกล้เคียงของจริงวันนี้ แต่หลุดจาก spacing ของ Strapi ทันทีที่ DS
   * เวอร์ชันถัดไปเปลี่ยนสเกล และเป็นคัปปลิ้งที่ผูก `packages/ui` เข้ากับรายละเอียดของแอดมินโดยตรง
   * ซึ่งเป็นสิ่งที่ port ทั้งไฟล์นี้มีไว้กันอยู่แล้ว — `Page` จึงเป็น component ที่แต่ละ adapter
   * จับคู่กับ layout จริงของเวอร์ชันตัวเอง เหมือน primitive ตัวอื่นทุกตัว ไม่ใช่ markup ดิบที่ฝังอยู่
   * ใน component ที่ไม่รู้จัก Strapi เลย (เช่น `pages/List.tsx` ที่เดิมวาด `ui.Flex` เปล่า ๆ เป็นราก)
   *
   * `title`/`actions` อยู่ในนี้ด้วยเพราะ layout component ของทั้งสองเวอร์ชัน "เป็นเจ้าของ" ส่วนหัว
   * ของหน้า (padding, พื้นหลัง, ตำแหน่งของ primaryAction) อยู่แล้ว — แยก `Page` (padding อย่างเดียว)
   * ออกจากหัวข้อเป็นสองสมาชิกจะบังคับให้ทุกจุดเรียกต้องใช้คู่กันเสมอ โดยไม่ได้ประโยชน์อะไรเพิ่ม
   */
  Page: ComponentType<{ title: string; subtitle?: string; actions?: ReactNode; children?: ReactNode }>
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

/**
 * สีจากธีมของ Strapi ที่ต้องใช้ตรง ๆ นอกเหนือจาก `ui.Typography`/พร็อพสำเร็จรูปของ primitive ตัวอื่น
 * (งานนี้ #5 — dark mode) — `CanvasEditor`/`AreaList`/`TemplatePicker` เคย hardcode ค่าพวกนี้เป็น
 * hex ของธีมสว่างตรง ๆ (`#dcdce4`, `#eaeaef`, `#32324d`, `#666687` — ตรวจแล้วเป็นค่าเดียวกับ
 * `colors.neutral200/150/800/600` ของ `@strapi/design-system` เป๊ะ ไม่ใช่เรื่องบังเอิญ) พอ Strapi
 * อยู่ในธีมมืด สีพวกนี้จึงกลายเป็นเส้นขอบซีดและตัวอักษรเกือบดำบนพื้นเข้ม อ่านไม่ออก
 *
 * ทำไมไม่ใช้ `ui.Typography`/`ui.Box` แทนไปเลย: `Typography` คุมได้แค่สีตัวอักษร ไม่มีพื้นหลัง และ
 * variant ของมันมีขนาดตัวอักษรตายตัวตาม DS ซึ่งไม่ตรงกับ label กำหนดขนาดเอง (`fontSize: '1.5rem'`)
 * ที่ CanvasEditor วาดทับ canvas อยู่แล้ว — เพิ่มสมาชิกตรงนี้แทนเพิ่ม `ui.Box` ใหม่ทั้งตัว เพราะที่ต้อง
 * ใช้จริงมีแค่ "ค่าสี" ไม่ใช่ component ใหม่ (เหตุผลเดียวกับที่ `OUTLINE_COLOR`/`ACTIVE_FILL` ใน
 * styles.ts เป็นค่าคงที่ ไม่ใช่ component)
 *
 * `CanvasEditor`/`Preview` ยกเว้นจากตัวนี้เฉพาะสีของ LINE เอง (วอลเปเปอร์ #8ba7d0, เขียว LINE) —
 * ไม่ใช่ตัว `theme` นี้ ซึ่งเป็นสี "chrome" ของ Strapi ที่ควรตามธีมเสมอ (ดูคอมเมนต์ที่หัวไฟล์
 * CanvasEditor.tsx และคอมเมนต์ตรงจุดที่ใช้แต่ละสี)
 */
export interface ThemeColors {
  /** เส้นขอบพาเนล/การ์ด — เทียบเท่า `colors.neutral200` (แทน `#dcdce4` เดิม) */
  border: string
  /** พื้นหลังพาเนลเรียบ เช่น ผืนผ้าใบก่อนมีรูป — เทียบเท่า `colors.neutral150` (แทน `#eaeaef` เดิม) */
  surface: string
  /** ข้อความ/ไอคอนเข้ม — เทียบเท่า `textColor="neutral800"` ของ Typography (แทน `#32324d` เดิม) */
  strongText: string
  /** ข้อความ/ไอคอนรอง — เทียบเท่า `textColor="neutral600"` ของ Typography (แทน `#666687` เดิม) */
  mutedText: string
}

export interface UIPort {
  ui: UIPrimitives
  http: HttpClient
  toast(message: ToastMessage): void
  nav: Nav
  /** สเปก §12 — ข้อความที่ผู้ใช้เห็นต้องผ่านตัวนี้เสมอ ห้าม hardcode ใน component */
  t(key: string, values?: Record<string, string | number>): string
  theme: ThemeColors
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
