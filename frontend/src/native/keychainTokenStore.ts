import { Capacitor, registerPlugin } from '@capacitor/core'
import { memoryTokenStore, setTokenStore, type TokenStore } from '@/api/http/token'

// The iOS Keychain holds the session token between launches (AS-4.2, DEC-104). The plugin is ios/App/App/KeychainPlugin.swift.
// Requests read the token synchronously, so it is kept in memory and written through to the Keychain.
export interface KeychainPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

export const KEY = 'session-token'

/** Memory in front, the Keychain behind. A failed Keychain write only means the next launch signs in again. */
export function keychainTokenStore(keychain: KeychainPlugin, initial: string | null): TokenStore {
  const memory = memoryTokenStore()
  if (initial) memory.set(initial)
  return {
    get: () => memory.get(),
    set(token) {
      memory.set(token)
      void keychain.set({ key: KEY, value: token }).catch(() => {})
    },
    clear() {
      memory.clear()
      void keychain.remove({ key: KEY }).catch(() => {})
    },
  }
}

/** Run once before the app renders. On the web, or if the Keychain cannot be read, nothing changes. */
export async function loadKeychainTokenOnIos(
  keychain: KeychainPlugin = registerPlugin<KeychainPlugin>('Keychain'),
  native: boolean = Capacitor.isNativePlatform(),
): Promise<void> {
  if (!native) return
  let saved: string | null = null
  try {
    saved = (await keychain.get({ key: KEY })).value
  } catch {
    saved = null
  }
  setTokenStore(keychainTokenStore(keychain, saved))
}
