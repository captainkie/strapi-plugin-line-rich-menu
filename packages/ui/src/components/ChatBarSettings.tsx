import { usePort } from '../port.js'
import { CharCount } from './CharCount.js'

/** จำนวนตัวอักษรสูงสุดของป้ายกำหนดเอง — ค่าเดียวที่ทั้ง `maxLength` และ `CharCount` ใช้ ไม่พิมพ์ซ้ำ */
const CHAT_BAR_TEXT_MAX = 14

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
      <ui.Typography as="h2" variant="delta">{t('chatBar.title')}</ui.Typography>

      <ui.Flex direction="column" gap={1}>
        {/* ช่องข้อความอยู่นอก RadioGroup โดยตั้งใจ — มันไม่ใช่ตัวเลือกของกลุ่มนี้ ถ้าเอาไปไว้ข้างใน
            ผู้ใช้ screen reader จะได้ยินว่ากลุ่ม "โหมด" มีสามตัวเลือก ทั้งที่มีจริงแค่สอง */}
        <ui.RadioGroup
          name="chatBarMode"
          label={t('chatBar.mode')}
          value={value.mode}
          // ค่าที่กลับมาเป็น string ตามสัญญาของ port (adapter ไม่รู้จัก union ของเรา) — เทียบกับ
          // 'custom' ตรง ๆ แทนการ cast เพื่อให้ค่าแปลกปลอมตกไปที่ 'default' แทนที่จะเล็ดลอดเข้า state
          onChange={(next) => onChange({ ...value, mode: next === 'custom' ? 'custom' : 'default' })}
        >
          <ui.Radio value="default">{t('chatBar.mode.default')}</ui.Radio>
          <ui.Radio value="custom">{t('chatBar.mode.custom')}</ui.Radio>
        </ui.RadioGroup>
        <ui.TextInput
          name="chatBarText"
          label={t('chatBar.text')}
          value={value.text}
          maxLength={CHAT_BAR_TEXT_MAX}
          disabled={value.mode !== 'custom'}
          onChange={(next) => onChange({ ...value, text: next })}
          {...(error === undefined ? {} : { error })}
        />
        <CharCount value={value.text} max={CHAT_BAR_TEXT_MAX} />
      </ui.Flex>

      <ui.Flex direction="column" gap={1}>
        <ui.RadioGroup
          name="chatBarBehavior"
          label={t('chatBar.behavior')}
          value={value.selected ? 'shown' : 'collapsed'}
          onChange={(next) => onChange({ ...value, selected: next === 'shown' })}
        >
          <ui.Radio value="shown">{t('chatBar.behavior.shown')}</ui.Radio>
          <ui.Radio value="collapsed">{t('chatBar.behavior.collapsed')}</ui.Radio>
        </ui.RadioGroup>
      </ui.Flex>
    </ui.Flex>
  )
}
