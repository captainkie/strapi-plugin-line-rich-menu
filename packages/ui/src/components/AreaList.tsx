import { areaLabel } from '@fosivo/line-rich-menu-core/browser'
import type { ActionFormState } from '../action-form.js'
import { usePort } from '../port.js'
import { INVALID_COLOR } from '../styles.js'
import { ActionForm } from './ActionForm.js'

export interface AreaListProps {
  areas: readonly ActionFormState[]
  activeIndex: number | null
  /** ฟอร์ม 20 ช่องที่กางพร้อมกันเลื่อนหายาก จึงมีโหมดพับให้เลือก */
  view: 'list' | 'expanded'
  onViewChange(view: 'list' | 'expanded'): void
  onSelect(index: number): void
  onChange(index: number, next: ActionFormState): void
  aliasOptions: readonly string[]
  errors?: Readonly<Record<number, string>>
  /** ส่งมาเฉพาะตอนที่โหมดปรับผังเองเปิดอยู่ — ไม่ส่ง = ไม่มีปุ่มเพิ่ม/ลบเลยสักปุ่ม */
  onAdd?(): void
  onRemove?(index: number): void
}

/**
 * รายการช่องทั้งหมด — หนึ่ง `<section>` ต่อหนึ่งช่อง ประกอบ accordion เองจาก
 * `<section>` + `<button aria-expanded>` + children แบบมีเงื่อนไข แทนที่จะใช้ primitive
 * จาก port เพราะ ARIA ของ accordion ต้องเป็นของเราเอง ไม่ใช่แยกกันไปตาม design system
 * สองเวอร์ชันที่อาจ implement accordion ต่างกัน (เช่น Modal/Collapse ของ DS v1 vs v2)
 */
export function AreaList({
  areas, activeIndex, view, onViewChange, onSelect, onChange, aliasOptions, errors, onAdd, onRemove,
}: AreaListProps) {
  const { ui, t } = usePort()

  return (
    <ui.Flex direction="column" gap={2}>
      <ui.Flex justifyContent="space-between" alignItems="center">
        <ui.Typography as="h2" variant="delta">{t('editor.actions')}</ui.Typography>
        <ui.Flex gap={1}>
          <ui.IconButton label={t('editor.view.list')} onClick={() => onViewChange('list')} testId="view-list">
            ☰
          </ui.IconButton>
          <ui.IconButton label={t('editor.view.expanded')} onClick={() => onViewChange('expanded')} testId="view-expanded">
            ⛶
          </ui.IconButton>
          {onAdd === undefined ? null : (
            <ui.Button
              variant="secondary"
              testId="area-add"
              // เพดาน 20 ช่องเป็นข้อจำกัดของ LINE เอง (สเปก §2.2) ไม่ใช่ตัวเลขที่เราเลือก
              disabled={areas.length >= 20}
              onClick={onAdd}
            >
              {t('editor.layout.add')}
            </ui.Button>
          )}
          {/* ปุ่มเพิ่มถูก disable ไว้เฉย ๆ ที่ 20 ช่องบอกอะไรผู้ใช้ไม่ได้เลยว่าทำไมกดไม่ได้ —
              ข้อความนี้ตอบคำถามนั้นตรง ๆ แทนที่จะปล่อยให้เดาว่าเป็นบั๊กหรือของจริง */}
          {onAdd !== undefined && areas.length >= 20 ? (
            <ui.Typography variant="pi" textColor="neutral600">{t('editor.layout.limit')}</ui.Typography>
          ) : null}
        </ui.Flex>
      </ui.Flex>

      {areas.map((area, index) => {
        const error = errors?.[index]
        const open = view === 'expanded' || activeIndex === index
        return (
          <section key={index} style={{ border: '1px solid #dcdce4', borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                data-testid={`area-header-${index}`}
                aria-expanded={open}
                onClick={() => onSelect(index)}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between',
                  padding: '.6rem .8rem', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                <span>{areaLabel(index)}</span>
                {error === undefined ? null : (
                  <span data-testid={`area-error-${index}`} style={{ color: INVALID_COLOR }}>{error}</span>
                )}
              </button>
              {onRemove === undefined ? null : (
                <ui.IconButton
                  label={t('editor.layout.remove')}
                  testId={`area-remove-${index}`}
                  // เหลือศูนย์ช่องแล้ว payload จะถูก LINE ปฏิเสธด้วย "1–20 ช่อง" โดยที่ผู้ใช้
                  // ไม่มีทางรู้ว่าตัวเองทำอะไรผิด กันไว้ที่นี่ตั้งแต่ต้น
                  disabled={areas.length <= 1}
                  onClick={() => onRemove(index)}
                >
                  ✕
                </ui.IconButton>
              )}
            </div>
            {open ? (
              <div data-testid={`area-body-${index}`} style={{ padding: '.8rem' }}>
                <ActionForm
                  value={area}
                  aliasOptions={aliasOptions}
                  onChange={(next) => onChange(index, next)}
                  {...(error === undefined ? {} : { error })}
                />
              </div>
            ) : null}
          </section>
        )
      })}
    </ui.Flex>
  )
}
