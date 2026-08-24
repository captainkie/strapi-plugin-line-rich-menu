#!/usr/bin/env node
/**
 * ลดสิทธิ์บัญชีที่เอาไว้โชว์ในเดโมสาธารณะ ให้เหลือเท่าที่ปลั๊กอินต้องใช้จริง — ไม่มีอย่างอื่นเลย
 *
 * ทำไมต้องมีสคริปต์นี้: Strapi ยก **superadmin** ให้คนที่ไปถึง `/admin` เป็นคนแรก ฉะนั้นบัญชีแรก
 * ของเดโมทุกตัวเกิดมาพร้อมสิทธิ์ทั้งหมด และเมื่อรหัสผ่านของบัญชีนั้นถูกประกาศไว้ใน README
 * ใครก็ตามที่เปิดลิงก์ก็ถือ Content-Type Builder, รายชื่อผู้ใช้แอดมิน, API token และปุ่มลบ
 * ฐานข้อมูลไปด้วยทันที "เดโม" กับ "superadmin ที่แจกรหัสผ่านในที่สาธารณะ" เป็นคนละเรื่องกัน
 *
 * Strapi Community Edition สร้าง role ใหม่ไม่ได้ (เป็นฟีเจอร์ของ Enterprise) แต่ **แก้สิทธิ์ของ
 * role มาตรฐานได้** สคริปต์นี้จึงยึด `strapi-editor` มาเป็น role ของเดโม แล้วเขียนทับสิทธิ์ทั้งชุด
 *
 * เขียนทับ ไม่ใช่เพิ่มเข้าไป — `PUT /admin/roles/:id/permissions` แทนที่ทั้งชุด ซึ่งเป็นสิ่งที่
 * ต้องการพอดี: สิ่งที่ต้องพิสูจน์คือ "บัญชีนี้ถือสิทธิ์เท่าที่ระบุไว้ข้างล่างนี้ ไม่มีอย่างอื่น" ไม่ใช่
 * "บัญชีนี้ถือสิทธิ์พวกนี้ปนกับอะไรก็ตามที่ role นั้นมีอยู่ก่อน"
 *
 * ใช้:
 *   STRAPI_URL=https://your-demo.example.com \
 *   SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... DEMO_EMAIL=demo@example.com \
 *   [DEMO_ALLOW_CHANNEL_SETTINGS=true] node scripts/demo-restrict.mjs
 *
 * รันซ้ำได้ ไม่มีผลข้างเคียง และไม่ต้องแก้อะไรในคอนเทนเนอร์
 */
import { pathToFileURL } from 'node:url'

/**
 * ค่าตั้งต้น: สี่สิทธิ์ ไม่ใช่ห้า
 *
 * `plugin::line-rich-menu.settings` **ไม่อยู่ในชุดตั้งต้น** มันคือสิทธิ์ที่ตั้งและหมุน LINE channel
 * access token (ดู server/src/routes/admin.ts) ถ้าเดโมของคุณต่อกับ LINE OA จริง สิทธิ์นี้แปลว่า
 * ใครก็ตามที่เปิดลิงก์เขียนทับ token ของ OA ตัวนั้นได้ ซึ่งไม่ใช่สิ่งที่ควรแจกไปพร้อมรหัสผ่านใน README
 * ต่อให้ไม่มี route ไหนคืน token ออกมาเลยก็ตาม (`ChannelRecord` ไม่มีฟิลด์นั้นตั้งแต่ระดับ type)
 *
 * `plugin::upload.assets.create` จำเป็นจริง ไม่ใช่เผื่อไว้ — `ImageField` ของปลั๊กอินยิง
 * `POST /upload` ตรง ๆ (packages/ui/src/components/ImageField.tsx) ถ้าไม่มีสิทธิ์นี้ การอัปโหลด
 * รูปเมนูจะได้ 403 ส่วน `plugin::upload.read` **ไม่** ต้องมี — ยืนยันด้วยการยิงจริงบนโฮสต์เดโม
 * แล้วดูว่า response ยังมี `url` ครบ (controller ของ upload sanitize ด้วย ability ของ `read`
 * ซึ่งเป็นจุดที่น่าจะพังถ้ามันจำเป็น) การไม่ให้สิทธิ์นี้ทำให้ Media Library ไม่มีอะไรให้ดูไปด้วย
 */
export const BASE_PERMISSIONS = [
  'plugin::line-rich-menu.read',
  'plugin::line-rich-menu.write',
  'plugin::line-rich-menu.publish',
  'plugin::upload.assets.create',
]

export const CHANNEL_SETTINGS_PERMISSION = 'plugin::line-rich-menu.settings'

/**
 * สมาชิกอยู่ใน Content Manager ไม่ใช่ในหน้าจอของปลั๊กอิน (ปลั๊กอินไม่มีหน้าจอสมาชิกเลยโดยตั้งใจ
 * — ดู docs/SPEC.md §Screens) สิทธิ์ชุดข้างบนจึงเปิดปลั๊กอินได้ทั้งหมดแต่ **มองไม่เห็น
 * `LINE member`** ผลคือเดโมสาธิตฟีเจอร์หลักของ 1.1.0 ไม่ได้เลย ทั้งที่ปุ่มทุกปุ่มกดได้
 *
 * `subject` ผูกไว้กับ UID ของสมาชิกตัวเดียว ไม่ใช่ `null` — สิทธิ์ explorer ที่ไม่มี subject
 * เปิดทุก collection ใน Content Manager ซึ่งรวม `line-channel` ที่ถือ token ที่เข้ารหัสไว้ด้วย
 *
 * `properties.fields` ของ create/update ตัด `linkedRichMenuId` กับ `linkedAt` ออก สองฟิลด์นั้น
 * ปลั๊กอินเป็นคนเขียนจาก lifecycle ตอน link/unlink จริง ถ้าผู้เยี่ยมชมแก้เองได้ จะปลอมสถานะ
 * "ถูก link แล้ว" ได้โดยที่ LINE ไม่เคยรู้เรื่อง — read ยังเห็นครบทั้งห้า เพราะสองฟิลด์นั้น
 * คือสิ่งที่พิสูจน์ว่าฟีเจอร์ทำงานจริง
 */
export const MEMBER_UID = 'plugin::line-rich-menu.line-member'
const MEMBER_FIELDS_READ = ['channel', 'lineUserId', 'displayName', 'linkedRichMenuId', 'linkedAt']
const MEMBER_FIELDS_WRITE = ['channel', 'lineUserId', 'displayName']

export const MEMBER_PERMISSIONS = [
  { action: 'plugin::content-manager.explorer.read', subject: MEMBER_UID, fields: MEMBER_FIELDS_READ },
  { action: 'plugin::content-manager.explorer.create', subject: MEMBER_UID, fields: MEMBER_FIELDS_WRITE },
  { action: 'plugin::content-manager.explorer.update', subject: MEMBER_UID, fields: MEMBER_FIELDS_WRITE },
  { action: 'plugin::content-manager.explorer.delete', subject: MEMBER_UID, fields: null },
]

/**
 * `DEMO_ALLOW_CHANNEL_SETTINGS=true` เติมสิทธิ์ channel เข้าไปอีกหนึ่ง — เป็น opt-in ที่ต้องพิมพ์เอง
 * ไม่ใช่ค่าตั้งต้น เพราะคำตอบขึ้นกับว่าเดโมของคุณคุยกับอะไร
 *
 * เดโมของ repo นี้เปิดไว้ ด้วยเหตุผลที่ตรวจแล้วสามข้อ: (1) channel ไม่มีฟิลด์ base URL เลย
 * (server/src/content-types/line-channel.ts) — ปลายทางมาจาก `LINE_API_BASE_URL` ของ env
 * เท่านั้น ผู้เยี่ยมชมจึงชี้เดโมไปโฮสต์อื่นไม่ได้ (2) ปลายทางนั้นคือ line-mock ในคอนเทนเนอร์เดียวกัน
 * ซึ่งรับ token อะไรก็ได้ ของที่ "หมุน" ได้จึงเป็นของปลอมตั้งแต่แรก และ (3) ไม่มี route ไหนคืน
 * token ออกมาให้อ่านได้อยู่แล้ว
 *
 * ผลที่ได้คือทุกปุ่มในปลั๊กอินใช้งานได้จริงบนเดโม แทนที่จะมีปุ่ม "Add an account" กับ
 * "Test connection" ค้างอยู่บนหน้าจอแล้วตอบ 403 เมื่อกด — ซึ่งคนที่เพิ่งเปิดมาดูจะอ่านว่าปลั๊กอินพัง
 * ไม่ใช่ว่าบัญชีถูกจำกัดสิทธิ์ไว้ ถ้าเดโมของคุณต่อกับ LINE OA จริง อย่าเปิด
 */
export function demoPermissions(allowChannelSettings) {
  return allowChannelSettings === true
    ? [...BASE_PERMISSIONS, CHANNEL_SETTINGS_PERMISSION]
    : [...BASE_PERMISSIONS]
}

/** role มาตรฐานของ Strapi ที่เอามาใช้เป็น role ของเดโม — CE สร้างใหม่ไม่ได้ */
export const DEMO_ROLE_CODE = 'strapi-editor'

const BASE = (process.env.STRAPI_URL ?? 'http://127.0.0.1:1337').replace(/\/$/, '')

async function call(method, path, { body, token } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token !== undefined) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed
  try {
    parsed = text === '' ? {} : JSON.parse(text)
  } catch {
    // เดโมที่อยู่หลัง proxy/WAF ตอบ HTML กลับมาได้ ซึ่งอ่านเป็น JSON ไม่ได้ — บอกไปตรง ๆ
    // ว่ามันไม่ใช่ JSON ดีกว่าปล่อยให้ SyntaxError ดิบ ๆ ไปโผล่ที่ผู้ใช้
    throw new Error(`${method} ${path} -> ${response.status} but the body is not JSON: ${text.slice(0, 120)}`)
  }
  return { status: response.status, body: parsed }
}

function required(name) {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`${name} is required`)
  return value
}

async function main() {
  const superadminEmail = required('SUPERADMIN_EMAIL')
  const demoEmail = required('DEMO_EMAIL')
  const wanted = demoPermissions(process.env.DEMO_ALLOW_CHANNEL_SETTINGS === 'true')

  const login = await call('POST', '/admin/login', {
    body: { email: superadminEmail, password: required('SUPERADMIN_PASSWORD') },
  })
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`)
  const token = login.body.data.token

  const roles = await call('GET', '/admin/roles', { token })
  const role = roles.body.data.find((row) => row.code === DEMO_ROLE_CODE)
  if (role === undefined) throw new Error(`role ${DEMO_ROLE_CODE} not found`)

  const users = await call('GET', '/admin/users?pageSize=100', { token })
  const results = users.body.data.results
  const demoUser = results.find((row) => row.email === demoEmail)
  if (demoUser === undefined) throw new Error(`no admin user with email ${demoEmail}`)

  // กันล็อกตัวเองออกจากระบบ: ถ้าบัญชีเดโมเป็น superadmin คนสุดท้าย การลดสิทธิ์มันคือการทิ้ง
  // กุญแจของอินสแตนซ์ทิ้งไป Strapi เองก็ปฏิเสธคำสั่งนี้ แต่ข้อความที่มันตอบไม่ได้บอกว่าต้องทำอะไรต่อ
  const isSuperAdmin = (row) => row.roles.some((r) => r.code === 'strapi-super-admin')
  const otherSuperAdmins = results.filter((row) => row.id !== demoUser.id && isSuperAdmin(row))
  if (isSuperAdmin(demoUser) && otherSuperAdmins.length === 0) {
    throw new Error(
      `${demoEmail} is the only Super Admin. Create a second, private Super Admin first — `
      + 'demoting this one would leave the instance with no administrator at all.',
    )
  }

  const permissions = [
    ...wanted.map((action) => ({ action, subject: null, properties: {}, conditions: [] })),
    ...MEMBER_PERMISSIONS.map(({ action, subject, fields }) => ({
      action, subject, conditions: [],
      properties: fields === null ? {} : { fields },
    })),
  ]
  const written = await call('PUT', `/admin/roles/${role.id}/permissions`, { body: { permissions }, token })
  if (written.status !== 200) throw new Error(`permission update failed: ${written.status} ${JSON.stringify(written.body)}`)

  const assigned = await call('PUT', `/admin/users/${demoUser.id}`, { body: { roles: [role.id] }, token })
  if (assigned.status !== 200) throw new Error(`role assignment failed: ${assigned.status} ${JSON.stringify(assigned.body)}`)

  // อ่านกลับมาดูจริง ไม่เชื่อ 200 — บนโฮสต์จริง `PUT .../permissions` เคยตอบ 200 พร้อม
  // `data: []` (เพราะไม่มีอะไรเปลี่ยนในรอบที่สอง) ถ้าเชื่อ response ของ PUT อย่างเดียว
  // สคริปต์นี้จะรายงานว่า "ลดสิทธิ์สำเร็จ เหลือศูนย์สิทธิ์" ทั้งที่ role ยังถูกต้องดี — และในทางกลับกัน
  // มันจะรายงานสำเร็จได้เหมือนกันในวันที่ไม่มีอะไรถูกเขียนลงไปเลย
  const readBack = await call('GET', `/admin/roles/${role.id}/permissions`, { token })
  // เทียบเป็นคู่ action+subject ไม่ใช่ action อย่างเดียว — สิทธิ์ explorer สี่ตัวใช้ action คนละชื่อ
  // แต่ทั้งหมดต้องผูกกับ subject ของสมาชิกเท่านั้น ถ้าเทียบแค่ action วันที่ subject กลายเป็น null
  // (คือเปิดทุก collection รวม line-channel ที่ถือ token) ด่านนี้จะยังเขียวอยู่
  const granted = readBack.body.data.map((row) => `${row.action}@${row.subject ?? '-'}`).sort()
  const expected = [
    ...wanted.map((a) => `${a}@-`),
    ...MEMBER_PERMISSIONS.map((p) => `${p.action}@${p.subject}`),
  ].sort()
  if (JSON.stringify(granted) !== JSON.stringify(expected)) {
    throw new Error(`role ${DEMO_ROLE_CODE} holds ${JSON.stringify(granted)}, expected ${JSON.stringify(expected)}`)
  }

  const after = await call('GET', `/admin/users/${demoUser.id}`, { token })
  const codes = after.body.data.roles.map((r) => r.code)
  if (codes.length !== 1 || codes[0] !== DEMO_ROLE_CODE) {
    throw new Error(`${demoEmail} holds roles ${JSON.stringify(codes)}, expected only ${DEMO_ROLE_CODE}`)
  }

  console.log(`${demoEmail} is now ${DEMO_ROLE_CODE} with exactly:`)
  for (const action of granted) console.log(`  - ${action}`)
}

// import ได้โดยไม่ยิงเน็ตเวิร์ก — เทสต์ที่ docs/tests/demo.test.ts อ่านค่าคงที่จากที่นี่
// เพื่อไม่ให้เอกสารกับสคริปต์แยกจากกันเงียบ ๆ
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
