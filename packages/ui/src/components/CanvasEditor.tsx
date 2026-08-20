import { useEffect, type CSSProperties, type KeyboardEvent } from 'react'
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
}

/** แปลงพิกเซลจริงเป็นเปอร์เซ็นต์ เพื่อให้ overlay ตรงกับรูปไม่ว่าจะย่อขยายแค่ไหน */
function pct(value: number, total: number): string {
  return `${Math.round((value / total) * 10000) / 100}%`
}

export function CanvasEditor({
  size, bounds, imageUrl, showOutlines, activeIndex, onSelect, errors,
}: CanvasEditorProps) {
  useEffect(injectStylesOnce, [])

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
    <div data-testid="rich-menu-canvas" style={canvasStyle}>
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
          >
            {showOutlines ? (
              <>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#32324d' }}>{label}</span>
                <span style={{ fontSize: '0.7rem', color: '#666687', fontVariantNumeric: 'tabular-nums' }}>
                  {b.width}×{b.height}
                </span>
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
