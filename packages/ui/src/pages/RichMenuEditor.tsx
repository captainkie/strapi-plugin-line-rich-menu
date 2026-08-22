import { useState } from 'react'
import {
  DEFAULT_CHAT_BAR_TEXT, SIZE_LADDER, TEMPLATES, ValidationError, canvasSizeChanged,
  isDisplayPeriodValid, validateRichMenu,
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

/**
 * ไฟล์แม่แบบออกแบบที่ LINE โฮสต์เอง — เป็น "ลิงก์" ไปหาไฟล์ของ LINE ไม่ใช่การก็อปมาแจกต่อ (สเปกงานนี้
 * #8) เจ้าของโปรเจกต์ตัดสินใจไว้ตรง ๆ ว่าต้องลิงก์ ไม่ใช่โฮสต์เอง — แพ็กเกจนี้ ship ใต้ AGPL ไปที่ npm
 * สาธารณะ การดาวน์โหลดไฟล์นี้มาแจกต่อในตัวแพ็กเกจเองมีปัญหาเรื่องสิทธิ์การแจกจ่ายเหมือนกับที่ห้ามใส่
 * โลโก้ LINE เข้าไป (ดู LineMark.tsx) — ต้อง verify ว่า URL นี้ตอบสนองจริงก่อน commit เสมอ (ตรวจแล้ว
 * ตอนเขียนโค้ดนี้: HTTP 200, content-type: application/zip)
 */
const DESIGN_TEMPLATE_URL =
  'https://static.line-scdn.net/biz-app/16bd9ea9e03/manager/static/LINE_rich_menu_design_template.zip'

export function RichMenuEditor({ initial, aliasOptions, onSave, onCancel }: RichMenuEditorProps) {
  const { ui, t, theme, toast } = usePort()
  const [draft, setDraft] = useState<RichMenuDraft>(initial ?? emptyDraft())
  const [picking, setPicking] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
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
      // Task 20 item 8 (ui-core M1) — เดิมอ่านจาก `prev.templateKey` ซึ่งเป็นฟิลด์เดียวกับที่
      // `moveBounds`/`addArea`/`removeArea` เคลียร์เป็น `null` ทันทีที่ผู้ใช้ปรับผังเอง (โหมด custom
      // layout) ทั้งที่ `sizeName`/`bounds` (ขนาดผืนผ้าใบจริง) ยังอยู่ครบ — ผลคือหลังปรับผังเอง
      // `prevSize` อ่านเป็น `null` (แปลว่า "ยังไม่มีผืนผ้าใบ") เสมอ ต่อให้ผืนผ้าใบจริงมีอยู่และเลือก
      // template ขนาดเดิมเป๊ะ `canvasSizeChanged(null, x)` ก็ยังตอบ `true` เสมอ (ดู templates.ts)
      // รูปที่เพิ่งอัปโหลดจึงถูกทิ้งไปพร้อมคำเตือนที่พูดถึงการเปลี่ยนขนาดที่ไม่ได้เกิดขึ้นจริง
      //
      // ต้องอิงจากสิ่งที่ติดตามขนาดผืนผ้าใบจริง — expression เดียวกับ `size` ที่บรรทัดบนของไฟล์นี้
      // (`bounds.length === 0` คือ "ยังไม่เคยเลือกอะไรเลย" เท่านั้นที่ตอบ null ได้ถูกต้อง)
      const prevSize = prev.bounds.length === 0 ? null : SIZE_LADDER[prev.sizeName][0]!
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

    // สเปกงานนี้ #4 — ไม่มีการตรวจลำดับ startAt/endAt อยู่ที่ไหนเลยก่อนหน้านี้ เมนูที่ endAt มาก่อน
    // (หรือเท่ากับ) startAt บันทึกผ่านได้เงียบ ๆ แล้วไม่แสดงให้ใครเห็นเลย ตรวจ**ทุกครั้งที่บันทึก**
    // (ไม่ใช่แค่ตอน publish เหมือนที่เช็ค custom label ว่างด้านล่าง) เพราะ schema ของ adapter ทั้งสอง
    // ตัวปฏิเสธคำขอเขียนทุกคำขอที่ลำดับผิด ไม่ว่า publish หรือไม่ (ดู `isDisplayPeriodValid` ใน
    // packages/core และ superRefine ใน validation.ts ของทั้งสอง adapter — ที่นั่นไม่มีทางแยก "แค่
    // ร่าง" ออกจาก "จะ publish" ได้เลย เพราะ POST/PUT ใช้ schema เดียวกันทั้งสองทาง) พิสูจน์แล้วจาก
    // การกดจริงในเบราว์เซอร์: ถ้าเช็คแค่ตอน publish ผู้ใช้ที่กด "Save draft" ด้วยวันที่ผิดลำดับจะเจอ
    // toast ทั่วไป "บันทึกไม่สำเร็จ" (editor.saveFailed) ที่ไม่บอกอะไรเลยว่าช่องไหนผิด เพราะคำขอ
    // ไปถึงเซิร์ฟเวอร์แล้วโดนปฏิเสธที่นั่นแทน — เช็คที่นี่ก่อนเสมอเพื่อให้ error ชี้เป้าที่ช่องนั้นจริง
    // ไม่ว่าจะกดปุ่มไหน
    if (!isDisplayPeriodValid(draft.startAt, draft.endAt)) {
      setMainErrors({ endAt: t('editor.error.displayPeriodOrder') })
      return
    }

    // Task 20 item 2 (ui-core H1) — เดิม fallback 'Untitled' ถูกเติมแค่ตอนเรียก `validateRichMenu`
    // ด้านล่าง (เส้นทาง publish เท่านั้น) ส่วน `onSave(draft, publish)` ส่ง `draft.title` ดิบที่ยัง
    // ว่างอยู่เสมอ — ค่าที่ตรวจผ่านกับค่าที่ส่งจริงจึงเป็นคนละ object กัน (path 'name' ผ่านการเช็ค
    // ฝั่งนี้ได้ในเคสเดียวกับที่ adapter ปฏิเสธเสมอ เพราะ `name: z.string().min(1)`) เติม fallback
    // ที่นี่ที่เดียว **ก่อน**แยกทาง publish/draft แล้วใช้ `toSave` ตัวเดียวกันทั้งตรวจและส่งต่อจากนี้
    // ไป — ไม่ใช่คำนวณ fallback ซ้ำสองจุดที่มีสิทธิ์ไม่ตรงกันอีกต่อไป เพราะเป็น object เดียวกันจริง ๆ
    // ใช้ทุกเส้นทางบันทึก (รวม draft) ไม่ใช่แค่ publish เพราะ `menuInputSchema` ของทั้งสอง adapter
    // บังคับ `name: min(1)` เสมอไม่ว่าจะ publish หรือไม่ (ดู item 1 — create/update คือ draft write
    // path เสมอ แต่ name ไม่ได้อยู่ในสิ่งที่ item 1 ผ่อนให้ว่างได้)
    const toSave: RichMenuDraft = draft.title === ''
      ? { ...draft, title: t('editor.untitled') }
      : draft

    if (publish) {
      // เช็คจาก draft.bounds ไม่ใช่ templateKey — โหมดปรับผังเองเคลียร์ templateKey ทิ้งทันทีที่
      // ผู้ใช้ขยับ/เพิ่ม/ลบช่องแรก (moveBounds/addArea/removeArea) ถ้ายังเช็ค templateKey ตรงนี้
      // ผังที่ผู้ใช้เพิ่งปรับเองจะ publish ไม่ได้เลย และคำแนะนำในข้อความ ("เลือก template ก่อน
      // เผยแพร่") ก็ชวนให้กดปุ่มเปิด picker ซึ่งจะทับผังที่เพิ่งปรับทิ้งทั้งหมด — bounds ว่างเปล่า
      // เกิดได้เฉพาะตอนยังไม่เคยเลือกอะไรเลย (emptyDraft()) ซึ่งเป็นเวลาเดียวที่ข้อความนี้ยังถูกอยู่
      if (draft.bounds.length === 0) {
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
          name: toSave.title,
          // ข้อความว่างของโหมด custom ถูกกันไว้เป็น chatBarError ข้างบนแล้ว ตรงนี้จึงเหลือแค่กรณี
          // mode === 'default' ที่ต้องเติม label กลางให้เสมอ ไม่มีการเติมแทนความว่างอีกต่อไป
          //
          // Task 20 item 9 (ui-core M2) — เดิมใช้ t('chatBar.defaultLabel') ซึ่งเป็นคำแปลของแอดมิน
          // ไม่ใช่ DEFAULT_CHAT_BAR_TEXT ที่ publish จริงส่งให้ LINE (`resolveChatBarText` ใน
          // packages/core/src/server/payload.ts) สองผลที่ตามมา: (1) การตรวจที่นี่ตรวจคนละสตริงกับ
          // ที่ publish จริงใช้ (2) ถ้าแอปที่ host ปลั๊กอินทับคำแปล chatBar.defaultLabel ด้วยคำที่ยาว
          // กว่า 14 ตัว (ปกติได้ตามที่ i18n.test.ts ยืนยัน — "แอป Strapi ทับคำแปลของปลั๊กอินได้เป็น
          // เรื่องปกติ") การตรวจนี้จะปฏิเสธ publish ด้วย too_big ที่ผูกกับ chatBarText ซึ่ง**ปิดใช้งาน
          // อยู่**ในโหมด default (แก้ไม่ได้เลย) ทั้งที่เซิร์ฟเวอร์จะ publish "Menu" ได้โดยไม่มีปัญหา
          // ใช้ค่าคงที่ตัวเดียวกับที่ publish จริงใช้แทน แก้ทั้งสองข้อพร้อมกัน
          chatBarText: draft.chatBar.mode === 'custom' ? draft.chatBar.text : DEFAULT_CHAT_BAR_TEXT,
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
      await onSave(toSave, publish)
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
    <ui.Page title={t('editor.heading')} actions={actions}>
      <ui.Flex direction="column" gap={4}>
        {formError === null ? null : <ui.Alert variant="danger">{formError}</ui.Alert>}

        <MainSettings
          value={{ title: draft.title, startAt: draft.startAt, endAt: draft.endAt }}
          onChange={(next) => setDraft((prev) => ({ ...prev, ...next }))}
          errors={mainErrors}
        />

        <ui.Divider />

        {/* หัวข้อ + ปุ่ม Design guide มุมขวาบน ตำแหน่งเดียวกับ LINE OA Manager เอง
            (docs/files/example-ui/) — สเปกงานนี้ #4 */}
        <ui.Flex justifyContent="space-between" alignItems="center">
          <ui.Typography as="h2" variant="delta">{t('editor.menuContent')}</ui.Typography>
          <ui.Button variant="secondary" testId="open-design-guide" onClick={() => setGuideOpen(true)}>
            {t('editor.designGuide.title')}
          </ui.Button>
        </ui.Flex>

        <ui.Flex gap={4} alignItems="flex-start">
          {/* ผัง §5.7 วาด canvas ไว้ใน "กรอบโทรศัพท์" ช่องเดียว พร้อมสวิตช์ outline อยู่ใต้กรอบ
              ไม่ใช่พรีวิวหนึ่งตัวกับ canvas ที่แก้ไขได้อีกตัวข้างๆ — Preview จึงเป็นตัวควบคุมจริง
              ที่รับ activeIndex/onSelect/showOutlines/errors มาจากหน้านี้ */}
          <ui.Flex direction="column" gap={2}>
            <Preview
              size={size}
              bounds={draft.bounds}
              chatBarText={draft.chatBar.mode === 'custom' ? draft.chatBar.text : ''}
              // ผูกกับ draft.chatBar.selected ตรง ๆ (สเปกงานนี้ #3) — ก่อนหน้านี้จงใจไม่ผูกเพราะ
              // กลัวว่าคนที่เลือก Collapsed จะเสีย canvas ที่กำลังแก้อยู่ไปทั้งอัน เหตุผลนั้นถูกต้อง
              // แต่ทางแก้ที่ถูกไม่ใช่ตัดการเชื่อมนี้ทิ้ง (ซึ่งทำให้ตัวเลือก "Default behavior" ไม่มีผล
              // อะไรเลยบนจอ อ่านเป็นของพัง) — Preview เองจัดการเรื่องนี้แล้วด้วยการให้แตะที่แถบแชท
              // ในพรีวิวสลับกาง/ยุบเองได้เสมอ (ดูคอมเมนต์ที่ `PreviewProps.expanded`) คนที่เลือก
              // Collapsed จึงยังแตะเพื่อกลับไปแก้ผังได้ตลอด ไม่ใช่เสีย canvas ไปเฉย ๆ
              expanded={draft.chatBar.selected}
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
                // เช็คจาก draft.bounds ไม่ใช่ templateKey — เหตุผลเดียวกับ guard ใน save() ด้านบน
                // โหมดปรับผังเองเคลียร์ templateKey ทิ้งทันทีที่ขยับช่องแรก ถ้าปิดช่องรูปตาม
                // templateKey ผู้ใช้จะอัปโหลดรูปให้ผังที่เพิ่งปรับเองไม่ได้เลย ทั้งที่ LINE ปฏิเสธการ
                // เผยแพร่เมนูที่ไม่มีรูปเสมอ — ผังนั้นจะเผยแพร่ไม่ได้ตลอดไปแม้จะแก้ guard ข้างบนแล้วก็ตาม
                disabled={draft.bounds.length === 0}
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

            {/*
              ย้ายมาจากนอกสองคอลัมน์ (สเปกงานนี้ #6) — ของเดิมคอลัมน์ซ้ายแบกทั้งโทรศัพท์ + สวิตช์
              ทั้งสองตัว + ทั้งบล็อกนี้ ยาวเกินคอลัมน์ขวา (Template/Image/Actions) มาก จนเหลือพื้นที่
              ว่างโล่งข้างคอลัมน์ขวา — LINE OA Manager เอง (docs/files/example-ui/) วางคอลัมน์ซ้าย
              ไว้แค่โทรศัพท์กับสวิตช์ outline เท่านั้น ส่วนที่เหลือ (รวมบล็อกนี้) อยู่ขวาทั้งหมด
              "Show template outlines"/"Adjust the layout manually" ยังอยู่ใต้โทรศัพท์เหมือนเดิม
              เพราะทั้งคู่เปลี่ยนสิ่งที่พรีวิวแสดง จึงควรอยู่ติดกับพรีวิว ไม่ใช่ย้ายตามบล็อกนี้ไปด้วย
            */}
            <ChatBarSettings
              value={draft.chatBar}
              onChange={(next) => setDraft((prev) => ({ ...prev, chatBar: next }))}
              {...(chatBarError === null ? {} : { error: chatBarError })}
            />
          </ui.Flex>
        </ui.Flex>

        <ui.Divider />

        <ui.Flex justifyContent="flex-end">{actions}</ui.Flex>

        {/* mount ใหม่ทุกครั้งที่เปิด ไม่ใช่ mount ค้างแล้วสั่งซ่อน — state ภายในของ picker
            (แบบที่เลือกไว้ / กล่องยืนยัน) จะได้เริ่มใหม่ทุกรอบ ดูเหตุผลเต็มที่หัว TemplatePicker.tsx */}
        {picking ? (
          <TemplatePicker
            currentKey={draft.templateKey}
            // expression เดียวกับ prevSize ใน applyTemplate ข้างบนเป๊ะ — ดูคอมเมนต์เต็มที่นั่น
            // (Task 20 item 8, ui-core M1) ทั้งสองจุดต้องตอบตรงกันเสมอว่าขนาดผืนผ้าใบปัจจุบันคืออะไร
            currentSize={draft.bounds.length === 0 ? null : size}
            hasConfiguredActions={draft.areas.some(hasAnyActionConfigured)}
            hasImage={draft.image !== null}
            onApply={applyTemplate}
            onClose={() => setPicking(false)}
          />
        ) : null}

        {/*
          สเปกงานนี้ #4 — เนื้อหาอ่านมาจาก packages/core/src/image/guards.ts จริง (ไม่ใช่แค่พิมพ์
          ตามสเปก §2.2 เฉย ๆ): inspectImage() รับแค่ jpeg/png (ไม่ใช่ "รูปภาพทุกชนิด") และ resize
          หกขนาดมาจาก SIZE_LADDER ตรง ๆ (ตัวเดียวกับที่ TemplatePicker ใช้) ไม่ใช่พิมพ์ตัวเลขซ้ำเอง —
          ถ้า ladder เปลี่ยน ข้อความนี้เปลี่ยนตาม ไม่มีวันไม่ตรงกันเงียบ ๆ เพดาน 1 MB มาจาก
          MAX_OUTPUT_BYTES ของไฟล์เดียวกัน (เขียนเป็นข้อความคงที่ตรงนี้ เพราะไฟล์นั้น import `sharp`
          ซึ่งเป็น native binding รันเฉพาะฝั่งเซิร์ฟเวอร์ — import เข้ามาที่นี่จะพังบันเดิลของแอดมิน)
          "resize ลดขั้นอัตโนมัติแทนการปฏิเสธไฟล์ใหญ่เกิน" มาจากพฤติกรรมจริงของ normalize() ใน
          packages/core/src/image/pipeline.ts (ไล่ทีละขั้นของ ladder แล้วบีบ quality จนกว่าจะไม่เกิน
          เพดาน ไม่ใช่ throw ตั้งแต่ไฟล์ต้นทางใหญ่กว่าขั้นแรก)
        */}
        {guideOpen ? (
          <ui.Modal
            open
            onClose={() => setGuideOpen(false)}
            title={t('editor.designGuide.title')}
            footer={
              <ui.Button testId="design-guide-close" onClick={() => setGuideOpen(false)}>
                {t('common.close')}
              </ui.Button>
            }
          >
            <ui.Flex direction="column" gap={3}>
              <div>
                <ui.Typography as="h3" variant="delta">{t('editor.designGuide.imageHeading')}</ui.Typography>
                <p>{t('editor.designGuide.formats')}</p>
                <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                  <li>
                    {t('template.picker.group.large')}: {SIZE_LADDER.large.map((s) => `${s.width}×${s.height}`).join(' · ')}
                  </li>
                  <li>
                    {t('template.picker.group.compact')}: {SIZE_LADDER.compact.map((s) => `${s.width}×${s.height}`).join(' · ')}
                  </li>
                </ul>
                <p>{t('editor.designGuide.autoResize')}</p>
              </div>

              <p>{t('editor.designGuide.areasNote')}</p>

              {/* ลิงก์ไปหาไฟล์ที่ LINE โฮสต์เอง ไม่ใช่ไฟล์ที่เราแจกต่อ (ดูคอมเมนต์ที่ DESIGN_TEMPLATE_URL
                  ด้านบน) — target="_blank" + rel="noreferrer noopener" ตามที่สเปกงานนี้ #8 ขอไว้ตรง ๆ
                  เป็น <a> ดิบเพราะ port ไม่มี primitive สำหรับลิงก์ภายนอกที่เปิดแท็บใหม่ (ui.Button
                  รับแค่ onClick, nav.Link ไว้สำหรับนำทางภายในแอดมินเท่านั้น) สีขอบตามธีมของ Strapi
                  (ไม่ใช่เขียว LINE — modal นี้เป็น chrome ของเรา ไม่ใช่พื้นผิวที่แทน LINE เอง) */}
              <a
                href={DESIGN_TEMPLATE_URL}
                target="_blank"
                rel="noreferrer noopener"
                data-testid="design-guide-download"
                style={{
                  display: 'inline-block',
                  alignSelf: 'flex-start',
                  padding: '.6rem 1rem',
                  border: `1px solid ${theme.border}`,
                  borderRadius: 4,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                {t('editor.designGuide.download')}
              </a>
            </ui.Flex>
          </ui.Modal>
        ) : null}
      </ui.Flex>
    </ui.Page>
  )
}
