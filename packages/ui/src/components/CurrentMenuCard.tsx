import { useEffect, useState } from 'react'
import { ENDPOINTS, type ChannelAudience, type RichMenuSummary } from '../api.js'
import { usePort } from '../port.js'

export interface CurrentMenuCardProps {
  channelId: string
}

/**
 * การ์ดบนสุดของหน้ารายการ — บอกว่าตอนนี้ "ทุกคน" กับ "สมาชิก" กำลังเห็นเมนูไหนอยู่จริง ๆ
 * (สเปก "List page gains the current menu card that was deliberately skipped in 1.0.0")
 *
 * อ่านจาก `GET /channels/:id/audience` เสมอ ไม่เดาจาก DB — "Active is derived, never stored"
 * (spec) แปลว่าไม่มีคอลัมน์ isActive ให้เชื่อ มีแต่สิ่งที่ LINE ตอบตอนนี้ (`defaultRichMenuId`)
 * กับ pointer ที่เราเก็บไว้เอง (`memberRichMenuId`) เท่านั้น
 *
 * ยิง `GET /menus` เองอีกครั้งแทนที่จะรับรายการที่ `RichMenuList` โหลดไว้แล้วผ่าน prop — component
 * นี้รับแค่ `channelId` (แพทเทิร์นเดียวกับ `MenuPreviewModal` ที่ยิง `GET /menus/:id` เอง) แลกมาด้วย
 * คำขอซ้ำหนึ่งครั้งตอนโหลดหน้า สิ่งที่มันประหยัดคือคำขอ "ต่อไอดี": ผลลัพธ์เดียวมีสอง LINE rich
 * menu id ให้ resolve เป็นชื่อ (default กับ member) ทั้งคู่ resolve จากรายการชุดเดียวกันนี้ ไม่ใช่
 * ยิง `GET /menus/:id` แยกสองครั้งทีละ id
 */
export function CurrentMenuCard({ channelId }: CurrentMenuCardProps) {
  const { ui, http, t } = usePort()
  const [audience, setAudience] = useState<ChannelAudience | null>(null)
  const [menus, setMenus] = useState<RichMenuSummary[] | null>(null)
  const [audienceError, setAudienceError] = useState<string | null>(null)
  const [menusError, setMenusError] = useState<string | null>(null)

  /**
   * Task 21 item 3 — เดิมสองคำขอนี้ผูกกันด้วย `Promise.all` เดียว เจอ error ตัวเดียวกันเสมอคือ
   * `list.loadFailed` ("โหลดรายการ rich menu ไม่สำเร็จ") ไม่ว่าตัวที่ล้มจริงจะเป็นคำขอไหน — ปัญหา
   * คือสองคำขอนี้มีธรรมชาติต่างกันมาก: `channelAudience` ยิงถึง LINE จริง (token หมดอายุ/LINE
   * ล่ม/429 ทำให้มันล้มได้) ส่วน `menus` เป็นแค่อ่านจาก DB ของเราเอง เกือบไม่มีทางล้ม — ถ้าที่ล้ม
   * จริงคือแค่ audience ผู้ใช้จะเห็นข้อความอ้างว่า "โหลดรายการ rich menu ไม่สำเร็จ" ทั้งที่ตาราง
   * เต็มของ `RichMenuList` ข้างล่างการ์ดนี้ (คนละคำขอ คนละ component) render สำเร็จอยู่ตรงหน้าเลย
   *
   * แยกเป็นสองคำขออิสระ จับ error คนละตัว: `menusError` จริง ๆ แล้วแปลว่า "โหลดรายการ rich menu
   * ไม่สำเร็จ" (คำเดียวกับที่ `RichMenuList` ใช้ — เป็นข้อความที่ตรงจริง) ส่วน `audienceError`
   * ใช้คีย์ใหม่ที่ไม่อ้างว่ารายการเมนูพัง — ทั้งสองยังไม่มีคำใดพูดว่า "การกระทำ" ล้ม เพราะไม่มีใครกด
   * อะไรเลยตรงนี้ (เหตุผลเดียวกับ AudienceToggle.tsx:load — ดูคอมเมนต์ที่นั่น)
   */
  useEffect(() => {
    let cancelled = false
    setAudience(null)
    setMenus(null)
    setAudienceError(null)
    setMenusError(null)
    http.get<ChannelAudience>(ENDPOINTS.channelAudience(channelId))
      .then((next) => { if (!cancelled) setAudience(next) })
      .catch(() => { if (!cancelled) setAudienceError(t('audience.loadFailed')) })
    http.get<RichMenuSummary[]>(`${ENDPOINTS.menus}?channel=${channelId}`)
      .then((next) => { if (!cancelled) setMenus(next) })
      .catch(() => { if (!cancelled) setMenusError(t('list.loadFailed')) })
    return () => { cancelled = true }
  }, [channelId, http, t])

  // เมนูที่เคยเป็น default/member แล้วถูกลบทิ้งไปทีหลัง (lineRichMenuId ไม่มีในรายการที่โหลดมาแล้ว)
  // ต้องบอกตรง ๆ ว่า "ยังไม่ได้ตั้ง" เหมือนกรณี id เป็น null เอง ไม่ใช่แสดงเป็นช่องว่าง — สอง
  // เทสต์ในไฟล์นี้ (มี id / เป็น null) ต้องได้ข้อความเดียวกันเมื่อ resolve ไม่ได้ผลลัพธ์
  const titleOf = (lineRichMenuId: string | null): string => {
    if (lineRichMenuId === null || menus === null) return t('list.currentMenu.none')
    const found = menus.find((menu) => menu.lineRichMenuId === lineRichMenuId)
    return found === undefined ? t('list.currentMenu.none') : found.title
  }

  // `menusError` มาก่อนเสมอ ไม่ว่า audience จะล้มด้วยหรือไม่: ไม่มี `menus` แปลว่า `titleOf` ใช้
  // งานไม่ได้เลย การ์ดทั้งใบ render อะไรที่มีความหมายไม่ได้จริง ๆ ไม่ใช่แค่เรื่อง priority ข้อความ
  if (menusError !== null) return <ui.Alert variant="danger">{menusError}</ui.Alert>
  if (menus === null) return <ui.Loader>{t('common.loading')}</ui.Loader>
  if (audienceError !== null) return <ui.Alert variant="danger">{audienceError}</ui.Alert>
  if (audience === null) return <ui.Loader>{t('common.loading')}</ui.Loader>

  return (
    <ui.Flex direction="column" gap={2}>
      <ui.Typography as="h2" variant="beta">{t('list.currentMenu')}</ui.Typography>
      <ui.Flex gap={6}>
        <ui.Flex direction="column" gap={1}>
          <ui.Typography textColor="neutral600">{t('list.currentMenu.all')}</ui.Typography>
          <span data-testid="current-all">{titleOf(audience.defaultRichMenuId)}</span>
        </ui.Flex>
        <ui.Flex direction="column" gap={1}>
          <ui.Typography textColor="neutral600">{t('list.currentMenu.members')}</ui.Typography>
          <span data-testid="current-members">{titleOf(audience.memberRichMenuId)}</span>
        </ui.Flex>
      </ui.Flex>
    </ui.Flex>
  )
}
