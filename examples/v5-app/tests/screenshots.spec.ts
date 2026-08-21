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
 * Amendment 2 ย้ายภาพทั้งชุดจาก examples/v4-app มา examples/v5-app — DS v2 คือหน้าตาของ
 * Strapi admin วันนี้ ส่วน v4 ยังถูกทดสอบและจัดส่งเหมือนเดิม แค่ไม่มีภาพในหน้าร้านอีกต่อไป
 *
 * `__dirname` ไม่ใช่ `import.meta.url` — เหตุผลเดียวกับที่ playwright.config.ts ใช้ `__dirname`:
 * Playwright แปลงไฟล์เทสต์เป็น CJS ผ่าน esbuild แล้ว `import.meta` ที่หลงเหลืออยู่ทำให้ Node
 * สลับไปโหลดไฟล์เป็น ESM กลางทาง แล้วล้มทันทีด้วย "require is not defined in ES module scope"
 * ก่อนจะได้รันเทสต์สักบรรทัด (เจอจริงตอนรันสคริปต์นี้ครั้งแรก ไม่ใช่จากการเดา)
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

/** JPEG ทึบสีเดียว 2500×1686 — เหมือนกับที่ acceptance.spec.ts ใช้ ไม่ต้องมีไฟล์ binary ใน repo */
async function makeImage(): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp({ create: { width: 2500, height: 1686, channels: 3, background: { r: 20, g: 120, b: 210 } } })
    .jpeg({ quality: 85 })
    .toBuffer()
}

/**
 * ภาพที่ README ใช้ต้องแสดงผลิตภัณฑ์ที่มีข้อมูลจริงอยู่ในนั้น — ไม่ใช่แอปที่เพิ่งติดตั้งแล้วว่างเปล่า
 * `list.png` และ `channel.png` ต้องเห็นแถวจริงอย่างน้อยหนึ่งแถว ไม่งั้นภาพจะโชว์สถานะว่างซึ่งเป็น
 * ภาพที่แย่กว่าไม่มีภาพเลยสำหรับคนที่กำลังตัดสินใจว่าจะติดตั้งปลั๊กอินนี้ไหม
 *
 * ใช้ `request` ยิง API ตรง ๆ (เหมือน acceptance.spec.ts) แทนกรอกฟอร์มทีละช่องผ่าน `page` —
 * เร็วกว่าและเชื่อถือได้กว่า ส่วนภาพที่ถ่ายจริงยังมาจาก `page` เสมอ
 */
async function seedPublishedMenu(request: APIRequestContext): Promise<void> {
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
    multipart: { files: { name: 'menu.jpg', mimeType: 'image/jpeg', buffer: await makeImage() } },
  })
  expect(upload.ok(), await upload.text()).toBe(true)
  const fileId = (await upload.json())[0].id as number

  const created = await request.post('/line-rich-menu/menus', {
    ...auth,
    data: {
      name: 'Welcome menu',
      channelId: channel.id,
      size: 'large',
      chatBarText: 'Menu',
      chatBarMode: 'custom',
      selected: true,
      templateKey: null,
      areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: 'message', text: 'Hi!' } }],
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
}

test('ถ่ายภาพสี่ภาพที่ README ใช้', async ({ page, request }) => {
  await mkdir(OUT, { recursive: true })
  // ขนาดคงที่เพื่อให้ภาพชุดถัดไปเทียบกับชุดนี้ได้ตรง ๆ ใน diff
  await page.setViewportSize({ width: 1440, height: 900 })

  await seedPublishedMenu(request)
  await login(page)

  await page.goto('/admin/plugins/line-rich-menu')
  await expect(page.getByRole('heading', { level: 1, name: 'LINE Rich Menu' })).toBeVisible()
  // รอให้ channel ถูกเลือกและเมนูที่ seed ไว้โหลดเสร็จจริง ไม่ใช่แค่หัวข้อของหน้าที่ยังว่างอยู่
  await expect(page.getByText('Welcome menu')).toBeVisible()
  await expect(page.getByText('Published')).toBeVisible()
  await page.screenshot({ path: `${OUT}list.png` })

  await page.goto('/admin/plugins/line-rich-menu/rich-menus/new')
  await expect(page.getByTestId('open-template-picker')).toBeVisible()
  await page.screenshot({ path: `${OUT}editor.png`, fullPage: true })

  await page.getByTestId('open-template-picker').click()
  const dialog = page.getByRole('dialog')
  // `role=dialog` เพียงอย่างเดียวถือว่า "visible" ได้ตั้งแต่กรอบยังโปร่งใสอยู่กลาง transition ของ
  // Radix (toBeVisible เช็คแค่ display/visibility/ขนาดกล่อง ไม่เช็ค opacity) — เจอจริงตอนรันครั้งแรก:
  // เทสต์ผ่านแต่ภาพที่ได้เป็นพื้นหลังเดิมไม่มี dialog เลย รอข้อความจริงในหัว dialog แทนจึงมั่นใจได้
  // ว่า transition จบแล้วเนื้อหาวาดเสร็จจริง
  await expect(dialog.getByRole('heading', { name: 'Select a template' })).toBeVisible()
  await expect(page.getByTestId(/^template-option-/).first()).toBeVisible()
  // ถ่ายเฉพาะ dialog ด้วย element screenshot แทน page.screenshot() เต็มจอ — element screenshot
  // ของ Playwright คำนวณ bounding box ของ dialog เองและตัดภาพตรงนั้นเป๊ะ ไม่พึ่งว่า backdrop/overlay
  // ของ Radix จะ position ยังไงกับ viewport (เจอจริงตอนรันครั้งที่สอง: เทสต์ผ่านทุกข้อรวมถึงสองข้อ
  // ข้างบนนี้ แต่ page.screenshot() เต็มจอกลับได้ภาพพื้นหลังเดิมไม่มี dialog อยู่เลย)
  await dialog.screenshot({ path: `${OUT}templates.png` })
  await page.keyboard.press('Escape')

  // ไม่มี route settings แยกต่างหากใน v5 (ต่างจากที่ task-14-brief.md สมมติไว้) — ChannelSettings
  // ถูกวาดอยู่บนหน้าเดียวกับรายการเมนู ใต้ Divider (ดู admin/src/pages/List.tsx) จึงถ่ายเฉพาะ
  // ส่วนนั้นด้วย element screenshot แทนที่จะเดินไปหน้าที่ไม่มีอยู่จริงแล้วได้ภาพที่ไม่เกี่ยวข้อง
  await page.goto('/admin/plugins/line-rich-menu')
  const channelHeading = page.getByRole('heading', { level: 1, name: 'LINE Official Accounts' })
  await expect(channelHeading).toBeVisible()
  const channelSection = channelHeading.locator('xpath=..')
  // ขอบเขตให้แคบลงมาที่ channelSection เพราะ "Demo LINE OA" ปรากฏสองที่บนหน้านี้ — ในตัวเลือก
  // channel ด้านบนด้วย — getByText แบบไม่ขอบเขตจะชน strict mode (เจอจริงตอนรันครั้งแรก)
  await expect(channelSection.getByText('Demo LINE OA')).toBeVisible()
  await channelSection.screenshot({ path: `${OUT}channel.png` })
})
