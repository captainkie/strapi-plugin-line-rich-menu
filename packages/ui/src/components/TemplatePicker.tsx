import { useState } from 'react'
import {
  SIZE_LADDER, TEMPLATES, canvasSizeChanged, renderTemplateSvg,
  type RichMenuSizeName, type TemplateDef,
} from '@fosivo/line-rich-menu-core/browser'
import { usePort } from '../port.js'
import { OUTLINE_COLOR } from '../styles.js'

export interface TemplatePickerProps {
  currentKey: string | null
  /** ผู้ใช้ตั้ง action ไว้แล้วหรือยัง — ถ้าตั้งแล้วการเปลี่ยน template จะทิ้งมันไป */
  hasConfiguredActions: boolean
  /** มีรูปอัปโหลดไว้แล้วหรือยัง — ถ้ามีและ template ใหม่เปลี่ยนขนาดผืนผ้าใบ รูปเดิมจะไม่พอดีอีกต่อไป (สเปก §5.6.3) */
  hasImage: boolean
  onApply(key: string): void
  onClose(): void
}

function group(name: RichMenuSizeName): TemplateDef[] {
  return Object.values(TEMPLATES).filter((t) => t.sizeName === name)
}

function sizesLabel(name: RichMenuSizeName): string {
  return SIZE_LADDER[name].map((s) => `${s.width}×${s.height}`).join(' · ')
}

/**
 * ไม่มีพร็อพ `open` โดยตั้งใจ — ผู้เรียกต้อง mount/unmount เอาเอง (`{picking ? <TemplatePicker/> : null}`)
 *
 * ตอนที่มันรับ `open` แล้วผู้เรียก mount ค้างไว้ตลอดอายุหน้า `selected`/`confirming` ด้านล่างไม่เคย
 * ถูกรีเซ็ตเลย: ผู้ใช้ที่กด Apply จนได้กล่องยืนยัน "ทิ้ง action ทั้งหมดไหม" แล้วปิด modal ทิ้งแทนที่จะ
 * ตอบ พอเปิด picker ใหม่จะเจอกล่องยืนยันนั้นค้างอยู่ทันทีโดยไม่มีตารางให้เลือก และมันพูดถึง template
 * ที่เขาเดินจากไปแล้ว — คลิกเดียวทิ้งงานทั้งหมด การ mount ใหม่ทุกครั้งคือสิ่งที่ทำให้ state สดเสมอ
 */
export function TemplatePicker({
  currentKey, hasConfiguredActions, hasImage, onApply, onClose,
}: TemplatePickerProps) {
  const { ui, t } = usePort()
  const [selected, setSelected] = useState<string | null>(currentKey)
  const [confirming, setConfirming] = useState(false)

  // เปลี่ยนขนาดผืนผ้าใบ = พิกัดเปลี่ยนทั้งชุด รูปเดิมจึงไม่พอดีกับผืนผ้าใบใหม่อีกต่อไป (สเปก §5.6.3)
  // ต่างจาก action ตรงที่ถ้าขนาดเท่าเดิม รูปยังใช้ต่อได้ ไม่ต้องเสียของเดิม
  //
  // ต้องถามผ่าน canvasSizeChanged ของ core เท่านั้น — ที่นี่กับ RichMenuEditor ต้องตอบคำถามนี้
  // ตรงกันเสมอ ไม่งั้นจะเตือนโดยไม่ทิ้ง หรือ (แย่กว่า) ทิ้งโดยไม่เตือน
  const nextSize = selected === null ? null : TEMPLATES[selected]?.size ?? null
  const currentSize = currentKey === null ? null : TEMPLATES[currentKey]?.size ?? null
  const willDropImage = hasImage && nextSize !== null && canvasSizeChanged(currentSize, nextSize)

  const apply = () => {
    if (selected === null) return
    // เปลี่ยน template = ทิ้ง action ที่ตั้งไว้ทั้งหมด และอาจทิ้งรูปเดิมด้วยถ้าขนาดเปลี่ยน — ถามก่อนเสมอถ้ามีอะไรจะเสีย
    if (selected !== currentKey && (hasConfiguredActions || willDropImage)) {
      setConfirming(true)
      return
    }
    onApply(selected)
  }

  const renderGroup = (name: RichMenuSizeName) => (
    <section key={name}>
      <ui.Typography as="h3" variant="delta">{t(`template.picker.group.${name}`)}</ui.Typography>
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
              {/* อังกฤษต้องแยกรูปเอกพจน์ ไม่งั้นแบบที่มีช่องเดียวจะขึ้นว่า "1 areas" — ภาษาไทยใช้
                  สตริงเดียวกันทั้งสองรูปเพราะไม่มีพหูพจน์ แต่ต้องมีคีย์ครบทั้งสองภาษาเท่ากันอยู่ดี */}
              {t(
                tpl.bounds.length === 1 ? 'template.picker.areaCount.one' : 'template.picker.areaCount',
                { count: tpl.bounds.length },
              )}
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
            <ui.Button variant="secondary" testId="template-cancel-confirm" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </ui.Button>
            <ui.Button variant="danger" testId="template-confirm" onClick={() => onApply(selected!)}>
              {t('template.picker.confirmDiscard')}
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
        // สเปก §5.6.2 ต้องการให้แจ้งครบว่าอะไรถูกทิ้งไปบ้าง ไม่ใช่แค่ action เสมอ — ข้อความจึงแยกเป็น
        // สองย่อหน้าตามสิ่งที่จะเสียจริง โชว์เฉพาะย่อหน้าที่เกี่ยวข้อง อาจโชว์พร้อมกันทั้งคู่ก็ได้
        <ui.Alert variant="warning" title={t('template.picker.discardTitle')}>
          {hasConfiguredActions ? <p>{t('template.picker.discardBody')}</p> : null}
          {willDropImage ? <p data-testid="discard-image-warning">{t('template.picker.discardImageBody')}</p> : null}
        </ui.Alert>
      ) : (
        <>{renderGroup('large')}{renderGroup('compact')}</>
      )}
    </ui.Modal>
  )
}
