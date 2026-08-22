import { useEffect, useState } from 'react'
import { ENDPOINTS, type RichMenuSummary } from '../api.js'
import { usePort } from '../port.js'
import { LineMark } from '../components/LineMark.js'

export function RichMenuList({ channelId }: { channelId: string | null }) {
  const { ui, http, nav, t } = usePort()
  const [menus, setMenus] = useState<RichMenuSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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
  // จุดที่ "ยังไม่มี rich menu สักอัน" คือจุดที่โลโก้ LINE จริงช่วยได้จริง (สเปกงานนี้ #2, Task 22
  // item 1 — LineMark เปลี่ยนจากรูปทรงวาดเองเป็นโลโก้จริงของ LINE แล้ว ดูคอมเมนต์เต็มที่ LineMark.tsx)
  // — บอกทันทีว่าจอนี้เกี่ยวกับ LINE โดยไม่ต้องพึ่งข้อความอย่างเดียว ไอคอนเป็นของตกแต่งอยู่แล้ว
  // (aria-hidden ในตัว) ข้อความ list.empty ยังเป็นสิ่งที่ screen reader ได้ยินตามปกติ
  if (menus.length === 0) {
    return (
      <ui.Flex direction="column" gap={2} alignItems="center">
        <LineMark size={40} />
        <ui.Typography>{t('list.empty')}</ui.Typography>
      </ui.Flex>
    )
  }

  return (
    <ui.Flex direction="column" gap={2}>
      {menus.map((menu) => (
        <ui.Flex key={menu.id} justifyContent="space-between" alignItems="center">
          <ui.Typography>{menu.title}</ui.Typography>
          <span data-testid={`status-${menu.id}`}>{t(`status.${menu.status}`)}</span>
          <ui.Button variant="secondary" testId={`edit-${menu.id}`} onClick={() => nav.push(`/rich-menus/${menu.id}`)}>
            {t('common.edit')}
          </ui.Button>
        </ui.Flex>
      ))}
    </ui.Flex>
  )
}
