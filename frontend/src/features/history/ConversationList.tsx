import { useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MessageSquareDashed } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useApi } from '@/api/ApiProvider'
import { useConversations, useUpdateConversation } from '@/api/queries/conversations'
import { queryKeys } from '@/api/queryKeys'
import type { Conversation, ID } from '@/api/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { ConversationItem } from '@/features/history/ConversationItem'
import { groupConversations } from '@/lib/dates'

type Row = { kind: 'group'; group: string } | { kind: 'chat'; conversation: Conversation }

/** Longer lists render only the rows in view (§6: lists over 100 items are virtualised). */
const VIRTUAL_FROM = 100

const HEADING =
  'px-2.5 pt-5 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase'

// Chat history grouped as Pinned, Today, Yesterday, Previous 7 days, Previous 30 days, Older (FE-3.4).
export function ConversationList({
  matterId,
  filter,
  scrollElement,
}: {
  matterId: ID
  filter: string
  /** The sidebar's scrolling area, which a long list is virtualised against. */
  scrollElement: HTMLElement | null
}) {
  const api = useApi()
  const client = useQueryClient()
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const { data, isPending, isError, refetch } = useConversations(matterId)
  const update = useUpdateConversation(matterId)

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = (data ?? []).filter((c) => !q || c.title.toLowerCase().includes(q))
    return groupConversations(list)
  }, [data, filter])

  const rows = useMemo<Row[]>(
    () =>
      groups.flatMap(({ group, items }) => [
        { kind: 'group' as const, group },
        ...items.map((conversation) => ({ kind: 'chat' as const, conversation })),
      ]),
    [groups],
  )
  const virtual = rows.length - groups.length > VIRTUAL_FROM
  // The warning is about the React Compiler, which this build doesn't use; the virtualiser re-renders on scroll.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scrollElement,
    estimateSize: (i) => (rows[i]?.kind === 'group' ? 40 : 37),
    getItemKey: (i) => {
      const row = rows[i]!
      return row.kind === 'group' ? `group:${row.group}` : row.conversation.id
    },
    overscan: 12,
  })

  const remove = (conversation: Conversation) => {
    const key = queryKeys.conversations(matterId)
    const previous = client.getQueryData<Conversation[]>(key)
    client.setQueryData<Conversation[]>(key, (all) => all?.filter((c) => c.id !== conversation.id))
    if (conversationId === conversation.id) navigate(`/m/${matterId}`)

    let settled = false
    const commit = () => {
      if (settled) return
      settled = true
      void api
        .deleteConversation(conversation.id)
        .then(() => client.invalidateQueries({ queryKey: key }))
    }
    toast('Chat deleted', {
      description: conversation.title,
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          settled = true
          client.setQueryData(key, previous)
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    })
  }

  if (isPending) {
    return (
      <div
        className="space-y-1 px-2.5 pt-5"
        role="status"
        aria-busy="true"
        aria-label="Loading chats"
      >
        <Skeleton className="mb-3 h-3 w-16" />
        {[78, 62, 85, 54, 70, 66, 80].map((w, i) => (
          <Skeleton key={i} className="h-5" style={{ width: `${w}%` }} />
        ))}
      </div>
    )
  }

  if (isError && !data) {
    return (
      <div className="px-2.5 pt-6 text-[13px] text-fg-muted">
        Chats couldn’t load.{' '}
        <button
          type="button"
          onClick={() => refetch()}
          className="font-medium text-link hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!groups.length) {
    return (
      <div className="flex flex-col items-center px-4 pt-10 text-center">
        <MessageSquareDashed className="size-6 text-fg-subtle" aria-hidden />
        <p className="mt-2 text-[13px] text-fg-muted">
          {filter
            ? `No chats match “${filter}”.`
            : 'No chats yet. Ask your first question to start one.'}
        </p>
      </div>
    )
  }

  const item = (c: Conversation) => (
    <ConversationItem
      conversation={c}
      onRename={(title) => update.mutate({ id: c.id, patch: { title } })}
      onTogglePin={() => update.mutate({ id: c.id, patch: { pinned: !c.pinned } })}
      onDelete={() => remove(c)}
    />
  )

  if (virtual) {
    return (
      <div className="relative mb-2" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index]!
          return (
            <div
              key={v.key}
              data-index={v.index}
              ref={virtualizer.measureElement}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${v.start}px)` }}
            >
              {row.kind === 'group' ? (
                <h3 className={HEADING}>{row.group}</h3>
              ) : (
                <div className="pb-px">{item(row.conversation)}</div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="pb-2">
      {groups.map(({ group, items }) => (
        <section key={group} aria-label={group}>
          <h3 className={HEADING}>{group}</h3>
          <ul className="space-y-px">
            {items.map((c) => (
              <li key={c.id}>{item(c)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
