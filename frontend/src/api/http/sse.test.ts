import { describe, expect, it, vi, afterEach } from 'vitest'
import { readSse, SseParser } from '@/api/http/sse'

const encoder = new TextEncoder()

function streamOf(chunks: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

describe('SseParser', () => {
  it('reads events split anywhere, with \\r\\n line ends and comments', () => {
    const parser = new SseParser()
    const text =
      ': ping\r\nid: 7\r\nevent: token\r\ndata: {"delta":"a"}\r\n\r\nid: 8\r\nevent: done\r\ndata: {}\r\n\r\n'
    const out = []
    for (let i = 0; i < text.length; i += 3) out.push(...parser.push(text.slice(i, i + 3)))
    expect(out).toEqual([
      { id: '7', event: 'token', data: '{"delta":"a"}' },
      { id: '8', event: 'done', data: '{}' },
    ])
  })

  it('joins multi-line data', () => {
    expect(new SseParser().push('event: x\ndata: a\ndata: b\n\n')).toEqual([
      { id: undefined, event: 'x', data: 'a\nb' },
    ])
  })
})

describe('readSse', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('resumes with Last-Event-ID after a dropped connection and stops at done', async () => {
    const seen: string[] = []
    const headers: (string | null)[] = []
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        headers.push(new Headers(init.headers).get('last-event-id'))
        return streamOf(['id: 1\nevent: token\ndata: {"delta":"a"}\n\n'])
      })
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        headers.push(new Headers(init.headers).get('last-event-id'))
        return streamOf(['id: 2\nevent: done\ndata: {}\n\n'])
      })
    vi.stubGlobal('fetch', fetchMock)
    await readSse({
      path: '/runs/r/stream',
      backoffMs: 1,
      onMessage: (m) => {
        seen.push(m.event)
        return m.event === 'done'
      },
    })
    expect(seen).toEqual(['token', 'done'])
    expect(headers).toEqual([null, '1'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up with a plain message after repeated failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    await expect(
      readSse({ path: '/x', retries: 2, backoffMs: 1, onMessage: () => false }),
    ).rejects.toMatchObject({ code: 'stream_lost' })
  })

  it('does not reconnect once the server has answered with a problem', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'not_found', detail: 'Run not found.', status: 404 }), {
        status: 404,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(readSse({ path: '/x', onMessage: () => false })).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
