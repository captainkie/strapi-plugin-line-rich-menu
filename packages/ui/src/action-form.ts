import type { Action, ActionType } from '@fosivo/line-rich-menu-core/browser'

/**
 * รูปทรงของ action ในฟอร์ม — แบน มีทุกฟิลด์เสมอ
 *
 * จงใจไม่ใช่ discriminated union แบบที่ core ใช้ เพราะผู้ใช้สลับชนิด action ไปกลับ
 * แล้วต้องไม่สูญเสียสิ่งที่พิมพ์ไว้ (สเปก §5.4) union จะบังคับให้ทิ้งฟิลด์ที่ไม่ตรงชนิดทันที
 */
export interface ActionFormState {
  type: ActionType
  label: string
  text: string
  uri: string
  altUri: string
  data: string
  displayText: string
  mode: 'date' | 'time' | 'datetime'
  richMenuAliasId: string
  clipboardText: string
}

export function emptyActionForm(): ActionFormState {
  return {
    type: 'message',
    label: '',
    text: '',
    uri: '',
    altUri: '',
    data: '',
    displayText: '',
    mode: 'datetime',
    richMenuAliasId: '',
    clipboardText: '',
  }
}

/**
 * ใส่คู่ key/value ของ `extra` (ฟิลด์เสริมที่ LINE ระบุเป็น optional เช่น label, displayText, altUri)
 * ก็ต่อเมื่อมีค่าจริง — ฟิลด์ใน `base` ที่นิยามชนิดของ action ไม่ผ่านฟังก์ชันนี้ จึงไม่ถูกกรองไม่ว่าจะว่างแค่ไหน
 */
function withOptional<T extends object>(base: T, extra: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(extra)) {
    if (value !== '' && value !== undefined) out[key] = value
  }
  return out as T
}

/**
 * แมป `ActionFormState` แบนเป็น `Action` union ตามชนิดที่เลือก — งานของฟังก์ชันนี้คือ "รูปทรง" เท่านั้น
 *
 * ฟิลด์เสริมตามสเปกของ LINE (label, displayText, altUri) ถูกตัดทิ้งเมื่อว่างเปล่าผ่าน `withOptional`
 * แต่ฟิลด์ที่นิยามชนิดของ action เอง (เช่น `uri` ของ 'uri', `text` ของ 'message') ผ่านไปตามที่ผู้ใช้กรอกมา
 * เสมอ แม้จะว่างเปล่า — `toAction({ ...emptyActionForm(), type: 'uri' })` คืน `{ type: 'uri', uri: '' }`
 * ได้จริงและถือเป็นพฤติกรรมที่ถูกต้อง ไม่ใช่บั๊ก จะตัดฟิลด์เหล่านี้ทิ้งเมื่อว่างไม่ได้ เพราะผลลัพธ์จะไม่ใช่
 * `Action` ที่ถูกต้องตามชนิดของมันอีกต่อไป (`{ type: 'uri' }` ไม่ใช่ `UriAction`) ต้อง cast ปลอม ๆ ถึงจะผ่าน
 * type checker และมันจะกลบข้อผิดพลาดของผู้ใช้ไว้ผิดชั้น
 *
 * ฟังก์ชันนี้**ไม่ validate**ค่าที่ได้ ตัวกันจริงคือ `validateRichMenu` จาก core ซึ่ง editor
 * เรียกก่อน publish เท่านั้น — draft ข้ามการ validate โดยเจตนาและไม่เคยหลุดออกจากฐานข้อมูลไปหา LINE
 */
export function toAction(state: ActionFormState): Action {
  const { label } = state
  switch (state.type) {
    case 'message':
      return withOptional({ type: 'message', text: state.text } as const, { label })
    case 'uri':
      return withOptional({ type: 'uri', uri: state.uri } as const, {
        label,
        altUri: state.altUri === '' ? undefined : { desktop: state.altUri },
      })
    case 'postback':
      return withOptional({ type: 'postback', data: state.data } as const, {
        label,
        displayText: state.displayText,
      })
    case 'datetimepicker':
      return withOptional({ type: 'datetimepicker', data: state.data, mode: state.mode } as const, { label })
    case 'richmenuswitch':
      return withOptional(
        { type: 'richmenuswitch', richMenuAliasId: state.richMenuAliasId, data: state.data } as const,
        { label },
      )
    case 'clipboard':
      return withOptional({ type: 'clipboard', clipboardText: state.clipboardText } as const, { label })
    case 'camera':
    case 'cameraRoll':
    case 'location':
      // สามชนิดนี้ LINE บังคับให้มี label เสมอ ไม่ใช่ optional
      return { type: state.type, label } as Action
  }
}

export function fromAction(action: Action): ActionFormState {
  const state = emptyActionForm()
  state.type = action.type
  if ('label' in action && action.label !== undefined) state.label = action.label
  if ('text' in action) state.text = action.text
  if ('uri' in action) state.uri = action.uri
  if ('altUri' in action && action.altUri !== undefined) state.altUri = action.altUri.desktop
  if ('data' in action) state.data = action.data
  if ('displayText' in action && action.displayText !== undefined) state.displayText = action.displayText
  if ('mode' in action) state.mode = action.mode
  if ('richMenuAliasId' in action) state.richMenuAliasId = action.richMenuAliasId
  if ('clipboardText' in action) state.clipboardText = action.clipboardText
  return state
}

/**
 * ค่าที่ "อ่านแล้วรู้ว่า action นี้ทำอะไร" สำหรับคอลัมน์ Action ของหน้ารายการและหน้าพรีวิว —
 * LINE OA Manager เขียนบรรทัดนี้ว่า `A : Text - test` คือ ป้ายช่อง, ชนิด, แล้วค่าที่สำคัญที่สุด
 * ของชนิดนั้น
 *
 * เดินผ่าน `fromAction` แทนที่จะแยกฟิลด์จาก union เอง — การอ่าน `Action` ตรง ๆ จะกลายเป็น
 * ที่ที่สองที่รู้ว่าฟิลด์ไหนคู่กับชนิดไหน และสองที่นั้นจะเลิกตรงกันในวันที่ LINE เพิ่มชนิดใหม่
 *
 * `postback` เลือก `displayText` ก่อน `data` เพราะ `displayText` คือสิ่งที่ผู้ใช้ปลายทางเห็นจริง
 * ส่วน `data` เป็นค่าที่ส่งกลับหลังบ้าน ซึ่งมักไม่มีความหมายกับคนที่อ่านรายการ
 */
export function actionSummary(action: Action): string {
  const state = fromAction(action)
  switch (state.type) {
    case 'message': return state.text
    case 'uri': return state.uri
    case 'postback': return state.displayText === '' ? state.data : state.displayText
    case 'datetimepicker': return state.data
    case 'richmenuswitch': return state.richMenuAliasId
    case 'clipboard': return state.clipboardText
    // camera / cameraRoll / location ไม่มีค่าอื่นเลยนอกจากป้ายที่ LINE บังคับให้มี
    default: return state.label
  }
}
