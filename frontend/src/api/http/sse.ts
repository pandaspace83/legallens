import { ApiError, problemFrom, url, type RequestOptions } from '@/api/http/request'

// A small Server-Sent Events reader over fetch (decision 7). EventSource can't be stopped from a signal and
// reconnects by itself after `done`; this one closes when the run ends, and resumes with Last-Event-ID when the
// connection drops mid-run (INT-2.6).

export interface SseMessage {
  id?: string
  event: string
  data: string
}

/** Incremental parser: feed it text as it arrives; it returns the complete messages so far. */
export class SseParser {
  private buffer = ''
  private id: string | undefined
  private event = ''
  private data: string[] = []

  push(chunk: string): SseMessage[] {
    // A trailing \r may be the first half of \r\n (sse-starlette separates lines with \r\n): hold it back.
    let text = this.buffer + chunk
    let held = ''
    if (text.endsWith('\r')) {
      held = '\r'
      text = text.slice(0, -1)
    }
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    this.buffer = (lines.pop() ?? '') + held
    const out: SseMessage[] = []
    for (const line of lines) {
      if (line === '') {
        if (this.data.length) {
          out.push({ id: this.id, event: this.event || 'message', data: this.data.join('\n') })
        }
        this.event = ''
        this.data = []
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
        if (field === 'event') this.event = value
        else if (field === 'data') this.data.push(value)
        else if (field === 'id') this.id = value
      }
    }
    return out
  }
}

export interface ReadSseOptions {
  path: string
  query?: RequestOptions['query']
  signal?: AbortSignal
  /** Return true when the stream is finished: no reconnect follows. */
  onMessage: (message: SseMessage) => boolean | void
  /** Reconnects allowed after a dropped connection. */
  retries?: number
  backoffMs?: number
}

/** Reads a stream to its end, reconnecting with Last-Event-ID when the connection drops before `onMessage`
 * says it is finished. Resolves when finished or aborted; rejects with an ApiError otherwise. */
export async function readSse(options: ReadSseOptions): Promise<void> {
  const { path, query, signal, onMessage, retries = 5, backoffMs = 400 } = options
  let lastId: string | undefined
  let failures = 0
  for (;;) {
    if (signal?.aborted) return
    try {
      const response = await fetch(url(path, query), {
        credentials: 'same-origin',
        signal,
        headers: { accept: 'text/event-stream', ...(lastId ? { 'last-event-id': lastId } : {}) },
      })
      if (!response.ok) throw await problemFrom(response)
      if (!response.body) throw new Error('No response body')
      const parser = new SseParser()
      const decoder = new TextDecoder()
      const reader = response.body.getReader()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        failures = 0
        for (const message of parser.push(decoder.decode(value, { stream: true }))) {
          if (message.id) lastId = message.id
          if (onMessage(message)) {
            void reader.cancel().catch(() => {})
            return
          }
        }
      }
      // The server closed the stream without finishing the run: resume from the last event.
    } catch (error) {
      if (signal?.aborted) return
      // A problem the server answered (not found, forbidden) will not change by trying again.
      if (error instanceof ApiError) throw error
    }
    failures += 1
    if (failures > retries) {
      throw new ApiError({
        status: 0,
        code: 'stream_lost',
        detail: 'The connection to LegalLens dropped and could not be restored. Try again.',
      })
    }
    await new Promise((resolve) => setTimeout(resolve, backoffMs * failures))
  }
}
