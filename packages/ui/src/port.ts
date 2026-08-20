import { createContext, createElement, useContext, type ComponentType, type ReactNode } from 'react'

/**
 * component ทุกตัวของแพ็กเกจนี้วาดด้วยชุดนี้ ไม่ใช่ด้วย Design System โดยตรง
 * Strapi 4 ใช้ DS v1 และ Strapi 5 ใช้ DS v2 ซึ่ง API ต่างกันมาก การรับผ่าน port
 * ทำให้เขียน component ครั้งเดียวแล้ว adapter สองตัวเป็นคนจับคู่ให้เอง
 */
export interface UIPrimitives {
  Button: ComponentType<{ onClick?: () => void; disabled?: boolean; variant?: 'default' | 'secondary' | 'danger'; type?: 'button' | 'submit'; children?: ReactNode }>
  IconButton: ComponentType<{ onClick?: () => void; label: string; disabled?: boolean; children?: ReactNode }>
  TextInput: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; hint?: string; error?: string; maxLength?: number; disabled?: boolean; placeholder?: string }>
  Textarea: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; error?: string; rows?: number }>
  Select: ComponentType<{ name: string; value: string; onChange: (value: string) => void; label?: string; error?: string; disabled?: boolean; children?: ReactNode }>
  Option: ComponentType<{ value: string; children?: ReactNode }>
  Checkbox: ComponentType<{ name: string; checked: boolean; onChange: (checked: boolean) => void; children?: ReactNode }>
  Radio: ComponentType<{ name: string; value: string; checked: boolean; onChange: (value: string) => void; children?: ReactNode }>
  Toggle: ComponentType<{ name: string; checked: boolean; onChange: (checked: boolean) => void; label?: string }>
  Modal: ComponentType<{ open: boolean; onClose: () => void; title: string; footer?: ReactNode; children?: ReactNode }>
  Typography: ComponentType<{ variant?: 'alpha' | 'beta' | 'delta' | 'omega' | 'pi'; textColor?: 'neutral600' | 'neutral800' | 'danger600' | 'success600' | 'warning600'; children?: ReactNode }>
  Flex: ComponentType<{ direction?: 'row' | 'column'; gap?: number; alignItems?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'baseline'; justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'baseline'; wrap?: 'wrap' | 'nowrap'; children?: ReactNode }>
  Divider: ComponentType<Record<string, never>>
  Alert: ComponentType<{ variant: 'success' | 'warning' | 'danger'; title?: string; onClose?: () => void; children?: ReactNode }>
  Loader: ComponentType<{ children?: ReactNode }>
  Tooltip: ComponentType<{ label: string; children?: ReactNode }>
}

export interface HttpClient {
  get<T>(url: string): Promise<T>
  post<T>(url: string, body?: unknown): Promise<T>
  put<T>(url: string, body?: unknown): Promise<T>
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
