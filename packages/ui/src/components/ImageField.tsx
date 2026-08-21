import { useState, type ChangeEvent } from 'react'
import type { RichMenuSize } from '@fosivo/line-rich-menu-core/browser'
import { ENDPOINTS } from '../api.js'
import { usePort } from '../port.js'

export interface UploadedImage {
  id: number
  url: string
  width: number
  height: number
}

export interface ImageFieldProps {
  value: UploadedImage | null
  size: RichMenuSize
  /** ปิดไว้จนกว่าจะเลือก template — เหมือนปุ่ม Image ของ LINE OA Manager */
  disabled: boolean
  onChange(next: UploadedImage | null): void
  /**
   * error ถูกถือไว้โดยผู้เรียก ไม่ใช่โดย component นี้ — เหมือนพี่น้องทุกตัวในโฟลเดอร์เดียวกัน
   *
   * เหตุผลไม่ใช่ความสม่ำเสมอเชิงสไตล์: `applyTemplate` ในหน้า editor ต้องล้างมันได้เมื่อขนาด
   * ผืนผ้าใบเปลี่ยน ถ้า component ถือไว้เอง แบนเนอร์ "ต้องเป็นสัดส่วน 2500×1686" จะค้างอยู่
   * ทั้งที่ template ปัจจุบันเป็น 2500×843 ไปแล้ว ซึ่งเป็นข้อมูลที่ผิดจริง ไม่ใช่แค่เก่า
   */
  error?: string
  onErrorChange?(message: string | null): void
}

const ACCEPTED = ['image/jpeg', 'image/png']

function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      // naturalWidth/naturalHeight คือขนาดจริงของไฟล์ ไม่ใช่ width/height ที่เป็นขนาด
      // ตอน render (ซึ่งตอนนี้ยังไม่ได้ attach เข้า DOM ด้วยซ้ำ ค่าจะเป็น 0 เสมอ)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode_failed'))
    }
    img.src = url
  })
}

export function ImageField({ value, size, disabled, onChange, error, onErrorChange }: ImageFieldProps) {
  const { ui, http, t } = usePort()
  const setError = (message: string | null) => { onErrorChange?.(message) }
  const [busy, setBusy] = useState(false)

  const handle = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file === undefined) return
    setError(null)

    if (!ACCEPTED.includes(file.type)) {
      setError(t('image.error.format'))
      return
    }

    // ตรวจฝั่ง client ก่อน เพื่อไม่ให้ผู้ใช้ต้องรอ round trip เพื่อรู้ว่ารูปแนวตั้งใช้ไม่ได้
    let measured: { width: number; height: number }
    try {
      measured = await measure(file)
    } catch {
      setError(t('image.error.decode'))
      return
    }

    // measure() คืนขนาดที่ไม่วัดได้จริง (0 หรือไม่จำกัด) ได้เมื่อ decode ล้มเหลวแบบเงียบ ๆ
    // ถ้าปล่อยให้หารกันตรง ๆ actual จะกลาย NaN และ `NaN > 0.01` เป็น false เสมอ — guard ด้านล่าง
    // จะปล่อยไฟล์ผ่านราวกับสัดส่วนตรง ทั้งที่วัดไม่ได้เลย ต้องกันไว้ก่อนถึงจุดหาร
    if (!Number.isFinite(measured.width) || measured.width <= 0
      || !Number.isFinite(measured.height) || measured.height <= 0) {
      setError(t('image.error.ratio', { expected: `${size.width}×${size.height}` }))
      return
    }

    const wanted = size.width / size.height
    const actual = measured.width / measured.height
    if (Math.abs(wanted - actual) > 0.01) {
      setError(t('image.error.ratio', { expected: `${size.width}×${size.height}` }))
      return
    }

    const body = new FormData()
    body.append('files', file)
    setBusy(true)
    try {
      // ENDPOINTS.upload คือ endpoint เดียวกันทั้ง Strapi 4 และ 5 — จงใจไม่แตะ Media Library UI
      // ประกาศ path ไว้ที่ api.ts จุดเดียว (สัญญาที่ adapter ของ Plan 03/04 อ่าน) ไม่ hardcode ซ้ำที่นี่
      const uploaded = await http.post<UploadedImage[]>(ENDPOINTS.upload, body)
      const first = uploaded[0]
      if (first === undefined) throw new Error('empty_response')
      onChange(first)
    } catch {
      setError(t('image.error.upload'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ui.Flex direction="column" gap={1}>
      <input
        data-testid="image-input"
        type="file"
        accept={ACCEPTED.join(',')}
        disabled={disabled || busy}
        onChange={(event) => { void handle(event) }}
      />
      {value === null ? null : (
        <ui.Flex gap={2} alignItems="center">
          <img src={value.url} alt="" style={{ width: 120, height: 'auto' }} />
          <ui.Button variant="danger" testId="image-remove" onClick={() => onChange(null)}>
            {t('common.remove')}
          </ui.Button>
        </ui.Flex>
      )}
      {busy ? <ui.Loader>{t('common.loading')}</ui.Loader> : null}
      {error === undefined ? null : <ui.Alert variant="danger">{error}</ui.Alert>}
    </ui.Flex>
  )
}
