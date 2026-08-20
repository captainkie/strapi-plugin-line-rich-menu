import { useState } from 'react'
import {
  SIZE_LADDER, TEMPLATES, renderTemplateSvg, type RichMenuSizeName, type TemplateDef,
} from '@fosivo/line-rich-menu-core/browser'
import { usePort } from '../port.js'
import { OUTLINE_COLOR } from '../styles.js'

export interface TemplatePickerProps {
  open: boolean
  currentKey: string | null
  /** ผู้ใช้ตั้ง action ไว้แล้วหรือยัง — ถ้าตั้งแล้วการเปลี่ยน template จะทิ้งมันไป */
  hasConfiguredActions: boolean
  onApply(key: string): void
  onClose(): void
}

function group(name: RichMenuSizeName): TemplateDef[] {
  return Object.values(TEMPLATES).filter((t) => t.sizeName === name)
}

function sizesLabel(name: RichMenuSizeName): string {
  return SIZE_LADDER[name].map((s) => `${s.width}×${s.height}`).join(' · ')
}

export function TemplatePicker({
  open, currentKey, hasConfiguredActions, onApply, onClose,
}: TemplatePickerProps) {
  const { ui, t } = usePort()
  const [selected, setSelected] = useState<string | null>(currentKey)
  const [confirming, setConfirming] = useState(false)

  if (!open) return null

  const apply = () => {
    if (selected === null) return
    // เปลี่ยน template = ทิ้ง action ที่ตั้งไว้ทั้งหมด ถามก่อนเสมอถ้ามีอะไรจะเสีย
    if (hasConfiguredActions && selected !== currentKey) {
      setConfirming(true)
      return
    }
    onApply(selected)
  }

  const renderGroup = (name: RichMenuSizeName) => (
    <section key={name}>
      <h3>{t(`template.picker.group.${name}`)}</h3>
      <p>{sizesLabel(name)}</p>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        {group(name).map((tpl) => (
          <button
            key={tpl.key}
            type="button"
            data-testid={`template-option-${tpl.key}`}
            aria-pressed={selected === tpl.key}
            onClick={() => setSelected(tpl.key)}
            style={{
              padding: 0,
              border: `2px solid ${selected === tpl.key ? OUTLINE_COLOR : '#dcdce4'}`,
              borderRadius: 6,
              background: 'none',
              cursor: 'pointer',
              color: OUTLINE_COLOR,
            }}
          >
            <span
              style={{ display: 'block' }}
              // thumbnail มาจาก bounds ไม่ใช่ไฟล์ภาพ จึงไม่มีสิทธิ์ของ LINE มาเกี่ยวข้อง
              // และ layout ที่ผู้ใช้สร้างเองก็ได้ thumbnail จากโค้ดเดียวกัน — ปลอดภัยเพราะ
              // renderTemplateSvg แปลงทุกค่าที่รับเข้ามาเป็นตัวเลขก่อนเสมอ (safeInt) ไม่มีทาง
              // ที่สตริงจากผู้ใช้จะไหลเข้ามาใน markup ได้ ถ้าฟังก์ชันนั้นเปลี่ยนไปรับข้อความอิสระ
              // ต้องกลับมาทบทวนบรรทัดนี้ก่อน
              dangerouslySetInnerHTML={{ __html: renderTemplateSvg(tpl.bounds, tpl.size) }}
            />
            <span style={{ display: 'block', padding: '.4rem', fontSize: '.8rem', color: '#32324d' }}>
              {t('template.picker.areaCount', { count: tpl.bounds.length })}
            </span>
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <ui.Modal
      open
      onClose={onClose}
      title={t('template.picker.title')}
      footer={
        confirming ? (
          <>
            <ui.Button variant="secondary" onClick={() => setConfirming(false)}>
              <span data-testid="template-cancel-confirm">{t('common.cancel')}</span>
            </ui.Button>
            <ui.Button variant="danger" onClick={() => onApply(selected!)}>
              <span data-testid="template-confirm">{t('template.picker.confirmDiscard')}</span>
            </ui.Button>
          </>
        ) : (
          <>
            <ui.Button variant="secondary" onClick={onClose}>{t('common.cancel')}</ui.Button>
            <ui.Button onClick={apply} disabled={selected === null} testId="template-apply">
              {t('common.apply')}
            </ui.Button>
          </>
        )
      }
    >
      {confirming ? (
        <ui.Alert variant="warning" title={t('template.picker.discardTitle')}>
          {t('template.picker.discardBody')}
        </ui.Alert>
      ) : (
        <>{renderGroup('large')}{renderGroup('compact')}</>
      )}
    </ui.Modal>
  )
}
