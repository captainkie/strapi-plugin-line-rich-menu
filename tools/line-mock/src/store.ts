export interface StoredMenu {
  richMenuId: string
  payload: unknown
  // width/height เป็น optional โดยตั้งใจ — เก็บไว้เฉพาะตอนที่เนื้อไฟล์ที่อัปมาอ่าน dimension
  // ออกจริง (ดู server.ts) เพื่อให้เทสต์ integration ยืนยันได้ว่ารูปที่อัปตรงกับ size ที่ menu
  // ประกาศไว้ (ดู tests/integration.test.ts) เคสอัปโหลดข้อมูลดิบที่ไม่ใช่รูปจริงยังผ่านได้เหมือนเดิม
  image?: { mime: string; bytes: number; width?: number; height?: number }
}

export interface MockStore {
  menus: Map<string, StoredMenu>
  aliases: Map<string, string>
  defaultMenuId: string | null
  nextId(): string
}

/**
 * ตัวสร้าง id **ถูกส่งเข้ามาจากข้างนอก** ไม่ใช่ตัวนับของ store เอง เพราะเซิร์ฟเวอร์มี store
 * หนึ่งใบต่อหนึ่ง access token (หนึ่ง OA) — ถ้าแต่ละใบนับเลขของตัวเอง `richmenu-00000001`
 * จะมีอยู่ทั้งใน OA A และ OA B พร้อมกัน แล้วคำขอที่ใช้ id ของ OA อื่นจะ "บังเอิญเจอ" แทนที่จะ
 * ได้ 404 ซึ่งเป็นการซ่อนบั๊กข้าม OA แบบเดียวกับที่ store ใบเดียวเคยซ่อนไว้ ของจริงฝั่ง LINE
 * ก็ไม่ซ้ำกันข้าม OA เช่นกัน
 */
export function createStore(nextId: () => string): MockStore {
  return {
    menus: new Map(),
    aliases: new Map(),
    defaultMenuId: null,
    nextId,
  }
}
