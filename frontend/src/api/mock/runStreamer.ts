import { answerFor } from '@/api/mock/answerEngine'
import { delay } from '@/api/mock/latency'
import type { RunEvent } from '@/api/events'
import type { ID, Message } from '@/api/types'

// Plays one chat turn as the real SSE stream would: run.started → intent → scope → status… → token… →
// citation… → answer_state → done (FE-2.4). Honors Stop through the AbortSignal.

export interface PendingRun {
  runId: ID
  matterId: ID
  conversationId: ID
  question: string
  scopeLabel: string
}

const isTest = import.meta.env.MODE === 'test'
const pause = (ms: number, signal?: AbortSignal) => (isTest ? Promise.resolve() : delay(ms, signal))

export async function streamAnswer(
  run: PendingRun,
  onEvent: (event: RunEvent) => void,
  save: (message: Message) => void,
  signal?: AbortSignal,
) {
  const messageId = `${run.runId}-answer`
  const answer = answerFor(run.matterId, run.question, run.runId)
  let streamed = ''

  const finish = (stopped: boolean) => {
    save({
      id: messageId,
      conversationId: run.conversationId,
      role: 'assistant',
      content: stopped ? streamed : answer.text,
      createdAt: new Date().toISOString(),
      ...(stopped
        ? { stopped: true }
        : {
            answerState: answer.state,
            outsideLaw: answer.outsideLaw,
            citations: answer.citations,
            searched: { ...answer.searched, scopeLabel: run.scopeLabel },
          }),
    })
    onEvent({ type: 'done', messageId, ...(stopped ? { cancelled: true } : {}) })
  }

  try {
    onEvent({ type: 'run.started', runId: run.runId, messageId })
    onEvent({ type: 'intent', intent: 'ask', confidence: 0.93 })
    onEvent({ type: 'scope', searching: run.scopeLabel })

    onEvent({ type: 'status', step: 'rewriting' })
    await pause(450, signal)
    onEvent({ type: 'status', step: 'searching' })
    await pause(700, signal)
    onEvent({ type: 'status', step: 'reranking' })
    await pause(450, signal)
    onEvent({ type: 'status', step: 'generating' })

    for (const token of answer.text.match(/\S+\s*/g) ?? []) {
      await pause(14 + Math.random() * 22, signal)
      streamed += token
      onEvent({ type: 'token', delta: token })
    }

    onEvent({ type: 'status', step: 'verifying' })
    await pause(500, signal)
    for (const citation of answer.citations) onEvent({ type: 'citation', citation })
    onEvent({
      type: 'answer_state',
      state: answer.state,
      outsideLaw: answer.outsideLaw,
      searched: { ...answer.searched, scopeLabel: run.scopeLabel },
    })
    finish(false)
  } catch (error) {
    if (signal?.aborted) return finish(true)
    onEvent({ type: 'error', code: 'mock_failure', message: String(error) })
  }
}
