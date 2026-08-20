import type { Bounds, RichMenuSize, RichMenuSizeName } from './types.js'

export interface TemplateDef {
  key: string
  sizeName: RichMenuSizeName
  size: RichMenuSize
  bounds: Bounds[]
}

export const LARGE: RichMenuSize = { width: 2500, height: 1686 }
export const COMPACT: RichMenuSize = { width: 2500, height: 843 }

/**
 * ไล่จากใหญ่ไปเล็ก — ลดขนาดก็ต่อเมื่อบีบ quality จนสุดแล้วยังเกิน 1 MB
 *
 * แช่แข็งจริงระดับ runtime (ไม่ใช่แค่ type-level `as const`) — `LINE_ALLOWED_SIZES` (ด้านล่าง)
 * ถือ object reference เดียวกันกับ entry พวกนี้ทุกตัว และ `schema.ts` validate ผ่าน
 * `isAllowedCanvas` ที่อ่านจาก `LINE_ALLOWED_SIZES` ตรง ๆ ถ้าไม่ freeze ผู้เรียกที่ mutate
 * เช่น `SIZE_LADDER.large[0].width = 1` จะเปลี่ยนสิ่งที่ `validateRichMenu` ยอมรับแบบเงียบ ๆ
 * ไฟล์นี้เป็น ESM strict mode อยู่แล้ว เขียนทับ frozen object/array จึง throw ไม่ใช่ fail เงียบ ๆ
 */
const SIZE_LADDER_DEF = {
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
} as const

for (const sizes of Object.values(SIZE_LADDER_DEF)) {
  for (const size of sizes) Object.freeze(size)
  Object.freeze(sizes)
}
Object.freeze(SIZE_LADDER_DEF)

export const SIZE_LADDER: Readonly<Record<RichMenuSizeName, readonly RichMenuSize[]>> = SIZE_LADDER_DEF

/**
 * ทุกขนาดผืนผ้าใบที่ LINE ยอมรับ รวม 6 แบบ (สเปก 4.1) — ที่เดียวที่ประกาศตัวเลขพวกนี้
 * `schema.ts` ต้อง derive มาจากตัวนี้แทนพิมพ์ string ซ้ำเอง ไม่งั้นวันไหนแก้ที่เดียวไม่ครบ
 * validate กับ template catalog จะไม่ตรงกันแบบเงียบ ๆ
 */
export const LINE_ALLOWED_SIZES: readonly RichMenuSize[] = Object.freeze([
  ...SIZE_LADDER.large,
  ...SIZE_LADDER.compact,
])

export function isAllowedCanvas(size: RichMenuSize): boolean {
  return LINE_ALLOWED_SIZES.some((s) => s.width === size.width && s.height === size.height)
}

/**
 * ย้อนจากพิกเซลจริงกลับไปหาชื่อขนาดที่ DB เก็บ (`large` / `compact`)
 *
 * มีไว้ให้ฝั่งเรียก (Strapi service) ปิดช่องโหว่ที่สเปก 4.1 เตือนไว้: `normalize` เลือกพิกเซลเอง
 * จาก SIZE_LADDER (อาจลดขั้นถ้าบีบไม่ลง 1 MB) — ฝั่งเรียกต้องใช้ผลลัพธ์จริงของ normalize
 * ไปคำนวณ payload.size แทนการเดาไว้ก่อนแยกต่างหาก ไม่งั้นรูปที่อัปกับเมนูที่ LINE ถืออาจคนละขนาด
 */
export function sizeNameFor(size: RichMenuSize): RichMenuSizeName | undefined {
  for (const sizeName of Object.keys(SIZE_LADDER) as RichMenuSizeName[]) {
    if (SIZE_LADDER[sizeName].some((s) => s.width === size.width && s.height === size.height)) {
      return sizeName
    }
  }
  return undefined
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
