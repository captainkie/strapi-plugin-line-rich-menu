import type { Bounds, RichMenuSize, RichMenuSizeName } from './types.js'

export interface TemplateDef {
  key: string
  sizeName: RichMenuSizeName
  size: RichMenuSize
  bounds: Bounds[]
}

export const LARGE: RichMenuSize = { width: 2500, height: 1686 }
export const COMPACT: RichMenuSize = { width: 2500, height: 843 }

/** ไล่จากใหญ่ไปเล็ก — ลดขนาดก็ต่อเมื่อบีบ quality จนสุดแล้วยังเกิน 1 MB */
export const SIZE_LADDER: Record<RichMenuSizeName, RichMenuSize[]> = {
  large: [
    { width: 2500, height: 1686 },
    { width: 1200, height: 810 },
    { width: 800, height: 540 },
  ],
  compact: [
    { width: 2500, height: 843 },
    { width: 1200, height: 405 },
    { width: 800, height: 270 },
  ],
}

const b = (x: number, y: number, width: number, height: number): Bounds => ({ x, y, width, height })

const defs: TemplateDef[] = [
  // ---- large 2500x1686 ----
  {
    key: 'RICH_MENU_TEMPLATE_201',
    sizeName: 'large',
    size: LARGE,
    bounds: [
      b(0, 0, 833, 843), b(833, 0, 833, 843), b(1666, 0, 834, 843),
      b(0, 843, 833, 843), b(833, 843, 833, 843), b(1666, 843, 834, 843),
    ],
  },
  {
    key: 'RICH_MENU_TEMPLATE_202',
    sizeName: 'large',
    size: LARGE,
    bounds: [
      b(0, 0, 1250, 843), b(1250, 0, 1250, 843),
      b(0, 843, 1250, 843), b(1250, 843, 1250, 843),
    ],
  },
  {
    key: 'RICH_MENU_TEMPLATE_203',
    sizeName: 'large',
    size: LARGE,
    bounds: [
      b(0, 0, 2500, 843),
      b(0, 843, 833, 843), b(833, 843, 833, 843), b(1666, 843, 834, 843),
    ],
  },
  {
    key: 'RICH_MENU_TEMPLATE_204',
    sizeName: 'large',
    size: LARGE,
    bounds: [
      b(0, 0, 1666, 1686),
      b(1666, 0, 834, 843), b(1666, 843, 834, 843),
    ],
  },
  {
    key: 'RICH_MENU_TEMPLATE_205',
    sizeName: 'large',
    size: LARGE,
    bounds: [b(0, 0, 2500, 843), b(0, 843, 2500, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_206',
    sizeName: 'large',
    size: LARGE,
    bounds: [b(0, 0, 1250, 1686), b(1250, 0, 1250, 1686)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_207',
    sizeName: 'large',
    size: LARGE,
    bounds: [b(0, 0, 2500, 1686)],
  },
  // ---- compact 2500x843 ----
  {
    key: 'RICH_MENU_TEMPLATE_101',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 833, 843), b(833, 0, 834, 843), b(1667, 0, 833, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_102',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 1250, 843), b(1250, 0, 1250, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_103',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 1667, 843), b(1667, 0, 833, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_104',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 833, 843), b(833, 0, 1667, 843)],
  },
  {
    key: 'RICH_MENU_TEMPLATE_105',
    sizeName: 'compact',
    size: COMPACT,
    bounds: [b(0, 0, 2500, 843)],
  },
]

export const TEMPLATES: Record<string, TemplateDef> = Object.fromEntries(
  defs.map((d) => [d.key, d]),
)
