import { usePort } from '../port.js'

export interface ChatBarValue {
  /**
   * โหมดที่ผู้ใช้เลือก ไม่ใช่แค่ผลลัพธ์ (สเปก §5.5)
   * `chatBarText` เป็นฟิลด์บังคับของ LINE เสมอ โหมด default คือฝั่งเราเติมให้
   * ถ้าเก็บแต่ข้อความ พอเปิดเมนูที่เซฟไว้กลับมาจะแยกไม่ออกว่าใครเป็นคนพิมพ์
   */
  mode: 'default' | 'custom'
  text: string
  /** กางเมนูไว้ตอนเปิดแชทหรือยุบไว้ → ไปลงที่ `selected` ใน payload */
  selected: boolean
}

export interface ChatBarSettingsProps {
  value: ChatBarValue
  onChange(next: ChatBarValue): void
  error?: string
}

export function ChatBarSettings({ value, onChange, error }: ChatBarSettingsProps) {
  const { ui, t } = usePort()

  return (
    <ui.Flex direction="column" gap={3}>
      <ui.Typography variant="delta">{t('chatBar.title')}</ui.Typography>

      <ui.Flex direction="column" gap={1}>
        <ui.Typography variant="pi">{t('chatBar.mode')}</ui.Typography>
        <ui.Radio name="chatBarMode" value="default" checked={value.mode === 'default'}
          onChange={() => onChange({ ...value, mode: 'default' })}>
          {t('chatBar.mode.default')}
        </ui.Radio>
        <ui.Radio name="chatBarMode" value="custom" checked={value.mode === 'custom'}
          onChange={() => onChange({ ...value, mode: 'custom' })}>
          {t('chatBar.mode.custom')}
        </ui.Radio>
        <ui.TextInput
          name="chatBarText"
          label={t('chatBar.text')}
          value={value.text}
          maxLength={14}
          disabled={value.mode !== 'custom'}
          onChange={(next) => onChange({ ...value, text: next })}
          {...(error === undefined ? {} : { error })}
        />
        <ui.Typography variant="pi" textColor="neutral600">{value.text.length}/14</ui.Typography>
      </ui.Flex>

      <ui.Flex direction="column" gap={1}>
        <ui.Typography variant="pi">{t('chatBar.behavior')}</ui.Typography>
        <ui.Radio name="chatBarBehavior" value="shown" checked={value.selected}
          onChange={() => onChange({ ...value, selected: true })}>
          {t('chatBar.behavior.shown')}
        </ui.Radio>
        <ui.Radio name="chatBarBehavior" value="collapsed" checked={!value.selected}
          onChange={() => onChange({ ...value, selected: false })}>
          {t('chatBar.behavior.collapsed')}
        </ui.Radio>
      </ui.Flex>
    </ui.Flex>
  )
}
