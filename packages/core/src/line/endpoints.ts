export const DEFAULT_API_BASE = 'https://api.line.me'
export const DEFAULT_API_DATA_BASE = 'https://api-data.line.me'

const e = encodeURIComponent

export const endpoints = {
  createRichMenu: (base: string) => `${base}/v2/bot/richmenu`,
  validateRichMenu: (base: string) => `${base}/v2/bot/richmenu/validate`,
  richMenu: (base: string, id: string) => `${base}/v2/bot/richmenu/${e(id)}`,
  richMenuList: (base: string) => `${base}/v2/bot/richmenu/list`,
  uploadContent: (dataBase: string, id: string) => `${dataBase}/v2/bot/richmenu/${e(id)}/content`,
  setDefault: (base: string, id: string) => `${base}/v2/bot/user/all/richmenu/${e(id)}`,
  clearDefault: (base: string) => `${base}/v2/bot/user/all/richmenu`,
  // URL เดียวกับ clearDefault ต่างกันแค่ method (GET อ่าน · DELETE ล้าง)
  // ประกาศแยกชื่อเพราะจุดเรียกอ่านง่ายกว่า `endpoints.clearDefault(base)` ที่ตามด้วย method: 'GET'
  defaultRichMenu: (base: string) => `${base}/v2/bot/user/all/richmenu`,
  alias: (base: string) => `${base}/v2/bot/richmenu/alias`,
  aliasById: (base: string, aliasId: string) => `${base}/v2/bot/richmenu/alias/${e(aliasId)}`,
  aliasList: (base: string) => `${base}/v2/bot/richmenu/alias/list`,
  botInfo: (base: string) => `${base}/v2/bot/info`,
  userRichMenu: (base: string, userId: string, id: string) =>
    `${base}/v2/bot/user/${e(userId)}/richmenu/${e(id)}`,
  bulkLink: (base: string) => `${base}/v2/bot/richmenu/bulk/link`,
  bulkUnlink: (base: string) => `${base}/v2/bot/richmenu/bulk/unlink`,
  batch: (base: string) => `${base}/v2/bot/richmenu/batch`,
  // ตรวจ operations ก่อนยิง batch จริง — batch จริงมีโควตาแค่ 3 ครั้ง/ชั่วโมง
  // endpoint นี้ไม่นับรวมในโควตานั้น
  validateBatch: (base: string) => `${base}/v2/bot/richmenu/validate/batch`,
  batchProgress: (base: string, requestId: string) =>
    `${base}/v2/bot/richmenu/progress/batch?requestId=${e(requestId)}`,
  // URL เดียวกับ userRichMenu แต่ตัด richMenuId ท้ายออก — GET อ่านเมนูที่ผูกกับ user นี้อยู่
  // (getUserRichMenu) และ DELETE เลิกผูก (unlinkFromUser) ใช้ path เดียวกัน ต่างกันแค่ method
  // เหมือนคู่ clearDefault/defaultRichMenu ข้างบน
  userRichMenuLink: (base: string, userId: string) => `${base}/v2/bot/user/${e(userId)}/richmenu`,
} as const
