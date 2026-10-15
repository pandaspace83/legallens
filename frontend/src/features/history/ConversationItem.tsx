import { MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router'
import type { Conversation } from '@/api/types'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/DropdownMenu'
import { cn } from '@/lib/cn'

// One chat row with hover actions: rename inline, pin, delete (FE-3.4).
interface ConversationItemProps {
  conversation: Conversation
  onRename(title: string): void
  onTogglePin(): void
  onDelete(): void
}

export function ConversationItem({
  conversation,
  onRename,
  onTogglePin,
  onDelete,
}: ConversationItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conversation.title)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const commit = () => {
    const title = draft.trim()
    setEditing(false)
    if (title && title !== conversation.title) onRename(title)
    else setDraft(conversation.title)
  }

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        aria-label="Chat title"
        data-own-escape
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(conversation.title)
            setEditing(false)
          }
        }}
        className="h-9 w-full rounded-control border border-control bg-surface px-2.5 text-[13.5px] text-fg outline-none"
      />
    )
  }

  return (
    <div className="group/item relative">
      <NavLink
        to={`/m/${conversation.matterId}/c/${conversation.id}`}
        className={({ isActive }) =>
          cn(
            'flex h-9 items-center rounded-control pr-9 pl-2.5 text-[13.5px] transition-colors',
            isActive
              ? 'bg-surface font-medium text-fg shadow-raised'
              : 'text-fg-muted hover:bg-hover hover:text-fg',
          )
        }
      >
        <span className="truncate">{conversation.title}</span>
      </NavLink>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${conversation.title}`}
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-line hover:text-fg focus-visible:opacity-100 data-[state=open]:bg-line data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-[200px]">
          <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
            Rename
          </MenuItem>
          <MenuItem icon={conversation.pinned ? <PinOff /> : <Pin />} onSelect={onTogglePin}>
            {conversation.pinned ? 'Unpin' : 'Pin to top'}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} tone="danger" onSelect={onDelete}>
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  )
}
