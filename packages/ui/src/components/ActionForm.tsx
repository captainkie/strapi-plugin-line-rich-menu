import { ALLOWED_URI_SCHEMES, type ActionType } from '@fosivo/line-rich-menu-core/browser'
import type { ActionFormState } from '../action-form.js'
import { usePort } from '../port.js'
import { CharCount } from './CharCount.js'

export interface ActionFormProps {
  value: ActionFormState
  onChange(next: ActionFormState): void
  aliasOptions: readonly string[]
  error?: string
}

const TYPES: readonly ActionType[] = [
  'message', 'uri', 'postback', 'datetimepicker',
  'richmenuswitch', 'clipboard', 'camera', 'cameraRoll', 'location',
]

/**
 * เพดานตัวอักษรของแต่ละฟิลด์ — ค่าเดียวกับที่ `maxLength` ของ `ui.TextInput` แต่ละช่องและ
 * `CharCount` คู่กันใช้ ไม่พิมพ์เลขซ้ำสองที่ (สเปกงานนี้ #1) ตัวเลขเหล่านี้ตรวจแล้วกับค่าที่ LINE
 * เอกสารไว้และกับ implementation ก่อนหน้าของโปรดักต์นี้ — ห้ามเปลี่ยนเลข มีแค่ที่มาของมันที่เปลี่ยน
 * (จากตัวพิมพ์ตรง ๆ ในพร็อพ มาเป็นค่าคงที่ตัวเดียวที่ทั้งสองจุดอ้างถึง)
 */
const LABEL_MAX = 20
const TEXT_MAX = 300
const URI_MAX = 1000
const ALT_URI_MAX = 1000
const DATA_MAX = 300
const DISPLAY_TEXT_MAX = 300
const CLIPBOARD_TEXT_MAX = 1000

/**
 * ฟอร์มของ action เดียว — วาดจาก `ActionFormState` ที่แบนเสมอ (ทุกฟิลด์มีค่า แม้ไม่ตรงชนิด)
 * เพื่อให้สลับ `type` ไปมาไม่ล้างสิ่งที่ผู้ใช้พิมพ์ไว้ในฟิลด์อื่น (สเปก §5.4) — `set` ทำ shallow
 * merge เข้ากับ `value` เดิมเสมอ ไม่เคยสร้าง state ใหม่จาก emptyActionForm()
 */
export function ActionForm({ value, onChange, aliasOptions, error }: ActionFormProps) {
  const { ui, t } = usePort()
  const set = <K extends keyof ActionFormState>(key: K, next: ActionFormState[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <ui.Flex direction="column" gap={2}>
      <ui.Select
        name="type"
        label={t('action.field.type')}
        value={value.type}
        onChange={(next) => set('type', next as ActionType)}
      >
        {TYPES.map((type) => (
          <ui.Option key={type} value={type}>{t(`action.type.${type}`)}</ui.Option>
        ))}
      </ui.Select>

      <ui.Flex direction="column" gap={1}>
        <ui.TextInput
          name="label"
          label={t('action.field.label')}
          value={value.label}
          maxLength={LABEL_MAX}
          onChange={(next) => set('label', next)}
        />
        <CharCount value={value.label} max={LABEL_MAX} />
      </ui.Flex>

      {value.type === 'message' ? (
        <ui.Flex direction="column" gap={1}>
          <ui.TextInput name="text" label={t('action.field.text')} value={value.text}
            maxLength={TEXT_MAX} error={error} onChange={(next) => set('text', next)} />
          <CharCount value={value.text} max={TEXT_MAX} />
        </ui.Flex>
      ) : null}

      {value.type === 'uri' ? (
        <>
          <ui.Flex direction="column" gap={1}>
            <ui.TextInput name="uri" label={t('action.field.uri')} value={value.uri}
              maxLength={URI_MAX} error={error}
              hint={ALLOWED_URI_SCHEMES.map((s) => s.replace(':', '')).join(', ')}
              onChange={(next) => set('uri', next)} />
            <CharCount value={value.uri} max={URI_MAX} />
          </ui.Flex>
          <ui.Flex direction="column" gap={1}>
            <ui.TextInput name="altUri" label={t('action.field.altUri')} value={value.altUri}
              maxLength={ALT_URI_MAX} onChange={(next) => set('altUri', next)} />
            <CharCount value={value.altUri} max={ALT_URI_MAX} />
          </ui.Flex>
        </>
      ) : null}

      {value.type === 'postback' || value.type === 'datetimepicker' || value.type === 'richmenuswitch' ? (
        <ui.Flex direction="column" gap={1}>
          <ui.TextInput name="data" label={t('action.field.data')} value={value.data}
            maxLength={DATA_MAX} error={error} onChange={(next) => set('data', next)} />
          <CharCount value={value.data} max={DATA_MAX} />
        </ui.Flex>
      ) : null}

      {value.type === 'postback' ? (
        <ui.Flex direction="column" gap={1}>
          <ui.TextInput name="displayText" label={t('action.field.displayText')} value={value.displayText}
            maxLength={DISPLAY_TEXT_MAX} onChange={(next) => set('displayText', next)} />
          <CharCount value={value.displayText} max={DISPLAY_TEXT_MAX} />
        </ui.Flex>
      ) : null}

      {value.type === 'datetimepicker' ? (
        <ui.Select name="mode" label={t('action.field.mode')} value={value.mode}
          onChange={(next) => set('mode', next as ActionFormState['mode'])}>
          {(['date', 'time', 'datetime'] as const).map((mode) => (
            <ui.Option key={mode} value={mode}>{t(`action.mode.${mode}`)}</ui.Option>
          ))}
        </ui.Select>
      ) : null}

      {value.type === 'richmenuswitch' ? (
        <ui.Select name="richMenuAliasId" label={t('action.field.richMenuAliasId')}
          value={value.richMenuAliasId} error={error}
          onChange={(next) => set('richMenuAliasId', next)}>
          <ui.Option value="">{t('action.field.chooseAlias')}</ui.Option>
          {aliasOptions.map((alias) => (
            <ui.Option key={alias} value={alias}>{alias}</ui.Option>
          ))}
        </ui.Select>
      ) : null}

      {value.type === 'clipboard' ? (
        <ui.Flex direction="column" gap={1}>
          <ui.TextInput name="clipboardText" label={t('action.field.clipboardText')}
            value={value.clipboardText} maxLength={CLIPBOARD_TEXT_MAX} error={error}
            onChange={(next) => set('clipboardText', next)} />
          <CharCount value={value.clipboardText} max={CLIPBOARD_TEXT_MAX} />
        </ui.Flex>
      ) : null}
    </ui.Flex>
  )
}
