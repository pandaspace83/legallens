import { Search, X } from 'lucide-react'

// Filter chats by title as you type (FE-3.4).
export function ChatSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-subtle"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        // With text in it, Esc clears the search rather than closing the drawer around it.
        data-own-escape={value ? '' : undefined}
        placeholder="Search chats"
        aria-label="Search chats"
        className="h-8 w-full rounded-control border border-transparent bg-transparent pr-7 pl-8 text-[13px] text-fg transition-colors placeholder:text-fg-subtle hover:bg-hover focus:border-line focus:bg-surface focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
