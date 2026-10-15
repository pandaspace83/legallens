import { ArrowUpRight } from 'lucide-react'
import type { Citation } from '@/api/types'
import { useViewer } from '@/features/viewer/useViewer'
import { citationLabel, pinpoint } from '@/lib/citations'

// The sources under an answer; each opens its passage (FE-4.6).
export function SourcesList({ citations }: { citations: Citation[] }) {
  const { open } = useViewer()
  return (
    <section aria-label="Sources" className="mt-5">
      <h4 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
        Sources
      </h4>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {citations.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              aria-label={citationLabel(c)}
              onClick={() => open(c.documentId, { page: c.page, anchor: c.para })}
              className="group flex w-full items-center gap-2.5 rounded-control border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-app"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-primary-tint text-[11px] font-semibold text-primary">
                {c.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-fg">
                  {c.documentName}
                </span>
                <span className="block text-[11.5px] text-fg-subtle">
                  p. {c.page} · {pinpoint(c.para)}
                </span>
              </span>
              <ArrowUpRight
                className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
