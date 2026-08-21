import { usePort } from '../port.js'
import { CharCount } from './CharCount.js'

/** จำนวนตัวอักษรสูงสุดของ Title — ค่าเดียวที่ทั้ง `maxLength` และ `CharCount` ใช้ ไม่พิมพ์ซ้ำ */
const TITLE_MAX = 30

export interface MainSettingsValue {
  /** ชื่อสำหรับจัดการภายใน จำกัด 30 ตัว — คนละตัวกับ `name` ใน payload ของ LINE ที่ยอมได้ 300 */
  title: string
  startAt: string
  endAt: string
}

export interface MainSettingsProps {
  value: MainSettingsValue
  onChange(next: MainSettingsValue): void
  errors?: Partial<Record<keyof MainSettingsValue, string>>
}

export function MainSettings({ value, onChange, errors }: MainSettingsProps) {
  const { ui, t } = usePort()
  const set = <K extends keyof MainSettingsValue>(key: K, next: MainSettingsValue[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <ui.Flex direction="column" gap={3}>
      <ui.Typography as="h2" variant="delta">{t('editor.mainSettings')}</ui.Typography>
      <ui.Flex direction="column" gap={1}>
        <ui.TextInput
          name="title"
          label={t('editor.title')}
          value={value.title}
          maxLength={TITLE_MAX}
          hint={t('editor.title.hint')}
          onChange={(next) => set('title', next)}
          {...(errors?.title === undefined ? {} : { error: errors.title })}
        />
        <CharCount value={value.title} max={TITLE_MAX} />
      </ui.Flex>
      <ui.Flex gap={2} alignItems="flex-end">
        <ui.TextInput name="startAt" label={t('editor.displayPeriod.start')} value={value.startAt}
          placeholder="YYYY-MM-DD HH:mm" onChange={(next) => set('startAt', next)}
          {...(errors?.startAt === undefined ? {} : { error: errors.startAt })} />
        <ui.TextInput name="endAt" label={t('editor.displayPeriod.end')} value={value.endAt}
          placeholder="YYYY-MM-DD HH:mm" onChange={(next) => set('endAt', next)}
          {...(errors?.endAt === undefined ? {} : { error: errors.endAt })} />
        <ui.Button variant="secondary" testId="clear-period" onClick={() => onChange({ ...value, startAt: '', endAt: '' })}>
          {t('common.clear')}
        </ui.Button>
      </ui.Flex>
    </ui.Flex>
  )
}
