import { describe, expect, it, vi } from 'vitest'
import { currentToken, memoryTokenStore, setBearerMode, setTokenStore } from '@/api/http/token'
import {
  KEY,
  keychainTokenStore,
  loadKeychainTokenOnIos,
  type KeychainPlugin,
} from './keychainTokenStore'

function fake(initial: string | null = null) {
  let held = initial
  const plugin: KeychainPlugin = {
    get: vi.fn(async () => ({ value: held })),
    set: vi.fn(async ({ value }) => {
      held = value
    }),
    remove: vi.fn(async () => {
      held = null
    }),
  }
  return { plugin, held: () => held }
}

describe('Keychain token store', () => {
  it('starts with the token saved by the last launch', () => {
    const { plugin } = fake()
    expect(keychainTokenStore(plugin, 'saved').get()).toBe('saved')
  })

  it('writes a new token through to the Keychain and forgets it on clear', () => {
    const { plugin, held } = fake()
    const store = keychainTokenStore(plugin, null)
    store.set('abc')
    expect(store.get()).toBe('abc')
    expect(plugin.set).toHaveBeenCalledWith({ key: KEY, value: 'abc' })
    expect(held()).toBe('abc')
    store.clear()
    expect(store.get()).toBeNull()
    expect(plugin.remove).toHaveBeenCalledWith({ key: KEY })
    expect(held()).toBeNull()
  })

  it('keeps working in memory when the Keychain refuses a write', () => {
    const { plugin } = fake()
    plugin.set = vi.fn(async () => {
      throw new Error('locked')
    })
    const store = keychainTokenStore(plugin, null)
    store.set('abc')
    expect(store.get()).toBe('abc')
  })

  it('loads the saved token into requests at startup, on a device only', async () => {
    setBearerMode(true)
    const { plugin } = fake('from-keychain')
    setTokenStore(memoryTokenStore())
    await loadKeychainTokenOnIos(plugin, false)
    expect(currentToken()).toBeNull()
    await loadKeychainTokenOnIos(plugin, true)
    expect(currentToken()).toBe('from-keychain')
    setTokenStore(memoryTokenStore())
    setBearerMode(false)
  })

  it('starts signed out when Face ID is cancelled, without deleting the saved token', async () => {
    setBearerMode(true)
    const { plugin } = fake('saved')
    plugin.get = vi.fn(async () => ({ value: null, canceled: true }))
    await loadKeychainTokenOnIos(plugin, true)
    expect(currentToken()).toBeNull()
    expect(plugin.remove).not.toHaveBeenCalled()
    setTokenStore(memoryTokenStore())
    setBearerMode(false)
  })

  it('starts signed out if the Keychain cannot be read', async () => {
    setBearerMode(true)
    const { plugin } = fake()
    plugin.get = vi.fn(async () => {
      throw new Error('unavailable')
    })
    await loadKeychainTokenOnIos(plugin, true)
    expect(currentToken()).toBeNull()
    setTokenStore(memoryTokenStore())
    setBearerMode(false)
  })
})
