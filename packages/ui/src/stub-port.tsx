import { createContext, useContext } from 'react'
import type { HttpClient, UIPort, UIPrimitives } from './port.js'

/**
 * ทางที่ `RadioGroup` ส่ง name/ค่าที่เลือกอยู่/ตัวรับค่ากลับ ลงไปถึง `Radio` แต่ละตัว
 *
 * ใช้ context แทน cloneElement เพราะ cloneElement เห็นแค่ลูกชั้นเดียว — พอผู้เรียกห่อสมาชิก
 * ไว้ใน wrapper (เช่น `<ui.Flex>` หรือ fragment ที่ map ออกมา) สมาชิกจะหลุดจากกลุ่มเงียบ ๆ
 * กลายเป็น radio ที่กดแล้วไม่มีอะไรเกิดขึ้น โดยไม่มี type error ใดเตือน
 */
const RadioGroupContext = createContext<
  { name: string; value: string; onChange: (value: string) => void } | null
>(null)

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
  TextInput: ({ name, value, onChange, label, hint, error, maxLength, disabled, placeholder, type = 'text', autoComplete }) => (
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
          autoComplete={autoComplete}
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
  RadioGroup: ({ name, value, onChange, label, children }) => (
    // <fieldset> + <legend> คือรูปเดียวที่ตั้งชื่อให้ "กลุ่ม" ได้จริงโดยไม่ต้องผูก id เอง
    // ระบุ role="radiogroup" ตรง ๆ เพราะ role โดยกำเนิดของ fieldset คือ "group" เฉย ๆ
    <fieldset role="radiogroup" style={{ border: 'none', margin: 0, padding: 0 }}>
      {label === undefined ? null : <legend>{label}</legend>}
      <RadioGroupContext.Provider value={{ name, value, onChange }}>
        {children}
      </RadioGroupContext.Provider>
    </fieldset>
  ),
  Radio: ({ value, children }) => {
    const group = useContext(RadioGroupContext)
    if (group === null) {
      throw new Error('ui.Radio ถูกวางไว้นอก ui.RadioGroup — สมาชิกต้องอยู่ในกลุ่มที่ถือค่าให้เสมอ')
    }
    return (
      <label>
        <input
          type="radio"
          name={group.name}
          value={value}
          checked={group.value === value}
          onChange={() => group.onChange(value)}
        />
        {children}
      </label>
    )
  },
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
  // 'span' เป็นค่าเริ่มต้นเพื่อให้จุดเรียกเดิมที่ไม่ได้ระบุ `as` ออกมาเหมือนเดิมทุกประการ
  Typography: ({ as: Tag = 'span', children }) => <Tag>{children}</Tag>,
  // ต้องวาด alignItems/justifyContent/wrap ให้ครบ ไม่ใช่รับมาแล้วทิ้ง — ตอนที่ทิ้ง ผังสองคอลัมน์
  // ของสเปก §5.7 ไม่เคยถูกวาดเป็นสองคอลัมน์เลยสักครั้ง ทั้งในเทสต์และใน playground ที่เปิดดูด้วยตา
  // ทุกอย่างที่เราตรวจกันมาคือคอลัมน์เดียวที่ทำท่าเหมือนสองคอลัมน์
  //
  // `gap` ที่ port ประกาศคือลำดับใน spacing scale แต่ตรงนี้วาดเป็นพิกเซลดิบ — เป็นค่าประมาณที่
  // ยอมรับไว้โดยรู้ตัว ไม่ใช่ความไม่ตรงกันแบบเงียบ ๆ: jsdom ไม่คำนวณ layout อยู่แล้ว เทสต์จึงไม่มีทาง
  // เห็นความต่าง ส่วน playground ต้องการแค่ระยะห่างที่ "พอดูออก" ไม่ใช่ระยะที่ตรงกับแอดมินจริงเป๊ะ
  Flex: ({ direction = 'row', gap = 0, alignItems, justifyContent, wrap, children }) => (
    <div style={{ display: 'flex', flexDirection: direction, gap, alignItems, justifyContent, flexWrap: wrap }}>
      {children}
    </div>
  ),
  Divider: () => <hr />,
  Alert: ({ variant, title, children }) => (
    <div role="status" data-variant={variant}>{title}{children}</div>
  ),
  Loader: ({ children }) => <div role="progressbar">{children}</div>,
  Tooltip: ({ label, children }) => <span title={label}>{children}</span>,
  // `title` ต้องเป็น <h1> จริง ไม่ใช่ <div> — เทสต์ของ packages/ui (เช่น editor.test.tsx) ไล่หา
  // หัวข้อหน้าด้วย getByRole('heading', { level: 1 }) เพื่อยืนยันว่าหน้าไม่ใช่ span ที่แค่ตัวโต
  // (ดูคอมเมนต์เดียวกันที่ Typography ด้านบน) ถ้า stub วาดเป็น <div> เฉย ๆ เทสต์เหล่านั้นจะหาไม่เจอ
  // ทั้งที่ adapter จริงทั้งสองตัว (v4 ผ่าน HeaderLayout, v5 ผ่าน Layouts.Header) มี <h1> จริงอยู่แล้ว
  Page: ({ title, subtitle, actions, children }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>{title}</h1>
          {subtitle === undefined ? null : <p>{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div>{children}</div>
    </div>
  ),
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

/**
 * client ที่ reject ทุกเมธอด — คือรูปที่ adapter ต้องทำให้ได้เมื่อเซิร์ฟเวอร์ตอบ non-2xx
 * (ดูข้อกำหนดบน `HttpClient` ใน port.ts)
 *
 * มีไว้ให้เทสต์ยืนยันทางเดินของความล้มเหลวได้จริง ไม่ใช่ปล่อยให้ข้อกำหนดนั้นเป็นแค่คอมเมนต์:
 * stub ปกติ resolve ทุกอย่างเป็น `{}` ซึ่งหน้าจอแยกไม่ออกจาก "โหลดสำเร็จแต่ไม่มีข้อมูล"
 * เทสต์ที่ใช้ตัวนี้จึงเป็นหลักฐานเดียวที่บอกว่าหน้าจอมี error state จริงเมื่อ request ล้ม
 */
export function createRejectingHttpClient(reason: unknown = new Error('stub_http_rejected')): HttpClient {
  const reject = async (): Promise<never> => { throw reason }
  return { get: reject, post: reject, put: reject, del: reject }
}

/**
 * ค่าของธีมสว่างของ Strapi ตรง ๆ (ตรวจแล้วตรงกับ `colors.neutral200/150/800/600` ของ
 * `@strapi/design-system` — ดูคอมเมนต์ที่ `ThemeColors` ใน port.ts) เทสต์กับ playground ของแพ็กเกจนี้
 * ไม่มีธีมมืดให้สลับ (ไม่ใช่ Strapi จริง) ค่าคงที่ชุดเดียวจึงพอ — adapter จริงสองตัวเป็นคนอ่านค่า
 * จากธีมของ Strapi เองแล้วสลับตามธีมมืด/สว่างจริง (ดู usePluginPort ของ strapi-v4/v5)
 */
const LIGHT_THEME_COLORS = {
  border: '#dcdce4',
  surface: '#eaeaef',
  strongText: '#32324d',
  mutedText: '#666687',
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
    theme: LIGHT_THEME_COLORS,
    ...overrides,
  }
}
