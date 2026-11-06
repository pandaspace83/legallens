import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, send } from './request'
import { readSse } from './sse'
import {
  authHeaders,
  clearToken,
  credentialsMode,
  memoryTokenStore,
  saveToken,
  setBearerMode,
  setTokenStore,
} from './token'

// AS-3.2 (DEC-104): a bearer build sends Authorization and no cookie; a cookie build sends neither a token nor ever
// holds one.
function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const lastInit = (mock: ReturnType<typeof stubFetch>) =>
  (mock.mock.calls[0] as unknown as [string, RequestInit])[1]

beforeEach(() => {
  setTokenStore(memoryTokenStore())
})
afterEach(() => {
  setBearerMode(false)
  vi.unstubAllGlobals()
})

describe('bearer build', () => {
  beforeEach(() => setBearerMode(true))

  it('sends the token and no cookie', async () => {
    saveToken('tok-123')
    const mock = stubFetch(new Response('{}', { status: 200 }))
    await send('/matters')
    const init = lastInit(mock)
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-123')
    expect(init.credentials).toBe('omit')
  })

  it('sends the token on the answer stream too', async () => {
    saveToken('tok-123')
    const mock = stubFetch(new Response(null, { status: 401 }))
    await expect(
      readSse({ path: '/runs/r/stream', onMessage: () => true, retries: 0 }),
    ).rejects.toBeInstanceOf(ApiError)
    expect((lastInit(mock).headers as Record<string, string>).authorization).toBe('Bearer tok-123')
  })

  it('sends no header before sign-in', () => {
    expect(authHeaders()).toEqual({})
  })

  it('forgets the token when the session has expired', async () => {
    saveToken('tok-123')
    stubFetch(
      new Response(JSON.stringify({ code: 'session_expired', detail: 'x' }), {
        status: 401,
        headers: { 'content-type': 'application/problem+json' },
      }),
    )
    await expect(send('/matters')).rejects.toBeInstanceOf(ApiError)
    expect(authHeaders()).toEqual({})
  })

  it('clearToken forgets it', () => {
    saveToken('tok-123')
    clearToken()
    expect(authHeaders()).toEqual({})
  })
})

describe('cookie build (the web app)', () => {
  it('never sends a token, even if one were stored, and keeps same-origin cookies', async () => {
    saveToken('tok-123')
    const mock = stubFetch(new Response('{}', { status: 200 }))
    await send('/matters')
    const init = lastInit(mock)
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
    expect(init.credentials).toBe('same-origin')
    expect(credentialsMode()).toBe('same-origin')
  })
})
