import { describe, expect, it, vi } from 'vitest'
import { registerPermissions } from '../server/src/bootstrap.js'
import { PERMISSION, PLUGIN_ID, permissionActions } from '../server/src/permissions.js'
import { routes } from '../server/src/routes/index.js'
import type { StrapiV5 } from '../server/src/strapi.js'

interface RouteConfig {
  policies?: { name: string; config?: { actions?: string[] } }[]
}
interface RouteDef {
  method: string
  path: string
  handler: string
  config?: RouteConfig
}

const allRoutes = Object.values(routes).flatMap((group) => (group as { routes: RouteDef[] }).routes)

describe('matrix ของ route × สิทธิ์', () => {
  it('มี route group เดียวและเป็น type admin — deny by default (สเปก §11.4)', () => {
    for (const group of Object.values(routes)) {
      expect((group as { type: string }).type).toBe('admin')
    }
  })

  it('ทุกเส้นมี policy admin::hasPermissions พอดีหนึ่งอัน — ไม่มีเส้นไหนหลุด', () => {
    const naked = allRoutes.filter((route) => {
      const policies = route.config?.policies ?? []
      return policies.filter((policy) => policy.name === 'admin::hasPermissions').length !== 1
    })
    expect(naked.map((route) => `${route.method} ${route.path}`)).toEqual([])
  })

  it('ทุกเส้นขอสิทธิ์ที่ประกาศไว้จริง ไม่ใช่สตริงที่พิมพ์เอง', () => {
    const known = new Set(Object.values(PERMISSION))
    const unknown = allRoutes.flatMap((route) =>
      (route.config?.policies ?? [])
        .flatMap((policy) => policy.config?.actions ?? [])
        .filter((action) => !known.has(action as never))
        .map((action) => `${route.method} ${route.path} → ${action}`),
    )
    expect(unknown).toEqual([])
  })

  it('สิทธิ์ทั้งสี่ถูกใช้จริงอย่างน้อยหนึ่งเส้น — ไม่มีสิทธิ์ที่ประกาศไว้เฉย ๆ', () => {
    const used = new Set(allRoutes.flatMap((route) =>
      (route.config?.policies ?? []).flatMap((policy) => policy.config?.actions ?? []),
    ))
    expect([...Object.values(PERMISSION)].filter((action) => !used.has(action))).toEqual([])
  })

  it('เส้นที่แตะ token ใช้ settings ส่วนเส้นที่ยิงขึ้น LINE ใช้ publish — สองอย่างนี้ต้องไม่ปนกัน', () => {
    const actionFor = (method: string, path: string) =>
      allRoutes.find((route) => route.method === method && route.path === path)
        ?.config?.policies?.[0]?.config?.actions?.[0]

    expect(actionFor('POST', '/channels')).toBe(PERMISSION.settings)
    expect(actionFor('PUT', '/channels/:id')).toBe(PERMISSION.settings)
    expect(actionFor('POST', '/channels/:id/test')).toBe(PERMISSION.settings)

    expect(actionFor('POST', '/menus/:id/publish')).toBe(PERMISSION.publish)
    expect(actionFor('POST', '/menus/:id/default')).toBe(PERMISSION.publish)
    expect(actionFor('POST', '/schedules/tick')).toBe(PERMISSION.publish)
    // ลบเมนูกำพร้าแตะของจริงบน LINE เหมือนกัน — ไม่ใช่แค่แก้ record ในฐานข้อมูลของเราเอง
    expect(actionFor('DELETE', '/channels/:id/orphans/:lineRichMenuId')).toBe(PERMISSION.publish)

    // คนที่ publish ได้ ต้องไม่ได้สิทธิ์แตะ token มาด้วยโดยปริยาย และกลับกัน
    expect(PERMISSION.publish).not.toBe(PERMISSION.settings)
  })
})

describe('registerPermissions', () => {
  it('ลงทะเบียนครบทั้งสี่ action ด้วย pluginName ที่ถูกต้อง', async () => {
    // ต้องพิมพ์ parameter ของ mock ไว้ ไม่งั้น TS จะอนุมาน calls[0] เป็น tuple ว่าง `[]`
    // แล้ว `calls[0]![0]` ด้านล่างจะพังตอน typecheck (เจอปัญหานี้แล้วใน repo.test.ts)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const registerMany = vi.fn(async (_actions: unknown[]) => {})
    const strapi = {
      admin: { services: { permission: { actionProvider: { registerMany } } } },
    } as unknown as StrapiV5

    await registerPermissions(strapi)

    expect(registerMany).toHaveBeenCalledTimes(1)
    expect(registerMany.mock.calls[0]![0]).toEqual(permissionActions)
    for (const action of permissionActions) {
      expect(action.pluginName).toBe(PLUGIN_ID)
      expect(action.section).toBe('plugins')
    }
  })

  it('uid ที่ลงทะเบียนประกอบกับ pluginName แล้วตรงกับที่ route ขอ', () => {
    const composed = permissionActions.map((action) => `plugin::${action.pluginName}.${action.uid}`).sort()
    expect(composed).toEqual([...Object.values(PERMISSION)].sort())
  })
})
