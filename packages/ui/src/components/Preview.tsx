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

  return (
    <div style={{ width: 320, border: '1px solid #dcdce4', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: '#8ba7d0', height: 180, padding: '.75rem' }}>
        <span style={{ background: '#fff', borderRadius: 12, padding: '.3rem .6rem', fontSize: '.8rem' }}>
          {t('preview.greeting')}
        </span>
      </div>
      {expanded ? (
        <div data-testid="preview-menu">
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
