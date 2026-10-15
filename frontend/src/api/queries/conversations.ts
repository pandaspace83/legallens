import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/ApiProvider'
import { queryKeys } from '@/api/queryKeys'
import type { Conversation, ID } from '@/api/types'

// Endpoint group C: chat history. Rename, pin and delete update the sidebar at once and roll back on failure.
export function useConversations(matterId: ID) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.conversations(matterId),
    queryFn: () => api.listConversations(matterId),
  })
}

export function useMessages(matterId: ID, conversationId: ID | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.messages(matterId, conversationId ?? 'none'),
    queryFn: () => api.listMessages(conversationId as ID),
    enabled: Boolean(conversationId),
  })
}

function useOptimisticList(matterId: ID) {
  const client = useQueryClient()
  const key = queryKeys.conversations(matterId)
  return {
    async apply(update: (list: Conversation[]) => Conversation[]) {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<Conversation[]>(key)
      if (previous) client.setQueryData(key, update(previous))
      return { previous }
    },
    rollback(context: { previous?: Conversation[] } | undefined) {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
    settle: () => client.invalidateQueries({ queryKey: key }),
  }
}

export function useUpdateConversation(matterId: ID) {
  const api = useApi()
  const list = useOptimisticList(matterId)
  return useMutation({
    mutationFn: (v: { id: ID; patch: Partial<Pick<Conversation, 'title' | 'pinned'>> }) =>
      api.updateConversation(v.id, v.patch),
    onMutate: (v) =>
      list.apply((all) => all.map((c) => (c.id === v.id ? { ...c, ...v.patch } : c))),
    onError: (_error, _v, context) => list.rollback(context),
    onSettled: list.settle,
  })
}

export function useDeleteConversation(matterId: ID) {
  const api = useApi()
  const list = useOptimisticList(matterId)
  return useMutation({
    mutationFn: (id: ID) => api.deleteConversation(id),
    onMutate: (id) => list.apply((all) => all.filter((c) => c.id !== id)),
    onError: (_error, _id, context) => list.rollback(context),
    onSettled: list.settle,
  })
}
