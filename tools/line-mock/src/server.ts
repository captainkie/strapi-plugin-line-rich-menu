import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { inspectImage } from '@fosivo/line-rich-menu-core'
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

  app.post('/v2/bot/user/:userId/richmenu/:id', async (_req, reply) => reply.send({}))

  return app
}

// รันเป็นเซิร์ฟเวอร์เดี่ยวสำหรับ demo: pnpm --filter @fosivo/line-mock start
if (process.argv[1]?.endsWith('server.ts')) {
  const port = Number(process.env['PORT'] ?? 4010)
  createServer()
    .listen({ port, host: '0.0.0.0' })
    .then(() => console.log(`line-mock listening on ${port}`))
}
