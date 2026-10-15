import { useConversations } from '@/api/queries/conversations'
import { useDocuments } from '@/api/queries/documents'
import type { ID } from '@/api/types'
import { useSettings } from '@/stores/settings'

// Whether the first-run guide shows in a matter (FE-8.5): until it has documents and a chat, unless hidden.
export function useShowOnboarding(matterId: ID) {
  const dismissed = useSettings((s) => s.onboardingDismissed)
  const { data: documents } = useDocuments(matterId)
  const { data: conversations } = useConversations(matterId)
  if (dismissed || !documents || !conversations) return false
  return documents.length === 0 || conversations.length === 0
}
