import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { areaLabel, type Bounds, type RichMenuSize } from '@fosivo/line-rich-menu-core/browser'
import { ACTIVE_FILL, INVALID_COLOR, OUTLINE_COLOR, injectStylesOnce } from '../styles.js'

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

export function CanvasEditor({
  size, bounds, imageUrl, showOutlines, activeIndex, onSelect, onBoundsChange, errors, snap,
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
    backgroundColor: '#eaeaef',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    ...(imageUrl === undefined ? {} : { backgroundImage: `url(${imageUrl})` }),
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
          ...(showOutlines
            ? { border: `2px solid ${error === undefined ? OUTLINE_COLOR : INVALID_COLOR}` }
            : {}),
          ...(isActive ? { background: ACTIVE_FILL } : {}),
          ...(editable ? { touchAction: 'none' as const } : {}),
        }

        return (
          <div
            key={`${b.x}-${b.y}-${b.width}-${b.height}`}
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
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#32324d' }}>{label}</span>
                <span style={{ fontSize: '0.7rem', color: '#666687', fontVariantNumeric: 'tabular-nums' }}>
                  {b.width}×{b.height}
                </span>
              </>
            ) : null}
            {editable ? (
              <span
                className="frm-handle"
                data-testid={`resize-handle-${index}`}
                onPointerDown={beginDrag(index, 'resize')}
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: 14,
                  height: 14,
                  background: OUTLINE_COLOR,
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
