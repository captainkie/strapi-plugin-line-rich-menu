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
}
