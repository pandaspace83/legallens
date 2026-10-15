import { Check, FileText, Library } from 'lucide-react'
import { useDocuments } from '@/api/queries/documents'
import type { ID } from '@/api/types'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { cn } from '@/lib/cn'
import { useComposer, useMatterScope } from '@/stores/composer'

// What the question searches: all documents in the matter, or one document (FE-4.3, DEC-35).
export function ScopeSelector({ matterId }: { matterId: ID }) {
  const scope = useMatterScope(matterId)
  const setScope = useComposer((s) => s.setScope)
  const { data: documents = [] } = useDocuments(matterId)
  const ready = documents.filter((d) => d.status === 'ready')
  const selected =
    scope.kind === 'document' ? documents.find((d) => d.id === scope.documentId) : undefined

  const option = (active: boolean) =>
    cn(
      'flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-hover',
      active ? 'text-fg' : 'text-fg-muted',
    )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 max-w-[260px] min-w-0 items-center gap-1.5 rounded-full border border-line px-3 text-[12.5px] font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg data-[state=open]:bg-hover"
        >
          {selected ? (
            <FileText className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <Library className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">
            {selected ? selected.name.replace(/\.\w+$/, '') : `All documents · ${ready.length}`}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-1.5" align="start" side="top">
        <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-fg-subtle">Search in</p>
        <PopoverClose asChild>
          <button
            type="button"
            className={option(scope.kind === 'all')}
            onClick={() => setScope(matterId, { kind: 'all' })}
          >
            <Library className="size-4 text-fg-subtle" aria-hidden />
            <span className="flex-1">
              All documents in this matter
              <span className="block text-xs text-fg-subtle">{ready.length} ready to search</span>
            </span>
            {scope.kind === 'all' ? (
              <Check className="size-4 text-primary" aria-label="Selected" />
            ) : null}
          </button>
        </PopoverClose>
        <div className="mx-1 my-1.5 h-px bg-line" />
        <p className="px-2.5 pt-1 pb-1 text-xs font-medium text-fg-subtle">One document</p>
        <div className="max-h-64 overflow-y-auto">
          {ready.map((d) => {
            const active = scope.kind === 'document' && scope.documentId === d.id
            return (
              <PopoverClose asChild key={d.id}>
                <button
                  type="button"
                  className={option(active)}
                  onClick={() => setScope(matterId, { kind: 'document', documentId: d.id })}
                >
                  <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  {active ? <Check className="size-4 text-primary" aria-label="Selected" /> : null}
                </button>
              </PopoverClose>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
