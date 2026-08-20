import type { Bounds, RichMenuSize } from '@fosivo/line-rich-menu-core/browser'
import { usePort } from '../port.js'
import { CanvasEditor } from './CanvasEditor.js'

export interface PreviewProps {
  size: RichMenuSize
  bounds: readonly Bounds[]
  imageUrl?: string
  chatBarText: string
  expanded: boolean
  /** ช่องที่เลือกอยู่ ส่งมาเมื่อ canvas ในนี้ถูกใช้เป็นตัวควบคุมจริง (ดูคอมเมนต์ที่ตัว CanvasEditor) */
  activeIndex?: number | null
  onSelect?: (index: number) => void
  /** ไม่ส่งมา = เดาจากว่ามีรูปไหม ซึ่งเป็นพฤติกรรมที่ถูกสำหรับพรีวิวเฉยๆ ที่ไม่มีสวิตช์ให้กด */
  showOutlines?: boolean
  errors?: Readonly<Record<number, string>>
  /** กว้างเท่ากรอบมือถือโดยดีฟอลต์ ผู้เรียกที่ต้องการพื้นที่ทำงานมากกว่านี้ส่งค่ามาเองได้ */
  width?: number
}

/** กรอบโทรศัพท์จำลอง — เมนูอยู่ครึ่งล่างและแถบแชทสะท้อน label ที่พิมพ์ทันที (สเปก §5.7) */
export function Preview({
  size, bounds, imageUrl, chatBarText, expanded,
  activeIndex, onSelect, showOutlines, errors, width = 320,
}: PreviewProps) {
  const { t } = usePort()

  // จงใจไม่ผ่าน ui.* เลยทั้ง markup นี้ (สเปก §5.2, ข้อยกเว้นที่สอง) — สีอย่าง #8ba7d0 เป็นสีวอลเปเปอร์
  // แชทของ LINE เอง ไม่ใช่ token ของ design system ถ้าเปลี่ยนไปวาดด้วย ui.Typography/ui.Flex
  // พรีวิวจะสืบทอด type scale กับ spacing ของ Strapi admin เข้ามาแทน ซึ่งขัดกับหน้าที่ของ component
  // นี้ตรงๆ เพราะมันต้องจำลองว่าเมนูหน้าตาเป็นยังไง **ในแอป LINE** ไม่ใช่ในหน้า Strapi — subtree นี้
  // ฝัง CanvasEditor ซึ่งเป็นข้อยกเว้นอยู่แล้วด้วย จึงยกเว้นทั้งก้อนไปพร้อมกัน
  return (
    <div style={{ width, border: '1px solid #dcdce4', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: '#8ba7d0', height: 180, padding: '.75rem' }}>
        <span style={{ background: '#fff', borderRadius: 12, padding: '.3rem .6rem', fontSize: '.8rem' }}>
          {t('preview.greeting')}
        </span>
      </div>
      {expanded ? (
        // canvas ตัวนี้คือ **ตัวควบคุมจริง** ไม่ใช่ภาพประกอบ — ผัง §5.7 วาดช่อง A/B/C ไว้ในกรอบโทรศัพท์
        // นี้ช่องเดียว พร้อมสวิตช์ "Show template outlines" อยู่ใต้กรอบ ไม่ได้มี canvas แยกอีกตัวข้างๆ
        // เคยมีสองตัวอยู่ช่วงหนึ่ง (ตัวแก้ไขได้ตัวหนึ่ง กับตัวในนี้อีกตัว) ซึ่งทำให้ทุกช่องโผล่ซ้ำสองชุด
        // ใน accessibility tree จึงเคยต้องปิดชุดนี้ด้วย aria-hidden — ห้ามใส่กลับ ตอนนี้มีชุดเดียวและ
        // เป็นของจริง ถ้าซ่อนจะเท่ากับเอา editor ออกจากมือคนใช้ screen reader ทั้งหมด
        <div data-testid="preview-menu">
          <CanvasEditor
            size={size}
            bounds={bounds}
            showOutlines={showOutlines ?? imageUrl === undefined}
            activeIndex={activeIndex ?? null}
            onSelect={onSelect ?? (() => {})}
            {...(errors === undefined ? {} : { errors })}
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
