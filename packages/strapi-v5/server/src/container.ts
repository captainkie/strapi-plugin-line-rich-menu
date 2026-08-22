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
import type { StrapiV5 } from './strapi.js'

/**
 * คอลัมน์ที่ lock query ต้องยิงใส่บน Strapi 5
 *
 * `createScheduleLock` มี `options.columns` ไว้ให้แทนที่ชื่อคอลัมน์ได้อยู่แล้ว และนี่คือจุดเดียว
 * ในทั้งโปรเจกต์ที่ต้องใช้มัน: ตัวระบุที่ชั้น service ส่งเข้า `claim`/`release` คือ `documentId`
 * ส่วนคอลัมน์ `id` ในตารางคือ primary key ตัวเลขซึ่งไม่มีทางตรงกัน ค่า default `'id'` จะทำให้
 * `affected` เป็น 0 เสมอ แปลว่า claim ไม่เคยสำเร็จ ทุกงานที่ตั้งเวลาไว้ถูกข้ามทุกนาทีโดยที่
 * รายงานของ tick อ่านเหมือนปกติ (`due: n, claimed: 0` แยกจาก "ไม่มีงานถึงกำหนด" ไม่ออกด้วยตา)
 *
 * export ออกมาเป็นค่าคงที่แทนที่จะฝังเป็น literal เพื่อให้ tests/container.test.ts อ้างถึงตัวเดียวกัน
 * ได้ ไม่ใช่พิมพ์สตริงซ้ำแล้วพิสูจน์แค่ว่าตัวเองเท่ากับตัวเอง
 */
export const SCHEDULE_ID_COLUMN = 'document_id'

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
  /**
   * Task 20 item 5 (strapi-v5 M1) — จุดเดียวที่ `menu-write.ts:saveMenu` เข้าถึง DB transaction
   * จริงของ Strapi ผ่าน `Services` แทนที่จะรับ `strapi` ทั้งตัวเข้าไปตรง ๆ (ซึ่งจะทำให้ทดสอบ
   * `saveMenu` ต้องปลอมทั้ง `StrapiV5` แทนที่จะปลอมแค่ `Services`) `strapi.db.transaction(cb)`
   * ใช้ `AsyncLocalStorage` (`transactionCtx` ใน `@strapi/database`) ผูก connection ปัจจุบันไว้กับ
   * คำเรียก `documents()`/`db.query()` ทุกตัวที่เกิด**ระหว่าง** `cb` ทำงานโดยอัตโนมัติ ไม่ต้องส่ง
   * `trx` ผ่านทุกเลเยอร์เอง (ตรวจกับซอร์สจริงที่ติดตั้งอยู่ใน examples/v5-app/node_modules/
   * @strapi/database — ไม่ใช่เดาจากเอกสาร) `cb` ที่ throw จะ rollback แล้ว rethrow ให้เอง
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>
}

/**
 * ประกอบครั้งเดียวต่อหนึ่ง instance ของ Strapi แล้วจำไว้ — ไม่ใช่การ optimise
 * `createRateLimiter` ถือถังของแต่ละ channel ไว้ในหน่วยความจำของตัวเอง ประกอบใหม่ทุกคำขอ
 * แปลว่าทุกคำขอได้ถังเต็มใบใหม่ คือ rate limit ไม่ทำงานเลย
 */
const cache = new WeakMap<StrapiV5, Services>()

export function getServices(strapi: StrapiV5): Services {
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
    lock: createScheduleLock(strapi.db.connection as KnexLike, {
      ttlMs: config.scheduler.lockTtlMs,
      columns: { id: SCHEDULE_ID_COLUMN },
    }),
    transaction: (fn) => strapi.db.transaction(fn),
    clientFor: (channel) => new LineClient({
      accessToken: channel.channelAccessToken,
      apiBaseUrl: config.lineApiBaseUrl,
      apiDataBaseUrl: config.lineApiDataBaseUrl,
    }),
  }

  cache.set(strapi, services)
  return services
}
