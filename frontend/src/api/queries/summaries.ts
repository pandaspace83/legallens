import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/ApiProvider'
import { queryKeys } from '@/api/queryKeys'
import type { ID, Summary, SummaryAudience, SummaryTemplate } from '@/api/types'

// Endpoint group F: summaries. Progress arrives on the matter event stream (useMatterEvents).
export function useSummaries(matterId: ID) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.summaries(matterId),
    queryFn: () => api.listSummaries(matterId),
  })
}

export function useSummary(matterId: ID, summaryId: ID | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.summary(matterId, summaryId ?? 'none'),
    queryFn: () => api.getSummary(summaryId as ID),
    enabled: Boolean(summaryId),
  })
}

export function useCreateSummary(matterId: ID) {
  const api = useApi()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: { documentId: ID; template: SummaryTemplate; audience: SummaryAudience }) =>
      api.createSummary({ matterId, ...v }),
    onSuccess: ({ summary }) => {
      client.setQueryData<Summary>(queryKeys.summary(matterId, summary.id), summary)
      void client.invalidateQueries({ queryKey: queryKeys.summaries(matterId) })
    },
  })
}

export function useExportSummary() {
  const api = useApi()
  return useMutation({ mutationFn: (summaryId: ID) => api.exportSummary(summaryId) })
}
