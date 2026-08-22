import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * ภาพใน README ถ่ายด้วยสคริปต์ ไม่ใช่แคปมือ — ภาพที่แคปมือจะล้าสมัยเงียบ ๆ ทุกครั้งที่ UI
 * เปลี่ยน และไม่มีใครรู้จนกว่าจะมีคนบ่น ส่วนภาพที่ถ่ายด้วยสคริปต์ถูกถ่ายใหม่ด้วยคำสั่งเดียว
 * และเทสต์ใน docs/tests/readme.test.ts บังคับว่าไฟล์ต้องมีอยู่จริง
 *
 * ไฟล์นี้ไม่ได้อยู่ในชุด acceptance (playwright.config.ts จับเฉพาะ acceptance.spec.ts ด้วย
 * `testMatch` ที่เพิ่มใน Step นี้) — มันถูกเรียกจาก scripts/screenshots.sh เท่านั้น
 *
 * ย้ายภาพทั้งชุดจาก examples/v4-app มา examples/v5-app — DS v2 คือหน้าตาของ
 * Strapi admin วันนี้ ส่วน v4 ยังถูกทดสอบและจัดส่งเหมือนเดิม แค่ไม่มีภาพในหน้าร้านอีกต่อไป
 *
 * `__dirname` ไม่ใช่ `import.meta.url` — เหตุผลเดียวกับที่ playwright.config.ts ใช้ `__dirname`:
 * Playwright แปลงไฟล์เทสต์เป็น CJS ผ่าน esbuild แล้ว `import.meta` ที่หลงเหลืออยู่ทำให้ Node
 * สลับไปโหลดไฟล์เป็น ESM กลางทาง แล้วล้มทันทีด้วย "require is not defined in ES module scope"
 * ก่อนจะได้รันเทสต์สักบรรทัด (เจอจริงตอนรันสคริปต์นี้ครั้งแรก ไม่ใช่จากการเดา)
 *
 * --- Task 14 fix round 2 -------------------------------------------------------------------
 * รอบนี้แก้สองเรื่องที่รอบก่อนพลาด: (1) seed เดิมมีแค่ 1 ช่องไม่มี action เลย พอถ่าย editor.png
 * จากฟอร์มเปล่า (`/rich-menus/new`) เลยได้ฟอร์มว่างที่ไม่มีใครติดตั้งปลั๊กอินเพราะภาพนี้ (2) การ
 * ครอปทุกภาพอิงจาก bounding box ของ "เนื้อหา" อย่างเดียว ไม่เคยเผื่อความสูงของแถบเมนูซ้าย
 * (ซึ่งสูงเท่า viewport เสมอ — ดูคอมเมนต์ของ `shellShot` ด้านล่าง) เลยตัดไอคอนขาดครึ่งเมื่อความสูง
 * ที่ครอปสั้นกว่า
 */
const OUT = join(__dirname, '../../../docs/screenshots/')
const ADMIN = { email: process.env['E2E_ADMIN_EMAIL']!, password: process.env['E2E_ADMIN_PASSWORD']! }
const CHANNEL_ACCESS_TOKEN = process.env['E2E_CHANNEL_ACCESS_TOKEN'] ?? 'e2e-access-token-ABCD'

async function login(page: Page): Promise<void> {
  await page.goto('/admin/auth/login')
  await page.locator('input[name="email"]').fill(ADMIN.email)
  await page.locator('input[name="password"]').fill(ADMIN.password)
  await page.getByRole('button', { name: /login/i }).click()
  await expect(page).not.toHaveURL(/\/admin\/auth\//, { timeout: 20_000 })
}

/**
 * template 6 ช่องแบบ large — คัดลอกตัวเลขมาจาก `RICH_MENU_TEMPLATE_201` ใน
 * packages/core/src/templates.ts ตรง ๆ (bounds + ขนาดผืนผ้าใบ) แทนการ import
 *
 * import ไม่ได้จริง ๆ ไม่ใช่แค่เลือกไม่ import: `pnpm-workspace.yaml` กัน `examples/v5-app`
 * ออกจากเวิร์กสเปซโดยตั้งใจ ("ต้องเป็นแอป Strapi ที่เหมือนของลูกค้า ไม่ใช่แพ็กเกจในเวิร์กสเปซที่ได้
 * node_modules พิเศษ") แอปนี้ติดตั้งปลั๊กอินจาก tarball ที่ `npm pack` เท่านั้น และ
 * `@fosivo/line-rich-menu-core` เป็นแค่ devDependency ของ packages/strapi-v5 — tsup ยุบมันเข้าไป
 * ใน dist/server และ dist/admin ตอน build (ดู packages/strapi-v5/package.json) ไม่เคยถูก publish
 * ออกมาเป็นแพ็กเกจแยกให้แอปนี้เห็นเลย `require.resolve('@fosivo/line-rich-menu-core')` จากในนี้
 * ล้มด้วย MODULE_NOT_FOUND จริง (ตรวจแล้วก่อนเขียนไฟล์นี้) การประกาศมันเป็น dependency จริงของแอปนี้
 * เพื่อเอาเลข 6 ชุดจะเปิดช่องทางติดตั้งที่สองที่ทั้งแอปตั้งใจเลี่ยงมาตลอด ถ้าวันไหน templates.ts
 * เปลี่ยนเลขของ key นี้ ค่าที่นี่กับ seed ด้านล่างจะเก่าไปด้วยกันทั้งคู่ — ของถูกที่พอจะตรวจด้วยตา
 * ไม่คุ้มจะแลกกับ dependency ใหม่
 */
const TEMPLATE_KEY = 'RICH_MENU_TEMPLATE_201'
const CANVAS = { width: 2500, height: 1686 }

type SeedAction =
  | { type: 'uri'; label: string; uri: string }
  | { type: 'message'; label: string; text: string }
  | { type: 'postback'; label: string; data: string }

interface SeedArea {
  bounds: { x: number; y: number; width: number; height: number }
  action: SeedAction
}

/**
 * 6 ช่อง มี action จริงครบทุกช่อง คละชนิด (uri × 2, message × 2, postback × 2) — เพื่อให้
 * ภาพ editor.png โชว์ว่าปลั๊กอินรองรับ action หลายแบบ ไม่ใช่แค่มี label เฉย ๆ ป้ายชื่อเป็นคำ
 * อังกฤษทั่วไปล้วน ๆ ไม่มีชื่อลูกค้าที่ไหนเลย ตามที่โจทย์รอบนี้ย้ำ
 */
const AREAS: readonly SeedArea[] = [
  { bounds: { x: 0, y: 0, width: 833, height: 843 },
    action: { type: 'uri', label: 'Shop', uri: 'https://example.com/shop' } },
  { bounds: { x: 833, y: 0, width: 833, height: 843 },
    action: { type: 'uri', label: 'About', uri: 'https://example.com/about' } },
  { bounds: { x: 1666, y: 0, width: 834, height: 843 },
    action: { type: 'message', label: 'Contact', text: 'Hi! I have a question about an order.' } },
  { bounds: { x: 0, y: 843, width: 833, height: 843 },
    action: { type: 'postback', label: 'Promotions', data: 'action=promotions' } },
  { bounds: { x: 833, y: 843, width: 833, height: 843 },
    action: { type: 'message', label: 'Support', text: 'I need help with an order.' } },
  { bounds: { x: 1666, y: 843, width: 834, height: 843 },
    action: { type: 'postback', label: 'FAQ', data: 'action=faq' } },
]

/** สีตระกูลเขียว/ฟ้าของ LINE เอง ไม่ใช่สีสุ่มเจ็ดสี — คละกันไปทีละช่องให้พอแยกออกจากกันในภาพ */
const CELL_COLORS = ['#06C755', '#00B900', '#1EC8A5', '#2AA7DE', '#5B7FDB', '#5C4EE5']

/**
 * รูปเมนูจำลอง — คอมโพส SVG เอง (หกช่องสีตามผังจริง พร้อม label จริงของแต่ละช่อง) แล้วแปลงเป็น
 * JPEG ผ่าน sharp แทนสี่เหลี่ยมทึบสีเดียวของรอบก่อน (ซึ่งทำให้ editor.png ในรอบก่อนโชว์กล่องฟ้า
 * เปล่า ๆ แทนตัวอย่างเมนูจริง)
 *
 * ไม่ได้เรียก `renderTemplateSvg` ของ core (แม้จะ import ได้ก็ตาม เพราะเหตุผลเดียวกับ TEMPLATE_KEY
 * ข้างบน มันก็ import ไม่ได้จากที่นี่อยู่ดี) — แต่ต่อให้ import ได้ ฟังก์ชันนั้นก็ไม่ใช่ฟังก์ชันที่
 * ต้องการ: มันวาด label เป็นตัวอักษร A/B/C… เสมอ (`areaLabel(i)`) เพราะถูกออกแบบมาเป็น thumbnail
 * ของ template picker ที่ยังไม่รู้จัก action จริง ส่วนที่นี่ต้องการ label จริงของแต่ละช่อง (Shop,
 * About, …) กับสีจริง ไม่ใช่กรอบโปร่งใสสีเดียว — โครงสร้าง (bounds → rect + text) จึงเหมือนกัน
 * แต่เป็นโค้ดคนละชุดโดยตั้งใจ
 */
async function makeRichMenuImage(): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const cells = AREAS.map(({ bounds, action }, index) => {
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2
    return `
      <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}"
            fill="${CELL_COLORS[index % CELL_COLORS.length]}" stroke="#ffffff" stroke-width="6" />
      <text x="${cx}" y="${cy}" font-size="100" font-family="sans-serif" font-weight="700"
            fill="#ffffff" text-anchor="middle" dominant-baseline="central">${action.label}</text>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}">${cells}</svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer()
}

/**
 * ภาพที่ README ใช้ต้องแสดงผลิตภัณฑ์ที่มีข้อมูลจริงอยู่ในนั้น — ไม่ใช่แอปที่เพิ่งติดตั้งแล้วว่างเปล่า
 * `list.png` และ `channel.png` ต้องเห็นแถวจริงอย่างน้อยหนึ่งแถว ไม่งั้นภาพจะโชว์สถานะว่างซึ่งเป็น
 * ภาพที่แย่กว่าไม่มีภาพเลยสำหรับคนที่กำลังตัดสินใจว่าจะติดตั้งปลั๊กอินนี้ไหม
 *
 * ใช้ `request` ยิง API ตรง ๆ (เหมือน acceptance.spec.ts) แทนกรอกฟอร์มทีละช่องผ่าน `page` —
 * เร็วกว่าและเชื่อถือได้กว่า ส่วนภาพที่ถ่ายจริงยังมาจาก `page` เสมอ
 *
 * เมนูตอนนี้มี template 6 ช่อง มี action ครบทุกช่อง และรูปจริง (ไม่ใช่กล่องฟ้าเปล่า) เพื่อให้
 * editor.png ที่ถ่ายจากเมนูนี้ (ไม่ใช่จากฟอร์มเปล่า) โชว์สถานะ "ตั้งค่าเสร็จแล้ว" ไม่ใช่ฟอร์มว่าง
 *
 * รับ `demoImage` เป็นพารามิเตอร์แทนที่จะคอมโพส SVG ซ้ำข้างในฟังก์ชันนี้ — เทสต์ด้านล่างต้องใช้
 * ไบต์ชุดเดียวกันนี้ซ้ำอีกครั้งตอนอัปโหลดผ่าน UI ของ editor.png (ดูคอมเมนต์ตรงนั้นว่าทำไม)
 * ต้องเป็นไฟล์เดียวกันเป๊ะ ไม่ใช่แค่ "หน้าตาเหมือนกัน" ไม่งั้นภาพที่โชว์ในฟอร์มจะไม่ตรงกับภาพจริง
 * ที่ถูก publish ไปหา LINE
 */
async function seedPublishedMenu(
  request: APIRequestContext, demoImage: Buffer,
): Promise<{ menuId: string }> {
  const login_ = await request.post('/admin/login', { data: ADMIN })
  expect(login_.ok(), await login_.text()).toBe(true)
  const token = (await login_.json()).data.token as string
  const auth = { headers: { Authorization: `Bearer ${token}` } }

  const channelResponse = await request.post('/line-rich-menu/channels', {
    ...auth,
    data: { name: 'Demo LINE OA', channelId: '1657000000', channelAccessToken: CHANNEL_ACCESS_TOKEN },
  })
  expect(channelResponse.ok(), await channelResponse.text()).toBe(true)
  const channel = await channelResponse.json()

  const upload = await request.post('/upload', {
    ...auth,
    multipart: { files: { name: 'menu.jpg', mimeType: 'image/jpeg', buffer: demoImage } },
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  const fileId = (await upload.json())[0].id as number

  const created = await request.post('/line-rich-menu/menus', {
    ...auth,
    data: {
      // ชื่อทั่วไปเป็นภาษาอังกฤษ ไม่มีชื่อลูกค้า — ต่างจาก "Welcome menu" ของรอบก่อนแค่คำ
      // แต่ต้องย้ำไว้เพราะโจทย์รอบนี้เน้นเรื่องนี้ตรง ๆ
      name: 'Main menu',
      channelId: channel.id,
      size: 'large',
      chatBarText: 'Menu',
      chatBarMode: 'custom',
      selected: true,
      templateKey: TEMPLATE_KEY,
      areas: AREAS.map(({ bounds, action }) => ({ bounds, action })),
      imageFileId: fileId,
      areaImages: [],
      aliasId: 'main',
      startAt: null,
      endAt: null,
    },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const menu = await created.json()

  const published = await request.post(`/line-rich-menu/menus/${menu.id}/publish`, {
    ...auth,
    data: { setAsDefault: true },
  })
  expect(published.ok(), await published.text()).toBe(true)
  return { menuId: menu.id as string }
}

const SHELL_WIDTH = 1440
const BOTTOM_PAD = 24

interface ElementBox { top: number; bottom: number }

/**
 * ตำแหน่งจริงของไอคอน/ปุ่มทุกตัวในแถบเมนูซ้าย ต้องเรียกตอน viewport สูง "พอ" เสมอ (>= 900) —
 * อวาตาร์ผู้ใช้ที่มุมล่างซ้าย pin ไว้กับก้นแถบเมนู (แถบเมนูสูงเท่า viewport เสมอ) ถ้า viewport
 * สั้นกว่าที่กลุ่มไอคอนต้องการจริง อวาตาร์จะเลื่อนขึ้นมาชนกลุ่มไอคอนแทนตำแหน่งจริงของมัน แล้ว
 * `iconGroupBottom` ด้านล่างจะหาช่องว่างที่กว้างที่สุดผิดที่
 */
async function navElementBoxes(page: Page): Promise<ElementBox[]> {
  const items = page.locator('nav a, nav button')
  const count = await items.count()
  const boxes: ElementBox[] = []
  for (let i = 0; i < count; i++) {
    const box = await items.nth(i).boundingBox()
    if (box !== null) boxes.push({ top: box.y, bottom: box.y + box.height })
  }
  return boxes.sort((a, b) => a.top - b.top)
}

/**
 * ขอบล่างของ "กลุ่มไอคอนแอป" ในแถบเมนูซ้าย (Home, Content Manager, …, ปลั๊กอินนี้, …) — หาแบบ
 * ไดนามิกจากช่องว่างแนวตั้งที่กว้างที่สุดระหว่างสององค์ประกอบติดกัน (คือช่องว่างก่อนอวาตาร์ผู้ใช้
 * ที่ pin อยู่ก้นแถบ) แทนนับจำนวนไอคอนตายตัว — ปลอดภัยกว่าถ้าวันหลัง Strapi เพิ่ม/ลดแอปในตัว
 *
 * nav item ของปลั๊กอินนี้เอง (ซึ่ง highlight อยู่ตอนนี้เพราะกำลังอยู่ในหน้าของมัน) อยู่ปนอยู่ใน
 * กลุ่มนี้เสมอ — list.png/editor.png ต้องเห็นกลุ่มนี้ครบ ไม่งั้นจะไม่เห็น nav item ที่ highlight
 * เลยตามที่โจทย์รอบนี้ขอตรง ๆ ("full sidebar, plugin nav item visible and highlighted")
 */
function iconGroupBottom(boxes: readonly ElementBox[]): number {
  if (boxes.length === 0) return 0
  let cutBottom = boxes[0]!.bottom
  let widestGap = -Infinity
  for (let i = 1; i < boxes.length; i++) {
    const gap = boxes[i]!.top - boxes[i - 1]!.bottom
    if (gap > widestGap) { widestGap = gap; cutBottom = boxes[i - 1]!.bottom }
  }
  return cutBottom
}

/** ถ้าเส้นตัดที่เลือกไว้ตกอยู่กลางองค์ประกอบใดพอดี ดันให้จบ "หลัง" องค์ประกอบนั้นแทน — กันภาพตัด
 *  กลางไอคอนหรือกลางอวาตาร์ ซึ่งเป็นบั๊กเดิมของรอบก่อน (ดูคอมเมนต์หัวไฟล์) */
function pastAnyElement(height: number, boxes: readonly ElementBox[]): number {
  let next = height
  for (const box of boxes) {
    if (box.top < next && box.bottom > next) next = box.bottom
  }
  return next
}

/**
 * ถ่ายภาพ "ทั้งเชลล์" ของ Strapi (แถบเมนูซ้ายเต็ม ๆ ไม่ตัดกลางไอคอน) — ใช้กับ list.png และ
 * editor.png ตามที่เจ้าของโปรดักต์อยากเห็นบริบทว่าปลั๊กอินอยู่ใน Strapi admin จริง
 *
 * แถบเมนูซ้ายของ Strapi สูงเท่า viewport เสมอ (วัดจริงแล้ว: `nav` มี boundingBox สูง 900px พอดี
 * ตอน viewport สูง 900 — มันคือ 100% ของความสูงหน้าจอ ไม่ใช่ความสูงตามจำนวนไอคอน) รอบก่อนครอปภาพ
 * โดยอิงความสูงของ "เนื้อหา" อย่างเดียว (เช่น bounding box ของแถวเมนูสุดท้าย) ซึ่งสั้นกว่าแถบเมนู
 * มาก ผลคือภาพตัดแถบเมนูขาดกลางไอคอน อ่านเป็นอุบัติเหตุการครอปมากกว่าการตัดสินใจ
 *
 * ทางแก้แรกที่ลอง (บังคับความสูงขั้นต่ำ 900 เสมอ) แก้บั๊กนั้นได้จริง แต่ดันพา list.png กลับไปเจอ
 * บั๊กของรอบก่อนหน้านั้นอีกที: เนื้อหาจริงมีแค่ ~1/5 บนของภาพ ที่เหลือคือพื้นเทาว่างเปล่า — สองบั๊ก
 * นี้แก้พร้อมกันไม่ได้ด้วยตัวเลขคงที่ตัวเดียว ต้องรู้ว่า "ไอคอนอยู่ที่ไหนบ้างจริง ๆ" ถึงจะเลือกความ
 * สูงที่ทั้งเห็นไอคอนครบกลุ่ม (รวม nav item ที่ highlight) และไม่ทิ้งที่ว่างเกินจำเป็นได้พร้อมกัน
 * ทางแก้ที่นี่จึงวัดตำแหน่งไอคอนจริงแล้วเลือกความสูง = max(เนื้อหาต้องการ, กลุ่มไอคอนต้องการ) + pad
 * แล้วปัดพ้นองค์ประกอบใด ๆ ที่เผอิญโดนตัดกลาง (`pastAnyElement`) วัดซ้ำหนึ่งรอบหลัง resize เพราะ
 * อวาตาร์ที่ pin ก้นแถบขยับตำแหน่งทุกครั้งที่ viewport เปลี่ยนความสูง
 */
/**
 * รอให้ modal ของ Radix (DS v2) วาดเสร็จจริง ไม่ใช่แค่ "มีอยู่ในหน้า"
 *
 * `toBeVisible()` ตรวจ display/visibility/ขนาดกล่องเท่านั้น **ไม่ตรวจ opacity** — ระหว่าง
 * transition ตอนเปิด กล่อง dialog มีขนาดเต็มและถือว่า visible ตั้งแต่ opacity ยังเป็น 0
 * ผลคือเทสต์เขียวแต่ภาพที่ได้เป็นหน้าเดิมล้วน ๆ ไม่มี modal อยู่ในนั้นเลย
 *
 * เจอมาแล้วสองครั้งกับสองภาพคนละใบ: templates.png (รอบก่อน) และ preview.png (รอบนี้)
 * ครั้งแรกแก้ด้วยการรอข้อความในหัว dialog ซึ่งได้ผลเพราะ**บังเอิญ**มี await อีกหลายตัวตามหลัง
 * (คลิก tile, รอ aria-pressed, รอปุ่ม Apply) กินเวลาจน transition จบไปเอง — ไม่ใช่เพราะการรอ
 * ข้อความนั้นพิสูจน์อะไรเกี่ยวกับ opacity เลย ภาพที่สองที่ไม่มี await ตามหลังจึงพังทันที
 *
 * ตัวนี้ตรวจสิ่งที่ขาดจริง ๆ ตรง ๆ: opacity เป็น 1 แล้ว
 */
async function waitForDialogPaint(page: Page): Promise<void> {
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
}

async function shellShot(page: Page, path: string, contentBottom: number): Promise<void> {
  const candidate = Math.ceil(contentBottom) + BOTTOM_PAD
  // วัดตอน viewport สูงพอเสมอก่อน (ดูเหตุผลที่ navElementBoxes) แล้วค่อยตัดสินใจความสูงจริง
  await page.setViewportSize({ width: SHELL_WIDTH, height: Math.max(candidate, 900) })
  const measuredAt900 = await navElementBoxes(page)
  let height = pastAnyElement(Math.max(candidate, iconGroupBottom(measuredAt900) + BOTTOM_PAD), measuredAt900)

  if (height !== page.viewportSize()?.height) {
    await page.setViewportSize({ width: SHELL_WIDTH, height })
    const measuredAtFinal = await navElementBoxes(page)
    const rechecked = pastAnyElement(height, measuredAtFinal)
    if (rechecked !== height) {
      height = rechecked
      await page.setViewportSize({ width: SHELL_WIDTH, height })
    }
  }

  // `page.screenshot()` แบบไม่มี `clip`/`fullPage` ถ่ายเฉพาะสิ่งที่อยู่ในตำแหน่ง scroll ปัจจุบัน —
  // ถ้าก่อนหน้านี้มีการคลิกอะไรที่อยู่ไกลจากด้านบน (เช่น area-header-0 ตอนถ่าย editor.png)
  // เบราว์เซอร์จะเลื่อนให้องค์ประกอบนั้นเข้าเฟรมให้เอง แก้ด้วย `window.scrollTo(0,0)` เฉย ๆ ไม่พอ
  // (ลองแล้วไม่ได้ผล) — เพจของ Strapi admin ไม่ได้ scroll ที่ `window`/`document` แต่มี container
  // ด้านในของมันเองที่ตั้ง `overflow: auto` แยกต่างหาก (นั่นคือเหตุผลที่แถบเมนูซ้ายลอยนิ่งเต็มความสูง
  // จอเสมอในทุกภาพ — ดูคอมเมนต์ของ shellShot เอง) ต้องรีเซ็ต `scrollTop` ของ**ทุก**องค์ประกอบที่
  // scroll อยู่จริง ไม่ใช่แค่ window ถึงจะเห็นหัวข้อ "Rich menu"/Title กลับมาที่บนสุดของภาพแน่นอน
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      if (el.scrollTop !== 0) el.scrollTop = 0
    }
  })
  await page.screenshot({ path })
}

test('ถ่ายภาพห้าภาพที่ README ใช้', async ({ page, request }) => {
  await mkdir(OUT, { recursive: true })
  // ความกว้างคงที่ตลอดทั้งไฟล์เพื่อให้ภาพชุดถัดไปเทียบกับชุดนี้ได้ตรง ๆ ใน diff — ความสูงเริ่มที่
  // 900 (ค่ามาตรฐานของทั้งชุด) แล้ว shellShot จะปรับขึ้นเป็นรายภาพเองถ้าเนื้อหาต้องการที่มากกว่านี้
  const DEFAULT_HEIGHT = 900
  await page.setViewportSize({ width: SHELL_WIDTH, height: DEFAULT_HEIGHT })

  const demoImage = await makeRichMenuImage()
  const { menuId } = await seedPublishedMenu(request, demoImage)
  await login(page)

  await page.goto('/admin/plugins/line-rich-menu')
  await expect(page.getByRole('heading', { level: 1, name: 'LINE Rich Menu' })).toBeVisible()
  // รอให้ channel ถูกเลือกและเมนูที่ seed ไว้โหลดเสร็จจริง ไม่ใช่แค่หัวข้อของหน้าที่ยังว่างอยู่
  await expect(page.getByText('Main menu')).toBeVisible()
  await expect(page.getByText('Published')).toBeVisible()
  // "LINE Official Accounts" ที่อยู่ถัดจากรายการเมนูมี channel.png ของตัวเองแล้ว ไม่จำเป็นต้องซ้ำ
  // อยู่ใน list.png ด้วย — ใช้แถวเมนูสุดท้ายเป็นตัวกำหนดความสูงของเนื้อหา ไม่ใช่ความสูงทั้งหน้า
  const lastMenuRow = page.getByTestId(`edit-${menuId}`)
  await expect(lastMenuRow).toBeVisible()
  const rowBox = await lastMenuRow.boundingBox()
  if (rowBox === null) throw new Error('หา bounding box ของแถวเมนูสุดท้ายไม่เจอ')
  await shellShot(page, `${OUT}list.png`, rowBox.y + rowBox.height)

  /**
   * พรีวิว — กดชื่อเมนูในรายการแล้วได้จอโทรศัพท์กับรายละเอียดของเมนูนั้น
   *
   * ถ่ายทั้งหน้า ไม่ครอปเฉพาะกล่อง modal เพราะฉากหลังที่มืดลงคือสิ่งที่บอกว่านี่เป็น modal
   * ที่เปิดคร่อมรายการอยู่ ไม่ใช่หน้าใหม่ที่พาผู้ใช้ออกไปจากรายการ ซึ่งเป็นทั้งหมดของเหตุผล
   * ที่มันเป็น modal (ดูคอมเมนต์หัว MenuPreviewModal.tsx)
   */
  await page.setViewportSize({ width: SHELL_WIDTH, height: DEFAULT_HEIGHT })
  await page.getByTestId(`preview-${menuId}`).click()
  await expect(page.getByTestId('preview-action-0')).toBeVisible()
  await waitForDialogPaint(page)
  await page.screenshot({ path: `${OUT}preview.png` })
  await page.keyboard.press('Escape')

  // ถ่าย editor.png จากเมนูที่ seed ไว้ (ตั้งค่าครบแล้ว) ไม่ใช่จากฟอร์มเปล่า /rich-menus/new
  // เหมือนรอบก่อน — นั่นคือสาเหตุที่ editor.png รอบก่อนโชว์ฟอร์มว่างเปล่าทั้งที่ปลั๊กอินมีของจริง
  await page.goto(`/admin/plugins/line-rich-menu/rich-menus/${menuId}`)
  // list.png ข้างบนอาจย่อ viewport ลงเหลือแค่ 445px (ดู shellShot) แล้ว navigate ไปหน้านี้ไม่ได้
  // รีเซ็ตความสูงให้เอง — ถ้าปล่อยไว้ การคลิก area-header-0 ด้านล่าง (ซึ่งอยู่นอกวิวพอร์ต 445px)
  // จะบังคับเบราว์เซอร์ scroll หน้าให้เอง แล้ว `.boundingBox()` ของ Playwright วัดค่าสัมพัทธ์กับ
  // ตำแหน่ง scroll **ปัจจุบัน** เสมอ (เหมือน getBoundingClientRect ไม่ใช่พิกัดสัมบูรณ์ของเอกสาร
  // อย่างที่คิดตอนแรก) ทำให้ตัวเลขที่ shellShot ใช้คำนวณความสูงเพี้ยนไปเท่ากับระยะที่ scroll ไปแล้ว
  // — พบจริงตอนรันครั้งแรกของรอบนี้: ภาพที่ได้ความสูงถูกเผงแต่เนื้อหาเริ่มจากกลางฟอร์ม ไม่มีหัวข้อ
  // "Rich menu"/Title อยู่เลย ตั้ง viewport ให้สูงเผื่อไว้มาก ๆ ก่อนคลิกอะไรทั้งนั้นจึงกันได้ตรงจุด
  // (ไม่ใช่แค่ scroll กลับ 0 ก่อนถ่ายภาพ ซึ่งแก้ปลายทางไม่ได้ ตัวเลขที่วัดไปแล้วเพี้ยนไปก่อนหน้านั้น)
  await page.setViewportSize({ width: SHELL_WIDTH, height: 2200 })
  await expect(page.getByRole('heading', { level: 1, name: 'Rich menu' })).toBeVisible()
  await expect(page.getByTestId('open-template-picker')).toBeVisible()
  // รอให้ฟอร์มโหลดค่าจริงจาก GET /menus/:id เสร็จก่อน (ไม่ใช่แค่หัวข้อหน้าที่ render ได้เร็วกว่า
  // fetch) — เช็คว่าชื่อเมนูกับ label ของช่องแรกโผล่แล้วจริง ๆ
  await expect(page.locator('input[name="title"]')).toHaveValue('Main menu')
  await expect(page.getByTestId('area-header-0')).toBeVisible()
  // `GET /menus/:id` คืนมาแค่ `imageFileId` ไม่มี url/ขนาด — Editor.tsx จึงตั้ง `image: null` เสมอ
  // ตอนเปิดเมนูเก่ามาแก้ (ดูคอมเมนต์ยาวเหนือ `saved` ใน packages/strapi-v5/admin/src/pages/
  // Editor.tsx: ถ้าไม่ทำแบบนี้ การแก้แค่ชื่อเมนูจะลบรูปเดิมทิ้งเงียบ ๆ) ผลคือช่อง Image ของฟอร์ม
  // แก้ไขจะขึ้น "No file chosen" เสมอไม่ว่าเมนูจะมีรูปอยู่จริงหรือไม่ — **ไม่ใช่บั๊กของ seed ตรงนี้
  // และไม่มีทางแก้จากฝั่งเทสต์ล้วน ๆ** `<input type=file>` ของเบราว์เซอร์ก็ไม่มีทางถูกเติมชื่อไฟล์
  // ที่เคยเลือกไว้ให้โดยโปรแกรมอยู่แล้วเป็นปกติ (ข้อจำกัดด้านความปลอดภัยของเบราว์เซอร์ ไม่ใช่ของ
  // ปลั๊กอิน) ทางแก้ที่ตรงกับสิ่งที่ผู้ใช้จริงจะทำ (แก้เมนูเก่าแล้วอยากให้ฟอร์มโชว์รูปด้วย ต้องเลือก
  // ไฟล์ใหม่อีกครั้ง) คือเลือกไฟล์เดียวกันนี้ซ้ำผ่าน UI จริงก่อนถ่ายภาพ ไม่ใช่หวังให้ฟอร์มจำรูปเดิมได้
  await page.getByTestId('image-input').setInputFiles({
    name: 'menu.jpg', mimeType: 'image/jpeg', buffer: demoImage,
  })
  await expect(page.getByTestId('image-remove')).toBeVisible()
  // "Show template outlines" วาดกรอบโปร่งใสพร้อมป้าย A–F ทับบนรูปเสมอ (ค่าเริ่มต้นของ toggle นี้
  // เป็น ON) มีไว้ให้เห็นตำแหน่งช่องตอน "ไม่มี" รูป — ตอนนี้มีรูปจริงที่แยกช่องด้วยสีและ label ของ
  // ตัวเองอยู่แล้ว (Shop/About/…) การซ้อนป้าย A–F ทับข้อความในรูปเลยอ่านเป็นฟอนต์เพี้ยนสองชั้น
  // ไม่ใช่ overlay ที่ตั้งใจ — ปิด toggle นี้ก่อนถ่ายเหมือนที่ผู้ใช้จริงจะทำทันทีที่มีรูปแล้ว
  // แนวคิด A–F ถูกโชว์อยู่แล้วใน templates.png จึงไม่จำเป็นต้องซ้ำที่นี่ (พบจากรีวิวจริง — ภาพก่อน
  // หน้านี้ทับกันจนอ่านไม่ออกว่า "Shop" หรือ "A" กันแน่)
  await page.locator('input[name="outlines"]').click()
  await expect(page.locator('input[name="outlines"]')).not.toBeChecked()
  // Actions แบบพับ (list view) โชว์แค่ป้าย A–F ที่หัวแถว (areaLabel(index) ตายตัว ไม่ใช่ label ของ
  // action จริง — ดู AreaList.tsx) หกแถวแบบนี้ไม่บอกอะไรเลยว่าปลั๊กอินทำอะไรได้บ้าง กางช่องแรกช่อง
  // เดียวให้เห็น ActionForm จริงหนึ่งชุด (type/label/uri) แทน — ไม่ใช้ปุ่ม "กางทั้งหมด" เพราะหกฟอร์ม
  // กางพร้อมกันจะทำให้ภาพยาวเกินจำเป็นโดยไม่ได้ข้อมูลเพิ่มจากห้าแถวที่เหลือ
  await page.getByTestId('area-header-0').click()
  await expect(page.getByTestId('area-body-0')).toBeVisible()
  // ปุ่ม Cancel/Save อยู่สองชุด (บนสุดกับล่างสุดของฟอร์ม) — ใช้ชุดล่างสุดเป็นจุดสิ้นสุดของเนื้อหาจริง
  const bottomActions = page.getByTestId('save-publish').last()
  await expect(bottomActions).toBeVisible()
  const actionsBox = await bottomActions.boundingBox()
  if (actionsBox === null) throw new Error('หา bounding box ของแถบปุ่มล่างสุดไม่เจอ')
  await shellShot(page, `${OUT}editor.png`, actionsBox.y + actionsBox.height)

  // editor.png ข้างบนอาจขยาย viewport ให้สูงเกิน DEFAULT_HEIGHT ถ้าฟอร์มยาวกว่านั้น — templates.png
  // ต้องการแค่ viewport มาตรฐาน ไม่ใช่ viewport ที่ยืดตามความสูงของฟอร์มบรรทัดก่อนหน้าโดยบังเอิญ
  await page.setViewportSize({ width: SHELL_WIDTH, height: DEFAULT_HEIGHT })
  await page.getByTestId('open-template-picker').click()
  const dialog = page.getByRole('dialog')
  // `role=dialog` เพียงอย่างเดียวถือว่า "visible" ได้ตั้งแต่กรอบยังโปร่งใสอยู่กลาง transition ของ
  // Radix (toBeVisible เช็คแค่ display/visibility/ขนาดกล่อง ไม่เช็ค opacity) — เจอจริงตอนรันครั้งแรก:
  // เทสต์ผ่านแต่ภาพที่ได้เป็นพื้นหลังเดิมไม่มี dialog เลย รอข้อความจริงในหัว dialog แทนจึงมั่นใจได้
  // ว่า transition จบแล้วเนื้อหาวาดเสร็จจริง
  await expect(dialog.getByRole('heading', { name: 'Select a template' })).toBeVisible()
  await waitForDialogPaint(page)
  // เลือก template 6 ช่องเดียวกับที่ seed ใช้ก่อนถ่าย — ไม่งั้น Apply จะเป็นสีจางกดไม่ได้ (ยังไม่มี
  // อะไรถูกเลือกในตัวเลือก UI แม้ currentKey ของ draft จะชี้ไปที่ template นี้อยู่แล้วก็ตาม เพราะ
  // TemplatePicker เก็บ selection ของตัวเองแยกต่างหากใน state — ต้องคลิกจริงเพื่อให้ aria-pressed
  // ติดและปุ่ม Apply ใช้งานได้ ไม่ใช่ปล่อยให้ค่าเริ่มต้นบังเอิญตรงกันเฉย ๆ)
  const templateTile = page.getByTestId(`template-option-${TEMPLATE_KEY}`)
  await templateTile.click()
  await expect(templateTile).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('template-apply')).toBeEnabled()
  // ถ่ายทั้ง viewport ไม่ใช่แค่กรอบ dialog — ต้องเห็น backdrop สลัวและ editor ที่อยู่ข้างหลังด้วย
  // ถึงจะอ่านออกว่านี่คือ modal ที่เปิดทับอยู่ ไม่ใช่หน้าเดี่ยว ๆ (ข้อยกเว้นของกฎ "ครอปเฉพาะพาเนล"
  // ที่ channel.png ใช้ — ดูเหตุผลเต็มในรายงานของ Task 14 fix round 2)
  await page.screenshot({ path: `${OUT}templates.png` })
  await page.keyboard.press('Escape')

  /**
   * ตั้งค่าบัญชีมีหน้าของตัวเองแล้ว (`/channels`) ไม่ได้อยู่ใต้ Divider ของหน้ารายการเหมือนก่อน
   *
   * ตามด้วยการถ่ายทั้งเชลล์เหมือน list.png/editor.png ไม่ใช่ครอปเฉพาะกล่อง — เพราะสิ่งที่ภาพนี้
   * ต้องบอกเปลี่ยนไปแล้ว: เดิมมันบอกว่า "ท่อนตั้งค่าหน้าตาแบบนี้" ตอนนี้มันบอกว่า "ตั้งค่าบัญชี
   * เป็นหน้าแยกของมันเอง" ซึ่งเห็นได้จากแถบเมนูซ้ายกับหัวหน้าเท่านั้น
   *
   * การครอปแบบเดิม (`channelHeading.locator('xpath=..')`) ผูกอยู่กับการที่ `<h1>` เป็นของ
   * ChannelSettings เอง พอหัวข้อกลายเป็นของ `ui.Page` พ่อของมันคือส่วนหัวของหน้า ไม่ใช่พาเนล
   * ที่มีรายการบัญชีอยู่ — locator ยังหาเจอ แต่ครอปได้กล่องที่ไม่มีข้อมูลอยู่ในนั้นเลย
   */
  await page.goto('/admin/plugins/line-rich-menu/channels')
  await page.setViewportSize({ width: SHELL_WIDTH, height: DEFAULT_HEIGHT })
  await expect(page.getByRole('heading', { level: 1, name: 'LINE Official Accounts' })).toBeVisible()
  await expect(page.getByText('Demo LINE OA')).toBeVisible()
  const addAccount = page.getByRole('button', { name: 'Add an account' })
  await expect(addAccount).toBeVisible()
  const addBox = await addAccount.boundingBox()
  if (addBox === null) throw new Error('หา bounding box ของปุ่มเพิ่มบัญชีไม่เจอ')
  await shellShot(page, `${OUT}channel.png`, addBox.y + addBox.height)
})
