import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/ApiProvider'
import { queryKeys } from '@/api/queryKeys'
import type { Draft, DraftPatch, DraftType, ID } from '@/api/types'

// Endpoint group G: drafts. Every change goes through the server, and the cache takes the server's reply,
// so the editor always shows the stored version (with its version number and review status).
// Edits, review and export for one draft are sent one at a time, in order, so the server always judges
// the draft as it is shown.
const draftQueue = (draftId: ID) => ({ id: `draft:${draftId}` })

export function useDraft(matterId: ID, draftId: ID | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.draft(matterId, draftId ?? 'none'),
    queryFn: () => api.getDraft(draftId as ID),
    enabled: Boolean(draftId),
  })
}

export function useDrafts(matterId: ID) {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.drafts(matterId), queryFn: () => api.listDrafts(matterId) })
}

/** The server's reading of the draft: citation checklist and export gate (INT-3.3). Re-read after every save. */
export function useDraftChecks(matterId: ID, draftId: ID | undefined, enabled = true) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.draftChecks(matterId, draftId ?? 'none'),
    queryFn: () => api.getDraftChecks(draftId as ID),
    enabled: Boolean(draftId) && enabled,
    placeholderData: keepPreviousData,
  })
}

function useStore(matterId: ID) {
  const client = useQueryClient()
  return (draft: Draft) => {
    client.setQueryData(queryKeys.draft(matterId, draft.id), draft)
    void client.invalidateQueries({ queryKey: queryKeys.draftChecks(matterId, draft.id) })
    void client.invalidateQueries({ queryKey: queryKeys.drafts(matterId), exact: true })
  }
}

export function useCreateDraft(matterId: ID) {
  const api = useApi()
  const store = useStore(matterId)
  return useMutation({
    mutationFn: (v: {
      type: DraftType
      incomingDocumentId: ID
      supportingDocumentIds: ID[]
      instructions: string
    }) => api.createDraft({ matterId, ...v }),
    onSuccess: ({ draft }) => store(draft),
  })
}

// Changes show at once and are saved one at a time, in order. Each change is made on top of the one before,
// so only the reply to the last pending change is taken; earlier replies would undo newer edits on screen.
// If the server refuses a change, the panel reloads the stored draft.
export function useUpdateDraft(matterId: ID, draftId: ID) {
  const api = useApi()
  const client = useQueryClient()
  const store = useStore(matterId)
  const key = queryKeys.draft(matterId, draftId)
  const mutationKey = ['draft-update', draftId]
  return useMutation({
    mutationKey,
    scope: draftQueue(draftId),
    mutationFn: (patch: DraftPatch) => api.updateDraft(draftId, patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: key })
      const current = client.getQueryData<Draft>(key)
      if (current && !patch.restoreVersion) {
        const { sections, claims, addedAuthorities, acknowledged, safeguards } = patch
        client.setQueryData<Draft>(key, {
          ...current,
          ...(sections && { sections }),
          ...(claims && { claims }),
          ...(addedAuthorities && { addedAuthorities }),
          ...(acknowledged && { acknowledged }),
          ...(safeguards && { safeguards: { ...current.safeguards, ...safeguards } }),
        })
      }
    },
    onSuccess: (draft) => {
      if (client.isMutating({ mutationKey }) <= 1) store(draft)
    },
    onError: () => client.invalidateQueries({ queryKey: key }),
  })
}

export function useReviewDraft(matterId: ID, draftId: ID) {
  const api = useApi()
  const store = useStore(matterId)
  return useMutation({
    scope: draftQueue(draftId),
    mutationFn: () => api.reviewDraft(draftId),
    onSuccess: store,
  })
}

export function useProposeRewrite(draftId: ID) {
  const api = useApi()
  return useMutation({
    mutationFn: (v: { sectionId: ID; instruction: string }) =>
      api.proposeSectionRewrite(draftId, v.sectionId, v.instruction),
  })
}

export function useProposeClaimResponse(draftId: ID) {
  const api = useApi()
  return useMutation({ mutationFn: (claimId: ID) => api.proposeClaimResponse(draftId, claimId) })
}

export function useExportDraft(draftId: ID) {
  const api = useApi()
  return useMutation({
    scope: draftQueue(draftId),
    mutationFn: (kind: 'clean' | 'working') => api.exportDraft(draftId, kind),
  })
}
