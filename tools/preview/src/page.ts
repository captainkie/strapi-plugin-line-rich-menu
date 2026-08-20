import { TEMPLATES, renderTemplateSvg, type TemplateDef } from '@fosivo/line-rich-menu-core'

const CUSTOM = {
  size: { width: 2500, height: 1686 },
  bounds: [
    { x: 0, y: 0, width: 2500, height: 500 },
    { x: 0, y: 500, width: 900, height: 1186 },
    { x: 900, y: 500, width: 800, height: 1186 },
    { x: 1700, y: 500, width: 800, height: 1186 },
  ],
}

function card(title: string, subtitle: string, svg: string): string {
  return `<figure class="card">
  <div class="canvas">${svg}</div>
  <figcaption><strong>${title}</strong><span>${subtitle}</span></figcaption>
</figure>`
}

function section(heading: string, items: TemplateDef[]): string {
  const cards = items
    .map((t) => card(t.key, `${t.size.width}x${t.size.height} - ${t.bounds.length} areas`, renderTemplateSvg(t.bounds, t.size)))
    .join('\n')
  return `<section><h2>${heading}</h2><div class="grid">${cards}</div></section>`
}

export function renderPage(): string {
  const all = Object.values(TEMPLATES)
  const large = all.filter((t) => t.sizeName === 'large')
  const compact = all.filter((t) => t.sizeName === 'compact')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LINE rich menu templates</title>
<style>
  :root { color-scheme: light dark; --bg: #fbfbfd; --fg: #16161a; --muted: #6b6b76; --line: #d5d5de; --card: #ffffff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #131316; --fg: #ececf1; --muted: #9a9aa6; --line: #35353f; --card: #1c1c21; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2.5rem 1.5rem 4rem; background: var(--bg); color: var(--fg);
         font: 15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  p.lede { color: var(--muted); margin: 0 0 2.5rem; }
  h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
       margin: 2.5rem 0 1rem; }
  .grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
  .card { margin: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--card); }
  .canvas { color: #10b981; background: repeating-conic-gradient(var(--line) 0% 25%, transparent 0% 50%) 50%/16px 16px; }
  .canvas svg { display: block; width: 100%; height: auto; }
  figcaption { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline;
               padding: .7rem .9rem; border-top: 1px solid var(--line); font-size: .82rem; }
  figcaption span { color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<main>
  <h1>LINE rich menu templates</h1>
  <p class="lede">Thumbnails are SVG rendered from the bounds data in <code>@fosivo/line-rich-menu-core</code>. No bundled images.</p>
  ${section('Large - 2500x1686', large)}
  ${section('Compact - 2500x843', compact)}
  <section><h2>Custom layout</h2><div class="grid">
    ${card('Custom layout', `${CUSTOM.size.width}x${CUSTOM.size.height} - ${CUSTOM.bounds.length} areas`, renderTemplateSvg(CUSTOM.bounds, CUSTOM.size))}
  </div></section>
</main>
</body>
</html>`
}
