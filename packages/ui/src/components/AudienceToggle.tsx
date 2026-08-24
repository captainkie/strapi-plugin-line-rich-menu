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
  const { ui, http, t, theme } = usePort()
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
      // Task 21 item 3 — นี่คือการ*อ่าน*สถานะ ไม่ใช่การ*กระทำ* ที่ล้ม (ไม่มีการกดอะไรเลยตอน mount)
      // ก่อนหน้านี้ catch นี้ใช้ audience.actionFailed ("ทำรายการไม่สำเร็จ") ตัวเดียวกับที่ activate/
      // deactivate ใช้เมื่อคำสั่งที่ผู้ใช้กดจริง ๆ ล้ม — คนละความหมายกันคนละเวลากัน endpoint นี้ยิงถึง
      // LINE จริง (token หมดอายุ/LINE ล่ม/429 ทำให้มันล้มได้) ผู้ใช้ที่เพิ่งเปิดหน้าไม่ควรเห็นข้อความที่
      // สื่อว่าตัวเองเพิ่งกดอะไรพังไป ทั้งที่ยังไม่ได้แตะอะไรเลย
      .catch(() => setError(t('audience.loadFailed')))
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
  /**
   * Task 21 item 5 — เหตุผลที่สวิตช์ปิดอยู่ ไม่ได้มีสาเหตุเดียวเสมอไป: "ยังไม่ publish เลย" (ไม่มี
   * `lineRichMenuId` ให้ activate ตั้งแต่ต้น) กับ "audience ตั้งเป็น all ไม่ใช่ members" เป็นคนละ
   * สาเหตุกันคนละคำแนะนำ — `audience.notMembersMenu` ถูกกำหนดไว้แล้วให้พูดถึงสาเหตุที่สองเท่านั้น
   * (ห้ามขยายให้ครอบคลุมสาเหตุแรกไปด้วย) ก่อนหน้านี้เมนู draft ไม่มีข้อความอะไรเลย เพราะเงื่อนไข
   * `isMembersMenu || active` เป็นจริงสำหรับเมนู draft ที่ audience เป็น members อยู่แล้ว (ดู
   * draftMenu fixture ในเทสต์ — สืบทอด audience: 'members' มา) จึงไม่เข้าเงื่อนไขที่โชว์ข้อความเลย
   *
   * ลำดับความสำคัญ: "ยังไม่ publish" ต้องมาก่อน เพราะเป็นเหตุผลที่ทำให้ audience ไม่มีความหมายอะไร
   * เลย — ไม่ว่า audience จะตั้งเป็นอะไรก็ปิดสวิตช์เหมือนกันจนกว่าจะ publish
   */
  const disabledReasonKey: string | null = active
    ? null
    : menu.lineRichMenuId === null
      ? 'audience.notPublishedMenu'
      : isMembersMenu
        ? null
        : 'audience.notMembersMenu'
  // publish แล้วเท่านั้นถึงมี lineRichMenuId ให้ activate — เมนู draft ที่กดไปจะโดน 409
  // menu_not_ready จาก publishedMenuOrThrow เปล่า ๆ ปิดสวิตช์ไว้ตั้งแต่ต้นดีกว่าปล่อยให้กดแล้วเจอ
  // error ที่รู้ล่วงหน้าอยู่แล้วว่าต้องเกิด — audience === null (กำลังโหลด/โหลดพัง) ก็ปิดไว้ก่อน
  // เพราะยังไม่รู้สถานะปัจจุบันจริง ๆ
  //
  // Task 14b item 1 — `isMembersMenu` เป็นเงื่อนไขสำหรับทิศทาง "เปิด" เท่านั้น ใช้เป็นเงื่อนไข
  // "ปิด" ด้วยไม่ได้: แถวที่ pointer ตรงกับ `menu.lineRichMenuId` (active) แต่ `audience` ยังเป็น
  // 'all' คือสถานะ "ประกาศว่าทุกคน แต่ยัง live อยู่กับสมาชิกจริง" ซึ่งเป็นสถานะที่งานนี้ทั้งงานมีไว้
  // เพื่อทำให้ไปไม่ถึง — ปิดสวิตช์ตายไว้ทั้งสองทิศทางพาแถวนั้นเข้าทางตัน เพราะ `deactivate` (ด้านบน
  // ในไฟล์นี้) ไม่มี assertion เรื่อง audience เลย ปิดได้เสมอไม่ว่า audience จะเป็นอะไร ทางออกเดียว
  // ที่มีจริงสำหรับแถวนั้นคือปิด จึงต้องเปิดทางนั้นไว้ด้วย `|| active`
  const canToggle = menu.lineRichMenuId !== null && (isMembersMenu || active) && audience !== null && !busy

  const deactivate = async () => {
    setBusy(true)
    setError(null)
    try {
      await http.post(ENDPOINTS.menuAudienceDeactivate(menu.id))
      // Task 21 item 2 — ปิดใช้งานก็ async/unconfirmable เหมือนกับเปิดใช้งานทุกประการ (LINE ตอบ
      // 202 เปล่า ๆ เหมือนกัน) แต่เส้นนี้ไม่เคยตั้ง sentAt มาก่อนเลยสักครั้ง ทั้งที่ docs/usage.md
      // สัญญาไว้ว่า "the toggle above, and Unlink everyone below" พูดว่า "sent" ทั้งคู่ — ก่อนหน้านี้
      // มีแค่ครึ่งหลังที่รอดเพราะ sentAt ของมันอยู่ที่ RichMenuList ซึ่งไม่ถูก remount ทำลาย
      setSentAt(new Date())
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
          `disabledReasonKey` (ดูคำนวณด้านบน) ครอบสองสาเหตุถาวรแล้ว (ยังไม่ publish / audience
          ไม่ใช่ members) เหลือแค่สองเงื่อนไขชั่วคราวที่ยังไม่มีข้อความ (กำลังโหลด / กำลังยิงคำขอ)
          ซึ่งตั้งใจไม่ให้มี เพราะเป็นสถานะที่หายไปเองเร็ว ๆ ไม่ใช่ทางตันที่ต้องอธิบายวิธีแก้ — เช่นเดียวกับ
          ตอน `active` เป็น true (Task 14b item 1): สวิตช์กดได้อยู่แล้วเพื่อ "ปิด" ข้อความที่บอกว่าเปิดให้
          สมาชิกไม่ได้จึงเป็นคำแนะนำผิดทิศทาง — ผู้ใช้ต้องการปิด ไม่ใช่เปิด */}
      {disabledReasonKey === null ? null : (
        <span style={{ color: theme.mutedText, fontSize: '.78rem', lineHeight: 1.35 }}>
          {t(disabledReasonKey)}
        </span>
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
          // Task 21 item 4 — เดิมทั้งปุ่มยืนยันและยกเลิกไม่มี `disabled={busy}` เลย: กดยืนยันสามครั้ง
          // ยิง POST activate สามครั้งจริง (ยืนยันแล้ว) และกด Cancel ระหว่างคำขอค้างอยู่ปิดกล่องไป
          // เฉย ๆ ทั้งที่ activation ยังลงจริงอยู่ดี ผู้ใช้จึงเข้าใจผิดว่าตัวเองยกเลิกสำเร็จ — ปิดทาง
          // ปิดกล่องระหว่าง busy ทุกช่องทาง ไม่ใช่แค่ปุ่ม Cancel: onClose นี้คือช่องทางเดียวกันที่
          // `ui.Modal` เปิดให้ปิดด้วย (เช่น Esc/คลิกฉากหลัง ถ้า adapter จริงผูกไว้) สวิตช์เดียวกัน
          // ต้องกันไว้ทั้งคู่ ไม่งั้น guard ที่ปุ่ม Cancel มีความหมายแค่ทางเดียว
          onClose={() => { if (!busy) setConfirming(false) }}
          title={t('audience.confirm.title')}
          footer={
            <>
              <ui.Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </ui.Button>
              {/* สเปกเดียวกับ `disabled={unlinkAllBusy}` ที่ `RichMenuList.tsx` ใช้กับปุ่มยืนยันของ
                  "เลิกผูกทุกคน" อยู่แล้ว (Task 12) — คู่ยืนยัน/ยกเลิกของงานนี้ไม่เคยตามมาให้ครบ */}
              <ui.Button testId="confirm-activate" disabled={busy} onClick={() => void confirmActivate()}>
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
