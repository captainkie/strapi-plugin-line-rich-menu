import type { Bounds, RichMenuSize } from '@fosivo/line-rich-menu-core/browser'
import { usePort } from '../port.js'
import { CanvasEditor } from './CanvasEditor.js'

export interface PreviewProps {
  size: RichMenuSize
  bounds: readonly Bounds[]
  imageUrl?: string
  chatBarText: string
  expanded: boolean
}

/** กรอบโทรศัพท์จำลอง — เมนูอยู่ครึ่งล่างและแถบแชทสะท้อน label ที่พิมพ์ทันที (สเปก §5.7) */
export function Preview({ size, bounds, imageUrl, chatBarText, expanded }: PreviewProps) {
  const { t } = usePort()

  // จงใจไม่ผ่าน ui.* เลยทั้ง markup นี้ (สเปก §5.2, ข้อยกเว้นที่สอง) — สีอย่าง #8ba7d0 เป็นสีวอลเปเปอร์
  // แชทของ LINE เอง ไม่ใช่ token ของ design system ถ้าเปลี่ยนไปวาดด้วย ui.Typography/ui.Flex
  // พรีวิวจะสืบทอด type scale กับ spacing ของ Strapi admin เข้ามาแทน ซึ่งขัดกับหน้าที่ของ component
  // นี้ตรงๆ เพราะมันต้องจำลองว่าเมนูหน้าตาเป็นยังไง **ในแอป LINE** ไม่ใช่ในหน้า Strapi — subtree นี้
  // ฝัง CanvasEditor ซึ่งเป็นข้อยกเว้นอยู่แล้วด้วย จึงยกเว้นทั้งก้อนไปพร้อมกัน
  return (
    <div style={{ width: 320, border: '1px solid #dcdce4', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: '#8ba7d0', height: 180, padding: '.75rem' }}>
        <span style={{ background: '#fff', borderRadius: 12, padding: '.3rem .6rem', fontSize: '.8rem' }}>
          {t('preview.greeting')}
        </span>
      </div>
      {expanded ? (
        // aria-hidden: CanvasEditor วาดทุกช่องเป็น role="button" (CanvasEditor.tsx) แต่ตัวที่ฝังอยู่ตรงนี้
        // เป็นแค่ภาพจำลองเฉยๆ ไม่ใช่ตัวควบคุมจริง — canvas หลักที่แก้ไขได้ต่างหากคือของจริง ถ้าไม่ซ่อน
        // ชุดนี้จาก accessibility tree ทุกช่องจะมีอยู่สองชุดพร้อมกัน คน tab ด้วยคีย์บอร์ดจะเจอโซนที่กดแล้ว
        // ไม่ทำอะไร และ screen reader จะพูดชื่อช่องซ้ำสองรอบโดยไม่มีทางบอกได้ว่าอันไหนคือของจริง
        <div data-testid="preview-menu" aria-hidden="true">
          <CanvasEditor
            size={size}
            bounds={bounds}
            showOutlines={imageUrl === undefined}
            activeIndex={null}
            onSelect={() => {}}
            {...(imageUrl === undefined ? {} : { imageUrl })}
          />
        </div>
      ) : null}
      <div
        data-testid="preview-chat-bar"
        style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          borderTop: '1px solid #dcdce4', padding: '.6rem', fontSize: '.85rem',
        }}
      >
        {chatBarText === '' ? t('chatBar.defaultLabel') : chatBarText} ▾
      </div>
    </div>
  )
}
