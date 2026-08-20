export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RichMenuSize {
  width: number
  height: number
}

export type RichMenuSizeName = 'large' | 'compact'

export type ActionType =
  | 'postback'
  | 'message'
  | 'uri'
  | 'datetimepicker'
  | 'camera'
  | 'cameraRoll'
  | 'location'
  | 'richmenuswitch'
  | 'clipboard'

export interface PostbackAction {
  type: 'postback'
  label?: string
  data: string
  displayText?: string
}
export interface MessageAction {
  type: 'message'
  label?: string
  text: string
}
export interface UriAction {
  type: 'uri'
  label?: string
  uri: string
  altUri?: { desktop: string }
}
export interface DatetimePickerAction {
  type: 'datetimepicker'
  label?: string
  data: string
  mode: 'date' | 'time' | 'datetime'
  initial?: string
  max?: string
  min?: string
}
export interface CameraAction { type: 'camera'; label: string }
export interface CameraRollAction { type: 'cameraRoll'; label: string }
export interface LocationAction { type: 'location'; label: string }
export interface RichMenuSwitchAction {
  type: 'richmenuswitch'
  label?: string
  richMenuAliasId: string
  data: string
}
export interface ClipboardAction {
  type: 'clipboard'
  label?: string
  clipboardText: string
}

export type Action =
  | PostbackAction
  | MessageAction
  | UriAction
  | DatetimePickerAction
  | CameraAction
  | CameraRollAction
  | LocationAction
  | RichMenuSwitchAction
  | ClipboardAction

export interface RichMenuArea {
  bounds: Bounds
  action: Action
}

/** payload ที่ส่งให้ LINE ตรง ๆ — ชื่อฟิลด์ต้องตรงกับ API ของ LINE เป๊ะ */
export interface RichMenuPayload {
  size: RichMenuSize
  selected: boolean
  name: string
  chatBarText: string
  areas: RichMenuArea[]
}
