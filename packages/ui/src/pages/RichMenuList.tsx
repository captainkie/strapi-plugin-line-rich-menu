import { useEffect, useState } from 'react'
import { areaLabel } from '@fosivo/line-rich-menu-core/browser'
import { actionSummary } from '../action-form.js'
import { ENDPOINTS, type RichMenuSummary } from '../api.js'
import { formatDisplayPeriod } from '../datetime.js'
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
  // เปลี่ยนทุกครั้งที่ AudienceToggle แถวไหนแถวหนึ่งกด activate/deactivate สำเร็จ — บังคับให้
  // การ์ดกับสวิตช์ *ทุกแถว* remount แล้วยิง `GET /channels/:id/audience` ใหม่ จำเป็นเพราะเปิด
  // เมนู B ให้เป็นเมนูสมาชิกจะปิดเมนู A ที่เคยเป็นอยู่ไปด้วยในตัว (channel.memberRichMenuId
  // ชี้ได้ทีละอัน) — แถวของ A ไม่มีทางรู้ว่าตัวเองถูกปิดไปแล้วถ้าไม่ถูกสั่งให้โหลดสถานะใหม่
  const [audienceRefreshToken, setAudienceRefreshToken] = useState(0)

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
          `audienceRefreshToken` ด้านบน) */}
      <CurrentMenuCard key={`current-menu-${audienceRefreshToken}`} channelId={channelId} />

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

            <div role="cell" style={{ ...cell, flexDirection: 'column', alignItems: 'flex-start' }}>
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
              {/* `key` เปลี่ยนตาม audienceRefreshToken เหมือน CurrentMenuCard ข้างบน — แถวอื่นที่
                  เพิ่งถูกปิดไปโดยอ้อม (activate ของแถวนี้ล้าง memberRichMenuId ของแถวอื่นทิ้ง)
                  ต้อง remount แล้วยิง audience ใหม่ ไม่งั้นสวิตช์ของแถวนั้นค้างโชว์ "เปิดอยู่" ผิด ๆ */}
              <AudienceToggle
                key={`${menu.id}-${audienceRefreshToken}`}
                menu={menu}
                onChanged={() => setAudienceRefreshToken((n) => n + 1)}
              />
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
    </>
  )
}
