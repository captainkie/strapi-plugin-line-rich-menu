import { hostname } from 'node:os'
import { createScheduler, type TickReport } from '@fosivo/line-rich-menu-core'
import { getServices, type Services } from './container.js'
import type { StrapiV4 } from './strapi.js'

/**
 * ตัวระบุ process ที่ไปลงคอลัมน์ `locked_by` — hostname กับ pid รวมกันแยก instance ได้จริง
 * ทั้งบนหลาย container และบนเครื่องเดียวที่รันหลาย process (pm2 cluster)
 */
const owner = (): string => `${hostname()}:${process.pid}`

/**
 * แต่ละ schedule ผูกกับเมนู และแต่ละเมนูผูกกับ channel ของตัวเอง — client จึงต้องประกอบ
 * ตาม channel ของงานนั้น ไม่ใช่ channel เริ่มต้นของระบบ ไม่งั้น tick ในระบบที่มีหลาย OA
 * จะยิงเมนูของ OA หนึ่งด้วย token ของอีก OA หนึ่ง
 */
export async function runTick(strapi: StrapiV4, services: Services): Promise<TickReport> {
  const total: TickReport = { due: 0, claimed: 0, done: 0, failed: 0 }

  for (const channel of await services.channels.list()) {
    const withSecrets = await services.channels.withSecrets().findOne(channel.id)
    const report = await createScheduler({
      schedules: services.schedules,
      lock: services.lock,
      ops: {
        client: services.clientFor(withSecrets),
        menus: services.menus,
        audit: services.audit,
      },
      logger: services.logger,
      now: () => new Date(),
      owner: owner(),
    }).tick()

    total.due += report.due
    total.claimed += report.claimed
    total.done += report.done
    total.failed += report.failed
  }

  strapi.log.debug('line-rich-menu: scheduler tick finished', total)
  return total
}

export function registerCron(strapi: StrapiV4): void {
  const services = (() => {
    try {
      return getServices(strapi)
    } catch {
      return null
    }
  })()

  // อ่าน config ตรง ๆ แทนการพึ่ง services เพราะ getServices อาจล้มได้ตอนบูต
  // (เช่นยังไม่ได้ตั้ง APP_KEYS) และการปิด scheduler ไว้ต้องยังทำงานได้ในสภาพนั้น
  const scheduler = strapi.config.get<{ scheduler?: { enabled?: boolean; cron?: string } }>(
    'plugin.line-rich-menu', {},
  ).scheduler
  if (scheduler?.enabled === false) return
  const expression = scheduler?.cron ?? '* * * * *'

  strapi.cron.add({
    [expression]: async () => {
      try {
        await runTick(strapi, services ?? getServices(strapi))
      } catch (error) {
        // cron runner ของ Strapi ไม่จับ error ให้ — error ที่หลุดออกไปจะกลายเป็น
        // unhandled rejection ที่ทำให้ process ตายทั้งตัวในทุก ๆ นาที
        strapi.log.error('line-rich-menu: scheduler tick failed', error)
      }
    },
  })
}
