import { Capacitor, registerPlugin } from '@capacitor/core'
import { memoryTokenStore, setTokenStore, type TokenStore } from '@/api/http/token'

// The iOS Keychain holds the session token between launches (AS-4.2, DEC-104), behind Face ID or the device passcode
// (AS-4.2b, DEC-107). The plugin is ios/App/App/KeychainPlugin.swift. Requests read the token synchronously, so it is
// kept in memory and written through to the Keychain. Reading it at launch is what shows the Face ID prompt.
export interface KeychainPlugin {
  /** `canceled` when Face ID or the passcode was cancelled or failed: start signed out, keep the saved token. */
  get(options: { key: string }): Promise<{ value: string | null; canceled?: boolean }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

export const KEY = 'session-token'

// A failure never blocks the app, but it is logged (never the token) so a broken Keychain cannot hide: in AS-4.2a the
// plugin was not registered at all and nothing said so.
const warn = (step: string) => (error: unknown) => {
  console.warn(
    `LegalLens: Keychain ${step} failed:`,
    error instanceof Error ? error.message : error,
  )
}

/** Memory in front, the Keychain behind. A failed Keychain write (for example no passcode on the iPhone, so nothing
 * is saved by design) only means the next launch signs in again. */
export function keychainTokenStore(keychain: KeychainPlugin, initial: string | null): TokenStore {
  const memory = memoryTokenStore()
  if (initial) memory.set(initial)
  return {
    get: () => memory.get(),
    set(token) {
      memory.set(token)
      void keychain.set({ key: KEY, value: token }).catch(warn('save'))
    },
    clear() {
      memory.clear()
      void keychain.remove({ key: KEY }).catch(warn('remove'))
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
  } catch (error) {
    warn('read')(error)
    saved = null
  }
  setTokenStore(keychainTokenStore(keychain, saved))
}
