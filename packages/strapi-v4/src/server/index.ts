import { contentTypes } from './content-types/index.js'
import type { StrapiV4 } from './strapi.js'

export default {
  // Task 15+ เติม logic จริงในนี้ — พารามิเตอร์ไม่ได้ใช้ตอนนี้แต่ต้องอยู่เพื่อให้ตรง signature ที่ Strapi 4 เรียก
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  register(_context: { strapi: StrapiV4 }): void {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  bootstrap(_context: { strapi: StrapiV4 }): void {},
  config: { default: {}, validator(): void {} },
  contentTypes,
  controllers: {},
  routes: {},
  services: {},
}
