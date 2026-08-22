/**
 * สะพานระหว่างรูปทรงที่ `MainSettingsValue.startAt`/`endAt` เก็บ (ISO datetime string เดียว หรือ
 * `''` ถ้ายังไม่ตั้ง — สัญญาเดิมที่ `RichMenuDraft` และ Editor.tsx ของทั้งสอง adapter ยังพึ่งอยู่)
 * กับรูปทรงที่ `ui.DatePicker`/`ui.TimePicker` ใช้ (`Date | null` แยกจากสตริง `'HH:mm'` — สเปกงานนี้
 * #4 ขอให้ LINE's shape: "a date field and a separate time field per bound")
 *
 * เก็บไว้ที่นี่แยกจาก MainSettings.tsx เพราะเป็นฟังก์ชันคู่ (split/combine) ที่ล้าง state ไปมาได้
 * ทดสอบตรง ๆ ได้ง่ายกว่าทดสอบผ่าน component
 */

/**
 * แยก ISO datetime string เป็นคู่ Date (เฉพาะส่วนวันที่ ใช้กับ `ui.DatePicker` ตรง ๆ) กับสตริง
 * เวลา `'HH:mm'` (ใช้กับ `ui.TimePicker` ตรง ๆ) — ทั้งคู่คำนวณจาก getter แบบ local (`getHours`,
 * `getMinutes`, ...) เสมอ ไม่ใช่ UTC เพราะ `combineDisplayAt` ด้านล่างประกอบกลับด้วย local
 * constructor เหมือนกัน ถ้าฝั่งใดฝั่งหนึ่งใช้ UTC การ round-trip จะเพี้ยนวัน/เวลาในโซนเวลาที่ไม่ใช่ UTC
 *
 * คืนคู่ว่างเมื่อ input เป็น `''` (ยังไม่ตั้ง) หรือ parse ไม่ขึ้น (ข้อมูลเก่าที่ผิดรูปแบบ — กันไม่ให้
 * หน้าพังทั้งฟอร์มเพราะค่าเดียวที่อ่านไม่ออก)
 */
export function splitDisplayAt(iso: string): { date: Date | null; time: string } {
  if (iso === '') return { date: null, time: '' }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return { date: null, time: '' }
  const hh = String(parsed.getHours()).padStart(2, '0')
  const mm = String(parsed.getMinutes()).padStart(2, '0')
  return { date: parsed, time: `${hh}:${mm}` }
}

/**
 * ผลตรงข้ามของ `splitDisplayAt` — รวมวันที่ (จาก `ui.DatePicker`) กับเวลา `'HH:mm'` (จาก
 * `ui.TimePicker`) กลับเป็น ISO datetime string เดียวที่ `startAt`/`endAt` เก็บ
 *
 * ยังไม่มีวันที่เลือกไว้ = ยังไม่ตั้งช่วงเวลา (คืน `''`) — เวลาอย่างเดียวไม่มีความหมายถ้าไม่รู้ว่า
 * เป็นวันไหน เวลาที่ยังไม่กรอก (สตริงว่าง) ถือเป็นเที่ยงคืน (00:00) ของวันนั้น
 */
export function combineDisplayAt(date: Date | null, time: string): string {
  if (date === null) return ''
  const [hoursRaw, minutesRaw] = time.split(':')
  const hours = Number(hoursRaw ?? 0) || 0
  const minutes = Number(minutesRaw ?? 0) || 0
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0).toISOString()
}
