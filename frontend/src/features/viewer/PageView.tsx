import { Fragment, forwardRef, type ReactNode } from 'react'
import type { DocumentPage } from '@/api/types'
import { cn } from '@/lib/cn'

// One page of document text on a paper sheet: the cited passage highlighted, find matches marked (FE-5.6).
interface PageViewProps {
  page: DocumentPage
  totalPages: number
  highlight?: string
  zoom: number
  find: string
}

function withMatches(text: string, find: string): ReactNode {
  if (find.length < 2) return text
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.split(new RegExp(`(${escaped})`, 'gi')).map((part, i) =>
    i % 2 ? (
      <mark
        key={i}
        data-find
        className="rounded-[2px] bg-highlight/80 text-fg data-[current]:bg-warning data-[current]:text-white"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export const PageView = forwardRef<HTMLElement, PageViewProps>(function PageView(
  { page, totalPages, highlight, zoom, find },
  ref,
) {
  return (
    <article
      ref={ref}
      id={`page-${page.page}`}
      aria-label={`Page ${page.page} of ${totalPages}`}
      className="mx-auto w-full rounded-[3px] border border-line bg-surface shadow-raised"
      style={{ maxWidth: 520 * zoom, padding: `${40 * zoom}px ${44 * zoom}px ${48 * zoom}px` }}
    >
      <div className="font-serif leading-[1.75] text-fg" style={{ fontSize: 14.5 * zoom }}>
        {page.blocks.map((block, index) => {
          const active = block.anchor === highlight
          if (block.kind === 'meta') {
            return (
              <p
                key={`${index}-${block.anchor}`}
                className="mb-3 font-sans tracking-[0.04em] text-fg-subtle uppercase"
                style={{ fontSize: 11 * zoom }}
              >
                {withMatches(block.text, find)}
              </p>
            )
          }
          return (
            <p
              key={`${index}-${block.anchor}`}
              id={`passage-${block.anchor}`}
              data-active={active || undefined}
              className={cn(
                'mb-3 rounded-[3px]',
                block.kind === 'heading' && 'mt-1 font-semibold',
                active && '-mx-2 animate-flash bg-highlight px-2 py-1',
              )}
            >
              {withMatches(block.text, find)}
            </p>
          )
        })}
      </div>
      <p className="mt-8 text-center font-sans text-[11px] text-fg-subtle">
        {page.page} / {totalPages}
      </p>
    </article>
  )
})
