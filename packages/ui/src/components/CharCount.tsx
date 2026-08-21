import { usePort } from '../port.js'

export interface CharCountProps {
  value: string
  /**
   * เพดานตัวอักษร — ต้องเป็นค่าคงที่ตัวเดียวกับที่ `maxLength` ของ `ui.TextInput` คู่กันใช้ เสมอ
   * (ดูจุดเรียกทุกจุดของ component นี้) ไม่ใช่พิมพ์เลขซ้ำเอง: ตัวนับที่ขึ้น `/300` ข้างช่องที่จำกัด
   * ไว้จริง 200 แย่กว่าไม่มีตัวนับเลย และเลขซ้ำสองที่คือทางที่มันเกิดขึ้นเงียบ ๆ
   */
  max: number
}

/**
 * ตัวนับ "n/max" ใต้ช่องที่จำกัดความยาว — ดึงออกมาจาก `MainSettings` (Title, `9/30`) และ
 * `ChatBarSettings` (ป้ายกำหนดเอง, `4/14`) ที่ต่างฝ่ายต่างวาด JSX เดียวกันซ้ำกันมาก่อน
 * (สเปกงานนี้ #1) รวมไว้ที่เดียวเพื่อให้ทุกช่องอ่านเป็นดีไซน์เดียวกัน ไม่ใช่สองจุดที่บังเอิญคล้ายกัน
 *
 * ไม่ silent-refuse การพิมพ์เกินเพดาน (ซึ่งเป็นพฤติกรรมของ `maxLength` ดิบ ๆ อยู่แล้วที่แย่ที่สุด
 * ในสามทาง) — ตัวนับนี้แค่บอกเพดานไว้ล่วงหน้าให้ผู้ใช้เห็น ไม่ใช่ตัวบังคับเอง
 */
export function CharCount({ value, max }: CharCountProps) {
  const { ui } = usePort()
  return <ui.Typography variant="pi" textColor="neutral600">{value.length}/{max}</ui.Typography>
}
