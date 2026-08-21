import { useState } from 'react'
import {
  SIZE_LADDER, TEMPLATES, ValidationError, canvasSizeChanged, validateRichMenu,
  type Bounds, type RichMenuSizeName,
} from '@fosivo/line-rich-menu-core/browser'
import { emptyActionForm, toAction, type ActionFormState } from '../action-form.js'
import { validationKey } from '../i18n/index.js'
import { usePort } from '../port.js'
import { AreaList } from '../components/AreaList.js'
import { ChatBarSettings, type ChatBarValue } from '../components/ChatBarSettings.js'
import { ImageField, type UploadedImage } from '../components/ImageField.js'
import { MainSettings, type MainSettingsValue } from '../components/MainSettings.js'
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
    // "Default behavior (•) Shown" ค่านี้เป็นข้อมูลล้วน บอกว่าผู้ใช้ปลายทางเปิดแชทแล้วเห็นเมนูกางไหม
    // ไม่ได้คุมว่าหน้า editor จะวาด canvas หรือเปล่า (ดูตรงที่ส่ง expanded ให้ Preview)
    chatBar: { mode: 'default', text: '', selected: true },
    image: null,
  }
}

export interface RichMenuEditorProps {
  /**
   * ถูกอ่านแค่ตอน mount เท่านั้น (`useState(initial ?? emptyDraft())`) — ถ้ามาถึงก่อน fetch
   * ของ record จริงเสร็จ (เช่นหน้า edit ของ Plan 03 ที่ยังไม่มีในตอนนี้) หน้านั้นต้อง render หลัง
   * fetch เสร็จ หรือใช้ `key={id}` บังคับ remount ไม่งั้นฟอร์มจะโชว์ค่าว่างค้างทับของเดิมที่เพิ่งโหลดมา
   */
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
  const [customLayout, setCustomLayout] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'expanded'>('list')
  const [areaErrors, setAreaErrors] = useState<Record<number, string>>({})
  const [mainErrors, setMainErrors] = useState<Partial<Record<keyof MainSettingsValue, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [chatBarError, setChatBarError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ต้องอิงจาก draft.sizeName เสมอ ไม่ใช่จาก template ที่ templateKey ชี้ไป — โหมดปรับผังเอง
  // (moveBounds/addArea/removeArea) เคลียร์ templateKey ทิ้งทันทีที่ผู้ใช้แก้ผัง (ผังไม่ตรงกับ
  // template นั้นอีกแล้ว) แต่ sizeName ยังอยู่ ถ้าอิงจาก TEMPLATES[templateKey] อย่างเดียว พอ
  // templateKey เป็น null ขนาดผืนผ้าใบจะเด้งกลับไปที่ดีฟอลต์ (large) ทันที ทั้งที่ผู้ใช้อาจกำลังแก้
  // template compact อยู่ — พิกัดเดิม (คำนวณจากขนาด compact) จะถูกตีความผิดเป็นขนาด large ทันที
  // ทำให้ทุกช่องเพี้ยนตำแหน่ง
  //
  // ดัชนี [0] ของ ladder คือขนาดเต็ม (ตัวเดียวกับ LARGE/COMPACT ที่ template ทุกตัวใช้) — ตัวถัดไป
  // ในลิสต์เป็นขั้นลดขนาดสำหรับบีบไฟล์ภาพให้ไม่เกิน 1 MB เท่านั้น ไม่ใช่ขนาดผืนผ้าใบที่ใช้แก้ผัง
  const size = SIZE_LADDER[draft.sizeName][0]!

  const applyTemplate = (key: string) => {
    const next = TEMPLATES[key]!
    setDraft((prev) => {
      const prevSize = prev.templateKey === null ? null : TEMPLATES[prev.templateKey]?.size ?? null
      return {
        ...prev,
        templateKey: key,
        sizeName: next.sizeName,
        bounds: [...next.bounds],
        // เปลี่ยน template = ช่องเปลี่ยนทั้งชุด action เดิมจึงผูกกับช่องเดิมไม่ได้อีก
        areas: next.bounds.map(() => emptyActionForm()),
        // เปลี่ยนขนาดผืนผ้าใบ = พิกัดเปลี่ยนทั้งชุด รูปเดิมจึงไม่พอดีกับผืนผ้าใบใหม่อีกต่อไป (สเปก §5.6.3)
        // ต่างจาก action ตรงที่ถ้าขนาดเท่าเดิม รูปยังใช้ต่อได้ ไม่ต้องเสียของเดิม
        //
        // ต้องเป็น predicate ตัวเดียวกับที่ TemplatePicker ใช้ตัดสินว่าจะเตือนไหม — สองที่นี้ตอบ
        // ไม่ตรงกันเมื่อไหร่ ผู้ใช้จะโดนทิ้งรูปโดยไม่มีใครถามเขาก่อน
        image: canvasSizeChanged(prevSize, next.size) ? null : prev.image,
      }
    })
    setActive(null)
    setAreaErrors({})
    // ผู้ใช้เพิ่งทำสิ่งที่แบนเนอร์ "ยังไม่มี template" ขอไว้ (เลือก template) — ต้องหายไปทันที
    // ไม่ใช่ค้างอยู่บนจอจนกว่าจะกด save รอบถัดไปที่บรรทัดต้นของ save() ถึงจะไปเคลียร์ให้
    setFormError(null)
    // ข้อความ "ต้องเป็นสัดส่วนของ template (WxH)" ผูกกับขนาดของ template ตัวเดิม การเปลี่ยน
    // template ทำให้มันกลายเป็นข้อมูลที่ผิด ไม่ใช่แค่เก่า — ต้องหายไปพร้อมกัน
    setImageError(null)
    setPicking(false)
  }

  /**
   * ลาก/ปรับขนาดช่อง — เขียนกลับลง `draft.bounds` ตำแหน่งเดิม ไม่แตะ `draft.areas`
   * เพราะ action ของช่องนั้นไม่ได้เปลี่ยนตามพิกัด
   *
   * `templateKey` ถูกล้างเป็น null ทันทีที่ผู้ใช้ขยับช่องแรก — ผังไม่ตรงกับ template ที่เลือกไว้
   * อีกต่อไป ถ้ายังเก็บชื่อไว้ ตอนเปิดกลับมาแก้ผู้ใช้จะเห็นชื่อ template ที่ไม่ตรงกับสิ่งที่อยู่บน
   * ผืนผ้าใบ แล้วอาจกดใช้ซ้ำโดยไม่รู้ว่ามันจะทับผังที่ตัวเองปรับไว้ทั้งหมด
   */
  const moveBounds = (index: number, next: Bounds) => {
    setDraft((prev) => ({
      ...prev,
      templateKey: null,
      bounds: prev.bounds.map((bounds, i) => (i === index ? next : bounds)),
    }))
  }

  const addArea = () => {
    setDraft((prev) => {
      if (prev.bounds.length >= 20) return prev
      // ช่องใหม่วางมุมซ้ายบน ขนาดหนึ่งในสี่ของผืนผ้าใบ — ตำแหน่งที่มองเห็นแน่นอน ทับช่องเดิม
      // แน่นอนด้วย ซึ่งรับได้เพราะโหมดนี้เปิดอยู่และผู้ใช้ลากต่อได้ทันที (LINE อนุญาตให้ช่องทับกัน)
      const fresh: Bounds = {
        x: 0, y: 0,
        width: Math.round(size.width / 2),
        height: Math.round(size.height / 2),
      }
      return {
        ...prev,
        templateKey: null,
        bounds: [...prev.bounds, fresh],
        areas: [...prev.areas, emptyActionForm()],
      }
    })
  }

  /** ลบช่องพร้อม action ของมันเป็นคู่ — สองอาเรย์นี้ผูกกันด้วย index ล้วน ๆ ตัดข้างเดียวคือ off-by-one ถาวร */
  const removeArea = (index: number) => {
    setDraft((prev) => {
      if (prev.bounds.length <= 1) return prev
      return {
        ...prev,
        templateKey: null,
        bounds: prev.bounds.filter((_, i) => i !== index),
        areas: prev.areas.filter((_, i) => i !== index),
      }
    })
    // index ที่เลือกอยู่/error ที่ค้างอยู่ ผูกกับตำแหน่งเดิมทั้งคู่ ล้างทั้งสองแทนที่จะพยายามเลื่อนตาม
    setActive(null)
    setAreaErrors({})
  }

  const save = async (publish: boolean) => {
    setFormError(null)
    setAreaErrors({})
    setMainErrors({})
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
          // ไล่ issue ที่ไม่ใช่ของช่อง (index === null) ไปลงฟิลด์ที่มันพูดถึงจริง ๆ แทนที่จะโยนรวมขึ้น
          // แบนเนอร์บนหัวฟอร์มหมด — เหมือนที่ areaErrors ทำให้ AreaList อยู่แล้ว (สเปก §5.6 ข้อ 4)
          const nextAreaErrors: Record<number, string> = {}
          const nextMainErrors: Partial<Record<keyof MainSettingsValue, string>> = {}
          for (const issue of error.issues) {
            const index = areaIndexOf(issue.path)
            const message = t(validationKey(issue.code))
            if (index !== null) { nextAreaErrors[index] = message; continue }
            if (issue.path === 'name') { nextMainErrors.title = message; continue }
            if (issue.path === 'chatBarText') { setChatBarError(message); continue }
            setFormError(message)
          }
          setAreaErrors(nextAreaErrors)
          setMainErrors(nextMainErrors)
          if (Object.keys(nextAreaErrors).length > 0 && view === 'list') {
            setActive(Number(Object.keys(nextAreaErrors)[0]))
          }
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
        <ui.Typography as="h1" variant="alpha">{t('editor.heading')}</ui.Typography>
        {actions}
      </ui.Flex>

      {formError === null ? null : <ui.Alert variant="danger">{formError}</ui.Alert>}

      <MainSettings
        value={{ title: draft.title, startAt: draft.startAt, endAt: draft.endAt }}
        onChange={(next) => setDraft((prev) => ({ ...prev, ...next }))}
        errors={mainErrors}
      />

      <ui.Divider />

      <ui.Flex gap={4} alignItems="flex-start">
        {/* ผัง §5.7 วาด canvas ไว้ใน "กรอบโทรศัพท์" ช่องเดียว พร้อมสวิตช์ outline อยู่ใต้กรอบ
            ไม่ใช่พรีวิวหนึ่งตัวกับ canvas ที่แก้ไขได้อีกตัวข้างๆ — Preview จึงเป็นตัวควบคุมจริง
            ที่รับ activeIndex/onSelect/showOutlines/errors มาจากหน้านี้ */}
        <ui.Flex direction="column" gap={2}>
          <Preview
            size={size}
            bounds={draft.bounds}
            chatBarText={draft.chatBar.mode === 'custom' ? draft.chatBar.text : ''}
            // ไม่ผูกกับ draft.chatBar.selected: นั่นคือค่าที่บอกว่า "ผู้ใช้ปลายทางเปิดแชทแล้วเห็นเมนู
            // กางอยู่ไหม" ถ้าเอามาคุมการวาด canvas ตรงนี้ด้วย คนที่เลือก Collapsed จะเสีย canvas
            // ที่กำลังแก้อยู่ไปทั้งอัน แก้ต่อไม่ได้เลย ในหน้า editor จึงกางเสมอเมื่อมีผังให้แก้
            //
            // ต้องเช็คจาก draft.bounds ไม่ใช่ template !== null — โหมดปรับผังเองเคลียร์ templateKey
            // ทิ้งทันทีที่ผู้ใช้ขยับ/เพิ่ม/ลบช่องแรก (ดู moveBounds/addArea/removeArea) ถ้ายังผูกกับ
            // template อยู่ canvas ทั้งก้อนจะหายไปจากจอทันทีที่แก้ครั้งแรก ทั้งที่ areas.length ยังไม่ว่าง
            expanded={draft.bounds.length > 0}
            activeIndex={active}
            onSelect={setActive}
            showOutlines={outlines}
            errors={areaErrors}
            // 320 (ดีฟอลต์ของ Preview) พอสำหรับภาพนิ่ง แต่ตรงนี้ canvas กดเลือกช่องได้จริงและเมนูมีได้
            // ถึง 20 ช่อง — ที่ 320px ผืนผ้าใบขนาด large (2500×1686) ย่อเหลือ ~320×216 ทำให้ hit target
            // ของแต่ละช่องเล็กเกินไป ทั้งเรื่องใช้งานจริงและ WCAG 2.5.8 (ขนาดเป้าหมายขั้นต่ำ) กว้างขึ้นเป็น
            // 480 ให้พื้นที่กดพอสมควรโดยยังเหลือที่ให้คอลัมน์ Template/Image/Actions ทางขวา
            width={480}
            {...(draft.image === null ? {} : { imageUrl: draft.image.url })}
            {...(customLayout ? { onBoundsChange: moveBounds, snap: 10 } : {})}
          />
          <ui.Toggle
            name="outlines"
            label={t('editor.showOutlines')}
            checked={outlines}
            onChange={setOutlines}
          />
          <ui.Toggle
            name="custom-layout"
            label={t('editor.layout.custom')}
            checked={customLayout}
            onChange={setCustomLayout}
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
              onErrorChange={setImageError}
              {...(imageError === null ? {} : { error: imageError })}
            />
          </ui.Flex>

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
            {...(customLayout ? { onAdd: addArea, onRemove: removeArea } : {})}
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

      {/* mount ใหม่ทุกครั้งที่เปิด ไม่ใช่ mount ค้างแล้วสั่งซ่อน — state ภายในของ picker
          (แบบที่เลือกไว้ / กล่องยืนยัน) จะได้เริ่มใหม่ทุกรอบ ดูเหตุผลเต็มที่หัว TemplatePicker.tsx */}
      {picking ? (
        <TemplatePicker
          currentKey={draft.templateKey}
          hasConfiguredActions={draft.areas.some(hasAnyActionConfigured)}
          hasImage={draft.image !== null}
          onApply={applyTemplate}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </ui.Flex>
  )
}
