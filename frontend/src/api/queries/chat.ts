import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/ApiProvider'
import { queryKeys } from '@/api/queryKeys'
import type {
  DraftType,
  FeedbackKind,
  ID,
  Mode,
  Scope,
  SummaryAudience,
  SummaryTemplate,
} from '@/api/types'
import { useRuns } from '@/stores/runs'

// Endpoint group D: send a message, then stream its answer into the runs store.
export function useSendMessage(matterId: ID) {
  const api = useApi()
  const client = useQueryClient()
  const startRun = useRuns((s) => s.start)

  return useMutation({
    mutationFn: (v: {
      conversationId?: ID
      content: string
      scope: Scope
      mode: Mode
      summary?: { template: SummaryTemplate; audience: SummaryAudience }
      draft?: { type: DraftType }
    }) => api.sendMessage({ matterId, ...v }),
    onSuccess: async ({ conversationId, runId }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.conversations(matterId) }),
        client.invalidateQueries({ queryKey: queryKeys.messages(matterId, conversationId) }),
      ])
      startRun({
        api,
        runId,
        conversationId,
        onDone: () => {
          void client.invalidateQueries({ queryKey: queryKeys.messages(matterId, conversationId) })
          void client.invalidateQueries({ queryKey: queryKeys.conversations(matterId) })
        },
      })
    },
  })
}

// Feedback on one answer (DEC-52): helpful, or what was wrong with it.
export function useSendFeedback() {
  const api = useApi()
  return useMutation({
    mutationFn: (v: { messageId: ID; kind: FeedbackKind; note?: string }) =>
      api.sendFeedback(v.messageId, v.kind, v.note),
  })
}

// Cancels a summary or draft job; the cards refetch to show the end state.
export function useCancelJob(matterId: ID) {
  const api = useApi()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (jobId: ID) => api.cancelJob(jobId),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['matters', matterId, 'summaries'] })
      void client.invalidateQueries({ queryKey: queryKeys.drafts(matterId) })
    },
  })
}
