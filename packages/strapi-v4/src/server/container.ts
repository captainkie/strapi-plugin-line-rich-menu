import {
  LineClient, createAuditWriter, createChannelService, createRateLimiter,
  createScheduleLock, createScrubbedLogger, resolveEncryptionKey,
  type AuditWriter, type ChannelService, type ChannelWithSecrets, type ImageStore,
  type KnexLike, type LoggerLike, type PluginConfig, type RateLimiter, type Repo,
  type RichMenuRow, type ScheduleLock, type ScheduleRow,
} from '@fosivo/line-rich-menu-core'
import { readConfig } from './config.js'
import {
  createAuditRepo, createChannelRepo, createImageStore, createMenuRepo, createScheduleRepo,
} from './repo.js'
import type { StrapiV4 } from './strapi.js'

export interface Services {
  config: PluginConfig
  logger: LoggerLike
  channels: ChannelService
  menus: Repo<RichMenuRow>
  schedules: Repo<ScheduleRow>
  audit: AuditWriter
  limiter: RateLimiter
  store: ImageStore
  lock: ScheduleLock
  clientFor(channel: ChannelWithSecrets): LineClient
}

/**
 * ประกอบครั้งเดียวต่อหนึ่ง instance ของ Strapi แล้วจำไว้
 *
 * ไม่ใช่การ optimise — `createRateLimiter` ถือถังของแต่ละ channel ไว้ในหน่วยความจำของตัวเอง
 * ถ้าประกอบใหม่ทุกคำขอ ทุกคำขอจะได้ถังเต็มใบใหม่ แปลว่า rate limit ไม่ทำงานเลย
 * WeakMap เพื่อให้เทสต์ที่สร้าง strapi ปลอมหลายตัวไม่ปนกันและไม่รั่ว
 */
const cache = new WeakMap<StrapiV4, Services>()

export function getServices(strapi: StrapiV4): Services {
  const cached = cache.get(strapi)
  if (cached !== undefined) return cached

  const config = readConfig(strapi)
  const logger = createScrubbedLogger(strapi.log)
  const key = resolveEncryptionKey({
    encryptionKey: config.encryptionKey,
    appKeys: strapi.config.get<string[]>('server.app.keys', []),
  })

  const services: Services = {
    config,
    logger,
    channels: createChannelService({ repo: createChannelRepo(strapi), key }),
    menus: createMenuRepo(strapi),
    schedules: createScheduleRepo(strapi),
    audit: createAuditWriter({ repo: createAuditRepo(strapi), logger }),
    limiter: createRateLimiter(config.publishRateLimit),
    store: createImageStore(strapi),
    lock: createScheduleLock(strapi.db.connection as KnexLike, { ttlMs: config.scheduler.lockTtlMs }),
    clientFor: (channel) => new LineClient({
      accessToken: channel.channelAccessToken,
      apiBaseUrl: config.lineApiBaseUrl,
      apiDataBaseUrl: config.lineApiDataBaseUrl,
    }),
  }

  cache.set(strapi, services)
  return services
}
