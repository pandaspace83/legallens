import { FileText, ShieldCheck } from 'lucide-react'
import { HoverCard } from 'radix-ui'
import type { Citation } from '@/api/types'
import { useViewer } from '@/features/viewer/useViewer'
import { citationLabel, pinpoint } from '@/lib/citations'

// Numbered citation [1]. Hover shows the passage; click opens it highlighted in the viewer (FE-4.6, DEC-36).
export function CitationChip({
  n,
  citation,
  pending,
}: {
  n: number
  citation?: Citation
  pending?: boolean
}) {
  const { open } = useViewer()

  if (!citation && !pending) {
    return (
      <span
        title="Source removed: the document was deleted"
        aria-label={`Source ${n} was removed`}
        className="mr-px ml-1 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-[5px] border border-dashed border-line-strong px-1 align-middle font-sans text-[11px] font-semibold text-fg-subtle line-through"
      >
        {n}
      </span>
    )
  }

  if (!citation) {
    // Still streaming: the citation is checked before it becomes clickable.
    return (
      <span className="mr-px ml-1 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-[5px] bg-hover px-1 align-middle font-sans text-[11px] font-semibold text-fg-subtle">
        {n}
      </span>
    )
  }

  const label = citationLabel({ ...citation, n })
  return (
    <HoverCard.Root openDelay={180} closeDelay={80}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={() => open(citation.documentId, { page: citation.page, anchor: citation.para })}
          className="mr-px ml-1 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-[5px] bg-primary-tint px-1 align-middle font-sans text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
        >
          {n}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-[380px] animate-pop-in rounded-card border border-line bg-surface shadow-overlay"
        >
          <div className="flex items-start gap-2.5 border-b border-line px-4 py-3">
            <FileText className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-fg">{citation.documentName}</p>
              <p className="text-xs text-fg-subtle">
                Page {citation.page} · {pinpoint(citation.para)}
              </p>
            </div>
            {citation.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-[11px] font-medium text-success">
                <ShieldCheck className="size-3" aria-hidden /> Verified
              </span>
            ) : null}
          </div>
          <blockquote className="m-4 border-l-[3px] border-highlight pl-3 font-serif text-[14px] leading-relaxed text-fg">
            {citation.quote}
          </blockquote>
          <p className="border-t border-line px-4 py-2 text-xs text-fg-subtle">
            Click to open the passage in the document
          </p>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}
