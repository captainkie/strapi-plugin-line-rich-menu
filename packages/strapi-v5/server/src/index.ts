import { configDefault, validateConfig } from './config.js'
import { contentTypes } from './content-types/index.js'

export default {
  config: { default: configDefault, validator: validateConfig },
  contentTypes,
}
