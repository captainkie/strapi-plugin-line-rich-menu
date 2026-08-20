import type { Bounds, RichMenuSize } from './types.js'

export function areaLabel(index: number): string {
  let label = ''
  let n = index
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/**
 * วาด thumbnail จากพิกัดโดยตรง แทนการแนบไฟล์ภาพมากับแพ็กเกจ
 * ผลพลอยได้คือ layout ที่ผู้ใช้สร้างเองก็มี thumbnail ทันทีด้วยโค้ดเดียวกัน
 */
export function renderTemplateSvg(bounds: readonly Bounds[], size: RichMenuSize): string {
  const fontSize = Math.round(Math.min(size.width, size.height) * 0.18)
  const cells = bounds
    .map((b, i) => {
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      return [
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="rgba(0,0,0,0.06)" stroke="currentColor" stroke-width="6" />`,
        `<text x="${cx}" y="${cy}" font-size="${fontSize}" font-family="sans-serif" font-weight="700" fill="currentColor" text-anchor="middle" dominant-baseline="central">${areaLabel(i)}</text>`,
      ].join('')
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" role="img">${cells}</svg>`
}
