'use strict'

/**
 * สร้างผู้ใช้ admin สามคน:
 *
 * - **Super Admin** สำหรับเดินเส้นทางหลัก
 * - **Author** ที่ไม่มีสิทธิ์ของปลั๊กอินเลย — พิสูจน์ว่า route ทุกเส้นตอบ 403 (สเปก §13.2 ข้อ 1)
 * - **Reader** ที่ถือสิทธิ์ `read` ตัวเดียว — พิสูจน์ขอบที่ละเอียดกว่านั้น คือ `settings`
 *   ถูกกันจริงจากคนที่อ่านได้ ตาราง RBAC ของ Task 17 พิสูจน์ได้แค่ว่า "ทุกเส้นผูกกับ policy"
 *   ส่วน "คนที่อ่านได้ publish ไม่ได้และไม่เห็น token" ต้องถาม Strapi ตัวจริงเท่านั้น
 *
 * ไม่สร้าง channel ที่นี่โดยตั้งใจ — เทสต์สร้างเองผ่าน POST /line-rich-menu/channels
 * เพื่อให้เส้นทางเข้ารหัส token ถูกเดินจริงแทนที่จะถูกข้ามด้วยการเขียนแถวตรง ๆ
 */
async function main() {
  const strapiFactory = require('@strapi/strapi')
  const strapi = await strapiFactory().load()

  // `strapi.db.query('admin::role')` แทน `strapi.admin.services.role.*` — service ของ admin
  // เปลี่ยนชื่อเมธอดไปมาระหว่าง 4.x ย่อย ส่วน query engine เสถียรทั้งสาย
  const roles = await strapi.db.query('admin::role').findMany()
  const roleIdByCode = Object.fromEntries(roles.map((role) => [role.code, role.id]))

  const users = [
    { env: 'E2E_ADMIN', code: 'strapi-super-admin', firstname: 'Owner' },
    { env: 'E2E_AUTHOR', code: 'strapi-author', firstname: 'Author' },
    { env: 'E2E_READER', code: 'strapi-editor', firstname: 'Reader' },
  ]

  for (const user of users) {
    const email = process.env[`${user.env}_EMAIL`]
    const password = process.env[`${user.env}_PASSWORD`]
    const existing = await strapi.db.query('admin::user').findOne({ where: { email } })
    if (existing) continue

    await strapi.admin.services.user.create({
      email,
      password,
      firstname: user.firstname,
      lastname: 'E2E',
      isActive: true,
      registrationToken: null,
      roles: [roleIdByCode[user.code]],
    })
    strapi.log.info(`seeded ${email} as ${user.code}`)
  }

  // แทนที่สิทธิ์ของ role `strapi-editor` ทั้งชุดด้วย `read` ตัวเดียว — ไม่ใช่ "เพิ่ม read เข้าไป"
  // เพราะสิ่งที่ต้องพิสูจน์คือ token ที่ **มีแค่ read** ไม่ใช่ token ที่มี read ปนกับของอื่น
  // `assignPermissions` เป็นเส้นทางเดียวกับที่หน้า Settings ของ admin ใช้ จึงผ่าน validation
  // ตัวเดียวกัน ถ้าสิทธิ์ยังไม่ถูกลงทะเบียนตอน bootstrap มันจะล้มที่นี่ ไม่ใช่เงียบ ๆ
  const readerRoleId = roleIdByCode['strapi-editor']
  await strapi.admin.services.role.assignPermissions(readerRoleId, [
    { action: 'plugin::line-rich-menu.read', subject: null, properties: {}, conditions: [] },
  ])
  strapi.log.info('granted plugin::line-rich-menu.read (and nothing else) to strapi-editor')

  await strapi.destroy()
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
