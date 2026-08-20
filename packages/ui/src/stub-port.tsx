import type { UIPort, UIPrimitives } from './port.js'

/**
 * implementation ครบชุดที่ไม่พึ่ง Strapi เลย ใช้สองที่:
 * เทสต์ของแพ็กเกจนี้ทั้งหมด และ playground ที่เปิดดูในเบราว์เซอร์
 *
 * ถ้าเทสต์ทุกตัวรันผ่านชุดนี้ได้ แปลว่า component ไม่ได้แอบพึ่ง DS จริงอยู่
 */
const primitives: UIPrimitives = {
  Button: ({ onClick, disabled, variant = 'default', type = 'button', children, testId }) => (
    <button type={type} onClick={onClick} disabled={disabled} data-variant={variant} data-testid={testId}>{children}</button>
  ),
  IconButton: ({ onClick, label, disabled, children, testId }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} data-testid={testId}>{children}</button>
  ),
  TextInput: ({ name, value, onChange, label, hint, error, maxLength, disabled, placeholder, type = 'text' }) => (
    // hint/error อยู่นอก <label> โดยตั้งใจ — ถ้าอยู่ข้างในด้วย textContent ของ <label> จะกลาย
    // เป็น "label + hint" รวมกัน ทำให้ getByLabelText(label) หา element ไม่เจอ (ต้อง exact match)
    // การ implicit-wrap (label ครอบ input) ยังทำงานได้เหมือนเดิม แค่ครอบเฉพาะ label กับ input
    <div>
      <label>
        {label}
        <input
          type={type}
          name={name}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {hint ? <small>{hint}</small> : null}
      {error ? <span id={`${name}-error`} role="alert">{error}</span> : null}
    </div>
  ),
  Textarea: ({ name, value, onChange, label, error, rows = 3 }) => (
    <label>
      {label}
      <textarea name={name} value={value} rows={rows} onChange={(e) => onChange(e.target.value)} />
      {error ? <span role="alert">{error}</span> : null}
    </label>
  ),
  Select: ({ name, value, onChange, label, error, disabled, children }) => (
    <label>
      {label}
      <select name={name} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      {error ? <span role="alert">{error}</span> : null}
    </label>
  ),
  Option: ({ value, children }) => <option value={value}>{children}</option>,
  Checkbox: ({ name, checked, onChange, children }) => (
    <label>
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  ),
  Radio: ({ name, value, checked, onChange, children }) => (
    <label>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} />
      {children}
    </label>
  ),
  Toggle: ({ name, checked, onChange, label }) => (
    <label>
      {label}
      <input type="checkbox" role="switch" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  ),
  Modal: ({ open, onClose, title, footer, children }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {footer}
        <button type="button" onClick={onClose}>close</button>
      </div>
    ) : null,
  Typography: ({ children }) => <span>{children}</span>,
  Flex: ({ direction = 'row', gap = 0, children }) => (
    <div style={{ display: 'flex', flexDirection: direction, gap }}>{children}</div>
  ),
  Divider: () => <hr />,
  Alert: ({ variant, title, children }) => (
    <div role="status" data-variant={variant}>{title}{children}</div>
  ),
  Loader: ({ children }) => <div role="progressbar">{children}</div>,
  Tooltip: ({ label, children }) => <span title={label}>{children}</span>,
}

/**
 * stub ของ `t` — ไม่ใช่ library แปลภาษา แค่ replace `{name}` ด้วยค่าจาก `values` ทีละคู่
 * ไม่มี `values` หรือไม่มีคู่ไหนตรงกับ key เลยก็คืน key เดิมไม่เปลี่ยนแปลง
 */
function defaultT(key: string, values?: Record<string, string | number>): string {
  if (values === undefined) return key
  return Object.entries(values).reduce(
    // ข้อความบางอันใช้ placeholder เดิมซ้ำมากกว่าหนึ่งจุด (เช่น "{name} ของ {name}")
    // .replace() แบบ non-global แทนแค่จุดแรก จุดที่เหลือหลุดออกไปเป็น literal `{name}`
    // ในข้อความที่ผู้ใช้เห็นจริง — ต้องแทนทุกจุดที่ตรงกัน
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    key,
  )
}

export function createStubPort(overrides: Partial<UIPort> = {}): UIPort {
  return {
    ui: primitives,
    http: {
      get: async () => ({}) as never,
      post: async () => ({}) as never,
      put: async () => ({}) as never,
      del: async () => ({}) as never,
    },
    toast: () => {},
    nav: { push: () => {}, Link: ({ to, children }) => <a href={to}>{children}</a> },
    t: defaultT,
    ...overrides,
  }
}
