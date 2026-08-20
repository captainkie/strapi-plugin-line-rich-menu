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
  alias: (base: string) => `${base}/v2/bot/richmenu/alias`,
  aliasById: (base: string, aliasId: string) => `${base}/v2/bot/richmenu/alias/${e(aliasId)}`,
  aliasList: (base: string) => `${base}/v2/bot/richmenu/alias/list`,
  botInfo: (base: string) => `${base}/v2/bot/info`,
  userRichMenu: (base: string, userId: string, id: string) =>
    `${base}/v2/bot/user/${e(userId)}/richmenu/${e(id)}`,
} as const
