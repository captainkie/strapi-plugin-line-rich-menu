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
  /**
   * ส่งมาเมื่อผู้ใช้เปิดโหมดปรับผังเอง — `CanvasEditor` ตัดสินว่าตัวเองแก้ไขได้หรือไม่จากการมีอยู่
   * ของ callback ตัวนี้ (`editable = onBoundsChange !== undefined`) ก่อน Plan 04 ไม่มีจุดเรียก
   * ไหนส่งมันมาเลย ทั้งความสามารถลาก/ปรับขนาดจึงถูกทดสอบไว้แต่ไม่มีทางถูกใช้จากหน้าจอจริง
   */
  onBoundsChange?(index: number, next: Bounds): void
  /** ขนาดช่องกริดในหน่วยพิกเซลของผืนผ้าใบ — ส่งต่อให้ CanvasEditor ตรง ๆ ไม่แปลงอะไร */
  snap?: number
}

/**
 * ตัวคูณสัดส่วน — จุดเรียกสองที่ในโปรเจกต์นี้ส่ง `width` คนละค่า (`RichMenuEditor` ส่ง 480,
 * ดีฟอลต์ของ component นี้เองคือ 320) ตัวเลขทุกตัวของกรอบเครื่อง (มุมโค้ง, dynamic island,
 * status bar ฯลฯ) ที่งานนี้ขอไว้วัดมาจากจอ iPhone อ้างอิงกว้าง 375pt (SE/13 mini) — คูณด้วย `s`
 * แทนการเขียนพิกเซลตายตัว ไม่งั้นกรอบจะพอดีแค่ค่าใดค่าหนึ่งใน 320/480 แล้วอีกค่าจะเพี้ยน
 * (บาง/หนาเกินไป, island ไม่ได้สัดส่วนกับความกว้างจอ)
 */
const REFERENCE_WIDTH = 375

/**
 * แถบสถานะของกรอบนี้พื้นขาว (จอแชทของ LINE เป็นพื้นขาว ไม่ใช่พื้นเข้มแบบ lock screen) — ไอคอน
 * ทั้งสามตัวจึงต้องเป็นสีเข้ม (`STATUS_BAR_COLOR`) สีเดียวกับตัวเลขเวลา ไม่ใช่สีขาวที่กลืนไปกับ
 * พื้นหลังจนมองไม่เห็นเลย (พังแบบนี้จริงตอนตรวจภาพหน้าจอ ก่อนแก้ไฟล์นี้)
 */
const STATUS_BAR_COLOR = '#060606'

/** ก้านสัญญาณ 4 แท่งสูงขึ้นเรื่อย ๆ — วาดเป็นรูปทรง ไม่ใช่ก็อปไอคอนของแอปเปิล */
function SignalGlyph({ s }: { s: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5 * s, height: 11 * s }}>
      {[4, 6, 8, 10].map((h, index) => (
        <div
          key={index}
          style={{ width: 2.4 * s, height: h * s, borderRadius: s, background: STATUS_BAR_COLOR }}
        />
      ))}
    </div>
  )
}

/**
 * ก้านโค้งสามชั้น (สัญลักษณ์ wifi) — วงกลมมีเส้นขอบ ตัดครึ่งล่างทิ้งด้วย `clip-path` ให้เหลือ
 * แค่ส่วนโค้งบน ซ้อนสามขนาดจากเล็กไปใหญ่ ก่อนปิดท้ายด้วยจุดกลม — เทคนิค CSS ล้วนมาตรฐาน
 */
function WifiGlyph({ s }: { s: number }) {
  return (
    <div style={{ position: 'relative', width: 15 * s, height: 11 * s }}>
      {[5, 9, 13].map((diameter, index) => (
        <div
          key={index}
          style={{
            position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)',
            width: diameter * s, height: diameter * s, borderRadius: '50%',
            border: `${1.6 * s}px solid ${STATUS_BAR_COLOR}`,
            clipPath: 'inset(0 0 50% 0)',
            boxSizing: 'border-box',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)',
          width: 2.4 * s, height: 2.4 * s, borderRadius: '50%', background: STATUS_BAR_COLOR,
        }}
      />
    </div>
  )
}

/** กรอบสี่เหลี่ยมมน + แท่งไฟฟ้าเติมด้านใน + ปุ่มขั้วเล็ก ๆ ด้านขวา */
function BatteryGlyph({ s }: { s: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1.5 * s }}>
      <div
        style={{
          position: 'relative', width: 22 * s, height: 11 * s, boxSizing: 'border-box',
          border: `${1.3 * s}px solid ${STATUS_BAR_COLOR}`, borderRadius: 3 * s, padding: 1.5 * s,
        }}
      >
        <div style={{ width: '80%', height: '100%', background: STATUS_BAR_COLOR, borderRadius: s }} />
      </div>
      <div
        style={{
          width: 1.5 * s, height: 4 * s, background: STATUS_BAR_COLOR,
          borderRadius: `0 ${s}px ${s}px 0`,
        }}
      />
    </div>
  )
}

/** ตัวชี้กลับ (`<`) — สี่เหลี่ยมที่ตัดขอบเหลือสองด้าน หมุน 45 องศา สำนวน CSS มาตรฐานของ chevron */
function BackChevron({ s }: { s: number }) {
  return (
    <span
      style={{
        display: 'inline-block', width: 8 * s, height: 8 * s,
        borderLeft: `${2 * s}px solid #060606`, borderBottom: `${2 * s}px solid #060606`,
        transform: 'rotate(45deg)',
      }}
    />
  )
}

/**
 * กรอบโทรศัพท์จำลอง — เมนูอยู่ครึ่งล่างและแถบแชทสะท้อน label ที่พิมพ์ทันที (สเปก §5.7)
 *
 * วาดเป็นกรอบ iPhone จริง ๆ (ตามที่เจ้าของขอ) ด้วย CSS ล้วน ไม่มีไฟล์รูป/SVG และไม่มีของ
 * Apple/LINE ปนอยู่เลย — ตัว signal/wifi/battery/chevron ข้างบนเป็นรูปทรงที่วาดเอง ไม่ใช่ไอคอน
 * ที่ก็อปมา และไม่มีโลโก้ LINE ที่ไหนในนี้ทั้งสิ้น (แพ็กเกจนี้ ship ใต้ AGPL ในโอเพนซอร์สสาธารณะ
 * การใส่เครื่องหมายการค้าของคนอื่นเข้าไปเป็นปัญหาด้านสัญญาอนุญาต ไม่ใช่แค่เรื่องรสนิยม)
 *
 * เวลาบนแถบสถานะเป็นค่าคงที่ (`9:41`) ไม่ใช่นาฬิกาจริง — นาฬิกาจริงจะทำให้ component นี้ render
 * ไม่เหมือนเดิมทุกครั้งที่รัน ทั้งเทสต์ snapshot และภาพหน้าจอที่ถ่ายซ้ำจะไม่เสถียรโดยไม่มีประโยชน์อะไร
 *
 * กับดักเรื่องความสูง: โทรศัพท์จริงมีสัดส่วนราว 19.5:9 — ถ้ายืดทั้งกรอบตามสัดส่วนนั้นที่ width={480}
 * (ที่ RichMenuEditor ส่งมา) จะได้กรอบสูงเกิน 1000px ซึ่งกลืนทั้งหน้าและทำให้คอลัมน์ Template/
 * Image/Actions ข้าง ๆ ไปกองอยู่ใต้กำแพงโทรศัพท์ ทางแก้ที่นี่ไม่ใช่ย่อกรอบทั้งอันลง (โทรศัพท์สูง
 * 320px ที่กว้าง 480px ไม่ใช่โทรศัพท์) แต่บีบเฉพาะ "วอลเปเปอร์แชท" ตรงกลางให้เป็นความสูงคงที่
 * พอสำหรับสองข้อความ ส่วนหัว (bezel/island/status bar/chat header) กับท้าย (เมนู/แถบแชท/
 * home indicator) ยังเต็มขนาดตามจริง — กรอบอ่านเป็นโทรศัพท์ได้เพราะปลายทั้งสองด้านถูกต้อง
 * ซึ่งเป็นวิธีเดียวกับที่ device mockup ในเครื่องมือออกแบบทุกตัวทำ
 */
export function Preview({
  size, bounds, imageUrl, chatBarText, expanded,
  activeIndex, onSelect, showOutlines, errors, width = 320,
  onBoundsChange, snap,
}: PreviewProps) {
  const { t } = usePort()
  const s = width / REFERENCE_WIDTH

  return (
    <div
      style={{
        width,
        boxSizing: 'border-box',
        padding: 12 * s,
        borderRadius: 46 * s,
        background: '#111114',
        boxShadow: `0 ${Math.round(18 * s)}px ${Math.round(36 * s)}px rgba(15, 15, 20, 0.35)`,
      }}
    >
      <div style={{ position: 'relative', borderRadius: 38 * s, overflow: 'hidden', background: '#fff' }}>
        {/* Dynamic Island — เม็ดยาวสีดำกลางบนจอ ไม่ใช่ status bar เอง แค่ลอยทับอยู่ */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 6 * s, left: '50%', transform: 'translateX(-50%)',
            width: 120 * s, height: 34 * s, borderRadius: 17 * s, background: '#000', zIndex: 5,
          }}
        />

        {/* แถบสถานะ — เวลาซ้าย สัญญาณ/wifi/แบตขวา แหวกที่ว่างตรงกลางให้ island ลอยทับ */}
        <div
          aria-hidden
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            height: 44 * s, padding: `0 ${22 * s}px`,
            background: '#fff', color: '#060606',
            fontSize: 13 * s, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>9:41</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 * s }}>
            <SignalGlyph s={s} />
            <WifiGlyph s={s} />
            <BatteryGlyph s={s} />
          </div>
        </div>

        {/* หัวแชทสไตล์ LINE — ปุ่มย้อนกลับ, อวาตาร์วงกลม, ชื่อบัญชี */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10 * s,
            padding: `${10 * s}px ${16 * s}px`,
            borderBottom: '1px solid #ececec',
          }}
        >
          <BackChevron s={s} />
          <div
            aria-hidden
            style={{ width: 26 * s, height: 26 * s, borderRadius: '50%', background: '#c8ccd4', flexShrink: 0 }}
          />
          <span style={{ fontSize: 14 * s, fontWeight: 700, color: '#060606' }}>{t('preview.accountName')}</span>
        </div>

        {/*
          วอลเปเปอร์แชท — #8ba7d0 คือสีวอลเปเปอร์แชทของ LINE เอง ไม่ใช่ token ของ design system
          (จึงจงใจไม่ผ่าน ui.* เหมือนที่เหลือของไฟล์นี้ทั้งหมด — ดูคอมเมนต์ที่หัว component)
          ความสูงคงที่ (ไม่ผูกกับ s มากนัก) ตามเหตุผลเรื่อง "กับดักความสูง" ด้านบน — พอสำหรับ
          สองข้อความเสมอ ไม่ใช่พื้นที่ที่ยืดตามความสูงจริงของอุปกรณ์
        */}
        <div style={{ background: '#8ba7d0', height: 132 * s, padding: 12 * s, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 * s }}>
            {/* บับเบิลขาเข้า — มีหางเล็ก ๆ ชี้ลงซ้ายล่าง ตามรูปทรงบับเบิลแชทมาตรฐาน */}
            <div style={{ display: 'flex' }}>
              <span
                style={{
                  position: 'relative', background: '#fff', color: '#060606',
                  borderRadius: 14 * s, padding: `${6 * s}px ${10 * s}px`,
                  fontSize: 13 * s, maxWidth: '70%',
                }}
              >
                {t('preview.greeting')}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', left: -4 * s, bottom: 2 * s,
                    width: 0, height: 0,
                    borderTop: `${6 * s}px solid transparent`,
                    borderRight: `${7 * s}px solid #fff`,
                  }}
                />
              </span>
            </div>
            {/* บับเบิลขาออก — เขียว LINE ชิดขวา ให้อ่านเป็นบทสนทนาจริงแทนข้อความลอยเดียว */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span
                style={{
                  position: 'relative', background: '#06c755', color: '#fff',
                  borderRadius: 14 * s, padding: `${6 * s}px ${10 * s}px`,
                  fontSize: 13 * s, maxWidth: '70%',
                }}
              >
                {t('preview.reply')}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', right: -4 * s, bottom: 2 * s,
                    width: 0, height: 0,
                    borderTop: `${6 * s}px solid transparent`,
                    borderLeft: `${7 * s}px solid #06c755`,
                  }}
                />
              </span>
            </div>
          </div>
        </div>

        {expanded ? (
          // canvas ตัวนี้คือ **ตัวควบคุมจริง** ไม่ใช่ภาพประกอบ — ผัง §5.7 วาดช่อง A/B/C ไว้ในกรอบโทรศัพท์
          // นี้ช่องเดียว พร้อมสวิตช์ "Show template outlines" อยู่ใต้กรอบ ไม่ได้มี canvas แยกอีกตัวข้างๆ
          // เคยมีสองตัวอยู่ช่วงหนึ่ง (ตัวแก้ไขได้ตัวหนึ่ง กับตัวในนี้อีกตัว) ซึ่งทำให้ทุกช่องโผล่ซ้ำสองชุด
          // ใน accessibility tree จึงเคยต้องปิดชุดนี้ด้วย aria-hidden — ห้ามใส่กลับ ตอนนี้มีชุดเดียวและ
          // เป็นของจริง ถ้าซ่อนจะเท่ากับเอา editor ออกจากมือคนใช้ screen reader ทั้งหมด (ยังคงเป็นจริง
          // หลังปรับหน้าตาเป็นกรอบ iPhone: บับเบิล/status bar/หัวแชทรอบข้างเป็นแค่ sibling ไม่ใช่บรรพบุรุษ
          // ของ div นี้ จึงไม่มีทาง aria-hidden ทับลงมาจากข้างบนโดยไม่ได้ตั้งใจ)
          <div data-testid="preview-menu">
            <CanvasEditor
              size={size}
              bounds={bounds}
              showOutlines={showOutlines ?? imageUrl === undefined}
              activeIndex={activeIndex ?? null}
              onSelect={onSelect ?? (() => {})}
              {...(errors === undefined ? {} : { errors })}
              {...(imageUrl === undefined ? {} : { imageUrl })}
              {...(onBoundsChange === undefined ? {} : { onBoundsChange })}
              {...(snap === undefined ? {} : { snap })}
            />
          </div>
        ) : null}

        {/* แถบแชทสไตล์ LINE — ปุ่มเปิดเมนูซ้าย, ป้าย label ตรงกลางในเม็ดมน, ไอคอนขวา */}
        <div
          data-testid="preview-chat-bar"
          style={{
            display: 'flex', alignItems: 'center', gap: 10 * s,
            borderTop: '1px solid #ececec', padding: `${8 * s}px ${14 * s}px`,
          }}
        >
          <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 3 * s, flexShrink: 0 }}>
            {[0, 1, 2].map((row) => (
              <div key={row} style={{ width: 16 * s, height: 2 * s, borderRadius: s, background: '#8e8e93' }} />
            ))}
          </div>
          <div
            style={{
              flex: 1, background: '#f2f2f3', borderRadius: 16 * s,
              padding: `${6 * s}px ${12 * s}px`, fontSize: 13 * s, color: '#060606',
            }}
          >
            {chatBarText === '' ? t('chatBar.defaultLabel') : chatBarText} ▾
          </div>
          <div
            aria-hidden
            style={{
              width: 18 * s, height: 18 * s, borderRadius: '50%', flexShrink: 0,
              border: `${1.6 * s}px solid #8e8e93`, boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Home indicator — แถบมนสั้น ๆ กึ่งกลางล่างสุด */}
        <div aria-hidden style={{ display: 'flex', justifyContent: 'center', padding: `${8 * s}px 0` }}>
          <div style={{ width: 120 * s, height: 4 * s, borderRadius: 2 * s, background: '#060606', opacity: 0.35 }} />
        </div>
      </div>
    </div>
  )
}
