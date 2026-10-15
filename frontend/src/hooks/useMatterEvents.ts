import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useApi } from '@/api/ApiProvider'
import { queryKeys } from '@/api/queryKeys'
import type { Draft, ID, LegalDocument, Summary } from '@/api/types'

// Listens to the matter's event stream (GET /matters/{id}/events) while the matter is open: live job
// progress goes straight into the cache, and finished or failed work raises a notice.
export function useMatterEvents(matterId: ID) {
  const api = useApi()
  const client = useQueryClient()
  const [, setParams] = useSearchParams()

  useEffect(() => {
    const documents = queryKeys.documents(matterId)
    const patchDocument = (id: ID, fields: Partial<LegalDocument>) =>
      client.setQueryData<LegalDocument[]>(documents, (all) =>
        all?.map((d) => (d.id === id ? { ...d, ...fields } : d)),
      )
    const patchSummary = (id: ID, fields: Partial<Summary>) =>
      client.setQueryData<Summary>(queryKeys.summary(matterId, id), (s) =>
        s ? { ...s, ...fields } : s,
      )
    const patchDraft = (id: ID, fields: Partial<Draft>) =>
      client.setQueryData<Draft>(queryKeys.draft(matterId, id), (d) =>
        d ? { ...d, ...fields } : d,
      )
    const openDraft = (id: ID) =>
      setParams((current) => {
        const next = new URLSearchParams(current)
        for (const key of ['doc', 'page', 'cite', 'summary']) next.delete(key)
        next.set('draft', id)
        return next
      })
    const openSummary = (id: ID) =>
      setParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('doc')
        next.delete('page')
        next.delete('cite')
        next.set('summary', id)
        return next
      })

    return api.subscribeMatterEvents(matterId, (event) => {
      switch (event.type) {
        case 'job.progress':
          if (event.kind === 'ingest') {
            return patchDocument(event.documentId, {
              status: 'processing',
              progress: event.pct,
              step: event.step,
              stepDetail: event.detail,
            })
          }
          if (event.kind === 'draft') {
            return patchDraft(event.draftId, {
              progress: event.pct,
              step: event.step,
              stepDetail: event.detail,
            })
          }
          return patchSummary(event.summaryId, {
            progress: event.pct,
            step: event.step,
            stepDetail: event.detail,
          })
        case 'job.done':
          if (event.kind === 'draft') {
            void client.invalidateQueries({ queryKey: queryKeys.drafts(matterId) })
            return void toast.success('Draft ready for your review', {
              description: event.title,
              action: { label: 'Open', onClick: () => openDraft(event.draftId) },
            })
          }
          void client.invalidateQueries({ queryKey: queryKeys.summaries(matterId) })
          return void toast.success('Summary ready', {
            description: event.documentName,
            action: { label: 'Open', onClick: () => openSummary(event.summaryId) },
          })
        case 'job.failed':
          // Without this a failed summary or draft stayed on "processing" until the page was reloaded.
          void client.invalidateQueries({
            queryKey:
              event.kind === 'draft' ? queryKeys.drafts(matterId) : queryKeys.summaries(matterId),
          })
          return void toast.error(
            event.kind === 'draft'
              ? 'The draft couldn’t be completed'
              : 'The summary couldn’t be completed',
            { description: event.message, duration: 8000 },
          )
        case 'document.ready': {
          void client.invalidateQueries({ queryKey: documents })
          const { pagesRead, unreadablePages } = event.coverage
          const total = pagesRead + unreadablePages.length
          return void toast.success(`${event.name} is ready to search`, {
            description: unreadablePages.length
              ? `${pagesRead} of ${total} pages read · page ${unreadablePages.join(', ')} unreadable`
              : `All ${total} ${total === 1 ? 'page' : 'pages'} read`,
          })
        }
        case 'document.failed':
          void client.invalidateQueries({ queryKey: documents })
          return void toast.error(
            event.quarantined ? `${event.name} was quarantined` : `${event.name} couldn’t be read`,
            {
              description: event.reason,
              duration: 8000,
            },
          )
      }
    })
  }, [api, client, matterId, setParams])
}
