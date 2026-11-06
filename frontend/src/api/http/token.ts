// The app's session token, for the iOS build (AS-3.2, DEC-104). The web build keeps the HttpOnly cookie and never
// holds a token. VITE_AUTH=bearer switches to "send an Authorization header instead of a cookie".

export interface TokenStore {
  get(): string | null
  set(token: string): void
  clear(): void
}

/** The default store: memory only. The iOS Keychain store replaces it at AS-4.1. */
export function memoryTokenStore(): TokenStore {
  let token: string | null = null
  return {
    get: () => token,
    set: (value) => {
      token = value
    },
    clear: () => {
      token = null
    },
  }
}

let store: TokenStore = memoryTokenStore()
let bearer = import.meta.env.VITE_AUTH === 'bearer'

export function setTokenStore(next: TokenStore) {
  store = next
}

/** For tests: the build decides this in real use. */
export function setBearerMode(on: boolean) {
  bearer = on
}

export const usesBearer = () => bearer
export const saveToken = (token: string) => store.set(token)
export const clearToken = () => store.clear()

/** `Authorization` when this build signs in with a token and one is held; nothing otherwise. */
export function authHeaders(): Record<string, string> {
  const token = bearer ? store.get() : null
  return token ? { authorization: `Bearer ${token}` } : {}
}

/** A bearer build sends no cookies, so nothing can ride along from another origin's page. */
export function credentialsMode(): 'omit' | 'same-origin' {
  return bearer ? 'omit' : 'same-origin'
}
