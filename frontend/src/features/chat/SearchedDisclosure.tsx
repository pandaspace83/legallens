import { ChevronRight } from 'lucide-react'
import { Collapsible } from 'radix-ui'
import type { SearchedInfo } from '@/api/types'

// 'What was searched': scope, the question as understood, documents and passages (FE-4.7, DEC-22).
// The toggle sits in the answer's action row; the details open below it. Wrap both in <SearchedRoot>.
export const SearchedRoot = Collapsible.Root

export function SearchedToggle() {
  return (
    <Collapsible.Trigger className="group inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-fg-subtle transition-colors hover:bg-hover hover:text-fg-muted">
      <ChevronRight
        className="size-3.5 transition-transform group-data-[state=open]:rotate-90"
        aria-hidden
      />
      What was searched
    </Collapsible.Trigger>
  )
}

export function SearchedDetails({ searched }: { searched: SearchedInfo }) {
  return (
    <Collapsible.Content className="animate-fade-in">
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-card border border-line bg-surface px-4 py-3 text-[12.5px]">
        <dt className="text-fg-subtle">Searched</dt>
        <dd className="text-fg">{searched.scopeLabel}</dd>
        <dt className="text-fg-subtle">Question as understood</dt>
        <dd className="font-serif text-[13.5px] text-fg italic">“{searched.rewrittenQuestion}”</dd>
        <dt className="text-fg-subtle">Documents searched</dt>
        <dd className="text-fg">{searched.documentsSearched}</dd>
        <dt className="text-fg-subtle">Passages reviewed</dt>
        <dd className="text-fg">{searched.passagesReviewed}, best 8 used</dd>
      </dl>
    </Collapsible.Content>
  )
}
