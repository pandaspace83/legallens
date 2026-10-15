import { create } from 'zustand'
import type { ApiClient } from '@/api/client'
import type { RunEvent, RunStep } from '@/api/events'
import type { AnswerState, Citation, ID, JobRef, SearchedInfo } from '@/api/types'

// Answers being streamed, keyed by conversation. It lives outside React, so an answer keeps streaming
// if the lawyer switches chats. Tokens are flushed once per animation frame (FRONTEND_TODO.md §5).

export interface LiveAnswer {
  runId: ID
  messageId?: ID
  conversationId: ID
  step?: RunStep
  stepsDone: RunStep[]
  scopeLabel?: string
  text: string
  citations: Citation[]
  state?: AnswerState
  outsideLaw?: boolean
  searched?: SearchedInfo
  error?: string
  job?: JobRef
  finished: boolean
}

interface StartInput {
  api: ApiClient
  runId: ID
  conversationId: ID
  onDone: () => Promise<unknown> | void
}

interface RunsState {
  live: Record<ID, LiveAnswer>
  start(input: StartInput): void
  stop(conversationId: ID): void
}

const controllers = new Map<ID, AbortController>()

export const useRuns = create<RunsState>((set, get) => {
  const patch = (conversationId: ID, update: (a: LiveAnswer) => Partial<LiveAnswer>) =>
    set((s) => {
      const current = s.live[conversationId]
      return current
        ? { live: { ...s.live, [conversationId]: { ...current, ...update(current) } } }
        : s
    })

  return {
    live: {},

    start({ api, runId, conversationId, onDone }) {
      const controller = new AbortController()
      controllers.set(conversationId, controller)
      set((s) => ({
        live: {
          ...s.live,
          [conversationId]: {
            runId,
            conversationId,
            stepsDone: [],
            text: '',
            citations: [],
            finished: false,
          },
        },
      }))

      let buffer = ''
      let frame = 0
      const flush = () => {
        frame = 0
        const text = buffer
        buffer = ''
        if (text) patch(conversationId, (a) => ({ text: a.text + text }))
      }

      const onEvent = (event: RunEvent) => {
        switch (event.type) {
          case 'run.started':
            return patch(conversationId, () => ({ messageId: event.messageId }))
          case 'scope':
            return patch(conversationId, () => ({ scopeLabel: event.searching }))
          case 'status':
            return patch(conversationId, (a) => ({
              stepsDone: a.step ? [...a.stepsDone, a.step] : a.stepsDone,
              step: event.step,
            }))
          case 'token':
            buffer += event.delta
            if (!frame) frame = requestAnimationFrame(flush)
            return
          case 'answer_text':
            // The checked answer replaces what was streamed; anything still buffered belongs to the old text.
            buffer = ''
            return patch(conversationId, () => ({ text: event.text }))
          case 'citation':
            return patch(conversationId, (a) => ({ citations: [...a.citations, event.citation] }))
          case 'answer_state':
            return patch(conversationId, () => ({
              state: event.state,
              outsideLaw: event.outsideLaw,
              searched: event.searched,
            }))
          case 'error':
            return patch(conversationId, () => ({ error: event.message, finished: true }))
          case 'done':
            if (frame) cancelAnimationFrame(frame)
            flush()
            patch(conversationId, () => ({ finished: true, step: undefined }))
            controllers.delete(conversationId)
            void Promise.resolve(onDone()).then(() =>
              set((s) => {
                const rest = { ...s.live }
                delete rest[conversationId]
                return { live: rest }
              }),
            )
            return
          case 'job':
            return patch(conversationId, () => ({
              job:
                event.kind === 'summarize'
                  ? { kind: 'summarize', summaryId: event.summaryId }
                  : { kind: 'draft', draftId: event.draftId },
            }))
          case 'intent':
            return
        }
      }

      void api.streamRun(runId, onEvent, controller.signal).catch((error: unknown) => {
        patch(conversationId, () => ({ error: String(error), finished: true }))
      })
    },

    stop(conversationId) {
      controllers.get(conversationId)?.abort()
      if (!get().live[conversationId]) controllers.delete(conversationId)
    },
  }
})

export function useLiveAnswer(conversationId: ID | undefined) {
  return useRuns((s) => (conversationId ? s.live[conversationId] : undefined))
}
