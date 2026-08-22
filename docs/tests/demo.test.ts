import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — สคริปต์ปฏิบัติการเป็น .mjs ล้วน ไม่มี .d.ts และไม่ควรมี
import { BASE_PERMISSIONS, CHANNEL_SETTINGS_PERMISSION, DEMO_ROLE_CODE, demoPermissions } from '../../examples/v5-app/scripts/demo-restrict.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))

const dockerfile = readFileSync(`${root}examples/v5-app/Dockerfile`, 'utf8')
const entrypoint = readFileSync(`${root}examples/v5-app/docker-entrypoint.sh`, 'utf8')
const dockerignore = readFileSync(`${root}.dockerignore`, 'utf8')
const renderYaml = readFileSync(`${root}render.yaml`, 'utf8')
const demoWorkflow = readFileSync(`${root}.github/workflows/demo-image.yml`, 'utf8')
const demoDoc = readFileSync(`${root}docs/DEMO.md`, 'utf8')
const restrictScript = readFileSync(`${root}examples/v5-app/scripts/demo-restrict.mjs`, 'utf8')

/**
 * The demo targets `examples/v5-app`, not `examples/v4-app` — this overturned the original plan's
 * "v4 only" call after the fact: SECURITY.md is about to state in public that Strapi 4 is EOL
 * with 86 unpatched advisories, and a public demo running that exact stack under our own domain
 * would contradict the document while it is being published. v4 stays supported; it just does
 * not get a public URL.
 */
describe('Dockerfile ของ demo v5', () => {
  it('build admin ตอนสร้าง image ไม่ใช่ตอนบูต', () => {
    expect(dockerfile).toMatch(/RUN\s+npm run build/)
    // ENTRYPOINT/CMD ทั้งคู่ต้องไม่มีคำว่า build อยู่เลย — ของที่รันตอนบูตต้องเป็นของที่ build เสร็จแล้ว
    const bootLines = [...dockerfile.matchAll(/^(ENTRYPOINT|CMD)\s+.*$/gm)].map((m) => m[0])
    expect(bootLines.length).toBeGreaterThan(0)
    for (const line of bootLines) expect(line).not.toMatch(/build/i)
  })

  it('ติดตั้งปลั๊กอินจาก tarball เหมือนที่ผู้ใช้ได้จาก npm ไม่ใช่ลิงก์จากเวิร์กสเปซ', () => {
    expect(dockerfile).toMatch(/\.tgz/)
    expect(dockerfile).not.toMatch(/workspace:/)
  })

  it('pack ปลั๊กอินจาก packages/strapi-v5 (v5 เท่านั้น) ไม่ใช่ strapi-v4', () => {
    expect(dockerfile).toMatch(/packages\/strapi-v5/)
    expect(dockerfile).not.toMatch(/packages\/strapi-v4/)
    expect(dockerfile).not.toMatch(/examples\/v4-app/)
  })

  it('รันด้วยผู้ใช้ที่ไม่ใช่ root', () => {
    expect(dockerfile).toMatch(/^USER\s+(?!root)\S+/m)
  })

  it('ตรึงเวอร์ชันของทุก base image ไม่ใช่ latest', () => {
    const from = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1]!)
    expect(from.length).toBeGreaterThan(0)
    for (const image of from) {
      expect(image, image).not.toMatch(/:latest$|^[^:]+$/)
    }
  })

  it('เปิดพอร์ตสาธารณะแค่พอร์ตเดียว (1337 ของ Strapi) — mock ไม่มี EXPOSE ของตัวเอง', () => {
    const exposed = [...dockerfile.matchAll(/^EXPOSE\s+(.+)$/gm)].map((m) => m[1]!.trim())
    expect(exposed).toEqual(['1337'])
  })

  // mock รันเป็นโปรเซสที่สองในคอนเทนเนอร์เดียวกัน ไม่ใช่ Render service
  // แยก entrypoint จึงต้องเป็นสคริปต์ ไม่ใช่ `npx strapi start` ตรง ๆ
  it('บูตผ่าน entrypoint script ไม่ใช่เรียก strapi ตรง ๆ ใน CMD', () => {
    expect(dockerfile).toMatch(/ENTRYPOINT\s+\[?["']?docker-entrypoint\.sh["']?/)
  })
})

describe('docker-entrypoint.sh — mock อยู่ในคอนเทนเนอร์เดียวกัน', () => {
  // ตัดคอมเมนต์ (บรรทัดที่ขึ้นต้นด้วย #) ออกก่อนตรวจ — คอมเมนต์อธิบายพวกนี้พูดถึงคำว่า "exec"
  // และ "127.0.0.1" เองด้วย (อธิบายว่าสคริปต์ทำอะไร) ถ้าตรวจจากข้อความทั้งไฟล์ตรง ๆ
  // ประโยคอธิบายในคอมเมนต์จะทำให้ด่านนี้เขียวได้โดยไม่ต้องมีโค้ดจริงเลย — พิสูจน์แล้วโดยเจตนา:
  // เปลี่ยน HOST=127.0.0.1 เป็น HOST=0.0.0.0 ในโค้ดจริงแล้วด่านที่ตรวจข้อความทั้งไฟล์ยังเขียวอยู่
  // เพราะคอมเมนต์หัวไฟล์มีคำว่า "bound to 127.0.0.1" กับ "exec\`s Strapi" อยู่ก่อนแล้ว (ดู
  // task-15-report.md ส่วน "break every new guard on purpose")
  const codeOnly = entrypoint
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')

  it('สตาร์ท line-mock เป็น background process', () => {
    expect(codeOnly).toMatch(/line-mock/)
    expect(codeOnly).toMatch(/&\s*$/m)
  })

  it('ผูก line-mock กับ 127.0.0.1 เท่านั้น ไม่ใช่ 0.0.0.0', () => {
    const mockBlock = codeOnly.split(/^\s*exec\b/m)[0] ?? ''
    expect(mockBlock).toMatch(/127\.0\.0\.1/)
    expect(mockBlock).not.toMatch(/0\.0\.0\.0/)
  })

  it('exec strapi เป็น PID 1 หลังจากสตาร์ท mock แล้ว', () => {
    expect(codeOnly).toMatch(/^\s*exec\s+.*strapi(\s|["'])/m)
  })
})

// อยู่ที่ root ของ repo โดยตั้งใจ ไม่ใช่ examples/v5-app/.dockerignore — Docker อ่าน
// .dockerignore จาก root ของ build context เท่านั้น ไม่ว่า -f จะชี้ไป Dockerfile ที่ไหน
// (พิสูจน์แล้วก่อนตัดสินใจ ดู task-15-report.md) และ context ของ image นี้ต้องเป็น root
// อยู่แล้วเพราะ stage แรกต้องเห็น packages/ กับ tools/ ซึ่งอยู่นอก examples/v5-app
describe('.dockerignore (ที่ root ของ repo)', () => {
  it('ไม่แพ็ก node_modules, ของที่อัปโหลดไว้ก่อนหน้า, หรือ .env เข้า build context', () => {
    expect(dockerignore).toMatch(/^node_modules$/m)
    expect(dockerignore).toMatch(/^\.env$/m)
    expect(dockerignore).toMatch(/uploads/)
  })
})

describe('render.yaml', () => {
  it('ใช้ image ที่ build แล้ว ไม่ใช่ให้ Render build เอง', () => {
    expect(renderYaml).toMatch(/image:/)
    expect(renderYaml).not.toMatch(/^\s*buildCommand:/m)
  })

  // mock อยู่ในคอนเทนเนอร์เดียวกับ Strapi ไม่ใช่ service ที่สองของ Render
  it('มี Render service เดียว ไม่ใช่สองตัว', () => {
    const services = [...renderYaml.matchAll(/^\s*-\s+type:\s*web\s*$/gm)]
    expect(services.length).toBe(1)
  })

  it('ชี้ LINE_API_BASE_URL / LINE_API_DATA_BASE_URL เข้า loopback ในคอนเทนเนอร์เดียวกัน ไม่ใช่ dashboard field', () => {
    expect(renderYaml).toMatch(/LINE_API_BASE_URL/)
    expect(renderYaml).toMatch(/LINE_API_DATA_BASE_URL/)
    expect(renderYaml).toMatch(/127\.0\.0\.1/)
  })

  // region ต้องคงที่ ไม่ใช่เพราะสวยงาม แต่เพราะ instance-hours ของ Render รวมกันทั้ง workspace
  it('ปักหมุด region ไว้ที่ singapore', () => {
    expect(renderYaml).toMatch(/region:\s*singapore/)
  })

  it('ประกาศตัวแปรที่จำเป็นทุกตัวโดยไม่มีค่าจริงอยู่ในไฟล์', () => {
    for (const name of [
      'APP_KEYS',
      'ADMIN_JWT_SECRET',
      'API_TOKEN_SALT',
      'TRANSFER_TOKEN_SALT',
      'JWT_SECRET',
      'DATABASE_URL',
      'LINE_RM_ENCRYPTION_KEY',
      'CLOUDINARY_NAME',
      'CLOUDINARY_KEY',
      'CLOUDINARY_SECRET',
    ]) {
      expect(renderYaml, name).toContain(name)
    }
    // ค่าลับต้องมาจาก dashboard ไม่ใช่จากไฟล์ที่ commit — gitleaks จะจับได้อยู่แล้วถ้าหลุด
    // แต่ด่านนี้จับก่อนถึงขั้นนั้น และบอกเหตุผลได้ชัดกว่า
    expect(renderYaml).not.toMatch(/sk_live|-----BEGIN|["'][A-Za-z0-9+/]{40,}["']/)
  })

  it('ค่าที่ sync: false ต้องกรอกในหน้า dashboard — ไม่ประกาศค่าจริงของ DATABASE_URL หรือ CLOUDINARY_* ไว้ในไฟล์', () => {
    for (const name of ['DATABASE_URL', 'CLOUDINARY_NAME', 'CLOUDINARY_KEY', 'CLOUDINARY_SECRET']) {
      const line = renderYaml.split('\n').find((l) => l.includes(`key: ${name}`))
      expect(line, `render.yaml ต้องมี key: ${name}`).toBeTruthy()
      const afterKeyLine = renderYaml.slice(renderYaml.indexOf(line!))
      const nextFewLines = afterKeyLine.split('\n').slice(0, 3).join('\n')
      expect(nextFewLines, name).toMatch(/sync:\s*false/)
    }
  })
})

describe('.github/workflows/demo-image.yml', () => {
  it('build จาก examples/v5-app/Dockerfile ไม่ใช่ v4', () => {
    expect(demoWorkflow).toMatch(/examples\/v5-app\/Dockerfile/)
    expect(demoWorkflow).not.toMatch(/examples\/v4-app/)
  })

  it('push ขึ้น ghcr.io', () => {
    expect(demoWorkflow).toMatch(/ghcr\.io/)
  })

  it('trigger ตอน push main ด้วย path filter ที่ครอบ tools/line-mock (มันรันอยู่ในอิมเมจด้วย)', () => {
    expect(demoWorkflow).toMatch(/tools\/line-mock/)
  })
})

describe('docs/DEMO.md', () => {
  it('บอกว่า demo เป็น v5 บน Strapi 5 ไม่ใช่ v4', () => {
    expect(demoDoc).toMatch(/v5-app|Strapi 5/)
  })

  // วัดจริง ไม่ใช่สืบทอดเหตุผลของ v4 (webpack) มาทั้งดุ้น
  it('รายงานตัวเลข RSS ที่วัดจริงของ Vite build เทียบกับ 512 MB ไม่ใช่กล่าวอ้างลอย ๆ', () => {
    expect(demoDoc).toMatch(/512\s?MB/i)
    expect(demoDoc).toMatch(/Vite/)
    expect(demoDoc).toMatch(/\d[\d,.]*\s?(MB|GB|MiB|GiB)/)
    // ห้ามยกเหตุผลของ v4 (webpack OOM) มาใช้ซ้ำ — สเปกของ v5 คือ Vite คนละตัว
    expect(demoDoc).not.toMatch(/webpack/i)
  })

  it('บอกว่า demo ชี้ไป line-mock ที่รันอยู่ในคอนเทนเนอร์เดียวกัน ไม่ใช่ LINE จริง', () => {
    expect(demoDoc).toMatch(/line-mock/i)
    expect(demoDoc).toMatch(/same container|คอนเทนเนอร์เดียวกัน|second process/i)
  })

  // ต้องมี section ห้าม uptime pinger พร้อม **เหตุผล** ไม่ใช่ประโยคเดียวลอย ๆ — เหตุผลคือสิ่งที่กัน
  // ไม่ให้คนถัดไปใส่ pinger กลับเข้ามา ส่วนตัวเลข 750 คือสิ่งที่ทำให้ข้อห้ามนั้นจับต้องได้
  it('มี section ห้าม uptime pinger พร้อมเหตุผลเรื่องโควตาที่แชร์กัน', () => {
    expect(demoDoc).toMatch(/^##+ .*(pinger|uptime)/im)
    expect(demoDoc).toMatch(/750/)
    expect(demoDoc).toMatch(/shared|share|พูล|แชร์/i)
  })

  it('บอก hostname สาธารณะของ demo', () => {
    expect(demoDoc).toContain('line-rich-menu.fosivo.com')
  })

  // ลำดับ DNS/proxy สี่ขั้นต้องเขียนเป็น prose ให้คนทำตามได้
  it('อธิบายลำดับ DNS/Cloudflare สี่ขั้น', () => {
    expect(demoDoc).toMatch(/custom domain/i)
    expect(demoDoc).toMatch(/dns-only/i)
    expect(demoDoc).toMatch(/proxied/i)
    expect(demoDoc).toMatch(/cf-ray/i)
  })

  // ด่านเดิมเช็คชื่อลูกค้าชื่อเดียวในไฟล์เดียว แต่กฎที่มันยืนแทนกว้างกว่านั้น: repo นี้เป็น public
  // ชื่อ service ภายในของใครก็ตามไม่ควรอยู่ในนี้ ไม่ว่าจะของลูกค้าหรือของผู้เผยแพร่เอง เพราะการ
  // ประกาศว่ามี host อะไรอยู่บนโดเมนไหนบ้างคือการแจก reconnaissance ให้ฟรี ๆ — เคยหลุดมาแล้ว
  // ทั้ง DEMO.md, render.yaml, entrypoint และตัวไฟล์เทสต์นี้เอง จึงต้องกวาดทุกไฟล์ ไม่ใช่ไฟล์เดียว
  it('ไม่มีชื่อ infrastructure ส่วนตัวหลุดเข้ามาในไฟล์ไหนเลย', () => {
    const forbidden = /roddonjai|autoflow|siteops|portainer|grafana/i
    for (const [name, text] of Object.entries({ demoDoc, renderYaml, entrypoint, dockerfile, dockerignore, demoWorkflow })) {
      expect(text, `${name} มีชื่อ infrastructure ส่วนตัวอยู่`).not.toMatch(forbidden)
    }
  })
})

/**
 * config/database.js ของ examples/v5-app เดิมรับแค่ host/port/user/password แยกช่อง — Neon
 * (และ managed Postgres ฟรีส่วนใหญ่) ให้ connection string เส้นเดียว ถ้าไม่แก้ไฟล์นี้ render.yaml
 * จะประกาศ DATABASE_URL ไว้เฉย ๆ โดยที่แอปไม่เคยอ่านมันเลย — ด่านนี้พิสูจน์ว่ามันอ่านจริง
 * และ path เดิม (ที่ CI matrix ใช้อยู่, ดู .github/workflows/ci.yml) ยังไม่พังจากการแก้นี้
 */
describe('examples/v5-app/config/database.js รองรับ DATABASE_URL (จำเป็นสำหรับ render.yaml)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const factory = require(`${root}examples/v5-app/config/database.js`)

  function envFrom(vars: Record<string, string>) {
    const env = ((key: string, fallback?: unknown) => vars[key] ?? fallback) as unknown as {
      (key: string, fallback?: unknown): unknown
      int: (key: string, fallback?: number) => number
      bool: (key: string, fallback?: boolean) => boolean
    }
    env.int = (key, fallback) => (vars[key] !== undefined ? Number(vars[key]) : (fallback as number))
    env.bool = (key, fallback) => (vars[key] !== undefined ? vars[key] === 'true' : (fallback as boolean))
    return env
  }

  it('ใช้ connectionString จาก DATABASE_URL เมื่อมีค่านั้น', () => {
    const config = factory({
      env: envFrom({ DATABASE_CLIENT: 'postgres', DATABASE_URL: 'postgres://u:p@host/db' }),
    })
    expect(config.connection.client).toBe('postgres')
    expect(config.connection.connection.connectionString).toBe('postgres://u:p@host/db')
  })

  it('เปิด ssl แบบยืนยันใบรับรองจริง (ไม่ใช่ rejectUnauthorized: false) เมื่อไม่ได้ปิดไว้', () => {
    const config = factory({
      env: envFrom({ DATABASE_CLIENT: 'postgres', DATABASE_URL: 'postgres://u:p@host/db' }),
    })
    expect(config.connection.connection.ssl).toBe(true)
  })

  it('ยังใช้ path เดิม (host/port/user/password แยกช่อง) เมื่อไม่มี DATABASE_URL — ขา CI matrix ต้องไม่พัง', () => {
    const config = factory({
      env: envFrom({
        DATABASE_CLIENT: 'postgres',
        DATABASE_HOST: '127.0.0.1',
        DATABASE_PORT: '5432',
        DATABASE_NAME: 'strapi',
        DATABASE_USERNAME: 'strapi',
        DATABASE_PASSWORD: 'strapi',
      }),
    })
    expect(config.connection.connection).toEqual({
      host: '127.0.0.1',
      port: 5432,
      database: 'strapi',
      user: 'strapi',
      password: 'strapi',
    })
  })
})

/**
 * users-permissions' bootstrap throws hard the moment NODE_ENV isn't 'development' and it
 * cannot resolve `plugin::users-permissions.jwtSecret` — a real crash caught by booting the
 * built Docker image locally (task-15-report.md), not by e2e.sh/CI, which never sets
 * NODE_ENV=production and so never exercises this path. config/plugins.js must read
 * JWT_SECRET, or render.yaml's image crashes on every boot.
 */
describe('examples/v5-app/config/plugins.js ประกาศ jwtSecret ของ users-permissions', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const factory = require(`${root}examples/v5-app/config/plugins.js`)

  it('อ่าน JWT_SECRET เข้า users-permissions.config.jwtSecret', () => {
    const env = ((key: string) => (key === 'JWT_SECRET' ? 'a-real-secret' : undefined)) as unknown as {
      (key: string, fallback?: unknown): unknown
      int: (key: string, fallback?: number) => number
      bool: (key: string, fallback?: boolean) => boolean
    }
    env.int = (_key, fallback) => fallback as number
    env.bool = (_key, fallback) => fallback as boolean
    const config = factory({ env })
    expect(config['users-permissions'].config.jwtSecret).toBe('a-real-secret')
  })
})


/**
 * บัญชีที่รหัสผ่านถูกประกาศไว้ใน README ต้องไม่ใช่ superadmin
 *
 * Strapi ยกสิทธิ์ทั้งหมดให้แอดมินคนแรกเสมอ เดโมสาธารณะจึงเริ่มต้นด้วยบัญชีที่เปิด Content-Type
 * Builder, รายชื่อแอดมิน, API token และฐานข้อมูลทั้งก้อนให้ใครก็ตามที่อ่าน README — เคยเป็นแบบนั้น
 * จริงบนโฮสต์เดโมจนกระทั่งเจ้าของสังเกตเห็นเอง ไม่ใช่เทสต์
 *
 * ด่านนี้จึงอ่านค่าคงที่จากสคริปต์จริง ไม่ใช่ regex บนข้อความในไฟล์ — สคริปต์ export ชุดสิทธิ์ออกมา
 * และ `main()` ถูกกันไม่ให้ทำงานตอน import (ดูท้ายไฟล์ demo-restrict.mjs) ทำให้ที่นี่ทดสอบ
 * "ของจริงที่จะถูกเขียนลง role" ไม่ใช่ของที่หน้าตาเหมือนกัน
 */
describe('examples/v5-app/scripts/demo-restrict.mjs — สิทธิ์ของบัญชีเดโมสาธารณะ', () => {
  const PLUGIN = 'plugin::line-rich-menu'
  const base = BASE_PERMISSIONS as string[]

  it('ให้สิทธิ์ครบเท่าที่ปลั๊กอินต้องใช้จริง — อ่าน สร้าง ปล่อย และอัปโหลดรูป', () => {
    expect(base).toContain(`${PLUGIN}.read`)
    expect(base).toContain(`${PLUGIN}.write`)
    expect(base).toContain(`${PLUGIN}.publish`)
    // ImageField ยิง POST /upload ตรง ๆ ถ้าไม่มีสิทธิ์นี้ การอัปโหลดรูปเมนูจะ 403
    expect(base).toContain('plugin::upload.assets.create')
  })

  /**
   * `settings` คือสิทธิ์ที่ตั้งและหมุน LINE channel access token (server/src/routes/admin.ts)
   * บนเดโมที่ต่อกับ LINE OA จริง มันคือกุญแจของ OA ตัวนั้น จึงต้องเป็น opt-in ที่คนติดตั้งพิมพ์เอง
   * ไม่ใช่ของที่ติดมากับค่าตั้งต้นเพราะ "เดโมของ repo นี้เปิดไว้"
   */
  it('ค่าตั้งต้นไม่มีสิทธิ์ settings — ต้อง opt-in เท่านั้น', () => {
    expect(base).not.toContain(CHANNEL_SETTINGS_PERMISSION)
    expect(demoPermissions(false)).not.toContain(CHANNEL_SETTINGS_PERMISSION)
    // env ที่ไม่ได้ตั้งค่ามาเลยต้องได้ชุดที่ปลอดภัย ไม่ใช่ชุดที่กว้างที่สุด
    expect(demoPermissions(undefined)).toEqual(base)
    expect(demoPermissions('true')).toEqual(base)
  })

  it('opt-in เติมสิทธิ์ channel เข้ามาหนึ่งอย่างพอดี ไม่ใช่เปิดประตูอื่นตามไปด้วย', () => {
    const opened = demoPermissions(true) as string[]
    expect(opened).toEqual([...base, CHANNEL_SETTINGS_PERMISSION])
    expect(CHANNEL_SETTINGS_PERMISSION).toBe(`${PLUGIN}.settings`)
  })

  /**
   * allowlist ไม่ใช่ blocklist ตั้งใจ: การไล่ห้ามทีละอย่าง (`admin::*`, content-manager,
   * content-type-builder, ...) จะเขียวทันทีที่ Strapi เพิ่มพื้นผิวใหม่ที่ยังไม่มีใครนึกถึง
   * ที่นี่บังคับให้ทุกสิทธิ์ที่เพิ่มเข้ามาใหม่ต้องถูกตัดสินใจอย่างตั้งใจ ไม่ใช่ไหลเข้ามาเงียบ ๆ
   */
  it('ไม่มีสิทธิ์อื่นนอกเหนือจากนั้นเลย — allowlist ไม่ใช่ blocklist', () => {
    const allowed = new Set([
      `${PLUGIN}.read`, `${PLUGIN}.write`, `${PLUGIN}.publish`,
      `${PLUGIN}.settings`, 'plugin::upload.assets.create',
    ])
    for (const action of demoPermissions(true) as string[]) {
      expect(allowed.has(action), `${action} ไม่ได้อยู่ในชุดที่ตั้งใจให้บัญชีเดโมถือ`).toBe(true)
    }
    expect(base).toHaveLength(allowed.size - 1)
  })

  it('ใช้ role มาตรฐานของ Strapi — CE สร้าง role ใหม่ไม่ได้', () => {
    expect(['strapi-editor', 'strapi-author']).toContain(DEMO_ROLE_CODE)
  })

  /**
   * `PUT /admin/roles/:id/permissions` ตอบ 200 พร้อม `data: []` เมื่อไม่มีอะไรเปลี่ยน — และตอบ
   * แบบเดียวกันได้ในวันที่ไม่มีอะไรถูกเขียนลงไปเลย สคริปต์จึงต้อง GET กลับมาเทียบเสมอ
   */
  it('อ่าน role กลับมาเทียบ ไม่เชื่อ 200 ของ PUT', () => {
    expect(restrictScript).toMatch(/call\('GET', `\/admin\/roles\/\$\{role\.id\}\/permissions`/)
  })

  it('ปฏิเสธการลดสิทธิ์ superadmin คนสุดท้าย แทนที่จะล็อกเจ้าของออกจากระบบ', () => {
    expect(restrictScript).toMatch(/otherSuperAdmins/)
    expect(restrictScript).toMatch(/only Super Admin/i)
  })

  // เอกสารกับสคริปต์ต้องพูดตรงกัน คนที่ deploy เดโมของตัวเองอ่าน DEMO.md ไม่ได้อ่าน .mjs
  it('docs/DEMO.md บอกชุดสิทธิ์ชุดเดียวกับที่สคริปต์เขียนจริง', () => {
    for (const action of demoPermissions(true) as string[]) {
      const short = action.startsWith(`${PLUGIN}.`) ? action.slice(PLUGIN.length + 1) : action
      expect(demoDoc, `DEMO.md ไม่ได้พูดถึง ${action}`).toContain(short)
    }
    expect(demoDoc).toMatch(/plugin::line-rich-menu\.settings/)
    expect(demoDoc).toMatch(/DEMO_ALLOW_CHANNEL_SETTINGS/)
    expect(demoDoc).toMatch(/superadmin/i)
  })
})
