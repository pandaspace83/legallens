import type { ID } from '@/api/types'

// Query keys. Anything holding client data is keyed under its matter, so caches never mix matters (DEC-53).
export const queryKeys = {
  me: ['me'] as const,
  matters: ['matters'] as const,
  matter: (matterId: ID) => ['matters', matterId] as const,
  conversations: (matterId: ID) => ['matters', matterId, 'conversations'] as const,
  messages: (matterId: ID, conversationId: ID) =>
    ['matters', matterId, 'conversations', conversationId, 'messages'] as const,
  documents: (matterId: ID) => ['matters', matterId, 'documents'] as const,
  summaries: (matterId: ID) => ['matters', matterId, 'summaries'] as const,
  summary: (matterId: ID, summaryId: ID) => ['matters', matterId, 'summaries', summaryId] as const,
  drafts: (matterId: ID) => ['matters', matterId, 'drafts'] as const,
  draft: (matterId: ID, draftId: ID) => ['matters', matterId, 'drafts', draftId] as const,
  draftChecks: (matterId: ID, draftId: ID) =>
    ['matters', matterId, 'drafts', draftId, 'checks'] as const,
  documentPages: (matterId: ID, documentId: ID) =>
    ['matters', matterId, 'documents', documentId, 'pages'] as const,
}
