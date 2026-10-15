import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { ID } from '@/api/types'

// The side panel lives in the URL, so links, refresh and Back all work (§3):
// ?doc=…&page=…&cite=… for a document at a passage, ?summary=… for a summary, ?draft=… for a draft.
// A document opened from a summary or a draft keeps that parameter, so closing the document returns to it.
export function useViewer() {
  const [params, setParams] = useSearchParams()
  const docId = params.get('doc') ?? undefined
  const page = params.get('page') ? Number(params.get('page')) : undefined
  const anchor = params.get('cite') ?? undefined
  const summaryId = params.get('summary') ?? undefined
  const draftId = params.get('draft') ?? undefined

  const update = useCallback(
    (change: (next: URLSearchParams) => void) =>
      setParams((current) => {
        const next = new URLSearchParams(current)
        change(next)
        return next
      }),
    [setParams],
  )

  const open = useCallback(
    (documentId: ID, at?: { page: number; anchor: string }) =>
      update((next) => {
        next.set('doc', documentId)
        if (at) {
          next.set('page', String(at.page))
          next.set('cite', at.anchor)
        } else {
          next.delete('page')
          next.delete('cite')
        }
      }),
    [update],
  )

  const close = useCallback(
    () =>
      update((next) => {
        next.delete('doc')
        next.delete('page')
        next.delete('cite')
      }),
    [update],
  )

  const openSummary = useCallback(
    (id: ID) =>
      update((next) => {
        for (const key of ['doc', 'page', 'cite', 'draft']) next.delete(key)
        next.set('summary', id)
      }),
    [update],
  )

  const closeSummary = useCallback(() => update((next) => next.delete('summary')), [update])

  const openDraft = useCallback(
    (id: ID) =>
      update((next) => {
        for (const key of ['doc', 'page', 'cite', 'summary']) next.delete(key)
        next.set('draft', id)
      }),
    [update],
  )

  const closeDraft = useCallback(() => update((next) => next.delete('draft')), [update])

  return {
    docId,
    page,
    anchor,
    summaryId,
    draftId,
    open,
    close,
    openSummary,
    closeSummary,
    openDraft,
    closeDraft,
  }
}
