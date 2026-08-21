import { useEffect, useState } from 'react'
import { ENDPOINTS, type BotInfo, type ChannelSummary, type ReconcileReport } from '../api.js'
import { usePort } from '../port.js'

interface DraftChannel {
  name: string
  channelId: string
  channelSecret: string
  channelAccessToken: string
}

/** เมนูกำพร้าตัวหนึ่งที่รอผู้ใช้กดยืนยันลบ — เก็บทั้ง channelId เพราะ endpoint ลบต้องใช้ทั้งคู่ */
interface PendingDelete {
  channelId: string
  lineRichMenuId: string
}

const emptyChannel: DraftChannel = { name: '', channelId: '', channelSecret: '', channelAccessToken: '' }

export function ChannelSettings() {
  const { ui, http, t } = usePort()
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<DraftChannel>(emptyChannel)
  const [tested, setTested] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // เปิดได้ทีละ channel — เพียงพอสำหรับหน้านี้และทำให้ testId ของแต่ละแถวไม่ต้องผูกกับ channelId ซ้ำซ้อน
  const [reconcileFor, setReconcileFor] = useState<string | null>(null)
  const [report, setReport] = useState<ReconcileReport | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

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

  // สลับเปิด/ปิดแผงของ channel เดียวกัน กด "ตรวจสอบ" ซ้ำที่ channel เดิมคือปิด ไม่ใช่โหลดซ้ำเงียบ ๆ
  const toggleReconcile = async (id: string) => {
    if (reconcileFor === id) { setReconcileFor(null); setReport(null); return }
    setError(null)
    setReconcileFor(id)
    setReport(null)
    try {
      setReport(await http.get<ReconcileReport>(ENDPOINTS.channelReconcile(id)))
    } catch {
      setError(t('channel.reconcile.failed'))
    }
  }

  // สเปก §8 ข้อ 3 — ต้องถามยืนยันก่อนเสมอ เป็นการลบของบนระบบจริงที่ย้อนกลับไม่ได้ กด delete แค่เปิดกล่อง
  // ยืนยัน ยังไม่ยิง request ใด ๆ จนกว่าจะกดปุ่มยืนยันในกล่องนั้นอีกที (ดู confirmDelete ด้านล่าง)
  const askDelete = (channelId: string, lineRichMenuId: string) => setPendingDelete({ channelId, lineRichMenuId })

  const confirmDelete = async () => {
    if (pendingDelete === null) return
    const { channelId, lineRichMenuId } = pendingDelete
    setError(null)
    try {
      await http.del(ENDPOINTS.channelOrphan(channelId, lineRichMenuId))
      // ตัดออกจาก state ทันทีแทนที่จะ reconcile ใหม่ทั้งชุด — เซิร์ฟเวอร์เพิ่งยืนยันเองว่าลบสำเร็จ
      setReport((prev) => (prev === null ? prev : { ...prev, orphans: prev.orphans.filter((id) => id !== lineRichMenuId) }))
      setPendingDelete(null)
    } catch {
      setError(t('channel.reconcile.deleteFailed'))
      setPendingDelete(null)
    }
  }

  return (
    <ui.Flex direction="column" gap={3}>
      <ui.Typography as="h1" variant="alpha">{t('channel.heading')}</ui.Typography>
      {error === null ? null : <ui.Alert variant="danger">{error}</ui.Alert>}
      {tested === null ? null : <ui.Alert variant="success">{tested}</ui.Alert>}

      {channels.map((channel) => (
        <ui.Flex key={channel.id} direction="column" gap={2}>
          <ui.Flex justifyContent="space-between" alignItems="center">
            <ui.Typography>{channel.name}</ui.Typography>
            <ui.Typography textColor="neutral600">{channel.channelId}</ui.Typography>
            <ui.Typography textColor="neutral600">{channel.accessTokenPreview}</ui.Typography>
            <ui.Flex gap={2}>
              <ui.Button variant="secondary" testId={`test-${channel.id}`} onClick={() => void test(channel.id)}>
                {t('channel.test')}
              </ui.Button>
              <ui.Button variant="secondary" testId={`reconcile-${channel.id}`} onClick={() => void toggleReconcile(channel.id)}>
                {t('channel.reconcile')}
              </ui.Button>
            </ui.Flex>
          </ui.Flex>

          {reconcileFor !== channel.id ? null : report === null ? (
            <ui.Loader>{t('common.loading')}</ui.Loader>
          ) : (
            <ui.Flex direction="column" gap={2}>
              <ui.Flex direction="column" gap={1}>
                <ui.Typography as="h3" variant="delta">{t('channel.reconcile.orphans.heading')}</ui.Typography>
                {/* กำพร้า = อยู่บน LINE แต่ไม่มีแถวใน DB — id ฝั่ง LINE คือสิ่งเดียวที่ระบุมันได้ จึงมีปุ่มลบ */}
                {report.orphans.length === 0 ? (
                  <ui.Typography textColor="neutral600">{t('channel.reconcile.orphans.empty')}</ui.Typography>
                ) : report.orphans.map((lineRichMenuId) => (
                  <ui.Flex key={lineRichMenuId} justifyContent="space-between" alignItems="center">
                    <ui.Typography>{lineRichMenuId}</ui.Typography>
                    <ui.Button
                      variant="danger"
                      testId={`delete-orphan-${lineRichMenuId}`}
                      onClick={() => askDelete(channel.id, lineRichMenuId)}
                    >
                      {t('channel.reconcile.delete')}
                    </ui.Button>
                  </ui.Flex>
                ))}
              </ui.Flex>

              <ui.Flex direction="column" gap={1}>
                <ui.Typography as="h3" variant="delta">{t('channel.reconcile.missing.heading')}</ui.Typography>
                {/* หายไป = DB บอกว่า published แต่ LINE ไม่มีแล้ว — ลบแถวไม่ได้แก้อะไร จึงไม่มีปุ่ม (สเปก) */}
                {report.missing.length === 0 ? (
                  <ui.Typography textColor="neutral600">{t('channel.reconcile.missing.empty')}</ui.Typography>
                ) : report.missing.map((lineRichMenuId) => (
                  <ui.Typography key={lineRichMenuId}>{lineRichMenuId}</ui.Typography>
                ))}
              </ui.Flex>
            </ui.Flex>
          )}
        </ui.Flex>
      ))}

      {pendingDelete === null ? null : (
        <ui.Modal
          open
          onClose={() => setPendingDelete(null)}
          title={t('channel.reconcile.deleteConfirm.title')}
          footer={
            <>
              <ui.Button variant="secondary" onClick={() => setPendingDelete(null)}>{t('common.cancel')}</ui.Button>
              <ui.Button variant="danger" testId="confirm-delete-orphan" onClick={() => void confirmDelete()}>
                {t('channel.reconcile.delete')}
              </ui.Button>
            </>
          }
        >
          <ui.Alert variant="warning">
            {t('channel.reconcile.deleteConfirm.body', { id: pendingDelete.lineRichMenuId })}
          </ui.Alert>
        </ui.Modal>
      )}

      {adding ? (
        <ui.Flex direction="column" gap={2}>
          <ui.TextInput name="name" label={t('channel.name')} value={draft.name}
            onChange={(v) => set('name', v)} />
          <ui.TextInput name="channelId" label={t('channel.channelId')} value={draft.channelId}
            onChange={(v) => set('channelId', v)} />
          {/* bearer credential — ใครอ่านค่านี้ได้จากจอก็โพสต์แทนธุรกิจนี้ได้ทันที (สเปก §11.2) หน้านี้
              ถูก demo/screen-share จริง ไม่ใช่ความเสี่ยงทางทฤษฎี จึงต้อง mask ทั้งสองช่องเสมอ

              autoComplete="off" มาคู่กับ type="password" เสมอ: ช่องรหัสผ่านที่ไม่ได้บอกอะไรไว้
              จะถูกเบราว์เซอร์เสนอให้ "บันทึกรหัสผ่าน" แล้ว token ของ LINE จะไปนอนอยู่ใน credential
              store ของผู้ใช้และซิงก์ข้ามเครื่องเขา — ในหน้านี้ไม่มีอะไรเป็นการล็อกอินเลย จึงมีแต่เสีย
              ไม่มีได้ (ถ้าวันไหนตัดสินใจเอา type="password" ออก ต้องคิดเรื่องนี้ใหม่ทั้งคู่พร้อมกัน) */}
          <ui.TextInput name="channelSecret" type="password" autoComplete="off" label={t('channel.channelSecret')} value={draft.channelSecret}
            onChange={(v) => set('channelSecret', v)} />
          <ui.TextInput name="channelAccessToken" type="password" autoComplete="off" label={t('channel.accessToken')} value={draft.channelAccessToken}
            onChange={(v) => set('channelAccessToken', v)} />
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
