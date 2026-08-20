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
 * บังคับให้เป็นจำนวนเต็มก่อนแปะเข้า markup ตรง ๆ
 *
 * `Bounds`/`RichMenuSize` ประกาศฟิลด์เป็น `number` แต่นั่นเป็นสัญญาระดับ TypeScript เท่านั้น —
 * ที่ขอบ JavaScript จริง (adapter ที่ parse JSON จาก DB แล้วส่งเข้าฟังก์ชันนี้ตรง ๆ) ไม่มีอะไรบังคับ
 * และ `renderTemplateSvg` เป็น public API ที่ผลลัพธ์ถูกออกแบบมาให้ inject เข้าไปในหน้าเว็บได้เลย
 * (ดู tools/preview/src/page.ts) ค่าที่ไม่ใช่ตัวเลขจริงต้องกลายเป็น fallback ก่อนแปะ
 * ไม่ใช่หลุดเป็นสตริงดิบเข้าไปใน attribute ของ SVG
 */
function safeInt(value: number, fallback = 0): number {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? n : fallback
}

/**
 * วาด thumbnail จากพิกัดโดยตรง แทนการแนบไฟล์ภาพมากับแพ็กเกจ
 * ผลพลอยได้คือ layout ที่ผู้ใช้สร้างเองก็มี thumbnail ทันทีด้วยโค้ดเดียวกัน
 */
export function renderTemplateSvg(bounds: readonly Bounds[], size: RichMenuSize): string {
  const canvasWidth = safeInt(size.width)
  const canvasHeight = safeInt(size.height)
  const fontSize = Math.round(Math.min(canvasWidth, canvasHeight) * 0.18)
  const cells = bounds
    .map((raw, i) => {
      const b = {
        x: safeInt(raw.x), y: safeInt(raw.y), width: safeInt(raw.width), height: safeInt(raw.height),
      }
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      return [
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="rgba(0,0,0,0.06)" stroke="currentColor" stroke-width="6" />`,
        `<text x="${cx}" y="${cy}" font-size="${fontSize}" font-family="sans-serif" font-weight="700" fill="currentColor" text-anchor="middle" dominant-baseline="central">${areaLabel(i)}</text>`,
      ].join('')
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" role="img">${cells}</svg>`
}
