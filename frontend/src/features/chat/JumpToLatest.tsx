import { ArrowDown } from 'lucide-react'

// Floating 'Jump to latest' button when the lawyer scrolls up during a chat (FE-4.9).
export function JumpToLatest({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute -top-12 left-1/2 inline-flex h-8 -translate-x-1/2 animate-pop-in items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium text-fg-muted shadow-overlay transition-colors hover:text-fg"
    >
      <ArrowDown className="size-3.5" aria-hidden /> Jump to latest
    </button>
  )
}
