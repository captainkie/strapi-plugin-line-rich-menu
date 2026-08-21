import { hostname } from 'node:os'
import { createScheduler, createScrubbedLogger, type TickReport } from '@fosivo/line-rich-menu-core'
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
 *
 * เดิมที่นี่วนทีละ channel แล้วสร้าง scheduler ที่ผูกกับ client ของ channel นั้นให้หนึ่งตัว
 * ซึ่ง **ไม่ได้แก้อะไรเลย**: `createScheduler` เลือกงานจาก `state` อย่างเดียวไม่มีเงื่อนไข channel
 * รอบแรกของลูปจึงคว้างานที่ถึงเวลาทั้งตาราง (รวมของ channel อื่น) ไปรันด้วย token ของ channel แรก
 * แล้ว lock ก็กันไม่ให้รอบของเจ้าของจริงหยิบซ้ำ ตอนนี้ scheduler เป็นตัวถาม channel ของแต่ละงาน
 * เอง (จากเมนูของงานนั้น) ลูปนี้จึงหายไปทั้งอัน — เหลือ tick เดียวต่อรอบ
 */
export async function runTick(strapi: StrapiV4, services: Services): Promise<TickReport> {
  const report = await createScheduler({
    schedules: services.schedules,
    lock: services.lock,
    ops: {
      menus: services.menus,
      audit: services.audit,
      clientFor: async (channelId) =>
        services.clientFor(await services.channels.withSecrets().findOne(channelId)),
    },
    logger: services.logger,
    now: () => new Date(),
    owner: owner(),
  }).tick()

  // services.logger คือ createScrubbedLogger ตัวเดียวกับที่ container.ts ประกอบไว้ — สเปก §11.2
  // บังคับว่าการกรองใช้กับทุก log level ไม่ใช่แค่ error ตัวนี้เคยยิงผ่าน strapi.log ตรง ๆ
  // ซึ่งข้าม scrub ไปเลยหนึ่งเส้นทาง
  services.logger.debug('line-rich-menu: scheduler tick finished', report)
  return report
}

/** ล้มเงียบ ๆ เป็น null ให้ผู้เรียกตัดสินใจเอง — getServices อาจล้มได้ตอนบูต (เช่นยังไม่ได้ตั้ง APP_KEYS) */
function tryGetServices(strapi: StrapiV4): Services | null {
  try {
    return getServices(strapi)
  } catch {
    return null
  }
}

export function registerCron(strapi: StrapiV4): void {
  const services = tryGetServices(strapi)

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
        // ต้อง scrub ทุกครั้งไม่ว่า services จะประกอบสำเร็จหรือไม่ (สเปก §11.2 "ทุก log level")
        // error ที่หลุดออกมาจาก tick อาจพก payload ของ knex ที่มี credential envelope ติดมาด้วย
        // ยิงเข้า strapi.log.error ตรง ๆ แบบเดิมคือช่องทางเดียวที่ยัง unscrubbed อยู่ในทั้งไฟล์นี้ —
        // และเป็นช่องที่ยิงทุกนาทีถ้า tick ล้มซ้ำ ๆ (เช่นชื่อคอลัมน์ผิดหลัง migration เปลี่ยน schema)
        // ลอง services ที่ resolve ไว้ตอน register ก่อน แล้วค่อยลองใหม่เผื่อรอบนี้สร้างสำเร็จ
        // (เช่น boot แรกยังไม่ตั้ง APP_KEYS แต่ตั้งตามทีหลัง) — ไม่มีทางไหนสำเร็จก็ยัง fallback ไปที่
        // createScrubbedLogger ตรง ๆ ได้เสมอ ไม่ต้องพึ่ง services เลย
        const logger = (services ?? tryGetServices(strapi))?.logger ?? createScrubbedLogger(strapi.log)
        logger.error('line-rich-menu: scheduler tick failed', error)
      }
    },
  })
}
