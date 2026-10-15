import { ArrowLeft, FileSearch, FileX2, Gauge, PenLine, Quote, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useMessages } from '@/api/queries/conversations'
import { useDocumentPages, useDocuments } from '@/api/queries/documents'
import type { ID, LegalDocument } from '@/api/types'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadError } from '@/components/common/LoadError'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Skeleton } from '@/components/ui/Skeleton'
import { CoverageReport } from '@/features/documents/CoverageReport'
import { HiddenContentNotice } from '@/features/documents/HiddenContentNotice'
import { StartDraftDialog } from '@/features/drafts/StartDraftDialog'
import { SummarizeDialog } from '@/features/summaries/SummaryOptions'
import { IngestionProgress } from '@/features/documents/IngestionProgress'
import { CitationNavigator } from '@/features/viewer/CitationNavigator'
import { PageView } from '@/features/viewer/PageView'
import { useViewer } from '@/features/viewer/useViewer'
import { ViewerToolbar } from '@/features/viewer/ViewerToolbar'
import { pinpoint } from '@/lib/citations'
import { percent, plural } from '@/lib/format'
import { useEngineReady } from '@/features/shell/useSystemStatus'

// The document viewer: who it came from and what was read, the pages, the cited passage in view,
// page jump, zoom and find (FE-5.6).
export function DocumentViewer({ matterId }: { matterId: ID }) {
  const { docId, page, anchor, close, open, summaryId, draftId } = useViewer()
  const { conversationId } = useParams()
  const { data: messages } = useMessages(matterId, conversationId)
  const [summarizing, setSummarizing] = useState<LegalDocument | null>(null)
  const [drafting, setDrafting] = useState<LegalDocument | null>(null)
  const engineReady = useEngineReady()
  const { data: documents } = useDocuments(matterId)
  const { data: pages, isPending, isError, refetch, isFetching } = useDocumentPages(matterId, docId)
  const pane = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [finding, setFinding] = useState(false)
  const [find, setFind] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const document = documents?.find((d) => d.id === docId)
  const query = finding && find.length >= 2 ? find : ''

  // This document's citations in the open chat, in the order the chat cites them.
  const citePoints = useMemo(() => {
    const seen = new Set<string>()
    const out: { page: number; anchor: string }[] = []
    for (const m of messages ?? [])
      for (const c of m.citations ?? []) {
        const key = `${c.page}|${c.para}`
        if (c.documentId !== docId || seen.has(key)) continue
        seen.add(key)
        out.push({ page: c.page, anchor: c.para })
      }
    return out
  }, [messages, docId])
  const citeIndex = citePoints.findIndex((p) => p.page === page && p.anchor === anchor)

  // Find matches are counted from the text, so the count is right before anything renders.
  const matches = useMemo(() => {
    if (!query || !pages) return 0
    const needle = query.toLowerCase()
    return pages.reduce(
      (n, p) => n + p.blocks.reduce((m, b) => m + b.text.toLowerCase().split(needle).length - 1, 0),
      0,
    )
  }, [pages, query])

  // Scroll this pane only; scrollIntoView would also move the page behind it.
  const scrollTo = useCallback(
    (el: Element | null | undefined, align: 'center' | 'top' = 'center') => {
      const box = pane.current
      if (!box || !el) return
      const r = el.getBoundingClientRect()
      const offset = r.top - box.getBoundingClientRect().top + box.scrollTop
      const top = align === 'center' ? offset - box.clientHeight / 2 + r.height / 2 : offset - 16
      box.scrollTo({ top, behavior: 'smooth' })
    },
    [],
  )

  useEffect(() => {
    if (pages && anchor)
      scrollTo(pane.current?.querySelector(`[id="passage-${CSS.escape(anchor)}"]`))
  }, [pages, anchor, page, scrollTo])

  // Mark the current match and bring it into view, only when the search or the chosen match changes.
  useEffect(() => {
    const marks = [...(pane.current?.querySelectorAll('mark[data-find]') ?? [])]
    marks.forEach((m, i) =>
      i === matchIndex ? m.setAttribute('data-current', '') : m.removeAttribute('data-current'),
    )
    if (marks[matchIndex]) scrollTo(marks[matchIndex])
  }, [query, matchIndex, zoom, pages, scrollTo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !finding) close()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && pages?.length) {
        e.preventDefault()
        setFinding(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, finding, pages])

  if (documents && !document) {
    return (
      <Shell onClose={close}>
        <EmptyState
          icon={FileX2}
          title="This document was deleted"
          description="It was removed from the matter, with its text, search passages and citations."
        />
      </Shell>
    )
  }

  const processing = document && (document.status === 'processing' || document.status === 'queued')
  const failed = document && (document.status === 'failed' || document.status === 'quarantined')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-3 border-b border-line bg-surface px-4 py-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-hover text-fg-muted">
          <DocumentIcon kind={document?.kind ?? 'pdf'} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          {document ? (
            <>
              <h2 className="truncate text-sm font-semibold text-fg">{document.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                <Badge size="sm" tone={document.origin === 'client' ? 'neutral' : 'warning'}>
                  {document.origin === 'client' ? 'From our client' : 'From the other side'}
                </Badge>
                <span>{plural(document.pages, 'page')}</span>
                {document.ocrConfidence !== undefined ? (
                  <span>· OCR {percent(document.ocrConfidence)}</span>
                ) : null}
                {document.coverage ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="ml-1 inline-flex items-center gap-1 font-medium text-link hover:underline"
                      >
                        <Gauge className="size-3.5" aria-hidden /> Coverage
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[340px]">
                      <p className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                        Coverage report
                      </p>
                      <CoverageReport
                        document={document}
                        onGoToPage={(p) =>
                          scrollTo(pane.current?.querySelector(`#page-${p}`), 'top')
                        }
                      />
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
            </>
          ) : (
            <Skeleton className="h-4 w-48" />
          )}
        </div>
        {document?.status === 'ready' ? (
          <IconButton
            label="Summarize this document"
            disabled={!engineReady}
            onClick={() => setSummarizing(document)}
          >
            <Sparkles />
          </IconButton>
        ) : null}
        {document?.status === 'ready' && document.origin === 'other_party' ? (
          <IconButton
            label="Draft a reply"
            disabled={!engineReady}
            onClick={() => setDrafting(document)}
          >
            <PenLine />
          </IconButton>
        ) : null}
        <IconButton
          label={draftId ? 'Back to the draft' : summaryId ? 'Back to the summary' : 'Close viewer'}
          shortcut="esc"
          onClick={close}
        >
          {summaryId || draftId ? <ArrowLeft /> : <X />}
        </IconButton>
      </header>
      <SummarizeDialog document={summarizing} onOpenChange={(o) => !o && setSummarizing(null)} />
      <StartDraftDialog document={drafting} onOpenChange={(o) => !o && setDrafting(null)} />

      {anchor && page ? (
        <div className="flex items-center gap-2 border-b border-line bg-highlight/40 px-4 py-2 text-[12.5px] text-fg-muted">
          <Quote className="size-3.5 text-warning" aria-hidden />
          Cited passage · page {page} · {pinpoint(anchor)}
          <CitationNavigator
            points={citePoints}
            index={citeIndex}
            onGo={(p) => docId && open(docId, p)}
          />
        </div>
      ) : null}

      {document?.hiddenContent ? (
        <HiddenContentNotice key={document.id} document={document} />
      ) : null}

      {pages?.length ? (
        <ViewerToolbar
          pages={pages.map((p) => p.page)}
          totalPages={document?.pages ?? pages.length}
          onGoToPage={(p) => scrollTo(pane.current?.querySelector(`#page-${p}`), 'top')}
          zoom={zoom}
          onZoom={setZoom}
          finding={finding}
          onFinding={(open) => {
            setFinding(open)
            if (!open) setFind('')
          }}
          find={find}
          onFind={(q) => {
            setFind(q)
            setMatchIndex(0)
          }}
          matchCount={matches}
          matchIndex={matchIndex}
          onMatch={setMatchIndex}
        />
      ) : null}

      {/* Focusable, so the pages can be scrolled from the keyboard (WCAG 2.1.1). */}
      <div
        ref={pane}
        role="region"
        aria-label="Document pages"
        tabIndex={0}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset"
      >
        {processing || failed ? (
          <div className="mx-auto max-w-[460px] rounded-card border border-line bg-surface px-4 py-1 shadow-raised">
            <IngestionProgress document={document} />
          </div>
        ) : isPending ? (
          <div className="mx-auto max-w-[520px] space-y-3 rounded-[3px] border border-line bg-surface px-11 py-10">
            <Skeleton className="h-4 w-1/3" />
            {[100, 96, 88, 100, 72, 94, 85].map((w, i) => (
              <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : isError && !pages ? (
          <LoadError what="This document’s pages" onRetry={() => refetch()} retrying={isFetching} />
        ) : pages?.length ? (
          pages.map((p) => (
            <PageView
              key={p.page}
              page={p}
              totalPages={document?.pages ?? p.page}
              highlight={p.page === page ? anchor : undefined}
              zoom={zoom}
              find={query}
            />
          ))
        ) : (
          <EmptyState
            icon={FileSearch}
            title="Preview not available in this demo"
            description="The demo has page text for the MSA, the demand letter and Acme’s response. Ask a question to see a cited passage."
          />
        )}
      </div>
    </div>
  )
}

function Shell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end border-b border-line bg-surface px-4 py-3">
        <IconButton label="Close viewer" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  )
}
