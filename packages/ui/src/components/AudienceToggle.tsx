import { useEffect, useState } from 'react'
import { ENDPOINTS, type ChannelAudience, type RichMenuSummary } from '../api.js'
import { formatClockTime } from '../datetime.js'
import { usePort } from '../port.js'

export interface AudienceToggleProps {
  menu: RichMenuSummary
  onChanged?: () => void
}

/**
 * สวิตช์เปิด/ปิดว่าเมนูแถวนี้เป็นเมนูของสมาชิกอยู่หรือไม่ (สเปก "List table gains ... an Active
 * toggle per row") — "เปิดอยู่" คำนวณสดจาก `channel.memberRichMenuId` เทียบกับ `menu.lineRichMenuId`
 * เสมอ ไม่เก็บ boolean ไว้เอง (สเปก "Active is derived, never stored") จึงต้องยิง
 * `GET /channels/:id/audience` เองตอน mount
 *
 * เมนูหนึ่ง channel ปกติมีอยู่ไม่กี่แถว (ไม่ใช่หลักหมื่นแบบสมาชิก) — แถวละคำขอจึงยอมรับได้ ต่างจาก
 * `linkMemberChunk`/`CurrentMenuCard` ที่ตั้งใจเลี่ยง N+1 เพราะตัวเลขข้างนั้นคือ "ต่อสมาชิก"
 * ไม่ใช่ "ต่อแถวเมนู" — พร็อพของ component นี้ล็อกไว้แค่ `{ menu, onChanged }` จึงไม่มีทางแชร์ผล
 * ที่ `CurrentMenuCard` โหลดไว้แล้วโดยไม่เพิ่ม prop ใหม่นอกสัญญาที่งานนี้กำหนด
 *
 * `bulk/link` ตอบ 202 เปล่า ๆ — สิ่งที่ปุ่มนี้บอกได้แค่ "ส่งคำสั่งแล้วเมื่อ HH:mm" ไม่ใช่
 * "สมาชิกได้รับแล้ว" (สเปก "What we cannot know, and how the UI says so") ข้อความทุกจุดในไฟล์นี้
 * ต้องระวังคำนี้เป็นพิเศษ ห้ามใช้คำที่สื่อว่ายืนยันการรับได้แล้ว
 */
export function AudienceToggle({ menu, onChanged }: AudienceToggleProps) {
  const { ui, http, t } = usePort()
  const [audience, setAudience] = useState<ChannelAudience | null>(null)
  const [confirming, setConfirming] = useState(false)
  // จำนวนสมาชิกที่ใช้ในกล่องยืนยัน — แยกจาก `audience.memberCount` ตั้งใจ (Task 11 fix round 1):
  // `load()` ด้านล่างไม่ขอ count เลย (เรียกทุกครั้งที่ mount ผ่านทั้งการ์ดและสวิตช์ทุกแถว การนับ
  // ทั้งตารางตรงนั้นจะเปล่าประโยชน์เกือบทุกครั้ง) ตัวเลขจริงมาจาก `askActivate` ที่ยิงขอ count
  // เฉพาะตอนกำลังจะเปิดกล่องยืนยันเท่านั้น — คนละช่วงเวลากับที่ mount ใช้ตัดสิน `active`
  const [confirmCount, setConfirmCount] = useState<number | null>(null)
  const [sentAt, setSentAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    http.get<ChannelAudience>(ENDPOINTS.channelAudience(menu.channelId))
      .then(setAudience)
      .catch(() => setError(t('audience.actionFailed')))
  }

  useEffect(load, [http, menu.channelId, t])

  const active = audience !== null && menu.lineRichMenuId !== null
    && audience.memberRichMenuId === menu.lineRichMenuId
  /**
   * Task 14b item 2 — `menu.audience === 'members'` คือเงื่อนไขที่สาม ไม่ใช่ของแถม
   *
   * Task 13 เพิ่มความล้มเหลวที่รู้ล่วงหน้าอันที่สองเข้ามา: `activateOrSync` เรียก
   * `assertMembersAudience` แล้วตอบ 409 `menu_not_members_audience` ให้กับเมนูที่ `audience`
   * ไม่ใช่ 'members' — แต่ไม่ได้ขยาย gate ตรงนี้ตามไปด้วย สวิตช์จึงเปิดคาไว้ทุกแถวของเมนู 'all'
   * แล้วล้มด้วย toast `audience.actionFailed` ที่ไม่ได้บอกอะไรเลยสักคำเรื่อง audience
   *
   * กฎเดียวกับกรณี draft ด้านล่างเป๊ะ ๆ (เขียนไว้แล้วสี่บรรทัดข้างล่างตั้งแต่ Task 11): ปิดสวิตช์
   * ดีกว่าปล่อยให้กด error ที่เรารู้อยู่แล้วว่าต้องเกิด — แต่สวิตช์ที่ปิดโดยไม่บอกเหตุผลคือทางตัน
   * ของตัวมันเอง จึงมี `audience.notMembersMenu` ขึ้นใต้สวิตช์คู่กันเสมอ (ดูตอน render)
   */
  const isMembersMenu = menu.audience === 'members'
  // publish แล้วเท่านั้นถึงมี lineRichMenuId ให้ activate — เมนู draft ที่กดไปจะโดน 409
  // menu_not_ready จาก publishedMenuOrThrow เปล่า ๆ ปิดสวิตช์ไว้ตั้งแต่ต้นดีกว่าปล่อยให้กดแล้วเจอ
  // error ที่รู้ล่วงหน้าอยู่แล้วว่าต้องเกิด — audience === null (กำลังโหลด/โหลดพัง) ก็ปิดไว้ก่อน
  // เพราะยังไม่รู้สถานะปัจจุบันจริง ๆ
  const canToggle = menu.lineRichMenuId !== null && isMembersMenu && audience !== null && !busy

  const deactivate = async () => {
    setBusy(true)
    setError(null)
    try {
      await http.post(ENDPOINTS.menuAudienceDeactivate(menu.id))
      load()
      onChanged?.()
    } catch {
      setError(t('audience.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * เปิดสวิตช์ (ยังไม่ active) = ขอ count สดก่อนเปิดกล่องยืนยัน ไม่ใช่เปิดกล่องทันทีแล้วค่อยเติม
   * ตัวเลขทีหลัง — กล่องที่โผล่มาโดยยังไม่รู้จำนวนเสี่ยงโชว์เลขเก่า/ค้างจาก mount ก่อนหน้า ดีเลย์
   * สั้น ๆ ก่อนกล่องโผล่ยอมรับได้กว่า (ทีมรีวิวเห็นด้วยตรง ๆ ในรอบแก้ก่อนหน้า)
   */
  const askActivate = async () => {
    setBusy(true)
    setError(null)
    try {
      const fresh = await http.get<ChannelAudience>(ENDPOINTS.channelAudience(menu.channelId, { count: true }))
      setConfirmCount(fresh.memberCount)
      setConfirming(true)
    } catch {
      setError(t('audience.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const confirmActivate = async () => {
    setBusy(true)
    setError(null)
    try {
      await http.post(ENDPOINTS.menuAudienceActivate(menu.id))
      // ยืนยันได้แค่ "ส่งคำสั่งแล้ว" — bulk/link ตอบ 202 เปล่า ๆ ไม่มีทางรู้ว่าสมาชิกได้รับจริงไหม
      setSentAt(new Date())
      setConfirming(false)
      load()
      onChanged?.()
    } catch {
      setError(t('audience.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ui.Flex direction="column" gap={1}>
      <ui.Toggle
        name={`audience-toggle-${menu.id}`}
        label={active ? t('audience.deactivate') : t('audience.activate')}
        checked={active}
        disabled={!canToggle}
        onChange={(next) => {
          // เช็คซ้ำในตัว handler เอง ไม่พึ่ง `disabled` ของ primitive อย่างเดียว — เทสต์ที่ยิง
          // event ตรงเข้า input (fireEvent.change) ข้าม attribute disabled ของเบราว์เซอร์ไปได้
          // ถ้า handler นี้ไม่เช็คเอง ผู้ใช้ก็เช่นกันถ้า primitive วันไหนไม่ได้ป้องกันไว้จริง
          if (!canToggle) return
          if (next) void askActivate()
          else void deactivate()
        }}
      />

      {/* เหตุผลที่สวิตช์ปิดอยู่ ในที่เดียวกับที่ผู้ใช้กำลังมองอยู่ — ไม่ใช่ปล่อยให้เขาเดาเอง
          ผูกกับ `menu.audience` ตัวเดียว ไม่ใช่ `!canToggle` ทั้งก้อน เพราะอีกสามเงื่อนไข
          (ยังไม่ publish / กำลังโหลด / กำลังยิงคำขอ) ไม่ได้แก้ด้วยการไปเปลี่ยน audience
          และข้อความนี้จะกลายเป็นคำแนะนำที่ผิดทันทีถ้าขึ้นตอนนั้นด้วย */}
      {isMembersMenu ? null : (
        <ui.Typography textColor="neutral600">{t('audience.notMembersMenu')}</ui.Typography>
      )}

      {error === null ? null : <ui.Alert variant="danger">{error}</ui.Alert>}

      {sentAt === null ? null : (
        <span data-testid="audience-result">{t('audience.sent', { time: formatClockTime(sentAt) })}</span>
      )}

      {/* `confirmCount === null` กันไว้ด้วย ไม่ใช่แค่ `confirming` — `askActivate` ตั้ง confirming
          เป็น true ก็ต่อเมื่อ fetch สำเร็จและมีตัวเลขแล้วเท่านั้น (ดู askActivate) เงื่อนไขนี้จึง
          ไม่เคยเป็นจริงพร้อมกับ count ว่างในทางปฏิบัติ แต่ยังเช็คไว้กันพัง ไม่ใช่ render 'null' คน */}
      {!confirming || audience === null || confirmCount === null ? null : (
        <ui.Modal
          open
          onClose={() => setConfirming(false)}
          title={t('audience.confirm.title')}
          footer={
            <>
              <ui.Button variant="secondary" onClick={() => setConfirming(false)}>{t('common.cancel')}</ui.Button>
              <ui.Button testId="confirm-activate" onClick={() => void confirmActivate()}>
                {t('audience.activate')}
              </ui.Button>
            </>
          }
        >
          <ui.Flex direction="column" gap={2}>
            <ui.Alert variant="warning">
              {t('audience.confirm.body', { count: confirmCount })}
            </ui.Alert>
            <ui.Typography textColor="neutral600">{t('audience.notConfirmable')}</ui.Typography>
          </ui.Flex>
        </ui.Modal>
      )}
    </ui.Flex>
  )
}
