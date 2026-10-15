import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/ApiProvider'
import { queryKeys } from '@/api/queryKeys'
import type { DocumentOrigin, ID, LegalDocument } from '@/api/types'

// Endpoint group E: documents, their pages, upload and deletion.
export function useDocuments(matterId: ID) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.documents(matterId),
    queryFn: () => api.listDocuments(matterId),
  })
}

export function useDocumentPages(matterId: ID, documentId: ID | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.documentPages(matterId, documentId ?? 'none'),
    queryFn: () => api.getDocumentPages(documentId as ID),
    enabled: Boolean(documentId),
    staleTime: Infinity,
  })
}

export interface UploadInput {
  file: File
  origin: DocumentOrigin
  /** 0–1 while the bytes go up. */
  onProgress?: (fraction: number) => void
}

export function useUploadDocument(matterId: ID) {
  const api = useApi()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (v: UploadInput) => api.uploadDocument(matterId, v.file, v.origin, v.onProgress),
    onSuccess: ({ document }) => {
      client.setQueryData<LegalDocument[]>(queryKeys.documents(matterId), (all) => [
        document,
        ...(all ?? []),
      ])
      void client.invalidateQueries({ queryKey: queryKeys.matters })
    },
  })
}

export function useDeletionImpact(documentId: ID | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: ['deletion-impact', documentId],
    queryFn: () => api.getDeletionImpact(documentId as ID),
    enabled: Boolean(documentId),
    staleTime: 0,
    gcTime: 0,
  })
}

export function useDeleteDocument(matterId: ID) {
  const api = useApi()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (documentId: ID) => api.deleteDocument(documentId),
    onSuccess: (_void, documentId) => {
      client.setQueryData<LegalDocument[]>(queryKeys.documents(matterId), (all) =>
        all?.filter((d) => d.id !== documentId),
      )
      // Answers that cited it lose those citations (DEC-58), so cached threads are refreshed.
      void client.invalidateQueries({ queryKey: ['matters', matterId, 'conversations'] })
      void client.invalidateQueries({ queryKey: queryKeys.matters })
    },
  })
}

/** The audited read of what a document hides (DEC-59). A mutation, not a query: it only runs on the lawyer's
 * deliberate step, and every call is recorded in the matter's audit log. */
export function useRevealHiddenContent() {
  const api = useApi()
  return useMutation({ mutationFn: (documentId: ID) => api.getHiddenContent(documentId) })
}
