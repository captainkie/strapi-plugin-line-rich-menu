import {
  LineAuthError, LineRateLimitError, LineServerError, LineValidationError,
} from '../errors.js'
import type { RichMenuPayload } from '../types.js'
import { DEFAULT_API_BASE, DEFAULT_API_DATA_BASE, endpoints } from './endpoints.js'

export interface LineClientOptions {
  accessToken: string
  apiBaseUrl?: string
  apiDataBaseUrl?: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxAttempts?: number
}

export interface BotInfo {
  userId: string
  basicId: string
  displayName: string
  pictureUrl?: string
}

export interface RichMenuSummary {
  richMenuId: string
  name?: string
  chatBarText?: string
}

export interface AliasSummary {
  richMenuAliasId: string
  richMenuId: string
}

interface RequestSpec {
  method: 'GET' | 'POST' | 'DELETE'
  url: string
  // BodyInit ไม่ใช่ global type ใน environment นี้ (tsconfig lib ไม่มี "DOM") —
  // ดึง type ของ body มาจาก RequestInit ที่ @types/node ประกาศ global ไว้แทน
  body?: NonNullable<RequestInit['body']>
  contentType?: string
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class LineClient {
  readonly #token: string
  readonly #base: string
  readonly #dataBase: string
  // ไม่ resolve globalThis.fetch ตรงนี้ — ถ้าไม่ได้ inject fetchImpl มา ต้องรอไปอ่านตอนเรียกจริงใน #send
  // เพราะเครื่องมือ patch fetch (เช่น msw, mock agent) มักติดตั้งทีหลัง module load
  readonly #fetch: typeof fetch | undefined
  readonly #sleep: (ms: number) => Promise<void>
  readonly #maxAttempts: number

  constructor(options: LineClientOptions) {
    this.#token = options.accessToken
    this.#base = options.apiBaseUrl ?? DEFAULT_API_BASE
    this.#dataBase = options.apiDataBaseUrl ?? DEFAULT_API_DATA_BASE
    this.#fetch = options.fetchImpl
    this.#sleep = options.sleep ?? defaultSleep
    this.#maxAttempts = options.maxAttempts ?? 3
  }

  async validateRichMenu(payload: RichMenuPayload): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.validateRichMenu(this.#base), body: JSON.stringify(payload), contentType: 'application/json' })
  }

  async createRichMenu(payload: RichMenuPayload): Promise<string> {
    const res = await this.#send({ method: 'POST', url: endpoints.createRichMenu(this.#base), body: JSON.stringify(payload), contentType: 'application/json' })
    const json = (await res.json()) as { richMenuId: string }
    return json.richMenuId
  }

  async uploadContent(richMenuId: string, image: Buffer, mime: 'image/png' | 'image/jpeg'): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.uploadContent(this.#dataBase, richMenuId), body: new Uint8Array(image), contentType: mime })
  }

  async setDefault(richMenuId: string): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.setDefault(this.#base, richMenuId) })
  }

  async clearDefault(): Promise<void> {
    await this.#send({ method: 'DELETE', url: endpoints.clearDefault(this.#base) })
  }

  async getRichMenu(richMenuId: string): Promise<RichMenuSummary> {
    const res = await this.#send({ method: 'GET', url: endpoints.richMenu(this.#base, richMenuId) })
    return (await res.json()) as RichMenuSummary
  }

  async listRichMenus(): Promise<RichMenuSummary[]> {
    const res = await this.#send({ method: 'GET', url: endpoints.richMenuList(this.#base) })
    const json = (await res.json()) as { richmenus?: RichMenuSummary[] }
    return json.richmenus ?? []
  }

  async deleteRichMenu(richMenuId: string): Promise<void> {
    await this.#send({ method: 'DELETE', url: endpoints.richMenu(this.#base, richMenuId) })
  }

  async createAlias(aliasId: string, richMenuId: string): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.alias(this.#base), body: JSON.stringify({ richMenuAliasId: aliasId, richMenuId }), contentType: 'application/json' })
  }

  async updateAlias(aliasId: string, richMenuId: string): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.aliasById(this.#base, aliasId), body: JSON.stringify({ richMenuId }), contentType: 'application/json' })
  }

  async deleteAlias(aliasId: string): Promise<void> {
    await this.#send({ method: 'DELETE', url: endpoints.aliasById(this.#base, aliasId) })
  }

  async listAliases(): Promise<AliasSummary[]> {
    const res = await this.#send({ method: 'GET', url: endpoints.aliasList(this.#base) })
    const json = (await res.json()) as { aliases?: AliasSummary[] }
    return json.aliases ?? []
  }

  async getBotInfo(): Promise<BotInfo> {
    const res = await this.#send({ method: 'GET', url: endpoints.botInfo(this.#base) })
    return (await res.json()) as BotInfo
  }

  async linkToUser(userId: string, richMenuId: string): Promise<void> {
    await this.#send({ method: 'POST', url: endpoints.userRichMenu(this.#base, userId, richMenuId) })
  }

  async #send(spec: RequestSpec): Promise<Response> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt++) {
      const headers: Record<string, string> = { authorization: `Bearer ${this.#token}` }
      if (spec.contentType) headers['content-type'] = spec.contentType

      const fetchImpl = this.#fetch ?? globalThis.fetch
      const res = await fetchImpl(spec.url, {
        method: spec.method,
        headers,
        ...(spec.body === undefined ? {} : { body: spec.body }),
      })

      if (res.ok) return res

      const error = await this.#toError(res)
      const retryable = error instanceof LineRateLimitError || error instanceof LineServerError
      if (!retryable || attempt === this.#maxAttempts) throw error

      lastError = error
      const waitMs = error instanceof LineRateLimitError
        ? error.retryAfterSeconds * 1000
        : 500 * 2 ** (attempt - 1)
      await this.#sleep(waitMs)
    }
    throw lastError
  }

  async #toError(res: Response): Promise<Error> {
    if (res.status === 401 || res.status === 403) return new LineAuthError('LINE ปฏิเสธ credential')
    if (res.status === 429) {
      const header = res.headers.get('retry-after')
      const seconds = header ? Number.parseInt(header, 10) : 1
      return new LineRateLimitError(Number.isFinite(seconds) ? seconds : 1)
    }
    if (res.status >= 500) return new LineServerError(res.status)

    // 4xx อื่น ๆ ถือเป็น payload ผิด — เก็บรายละเอียดไว้ใน details ไม่โยนข้อความดิบขึ้น UI
    let details: string[] = []
    try {
      const json = (await res.json()) as { message?: string; details?: { message?: string; property?: string }[] }
      details = (json.details ?? [])
        .map((d) => [d.property, d.message].filter(Boolean).join(': '))
        .filter((s) => s.length > 0)
      if (details.length === 0 && json.message) details = [json.message]
    } catch {
      details = []
    }
    return new LineValidationError(details)
  }
}
