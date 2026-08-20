import { useState } from 'react'
import {
  TEMPLATES, ValidationError, validateRichMenu,
  type Bounds, type RichMenuSizeName,
} from '@fosivo/line-rich-menu-core/browser'
import { emptyActionForm, toAction, type ActionFormState } from '../action-form.js'
import { usePort } from '../port.js'
import { AreaList } from '../components/AreaList.js'
import { ChatBarSettings, type ChatBarValue } from '../components/ChatBarSettings.js'
import { CanvasEditor } from '../components/CanvasEditor.js'
import { ImageField, type UploadedImage } from '../components/ImageField.js'
import { MainSettings } from '../components/MainSettings.js'
import { Preview } from '../components/Preview.js'
import { TemplatePicker } from '../components/TemplatePicker.js'

export interface RichMenuDraft {
  title: string
  startAt: string
  endAt: string
  templateKey: string | null
  areas: ActionFormState[]
  bounds: Bounds[]
  sizeName: RichMenuSizeName
  chatBar: ChatBarValue
  image: UploadedImage | null
}

export function emptyDraft(): RichMenuDraft {
  return {
    title: '',
    startAt: '',
    endAt: '',
    templateKey: null,
    areas: [],
    bounds: [],
    sizeName: 'large',
    // เมนูใหม่แสดงแถบไว้ (shown) โดย default ตามที่ LINE OA Manager เองทำ — สเปก §5.7
    // "Default behavior (•) Shown". Preview จะวาด CanvasEditor ซ้อนอีกชุดตอนกางแถบก็จริง แต่ชุดนั้น
    // ถูกซ่อนจาก accessibility tree แล้ว (aria-hidden ที่ Preview.tsx) จึงไม่ชนกับ canvas หลักอีก
    chatBar: { mode: 'default', text: '', selected: true },
    image: null,
  }
}

export interface RichMenuEditorProps {
  initial?: RichMenuDraft
  aliasOptions: readonly string[]
  onSave(draft: RichMenuDraft, publish: boolean): Promise<void>
  onCancel(): void
}

/**
 * ผู้ใช้กรอกอะไรลงช่องนี้ไปแล้วหรือยัง — ใช้ตัดสินว่าการเปลี่ยน template จะทำลายงานหรือไม่
 * ข้าม `type`/`mode` เพราะทั้งคู่มีค่า default อยู่แล้วเสมอ (ไม่ใช่ '') ไม่ได้แปลว่าผู้ใช้กรอกอะไร
 */
export function hasAnyActionConfigured(area: ActionFormState): boolean {
  return Object.entries(area).some(([key, value]) => key !== 'type' && key !== 'mode' && value !== '')
}

/** แปลง path ของ issue เช่น `areas.3.action.uri` เป็นเลข index ของช่อง */
function areaIndexOf(path: string): number | null {
  const match = /^areas\.(\d+)/.exec(path)
  return match === null ? null : Number(match[1])
}

export function RichMenuEditor({ initial, aliasOptions, onSave, onCancel }: RichMenuEditorProps) {
  const { ui, t, toast } = usePort()
  const [draft, setDraft] = useState<RichMenuDraft>(initial ?? emptyDraft())
  const [picking, setPicking] = useState(false)
  const [outlines, setOutlines] = useState(true)
  const [active, setActive] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'expanded'>('list')
  const [areaErrors, setAreaErrors] = useState<Record<number, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [chatBarError, setChatBarError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const template = draft.templateKey === null ? null : TEMPLATES[draft.templateKey] ?? null
  const size = template?.size ?? { width: 2500, height: 1686 }

  const applyTemplate = (key: string) => {
    const next = TEMPLATES[key]!
    setDraft((prev) => {
      const prevTemplate = prev.templateKey === null ? null : TEMPLATES[prev.templateKey] ?? null
      const sizeChanged = prevTemplate === null
        || prevTemplate.size.width !== next.size.width
        || prevTemplate.size.height !== next.size.height
      return {
        ...prev,
        templateKey: key,
        sizeName: next.sizeName,
        bounds: [...next.bounds],
        // เปลี่ยน template = ช่องเปลี่ยนทั้งชุด action เดิมจึงผูกกับช่องเดิมไม่ได้อีก
        areas: next.bounds.map(() => emptyActionForm()),
        // เปลี่ยนขนาดผืนผ้าใบ (large ↔ compact) = พิกัดเปลี่ยนทั้งชุด รูปเดิมจึงไม่พอดีกับผืนผ้าใบใหม่
        // อีกต่อไป (สเปก §5.6.3) — ต่างจาก action ตรงที่ถ้าขนาดเท่าเดิม รูปยังใช้ต่อได้ ไม่ต้องเสียของเดิม
        image: sizeChanged ? null : prev.image,
      }
    })
    setActive(null)
    setAreaErrors({})
    setPicking(false)
  }

  const save = async (publish: boolean) => {
    setFormError(null)
    setAreaErrors({})
    setChatBarError(null)

    if (publish) {
      if (draft.templateKey === null) {
        setFormError(t('editor.error.noTemplate'))
        return
      }
      // โหมด custom แต่พิมพ์ว่างไว้ — เดิมจุดนี้เติม default label ให้เงียบ ๆ ตอน publish ทั้งที่ draft
      // ยังบันทึกโหมด custom อยู่ พอเปิดร่างนี้กลับมาแก้จะแยกไม่ออกว่าใครเป็นคนพิมพ์ label ที่เห็น
      // (สเปก §5.5 คือเหตุผลที่เก็บ mode แยกจาก text) ต้องกันไว้เป็น validation error ที่ช่องนั้นแทน
      if (draft.chatBar.mode === 'custom' && draft.chatBar.text === '') {
        setChatBarError(t('editor.error.emptyChatBarText'))
        return
      }
      // ตรวจ payload กับ schema ก่อนเช็ครูป — error รายช่อง (เช่น action ไม่ครบ) ต้อง
      // โผล่ที่ช่องนั้น (สเปก §5.6 ข้อ 4) ไม่ใช่ถูกบัง form error "ยังไม่มีรูป" เสียก่อน
      // รูปเองไม่ได้อยู่ใน RichMenuPayload (LINE อัปโหลดแยก endpoint) จึงเช็คทีหลังเสมอ
      try {
        validateRichMenu({
          size,
          selected: draft.chatBar.selected,
          name: draft.title === '' ? t('editor.untitled') : draft.title,
          // ข้อความว่างของโหมด custom ถูกกันไว้เป็น chatBarError ข้างบนแล้ว ตรงนี้จึงเหลือแค่กรณี
          // mode === 'default' ที่ต้องเติม label กลางให้เสมอ ไม่มีการเติมแทนความว่างอีกต่อไป
          chatBarText: draft.chatBar.mode === 'custom' ? draft.chatBar.text : t('chatBar.defaultLabel'),
          areas: draft.bounds.map((bounds, index) => ({
            bounds,
            action: toAction(draft.areas[index] ?? emptyActionForm()),
          })),
        })
      } catch (error) {
        if (error instanceof ValidationError) {
          const next: Record<number, string> = {}
          for (const issue of error.issues) {
            const index = areaIndexOf(issue.path)
            if (index === null) setFormError(t(`validation.${issue.code}`))
            else next[index] = t(`validation.${issue.code}`)
          }
          setAreaErrors(next)
          if (Object.keys(next).length > 0 && view === 'list') setActive(Number(Object.keys(next)[0]))
          return
        }
        throw error
      }
      if (draft.image === null) {
        setFormError(t('editor.error.noImage'))
        return
      }
    }

    setSaving(true)
    try {
      await onSave(draft, publish)
      toast({ type: 'success', message: t(publish ? 'editor.published' : 'editor.savedDraft') })
    } catch {
      toast({ type: 'danger', message: t('editor.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <ui.Flex gap={2}>
      <ui.Button variant="secondary" testId="cancel" onClick={onCancel} disabled={saving}>
        {t('common.cancel')}
      </ui.Button>
      <ui.Button variant="secondary" testId="save-draft" onClick={() => void save(false)} disabled={saving}>
        {t('editor.saveDraft')}
      </ui.Button>
      <ui.Button testId="save-publish" onClick={() => void save(true)} disabled={saving}>
        {t('editor.save')}
      </ui.Button>
    </ui.Flex>
  )

  return (
    <ui.Flex direction="column" gap={4}>
      <ui.Flex justifyContent="space-between" alignItems="center">
        <ui.Typography variant="alpha">{t('editor.heading')}</ui.Typography>
        {actions}
      </ui.Flex>

      {formError === null ? null : <ui.Alert variant="danger">{formError}</ui.Alert>}

      <MainSettings
        value={{ title: draft.title, startAt: draft.startAt, endAt: draft.endAt }}
        onChange={(next) => setDraft((prev) => ({ ...prev, ...next }))}
      />

      <ui.Divider />

      <ui.Flex gap={4} alignItems="flex-start">
        {/* Preview มาก่อนคอลัมน์ template/image/actions ตามผัง §5.7 (ซ้ายคือ Preview ขวาคือ
            Template/Image/Actions) — เดิมสลับไว้เพราะ canvas ที่ฝังใน Preview วาดช่อง A/B ด้วย
            aria-label เดียวกับ canvas หลักที่แก้ไขได้จริง ทำให้ query ด้วย role="button" ชนกัน
            ตอนนี้ preview-menu ถูก aria-hidden แล้ว (ดู Preview.tsx) จึงไม่หลงเหลือใน accessibility
            tree อีก ลำดับ DOM จึงกลับไปตามภาพหน้าจอได้โดยไม่กระทบการเลือกช่องด้วยคีย์บอร์ด/screen reader */}
        <ui.Flex direction="column" gap={2}>
          <Preview
            size={size}
            bounds={draft.bounds}
            chatBarText={draft.chatBar.mode === 'custom' ? draft.chatBar.text : ''}
            expanded={draft.chatBar.selected}
            {...(draft.image === null ? {} : { imageUrl: draft.image.url })}
          />
          <ui.Toggle
            name="outlines"
            label={t('editor.showOutlines')}
            checked={outlines}
            onChange={setOutlines}
          />
        </ui.Flex>

        <ui.Flex direction="column" gap={3}>
          <ui.Flex gap={2} alignItems="center">
            <ui.Typography>{t('editor.template')}</ui.Typography>
            <ui.Button variant="secondary" testId="open-template-picker" onClick={() => setPicking(true)}>
              {draft.templateKey === null ? t('common.select') : t('common.change')}
            </ui.Button>
          </ui.Flex>

          <ui.Flex gap={2} alignItems="center">
            <ui.Typography>{t('editor.image')}</ui.Typography>
            <ImageField
              value={draft.image}
              size={size}
              disabled={draft.templateKey === null}
              onChange={(next) => setDraft((prev) => ({ ...prev, image: next }))}
            />
          </ui.Flex>

          {template === null ? null : (
            // testid ของตัวเอง เพราะ CanvasEditor ทุกตัวใช้ data-testid="rich-menu-canvas" เหมือนกันหมด
            // (รวมถึงชุดที่ฝังอยู่ใน Preview) — ต้องมี wrapper แยกให้ทดสอบ query เจาะจงมาที่ canvas
            // ที่แก้ไขได้จริงตัวนี้ได้ ไม่ใช่ตัวไหนก็ได้ที่ query เจอก่อน
            <div data-testid="editable-canvas">
              <CanvasEditor
                size={size}
                bounds={draft.bounds}
                showOutlines={outlines}
                activeIndex={active}
                onSelect={setActive}
                errors={areaErrors}
                {...(draft.image === null ? {} : { imageUrl: draft.image.url })}
              />
            </div>
          )}

          <AreaList
            areas={draft.areas}
            activeIndex={active}
            view={view}
            onViewChange={setView}
            onSelect={setActive}
            onChange={(index, next) =>
              setDraft((prev) => ({
                ...prev,
                areas: prev.areas.map((a, i) => (i === index ? next : a)),
              }))}
            aliasOptions={aliasOptions}
            errors={areaErrors}
          />
        </ui.Flex>
      </ui.Flex>

      <ui.Divider />

      <ChatBarSettings
        value={draft.chatBar}
        onChange={(next) => setDraft((prev) => ({ ...prev, chatBar: next }))}
        {...(chatBarError === null ? {} : { error: chatBarError })}
      />

      <ui.Flex justifyContent="flex-end">{actions}</ui.Flex>

      <TemplatePicker
        open={picking}
        currentKey={draft.templateKey}
        hasConfiguredActions={draft.areas.some(hasAnyActionConfigured)}
        hasImage={draft.image !== null}
        onApply={applyTemplate}
        onClose={() => setPicking(false)}
      />
    </ui.Flex>
  )
}
