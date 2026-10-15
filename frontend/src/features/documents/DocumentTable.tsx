import {
  ArrowDown,
  ArrowUp,
  Eye,
  MoreHorizontal,
  PenLine,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import type { ID, LegalDocument } from '@/api/types'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { Badge } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Checkbox'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/DropdownMenu'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/dates'
import { formatBytes, plural } from '@/lib/format'
import { useEngineReady } from '@/features/shell/useSystemStatus'

// The library table: name, who it came from, pages, status and upload date (FE-5.1).
export type SortKey = 'name' | 'pages' | 'uploaded'
export interface Sort {
  key: SortKey
  dir: 'asc' | 'desc'
}

interface DocumentTableProps {
  documents: LegalDocument[]
  sort: Sort
  onSort(sort: Sort): void
  selected: Set<ID>
  onSelect(ids: Set<ID>): void
  activeId?: ID
  onOpen(document: LegalDocument): void
  onDelete(document: LegalDocument): void
  onSummarize(document: LegalDocument): void
  onDraft(document: LegalDocument): void
  /** The page's scrolling area, which a long table is virtualised against. */
  scrollElement: HTMLElement | null
}

/** Longer tables render only the rows in view (§6: lists over 100 items are virtualised). */
const VIRTUAL_FROM = 100

function rowsStart(body: HTMLElement | null, scroller: HTMLElement | null) {
  if (!body || !scroller) return 0
  return (
    body.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  )
}

function StatusCell({ document: d }: { document: LegalDocument }) {
  if (d.status === 'processing' || d.status === 'queued') {
    return (
      <div className="w-full max-w-[180px]">
        <Progress value={d.progress ?? 0} label={`Processing ${d.name}`} />
        <p className="mt-1 truncate text-[11.5px] text-fg-subtle">
          {d.stepDetail ?? 'Waiting to start'}
        </p>
      </div>
    )
  }
  if (d.status === 'quarantined')
    return (
      <Badge tone="danger" title={d.error}>
        <ShieldAlert aria-hidden /> Quarantined
      </Badge>
    )
  if (d.status === 'failed')
    return (
      <Badge tone="danger" title={d.error}>
        Couldn’t read
      </Badge>
    )

  const unreadable = d.coverage?.unreadablePages.length ?? 0
  const lowOcr = d.coverage?.lowConfidencePages.length ?? 0
  return (
    <div className="flex flex-wrap gap-1.5">
      {unreadable ? (
        <Badge tone="warning">{plural(unreadable, 'page')} unreadable</Badge>
      ) : lowOcr ? (
        <Badge tone="warning">Low OCR on {plural(lowOcr, 'page')}</Badge>
      ) : (
        <Badge tone="success">Ready</Badge>
      )}
      {d.hiddenContent ? <Badge tone="warning">Hidden content</Badge> : null}
    </div>
  )
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string
  k: SortKey
  sort: Sort
  onSort(s: Sort): void
  className?: string
}) {
  const active = sort.key === k
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort({ key: k, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
        className={cn(
          'inline-flex items-center gap-1 rounded tracking-[0.04em] uppercase hover:text-fg',
          active && 'text-fg',
        )}
      >
        {label}
        {active ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  )
}

export function DocumentTable({
  documents,
  sort,
  onSort,
  selected,
  onSelect,
  activeId,
  onOpen,
  onDelete,
  onSummarize,
  onDraft,
  scrollElement,
}: DocumentTableProps) {
  const engineReady = useEngineReady()
  const body = useRef<HTMLTableSectionElement>(null)
  const virtual = documents.length > VIRTUAL_FROM
  // The warning is about the React Compiler, which this build doesn't use; the virtualiser re-renders on scroll.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtual ? documents.length : 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => 64,
    overscan: 8,
    getItemKey: (i) => documents[i]!.id,
    // Where the rows start in the scrolling page; read on each render, which every scroll causes.
    scrollMargin: rowsStart(body.current, scrollElement),
  })
  const items = virtual ? virtualizer.getVirtualItems() : []
  const rows = virtual
    ? items.map((v) => ({ d: documents[v.index]!, index: v.index }))
    : documents.map((d, index) => ({ d, index }))
  const margin = virtualizer.options.scrollMargin
  const padTop = items.length ? items[0]!.start - margin : 0
  const padBottom = items.length ? virtualizer.getTotalSize() - (items.at(-1)!.end - margin) : 0
  const all = documents.length > 0 && documents.every((d) => selected.has(d.id))
  const some = documents.some((d) => selected.has(d.id))

  const toggle = (id: ID, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    onSelect(next)
  }

  return (
    <div className="@container overflow-hidden rounded-card border border-line bg-surface shadow-raised">
      <table
        className="w-full table-fixed text-left text-[13.5px]"
        aria-rowcount={virtual ? documents.length + 1 : undefined}
      >
        <colgroup>
          <col className="w-12" />
          <col />
          <col className="hidden w-[116px] @[600px]:table-column" />
          <col className="hidden w-[72px] @[700px]:table-column" />
          <col className="hidden w-[132px] @[440px]:table-column @[520px]:w-[210px] @[700px]:w-[230px]" />
          <col className="hidden w-[128px] @[820px]:table-column" />
          <col className="w-14" />
        </colgroup>
        <thead className="border-b border-line bg-app text-[11.5px] font-semibold tracking-[0.04em] text-fg-subtle uppercase">
          <tr className="[&>th]:px-3 [&>th]:py-2.5" aria-rowindex={virtual ? 1 : undefined}>
            <th scope="col" className="!pl-4">
              <Checkbox
                label="Select all documents"
                checked={all ? true : some ? 'indeterminate' : false}
                onCheckedChange={(on) =>
                  onSelect(on ? new Set(documents.map((d) => d.id)) : new Set())
                }
              />
            </th>
            <SortHeader label="Name" k="name" sort={sort} onSort={onSort} />
            <th scope="col" className="hidden @[600px]:table-cell">
              From
            </th>
            <SortHeader
              label="Pages"
              k="pages"
              sort={sort}
              onSort={onSort}
              className="hidden text-right @[700px]:table-cell"
            />
            <th scope="col" className="hidden @[440px]:table-cell">
              Status
            </th>
            <SortHeader
              label="Uploaded"
              k="uploaded"
              sort={sort}
              onSort={onSort}
              className="hidden @[820px]:table-cell"
            />
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody ref={body} className="divide-y divide-line">
          {padTop ? <tr aria-hidden style={{ height: padTop }} /> : null}
          {rows.map(({ d, index }) => (
            <tr
              key={d.id}
              data-index={index}
              ref={virtual ? virtualizer.measureElement : undefined}
              aria-rowindex={virtual ? index + 2 : undefined}
              onClick={() => onOpen(d)}
              className={cn(
                'cursor-pointer transition-colors [&>td]:px-3 [&>td]:py-3',
                d.id === activeId
                  ? 'bg-primary-tint/60'
                  : selected.has(d.id)
                    ? 'bg-hover/60'
                    : 'hover:bg-app',
              )}
            >
              <td className="!pl-4">
                <Checkbox
                  label={`Select ${d.name}`}
                  checked={selected.has(d.id)}
                  onCheckedChange={(on) => toggle(d.id, on)}
                />
              </td>
              <td className="max-w-0">
                <div className="flex items-center gap-2.5">
                  <DocumentIcon
                    kind={d.kind}
                    className={cn(
                      'size-[18px] shrink-0',
                      d.origin === 'other_party' ? 'text-warning' : 'text-fg-subtle',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{d.name}</p>
                    {d.sizeBytes ? (
                      <p className="text-[12px] text-fg-subtle">{formatBytes(d.sizeBytes)}</p>
                    ) : null}
                    {/* In a narrow table (a phone) the status sits under the name, not in its own column. */}
                    <div className="mt-1.5 @[440px]:hidden">
                      <StatusCell document={d} />
                    </div>
                  </div>
                </div>
              </td>
              <td className="hidden whitespace-nowrap @[600px]:table-cell">
                <Badge size="sm" tone={d.origin === 'client' ? 'neutral' : 'warning'}>
                  {d.origin === 'client' ? 'Our client' : 'Other side'}
                </Badge>
              </td>
              <td className="hidden text-right text-fg-muted tabular-nums @[700px]:table-cell">
                {d.pages}
              </td>
              <td className="hidden @[440px]:table-cell">
                <StatusCell document={d} />
              </td>
              <td className="hidden whitespace-nowrap text-fg-muted @[820px]:table-cell">
                {formatRelative(d.uploadedAt)}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <Menu>
                  <MenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Options for ${d.name}`}
                      className="flex size-8 items-center justify-center rounded-control text-fg-subtle hover:bg-hover hover:text-fg data-[state=open]:bg-hover"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </MenuTrigger>
                  <MenuContent align="end" className="w-[200px]">
                    <MenuItem icon={<Eye />} onSelect={() => onOpen(d)}>
                      Open
                    </MenuItem>
                    <MenuItem
                      icon={<Sparkles />}
                      disabled={d.status !== 'ready' || !engineReady}
                      onSelect={() => onSummarize(d)}
                    >
                      Summarize…
                    </MenuItem>
                    {d.origin === 'other_party' ? (
                      <MenuItem
                        icon={<PenLine />}
                        disabled={d.status !== 'ready' || !engineReady}
                        onSelect={() => onDraft(d)}
                      >
                        Draft a reply…
                      </MenuItem>
                    ) : null}
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => onDelete(d)}>
                      Delete…
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </td>
            </tr>
          ))}
          {padBottom ? <tr aria-hidden style={{ height: padBottom }} /> : null}
        </tbody>
      </table>
    </div>
  )
}
