export const REDACTED = '[redacted]'

/**
 * คีย์ที่ค่าใต้มันถือว่าเป็นความลับเสมอ (สเปก §11.2)
 * `credential` กับ `password` ไม่ได้อยู่ในรายการของสเปกแต่ใส่ไว้ด้วย เพราะราคาของ false positive
 * คือ log อ่านยากขึ้นหนึ่งบรรทัด ส่วนราคาของ false negative คือ token หลุดเข้า log aggregator
 */
const SENSITIVE_KEY = /(token|secret|authorization|password|credential)/i

/**
 * ตัดแม้แต่ตอนที่คีย์ไม่ได้บอกอะไร — ข้อความ error จาก HTTP client ชั้นล่างมักพก header
 * ที่ส่งไปกลับมาด้วยทั้งก้อน ซึ่งเป็นเคสที่ทำให้ token หลุดจริงมาแล้วในโปรเจกต์อื่น
 */
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi

/** ลึกเกินนี้แปลว่าเป็นโครงสร้างที่ไม่ได้ตั้งใจ log อยู่แล้ว ตัดทิ้งดีกว่าไล่ต่อ */
const MAX_DEPTH = 8

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return value.replace(BEARER, `Bearer ${REDACTED}`)
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return REDACTED
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1, seen))

  // Object.entries ของ Error คืน [] เพราะ name/message/stack เป็น non-enumerable —
  // ถ้าไม่ดักไว้ error ทุกตัวจะกลายเป็น {} ใน log ซึ่งแย่กว่าไม่ log เลย
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code
    // ใช้ constructor.name แทน value.name — subclass ของ Error ที่ไม่ได้ตั้ง this.name เอง
    // (พบได้ทั่วไปใน error จาก library ภายนอกที่ไม่ได้เดินตามธรรมเนียมของ CoreError)
    // จะสืบ name มาจาก Error.prototype.name เป็น 'Error' เสมอ ทำให้ log แยกไม่ออกว่า error ตัวไหนจริง ๆ
    return {
      name: value.constructor.name,
      message: walk(value.message, depth + 1, seen),
      ...(typeof code === 'string' ? { code } : {}),
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : walk(item, depth + 1, seen),
    ]),
  )
}

export function scrub(value: unknown): unknown {
  return walk(value, 0, new WeakSet())
}

export interface LoggerLike {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/**
 * ห่อ logger ของ Strapi ทั้งสี่ระดับ ไม่ใช่แค่ `error` — สเปก §11.2 เขียนว่า "ทุก log level"
 * เพราะ `debug` คือระดับที่คนเผลอ dump ทั้ง request object ลงไปมากที่สุด
 */
export function createScrubbedLogger(base: LoggerLike): LoggerLike {
  const wrap = (level: keyof LoggerLike) =>
    (...args: unknown[]) => { base[level](...args.map((arg) => scrub(arg))) }
  return { debug: wrap('debug'), info: wrap('info'), warn: wrap('warn'), error: wrap('error') }
}
