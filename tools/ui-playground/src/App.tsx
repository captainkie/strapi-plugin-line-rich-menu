import { useState } from 'react'
import { TEMPLATES, areaLabel, type Bounds } from '@fosivo/line-rich-menu-core/browser'
import { CanvasEditor, PortProvider, createStubPort } from '@fosivo/line-rich-menu-ui'

const port = createStubPort()
const keys = Object.keys(TEMPLATES).sort()

export function App() {
  const [key, setKey] = useState(keys[0]!)
  const [outlines, setOutlines] = useState(true)
  const [editable, setEditable] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const [bounds, setBounds] = useState<Bounds[]>([...TEMPLATES[keys[0]!]!.bounds])

  const template = TEMPLATES[key]!

  const pick = (next: string) => {
    setKey(next)
    setBounds([...TEMPLATES[next]!.bounds])
    setActive(null)
  }

  return (
    <PortProvider value={port}>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem',
                     font: '15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", sans-serif' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>UI playground</h1>
        <p style={{ color: '#666687', marginTop: '.25rem' }}>
          รันด้วย stub port ตัวเดียวกับที่เทสต์ใช้ — ถ้าหน้านี้ทำงานได้ แปลว่า component ไม่ได้พึ่ง Strapi
        </p>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '1.5rem 0' }}>
          <select value={key} onChange={(e) => pick(e.target.value)}>
            {keys.map((k) => (
              <option key={k} value={k}>{k} — {TEMPLATES[k]!.bounds.length} areas</option>
            ))}
          </select>
          <label><input type="checkbox" checked={outlines} onChange={(e) => setOutlines(e.target.checked)} /> outlines</label>
          <label><input type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)} /> แก้ไขได้</label>
          <span style={{ color: '#666687' }}>
            {active === null ? 'ยังไม่ได้เลือกช่อง' : `เลือกช่อง ${areaLabel(active)}`}
          </span>
        </div>

        <CanvasEditor
          size={template.size}
          bounds={bounds}
          showOutlines={outlines}
          activeIndex={active}
          onSelect={setActive}
          {...(editable
            ? { onBoundsChange: (i: number, next: Bounds) =>
                  setBounds((prev) => prev.map((b, j) => (j === i ? next : b))) }
            : {})}
        />
      </main>
    </PortProvider>
  )
}
