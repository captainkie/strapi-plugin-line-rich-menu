import { useEffect, useState, type ReactNode } from 'react'
import {
  SIZE_LADDER, areaLabel,
  type Action, type Bounds, type RichMenuSizeName,
} from '@fosivo/line-rich-menu-core/browser'
import { actionSummary } from '../action-form.js'
import { ENDPOINTS } from '../api.js'
import { formatDisplayPeriod } from '../datetime.js'
import { usePort } from '../port.js'
import { Preview } from './Preview.js'

/**
 * รูปทรงที่ `GET /menus/:id` คืนมา — เอาเฉพาะที่หน้านี้ใช้จริง ไม่ประกาศทั้งแถว
 *
 * `imageUrl` เป็นของใหม่ที่เพิ่มมากับงานนี้ ก่อนหน้านี้ปลายทางคืนแค่ `imageFileId` ซึ่งเป็น
 * ตัวเลขที่หน้าจอเอาไปวาดอะไรไม่ได้เลย — พรีวิวที่ไม่มีรูปที่ผู้ใช้อัปโหลดไว้ก็ไม่ใช่พรีวิว
 */
interface MenuDetail {
  name: string
  size: RichMenuSizeName
  chatBarText: string
  chatBarMode: 'default' | 'custom'
  selected: boolean
  areas: { bounds: Bounds; action: Action }[]
  imageUrl: string | null
  status: 'draft' | 'publishing' | 'published' | 'failed'
  startAt: string | null
  endAt: string | null
}

/**
 * หนึ่งบรรทัดของคอลัมน์ขวา — ป้ายชิดขวาความกว้างคงที่ แล้วค่าตามหลัง เหมือน LINE
 *
 * อยู่ระดับโมดูล ไม่ใช่ประกาศซ้อนในตัว `MenuPreviewModal` — component ที่ประกาศในตัว render
 * เป็นฟังก์ชันตัวใหม่ทุกรอบที่ render ซึ่งทำให้ React ถอด DOM เดิมทิ้งแล้วสร้างใหม่ทั้งก้อน
 * แทนที่จะอัปเดตของเดิม
 */
function DetailRow({ label, children }: { label: string; children?: ReactNode }) {
  const { ui, theme } = usePort()
  return (
    <ui.Flex gap={3} alignItems="baseline">
      <div style={{ width: 140, flex: '0 0 140px', textAlign: 'right', color: theme.mutedText }}>{label}</div>
      <div style={{ color: theme.strongText }}>{children}</div>
    </ui.Flex>
  )
}

export interface MenuPreviewModalProps {
  menuId: string
  onClose(): void
}

/**
 * พรีวิวเมนูที่สร้างไว้แล้ว แบบอ่านอย่างเดียว — โทรศัพท์ทางซ้าย รายละเอียดทางขวา
 * ตามหน้า "Rich menu" ของ LINE OA Manager
 *
 * เป็น modal ไม่ใช่หน้าใหม่ เพราะจุดที่คนอยากดูคือ "ระหว่างไล่ดูรายการ" — การพาออกจากหน้า
 * รายการไปแล้วต้องกดกลับ ทำให้การเทียบเมนูสองอันติดกันกลายเป็นสี่คลิกแทนที่จะเป็นสอง
 *
 * ยิง `GET /menus/:id` เองตอนเปิด แทนที่จะรับข้อมูลทั้งก้อนมาจากหน้ารายการ: แถวในรายการ
 * ไม่มี `chatBarText`/`chatBarMode`/`selected` ซึ่งเป็นสามในหกบรรทัดของคอลัมน์ขวา และการ
 * ยัดมันเข้าไปในรายการแปลว่าทุกแถวต้องแบกข้อมูลที่มีแค่แถวเดียวเท่านั้นที่ได้ใช้
 */
export function MenuPreviewModal({ menuId, onClose }: MenuPreviewModalProps) {
  const { ui, http, t } = usePort()
  const [detail, setDetail] = useState<MenuDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // เริ่มที่ "เปิด" เหมือน LINE — ผังช่องคือสิ่งที่คนเปิดพรีวิวมาดู ไม่ใช่รูปเปล่า ๆ
  const [showOutlines, setShowOutlines] = useState(true)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError(null)
    http.get<MenuDetail>(ENDPOINTS.menu(menuId))
      .then((row) => { if (!cancelled) setDetail(row) })
      .catch(() => { if (!cancelled) setError(t('preview.loadFailed')) })
    return () => { cancelled = true }
  }, [http, menuId, t])

  const title = detail === null ? '' : detail.name
  /**
   * `SIZE_LADDER[detail.size]` เป็น `undefined` ได้จริงถ้าปลายทางคืนขนาดที่แคตตาล็อกนี้ไม่รู้จัก
   * (ข้อมูลเก่า, ปลั๊กอินคนละเวอร์ชันกับ record ที่เขียนไว้, หรือ response ที่ผิดรูป) — ปล่อยให้
   * `[0]` วิ่งใส่ `undefined` แล้ว modal จะโยนทั้งตัวและ React จะถอดทั้งหน้าแอดมินทิ้ง ไม่ใช่แค่
   * พรีวิวพัง พบตอนที่ mock ในเทสต์คืนรูปทรงผิดโดยบังเอิญ ซึ่งเป็นการซ้อมของจริงพอดี
   */
  const canvas = SIZE_LADDER[detail?.size as RichMenuSizeName]?.[0]

  return (
    <ui.Modal open onClose={onClose} title={t('preview.modal.title', { title })}>
      {error !== null ? <ui.Alert variant="danger">{error}</ui.Alert> : null}
      {detail === null && error === null ? <ui.Loader>{t('common.loading')}</ui.Loader> : null}
      {detail !== null && canvas === undefined
        ? <ui.Alert variant="danger">{t('preview.loadFailed')}</ui.Alert> : null}
      {detail === null || canvas === undefined ? null : (
        <ui.Flex gap={6} alignItems="flex-start" wrap="wrap">
          <ui.Flex direction="column" gap={2}>
            <Preview
              size={canvas}
              bounds={detail.areas.map((area) => area.bounds)}
              chatBarText={detail.chatBarMode === 'default' ? t('chatBar.defaultLabel') : detail.chatBarText}
              expanded={detail.selected}
              showOutlines={showOutlines}
              {...(detail.imageUrl === null ? {} : { imageUrl: detail.imageUrl })}
            />
            <ui.Toggle
              name="preview-outlines"
              label={t('editor.showOutlines')}
              checked={showOutlines}
              onChange={setShowOutlines}
            />
          </ui.Flex>

          <ui.Flex direction="column" gap={3} grow={1}>
            <DetailRow label={t('list.column.status')}>
              <span data-testid="preview-status">{t(`status.${detail.status}`)}</span>
            </DetailRow>
            <DetailRow label={t('list.column.title')}>{detail.name}</DetailRow>
            <DetailRow label={t('editor.displayPeriod')}>
              {formatDisplayPeriod(detail.startAt, detail.endAt) ?? t('list.period.none')}
            </DetailRow>
            <DetailRow label={t('list.column.action')}>
              <ui.Flex direction="column" gap={1}>
                {detail.areas.map((area, index) => (
                  <span key={index} data-testid={`preview-action-${index}`}>
                    {`${areaLabel(index)} : ${t(`action.type.${area.action.type}`)} - ${actionSummary(area.action)}`}
                  </span>
                ))}
              </ui.Flex>
            </DetailRow>
            <DetailRow label={t('chatBar.mode')}>
              {detail.chatBarMode === 'default' ? t('chatBar.defaultLabel') : detail.chatBarText}
            </DetailRow>
            <DetailRow label={t('chatBar.behavior')}>
              {detail.selected ? t('chatBar.behavior.shown') : t('chatBar.behavior.collapsed')}
            </DetailRow>
          </ui.Flex>
        </ui.Flex>
      )}
    </ui.Modal>
  )

}
