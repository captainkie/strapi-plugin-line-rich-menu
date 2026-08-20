import { ALLOWED_URI_SCHEMES, type ActionType } from '@fosivo/line-rich-menu-core/browser'
import type { ActionFormState } from '../action-form.js'
import { usePort } from '../port.js'

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

      <ui.TextInput
        name="label"
        label={t('action.field.label')}
        value={value.label}
        maxLength={20}
        onChange={(next) => set('label', next)}
      />

      {value.type === 'message' ? (
        <ui.TextInput name="text" label={t('action.field.text')} value={value.text}
          maxLength={300} error={error} onChange={(next) => set('text', next)} />
      ) : null}

      {value.type === 'uri' ? (
        <>
          <ui.TextInput name="uri" label={t('action.field.uri')} value={value.uri}
            maxLength={1000} error={error}
            hint={ALLOWED_URI_SCHEMES.map((s) => s.replace(':', '')).join(', ')}
            onChange={(next) => set('uri', next)} />
          <ui.TextInput name="altUri" label={t('action.field.altUri')} value={value.altUri}
            maxLength={1000} onChange={(next) => set('altUri', next)} />
        </>
      ) : null}

      {value.type === 'postback' || value.type === 'datetimepicker' || value.type === 'richmenuswitch' ? (
        <ui.TextInput name="data" label={t('action.field.data')} value={value.data}
          maxLength={300} error={error} onChange={(next) => set('data', next)} />
      ) : null}

      {value.type === 'postback' ? (
        <ui.TextInput name="displayText" label={t('action.field.displayText')} value={value.displayText}
          maxLength={300} onChange={(next) => set('displayText', next)} />
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
        <ui.TextInput name="clipboardText" label={t('action.field.clipboardText')}
          value={value.clipboardText} maxLength={1000} error={error}
          onChange={(next) => set('clipboardText', next)} />
      ) : null}
    </ui.Flex>
  )
}
