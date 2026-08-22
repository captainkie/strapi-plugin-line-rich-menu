import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { inspectImage, MAX_BULK_USER_IDS } from '@fosivo/line-rich-menu-core'
import { createStore, type MockStore } from './store.js'

interface Detail { property: string; message: string }

function validate(body: unknown): Detail[] {
  const details: Detail[] = []
  const b = body as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return [{ property: '(root)', message: 'body must be an object' }]
  const chatBarText = b['chatBarText']
  if (typeof chatBarText !== 'string' || chatBarText.length < 1 || chatBarText.length > 14) {
    details.push({ property: 'chatBarText', message: 'must be 1-14 characters' })
  }
  const areas = b['areas']
  if (!Array.isArray(areas) || areas.length < 1 || areas.length > 20) {
    details.push({ property: 'areas', message: 'must contain 1-20 items' })
  }
  return details
}

type BatchOp =
  | { type: 'link'; from: string; to: string }
  | { type: 'unlink'; from: string }
  | { type: 'unlinkAll' }

/**
 * ใช้ทั้งจาก /richmenu/batch (ตรวจก่อนแตะ state จริง) และ /richmenu/validate/batch (ตรวจอย่างเดียว
 * ไม่แตะ state) — สองเส้นทางต้องเห็นพ้องกันว่าอะไรคือ operations ที่ใช้ได้ ไม่งั้น validate ผ่านแต่
 * batch จริงปฏิเสธ (หรือกลับกัน) ซึ่งขัดกับจุดประสงค์ที่ validate มีไว้เช็คก่อนเสียโควตา 3 ครั้ง/ชม.
 */
function validateBatchBody(body: unknown): Detail[] {
  const details: Detail[] = []
  const b = body as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return [{ property: '(root)', message: 'body must be an object' }]
  const operations = b['operations']
  if (!Array.isArray(operations) || operations.length < 1) {
    return [{ property: 'operations', message: 'must contain at least 1 item' }]
  }
  let hasUnlinkAll = false
  operations.forEach((op: unknown, i: number) => {
    const o = op as Record<string, unknown> | null
    if (!o || typeof o !== 'object') {
      details.push({ property: `operations[${i}]`, message: 'must be an object' })
      return
    }
    if (o['type'] === 'link') {
      if (typeof o['from'] !== 'string') details.push({ property: `operations[${i}].from`, message: 'must be a string' })
      if (typeof o['to'] !== 'string') details.push({ property: `operations[${i}].to`, message: 'must be a string' })
    } else if (o['type'] === 'unlink') {
      if (typeof o['from'] !== 'string') details.push({ property: `operations[${i}].from`, message: 'must be a string' })
    } else if (o['type'] === 'unlinkAll') {
      hasUnlinkAll = true
    } else {
      details.push({ property: `operations[${i}].type`, message: 'must be link, unlink, or unlinkAll' })
    }
  })
  // ของจริง LINE ห้าม unlinkAll ปนกับ operation ชนิดอื่นในคำขอเดียว — ผสมกันแล้วความหมายกำกวม
  // (จะ unlink ทุกคนก่อนหรือหลัง link/unlink ที่เจาะจงคนอื่น ไม่มีนิยาม)
  if (hasUnlinkAll && operations.length > 1) {
    details.push({ property: 'operations', message: 'unlinkAll cannot be combined with other operation types' })
  }
  return details
}

/**
 * ตัวที่ทำให้เทสต์ "batch unlink ไม่แตะคนที่ถือเมนูอื่น" มีความหมาย — ต้อง match เฉพาะ userId ที่
 * ถือ richMenuId ตาม `from` เป๊ะ ไม่ใช่ล้าง links ทั้งก้อนแบบเข้าใจผิดว่า unlink คือ "เคลียร์ทุกคน"
 * (นั่นคือหน้าที่ของ unlinkAll ต่างหาก) เก็บ entries เป็น array ก่อนวนเพราะกำลังจะ mutate map
 * ระหว่างวนอยู่
 */
function applyBatchOperations(store: MockStore, operations: BatchOp[]): void {
  for (const op of operations) {
    if (op.type === 'link') {
      for (const [userId, richMenuId] of [...store.links]) {
        if (richMenuId === op.from) store.links.set(userId, op.to)
      }
    } else if (op.type === 'unlink') {
      for (const [userId, richMenuId] of [...store.links]) {
        if (richMenuId === op.from) store.links.delete(userId)
      }
    } else {
      store.links.clear()
    }
  }
}

/**
 * store หนึ่งใบต่อหนึ่ง access token — ไม่ใช่ใบเดียวทั้งเซิร์ฟเวอร์
 *
 * ของเดิมตรวจแค่ว่า "มี Bearer header อยู่" แล้วใช้ store ใบเดียวไม่ว่า token จะเป็นอะไร คือ
 * ของปลอมที่เป็น single-tenant ยืนแทน API ที่เป็น multi-tenant ผลคือข้อบกพร่องข้าม channel
 * **ทุกชนิด** มองไม่เห็นจาก acceptance gate โดยโครงสร้าง: tick ที่ยิงเมนูของ OA หนึ่งด้วย token
 * ของอีก OA หนึ่งจะ "ทำงานได้" อย่างสมบูรณ์แบบในของปลอมใบนี้ เพราะทั้งสอง OA ใช้ store ใบเดียวกัน
 */
export function createServer(): FastifyInstance {
  const app = Fastify({ logger: false })

  // นับรวมทั้งเซิร์ฟเวอร์ ไม่ใช่ต่อ store — ดูเหตุผลที่ `createStore` ใน store.ts
  let counter = 0
  const nextId = (): string => `richmenu-${(++counter).toString().padStart(8, '0')}`
  const stores = new Map<string, MockStore>()

  // request id ของ batch ก็นับแบบเดียวกับ richmenu id (ไม่ใช้ของสุ่ม) เพื่อให้ผลลัพธ์ของปลอมนี้
  // ทำนายได้เหมือนกันทั้งไฟล์ — ไม่ต้องพึ่ง crypto.randomUUID ที่เทสต์เทียบค่าตรง ๆ ไม่ได้
  let requestCounter = 0
  const nextRequestId = (): string => `req-${(++requestCounter).toString().padStart(8, '0')}`

  function storeFor(req: FastifyRequest): MockStore {
    const token = (req.headers.authorization ?? '').slice('Bearer '.length)
    const found = stores.get(token)
    if (found !== undefined) return found
    const created = createStore(nextId)
    stores.set(token, created)
    return created
  }

  app.addContentTypeParser(
    ['image/png', 'image/jpeg'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  )

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      // ต้อง return reply เพื่อตัดวงจร ไม่งั้น Fastify จะเดินต่อไป handler
      return reply.code(401).send({ message: 'Authorization header required' })
    }
    return undefined
  })

  app.get('/v2/bot/info', async () => ({
    userId: 'Umock0000',
    basicId: '@mock',
    displayName: 'Mock LINE OA',
  }))

  app.post('/v2/bot/richmenu/validate', async (req, reply) => {
    const details = validate(req.body)
    if (details.length > 0) return reply.code(400).send({ message: 'invalid', details })
    return reply.code(200).send()
  })

  app.post('/v2/bot/richmenu', async (req, reply) => {
    const details = validate(req.body)
    if (details.length > 0) return reply.code(400).send({ message: 'invalid', details })
    const store = storeFor(req)
    const richMenuId = store.nextId()
    store.menus.set(richMenuId, { richMenuId, payload: req.body })
    return reply.send({ richMenuId })
  })

  app.get('/v2/bot/richmenu/list', async (req) => ({
    richmenus: [...storeFor(req).menus.values()].map((m) => ({ richMenuId: m.richMenuId })),
  }))

  app.get('/v2/bot/richmenu/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const found = storeFor(req).menus.get(id)
    if (!found) return reply.code(404).send({ message: 'not found' })
    // `image` เป็นส่วนขยายเฉพาะของ mock นี้ (ไม่มีใน LINE จริง) ให้เทสต์ integration
    // ตรวจสอบได้ว่า dimension ของรูปที่อัปจริงตรงกับ size ที่ menu ประกาศไว้ (ดูสเปก 4.1)
    return reply.send({ richMenuId: found.richMenuId, ...(found.image ? { image: found.image } : {}) })
  })

  app.delete('/v2/bot/richmenu/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const store = storeFor(req)
    if (!store.menus.delete(id)) return reply.code(404).send({ message: 'not found' })
    if (store.defaultMenuId === id) store.defaultMenuId = null
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/:id/content', async (req, reply) => {
    const { id } = req.params as { id: string }
    const menu = storeFor(req).menus.get(id)
    if (!menu) return reply.code(404).send({ message: 'not found' })
    const buffer = req.body as Buffer
    if (buffer.length > 1_048_576) {
      return reply.code(400).send({ message: 'invalid', details: [{ property: 'content', message: 'exceeds 1MB' }] })
    }
    // เช่นเดียวกับ LINE จริง mock นี้ไม่ตรวจว่าเนื้อไฟล์เป็นรูปจริงหรือไม่ (แค่ตรวจขนาด) —
    // ยังยอมรับ payload ทดสอบที่เป็น byte ล้วน ๆ เหมือนเดิม (ดู server.test.ts) แต่ถ้าอ่านเป็นรูป
    // ได้จริง จะเก็บ dimension ไว้ให้เทสต์ integration (ดู tests/integration.test.ts) ยืนยันได้ว่า
    // รูปที่อัปจริงตรงกับ size ที่ menu ประกาศไว้ตอน create เป๊ะ — อ่านไม่ออกก็แค่ไม่มี width/height
    // ติดมา ไม่ reject การอัปโหลด
    const dimensions = await inspectImage(buffer).catch(() => null)
    menu.image = {
      mime: String(req.headers['content-type']),
      bytes: buffer.length,
      ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
    }
    return reply.send({})
  })

  app.get('/v2/bot/user/all/richmenu', async (req, reply) => {
    const { defaultMenuId } = storeFor(req)
    if (defaultMenuId === null) return reply.code(404).send({ message: 'no default richmenu' })
    return reply.send({ richMenuId: defaultMenuId })
  })

  app.post('/v2/bot/user/all/richmenu/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const store = storeFor(req)
    // 404 ตรงนี้คือสิ่งที่ทำให้ "ตั้ง default ด้วย id ของ OA อื่น" ถูกจับได้ — ของเดิมที่ใช้ store
    // ใบเดียวจะเจอ id นั้นเสมอ แล้วตอบ 200 ให้กับคำขอที่ผิด OA
    if (!store.menus.has(id)) return reply.code(404).send({ message: 'not found' })
    store.defaultMenuId = id
    return reply.send({})
  })

  app.delete('/v2/bot/user/all/richmenu', async (req, reply) => {
    storeFor(req).defaultMenuId = null
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/alias', async (req, reply) => {
    const { richMenuAliasId, richMenuId } = req.body as { richMenuAliasId: string; richMenuId: string }
    storeFor(req).aliases.set(richMenuAliasId, richMenuId)
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/alias/:aliasId', async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    const { richMenuId } = req.body as { richMenuId: string }
    storeFor(req).aliases.set(aliasId, richMenuId)
    return reply.send({})
  })

  app.delete('/v2/bot/richmenu/alias/:aliasId', async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    storeFor(req).aliases.delete(aliasId)
    return reply.send({})
  })

  app.get('/v2/bot/richmenu/alias/:aliasId', async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    const richMenuId = storeFor(req).aliases.get(aliasId)
    if (richMenuId === undefined) return reply.code(404).send({ message: 'alias not found' })
    return reply.send({ richMenuAliasId: aliasId, richMenuId })
  })

  app.get('/v2/bot/richmenu/alias/list', async (req) => ({
    aliases: [...storeFor(req).aliases.entries()]
      .map(([richMenuAliasId, richMenuId]) => ({ richMenuAliasId, richMenuId })),
  }))

  // เดิม route นี้ตอบ {} เฉยๆ ไม่บันทึกอะไรเลย — ทำให้เทสต์ lifecycle ผ่านได้โดยไม่พิสูจน์ว่า user
  // ถือเมนูจริง ตอนนี้เขียนลง links เหมือนเส้นทางอื่นทั้งหมดที่แตะ per-user state
  app.post('/v2/bot/user/:userId/richmenu/:id', async (req, reply) => {
    const { userId, id } = req.params as { userId: string; id: string }
    storeFor(req).links.set(userId, id)
    return reply.send({})
  })

  app.get('/v2/bot/user/:userId/richmenu', async (req, reply) => {
    const { userId } = req.params as { userId: string }
    const richMenuId = storeFor(req).links.get(userId)
    if (richMenuId === undefined) return reply.code(404).send({ message: 'not found' })
    return reply.send({ richMenuId })
  })

  app.delete('/v2/bot/user/:userId/richmenu', async (req, reply) => {
    const { userId } = req.params as { userId: string }
    storeFor(req).links.delete(userId)
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/bulk/link', async (req, reply) => {
    const { richMenuId, userIds } = req.body as { richMenuId?: unknown; userIds?: unknown }
    if (typeof richMenuId !== 'string' || !Array.isArray(userIds)) {
      return reply.code(400).send({
        message: 'invalid',
        details: [{ property: '(root)', message: 'richMenuId and userIds are required' }],
      })
    }
    // ของจริง LINE ปฏิเสธคำขอเกิน 500 userId ด้วย 400 — ใช้ค่าเดียวกับที่ LineClient.bulkLink เช็ค
    // ไว้ก่อนยิง (MAX_BULK_USER_IDS) ไม่ประกาศ 500 ซ้ำอีกที่ ไม่งั้นสองค่านี้จะเพี้ยนกันวันหลัง
    if (userIds.length > MAX_BULK_USER_IDS) {
      return reply.code(400).send({
        message: 'invalid',
        details: [{ property: 'userIds', message: `must contain at most ${MAX_BULK_USER_IDS} items` }],
      })
    }
    const store = storeFor(req)
    for (const userId of userIds) store.links.set(String(userId), richMenuId)
    return reply.code(202).send()
  })

  app.post('/v2/bot/richmenu/bulk/unlink', async (req, reply) => {
    const { userIds } = req.body as { userIds?: unknown }
    if (!Array.isArray(userIds)) {
      return reply.code(400).send({
        message: 'invalid',
        details: [{ property: 'userIds', message: 'must be an array' }],
      })
    }
    if (userIds.length > MAX_BULK_USER_IDS) {
      return reply.code(400).send({
        message: 'invalid',
        details: [{ property: 'userIds', message: `must contain at most ${MAX_BULK_USER_IDS} items` }],
      })
    }
    const store = storeFor(req)
    for (const userId of userIds) store.links.delete(String(userId))
    return reply.code(202).send()
  })

  app.post('/v2/bot/richmenu/batch', async (req, reply) => {
    const details = validateBatchBody(req.body)
    if (details.length > 0) return reply.code(400).send({ message: 'invalid', details })
    const { operations } = req.body as { operations: BatchOp[] }
    applyBatchOperations(storeFor(req), operations)
    // ของจริงส่ง request id กลับทาง header `x-line-request-id` — LineClient.batchControl
    // (packages/core/src/line/client.ts) อ่านจากตรงนั้น ไม่ใช่จาก body ต้องตอบให้ตรงไม่งั้น
    // batchProgress ฝั่งเรียกจะได้ requestId เป็น null เสมอ (แนบใน body ซ้ำไว้ด้วยเผื่อผู้เรียกอื่นอ่านจากตรงนั้น
    // แต่ header คือแหล่งที่ LineClient ใช้จริง — ต้องเป็นค่าเดียวกัน ไม่ใช่เรียก nextRequestId() ซ้ำ)
    const requestId = nextRequestId()
    return reply.code(202).header('x-line-request-id', requestId).send({ requestId })
  })

  // ตรวจ operations ก่อนยิง batch จริง (โควตาแค่ 3 ครั้ง/ชม.) — validation เดียวกับ /richmenu/batch
  // เป๊ะ แต่ไม่แตะ links เลย ถึงจะ valid ก็ไม่มีอะไรเปลี่ยนในสถานะ
  app.post('/v2/bot/richmenu/validate/batch', async (req, reply) => {
    const details = validateBatchBody(req.body)
    if (details.length > 0) return reply.code(400).send({ message: 'invalid', details })
    return reply.code(200).send()
  })

  app.get('/v2/bot/richmenu/progress/batch', async (_req, reply) => {
    // ของปลอมนี้ไม่มีคิว — /richmenu/batch ข้างบนทำงานเสร็จสมบูรณ์ในคำขอเดียวเสมอ (synchronous)
    // ดังนั้น 'succeeded' คือคำตอบที่ตรงความจริงของ mock นี้ ไม่ใช่การเดา 'ongoing'/'failed' ไม่มีทางเกิด
    const now = new Date().toISOString()
    return reply.send({ phase: 'succeeded', acceptedTime: now, completedTime: now })
  })

  return app
}

// รันเป็นเซิร์ฟเวอร์เดี่ยวสำหรับ demo: pnpm --filter @fosivo/line-mock start
if (process.argv[1]?.endsWith('server.ts')) {
  const port = Number(process.env['PORT'] ?? 4010)
  createServer()
    .listen({ port, host: '0.0.0.0' })
    .then(() => console.log(`line-mock listening on ${port}`))
}
