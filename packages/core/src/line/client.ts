import {
  LineAuthError, LineNotFoundError, LineRateLimitError, LineServerError, LineValidationError,
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

/**
 * operation หนึ่งตัวใน POST /v2/bot/richmenu/batch — รูปตรงกับ union ที่ LINE ต้องการ
 * `unlinkAll` ไม่มีฟิลด์อื่นเพราะเป็นคำสั่ง "เลิกผูกทุกเมนูของทุกคน" ไม่เจาะจง user
 */
export type BatchOperation =
  | { type: 'link'; from: string; to: string }
  | { type: 'unlink'; from: string }
  | { type: 'unlinkAll' }

interface RequestSpec {
  method: 'GET' | 'POST' | 'DELETE'
  url: string
  // BodyInit ไม่ใช่ global type ใน environment นี้ (tsconfig lib ไม่มี "DOM") —
  // ดึง type ของ body มาจาก RequestInit ที่ @types/node ประกาศ global ไว้แทน
  body?: NonNullable<RequestInit['body']>
  contentType?: string
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export const DEFAULT_MAX_ATTEMPTS = 3

/**
 * เพดานของ Retry-After — LINE ส่งค่ามาเป็นวินาที และไม่มีอะไรรับประกันว่าจะเป็นค่าสั้น ๆ
 * ถ้าเชื่อค่าดิบ คำขอเดียวใน Strapi อาจค้างข้ามคืน (retry-after: 100000 คือ 27 ชั่วโมง)
 * จึงหยุดรอที่ 60 วินาที แล้วปล่อยให้ typed error ขึ้นไปหาผู้เรียกแทนการนอนรอ
 */
export const MAX_RETRY_AFTER_SECONDS = 60

/**
 * เพดานจำนวน userId ต่อคำขอ bulk link — มาจากโควตาจริงของ LINE (ดู spec 2026-08-22)
 * แหล่งเดียวของเลขนี้ในทั้ง repo: enrolment routine (Task 2) import ค่านี้ไปใช้เป็นขนาด chunk แทนที่
 * จะประกาศ 500 ซ้ำอีกที่ — เลขซ้ำสองที่คือจุดที่มันจะเพี้ยนกันวันหลัง
 */
export const MAX_BULK_USER_IDS = 500

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
    // Number() ไม่ใช่ของฟุ่มเฟือย — adapter ของ Strapi 4 เป็น JavaScript และมักส่ง
    // Number(process.env.LINE_MAX_ATTEMPTS) เข้ามาตรง ๆ ซึ่งเป็น NaN เมื่อไม่ได้ตั้งตัวแปรไว้
    // Math.max(1, NaN) คือ NaN ทำให้ลูป retry ไม่ทำงานเลย แล้ว #send จะโยน lastError
    // ที่ยังเป็น undefined ออกไป — กลายเป็น 500 ที่ไม่มีข้อความ ไม่มี stack ไม่มี code
    const attempts = Number(options.maxAttempts)
    this.#maxAttempts = Number.isFinite(attempts) ? Math.max(1, attempts) : DEFAULT_MAX_ATTEMPTS
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

  /** `null` = ยังไม่เคยตั้ง default บน channel นี้ */
  async getDefault(): Promise<string | null> {
    return this.#readRichMenuId(endpoints.defaultRichMenu(this.#base))
  }

  /** `null` = ยังไม่มี alias ชื่อนี้ */
  async getAlias(aliasId: string): Promise<string | null> {
    return this.#readRichMenuId(endpoints.aliasById(this.#base, aliasId))
  }

  async #readRichMenuId(url: string): Promise<string | null> {
    try {
      const res = await this.#send({ method: 'GET', url })
      const json = (await res.json()) as { richMenuId?: string }
      return json.richMenuId ?? null
    } catch (error) {
      if (error instanceof LineNotFoundError) return null
      throw error
    }
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

  /**
   * LINE เองปฏิเสธคำขอเกิน 500 userId ด้วย 400 ที่ไม่บอกว่าเกิดจากอะไร — เช็คที่นี่ก่อนยิง
   * เพราะจุดเรียกนี้จุดเดียวที่รู้ว่าเงื่อนไขที่ผิดคือจำนวน ไม่ใช่ payload อื่น
   */
  async bulkLink(richMenuId: string, userIds: readonly string[]): Promise<void> {
    if (userIds.length > MAX_BULK_USER_IDS) {
      throw new Error(`bulk link accepts at most ${MAX_BULK_USER_IDS} user ids`)
    }
    await this.#send({
      method: 'POST',
      url: endpoints.bulkLink(this.#base),
      body: JSON.stringify({ richMenuId, userIds }),
      contentType: 'application/json',
    })
  }

  /** เพดานเดียวกับ bulkLink — LINE ระบุไว้ตรง ๆ ว่า bulk/unlink ก็รับสูงสุด 500 userId เท่ากัน */
  async bulkUnlink(userIds: readonly string[]): Promise<void> {
    if (userIds.length > MAX_BULK_USER_IDS) {
      throw new Error(`bulk unlink accepts at most ${MAX_BULK_USER_IDS} user ids`)
    }
    await this.#send({
      method: 'POST',
      url: endpoints.bulkUnlink(this.#base),
      body: JSON.stringify({ userIds }),
      contentType: 'application/json',
    })
  }

  async unlinkFromUser(userId: string): Promise<void> {
    await this.#send({ method: 'DELETE', url: endpoints.userRichMenuLink(this.#base, userId) })
  }

  /** `null` = user นี้ยังไม่ได้ผูกกับเมนูไหนเลย (ยืมพฤติกรรมเดียวกับ getDefault/getAlias) */
  async getUserRichMenu(userId: string): Promise<string | null> {
    return this.#readRichMenuId(endpoints.userRichMenuLink(this.#base, userId))
  }

  async validateBatch(operations: BatchOperation[]): Promise<void> {
    await this.#send({
      method: 'POST',
      url: endpoints.validateBatch(this.#base),
      body: JSON.stringify({ operations }),
      contentType: 'application/json',
    })
  }

  /**
   * batch จริงมีโควตาแค่ 3 คำขอ/ชั่วโมงต่อ account — resumeRequestKey ให้ปลอดภัยเวลาต้องยิงซ้ำ
   * (เช่น timeout ไม่รู้ผล) โดยไม่เสียโควตาซ้ำสอง
   *
   * request id อ่านจาก response header `x-line-request-id` — **ไม่ใช่ข้อเท็จจริงที่ยืนยันแล้ว**
   * LINE reference ของ POST .../richmenu/batch ไม่เคยบอกรูป response ตรง ๆ ว่า request id (ที่
   * progress/batch ต้องใช้ไปโพล) มาจากไหน สิ่งที่มีคือ narrowcast progress API ตัวอื่นที่ LINE
   * เอกสารไว้ชัดเจนว่าอ่าน request id จาก header เดียวกันนี้ — นี่คือการตีความที่มีหลักฐานสนับสนุน
   * ดีที่สุดเท่าที่หาได้ ไม่ใช่สเปกที่ระบุตรงสำหรับ endpoint นี้
   *
   * เพราะไม่ verified: ผู้เรียกห้ามถือ progress เป็นเงื่อนไขความสำเร็จของ batch เอง — request id
   * ที่เป็น null (header หายไป) ต้องแปลว่า "โพลไม่ได้" เท่านั้น ไม่ใช่ "batch ล้มเหลว" ปฏิบัติการที่ใช้
   * batch (เช่น unlink-all ของ Task 12) ต้องถือว่าสำเร็จได้แม้อ่าน progress ไม่ได้เลย
   */
  async batchControl(operations: BatchOperation[], resumeRequestKey: string): Promise<string | null> {
    const res = await this.#send({
      method: 'POST',
      url: endpoints.batch(this.#base),
      body: JSON.stringify({ operations, resumeRequestKey }),
      contentType: 'application/json',
    })
    return res.headers.get('x-line-request-id')
  }

  async batchProgress(requestId: string): Promise<'ongoing' | 'succeeded' | 'failed'> {
    const res = await this.#send({ method: 'GET', url: endpoints.batchProgress(this.#base, requestId) })
    const json = (await res.json()) as { phase: 'ongoing' | 'succeeded' | 'failed' }
    return json.phase
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
        ? Math.min(error.retryAfterSeconds, MAX_RETRY_AFTER_SECONDS) * 1000
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

    // 404 มีความหมายเฉพาะ — "ยังไม่มีของชิ้นนี้" ซึ่ง getDefault/getAlias ถือเป็นคำตอบ
    // ถ้าเหมารวมเป็น LineValidationError จะแยกไม่ออกจาก payload ผิด
    if (res.status === 404) return new LineNotFoundError('LINE ไม่พบทรัพยากรที่ขอ')

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
