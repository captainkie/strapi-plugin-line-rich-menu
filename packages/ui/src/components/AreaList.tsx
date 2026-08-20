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
}

/**
 * รายการช่องทั้งหมด — หนึ่ง `<section>` ต่อหนึ่งช่อง ประกอบ accordion เองจาก
 * `<section>` + `<button aria-expanded>` + children แบบมีเงื่อนไข แทนที่จะใช้ primitive
 * จาก port เพราะ ARIA ของ accordion ต้องเป็นของเราเอง ไม่ใช่แยกกันไปตาม design system
 * สองเวอร์ชันที่อาจ implement accordion ต่างกัน (เช่น Modal/Collapse ของ DS v1 vs v2)
 */
export function AreaList({
  areas, activeIndex, view, onViewChange, onSelect, onChange, aliasOptions, errors,
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
        </ui.Flex>
      </ui.Flex>

      {areas.map((area, index) => {
        const error = errors?.[index]
        const open = view === 'expanded' || activeIndex === index
        return (
          <section key={index} style={{ border: '1px solid #dcdce4', borderRadius: 4 }}>
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
