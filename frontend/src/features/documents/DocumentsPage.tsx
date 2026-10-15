import { FileSearch, Search, Trash2, UploadCloud } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useDeleteDocument, useDocuments } from '@/api/queries/documents'
import { useMatter } from '@/api/queries/matters'
import type { DocumentOrigin, ID, LegalDocument } from '@/api/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadError } from '@/components/common/LoadError'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { DeleteDocumentDialog } from '@/features/documents/DeleteDocumentDialog'
import { DocumentTable, type Sort } from '@/features/documents/DocumentTable'
import { StartDraftDialog } from '@/features/drafts/StartDraftDialog'
import { SummarizeDialog } from '@/features/summaries/SummaryOptions'
import { useViewer } from '@/features/viewer/useViewer'
import { cn } from '@/lib/cn'
import { plural } from '@/lib/format'
import { useUploadDialog } from '@/stores/ui'

// The matter's document library: search, filter, sort, select, upload by drag and drop (FE-5.1).
type OriginFilter = 'all' | DocumentOrigin

export function DocumentsPage() {
  const { matterId = '' } = useParams()
  const { data: documents, isPending, isError, refetch, isFetching } = useDocuments(matterId)
  const { data: matter } = useMatter(matterId)
  const showUpload = useUploadDialog((s) => s.show)
  const { docId, open } = useViewer()
  // In state, not a ref, so a long table's virtualiser has it on its first render (see Sidebar).
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const remove = useDeleteDocument(matterId)

  const [query, setQuery] = useState('')
  const [origin, setOrigin] = useState<OriginFilter>('all')
  const [sort, setSort] = useState<Sort>({ key: 'uploaded', dir: 'desc' })
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [toDelete, setToDelete] = useState<LegalDocument | null>(null)
  const [toSummarize, setToSummarize] = useState<LegalDocument | null>(null)
  const [toDraft, setToDraft] = useState<LegalDocument | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const closed = matter?.status === 'closed'

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (documents ?? []).filter(
      (d) => (origin === 'all' || d.origin === origin) && (!q || d.name.toLowerCase().includes(q)),
    )
    const dir = sort.dir === 'asc' ? 1 : -1
    return list.sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * dir
      if (sort.key === 'pages') return (a.pages - b.pages) * dir
      return a.uploadedAt.localeCompare(b.uploadedAt) * dir
    })
  }, [documents, query, origin, sort])

  const processing =
    documents?.filter((d) => d.status === 'processing' || d.status === 'queued').length ?? 0
  const chosen = visible.filter((d) => selected.has(d.id))

  const deleteSelected = async () => {
    for (const d of chosen) await remove.mutateAsync(d.id)
    toast(`${plural(chosen.length, 'document')} deleted`, {
      description: 'Everything made from them was removed.',
    })
    setSelected(new Set())
    setBulkOpen(false)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!closed && e.dataTransfer.files.length) showUpload([...e.dataTransfer.files])
  }

  return (
    <div
      ref={setScroller}
      className="relative h-full overflow-y-auto"
      onDragOver={(e) => {
        if (closed || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <div className="mx-auto max-w-[1120px] px-8 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[30px] leading-tight tracking-[-0.015em] text-fg">
              Documents
            </h1>
            <p className="mt-1 text-[14px] text-fg-muted">
              {documents ? plural(documents.length, 'document') : '…'}
              {processing ? ` · ${processing} processing` : ''} · searched only within{' '}
              {matter?.name ?? 'this matter'}
            </p>
          </div>
          {!closed ? (
            <Button variant="primary" onClick={() => showUpload()}>
              <UploadCloud /> Upload documents
            </Button>
          ) : null}
        </header>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              aria-label="Search documents by name"
              className="h-9 w-[280px] rounded-control border border-control bg-surface pr-3 pl-9 text-[13.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-primary"
            />
          </div>
          <Segmented<OriginFilter>
            label="Show documents from"
            value={origin}
            onChange={setOrigin}
            options={[
              { value: 'all', label: 'All' },
              { value: 'client', label: 'Our client' },
              { value: 'other_party', label: 'Other side' },
            ]}
          />
          {chosen.length ? (
            <div className="ml-auto flex animate-fade-in items-center gap-2 text-[13px] text-fg-muted">
              {plural(chosen.length, 'document')} selected
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              {!closed ? (
                <Button size="sm" variant="danger" onClick={() => setBulkOpen(true)}>
                  <Trash2 /> Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          {isPending ? (
            <div className="space-y-2 rounded-card border border-line bg-surface p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : isError && !documents ? (
            <LoadError
              what="This matter’s documents"
              onRetry={() => refetch()}
              retrying={isFetching}
              className="rounded-card border border-line bg-surface"
            />
          ) : !documents?.length ? (
            <div className="rounded-card border border-dashed border-line-strong bg-surface">
              <EmptyState
                icon={UploadCloud}
                title="No documents yet"
                description="Upload the documents for this matter, or drop them anywhere on this page. They stay on this computer."
                action={
                  !closed ? (
                    <Button variant="primary" onClick={() => showUpload()}>
                      Upload documents
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : !visible.length ? (
            <EmptyState
              icon={FileSearch}
              title="No documents match"
              description="Try a different name, or show documents from both sides."
            />
          ) : (
            <DocumentTable
              documents={visible}
              sort={sort}
              onSort={setSort}
              selected={selected}
              onSelect={setSelected}
              activeId={docId}
              onOpen={(d) => open(d.id)}
              onDelete={setToDelete}
              onSummarize={setToSummarize}
              onDraft={setToDraft}
              scrollElement={scroller}
            />
          )}
        </div>
      </div>

      {dragging ? (
        <div className="pointer-events-none absolute inset-3 z-10 flex animate-fade-in items-center justify-center rounded-[16px] border-2 border-dashed border-primary bg-primary-tint/80">
          <p className={cn('flex items-center gap-2 text-[15px] font-medium text-primary')}>
            <UploadCloud className="size-5" aria-hidden /> Drop to upload to {matter?.name}
          </p>
        </div>
      ) : null}

      <SummarizeDialog document={toSummarize} onOpenChange={(o) => !o && setToSummarize(null)} />
      <StartDraftDialog document={toDraft} onOpenChange={(o) => !o && setToDraft(null)} />
      <DeleteDocumentDialog
        matterId={matterId}
        document={toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      />
      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Delete ${plural(chosen.length, 'document')}?`}
        description="Each file, its extracted text, its search passages and every citation to it will be removed."
        confirmLabel="Delete documents"
        tone="danger"
        typed="delete"
        loading={remove.isPending}
        onConfirm={deleteSelected}
      >
        <ul className="max-h-40 space-y-1 overflow-y-auto text-[13px] text-fg">
          {chosen.map((d) => (
            <li key={d.id} className="truncate">
              {d.name}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  )
}
