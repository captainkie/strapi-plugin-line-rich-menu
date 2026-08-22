import { createContext, isValidElement, useContext, useState, type ReactNode } from 'react'
import {
  Alert as DsAlert, Box, Button as DsButton, Checkbox as DsCheckbox, ContentLayout,
  DatePicker as DsDatePicker, Divider as DsDivider,
  Flex as DsFlex, HeaderLayout, IconButton as DsIconButton, Loader as DsLoader, Main, ModalBody,
  ModalFooter, ModalHeader, ModalLayout, Option as DsOption, Radio as DsRadio,
  RadioGroup as DsRadioGroup, Select as DsSelect, Textarea as DsTextarea, TextInput as DsTextInput,
  TimePicker as DsTimePicker, ToggleInput, Tooltip as DsTooltip, Typography as DsTypography,
} from '@strapi/design-system'
import { usePort, type UIPrimitives } from '@fosivo/line-rich-menu-ui'

/**
 * จับคู่ Design System v1 เข้ากับ `UIPort` — ไฟล์นี้คือ **ทั้งหมด** ที่ต่างจาก v5 ในฝั่ง UI
 * ทุก component ของ `packages/ui` วาดผ่านชุดนี้ ไม่มีตัวไหน import DS โดยตรง (สเปก §5.1)
 *
 * `testId` ถูกส่งลง element ที่กดได้จริงเสมอ ไม่ใช่ wrapper — เทสต์ของ Plan 02 คาดหวังว่า
 * `toBeDisabled()` และ `click` จะทำงานกับ element ที่ถือ data-testid นั้น
 *
 * บางตัวเรียก `usePort()` เพื่อเอา `t` มาใช้ (ดูคอมเมนต์ที่ Alert/Toggle/Modal) — ทำได้เพราะ
 * primitive ทุกตัวถูกวาดใต้ `<PortProvider>` ของ App.tsx เสมอ และเป็นการอ่าน context ตอน render
 * ไม่ใช่ตอนประกอบ port จึงไม่เป็นวงกลม ที่สำคัญคือมันทำให้ component ทุกตัวในไฟล์นี้เป็น
 * ค่าคงที่ระดับโมดูล identity ไม่เปลี่ยนข้าม render — ถ้าเปลี่ยนไปใช้ factory ที่รับ `t` เข้ามาแทน
 * ทุก input จะถูก remount ทุกครั้งที่ `formatMessage` เปลี่ยน identity แล้วผู้ใช้จะพิมพ์ไม่ได้
 */

/**
 * id ที่ไม่ซ้ำกันภายในหน้าเดียว โดยไม่ใช้ `useId` ของ React 18 — peer range ของแพ็กเกจนี้
 * ยังรับ React 17 ซึ่งไม่มี hook ตัวนั้น (DS v1 เองก็เลี่ยงด้วยวิธีเดียวกัน)
 */
let localIdCount = 0
function useLocalId(prefix: string): string {
  const [id] = useState(() => `line-rich-menu-${prefix}-${localIdCount++}`)
  return id
}

/**
 * ยามที่บอกว่า `Radio` ตัวนี้อยู่ในกลุ่มจริงหรือเปล่า — ตัว value/onChange เดินทางผ่าน context
 * ของ DS เอง (`RadioGroup` ของ DS v1 เป็น context provider อยู่แล้ว) ที่นี่จึงเก็บแค่ธงเดียว
 *
 * จำเป็นเพราะ `Radio` ของ DS ที่อยู่นอกกลุ่ม "ทำงานได้" แบบเงียบ ๆ คือวาดออกมาเป็น radio ที่
 * name ว่างและกดแล้วไม่มีอะไรเกิดขึ้น ซึ่งเป็นความพังที่ไม่มีใครเห็นจนกว่าจะมีผู้ใช้จริงมากด
 */
const RadioGroupGuard = createContext(false)

/** ล้าง chrome ของ `<fieldset>` ที่เบราว์เซอร์ใส่มาให้ ไม่งั้นจะมีกรอบซ้อนกับกรอบของ DS */
const FIELDSET_RESET = { border: 0, margin: 0, padding: 0, minWidth: 0 } as const

/** children ที่ DS จะเอาไป `cloneElement` ต้องเป็น element เสมอ — สตริงล้วนทำให้ React โยนทิ้ง */
const asElement = (children: ReactNode) =>
  isValidElement(children) ? children : <span>{children}</span>

export const primitives: UIPrimitives = {
  Button: ({ onClick, disabled, variant, type, children, testId }) => (
    <DsButton
      onClick={onClick}
      disabled={disabled}
      type={type ?? 'button'}
      variant={variant === 'danger' ? 'danger-light' : variant === 'secondary' ? 'tertiary' : 'default'}
      data-testid={testId}
    >
      {children}
    </DsButton>
  ),

  // `AreaList` ส่ง glyph เป็นสตริงล้วน (`☰`) มาเป็นลูก ส่วน DS ทำ `cloneElement` กับมันเสมอ
  IconButton: ({ onClick, label, disabled, children, testId }) => (
    <DsIconButton
      onClick={onClick}
      label={label}
      disabled={disabled}
      data-testid={testId}
      icon={asElement(children)}
    />
  ),

  /**
   * `label` ของ port เป็น optional แต่ DS v1 `throw` ถ้าไม่มีทั้ง `label` และ `aria-label` —
   * ใช้ `name` เป็นชื่อสำรองเพื่อไม่ให้ทั้งหน้าขาวเพราะช่องเดียวที่ไม่มีป้าย
   */
  TextInput: ({ name, value, onChange, label, hint, error, maxLength, disabled, placeholder, type, autoComplete }) => (
    <DsTextInput
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      label={label}
      aria-label={label === undefined ? name : undefined}
      hint={hint}
      error={error}
      maxLength={maxLength}
      disabled={disabled}
      placeholder={placeholder}
      type={type ?? 'text'}
      autoComplete={autoComplete}
    />
  ),

  Textarea: ({ name, value, onChange, label, error, rows }) => (
    <DsTextarea
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      label={label}
      aria-label={label === undefined ? name : undefined}
      error={error}
      rows={rows}
    />
  ),

  // DS v1 ส่งค่าที่เลือกมาตรง ๆ ไม่ใช่ event ต่างจาก v2 ที่ห่อไว้ — จุดที่จับคู่ผิดง่ายที่สุด
  Select: ({ name, value, onChange, label, error, disabled, children }) => (
    <DsSelect
      name={name}
      value={value}
      onChange={onChange}
      label={label}
      aria-label={label === undefined ? name : undefined}
      error={error}
      disabled={disabled}
    >
      {children}
    </DsSelect>
  ),

  Option: ({ value, children }) => <DsOption value={value}>{children}</DsOption>,

  /**
   * สเปกงานนี้ #4 — ยืมปฏิทินของ DS v1 แทนวาดเอง `DatePickerField` ห่อ Field (label/error) ให้
   * ครบเองอยู่แล้ว (เหมือน `DsTextInput`) จึงไม่ต้องห่อ `Box`/`Field` เพิ่ม — ต่างจาก `TextInput`
   * ข้างบนตรงที่ port เก็บค่าเป็น `Date | null` (ไม่ใช่ `| undefined` แบบที่ DS ใช้เอง) แปลงตรงนี้
   * ทั้งขาเข้า (`value ?? undefined`) และขาออก (`date ?? null`)
   */
  DatePicker: ({ name, value, onChange, label, error, disabled }) => (
    <DsDatePicker
      id={name}
      name={name}
      label={label}
      aria-label={label === undefined ? name : undefined}
      selectedDate={value ?? undefined}
      onChange={(date) => onChange(date ?? null)}
      error={error}
      disabled={disabled}
    />
  ),

  /** คู่กับ `DatePicker` ข้างบนเสมอ — `value` เป็นสตริง 'HH:mm' อยู่แล้วทั้งฝั่ง port และฝั่ง DS v1 */
  TimePicker: ({ name, value, onChange, label, error, disabled }) => (
    <DsTimePicker
      id={name}
      name={name}
      label={label}
      aria-label={label === undefined ? name : undefined}
      value={value === '' ? undefined : value}
      onChange={(next) => onChange(next ?? '')}
      error={error}
      disabled={disabled}
    />
  ),

  Checkbox: ({ name, checked, onChange, children }) => (
    <DsCheckbox name={name} value={checked} onValueChange={onChange}>{children}</DsCheckbox>
  ),

  /**
   * `<fieldset>` + `<legend>` คือรูปเดียวที่ตั้งชื่อให้ "กลุ่ม" ได้โดยไม่ต้องผูก id เอง ส่วน
   * `RadioGroup` ของ DS v1 ข้างในเป็นตัวถือ value/onChange แล้วแจกลงไปให้ `Radio` ทุกตัว
   * ผ่าน context ของมันเอง — ปล่อยให้ DS จัดการ roving tabindex/aria-checked ตามเดิม
   *
   * `labelledBy` ชี้กลับมาที่ `<legend>` ตัวเดียวกัน เพื่อให้ element ที่ถือ role="radiogroup"
   * จริง ๆ มีชื่อด้วย ไม่ใช่มีแต่ `<fieldset>` ข้างนอกที่มีชื่อ
   */
  RadioGroup: ({ name, value, onChange, label, children }) => {
    const legendId = useLocalId('radio-group')
    return (
      <Box as="fieldset" style={FIELDSET_RESET}>
        {label === undefined ? null : (
          <Box as="legend" id={legendId} paddingBottom={1}>
            <DsTypography variant="pi" fontWeight="bold" textColor="neutral800">{label}</DsTypography>
          </Box>
        )}
        <DsRadioGroup
          name={name}
          value={value}
          labelledBy={legendId}
          onChange={(event) => onChange(event.target.value)}
        >
          <RadioGroupGuard.Provider value={true}>
            <DsFlex direction="column" alignItems="flex-start" gap={2}>{children}</DsFlex>
          </RadioGroupGuard.Provider>
        </DsRadioGroup>
      </Box>
    )
  },

  Radio: ({ value, children }) => {
    const inGroup = useContext(RadioGroupGuard)
    if (!inGroup) {
      throw new Error('ui.Radio ถูกวางไว้นอก ui.RadioGroup — สมาชิกต้องอยู่ในกลุ่มที่ถือค่าให้เสมอ')
    }
    return <DsRadio value={value}>{children}</DsRadio>
  },

  // ป้าย on/off เป็นข้อความที่ผู้ใช้เห็น จึงต้องผ่าน `t` เหมือนทุกข้อความในสเปก §12
  Toggle: ({ name, checked, onChange, label }) => {
    const { t } = usePort()
    return (
      <ToggleInput
        name={name}
        label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        onLabel={t('common.on')}
        offLabel={t('common.off')}
      />
    )
  },

  Modal: ({ open, onClose, title, footer, children }) => {
    const titleId = useLocalId('modal-title')
    const { t } = usePort()
    return open ? (
      <ModalLayout onClose={onClose} labelledBy={titleId}>
        <ModalHeader closeLabel={t('common.close')}>
          {/* `as="h2"` ไม่ใช่แค่ขนาดตัวอักษร — modal คือหน้าย่อยที่ต้องมีหัวข้อของตัวเองใน outline */}
          <DsTypography id={titleId} as="h2" variant="beta" fontWeight="bold">{title}</DsTypography>
        </ModalHeader>
        <ModalBody>{children}</ModalBody>
        {/* `endActions` ไม่ใช่ `startActions` — ปุ่มหลักต้องอยู่ขวาสุดตามที่แอดมินทั้งตัวเป็น */}
        {footer === undefined ? null : <ModalFooter endActions={footer} />}
      </ModalLayout>
    ) : null
  },

  Typography: ({ variant, textColor, as, children }) => (
    <DsTypography variant={variant} textColor={textColor} as={as}>{children}</DsTypography>
  ),

  /**
   * `alignItems` ตกลงที่ `stretch` เมื่อผู้เรียกไม่ได้ระบุ ไม่ใช่ `center` ที่เป็น default ของ DS —
   * port ประกาศพร็อพสองตัวนี้เป็นค่าของ CSS ตรง ๆ และทุกหน้าจอของ `packages/ui` ถูกเขียนและ
   * ตรวจด้วยตาบน stub ซึ่งใช้ default ของ CSS ปล่อยให้เป็น `center` จะทำให้คอลัมน์ของฟอร์ม
   * หดเข้ามาอยู่กลางจอทุกอัน โดยไม่มีจุดเรียกไหนเปลี่ยนสักบรรทัด
   *
   * `gap` เป็นลำดับใน spacing scale ของ DS อยู่แล้ว ส่งต่อได้ตรง ๆ ไม่ต้องแปลงเป็นพิกเซล
   */
  // `grow` ส่งต่อตรง ๆ ไม่ต้องแปลง — `Box` ของ DS v1 (ที่ `Flex` วางอยู่บน) รับ `grow` เป็น CSS
  // `flex-grow` โดยตรงอยู่แล้ว (ดูคอมเมนต์ที่ type ของมันใน design-system-v1.d.ts)
  Flex: ({ direction, gap, alignItems, justifyContent, wrap, grow, children }) => (
    <DsFlex
      direction={direction ?? 'row'}
      gap={gap}
      alignItems={alignItems ?? 'stretch'}
      justifyContent={justifyContent}
      wrap={wrap}
      grow={grow}
    >
      {children}
    </DsFlex>
  ),

  Divider: () => <DsDivider />,

  /**
   * DS v1 วาดปุ่มปิดของ Alert เสมอ แม้ไม่ได้ส่ง `onClose` มา — `closeLabel` จึงต้องมีค่าทุกครั้ง
   * ไม่งั้นจะได้ปุ่มที่ screen reader อ่านไม่ออก และค่านั้นต้องมาจาก `t` ไม่ใช่สตริงอังกฤษที่ฝังไว้
   */
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

  Tooltip: ({ label, children }) => <DsTooltip label={label}>{asElement(children)}</DsTooltip>,

  /**
   * รูปแบบมาตรฐานของหน้าแอดมิน v4 เอง (`<Main><HeaderLayout .../><ContentLayout>…</ContentLayout>
   * </Main>`) — `Main` วาด `<main>` ที่ focus ได้ตอนเปลี่ยนหน้า (สเปกการเข้าถึงของ Strapi เอง),
   * `HeaderLayout` วาด `<h1>` จริงพร้อม padding/พื้นหลังของหัวหน้าและ `primaryAction`, และ
   * `ContentLayout` ให้ padding ซ้าย-ขวาของเนื้อหา ทั้งสามตัวไม่มี type มาให้ (ดูเหตุผลที่หัว
   * design-system-v1.d.ts) — พร็อพด้านล่างอ่านมาจาก dist/**\/*.mjs ของ DS 1.19.0 ตรง ๆ เหมือน
   * ทุกตัวอื่นในไฟล์นี้ ไม่ใช่เดาจาก v2
   */
  Page: ({ title, subtitle, actions, children }) => (
    <Main>
      <HeaderLayout title={title} subtitle={subtitle} primaryAction={actions} />
      <ContentLayout>{children}</ContentLayout>
    </Main>
  ),
}
