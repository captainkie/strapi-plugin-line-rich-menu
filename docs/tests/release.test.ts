import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const release = readFileSync(`${root}.github/workflows/release.yml`, 'utf8')
const releasing = readFileSync(`${root}docs/RELEASING.md`, 'utf8')

describe('workflow ของการปล่อย (สเปก §11.6 · §13.4)', () => {
  /**
   * `id-token: write` คือทั้งหมดที่ทำให้ `--provenance` ทำงาน — ไม่มีมันแล้ว npm จะปฏิเสธ
   * attestation ด้วยข้อความที่ไม่ได้ชี้ไปที่ permission เลย และเรื่องนี้จะถูกค้นพบตอนกด publish
   * จริงเท่านั้น ซึ่งเป็นครั้งเดียวที่เราไม่อยากค้นพบอะไร
   */
  it('ขอ id-token: write สำหรับ OIDC', () => {
    expect(release).toMatch(/id-token:\s*write/)
  })

  it('เปิด provenance ตอน publish', () => {
    expect(release).toMatch(/NPM_CONFIG_PROVENANCE:\s*['"]?true/)
  })

  it('build ก่อน publish เสมอ — files มีแต่ dist', () => {
    const publishAt = release.indexOf('changeset publish')
    const buildAt = release.indexOf('pnpm build')
    expect(buildAt).toBeGreaterThanOrEqual(0)
    expect(buildAt).toBeLessThan(publishAt)
  })

  it('ผ่านด่านเดียวกับ CI ก่อนปล่อย ไม่ใช่ปล่อยแล้วค่อยรู้', () => {
    for (const gate of ['pnpm typecheck', 'pnpm lint', 'pnpm test', 'pnpm check:deps', 'pnpm verify']) {
      expect(release, gate).toContain(gate)
    }
  })

  it('ยิงจาก tag เท่านั้น ไม่ใช่จากทุก push เข้า main', () => {
    expect(release).toMatch(/tags:\s*\n\s*-\s*['"]?v\*/)
    expect(release).not.toMatch(/branches:\s*\[\s*main\s*\]/)
  })

  it('ใช้ secret ของ npm ไม่ใช่ค่าที่ฝังไว้', () => {
    expect(release).toContain('${{ secrets.NPM_TOKEN }}')
  })

  /**
   * README ที่ npm แสดงมาจากไฟล์ที่อยู่ *ใน* tarball ตอน publish ไม่ใช่ตอนไหนก็ได้ก่อนหน้านั้น —
   * ถ้า cp มาอยู่หลัง `changeset publish` มันก็คัดลอกไปทันเวลาที่ publish ครั้งถัดไปเท่านั้น ไม่ใช่ครั้งนี้
   */
  it('คัดลอก README เข้าแพ็กเกจก่อน publish เสมอ', () => {
    const publishAt = release.indexOf('changeset publish')
    const copyAt = release.indexOf('cp README.md')
    expect(copyAt).toBeGreaterThanOrEqual(0)
    expect(copyAt).toBeLessThan(publishAt)
  })
})

/**
 * README ในแพ็กเกจ — เทสต์ที่ยืนยันกับ artifact จริง ไม่ใช่กับข้อความของ workflow
 *
 * เทสต์ก่อนหน้านี้ ("คัดลอก README เข้าแพ็กเกจก่อน publish เสมอ") พิสูจน์แค่ว่ามีบรรทัด `cp README.md`
 * อยู่ก่อนบรรทัด publish ใน YAML — แต่บรรทัดนั้น cp ไฟล์ผิดไปปลายทางผิดก็ยังผ่านเทสต์นั้นได้
 * (เช่น พิมพ์ผิดเป็น `cp README.md packages/strapi-v5/readme.md` ตัวเล็กหมด) ด่านที่แท้จริงคือ:
 * เอาขั้นตอน "คัดลอกแล้ว pack" ไปรันจริง แล้วเปิด tarball ดูว่า `README.md` อยู่ข้างในไหม
 *
 * ยืนยันแล้วว่าปัญหานี้มีอยู่จริงก่อนแก้: `npm pack --dry-run` จาก `packages/strapi-v5` วันนี้ (ก่อน
 * cp) ให้ tarball ที่มีแต่ .d.ts ใต้ dist/ กับ package.json — ไม่มี README.md เลย
 */
describe('README อยู่ใน npm pack จริง (ไม่ใช่แค่ workflow มีบรรทัด cp)', () => {
  const packages = [
    { dir: 'packages/strapi-v4', tarballPrefix: 'strapi-plugin-line-rich-menu-v4' },
    { dir: 'packages/strapi-v5', tarballPrefix: 'strapi-plugin-line-rich-menu' },
  ]

  for (const { dir, tarballPrefix } of packages) {
    it(`${dir}: หลังคัดลอก README ตามขั้นตอนใน release.yml, npm pack มี package/README.md จริง`, () => {
      const pkgDir = `${root}${dir}`
      const readmeDest = join(pkgDir, 'README.md')
      const alreadyPresent = existsSync(readmeDest)
      const previousContent = alreadyPresent ? readFileSync(readmeDest, 'utf8') : null

      // ทำสิ่งเดียวกับ step "คัดลอก README เข้าแพ็กเกจที่จะปล่อย" ใน release.yml เป๊ะ ๆ
      copyFileSync(`${root}README.md`, readmeDest)

      const packDest = mkdtempSync(join(tmpdir(), 'release-pack-'))
      try {
        // ไม่ใช้ `npm pack --workspace <name>` — repo นี้เป็น pnpm workspace (pnpm-workspace.yaml)
        // ไม่ใช่ npm workspace (root package.json ไม่มีคีย์ "workspaces") ดังนั้น `--workspace`
        // ล้มด้วย "No workspaces found" เสมอ ยืนยันแล้วด้วยมือก่อนเขียนเทสต์นี้ — ต้อง `cd` เข้าไปที่
        // แพ็กเกจแล้ว pack จากตรงนั้นแทน
        execFileSync('npm', ['pack', '--pack-destination', packDest], { cwd: pkgDir, stdio: 'pipe' })

        const tarball = readdirSync(packDest).find((f) => f.startsWith(tarballPrefix) && f.endsWith('.tgz'))
        expect(tarball, `npm pack ต้องสร้าง tarball ที่ขึ้นต้นด้วย ${tarballPrefix}`).toBeTruthy()

        const listing = execFileSync('tar', ['tzf', join(packDest, tarball!)], { encoding: 'utf8' })
        const files = listing.split('\n').map((l) => l.trim()).filter(Boolean)
        expect(files, `tarball ของ ${dir} ต้องมี package/README.md`).toContain('package/README.md')
      } finally {
        rmSync(packDest, { recursive: true, force: true })
        if (alreadyPresent) writeFileSync(readmeDest, previousContent!)
        else rmSync(readmeDest, { force: true })
      }
    })
  }
})

/**
 * ประวัติ commit ทั้งหมดจะเปิดเผยพร้อมกันตอน repo เป็น public ไม่ใช่แค่ tip ของ main — ไฟล์ `.env*`
 * ที่เคยถูก commit แล้วลบทิ้งภายหลังก็ยังอยู่ใน history และ `git log` เห็นมันได้เสมอ
 * แยกตรรกะการกรองออกมาเป็นฟังก์ชันบริสุทธิ์ เพื่อพิสูจน์ได้ว่าด่านนี้จับได้จริงโดยไม่ต้องไปสร้าง
 * commit `.env` ปลอมใส่ประวัติจริงของ repo (ซึ่งลบไม่ได้ง่าย ๆ เหมือนกับปัญหาที่มันตรวจอยู่)
 */
export function findTrackedEnvLeaks(paths: string[]): string[] {
  return paths.map((p) => p.trim()).filter(Boolean).filter((p) => !p.endsWith('.env.example'))
}

describe('ไม่มีไฟล์ .env* (นอกจาก .env.example) ถูก track อยู่ใน commit ไหนเลย', () => {
  it('ฟังก์ชันกรองจับพาธที่ไม่ควรอยู่ได้จริง — พิสูจน์ก่อนเชื่อผลจาก git log', () => {
    const sample = ['examples/v4-app/.env.example', '.env', 'examples/v5-app/.env.local', '  ', '.env.production']
    expect(findTrackedEnvLeaks(sample)).toEqual(['.env', 'examples/v5-app/.env.local', '.env.production'])
  })

  it('git log --all ทั้งประวัติไม่คืนพาธ .env* ที่ไม่ใช่ .env.example', () => {
    const output = execFileSync(
      'git',
      [
        'log', '--all', '--diff-filter=A', '--name-only', '--pretty=format:',
        '--', '.env', '.env.*', '**/.env', '**/.env.*',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    const offending = findTrackedEnvLeaks(output.split('\n'))
    expect(offending, offending.join('\n')).toEqual([])
  })
})

describe('ไม่มีชื่อ infrastructure ส่วนตัวหลุดเข้ามาใน release workflow หรือ RELEASING.md', () => {
  it('ทั้งสองไฟล์ไม่มีชื่อ service ภายในของใครเลย', () => {
    const forbidden = /roddonjai|autoflow|siteops|portainer|grafana/i
    expect(release).not.toMatch(forbidden)
    expect(releasing).not.toMatch(forbidden)
  })
})

describe('docs/RELEASING.md', () => {
  it('บอกว่าสองคำสั่งสุดท้ายเป็นของเจ้าของ', () => {
    expect(releasing).toMatch(/owner's/i)
  })

  it('บอกว่า provenance ต้องการ repo แบบ public', () => {
    expect(releasing).toMatch(/public/)
  })

  it('มีคำสั่งเดียวที่ apply ruleset ได้หลัง repo เป็น public', () => {
    expect(releasing).toContain('rulesets --input .github/rulesets/main.json')
  })

  // mutation รันกลางคืนและหลัง merge เท่านั้น — PR ที่ถอด assertion ออกจะ merge เขียวแล้ว
  // ไปพังตอนกลางคืน ผลลัพธ์ของรอบล่าสุดจึงเป็นประตูของการปล่อย ไม่ใช่เสียงรบกวนพื้นหลัง
  it('นับรอบ mutation ของคืนล่าสุดเป็นประตู ไม่ใช่ของประดับ', () => {
    expect(releasing).toMatch(/mutation/i)
    expect(releasing).toContain('gh run list')
  })

  /**
   * แต่ละบรรทัดของเช็คลิสต์นี้เขียนเป็น "สิ่งที่จะพังถ้าข้าม" ไม่ใช่แค่ชื่องาน — คนกาเช็คลิสต์เร็ว ๆ
   * มักข้ามบรรทัดที่อ่านเหมือนพิธีกรรม แต่จะอ่านช้าลงถ้าบรรทัดนั้นบอกตรง ๆ ว่าพลาดแล้วจะเกิดอะไร
   */
  it('มีเช็คลิสต์ก่อนเปิด repo เป็น public ครบทุกข้อที่รู้ว่าเป็นความเสี่ยงจริง', () => {
    expect(releasing, 'branch ต้อง merge ก่อน').toMatch(/branch.*merged|merged.*branch/i)
    expect(releasing, 'ต้องรัน changeset version ก่อนปล่อยจริง').toContain('changeset version')
    expect(releasing, 'ต้องเช็ค README ใน tarball ด้วยของจริง ไม่ใช่แค่เชื่อ').toMatch(/npm pack/)
    expect(releasing, 'screenshot ต้องเป็นเวอร์ชันสุดท้าย เพราะ npm render README').toMatch(/screenshot/i)
    expect(releasing, 'ต้องสะกด security@fosivo.com ถูก').toContain('security@fosivo.com')
    expect(releasing, 'repo ต้อง public ก่อน publish ครั้งแรก').toMatch(/public.*before|before.*public/i)
    expect(releasing, 'gitleaks ต้องสะอาดทั้งประวัติ ไม่ใช่แค่ tip').toMatch(/gitleaks/i)
  })
})
