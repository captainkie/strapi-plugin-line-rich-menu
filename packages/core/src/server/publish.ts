import { LineNotFoundError } from '../errors.js'
import type { LineClient } from '../line/client.js'
import { compensate, plan } from '../publish/machine.js'
import type { Step } from '../publish/machine.js'
import { errorCodeOf, type AuditWriter } from './audit.js'
import { capturePriorState, restorePriorState } from './compensation.js'
import { MenuNotFoundError, MenuNotReadyError, PublishAlreadyRunningError } from './errors.js'
import type { ImageStore } from './images.js'
import { buildPayload, publishedAliasesOf } from './payload.js'
import type { RateLimiter } from './rate-limit.js'
import type { LoggerLike } from './scrub.js'
import type { MenuStatus, Repo, RichMenuRow } from './types.js'

/**
 * เวลาสูงสุดที่ publish หนึ่งครั้งควรใช้จริง ๆ — เกินนี้แปลว่า process ก่อนหน้าตายไปแล้วกลางทาง
 * ไม่ใช่ยังทำงานอยู่จริง แนวคิดเดียวกับ TTL ของ schedule lock (`lock.ts` §10): สถานะที่ค้างเกินเวลา
 * ที่เป็นไปได้จริงต้องถูกมองว่า "ตายแล้ว" ไม่งั้น publish ที่ crash กลางทางจะบล็อกเมนูนั้นทุก publish
 * ในอนาคตตลอดไป เพราะไม่มีใครมาเขียน status ให้พ้นจาก 'publishing' อีกเลย (catch block ที่ปกติ
 * เขียน 'failed' ไม่มีโอกาสรันถ้า process ตายไปก่อนถึงมัน)
 *
 * ใช้ `updatedAt` ของแถวเมนูเป็นตัวจับเวลา ไม่ใช่คอลัมน์ใหม่ — Strapi เขียนให้เองทุกครั้งที่มีการ
 * `update` (รวมถึงตอนเขียน `status: 'publishing'` ตอนเริ่ม) จึงมีอยู่แล้วในทั้ง v4 และ v5 โดยไม่ต้อง
 * เพิ่ม schema ใหม่
 */
const PUBLISHING_STALE_AFTER_MS = 5 * 60 * 1000

function isStalePublish(menu: RichMenuRow, at: Date): boolean {
  return at.getTime() - Date.parse(menu.updatedAt) > PUBLISHING_STALE_AFTER_MS
}

export interface PublishDeps {
  client: LineClient
  menus: Repo<RichMenuRow>
  audit: AuditWriter
  limiter: RateLimiter
  store: ImageStore
  logger: LoggerLike
  now(): Date
}

export interface PublishRequest {
  menuId: string
  actorId: string | null
  setAsDefault: boolean
}

export interface PublishOutcome {
  lineRichMenuId: string
  status: MenuStatus
}

/** ฟิลด์ที่ผู้ตรวจอยากรู้ว่า "จากอะไรเป็นอะไร" — ไม่ใช่ทั้งแถวซึ่งมี areas ยาวเป็นหน้า */
function snapshotOf(menu: RichMenuRow) {
  return {
    status: menu.status,
    lineRichMenuId: menu.lineRichMenuId,
    aliasId: menu.aliasId,
    publishedAt: menu.publishedAt,
  }
}

export async function publishMenu(deps: PublishDeps, request: PublishRequest): Promise<PublishOutcome> {
  const { client, menus, audit, limiter, store, logger, now } = deps

  const menu = await menus.findOne(request.menuId)
  if (menu === null) throw new MenuNotFoundError(`rich menu ${request.menuId} does not exist`)
  if (menu.normalizedFileId === null || menu.normalizedMime === null) {
    throw new MenuNotReadyError('no_image')
  }

  // I4 — status: 'publishing' ที่ยังไม่หมดอายุคือหลักฐานว่ามี publish ของเมนูนี้ทำงานอยู่จริง
  // (หรืออย่างน้อยก็ยังไม่นานพอจะฟันธงว่ามันตายไปแล้ว) เช็คนี้อยู่นอก audit.around ด้วยเหตุผล
  // เดียวกับ rate limit ข้างล่าง — คำขอที่ถูกปฏิเสธตรงนี้ไม่ได้แตะ LINE เลย
  if (menu.status === 'publishing' && !isStalePublish(menu, now())) {
    throw new PublishAlreadyRunningError(menu.id)
  }

  // rate limit อยู่ **นอก** audit.around โดยตั้งใจ — คำขอที่ถูกปฏิเสธตรงนี้ไม่ได้แตะ LINE เลย
  // สเปก §13.2 ข้อ 8 บังคับให้ "ทุก action ที่แตะ LINE" มีแถว audit ซึ่งไม่รวมเคสนี้
  // และการปล่อยให้กดรัวสร้างแถว audit ได้ คือการเปิดทางให้ถมตาราง audit ด้วยคลิกเดียว
  // FLAG สำหรับผู้รีวิว: ถ้าอยากได้หลักฐานว่ามีคนพยายามกดรัว ต้องเก็บที่ log ไม่ใช่ที่ audit
  limiter.take(menu.channelId)

  const siblings = await menus.findMany({ filters: { channelId: menu.channelId } })
  const payload = buildPayload(menu, publishedAliasesOf(siblings))
  const image = await store.read(menu.normalizedFileId)
  const mime = menu.normalizedMime

  return audit.around(
    {
      actorId: request.actorId,
      action: 'publish',
      richMenuId: menu.id,
      channelId: menu.channelId,
      before: snapshotOf(menu),
    },
    async () => {
      await menus.update(menu.id, { status: 'publishing', lastError: null })

      const steps = plan({
        ...(menu.aliasId === null ? {} : { aliasId: menu.aliasId }),
        setAsDefault: request.setAsDefault,
        ...(menu.lineRichMenuId === null ? {} : { previousLineRichMenuId: menu.lineRichMenuId }),
      })

      // อ่านก่อนแตะ — ต้องเกิดก่อน step แรกที่เปลี่ยนอะไรบน LINE (design notes ข้อ 2)
      const prior = await capturePriorState(client, {
        aliasId: menu.aliasId,
        willSetDefault: request.setAsDefault,
      })

      /**
       * ขั้นที่ถูก **พยายาม** ไม่ใช่ขั้นที่ *ทำสำเร็จ* — `client.ts` ไม่มี try/catch รอบ `await fetchImpl`
       * socket ที่ตายหลัง LINE รับคำสั่งไปแล้วจึงโผล่เป็น error ตรง ๆ ทั้งที่ผลถูก apply ไปแล้วจริง
       * ถ้าไล่ compensation จากขั้นที่สำเร็จ `did('setDefault')` จะเป็น false การคืนค่าไม่ถูกเดินเลย
       * แล้วเมนูใหม่ถูกลบทิ้ง → default บน LINE ชี้เมนูที่ไม่มีอยู่ ซึ่งเป็นสถานะเดียวกับ C4 เป๊ะ ๆ
       * (เวอร์ชัน `upsertAlias` แย่กว่า เพราะ alias ที่เพิ่งเกิดขึ้นจะไม่มีใครมาเก็บกวาดอีกเลย)
       *
       * ปลอดภัยเพราะการคืนค่าทุกตัว idempotent และสองเคสที่ "เกินไป" โดยไม่มีพิษภัย —
       * `deleteAlias` กับ alias ที่ไม่เคยมี และ `clearDefault` ตอนที่ไม่เคยมี default — ตอบ 404/200
       * ซึ่ง `restorePriorState` ถือว่าเป็นผลลัพธ์ที่ต้องการอยู่แล้ว ไม่ใช่การคืนค่าที่ล้ม
       */
      const attempted: Step[] = []
      let createdId: string | null = null

      try {
        for (const step of steps) {
          attempted.push(step)
          switch (step.kind) {
            case 'validate':
              await client.validateRichMenu(payload)
              break
            case 'create':
              createdId = await client.createRichMenu(payload)
              // เขียนทันทีก่อนขั้นถัดไป (สเปก §8 ข้อ 2) — process ตายตรงนี้แล้วยังมี id
              // ให้ reconcile job เก็บกวาดได้ ถ้ารอเขียนตอนจบ เมนูจะกลายเป็นขยะที่ไม่มีใครรู้จัก
              await menus.update(menu.id, { lineRichMenuId: createdId })
              break
            case 'uploadImage':
              await client.uploadContent(createdId!, image, mime)
              break
            case 'upsertAlias':
              if (prior.aliasTarget === null) await client.createAlias(step.aliasId, createdId!)
              else await client.updateAlias(step.aliasId, createdId!)
              break
            case 'setDefault':
              await client.setDefault(createdId!)
              break
            case 'deleteOld':
              // เมนูเก่าที่หายไปแล้ว (ลบจาก LINE OA Manager หรือ publish รอบก่อนลบไปแล้ว)
              // ไม่ใช่เหตุให้ publish รอบนี้ล้ม — ผลลัพธ์ที่ต้องการคือ "เมนูเก่าไม่อยู่" ซึ่งเป็นจริงแล้ว
              await client.deleteRichMenu(step.lineRichMenuId).catch((error: unknown) => {
                if (!(error instanceof LineNotFoundError)) throw error
              })
              break
          }
        }
      } catch (error) {
        const restored = await restorePriorState(client, prior, { aliasId: menu.aliasId, attempted }, logger)

        // เมนูค้างหนึ่งตัวแย่กว่า "LINE ชี้เมนูที่ถูกลบไปแล้ว" เสมอ: อย่างแรกกินโควตาและมีปุ่มให้เก็บกวาด
        // ทีหลัง (reconcile) ส่วนอย่างหลังคือ end user ทุกคนเปิดแชทมาไม่เห็นเมนูเลย และเก็บกวาดไม่ได้
        // เพราะเมนูที่ต้องเอากลับมาไม่มีอยู่แล้ว — เวอร์ชัน alias ยังลามไปพัง `richmenuswitch` ของ
        // เมนูอื่นที่ไม่เกี่ยวกับ publish รอบนี้เลยด้วย
        const safeToDelete = restored.defaultRestored && restored.aliasRestored

        // (I7) id ของเมนูที่จงใจปล่อยทิ้งไว้บน LINE เพราะคืนค่าไม่สำเร็จ — `null` ถ้าไม่มีอะไรถูกทิ้งไว้
        // (ลบสำเร็จตามปกติ หรือไม่เคยไปถึงขั้น create เลย) ไปโผล่ในแถว audit ผ่าน `auditAfter` ข้างล่าง
        // เพราะนี่คือเมนูที่มีคนต้องรู้จักไว้ — มันอยู่บน LINE จริงและไม่มีแถวไหนใน DB อ้างถึงมันอีกแล้ว
        let keptMenuId: string | null = null

        for (const action of compensate(attempted)) {
          if (action.kind === 'deleteCreated' && createdId !== null) {
            if (!safeToDelete) {
              keptMenuId = createdId
              logger.error(
                'line-rich-menu: keeping the menu created during a failed publish because the prior state could not be restored',
                { createdId, ...restored },
              )
              continue
            }
            await client.deleteRichMenu(createdId).catch((deleteError: unknown) => {
              logger.error('line-rich-menu: failed to delete the menu created during a failed publish', {
                createdId, error: deleteError,
              })
            })
          }
        }

        // แถว audit ของ publish ที่ล้มต้องตอบคำถามที่สำคัญที่สุดได้เอง: "เราทิ้ง LINE ไว้ในสภาพพังไหม"
        // ไม่ใช่แค่ error code เดิม — ติดผลของ compensation ไว้ที่ error ก่อน throw เพราะ audit.around
        // เป็นคนเขียนแถว failure จริง ๆ (ดู audit.ts:auditAfterOf) ไม่ใช้ error ชนิดใหม่เพราะ error
        // ที่ล้มอาจเป็นของ LINE ตัวจริง (LineServerError ฯลฯ) และผู้เรียกที่ห่ออยู่นอกนี้ (ถ้ามี)
        // ยังต้องเห็น error ชนิดเดิม ไม่ใช่ wrapper ใหม่
        if (error !== null && typeof error === 'object') {
          Object.assign(error, {
            auditAfter: {
              defaultRestored: restored.defaultRestored,
              aliasRestored: restored.aliasRestored,
              keptMenuId,
            },
          })
        }

        await menus.update(menu.id, {
          status: 'failed',
          lastError: errorCodeOf(error),
          // คืนค่าที่อ่านไว้ตอนต้น (บรรทัด `menus.findOne`) ไม่ใช่ null — เมนูที่ถูกลบไปข้างบนคือ
          // `createdId` ของรอบนี้เท่านั้น ส่วนเมนูเวอร์ชันก่อนหน้ายังอยู่บน LINE และถูก
          // `restorePriorState` ตั้งกลับเป็น default ให้แล้ว
          //
          // การเคลียร์เป็น null ทำให้เมนูที่ยังใช้งานอยู่จริงไม่มีแถวไหนอ้างถึงอีก `reconcileChannel`
          // จึงรายงานมันเป็น **กำพร้า** แล้วหน้า ChannelSettings ยื่นปุ่มลบให้ผู้ใช้กด — ผู้ใช้ที่มีสิทธิ์
          // publish จะลบเมนูที่ลูกค้ากำลังใช้อยู่ทิ้งจากรายงานที่บอกเขาว่ามันเป็นขยะ และ `deleteOrphan`
          // ก็เห็นด้วยเพราะตามนิยามของมันเองมันกำพร้าจริง
          //
          // ยกเว้นกรณีที่คืน default ไม่สำเร็จ: ตอนนั้น default บน LINE ยังเป็นเมนูที่รอบนี้เพิ่งสร้าง
          // (ซึ่งเราจงใจไม่ลบทิ้ง) แถวจึงต้องชี้ตัวนั้น ไม่ใช่เมนูเก่าที่ไม่มีใครใช้แล้ว กฎเดียวกันทั้งสอง
          // สาขา — "แถวต้องชี้สิ่งที่ LINE ใช้อยู่จริง" เพื่อไม่ให้ reconcile ชี้ปุ่มลบไปที่ default
          lineRichMenuId: restored.defaultRestored ? menu.lineRichMenuId : createdId,
        })
        throw error
      }

      await menus.update(menu.id, {
        status: 'published',
        publishedAt: now().toISOString(),
        lastError: null,
      })
      return { lineRichMenuId: createdId!, status: 'published' as const }
    },
    (outcome) => ({ status: outcome.status, lineRichMenuId: outcome.lineRichMenuId }),
  )
}
