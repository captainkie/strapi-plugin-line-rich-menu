/**
 * `@strapi/design-system@1.19.0` ไม่ได้ ship ไฟล์ `.d.ts` มาเลยสักไฟล์ (ตรวจแล้ว: 0 ไฟล์ใน dist)
 * ภายใต้ `strict` ของ repo นี้ การ import จากแพ็กเกจที่ไม่มี type จึงเป็น error ไม่ใช่ implicit any
 *
 * ไฟล์นี้ประกาศเฉพาะ component และพร็อพที่ `primitives.tsx` ใช้จริง ไม่ใช่ทั้ง design system —
 * ตั้งใจให้แคบ เพราะทุกบรรทัดในนี้คือ "คำสัญญาที่เราเขียนเอง" ที่ TypeScript จะเชื่อโดยไม่มีใคร
 * ตรวจสอบให้ ยิ่งประกาศกว้างยิ่งมีที่ให้ผิดโดยไม่มีใครรู้ พร็อพทุกตัวด้านล่างถูกอ่านมาจาก
 * source ของ DS v1 โดยตรง (dist/**\/*.mjs) และถูกยืนยันด้วยเทสต์ที่ render จริงใน
 * tests/admin/primitives.test.tsx
 *
 * DS v2 (Strapi 5) มี type มาให้ครบ ไฟล์นี้จึงไม่ต้องย้ายไป Plan 04 — มันตายไปพร้อม v4
 */
declare module '@strapi/design-system' {
  import type { ComponentType, ReactElement, ReactNode } from 'react'

  /** พร็อพร่วมของทุกตัวที่สร้างจาก `Box` — เป็น styled-component จึงรับ `as` ได้ทั้งหมด */
  interface BoxLike {
    as?: string
    id?: string
    role?: string
    style?: Record<string, string | number>
    padding?: number
    paddingBottom?: number
    children?: ReactNode
  }

  export const Box: ComponentType<BoxLike>

  export const Flex: ComponentType<BoxLike & {
    direction?: 'row' | 'column'
    gap?: number
    /** ค่า default ของ DS คือ `center` ไม่ใช่ `stretch` ของ CSS — ดูคอมเมนต์ที่ Flex ใน primitives.tsx */
    alignItems?: string
    justifyContent?: string
    wrap?: 'wrap' | 'nowrap'
    /**
     * รับผ่าน `Box` (ตรวจจาก dist/Box/Box.js: `flex-grow: ${({ grow }) => grow}`) — DS v1 เองก็
     * map ไปที่ CSS `flex-grow` ตรง ๆ เหมือน DS v2 (ดูคอมเมนต์ที่ `ui.Flex.grow` ใน port.ts ของ
     * packages/ui — เหตุผลที่พร็อพนี้อยู่บน port แทนที่จะเป็น style ดิบ)
     */
    grow?: 0 | 1
  }>

  export const Typography: ComponentType<BoxLike & {
    variant?: string
    textColor?: string
    fontWeight?: string
  }>

  export const Button: ComponentType<{
    onClick?: () => void
    disabled?: boolean
    type?: 'button' | 'submit'
    variant?: 'default' | 'tertiary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'danger-light' | 'success-light'
    children?: ReactNode
    'data-testid'?: string
  }>

  /** `icon` ถูก `cloneElement` เสมอ — ต้องเป็น element ไม่ใช่สตริง (ดู IconButton ใน primitives.tsx) */
  export const IconButton: ComponentType<{
    onClick?: () => void
    label?: string
    disabled?: boolean
    icon: ReactElement
    'data-testid'?: string
  }>

  export const TextInput: ComponentType<{
    name: string
    value: string
    onChange(event: { target: { value: string } }): void
    /** ขาดทั้ง `label` และ `aria-label` แล้ว DS `throw` ทันที ไม่ใช่แค่เตือน */
    label?: string
    'aria-label'?: string
    hint?: string
    error?: string
    maxLength?: number
    disabled?: boolean
    placeholder?: string
    type?: string
    autoComplete?: string
  }>

  export const Textarea: ComponentType<{
    name: string
    value: string
    onChange(event: { target: { value: string } }): void
    label?: string
    'aria-label'?: string
    error?: string
    rows?: number
  }>

  /**
   * `DatePicker` ของ DS v1 ห่อ Field (label/hint/error) ให้เองครบทั้งก้อน (`DatePickerField` ใน
   * dist/DatePicker/DatePicker.mjs) — ต่างจาก DS v2 ที่ต้องห่อ `Field.Root` เอง (ดู primitives.tsx
   * ของ strapi-v5) พร็อพด้านล่างอ่านมาจาก source นั้นตรง ๆ เหมือนทุกตัวอื่นในไฟล์นี้: `selectedDate`/
   * `onChange` เป็น `Date | undefined` (ไม่ใช่ `null` — port ของเราแปลงให้ที่ primitives.tsx)
   */
  export const DatePicker: ComponentType<{
    id?: string
    name?: string
    label?: string
    'aria-label'?: string
    error?: string
    disabled?: boolean
    selectedDate?: Date
    onChange?(date: Date | undefined): void
  }>

  /**
   * `TimePicker` ของ DS v1 (`dist/TimePicker/TimePicker.mjs`) — ก็ห่อ Field ให้เองเหมือน
   * `DatePicker` ข้างบน `value` เป็นสตริง `'HH:mm'` เสมอ (formatter ภายในบังคับ 24 ชั่วโมง
   * `hour12: false`) ไม่ใช่ `Date` เพราะเวลาอย่างเดียวไม่มี "วัน" ผูกอยู่
   */
  export const TimePicker: ComponentType<{
    id?: string
    name?: string
    label?: string
    'aria-label'?: string
    error?: string
    disabled?: boolean
    value?: string
    onChange?(value: string | undefined): void
  }>

  /** DS v1 ส่ง "ค่าที่เลือก" มาตรง ๆ ไม่ใช่ event — ต่างจาก v2 ที่ห่อไว้ */
  export const Select: ComponentType<{
    name: string
    value: string
    onChange(value: string): void
    label?: string
    'aria-label'?: string
    error?: string
    disabled?: boolean
    children?: ReactNode
  }>

  export const Option: ComponentType<{ value: string; children?: ReactNode }>

  export const Checkbox: ComponentType<{
    name: string
    value: boolean
    onValueChange(checked: boolean): void
    children?: ReactNode
  }>

  /** ถือ value/onChange ของกลุ่มไว้ใน context แล้วแจกให้ `Radio` แต่ละตัวเอง */
  export const RadioGroup: ComponentType<{
    name: string
    value: string
    onChange(event: { target: { value: string } }): void
    labelledBy?: string
    children?: ReactNode
  }>

  export const Radio: ComponentType<{ value: string; children?: ReactNode }>

  export const ToggleInput: ComponentType<{
    name: string
    checked: boolean
    onChange(event: { target: { checked: boolean } }): void
    label?: string
    onLabel: string
    offLabel: string
  }>

  export const ModalLayout: ComponentType<{
    onClose(): void
    labelledBy?: string
    children?: ReactNode
  }>
  export const ModalHeader: ComponentType<{ closeLabel?: string; children?: ReactNode }>
  export const ModalBody: ComponentType<{ children?: ReactNode }>
  export const ModalFooter: ComponentType<{ startActions?: ReactNode; endActions?: ReactNode }>

  export const Alert: ComponentType<{
    variant?: 'default' | 'success' | 'warning' | 'danger'
    title?: string
    onClose?: () => void
    closeLabel?: string
    children?: ReactNode
  }>

  export const Divider: ComponentType<{ unsetMargin?: boolean }>
  export const Loader: ComponentType<{ small?: boolean; children?: ReactNode }>

  /** `children` ถูก `cloneElement` เช่นเดียวกับ `IconButton.icon` */
  export const Tooltip: ComponentType<{
    label?: string
    description?: string
    children: ReactElement
  }>

  export const ThemeProvider: ComponentType<{ theme: unknown; children?: ReactNode }>
  export const lightTheme: unknown

  /**
   * hook จริงของ DS v1 (ตรวจแล้ว: `exports.useTheme = hooks.useTheme` ใน dist/index.js) คืนธีมของ
   * Strapi ที่ `ThemeProvider` วางไว้ใน context ของ styled-components ตรงนั้น — สี่ตัวนี้คือทั้งหมด
   * ที่ `port.tsx` ใช้ประกอบ `UIPort.theme` (สเปกงานนี้ #5) ประกาศไว้แคบเท่าที่ใช้จริงเหมือนสมาชิก
   * อื่นทุกตัวในไฟล์นี้ ไม่ใช่ทั้ง `DefaultTheme` ของ Strapi — `Record<string, string>` ใช้ไม่ได้ที่นี่
   * เพราะ `noUncheckedIndexedAccess` ของ repo นี้จะทำให้ทุก index access เป็น `string | undefined`
   */
  export function useTheme(): {
    colors: {
      neutral150: string
      neutral200: string
      neutral600: string
      neutral800: string
    }
  }

  /** `<main>` ที่โฟกัสได้ตอนเปลี่ยนหน้า (สเปกการเข้าถึงของ Strapi เอง) — ไม่มีพร็อพที่ใช้จริงที่นี่ */
  export const Main: ComponentType<{ children?: ReactNode }>

  /**
   * ส่วนหัวมาตรฐานของหน้าแอดมิน — วาด `<h1>` จริงจาก `title`, พร็อพที่เหลือเป็น optional ทั้งหมด
   * `primaryAction` มักเป็นกลุ่มปุ่มที่มุมขวาบน (ดู primitives.tsx: `ui.Page`)
   */
  export const HeaderLayout: ComponentType<{
    title: string
    subtitle?: ReactNode
    primaryAction?: ReactNode
    secondaryAction?: ReactNode
    navigationAction?: ReactNode
  }>

  /** ให้ padding ซ้าย-ขวาของเนื้อหาหน้า อยู่ใต้ `HeaderLayout` เสมอ */
  export const ContentLayout: ComponentType<{ children?: ReactNode }>
}
