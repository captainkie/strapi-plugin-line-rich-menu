import { SIZE_LADDER, renderTemplateSvg, type Bounds, type RichMenuSizeName } from '@fosivo/line-rich-menu-core/browser'
import { usePort } from '../port.js'

export interface MenuThumbnailProps {
  size: RichMenuSizeName
  bounds: readonly Bounds[]
  /** `null` = ยังไม่มีรูป — ภาพย่อจะเหลือแค่ผังช่อง ซึ่งยังบอกอะไรได้มากกว่ากล่องว่าง */
  imageUrl: string | null
  /** ความกว้างเป็นพิกเซล ความสูงคำนวณจากสัดส่วนจริงของผืนผ้าใบเสมอ */
  width?: number
  alt?: string
}

/**
 * ภาพย่อของเมนูหนึ่งอัน — รูปที่อัปโหลดไว้ ทับด้วยผังช่องแบบเดียวกับที่ LINE OA Manager
 * วางไว้ในคอลัมน์ Image ของหน้ารายการ
 *
 * ใช้ `renderTemplateSvg` ตัวเดียวกับ `TemplatePicker` แทนที่จะวาดกล่องเองด้วย `<div>` ซ้อน:
 * ฟังก์ชันนั้นแปลงทุกพิกัดเป็นจำนวนเต็มก่อนแปะเข้า markup (`safeInt`) อยู่แล้ว จึงเป็นเส้นทาง
 * เดียวที่ตรวจแล้วว่าปลอดภัยกับ `dangerouslySetInnerHTML` — ผังที่ผู้ใช้ลากเองก็ได้ภาพย่อ
 * จากโค้ดเดียวกัน ไม่ต้องมีสองทางเดินสำหรับ template กับผังที่วาดเอง
 *
 * สัดส่วนมาจาก `SIZE_LADDER` ไม่ใช่ตัวเลขที่พิมพ์ไว้เอง — ขั้นแรกของแต่ละขนาดคือขนาดเต็ม
 * ของผืนผ้าใบนั้น และ `bounds` ทุกค่าอยู่ในระบบพิกัดเดียวกันนั้น
 */
export function MenuThumbnail({ size, bounds, imageUrl, width = 96, alt }: MenuThumbnailProps) {
  const { theme } = usePort()
  const canvas = SIZE_LADDER[size][0]!
  const height = Math.round((width * canvas.height) / canvas.width)

  return (
    <div
      data-testid="menu-thumbnail"
      data-has-image={imageUrl === null ? 'false' : 'true'}
      role="img"
      aria-label={alt ?? ''}
      style={{
        width,
        height,
        flex: `0 0 ${width}px`,
        border: `1px solid ${theme.border}`,
        borderRadius: 2,
        overflow: 'hidden',
        // `contain` ไม่ใช่ `cover` — รูป rich menu ถูก normalize ให้ตรงสัดส่วนผืนผ้าใบอยู่แล้ว
        // แต่ถ้าวันไหนมันไม่ตรง `cover` จะครอบตัดขอบทิ้งเงียบ ๆ ทำให้ภาพย่อโกหกว่ารูปพอดี
        backgroundImage: imageUrl === null ? 'none' : `url("${encodeURI(imageUrl)}")`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundColor: theme.surface,
        // `currentColor` คือสิ่งที่ renderTemplateSvg ใช้กับทั้งเส้นขอบและตัวอักษร — เส้นผังต้อง
        // อ่านออกทั้งบนรูปสว่างและรูปมืด สีข้อความรองของธีมคือค่าที่ผ่านทั้งสองกรณีมาแล้ว
        color: theme.mutedText,
      }}
      dangerouslySetInnerHTML={{ __html: renderTemplateSvg(bounds, canvas) }}
    />
  )
}
