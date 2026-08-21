import type { Services } from './container.js'
import type { StrapiV4 } from './strapi.js'

/**
 * ตัวชั่วคราว — Task 18 (scheduler) เขียนทับไฟล์นี้ด้วยของจริง
 * มีอยู่ตอนนี้เพื่อให้ `POST /schedules/tick` ของ Task 16 มี handler ที่ต่อครบเส้นทาง
 */
export async function runTick(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _strapi: StrapiV4,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _services: Services,
): Promise<{ due: number; claimed: number; done: number; failed: number }> {
  return { due: 0, claimed: 0, done: 0, failed: 0 }
}
