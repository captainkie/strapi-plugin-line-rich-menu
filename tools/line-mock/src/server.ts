import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { inspectImage } from '@fosivo/line-rich-menu-core'
import { createStore } from './store.js'

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

export function createServer(): FastifyInstance {
  const app = Fastify({ logger: false })
  const store = createStore()

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
    const richMenuId = store.nextId()
    store.menus.set(richMenuId, { richMenuId, payload: req.body })
    return reply.send({ richMenuId })
  })

  app.get('/v2/bot/richmenu/list', async () => ({
    richmenus: [...store.menus.values()].map((m) => ({ richMenuId: m.richMenuId })),
  }))

  app.get('/v2/bot/richmenu/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const found = store.menus.get(id)
    if (!found) return reply.code(404).send({ message: 'not found' })
    // `image` เป็นส่วนขยายเฉพาะของ mock นี้ (ไม่มีใน LINE จริง) ให้เทสต์ integration
    // ตรวจสอบได้ว่า dimension ของรูปที่อัปจริงตรงกับ size ที่ menu ประกาศไว้ (ดูสเปก 4.1)
    return reply.send({ richMenuId: found.richMenuId, ...(found.image ? { image: found.image } : {}) })
  })

  app.delete('/v2/bot/richmenu/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!store.menus.delete(id)) return reply.code(404).send({ message: 'not found' })
    if (store.defaultMenuId === id) store.defaultMenuId = null
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/:id/content', async (req, reply) => {
    const { id } = req.params as { id: string }
    const menu = store.menus.get(id)
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

  app.get('/v2/bot/user/all/richmenu', async (_req, reply) => {
    if (store.defaultMenuId === null) return reply.code(404).send({ message: 'no default richmenu' })
    return reply.send({ richMenuId: store.defaultMenuId })
  })

  app.post('/v2/bot/user/all/richmenu/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!store.menus.has(id)) return reply.code(404).send({ message: 'not found' })
    store.defaultMenuId = id
    return reply.send({})
  })

  app.delete('/v2/bot/user/all/richmenu', async (_req, reply) => {
    store.defaultMenuId = null
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/alias', async (req, reply) => {
    const { richMenuAliasId, richMenuId } = req.body as { richMenuAliasId: string; richMenuId: string }
    store.aliases.set(richMenuAliasId, richMenuId)
    return reply.send({})
  })

  app.post('/v2/bot/richmenu/alias/:aliasId', async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    const { richMenuId } = req.body as { richMenuId: string }
    store.aliases.set(aliasId, richMenuId)
    return reply.send({})
  })

  app.delete('/v2/bot/richmenu/alias/:aliasId', async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    store.aliases.delete(aliasId)
    return reply.send({})
  })

  app.get('/v2/bot/richmenu/alias/:aliasId', async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    const richMenuId = store.aliases.get(aliasId)
    if (richMenuId === undefined) return reply.code(404).send({ message: 'alias not found' })
    return reply.send({ richMenuAliasId: aliasId, richMenuId })
  })

  app.get('/v2/bot/richmenu/alias/list', async () => ({
    aliases: [...store.aliases.entries()].map(([richMenuAliasId, richMenuId]) => ({ richMenuAliasId, richMenuId })),
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
