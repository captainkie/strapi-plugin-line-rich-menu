import { useEffect, useState } from 'react'
import { areaLabel } from '@fosivo/line-rich-menu-core/browser'
import { actionSummary } from '../action-form.js'
import { ENDPOINTS, type RichMenuSummary } from '../api.js'
import { formatClockTime, formatDisplayPeriod } from '../datetime.js'
import { usePort } from '../port.js'
import { AudienceToggle } from '../components/AudienceToggle.js'
import { CurrentMenuCard } from '../components/CurrentMenuCard.js'
import { LineMark } from '../components/LineMark.js'
import { MenuPreviewModal } from '../components/MenuPreviewModal.js'
import { MenuThumbnail } from '../components/MenuThumbnail.js'

/**
 * สัดส่วนคอลัมน์ตามหน้า Rich menus ของ LINE OA Manager — รูป, ชื่อ, action, ช่วงเวลา, สถานะ,
 * กลุ่มเป้าหมาย (Task 11), ปุ่ม
 *
 * `grid-template-columns` ตัวเดียวใช้ทั้งแถวหัวตารางและทุกแถวข้อมูล ค่าที่ประกาศไว้ที่เดียวจึงเป็น
 * เหตุผลว่าทำไมหัวตารางกับข้อมูลตรงคอลัมน์กันเสมอ ไม่ใช่เพราะบังเอิญพิมพ์เลขเท่ากันสองที่
 */
const COLUMNS = '120px minmax(10rem, 1.4fr) minmax(12rem, 2fr) minmax(11rem, 1.2fr) 7rem 11rem auto'

export function RichMenuList({ channelId }: { channelId: string | null }) {
  const { ui, http, nav, t, theme } = usePort()
  const [menus, setMenus] = useState<RichMenuSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  // การ์ดต้อง remount แล้วยิง `GET /channels/:id/audience` ใหม่ทุกครั้งที่ *แถวไหนก็ตาม* กด
  // activate/deactivate สำเร็จ — มันสรุปภาพรวมทั้ง channel (ทุกคน + สมาชิก) ไม่ว่าแถวไหนเปลี่ยน
  const [cardRefreshToken, setCardRefreshToken] = useState(0)

  /**
   * Task 21 item 1 (แก้บั๊ก "sent at HH:mm" ไม่เคยขึ้น) + item 3 (ลดการยิง audience ซ้ำซ้อน) —
   * ก่อนหน้านี้ทุกแถวใช้ token เดียวกันเป็นส่วนหนึ่งของ `key` (`${menu.id}-${audienceRefreshToken}`)
   * ทุกแถวจึง remount พร้อมกันทุกครั้งที่ *แถวไหนก็ตาม* เปลี่ยน — รวมถึงแถวที่เพิ่งกดเอง แถวนั้นเอง
   * ก็เลย remount ในคอมมิตเดียวกับที่มันเพิ่งตั้ง `sentAt` ของตัวเอง (ผ่าน `confirmActivate`/
   * `deactivate` ใน AudienceToggle) — unmount ทิ้ง state เดิมทันทีก่อนจอจะได้ทันวาดออกมาเลยด้วยซ้ำ
   *
   * ทางแก้: แยก "generation" เป็นรายเมนู แล้วกด activate/deactivate ของแถวไหน ไม่บวก generation
   * ของแถวนั้นเอง — บวกให้ทุกแถว *อื่น* เท่านั้น แถวที่เพิ่งกดเองไม่ remount เลย (มันรู้สถานะสดของ
   * ตัวเองอยู่แล้วผ่าน `load()` ภายในตัวมันเอง — ดู AudienceToggle) `sentAt` ที่เพิ่งตั้งจึงไม่ถูก
   * ทำลาย ส่วนแถวอื่นยัง remount ตามเดิมทุกประการ (correctness เดิมที่ remount มีไว้เพื่อรักษา:
   * แถวที่ถูกปิดไปโดยอ้อมต้องเลิกโชว์ "เปิดอยู่") ผลพลอยได้: แถวที่กดเองไม่ยิง `GET audience` ซ้ำ
   * สองรอบอีกต่อไป (เดิมยิงทั้งจาก `load()` ที่เรียกตรง ๆ ในตัวมันเอง และซ้ำอีกทีจากการ remount)
   */
  const [audienceGeneration, setAudienceGeneration] = useState<Record<string, number>>({})

  const handleAudienceChanged = (changedMenuId: string) => {
    setCardRefreshToken((n) => n + 1)
    setAudienceGeneration((prev) => {
      const next = { ...prev }
      for (const m of menus ?? []) {
        if (m.id !== changedMenuId) next[m.id] = (next[m.id] ?? 0) + 1
      }
      return next
    })
  }

  /**
   * Task 12 — การบำรุงรักษาที่ตั้งใจให้หายาก: ปลดทุกคนที่ LINE รู้ว่ายังถือเมนูนี้อยู่ ผ่าน
   * POST /v2/bot/richmenu/batch (โควตา 3 ครั้ง/ชม./account) เก็บ state ไว้ที่หน้านี้แทนที่จะแยก
   * เป็น component ใหม่แบบ AudienceToggle เพราะปุ่มนี้มีแค่แถวเดียวที่ "กำลังยืนยัน" ได้พร้อมกัน
   * ทั้งตาราง (ไม่เหมือน AudienceToggle ที่แต่ละแถวเป็นอิสระต่อกัน) กล่องยืนยันเดียวจึงพอ
   */
  const [unlinkAllTarget, setUnlinkAllTarget] = useState<string | null>(null)
  const [unlinkAllBusy, setUnlinkAllBusy] = useState(false)
  const [unlinkAllError, setUnlinkAllError] = useState<string | null>(null)
  const [unlinkAllSentAt, setUnlinkAllSentAt] = useState<{ menuId: string; at: Date } | null>(null)

  const askUnlinkAll = (menuId: string) => {
    setUnlinkAllError(null)
    setUnlinkAllTarget(menuId)
  }

  const confirmUnlinkAll = async () => {
    if (unlinkAllTarget === null) return
    const menuId = unlinkAllTarget
    setUnlinkAllBusy(true)
    setUnlinkAllError(null)
    try {
      await http.post(ENDPOINTS.menuAudienceUnlinkAll(menuId))
      // ยืนยันได้แค่ "ส่งคำสั่งแล้ว" เหมือนกับ AudienceToggle — batch ของ LINE เป็น async เช่นกัน
      // (ดูคอมเมนต์ที่ audience.notConfirmable และ unlinkAllFromMenu ใน core)
      setUnlinkAllSentAt({ menuId, at: new Date() })
      setUnlinkAllTarget(null)
    } catch {
      setUnlinkAllError(t('audience.actionFailed'))
    } finally {
      setUnlinkAllBusy(false)
    }
  }

  useEffect(() => {
    if (channelId === null) return
    let cancelled = false
    setMenus(null)
    setError(null)
    http.get<RichMenuSummary[]>(`${ENDPOINTS.menus}?channel=${channelId}`)
      .then((rows) => { if (!cancelled) setMenus(rows) })
      .catch(() => { if (!cancelled) setError(t('list.loadFailed')) })
    // ยกเลิกการ setState ถ้า effect นี้ถูกแทนที่ก่อน request เดิมตอบกลับ (เปลี่ยน channel เร็ว ๆ)
    // ไม่งั้นรายการของ channel เก่าจะโผล่ทับรายการของ channel ที่กำลังดูอยู่จริง
    return () => { cancelled = true }
  }, [channelId, http, t])

  if (channelId === null) return <ui.Typography>{t('list.pickChannel')}</ui.Typography>
  if (error !== null) return <ui.Alert variant="danger">{error}</ui.Alert>
  if (menus === null) return <ui.Loader>{t('common.loading')}</ui.Loader>
  // จุดที่ "ยังไม่มี rich menu สักอัน" คือจุดที่โลโก้ LINE จริงช่วยได้จริง (Task 22 item 1 —
  // LineMark เป็นโลโก้จริงของ LINE แล้ว ดูคอมเมนต์เต็มที่ LineMark.tsx) — บอกทันทีว่าจอนี้
  // เกี่ยวกับ LINE โดยไม่ต้องพึ่งข้อความอย่างเดียว ไอคอนเป็นของตกแต่งอยู่แล้ว (aria-hidden ในตัว)
  // ข้อความ list.empty ยังเป็นสิ่งที่ screen reader ได้ยินตามปกติ
  if (menus.length === 0) {
    return (
      <ui.Flex direction="column" gap={2} alignItems="center">
        <LineMark size={40} />
        <ui.Typography>{t('list.empty')}</ui.Typography>
      </ui.Flex>
    )
  }

  const cell = { display: 'flex', alignItems: 'center', minWidth: 0, overflowWrap: 'anywhere' as const }

  return (
    <>
      {/* `key` เปลี่ยนค่า = remount ทั้งก้อน — ทาง React ที่บังคับให้ effect ภายในยิงใหม่โดยไม่ต้อง
          เพิ่ม prop ใหม่เข้า `CurrentMenuCard` ซึ่งสัญญาไว้แค่ `{ channelId }` (ดูคอมเมนต์ที่
          `cardRefreshToken` ด้านบน) */}
      <CurrentMenuCard key={`current-menu-${cardRefreshToken}`} channelId={channelId} />

      {/* `role="table"` ไม่ใช่ `<table>` จริง: port ไม่มี primitive ของตาราง และการวาด `<table>`
          ดิบที่นี่จะได้ตารางที่ไม่มีสไตล์ของ design system เวอร์ชันไหนเลย ส่วน role ทำให้ screen
          reader ยังอ่านมันเป็นตารางพร้อมหัวคอลัมน์ ซึ่งเป็นสิ่งที่ผู้ใช้ต้องการจริง ๆ จาก `<table>` */}
      <div role="table" aria-label={t('plugin.name')} data-testid="menu-table">
        <div
          role="row"
          style={{
            display: 'grid', gridTemplateColumns: COLUMNS, gap: '1rem',
            padding: '.5rem .75rem', borderBottom: `1px solid ${theme.border}`,
            color: theme.mutedText, fontSize: '.8rem', fontWeight: 600,
          }}
        >
          <div role="columnheader">{t('list.column.image')}</div>
          <div role="columnheader">{t('list.column.title')}</div>
          <div role="columnheader">{t('list.column.action')}</div>
          <div role="columnheader">{t('editor.displayPeriod')}</div>
          <div role="columnheader">{t('list.column.status')}</div>
          <div role="columnheader">{t('list.column.audience')}</div>
          {/* คอลัมน์ปุ่มไม่มีหัวข้อที่จะพูดถึง — ช่องว่างที่ประกาศไว้ตรง ๆ ดีกว่าปล่อยให้หัวตาราง
              มีคอลัมน์น้อยกว่าแถวข้อมูลหนึ่งคอลัมน์ ซึ่ง screen reader จะอ่านว่าตารางพัง */}
          <div role="columnheader" aria-label={t('list.column.actions')} />
        </div>

        {menus.map((menu) => (
          <div
            key={menu.id}
            role="row"
            data-testid={`menu-row-${menu.id}`}
            style={{
              display: 'grid', gridTemplateColumns: COLUMNS, gap: '1rem', alignItems: 'center',
              padding: '.75rem', borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <div role="cell" style={cell}>
              <MenuThumbnail
                size={menu.size}
                bounds={menu.areas.map((area) => area.bounds)}
                imageUrl={menu.imageUrl}
                alt={menu.title}
              />
            </div>

            <div role="cell" style={cell}>
              {/* ชื่อเป็นปุ่มเปิดพรีวิว ไม่ใช่ข้อความเฉย ๆ — LINE เองก็ทำแบบนี้ และมันคือทางที่สั้น
                  ที่สุดจาก "เห็นชื่อในรายการ" ไปถึง "ดูว่าอันนี้หน้าตายังไง" */}
              <button
                type="button"
                data-testid={`preview-${menu.id}`}
                onClick={() => setPreviewing(menu.id)}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  textAlign: 'left', textDecoration: 'underline',
                  // `<button>` ไม่รับสีตัวอักษรจาก parent — ไม่ตั้งเอง = ดำบนพื้นเข้มในธีมมืด
                  // (บทเรียนเดียวกับหัว accordion ใน AreaList.tsx)
                  color: theme.strongText, font: 'inherit',
                }}
              >
                {menu.title}
              </button>
            </div>

            {/* `minWidth` ที่นี่ ไม่ใช่ `whiteSpace: nowrap` — คำอธิบายใต้สวิตช์ต้องขึ้นบรรทัดใหม่ได้
                (ภาษาไทยกับอังกฤษยาวไม่เท่ากัน และผู้ใช้ย่อหน้าต่างได้) สิ่งที่ต้องกันคือคอลัมน์ที่แคบ
                จนประโยคสั้น ๆ ตัดเป็นสิบบรรทัดแล้วดันความสูงของทั้งแถวขึ้นไปหลายร้อยพิกเซล ซึ่งเป็น
                อาการที่เห็นจริงบนเดโม — ปุ่ม "Unlink everyone" ก็ถูกตัดกลางคำด้วยเหตุผลเดียวกัน */}
            <div role="cell" style={{ ...cell, flexDirection: 'column', alignItems: 'flex-start', minWidth: 190 }}>
              {menu.areas.length === 0
                ? <span style={{ color: theme.mutedText }}>—</span>
                : menu.areas.map((area, index) => (
                  <span key={index} style={{ color: theme.strongText, fontSize: '.85rem' }}>
                    {`${areaLabel(index)} : ${t(`action.type.${area.action.type}`)} - ${actionSummary(area.action)}`}
                  </span>
                ))}
            </div>

            <div role="cell" style={{ ...cell, color: theme.strongText, fontSize: '.85rem' }}>
              {formatDisplayPeriod(menu.startAt, menu.endAt)
                ?? <span style={{ color: theme.mutedText }}>{t('list.period.none')}</span>}
            </div>

            <div role="cell" style={cell}>
              <span data-testid={`status-${menu.id}`} style={{ color: theme.strongText }}>
                {t(`status.${menu.status}`)}
              </span>
            </div>

            <div role="cell" style={{ ...cell, flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ color: theme.strongText, fontSize: '.85rem' }}>{t(`audience.${menu.audience}`)}</span>
              {/* `key` เปลี่ยนตาม `audienceGeneration[menu.id]` (ดูคอมเมนต์เต็มที่ประกาศ state
                  ด้านบน) — แถวอื่นที่เพิ่งถูกปิดไปโดยอ้อม (activate ของแถวนี้ล้าง memberRichMenuId
                  ของแถวอื่นทิ้ง) ต้อง remount แล้วยิง audience ใหม่ ไม่งั้นสวิตช์ของแถวนั้นค้างโชว์
                  "เปิดอยู่" ผิด ๆ — ส่วนแถวนี้เองไม่ remount ตัวเองจากการกดของตัวเอง (Task 21 item 1) */}
              <AudienceToggle
                key={`${menu.id}-${audienceGeneration[menu.id] ?? 0}`}
                menu={menu}
                onChanged={() => handleAudienceChanged(menu.id)}
              />
              {/* Task 12 — เมนูที่ไม่เคย publish ไม่มี lineRichMenuId ให้ batch อ้างถึง เหตุผล
                  เดียวกับที่ AudienceToggle ปิดสวิตช์ไว้ตอนเมนูยัง draft

                  Task 21 item 5 — เงื่อนไข disabled ตรงนี้ตัวเดียวกับที่ทำให้ AudienceToggle ข้างบน
                  ปิดพร้อมโชว์ `audience.notPublishedMenu` อยู่แล้ว (ทั้งคู่มาจาก
                  `menu.lineRichMenuId === null`) ตั้งใจไม่พิมพ์ข้อความเดียวกันซ้ำอีกรอบไว้ใต้ปุ่มนี้
                  เพราะมันจะซ้อนกันเป็นประโยคเดิมสองบรรทัดติดกันในคอลัมน์แคบเดียวกัน — คำอธิบาย
                  บรรทัดเดียวที่อยู่เหนือปุ่มนี้ขึ้นบรรทัดเดียวก็ครอบทั้งสองปุ่มได้อยู่แล้วเพราะเหตุผล
                  เดียวกันเป๊ะ ๆ ซ้ำคำจะดูเหมือนบั๊ก UI มากกว่าช่วยอะไร (ตัดสินใจตามที่ brief เปิดทางไว้:
                  "or the control needs a different treatment") */}
              {/* ห่อด้วย nowrap เพราะคอลัมน์นี้แคบพอที่ "Unlink everyone" จะถูกตัดกลางเป็นสองบรรทัด
                  ปุ่มที่ข้อความขึ้นบรรทัดใหม่อ่านเหมือนปุ่มสองปุ่มซ้อนกัน */}
              <div style={{ whiteSpace: 'nowrap' }}>
              <ui.Button
                variant="danger"
                testId={`unlink-all-${menu.id}`}
                disabled={menu.lineRichMenuId === null || unlinkAllBusy}
                onClick={() => askUnlinkAll(menu.id)}
              >
                {t('audience.unlinkAll')}
              </ui.Button>
              </div>
              {unlinkAllSentAt?.menuId !== menu.id ? null : (
                <span data-testid={`unlink-all-result-${menu.id}`}>
                  {t('audience.sent', { time: formatClockTime(unlinkAllSentAt.at) })}
                </span>
              )}
            </div>

            <div role="cell" style={{ ...cell, justifyContent: 'flex-end' }}>
              <ui.Button
                variant="secondary"
                testId={`edit-${menu.id}`}
                onClick={() => nav.push(`/rich-menus/${menu.id}`)}
              >
                {t('common.edit')}
              </ui.Button>
            </div>
          </div>
        ))}
      </div>

      {previewing === null ? null : (
        <MenuPreviewModal menuId={previewing} onClose={() => setPreviewing(null)} />
      )}

      {/*
        Task 12 — โควตาของ batch คือ 3 ครั้ง/ชม./account และ LINE ไม่บอกเหตุผลตอนคำขอที่สี่ล้ม
        (ดู unlinkAllFromMenu ใน core) ข้อความยืนยันจึงต้องบอกเลขนี้ตรง ๆ เป็นคำพูด ก่อนผู้ดูแล
        จะกดยืนยัน ไม่ใช่ให้ไปเจอ error ที่อ่านไม่ออกทีหลัง
      */}
      {unlinkAllTarget === null ? null : (
        <ui.Modal
          open
          onClose={() => setUnlinkAllTarget(null)}
          title={t('audience.unlinkAll.confirm.title')}
          footer={
            <>
              <ui.Button variant="secondary" onClick={() => setUnlinkAllTarget(null)}>{t('common.cancel')}</ui.Button>
              <ui.Button
                variant="danger"
                testId="confirm-unlink-all"
                disabled={unlinkAllBusy}
                onClick={() => void confirmUnlinkAll()}
              >
                {t('audience.unlinkAll')}
              </ui.Button>
            </>
          }
        >
          <ui.Flex direction="column" gap={2}>
            <ui.Alert variant="warning">{t('audience.unlinkAll.confirm.body')}</ui.Alert>
            {/* คำเดียวกับ AudienceToggle แต่แยกคีย์ต่างหาก — audience.notConfirmable พูดถึง
                "สมาชิกได้รับเมนู" (ฝั่ง activate) ส่วนที่นี่คือ "ทุกคนถูกเลิกผูกจริงไหม" คนละเรื่อง
                ใช้ข้อความเดียวกันจะพูดผิดสิ่งที่ปุ่มนี้ทำ */}
            <ui.Typography textColor="neutral600">{t('audience.unlinkAll.notConfirmable')}</ui.Typography>
            {unlinkAllError === null ? null : <ui.Alert variant="danger">{unlinkAllError}</ui.Alert>}
          </ui.Flex>
        </ui.Modal>
      )}
    </>
  )
}
