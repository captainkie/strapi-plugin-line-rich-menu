import { createContext, isValidElement, useContext, useState, type ReactNode } from 'react'
import {
  Alert as DsAlert, Box, Button as DsButton, Checkbox as DsCheckbox, Divider as DsDivider,
  Field, Flex as DsFlex, IconButton as DsIconButton, Loader as DsLoader, Modal as DsModal,
  Radio as DsRadio, SingleSelect, SingleSelectOption, Textarea as DsTextarea,
  TextInput as DsTextInput, Toggle as DsToggle, Tooltip as DsTooltip, Typography as DsTypography,
} from '@strapi/design-system'
import { usePort, type UIPrimitives } from '@fosivo/line-rich-menu-ui'

/**
 * จับคู่ Design System v2 เข้ากับ `UIPort` — ไฟล์นี้คือ **ทั้งหมด** ที่ต่างจาก v4 ในฝั่ง UI
 * ทุก component ของ `packages/ui` วาดผ่านชุดนี้ ไม่มีตัวไหน import DS โดยตรง (สเปก §5.1)
 *
 * ความต่างเชิงโครงสร้างสามข้อระหว่าง v1 กับ v2 ที่กระจายอยู่ทั้งไฟล์:
 *
 * 1. **อินพุตไม่ถือ label/hint/error ของตัวเองอีกแล้ว** — ทั้งสามย้ายไป `Field.Root` +
 *    `Field.Label` + `Field.Hint` + `Field.Error` ที่ครอบอยู่ อินพุตที่ไม่ถูกครอบจะไม่มีชื่อ
 *    ใน accessibility tree เลย ซึ่งไม่ใช่เรื่องความสวยงามแต่คือช่องที่ screen reader อ่านไม่ออก
 * 2. **พร็อพ polymorphic เปลี่ยนจาก `as` เป็น `tag`** — ตรวจกับ DS 2.2.4 จริงแล้วได้ผลนี้:
 *    ส่ง `as` ยัง "ได้ element ตามที่ขอ" อยู่ เพราะ Typography เป็น styled-component และ
 *    styled-components v6 รู้จัก `as` ของมันเอง แต่มันข้าม Box ของ DS ไปเลย ผลลัพธ์คือ
 *    `<h2 tag="span" class="…">` — มี attribute `tag` หลุดลง DOM และคลาสของ Box หายไปหนึ่งตัว
 *    `tag` จึงเป็นทางเดียวที่ถูก ส่วนสิ่งที่ทำให้ทั้งหน้าไม่มีหัวข้อคือการ "กลืน" `as` ทิ้ง
 *    (เช่นตั้ง `tag="span"` ตายตัว) ซึ่งเป็นความพังที่ tests/admin/primitives.test.tsx จับไว้
 * 3. **หลายตัววางอยู่บน Radix** — `Checkbox` ใช้ `onCheckedChange` ไม่ใช่ `onValueChange`,
 *    `Radio` เป็น `Group`/`Item` ที่ `Item` นอก `Group` ใช้ไม่ได้เลย, `Modal` เป็น compound
 *    component ที่ `Root` ถือ `open`/`onOpenChange`
 *
 * บางตัวเรียก `usePort()` เพื่อเอา `t` มาใช้ — ทำได้เพราะ primitive ทุกตัวถูกวาดใต้
 * `<PortProvider>` ของ App.tsx เสมอ และเป็นการอ่าน context ตอน render ไม่ใช่ตอนประกอบ port
 * จึงไม่เป็นวงกลม ที่สำคัญคือมันทำให้ทุก component ในไฟล์นี้เป็นค่าคงที่ระดับโมดูล identity
 * ไม่เปลี่ยนข้าม render — ถ้าเปลี่ยนไปใช้ factory ที่รับ `t` เข้ามาแทน ทุก input จะถูก remount
 * ทุกครั้งที่ `formatMessage` เปลี่ยน identity แล้วผู้ใช้จะพิมพ์ไม่ได้
 */

/** id ที่ไม่ซ้ำกันภายในหน้าเดียว — สำนวนเดียวกับฝั่ง v4 เพื่อให้สองไฟล์อ่านคู่กันได้ */
let localIdCount = 0
function useLocalId(prefix: string): string {
  const [id] = useState(() => `line-rich-menu-${prefix}-${localIdCount++}`)
  return id
}

/**
 * ยามที่บอกว่า `Radio` ตัวนี้อยู่ในกลุ่มจริงหรือเปล่า
 *
 * Radix โยน error ของตัวเองอยู่แล้วเมื่อ `Item` อยู่นอก `Root` แต่ข้อความของมันพูดถึงชื่อ
 * context ภายในของ Radix ซึ่งไม่ได้ชี้ทางแก้ให้คนที่เขียน `packages/ui` เลย ยามตัวนี้จึงมี
 * ไว้เพื่อ "ข้อความ" ไม่ใช่เพื่อ "การพัง" — และทำให้ v4 กับ v5 พังด้วยข้อความเดียวกัน
 */
const RadioGroupGuard = createContext(false)

/**
 * children ที่ต้องเป็น element เดี่ยว ๆ เสมอ — สตริงล้วนทำให้ `React.Children.only` โยนทิ้ง
 *
 * เหมือน v4 ทุกประการแต่ด้วยคนละกลไก: v1 เรียก `cloneElement` กับพร็อพ `icon` ส่วน v2 ส่ง
 * children ผ่าน `AccessibleIcon` ของ Radix (ใน `IconButton`) และ `Tooltip.Trigger asChild`
 * ซึ่งทั้งคู่เรียก `React.Children.only` — `AreaList` ของ Plan 02 ส่ง glyph เป็นสตริงล้วน
 * (`☰`, `⛶`) มาเป็นลูก ปล่อยผ่านตรง ๆ แล้วทั้งหน้าจะพังด้วย error ที่ไม่ได้ชี้กลับมาที่ต้นเหตุเลย
 */
const asElement = (children: ReactNode) =>
  isValidElement(children) ? children : <span>{children}</span>

/** ล้าง chrome ของ `<fieldset>` ที่เบราว์เซอร์ใส่มาให้ ไม่งั้นจะมีกรอบซ้อนกับกรอบของ DS */
const FIELDSET_RESET = { border: 0, margin: 0, padding: 0, minWidth: 0 } as const

export const primitives: UIPrimitives = {
  Button: ({ onClick, disabled, variant, type, children, testId }) => (
    <DsButton
      onClick={onClick}
      disabled={disabled}
      type={type ?? 'button'}
      // ชุดเดียวกับที่ v4 จับคู่ไว้ เพื่อให้สองเวอร์ชันหน้าตาเหมือนกัน — DS v2 มี `danger` เต็ม
      // ด้วย แต่ปุ่มลบในหน้าจอของเราอยู่ในแถวเดียวกับปุ่มอื่น `danger-light` จึงยังเป็นตัวที่ถูก
      variant={variant === 'danger' ? 'danger-light' : variant === 'secondary' ? 'tertiary' : 'default'}
      data-testid={testId}
    >
      {children}
    </DsButton>
  ),

  /**
   * ต่างจาก v1 ตรงที่ไอคอนเป็น `children` ไม่ใช่พร็อพ `icon` — แต่ยังต้องห่อให้เป็น element อยู่ดี
   * เพราะ v2 ยัด children ลง `AccessibleIcon` ของ Radix ซึ่งเรียก `React.Children.only`
   *
   * `label` ของ v2 ไม่ได้ลงเอยเป็น `aria-label` เหมือน v1 แต่เป็นข้อความที่ซ่อนไว้ในปุ่ม
   * (`VisuallyHidden`) — ชื่อที่ screen reader อ่านยังถูกต้องเหมือนเดิม เปลี่ยนแค่กลไก
   */
  IconButton: ({ onClick, label, disabled, children, testId }) => (
    <DsIconButton onClick={onClick} label={label} disabled={disabled} data-testid={testId}>
      {asElement(children)}
    </DsIconButton>
  ),

  TextInput: ({ name, value, onChange, label, hint, error, maxLength, disabled, placeholder, type, autoComplete }) => {
    const id = useLocalId('text-input')
    return (
      <Field.Root id={id} name={name} error={error} hint={hint}>
        {label === undefined ? null : <Field.Label>{label}</Field.Label>}
        <DsTextInput
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label === undefined ? name : undefined}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          type={type ?? 'text'}
          autoComplete={autoComplete}
        />
        <Field.Hint />
        <Field.Error />
      </Field.Root>
    )
  },

  Textarea: ({ name, value, onChange, label, error, rows }) => {
    const id = useLocalId('textarea')
    return (
      <Field.Root id={id} name={name} error={error}>
        {label === undefined ? null : <Field.Label>{label}</Field.Label>}
        <DsTextarea
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label === undefined ? name : undefined}
          rows={rows}
        />
        <Field.Error />
      </Field.Root>
    )
  },

  /**
   * `Select` ของ v1 หายไปใน v2 เหลือ `SingleSelect` ซึ่งส่งค่ามาเป็น `string | number`
   * (ไม่ใช่ event และไม่ใช่สตริงเสมอ) — `String()` ตรงนี้จึงไม่ใช่ของประดับ ถ้าตัวเลือกไหน
   * มี value เป็นตัวเลข ฝั่ง `packages/ui` จะได้ค่าที่เทียบกับสตริงไม่ตรงและช่องจะดูเหมือน
   * ไม่เคยถูกเลือกเลย
   */
  Select: ({ name, value, onChange, label, error, disabled, children }) => {
    const id = useLocalId('select')
    return (
      <Field.Root id={id} name={name} error={error}>
        {label === undefined ? null : <Field.Label>{label}</Field.Label>}
        <SingleSelect
          name={name}
          value={value}
          onChange={(next) => onChange(String(next))}
          aria-label={label === undefined ? name : undefined}
          disabled={disabled}
        >
          {children}
        </SingleSelect>
        <Field.Error />
      </Field.Root>
    )
  },

  Option: ({ value, children }) => <SingleSelectOption value={value}>{children}</SingleSelectOption>,

  // Radix: `onCheckedChange` ส่ง `boolean | 'indeterminate'` — `=== true` จึงจำเป็น
  // ไม่งั้น 'indeterminate' จะกลายเป็น truthy แล้วช่องติ๊กจะติดค้าง
  Checkbox: ({ name, checked, onChange, children }) => (
    <DsCheckbox name={name} checked={checked} onCheckedChange={(next) => onChange(next === true)}>
      {children}
    </DsCheckbox>
  ),

  /**
   * `<fieldset>` + `<legend>` คือรูปเดียวที่ตั้งชื่อให้ "กลุ่ม" ได้โดยไม่ต้องผูก id เอง ส่วน
   * `Radio.Group` ข้างในคือ Radix RadioGroup.Root ที่ถือ value/onValueChange และเป็นตัวที่
   * ถือ `role="radiogroup"` จริง `aria-labelledby` จึงต้องชี้กลับมาที่ `<legend>` ตัวเดียวกัน
   * ไม่ใช่ปล่อยให้มีแต่ `<fieldset>` ข้างนอกที่มีชื่อ
   */
  RadioGroup: ({ name, value, onChange, label, children }) => {
    const legendId = useLocalId('radio-group')
    return (
      <Box tag="fieldset" style={FIELDSET_RESET}>
        {label === undefined ? null : (
          <Box tag="legend" id={legendId} paddingBottom={1}>
            <DsTypography variant="pi" fontWeight="bold" textColor="neutral800">{label}</DsTypography>
          </Box>
        )}
        <DsRadio.Group
          name={name}
          value={value}
          onValueChange={onChange}
          aria-labelledby={label === undefined ? undefined : legendId}
        >
          <RadioGroupGuard.Provider value={true}>
            <DsFlex direction="column" alignItems="flex-start" gap={2}>{children}</DsFlex>
          </RadioGroupGuard.Provider>
        </DsRadio.Group>
      </Box>
    )
  },

  Radio: ({ value, children }) => {
    const inGroup = useContext(RadioGroupGuard)
    if (!inGroup) {
      throw new Error('ui.Radio ถูกวางไว้นอก ui.RadioGroup — สมาชิกต้องอยู่ในกลุ่มที่ถือค่าให้เสมอ')
    }
    return <DsRadio.Item value={value}>{children}</DsRadio.Item>
  },

  // `Toggle` ของ v2 ไม่มีพร็อพ `label` แล้ว (ย้ายไป Field) แต่ยังเป็น `<input>` จริงที่ส่ง
  // event ตามปกติ — ป้าย on/off เป็นข้อความที่ผู้ใช้เห็น จึงต้องผ่าน `t` เหมือนทุกข้อความในสเปก §12
  Toggle: ({ name, checked, onChange, label }) => {
    const { t } = usePort()
    const id = useLocalId('toggle')
    return (
      <Field.Root id={id} name={name}>
        {label === undefined ? null : <Field.Label>{label}</Field.Label>}
        <DsToggle
          name={name}
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          onLabel={t('common.on')}
          offLabel={t('common.off')}
        />
      </Field.Root>
    )
  },

  /**
   * compound component ของ Radix Dialog — `Root` ถือสถานะเปิด/ปิด ส่วน `Header` วาดปุ่มปิด
   * ให้เองพร้อม `closeLabel`
   *
   * `onOpenChange` ยิงทั้งตอนเปิดและตอนปิด — เรียก `onClose()` เฉพาะขาปิด ไม่งั้นการเปิด modal
   * จะสั่งปิดตัวเองทันทีในเฟรมเดียวกัน
   *
   * ยังคืน `null` เมื่อ `open` เป็น false แทนที่จะปล่อยให้ `Root` จัดการ เพราะสัญญาใน port.ts
   * บอกว่า modal ที่ปิดอยู่ต้องไม่มีอะไรใน DOM และ `TemplatePicker` ของ Plan 02 พึ่งข้อนั้น
   * ด้วยการ mount ใหม่ทุกครั้งที่เปิดเพื่อล้าง state ภายในของตัวเอง
   */
  Modal: ({ open, onClose, title, footer, children }) => {
    const { t } = usePort()
    if (!open) return null
    return (
      <DsModal.Root open onOpenChange={(next) => { if (!next) onClose() }}>
        <DsModal.Content>
          <DsModal.Header closeLabel={t('common.close')}>
            {/* หัวข้อของ modal ต้องเป็น heading จริงใน outline ไม่ใช่แค่ตัวอักษรที่ใหญ่กว่าเพื่อน */}
            <DsModal.Title>{title}</DsModal.Title>
          </DsModal.Header>
          <DsModal.Body>{children}</DsModal.Body>
          {footer === undefined ? null : <DsModal.Footer>{footer}</DsModal.Footer>}
        </DsModal.Content>
      </DsModal.Root>
    )
  },

  Typography: ({ variant, textColor, as, children }) => (
    <DsTypography variant={variant} textColor={textColor} tag={as ?? 'span'}>{children}</DsTypography>
  ),

  /**
   * `alignItems` ตกลงที่ `stretch` เมื่อผู้เรียกไม่ได้ระบุ ไม่ใช่ `center` ที่เป็น default ของ DS —
   * เหตุผลเดียวกับฝั่ง v4: ทุกหน้าจอของ `packages/ui` ถูกเขียนและตรวจด้วยตาบน stub ซึ่งใช้
   * default ของ CSS ปล่อยให้เป็น `center` จะทำให้คอลัมน์ของฟอร์มหดเข้ามาอยู่กลางจอทุกอัน
   */
  Flex: ({ direction, gap, alignItems, justifyContent, wrap, children }) => (
    <DsFlex
      direction={direction ?? 'row'}
      gap={gap}
      alignItems={alignItems ?? 'stretch'}
      justifyContent={justifyContent}
      wrap={wrap}
    >
      {children}
    </DsFlex>
  ),

  Divider: () => <DsDivider />,

  // `closeLabel` ของ Alert ใน v2 เป็นพร็อพ **บังคับ** (ต่างจาก v1 ที่ optional) — TypeScript
  // จับได้ถ้าลืม แต่ไม่ได้จับว่ามันมาจาก `t` หรือเป็นสตริงอังกฤษที่ฝังไว้ เทสต์เป็นคนจับข้อนั้น
  Alert: ({ variant, title, onClose, children }) => {
    const { t } = usePort()
    return (
      <Box paddingBottom={2}>
        <DsAlert variant={variant} title={title} onClose={onClose} closeLabel={t('common.close')}>
          {children}
        </DsAlert>
      </Box>
    )
  },

  Loader: ({ children }) => <DsLoader small>{children}</DsLoader>,

  // `Tooltip.Trigger` ของ v2 ใช้ `asChild` ซึ่งเป็น `Slot` ของ Radix — เรียก `React.Children.only`
  // เช่นเดียวกับ `IconButton` ข้างบน สตริงล้วนจึงต้องถูกห่อก่อนเหมือนฝั่ง v4
  Tooltip: ({ label, children }) => <DsTooltip label={label}>{asElement(children)}</DsTooltip>,
}
