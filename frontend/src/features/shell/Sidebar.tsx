import { SquarePen } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { cn } from '@/lib/cn'
import { Kbd } from '@/components/ui/Kbd'
import { SidebarDocuments } from '@/features/documents/SidebarDocuments'
import { ChatSearch } from '@/features/history/ChatSearch'
import { ConversationList } from '@/features/history/ConversationList'
import { modKey } from '@/hooks/useHotkeys'

// New chat, chat search, history grouped by date, and the matter's documents (FE-3.4). Beside the conversation
// from 1024 px, in a drawer below that (FE-9.3).
export function Sidebar({ className }: { className?: string }) {
  const { matterId = '' } = useParams()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  // Kept in state, not a ref: the chat list's virtualiser needs the element on its first render, and a parent's
  // ref is attached only after its children's effects have run.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const newChat = () => navigate(`/m/${matterId}`)

  return (
    <nav
      aria-label="Chats and documents"
      className={cn('flex min-h-0 flex-col border-r border-line bg-sidebar', className)}
    >
      <div className="space-y-1.5 px-2 pt-3">
        <button
          type="button"
          onClick={newChat}
          className="group flex h-9 w-full items-center gap-2.5 rounded-control border border-line bg-surface px-2.5 text-sm font-medium text-fg shadow-raised transition-colors hover:border-line-strong"
        >
          <SquarePen className="size-4 text-fg-muted" aria-hidden />
          New chat
          <span className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Kbd>{modKey}⇧O</Kbd>
          </span>
        </button>
        <ChatSearch value={filter} onChange={setFilter} />
      </div>

      <div
        ref={setScroller}
        className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto px-2"
      >
        <ConversationList matterId={matterId} filter={filter} scrollElement={scroller} />
      </div>

      <SidebarDocuments matterId={matterId} />
    </nav>
  )
}
