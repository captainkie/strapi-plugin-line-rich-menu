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

export function createStore(): MockStore {
  let counter = 0
  return {
    menus: new Map(),
    aliases: new Map(),
    defaultMenuId: null,
    nextId: () => `richmenu-${(++counter).toString().padStart(8, '0')}`,
  }
}
