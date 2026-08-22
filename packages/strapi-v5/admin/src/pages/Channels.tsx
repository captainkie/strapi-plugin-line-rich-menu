import { useNavigate } from 'react-router-dom'
import { ChannelSettings, usePort } from '@fosivo/line-rich-menu-ui'
import { PLUGIN_ID } from '../plugin-id.js'

const BASE = `/plugins/${PLUGIN_ID}`

/**
 * ตั้งค่าบัญชี LINE OA — หน้าของตัวเอง ไม่ใช่ท่อนล่างของหน้ารายการ
 *
 * เดิมทั้งสองอย่างอยู่หน้าเดียวกัน ผลคือหน้าแรกที่คนเปิดปลั๊กอินขึ้นมาเจอมีทั้ง "เมนูของฉัน"
 * กับ "ฟอร์มใส่ token" ปนกัน — งานที่ทำครั้งเดียวตอนติดตั้ง แย่งพื้นที่กับงานที่ทำทุกวัน
 * และในแง่สิทธิ์ก็ปนกันด้วย: `settings` (อ่าน/หมุน token) เป็นสิทธิ์คนละตัวกับ `read`/`write`
 * ที่คนสร้างเมนูถืออยู่ การแยกหน้าทำให้ขอบนั้นตรงกับสิ่งที่ผู้ใช้เห็น
 */
export function ChannelsPage() {
  const { ui, t } = usePort()
  const navigate = useNavigate()

  return (
    <ui.Page
      title={t('channel.heading')}
      actions={(
        <ui.Button variant="secondary" testId="back-to-list" onClick={() => navigate(BASE)}>
          {t('channel.back')}
        </ui.Button>
      )}
    >
      <ChannelSettings />
    </ui.Page>
  )
}
