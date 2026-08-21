import { configDefault, validateConfig } from './config.js'
import { contentTypes } from './content-types/index.js'
import { controllers } from './controllers/index.js'
import { routes } from './routes/index.js'
import type { StrapiV5 } from './strapi.js'

export default {
  // register ยังไม่มี logic จริง — พารามิเตอร์ไม่ได้ใช้ตอนนี้แต่ต้องอยู่เพื่อให้ตรง signature ที่ Strapi เรียก
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  register(_context: { strapi: StrapiV5 }): void {},
  config: { default: configDefault, validator: validateConfig },
  contentTypes,
  controllers,
  routes,
  services: {},
}
