import { useMemo, useState } from 'react'
import {
  ENDPOINTS, MESSAGES, PortProvider, RichMenuEditor, createStubPort,
  type RichMenuDraft, type UIPort,
} from '@fosivo/line-rich-menu-ui'

function makePort(locale: 'en' | 'th', log: (line: string) => void): UIPort {
  const table = MESSAGES[locale]
  return createStubPort({
    t: (key, values) => {
      const template = table[key]
      if (template === undefined) return `⟨${key}⟩`
      if (values === undefined) return template
      // ต้อง .replaceAll(...) ไม่ใช่ .replace(...) — ข้อความในแคตตาล็อกจริงบางอันใช้ placeholder
      // เดิมซ้ำมากกว่าหนึ่งจุด ถ้าแทนแค่จุดแรก จุดที่เหลือจะโผล่เป็น literal `{name}` บนจอที่คนกำลังดูอยู่
      // (นี่คือบั๊กเดียวกับที่แก้ไว้แล้วใน stub-port.tsx:104 คอมเมนต์เหนือ defaultT อธิบายไว้)
      return Object.entries(values).reduce(
        (out, [k, v]) => out.replaceAll(`{${k}}`, String(v)),
        template,
      )
    },
    toast: (message) => log(`${message.type}: ${message.message}`),
    http: {
      get: async () => [] as never,
      // จำลองการอัปโหลดให้สำเร็จ เพื่อให้เดินฟอร์มได้จนจบโดยไม่ต้องมีเซิร์ฟเวอร์
      post: async (url) =>
        (url === ENDPOINTS.upload
          ? [{ id: 1, url: 'https://placehold.co/2500x1686/png', width: 2500, height: 1686 }]
          : {}) as never,
      put: async () => ({}) as never,
      del: async () => ({}) as never,
    },
  })
}

export function App() {
  const [locale, setLocale] = useState<'en' | 'th'>('en')
  const [lines, setLines] = useState<string[]>([])
  const [saved, setSaved] = useState<RichMenuDraft | null>(null)

  // ต้อง memo ไว้ — หน้าที่มี useEffect ผูกกับ port.http จะ fetch วนไม่รู้จบถ้า port
  // เป็น object ใหม่ทุกรอบ render
  const port = useMemo(
    () => makePort(locale, (line) => setLines((prev) => [line, ...prev].slice(0, 8))),
    [locale],
  )

  return (
    <PortProvider value={port}>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem',
                     font: '15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', margin: 0 }}>UI playground</h1>
            <p style={{ color: '#666687', margin: '.25rem 0 0' }}>
              รันด้วย stub port ตัวเดียวกับที่เทสต์ใช้ — คีย์ที่ยังไม่มีคำแปลจะขึ้นเป็น ⟨key⟩
            </p>
          </div>
          <select value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'th')}>
            <option value="en">English</option>
            <option value="th">ไทย</option>
          </select>
        </header>

        <RichMenuEditor
          aliasOptions={['tab-a', 'tab-b']}
          onSave={async (draft, publish) => {
            setSaved(draft)
            setLines((prev) => [`save publish=${publish}`, ...prev].slice(0, 8))
          }}
          onCancel={() => setLines((prev) => ['cancel', ...prev].slice(0, 8))}
        />

        <section style={{ marginTop: '2rem', borderTop: '1px solid #dcdce4', paddingTop: '1rem' }}>
          <h2 style={{ fontSize: '.9rem', color: '#666687' }}>events</h2>
          <ul>{lines.map((line, i) => <li key={i}><code>{line}</code></li>)}</ul>
          {saved === null ? null : (
            <details>
              <summary>draft ล่าสุด</summary>
              <pre style={{ overflowX: 'auto' }}>{JSON.stringify(saved, null, 2)}</pre>
            </details>
          )}
        </section>
      </main>
    </PortProvider>
  )
}
