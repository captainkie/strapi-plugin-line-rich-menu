import { useEffect, useState } from 'react'
import { useHistory, useLocation, useParams } from 'react-router-dom'
import {
  ENDPOINTS, RichMenuEditor, emptyDraft, fromAction, toAction, usePort,
  type RichMenuDraft,
} from '@fosivo/line-rich-menu-ui'
import type { Action, Bounds } from '@fosivo/line-rich-menu-core/browser'
import { PLUGIN_ID } from '../../server/permissions.js'

const BASE = `/plugins/${PLUGIN_ID}`

/** รูปทรงที่ `GET /menus/:id` ตอบกลับ — `RichMenuRow` บวกช่วงเวลาแสดงผลที่อ่านจากตาราง schedule */
interface MenuDetail {
  id: string
  name: string
  channelId: string
  size: 'large' | 'compact'
  chatBarText: string
  chatBarMode: 'default' | 'custom'
  selected: boolean
  templateKey: string | null
  areas: { bounds: Bounds; action: Action }[]
  imageFileId: number | null
  aliasId: string | null
  startAt: string | null
  endAt: string | null
}

/**
 * `RichMenuEditor` อ่าน `initial` แค่ตอน mount (คอมเมนต์ใน `RichMenuEditorProps` ของ Plan 02
 * เตือนไว้ตรง ๆ) — หน้านี้จึงไม่ render editor เลยจนกว่า fetch จะเสร็จ ไม่ใช่ render ด้วยค่าว่าง
 * แล้วรอ ไม่งั้นฟอร์มจะโชว์ค่าว่างค้างทับ record ที่เพิ่งโหลดมา
 */
export function EditorPage() {
  const { http, t, toast } = usePort()
  const { id } = useParams<{ id?: string }>()
  const history = useHistory()
  const search = new URLSearchParams(useLocation().search)

  const [draft, setDraft] = useState<RichMenuDraft | null>(id === undefined ? emptyDraft() : null)
  const [channelId, setChannelId] = useState(search.get('channel') ?? '')
  const [aliasId, setAliasId] = useState<string | null>(null)
  const [aliases, setAliases] = useState<string[]>([])
  /**
   * รูปที่ record นี้ถืออยู่ก่อนหน้า เก็บไว้ต่างหากเพราะ **สร้าง `draft.image` กลับมาไม่ได้**
   *
   * `UploadedImage` ที่ `ImageField` ต้องการคือ `{ id, url, width, height }` แต่ `GET /menus/:id`
   * คืนมาแค่ `imageFileId` ไม่มี url และไม่มีขนาดของไฟล์ดิบ ฟอร์มจึงขึ้นเป็น "ยังไม่มีรูป" เสมอ
   * ตอนเปิดเมนูเก่ามาแก้ ถ้าปล่อยให้ `imageFileId` ตอน save เป็น `draft.image?.id ?? null`
   * ตามตรง การแก้แค่ชื่อเมนูจะลบรูปของมันทิ้งไปเงียบ ๆ — ซึ่งเป็นการสูญข้อมูล ไม่ใช่แค่ UI ไม่สวย
   *
   * จึงคงค่าเดิมไว้ตราบใดที่ผืนผ้าใบยังเป็นอันเดิม (size ไม่เปลี่ยน) เพราะรูปที่ normalize ไว้แล้ว
   * ผูกกับขนาดนั้น พอผู้ใช้เปลี่ยนไป template ที่ขนาดต่าง `RichMenuEditor` ถือว่ารูปถูกทิ้งไปแล้ว
   * (ดู `TemplatePicker.discardImageBody`) ที่นี่จึงทิ้งตามให้ตรงกัน
   *
   * Task 20 item 8 ตามมา (พบระหว่าง audit ของ item 8, แก้ตามที่ทีมรีวิวขอ) — เดิมเก็บ `templateKey`
   * ไว้ด้วยและเช็คคู่กับ `size` ใน `canvasUnchanged` ด้านล่าง แต่ `templateKey` เป็นฟิลด์เดียวกับที่
   * `moveBounds`/`addArea`/`removeArea` (RichMenuEditor.tsx) เคลียร์เป็น `null` ทันทีที่ผู้ใช้เปิด
   * โหมดปรับผังเอง ทั้งที่ `size` (ขนาดผืนผ้าใบจริง) ไม่เปลี่ยน — เปิดเมนูเก่าที่มีรูปมาแก้ เปิดโหมด
   * ปรับผังเอง ขยับช่องเดียวแล้ว save โดยไม่แตะรูปเลย ก็ทำให้รูปที่อัปโหลดไว้หายไปเงียบ ๆ โดยไม่มี
   * คำเตือนใด ๆ ทั้งที่ขนาดผืนผ้าใบไม่ได้เปลี่ยนจริง — ข้อมูลสูญจริง ไม่ใช่แค่ทิ้งรูปที่ไม่พอดีแล้ว
   * (นี่คือดีเฟกต์ตัวที่ห้าบนสาขานี้ที่มีต้นเหตุเดียวกัน — อ่าน templateKey เป็น "อัตลักษณ์ของผืนผ้าใบ"
   * ทั้งที่คำถามจริงตอบด้วย size อยู่แล้ว) เอา `templateKey` ออกจาก state นี้และจาก canvasUnchanged
   * ทั้งเงื่อนไข ไม่ใช่แค่กรณีนี้เท่านั้น
   */
  const [saved, setSaved] = useState<{ imageFileId: number | null; size: string } | null>(null)

  useEffect(() => {
    http.get<{ aliasId: string | null }[]>(ENDPOINTS.menus)
      .then((rows) => setAliases(rows.map((row) => row.aliasId).filter((alias): alias is string => alias !== null)))
      .catch(() => setAliases([]))
  }, [http])

  useEffect(() => {
    if (id === undefined) return
    http.get<MenuDetail>(ENDPOINTS.menu(id))
      .then((detail) => {
        setChannelId(detail.channelId)
        setAliasId(detail.aliasId)
        setSaved({ imageFileId: detail.imageFileId, size: detail.size })
        setDraft({
          title: detail.name,
          startAt: detail.startAt ?? '',
          endAt: detail.endAt ?? '',
          templateKey: detail.templateKey,
          areas: detail.areas.map((area) => fromAction(area.action)),
          bounds: detail.areas.map((area) => area.bounds),
          sizeName: detail.size,
          chatBar: { mode: detail.chatBarMode, text: detail.chatBarText, selected: detail.selected },
          image: null,
        })
      })
      .catch(() => { toast({ type: 'danger', message: t('editor.loadFailed') }) })
  }, [http, id, t, toast])

  if (draft === null) return null

  const save = async (next: RichMenuDraft, publish: boolean): Promise<void> => {
    // `size` เป็นตัวเดียวที่ตอบคำถาม "รูปเดิมยังพอดีกับผืนผ้าใบไหม" ได้ตรง ๆ — ดูคอมเมนต์เต็มที่
    // state `saved` ด้านบนว่าทำไม templateKey ต้องไม่อยู่ในเงื่อนไขนี้
    const canvasUnchanged = saved !== null && saved.size === next.sizeName

    const body = {
      name: next.title,
      channelId,
      size: next.sizeName,
      chatBarText: next.chatBar.text,
      chatBarMode: next.chatBar.mode,
      selected: next.chatBar.selected,
      templateKey: next.templateKey,
      // `bounds` กับ `areas` ของ draft เรียงตรงกันตาม index เสมอ (สัญญาของ CanvasEditor ใน Plan 02)
      areas: next.bounds.map((bounds, index) => {
        const state = next.areas[index]
        if (state === undefined) throw new Error(`area ${index} is missing its action`)
        return { bounds, action: toAction(state) }
      }),
      imageFileId: next.image?.id ?? (canvasUnchanged ? saved.imageFileId : null),
      areaImages: [],
      aliasId,
      startAt: next.startAt === '' ? null : next.startAt,
      endAt: next.endAt === '' ? null : next.endAt,
    }

    const menu = id === undefined
      ? await http.post<MenuDetail>(ENDPOINTS.menus, body)
      : await http.put<MenuDetail>(ENDPOINTS.menu(id), body)

    if (publish) await http.post(ENDPOINTS.menuPublish(menu.id), { setAsDefault: true })
    history.push(BASE)
  }

  return (
    <RichMenuEditor
      initial={draft}
      aliasOptions={aliases}
      onCancel={() => history.push(BASE)}
      onSave={save}
    />
  )
}
