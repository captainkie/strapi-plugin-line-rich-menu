import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ENDPOINTS, RichMenuList, usePort, type ChannelSummary } from '@fosivo/line-rich-menu-ui'
import { PLUGIN_ID } from '../plugin-id.js'

/**
 * `BASE` ยังเป็น path เต็มถึงแม้ `Routes` ใน App.tsx จะประกาศ path แบบสัมพัทธ์ — `navigate()`
 * ของ router v6 ถือว่าสตริงที่ขึ้นต้นด้วย `/` เป็น path สัมบูรณ์ ส่วนสตริงที่ไม่ขึ้นต้นด้วย `/`
 * จะถูกต่อจาก route ปัจจุบัน ซึ่งแปลว่าปุ่ม "สร้างเมนู" ที่กดจากหน้ารายการจะพาไปผิดที่ทันทีที่
 * หน้ารายการอยู่ใต้ segment อื่น การระบุ path เต็มจึงเป็นตัวเลือกที่อ่านแล้วไม่ต้องเดา
 */
const BASE = `/plugins/${PLUGIN_ID}`

/**
 * ตัวเลือก channel อยู่ที่อะแดปเตอร์ ไม่ใช่ใน `packages/ui` — `RichMenuList` รับ `channelId`
 * เข้ามาเป็น prop โดยตั้งใจ (Plan 02) เพราะการเลือก channel เป็นเรื่องของหน้าที่ประกอบมัน
 * ไม่ใช่ของตัวรายการเอง
 */
export function ListPage() {
  const { ui, http, t } = usePort()
  const navigate = useNavigate()
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [channelId, setChannelId] = useState<string | null>(null)

  useEffect(() => {
    http.get<ChannelSummary[]>(ENDPOINTS.channels)
      .then((rows) => {
        setChannels(rows)
        // `current ?? …` ไม่ใช่ `rows.find(...)` เฉย ๆ — ถ้าผู้ใช้เลือก channel ไว้แล้วแล้ว effect
        // นี้ทำงานซ้ำ การเลือกของผู้ใช้ต้องชนะค่าเริ่มต้นเสมอ
        setChannelId((current) => current ?? rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? null)
      })
      .catch(() => setChannels([]))
  }, [http])

  return (
    <ui.Page title={t('plugin.name')}>
      <ui.Flex direction="column" gap={4}>
        <ui.Flex gap={2} alignItems="flex-end">
          <ui.Select
            name="channel"
            label={t('list.channel')}
            value={channelId ?? ''}
            onChange={setChannelId}
            disabled={channels.length === 0}
          >
            {channels.map((channel) => (
              <ui.Option key={channel.id} value={channel.id}>{channel.name}</ui.Option>
            ))}
          </ui.Select>
          <ui.Button
            testId="create-menu"
            disabled={channelId === null}
            onClick={() => navigate(`${BASE}/rich-menus/new?channel=${channelId ?? ''}`)}
          >
            {t('list.create')}
          </ui.Button>
          {/* ตั้งค่าบัญชีย้ายไปหน้าของตัวเองแล้ว (ดูคอมเมนต์ที่ pages/Channels.tsx) — ที่นี่เหลือ
              แค่ทางเข้า ไม่ใช่ทั้งฟอร์มมากองอยู่ใต้รายการ */}
          <ui.Button variant="secondary" testId="manage-channels" onClick={() => navigate(`${BASE}/channels`)}>
            {t('list.manageChannels')}
          </ui.Button>
        </ui.Flex>

        <RichMenuList channelId={channelId} />
      </ui.Flex>
    </ui.Page>
  )
}
