import { permissionActions } from './permissions.js'
import type { StrapiV4 } from './strapi.js'

/**
 * ลงทะเบียนสี่สิทธิ์เข้า action provider ของ admin
 *
 * บน Community Edition (สเปก §6.3) สิทธิ์เหล่านี้ยังลงทะเบียนได้ปกติ แต่จะไปโผล่เฉพาะใน
 * role มาตรฐานสามตัว เพราะ CE ไม่มี custom role — ไม่ต้องทำอะไรเพิ่มและไม่ต้องดักกรณีนี้
 */
export async function registerPermissions(strapi: StrapiV4): Promise<void> {
  await strapi.admin.services.permission.actionProvider.registerMany([...permissionActions])
}

export async function bootstrap({ strapi }: { strapi: StrapiV4 }): Promise<void> {
  await registerPermissions(strapi)
}
