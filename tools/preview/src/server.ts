import http from 'node:http'
import { renderPage } from './page.js'

export function createServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.url !== '/' && req.url !== '/index.html') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    // สร้างใหม่ทุกครั้งที่โหลด เพื่อให้แก้ bounds แล้วรีเฟรชเห็นผลทันที
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(renderPage())
  })
}

if (process.argv[1]?.endsWith('server.ts')) {
  const port = Number(process.env['PORT'] ?? 4020)
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`preview: http://127.0.0.1:${port}`)
  })
}
