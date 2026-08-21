import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { areaLabel, type Bounds, type RichMenuSize } from '@fosivo/line-rich-menu-core/browser'
import type { ThemeColors } from '../port.js'
import { INVALID_COLOR, LINE_ACTIVE_FILL, LINE_GREEN, injectStylesOnce } from '../styles.js'

/**
 * ค่าเริ่มต้นตรงกับธีมสว่างของ Strapi เป๊ะ (ดูคอมเมนต์ที่ `ThemeColors` ใน port.ts) — ใช้เมื่อผู้เรียก
 * ไม่ส่ง `theme` มา เพื่อให้จุดเรียกเดิม (และเทสต์ที่ render CanvasEditor ตรง ๆ โดยไม่มี PortProvider
 * ครอบ — ดูเทสต์ "ไม่แตะ UIPort เลย" ใน canvas-editor.test.tsx) ได้ผลลัพธ์เหมือนเดิมทุกประการ
 */
const DEFAULT_THEME: Pick<ThemeColors, 'surface' | 'strongText' | 'mutedText'> = {
  surface: '#eaeaef',
  strongText: '#32324d',
  mutedText: '#666687',
}

export interface CanvasEditorProps {
  size: RichMenuSize
  bounds: readonly Bounds[]
  imageUrl?: string
  showOutlines: boolean
  activeIndex: number | null
  onSelect(index: number): void
  onBoundsChange?(index: number, next: Bounds): void
  errors?: Readonly<Record<number, string>>
  /** ขนาดช่องกริดในหน่วยพิกเซลของผืนผ้าใบ ไม่ใช่พิกเซลบนจอ */
  snap?: number
  /**
   * สีพื้นหลัง placeholder ก่อนมีรูป / ป้ายช่อง / ขนาดพิกเซล — ต้องตามธีมมืด/สว่างของ Strapi จริง
   * (สเปกงานนี้ #5) CanvasEditor เองจงใจไม่แตะ `usePort` เลย (component ตัวนี้ต้อง render ได้โดยไม่มี
   * `PortProvider` ครอบ — ดูคอมเมนต์ที่หัวไฟล์เรื่องเหตุผลที่ไม่ผ่าน `ui.*`) ผู้เรียกที่มี port จริง
   * (`Preview`) จึงเป็นคนดึงจาก `usePort().theme` แล้วส่งลงมาให้แทน — ไม่ส่งมา = ใช้ค่าธีมสว่าง
   */
  theme?: Pick<ThemeColors, 'surface' | 'strongText' | 'mutedText'>
}

/** แปลงพิกเซลจริงเป็นเปอร์เซ็นต์ เพื่อให้ overlay ตรงกับรูปไม่ว่าจะย่อขยายแค่ไหน */
function pct(value: number, total: number): string {
  return `${Math.round((value / total) * 10000) / 100}%`
}

type DragMode = 'move' | 'resize'

interface DragState {
  index: number
  mode: DragMode
  startX: number
  startY: number
  origin: Bounds
}

function clampToCanvas(next: Bounds, size: RichMenuSize, min: number): Bounds {
  const width = Math.max(min, Math.min(next.width, size.width))
  const height = Math.max(min, Math.min(next.height, size.height))
  return {
    width,
    height,
    x: Math.max(0, Math.min(next.x, size.width - width)),
    y: Math.max(0, Math.min(next.y, size.height - height)),
  }
}

function snapTo(value: number, grid: number): number {
  return grid <= 1 ? Math.round(value) : Math.round(value / grid) * grid
}

/**
 * `url("...")` แบบมี quote คือรูปที่ escape ได้จริง — CSS ยอมให้ใส่ `\"` ข้างใน string ได้
 * ส่วนรูปไม่มี quote (`url(x)`) ไม่มีทาง escape เลย ตัวอักษรอย่าง `")` จึงปิด token ทิ้ง
 * แล้วสิ่งที่ตามมาถูกอ่านเป็น CSS ต่อ วันนี้ค่านี้มาจากเซิร์ฟเวอร์จึงเป็นการป้องกันเชิงลึก
 * แต่ url ที่ผู้ใช้ได้รับมาจาก upload provider ที่เขาเลือกเอง ไม่ใช่จากเรา
 */
const cssUrl = (value: string): string =>
  `url("${value.replace(/[\\"]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}")`

export function CanvasEditor({
  size, bounds, imageUrl, showOutlines, activeIndex, onSelect, onBoundsChange, errors, snap,
  theme = DEFAULT_THEME,
}: CanvasEditorProps) {
  useEffect(injectStylesOnce, [])

  const [drag, setDrag] = useState<DragState | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const grid = snap ?? 10
  const editable = onBoundsChange !== undefined

  /** สัดส่วนระหว่างหน่วยของผืนผ้าใบกับพิกเซลบนจอ — ต้องอ่านตอนลากจริง เพราะกล่องยืดตามหน้าจอ */
  const unitsPerPixel = (): number => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect === undefined || rect.width === 0) return 1
    return size.width / rect.width
  }

  const beginDrag = (index: number, mode: DragMode) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!editable) return
    event.stopPropagation()
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    setDrag({ index, mode, startX: event.clientX, startY: event.clientY, origin: bounds[index]! })
  }

  const continueDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag === null || onBoundsChange === undefined) return
    const scale = unitsPerPixel()
    const dx = (event.clientX - drag.startX) * scale
    const dy = (event.clientY - drag.startY) * scale
    const o = drag.origin
    const raw: Bounds = drag.mode === 'move'
      ? { ...o, x: snapTo(o.x + dx, grid), y: snapTo(o.y + dy, grid) }
      : { ...o, width: snapTo(o.width + dx, grid), height: snapTo(o.height + dy, grid) }
    onBoundsChange(drag.index, clampToCanvas(raw, size, grid))
  }

  const endDrag = () => setDrag(null)

  const canvasStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: `${size.width} / ${size.height}`,
    // สีพื้นหลังตอนยังไม่มีรูป (placeholder ระหว่างแก้ผัง) เป็น chrome ของเราเอง ไม่ใช่สิ่งที่ผู้ใช้
    // ปลายทางของ LINE เห็นจริง (เขาเห็นได้แค่เมนูที่เผยแพร่แล้ว ซึ่งมีรูปเสมอ) จึงต้องตามธีมของ
    // Strapi เหมือน chrome อื่นทั้งหมด ไม่ใช่ข้อยกเว้นแบบวอลเปเปอร์/บับเบิลของ Preview — เดิม
    // hardcode เป็น #eaeaef (ตรงกับ colors.neutral150 ของธีมสว่างเป๊ะ) พอ Strapi อยู่ธีมมืดเลยเป็น
    // พื้นเทาสว่างแปลกตาอยู่กลางหน้าเข้ม (สเปกงานนี้ #5)
    backgroundColor: theme.surface,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    ...(imageUrl === undefined ? {} : { backgroundImage: cssUrl(imageUrl) }),
  }

  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    // การพิมพ์ใน input ที่ซ้อนอยู่ต้องไม่ถูกดักไปเลือกช่อง
    const target = event.target as HTMLElement
    if (target !== event.currentTarget) return
    event.preventDefault()
    onSelect(index)
  }

  return (
    <div
      ref={canvasRef}
      data-testid="rich-menu-canvas"
      style={canvasStyle}
      onPointerMove={continueDrag}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {bounds.map((b, index) => {
        const error = errors?.[index]
        const label = areaLabel(index)
        const isActive = activeIndex === index
        const style: CSSProperties = {
          position: 'absolute',
          left: pct(b.x, size.width),
          top: pct(b.y, size.height),
          width: pct(b.width, size.width),
          height: pct(b.height, size.height),
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          // ช่องทับกันได้ (LINE อนุญาตและ schema ก็ยอมรับ) — ช่อง active ต้องอยู่บนสุดเสมอ
          // ไม่งั้นช่องที่วาดทีหลังใน DOM จะทับมือจับของช่องก่อนหน้าจนกดไม่ได้
          zIndex: isActive ? 1 : 0,
          // เขียว LINE ไม่ใช่สี Strapi — พื้นที่แก้ผังนี้ฝังอยู่ในกรอบโทรศัพท์ของ Preview เสมอ (จุดเดียว
          // ที่เรียก CanvasEditor ในทั้งแพ็กเกจ) จึงนับเป็นส่วนหนึ่งของ "จอ LINE" ไม่ใช่ chrome ของเรา
          // (สเปกงานนี้ #1 — ดูคอมเมนต์ที่ LINE_GREEN ใน styles.ts) error ยังคงเป็นสีแดงเดิม ไม่เกี่ยว
          ...(showOutlines
            ? { border: `2px solid ${error === undefined ? LINE_GREEN : INVALID_COLOR}` }
            : {}),
          ...(isActive ? { background: LINE_ACTIVE_FILL } : {}),
          ...(editable ? { touchAction: 'none' as const } : {}),
        }

        return (
          <div
            // ใช้ index เป็น key ไม่ใช่ bounds — bounds ชนกันได้ (ช่องทับกันที่ LINE อนุญาต) ทำให้
            // key ซ้ำ และ bounds เปลี่ยนทุกพิกเซลตอนลาก ทำให้ subtree remount ทุกครั้งถ้า parent
            // ควบคุม bounds แบบ controlled — ลิสต์นี้เป็นลำดับตำแหน่งตายตัว ช่อง A คือช่อง A เสมอ
            // ไม่ว่าพิกัดจะเปลี่ยนไปแค่ไหน identity จึงเท่ากับตำแหน่ง ใช้ index ถูกแล้ว
            key={index}
            className="frm-area"
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            aria-label={error === undefined ? label : `${label} — ${error}`}
            data-invalid={error === undefined ? undefined : 'true'}
            style={style}
            onClick={() => onSelect(index)}
            onKeyDown={handleKeyDown(index)}
            onPointerDown={beginDrag(index, 'move')}
          >
            {showOutlines ? (
              // ป้ายช่อง (A, B, …) กับขนาดพิกเซล เป็น chrome ของเราเองที่ผู้ใช้ปลายทางของ LINE ไม่เห็น
              // เลย (เหมือนพื้นหลัง placeholder ด้านบน) — ต้องอ่านออกได้ทั้งสองธีม เดิม hardcode
              // #32324d/#666687 (ตรงกับ colors.neutral800/600 ของธีมสว่างเป๊ะ) ซึ่งเป็นตัวอักษรเกือบ
              // ดำบนพื้นเข้มพอสลับธีมมืด — นี่คือบักที่เจ้าของรายงานไว้ตรง ๆ ("ป้ายช่องอ่านแทบไม่ออก")
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: theme.strongText }}>{label}</span>
                <span style={{ fontSize: '0.7rem', color: theme.mutedText, fontVariantNumeric: 'tabular-nums' }}>
                  {b.width}×{b.height}
                </span>
              </>
            ) : null}
            {editable ? (
              <span
                className="frm-handle"
                data-testid={`resize-handle-${index}`}
                onPointerDown={beginDrag(index, 'resize')}
                // pointerdown's stopPropagation() only stops the pointer sequence — a real browser still
                // synthesises a click after a quick tap on the handle, and that click bubbles to the
                // area's role="button" and fires onSelect. Stop it here too.
                //
                // This guard only works because the handle is a DOM descendant of the area's
                // role="button" — stopPropagation() blocks bubbling up through *this* subtree only.
                // Lifting handles out into a sibling or a separate overlay layer (e.g. to dodge the
                // z-index/overlap issue above) breaks this silently, with no test failing to say so.
                // If handles ever need to live outside the area, this guard has to move with them.
                onClick={(event) => event.stopPropagation()}
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: 14,
                  height: 14,
                  background: LINE_GREEN,
                  cursor: 'nwse-resize',
                  touchAction: 'none',
                }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
