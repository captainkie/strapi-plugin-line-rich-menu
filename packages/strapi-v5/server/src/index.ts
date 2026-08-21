import { bootstrap } from './bootstrap.js'
import { configDefault, validateConfig } from './config.js'
import { contentTypes } from './content-types/index.js'
import { controllers } from './controllers/index.js'
import { routes } from './routes/index.js'
import type { StrapiV5 } from './strapi.js'

export default {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  register(_context: { strapi: StrapiV5 }): void {},
  bootstrap,
  config: { default: configDefault, validator: validateConfig },
  contentTypes,
  controllers,
  routes,
  services: {},
}
