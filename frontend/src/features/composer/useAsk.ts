import { useNavigate } from 'react-router'
import { useSendMessage } from '@/api/queries/chat'
import type { ID } from '@/api/types'
import {
  useMatterDraftType,
  useMatterMode,
  useMatterScope,
  useMatterSummaryPick,
} from '@/stores/composer'

// Sends a question with the matter's current scope and mode; a new chat opens its conversation page.
export function useAsk(matterId: ID, conversationId?: ID) {
  const navigate = useNavigate()
  const scope = useMatterScope(matterId)
  const mode = useMatterMode(matterId)
  const summary = useMatterSummaryPick(matterId)
  const draftType = useMatterDraftType(matterId)
  const send = useSendMessage(matterId)

  const ask = (content: string) => {
    const text = content.trim()
    if (!text || send.isPending) return
    send.mutate(
      {
        conversationId,
        content: text,
        scope,
        mode,
        summary,
        // Only a deliberate Draft mode fixes the type; in Auto the words ("a memo on …") decide it.
        draft: mode === 'draft' ? { type: draftType } : undefined,
      },
      { onSuccess: (r) => !conversationId && navigate(`/m/${matterId}/c/${r.conversationId}`) },
    )
  }

  return { ask, sending: send.isPending, error: send.error }
}
