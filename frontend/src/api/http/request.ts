// The request layer (INT-2.1): base /api/v1, same-origin cookies, JSON in and out, and every failure as an ApiError.

export const BASE = '/api/v1'

/** A problem+json answer from the server (RFC 9457), or a connection failure (status 0). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  /** Fields the server added to the problem, e.g. `errors`, `blockers` or `current_version`. */
  readonly extras: Record<string, unknown>

  constructor(init: {
    status: number
    code: string
    detail: string
    requestId?: string
    extras?: Record<string, unknown>
  }) {
    super(init.detail)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId
    this.extras = init.extras ?? {}
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

type Unauthorized = (error: ApiError) => void
let onUnauthorized: Unauthorized = () => {}

/** The session store registers itself here, so a 401 from any call reaches the lock screen (INT-2.1). */
export function setUnauthorizedHandler(handler: Unauthorized) {
  onUnauthorized = handler
}

export function url(path: string, query?: RequestOptions['query']) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const search = params.toString()
  return `${BASE}${path}${search ? `?${search}` : ''}`
}

const UNREACHABLE =
  'LegalLens can’t reach its own server. Check that it is running, then try again.'

export async function problemFrom(response: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {}
  try {
    body = (await response.json()) as Record<string, unknown>
  } catch {
    // Not JSON (a proxy error page): fall through to the status text.
  }
  const { code, detail, request_id, type, title, status, instance, ...extras } = body
  void type
  void title
  void status
  void instance
  return new ApiError({
    status: response.status,
    code: typeof code === 'string' ? code : `http_${response.status}`,
    detail:
      typeof detail === 'string' ? detail : `The server answered ${response.status}. Try again.`,
    requestId:
      typeof request_id === 'string'
        ? request_id
        : (response.headers.get('x-request-id') ?? undefined),
    extras,
  })
}

/** Sends a request and returns the raw Response when it succeeded. Failures throw an ApiError. */
export async function send(path: string, options: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', query, body, headers, signal } = options
  let response: Response
  try {
    response = await fetch(url(path, query), {
      method,
      credentials: 'same-origin',
      signal,
      headers: {
        accept: 'application/json',
        // A page on another origin can't add this without a CORS preflight; the real-auth server requires it on writes.
        'x-legallens-request': '1',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ApiError({ status: 0, code: 'unreachable', detail: UNREACHABLE })
  }
  if (response.ok) return response
  const error = await problemFrom(response)
  // A session that ended while the page was open: the lock screen asks for a fresh sign-in (DEC-54). Wrong
  // passwords and codes are also 401s but carry their own codes, and are answered on the sign-in form.
  if (response.status === 401 && error.code === 'session_expired') onUnauthorized(error)
  throw error
}

/** JSON in, JSON out. A 204 gives `undefined`. */
export async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await send(path, options)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** A file answer: the bytes and the name the server gave them. */
export async function requestFile(
  path: string,
  options?: RequestOptions,
): Promise<{ blob: Blob; filename: string }> {
  const response = await send(path, options)
  const disposition = response.headers.get('content-disposition') ?? ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  return {
    blob: await response.blob(),
    filename: match?.[1] ? decodeURIComponent(match[1]) : 'download',
  }
}

interface CursorPage<T> {
  items: T[]
  next_cursor?: string | null
}

/** Walks `next_cursor` until the list is complete. Lists here are small; real paging can come later. */
export async function walk<T>(
  path: string,
  query: RequestOptions['query'] = {},
  cursorParam = 'cursor',
): Promise<T[][]> {
  const pages: T[][] = []
  let cursor: string | undefined
  for (let guard = 0; guard < 200; guard++) {
    const page = await request<CursorPage<T>>(path, {
      query: { ...query, limit: 100, ...(cursor ? { [cursorParam]: cursor } : {}) },
    })
    pages.push(page.items)
    if (!page.next_cursor) break
    cursor = page.next_cursor
  }
  return pages
}
