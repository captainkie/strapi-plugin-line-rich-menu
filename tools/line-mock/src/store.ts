export interface StoredMenu {
  richMenuId: string
  payload: unknown
  image?: { mime: string; bytes: number }
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
