import { LineNotFoundError } from '../errors.js'
import type { LineClient } from '../line/client.js'
import { compensate, plan } from '../publish/machine.js'
import type { Step } from '../publish/machine.js'
import { errorCodeOf, type AuditWriter } from './audit.js'
import { capturePriorState, restorePriorState } from './compensation.js'
import { MenuNotFoundError, MenuNotReadyError } from './errors.js'
import type { ImageStore } from './images.js'
import { buildPayload, publishedAliasesOf } from './payload.js'
import type { RateLimiter } from './rate-limit.js'
import type { LoggerLike } from './scrub.js'
import type { MenuStatus, Repo, RichMenuRow } from './types.js'

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

      const completed: Step[] = []
      let createdId: string | null = null

      try {
        for (const step of steps) {
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
          completed.push(step)
        }
      } catch (error) {
        await restorePriorState(client, prior, { aliasId: menu.aliasId, completed }, logger)

        for (const action of compensate(completed)) {
          if (action.kind === 'deleteCreated' && createdId !== null) {
            await client.deleteRichMenu(createdId).catch((deleteError: unknown) => {
              logger.error('line-rich-menu: failed to delete the menu created during a failed publish', {
                createdId, error: deleteError,
              })
            })
          }
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
          lineRichMenuId: menu.lineRichMenuId,
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
