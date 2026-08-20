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

/** ใส่คู่ key/value ก็ต่อเมื่อมีค่าจริง — สตริงว่างที่หลุดไปถึง LINE จะถูกปฏิเสธ */
function withOptional<T extends object>(base: T, extra: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(extra)) {
    if (value !== '' && value !== undefined) out[key] = value
  }
  return out as T
}

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
