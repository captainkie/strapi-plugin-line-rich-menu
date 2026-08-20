import { useEffect, useState } from 'react'
import { ENDPOINTS, type BotInfo, type ChannelSummary } from '../api.js'
import { usePort } from '../port.js'

interface DraftChannel {
  name: string
  channelId: string
  channelSecret: string
  accessToken: string
}

const emptyChannel: DraftChannel = { name: '', channelId: '', channelSecret: '', accessToken: '' }

export function ChannelSettings() {
  const { ui, http, t } = usePort()
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<DraftChannel>(emptyChannel)
  const [tested, setTested] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    http.get<ChannelSummary[]>(ENDPOINTS.channels)
      .then(setChannels)
      .catch(() => setError(t('channel.loadFailed')))
  }

  useEffect(reload, [])

  const save = async () => {
    setError(null)
    try {
      await http.post(ENDPOINTS.channels, draft)
      // channelSecret/accessToken เป็น bearer credential ที่เพิ่งส่งให้เซิร์ฟเวอร์ไปแล้ว — ไม่มี
      // เหตุผลต้องเก็บ plaintext ค้างไว้ใน state ต่อ ล้างกลับเป็นฟอร์มว่างทันทีที่บันทึกสำเร็จ
      // ไม่งั้นใครเปิดฟอร์ม "เพิ่ม channel" ซ้ำ (หรือแชร์จอตอน demo) จะเห็น token ของรอบก่อนค้างอยู่
      setDraft(emptyChannel)
      setAdding(false)
      reload()
    } catch {
      setError(t('channel.saveFailed'))
    }
  }

  const test = async (id: string) => {
    setError(null)
    setTested(null)
    try {
      const info = await http.post<BotInfo>(ENDPOINTS.channelTest(id), undefined)
      // ชื่อ OA ต้องผ่าน t() เสมอ ไม่ใช่ต่อ string เอง — มีแต่ t() เท่านั้นที่รู้วิธีวางชื่อ "กลางประโยค"
      // ให้ถูกไวยากรณ์ของแต่ละภาษา (ไทย "เชื่อมต่อกับ {name} แล้ว" ชื่ออยู่กลางประโยค ไม่ใช่ท้ายสุด
      // แบบอังกฤษ) การต่อ label กับ name ด้วย string concatenation ทำได้แค่วางชื่อไว้ท้ายสุดเสมอ
      setTested(t('channel.testOk', { name: info.displayName }))
    } catch {
      setError(t('channel.testFailed'))
    }
  }

  const set = <K extends keyof DraftChannel>(key: K, value: DraftChannel[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <ui.Flex direction="column" gap={3}>
      <ui.Typography variant="alpha">{t('channel.heading')}</ui.Typography>
      {error === null ? null : <ui.Alert variant="danger">{error}</ui.Alert>}
      {tested === null ? null : <ui.Alert variant="success">{tested}</ui.Alert>}

      {channels.map((channel) => (
        <ui.Flex key={channel.id} justifyContent="space-between" alignItems="center">
          <ui.Typography>{channel.name}</ui.Typography>
          <ui.Typography textColor="neutral600">{channel.channelId}</ui.Typography>
          <ui.Typography textColor="neutral600">{channel.accessTokenPreview}</ui.Typography>
          <ui.Button variant="secondary" testId={`test-${channel.id}`} onClick={() => void test(channel.id)}>
            {t('channel.test')}
          </ui.Button>
        </ui.Flex>
      ))}

      {adding ? (
        <ui.Flex direction="column" gap={2}>
          <ui.TextInput name="name" label={t('channel.name')} value={draft.name}
            onChange={(v) => set('name', v)} />
          <ui.TextInput name="channelId" label={t('channel.channelId')} value={draft.channelId}
            onChange={(v) => set('channelId', v)} />
          {/* bearer credential — ใครอ่านค่านี้ได้จากจอก็โพสต์แทนธุรกิจนี้ได้ทันที (สเปก §11.2) หน้านี้
              ถูก demo/screen-share จริง ไม่ใช่ความเสี่ยงทางทฤษฎี จึงต้อง mask ทั้งสองช่องเสมอ */}
          <ui.TextInput name="channelSecret" type="password" label={t('channel.channelSecret')} value={draft.channelSecret}
            onChange={(v) => set('channelSecret', v)} />
          <ui.TextInput name="accessToken" type="password" label={t('channel.accessToken')} value={draft.accessToken}
            onChange={(v) => set('accessToken', v)} />
          <ui.Flex gap={2}>
            <ui.Button variant="secondary" onClick={() => setAdding(false)}>{t('common.cancel')}</ui.Button>
            <ui.Button testId="save-channel" onClick={() => void save()}>{t('common.save')}</ui.Button>
          </ui.Flex>
        </ui.Flex>
      ) : (
        <ui.Button testId="add-channel" onClick={() => setAdding(true)}>{t('channel.add')}</ui.Button>
      )}
    </ui.Flex>
  )
}
