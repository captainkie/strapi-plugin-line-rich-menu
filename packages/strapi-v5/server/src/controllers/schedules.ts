import { getServices } from '../container.js'
import { guard } from '../http-error.js'
import type { StrapiV5 } from '../strapi.js'
import { runTick } from '../tick.js'

export const schedules = ({ strapi }: { strapi: StrapiV5 }) => ({
  // สเปก §10 — สำหรับคนที่รัน serverless หรือหลาย instance ให้ปิด scheduler.enabled
  // แล้วยิงเส้นนี้จากข้างนอกแทน ยังเป็น type: 'admin' เหมือนทุกเส้น (§11.4 ไม่มีข้อยกเว้น)
  // ผู้เรียกจากภายนอกจึงต้องใช้ admin API token
  tick: guard(strapi, async (ctx) => {
    ctx.body = await runTick(strapi, getServices(strapi))
  }),
})
