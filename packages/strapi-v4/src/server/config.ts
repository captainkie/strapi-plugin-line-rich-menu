import { z } from 'zod'
import type { PluginConfig } from '@fosivo/line-rich-menu-core'
import type { StrapiV4 } from './strapi.js'

export const configDefault: PluginConfig = {
  encryptionKey: null,
  scheduler: { enabled: true, cron: '* * * * *', lockTtlMs: 300_000 },
  lineApiBaseUrl: 'https://api.line.me',
  lineApiDataBaseUrl: 'https://api-data.line.me',
  mockMode: false,
  publishRateLimit: { capacity: 3, refillPerMinute: 6 },
}

const url = z.string().url()

/**
 * `.strict()` เหมือนกับที่ route ใช้ (สเปก §11.3) — config ที่พิมพ์คีย์ผิดจะล้มตอนบูต
 * ซึ่งเห็นทันที ดีกว่าปล่อยให้ `mockmode: true` ถูกเมินเงียบ ๆ แล้วยิงใส่ LINE จริงตอน demo
 */
const schema = z.object({
  encryptionKey: z.string().min(1).nullable().default(null),
  scheduler: z.object({
    enabled: z.boolean().default(true),
    cron: z.string().min(1).default('* * * * *'),
    lockTtlMs: z.number().int().positive().default(300_000),
  }).strict().default({}),
  lineApiBaseUrl: url.default(configDefault.lineApiBaseUrl),
  lineApiDataBaseUrl: url.default(configDefault.lineApiDataBaseUrl),
  mockMode: z.boolean().default(false),
  publishRateLimit: z.object({
    capacity: z.number().int().positive().default(3),
    refillPerMinute: z.number().int().positive().default(6),
  }).strict().default({}),
}).strict()

export function validateConfig(value: unknown): PluginConfig {
  return schema.parse(value ?? {})
}

export function readConfig(strapi: StrapiV4): PluginConfig {
  return validateConfig(strapi.config.get<unknown>('plugin.line-rich-menu', {}))
}
