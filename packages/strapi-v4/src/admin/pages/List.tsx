import { useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { ENDPOINTS, RichMenuList, usePort, type ChannelSummary } from '@fosivo/line-rich-menu-ui'
import { PLUGIN_ID } from '../../server/permissions.js'

const BASE = `/plugins/${PLUGIN_ID}`

/**
 * ตัวเลือก channel อยู่ที่อะแดปเตอร์ ไม่ใช่ใน `packages/ui` — `RichMenuList` รับ `channelId`
 * เข้ามาเป็น prop โดยตั้งใจ (Plan 02) เพราะการเลือก channel เป็นเรื่องของหน้าที่ประกอบมัน
 * ไม่ใช่ของตัวรายการเอง
 */
export function ListPage() {
  const { ui, http, t } = usePort()
  const history = useHistory()
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
            onClick={() => history.push(`${BASE}/rich-menus/new?channel=${channelId ?? ''}`)}
          >
            {t('list.create')}
          </ui.Button>
          {/* ตั้งค่าบัญชีย้ายไปหน้าของตัวเองแล้ว (ดูคอมเมนต์ที่ pages/Channels.tsx) — ที่นี่เหลือ
              แค่ทางเข้า ไม่ใช่ทั้งฟอร์มมากองอยู่ใต้รายการ */}
          <ui.Button variant="secondary" testId="manage-channels" onClick={() => history.push(`${BASE}/channels`)}>
            {t('list.manageChannels')}
          </ui.Button>
        </ui.Flex>

        <RichMenuList channelId={channelId} />
      </ui.Flex>
    </ui.Page>
  )
}
