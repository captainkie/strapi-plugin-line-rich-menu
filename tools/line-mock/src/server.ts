import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
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
    return found ? reply.send({ richMenuId: found.richMenuId }) : reply.code(404).send({ message: 'not found' })
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
    menu.image = { mime: String(req.headers['content-type']), bytes: buffer.length }
    return reply.send({})
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
