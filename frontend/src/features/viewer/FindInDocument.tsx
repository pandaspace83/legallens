import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'

// Search inside the open document, with next and previous match (FE-5.6).
interface FindProps {
  find: string
  onFind(query: string): void
  matchCount: number
  matchIndex: number
  onMatch(index: number): void
  onClose(): void
}

export function FindInDocument({
  find,
  onFind,
  matchCount,
  matchIndex,
  onMatch,
  onClose,
}: FindProps) {
  const step = (by: number) => matchCount && onMatch((matchIndex + by + matchCount) % matchCount)

  return (
    <div className="flex flex-1 animate-fade-in items-center gap-1">
      <Search className="ml-1 size-4 shrink-0 text-fg-subtle" aria-hidden />
      <input
        autoFocus
        value={find}
        onChange={(e) => onFind(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
        placeholder="Find in document"
        aria-label="Find in document"
        data-own-escape
        className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle"
      />
      <span className="shrink-0 text-[12px] text-fg-subtle tabular-nums" aria-live="polite">
        {find.length >= 2 ? (matchCount ? `${matchIndex + 1} of ${matchCount}` : 'No matches') : ''}
      </span>
      <IconButton label="Previous match" size="sm" disabled={!matchCount} onClick={() => step(-1)}>
        <ChevronUp />
      </IconButton>
      <IconButton label="Next match" size="sm" disabled={!matchCount} onClick={() => step(1)}>
        <ChevronDown />
      </IconButton>
      <IconButton label="Close find" size="sm" onClick={onClose}>
        <X />
      </IconButton>
    </div>
  )
}
