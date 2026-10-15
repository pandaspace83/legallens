import { MessageSquareDashed, Pin, PinOff } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useConversations, useMessages, useUpdateConversation } from '@/api/queries/conversations'
import { LoadError } from '@/components/common/LoadError'
import type { ID } from '@/api/types'
import { IconButton } from '@/components/ui/IconButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { JumpToLatest } from '@/features/chat/JumpToLatest'
import { NewChatEmptyState } from '@/features/chat/NewChatEmptyState'
import { Thread } from '@/features/chat/Thread'
import { Composer } from '@/features/composer/Composer'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { useLiveAnswer } from '@/stores/runs'

// A conversation (thread + composer), or the new-chat screen when no chat is open (FE-4.1).
export function ChatPage() {
  const { matterId = '', conversationId } = useParams()
  if (!conversationId) return <NewChatEmptyState key={matterId} matterId={matterId} />
  return (
    <ConversationView key={conversationId} matterId={matterId} conversationId={conversationId} />
  )
}

function ConversationView({ matterId, conversationId }: { matterId: ID; conversationId: ID }) {
  const {
    data: messages,
    isPending,
    isError,
    refetch,
    isFetching,
  } = useMessages(matterId, conversationId)
  const { data: conversations, isSuccess: listed } = useConversations(matterId)
  const update = useUpdateConversation(matterId)
  const live = useLiveAnswer(conversationId)
  const conversation = conversations?.find((c) => c.id === conversationId)

  const contentKey = `${messages?.length}|${live?.text.length}|${live?.step}|${live?.citations.length}|${live?.finished}`
  const { ref, onScroll, atBottom, scrollToBottom } = useStickToBottom(conversationId, contentKey)

  // Gone only when the matter's chat list loaded without it; any other failure is a failed load, said as such.
  if (isError && !messages && !(listed && !conversation)) {
    return (
      <LoadError
        what="This chat"
        onRetry={() => refetch()}
        retrying={isFetching}
        className="flex h-full items-center justify-center"
      />
    )
  }

  if (isError && !messages) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <MessageSquareDashed className="size-8 text-fg-subtle" aria-hidden />
        <h1 className="mt-3 font-serif text-xl text-fg">This chat isn’t available</h1>
        <p className="mt-1 text-fg-muted">It may have been deleted.</p>
        <Link to={`/m/${matterId}`} className="mt-5 font-medium text-link hover:underline">
          Start a new chat
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line/70 px-6">
        {conversation ? (
          <h1 className="min-w-0 truncate text-[14px] font-medium text-fg">{conversation.title}</h1>
        ) : (
          <Skeleton className="h-4 w-56" />
        )}
        <div className="ml-auto">
          {conversation ? (
            <IconButton
              label={conversation.pinned ? 'Unpin chat' : 'Pin chat'}
              size="sm"
              onClick={() =>
                update.mutate({ id: conversation.id, patch: { pinned: !conversation.pinned } })
              }
            >
              {conversation.pinned ? <PinOff /> : <Pin />}
            </IconButton>
          ) : null}
        </div>
      </header>

      <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-6 pt-8 pb-12">
          {isPending ? (
            <div className="space-y-6" aria-busy="true" aria-label="Loading conversation">
              <Skeleton className="ml-auto h-11 w-2/3 rounded-[20px]" />
              <div className="space-y-2.5">
                <Skeleton className="h-5 w-40 rounded-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[94%]" />
                <Skeleton className="h-4 w-[72%]" />
              </div>
            </div>
          ) : (
            <Thread messages={messages ?? []} live={live} />
          )}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[808px] shrink-0 px-6 pb-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-linear-to-b from-transparent to-app"
        />
        {!atBottom ? <JumpToLatest onClick={() => scrollToBottom()} /> : null}
        <Composer matterId={matterId} conversationId={conversationId} autoFocus />
      </div>
    </div>
  )
}
