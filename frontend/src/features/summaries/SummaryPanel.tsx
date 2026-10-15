import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileDown,
  FileText,
  Loader2,
  SearchX,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useCreateSummary,
  useExportSummary,
  useSummaries,
  useSummary,
} from '@/api/queries/summaries'
import { LoadError } from '@/components/common/LoadError'
import type { ID, Summary, SummaryAudience } from '@/api/types'
import { EmptyState } from '@/components/common/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Progress } from '@/components/ui/Progress'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { AnswerBody } from '@/features/chat/AnswerBody'
import { useViewer } from '@/features/viewer/useViewer'
import { answerToPlainText } from '@/lib/citations'
import { formatRelative } from '@/lib/dates'
import { saveFile } from '@/lib/download'
import { errorText } from '@/lib/errors'
import { plural } from '@/lib/format'
import { AUDIENCE_SHORT, TEMPLATE_LABELS } from '@/lib/summaries'
import { useEngineReady } from '@/features/shell/useSystemStatus'

// A summary in the side panel: coverage banner, one section per template field with citations, missing
// items as "Not found in this document", audience switch, copy and Word export (FE-6.2, FE-6.3, DEC-42).
const AUDIENCES = (Object.keys(AUDIENCE_SHORT) as SummaryAudience[]).map((value) => ({
  value,
  label: AUDIENCE_SHORT[value],
}))

function CoverageBanner({ summary }: { summary: Summary }) {
  const coverage = summary.coverage
  if (!coverage) return null
  const total = coverage.pagesRead + coverage.unreadablePages.length
  const complete = !coverage.unreadablePages.length
  return (
    <div
      className={
        complete
          ? 'flex items-start gap-2.5 border-b border-line bg-success-tint/60 px-5 py-2.5 text-[12.5px] text-success'
          : 'flex items-start gap-2.5 border-b border-line bg-warning-tint px-5 py-2.5 text-[12.5px] text-warning'
      }
    >
      {complete ? (
        <CheckCircle2 className="mt-px size-4 shrink-0" aria-hidden />
      ) : (
        <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
      )}
      <span>
        {complete
          ? `Covers all ${plural(total, 'page')}`
          : `Covers ${coverage.pagesRead} of ${total} pages · page ${coverage.unreadablePages.join(', ')} couldn’t be read`}
        {coverage.lowConfidencePages.length
          ? ` · scanned with low confidence on page ${coverage.lowConfidencePages.map((p) => p.page).join(', ')}`
          : ''}
      </span>
    </div>
  )
}

export function SummaryPanel({ matterId }: { matterId: ID }) {
  const { summaryId, closeSummary, openSummary } = useViewer()
  const { data: summary, isError, refetch, isFetching } = useSummary(matterId, summaryId)
  const exporter = useExportSummary()
  const { data: summaries, isSuccess: listed } = useSummaries(matterId)
  const regenerate = useCreateSummary(matterId)
  const engineReady = useEngineReady()
  const [copied, setCopied] = useState(false)

  // Gone only when the matter's summaries loaded without it; any other failure is a failed load.
  const gone = listed && !summaries.some((s) => s.id === summaryId)
  if (isError && !summary && !gone) {
    return (
      <LoadError
        what="This summary"
        onRetry={() => refetch()}
        retrying={isFetching}
        className="flex h-full items-center justify-center"
      />
    )
  }

  if (isError && !summary) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={SearchX}
          title="This summary isn’t available"
          description="It may have been removed with its document."
        />
      </div>
    )
  }

  const ready = summary?.status === 'ready'
  const copy = async () => {
    if (!summary) return
    const text = summary.sections
      .map(
        (s) =>
          `${s.title}\n${s.body ? s.body.replace(/\*\*/g, '') : 'Not found in this document.'}`,
      )
      .join('\n\n')
    await navigator.clipboard.writeText(answerToPlainText(text, summary.citations))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line bg-surface px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <FileText className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
              Summary
            </p>
            {summary ? (
              <>
                <h2 className="truncate text-[14.5px] font-semibold text-fg">
                  {summary.documentName}
                </h2>
                <p className="text-[12.5px] text-fg-subtle">
                  {TEMPLATE_LABELS[summary.template]} · {formatRelative(summary.createdAt)}
                </p>
              </>
            ) : (
              <Skeleton className="mt-1 h-4 w-48" />
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <IconButton
              label={copied ? 'Copied' : 'Copy with sources'}
              disabled={!ready}
              onClick={copy}
            >
              {copied ? <CheckCircle2 className="text-success" /> : <Copy />}
            </IconButton>
            <IconButton
              label="Export to Word"
              disabled={!ready}
              onClick={() => {
                if (!summary) return
                exporter.mutate(summary.id, {
                  onSuccess: (file) => {
                    saveFile(file)
                    toast('Summary exported', {
                      description: 'A privileged working copy, with its sources.',
                    })
                  },
                  onError: (e) => toast.error(errorText(e)),
                })
              }}
            >
              <FileDown />
            </IconButton>
            <IconButton label="Close summary" onClick={closeSummary}>
              <X />
            </IconButton>
          </div>
        </div>
        {summary ? (
          <div className="mt-3 flex items-center gap-2.5">
            <span className="text-[12.5px] text-fg-muted">Audience</span>
            <Segmented
              size="sm"
              label="Rewrite this summary for"
              disabled={!engineReady}
              value={summary.audience}
              options={AUDIENCES}
              onChange={(audience) =>
                audience !== summary.audience &&
                regenerate.mutate(
                  { documentId: summary.documentId, template: summary.template, audience },
                  { onSuccess: ({ summary: next }) => openSummary(next.id) },
                )
              }
            />
            {regenerate.isPending ? (
              <Loader2 className="size-3.5 animate-spin text-fg-subtle" aria-label="Starting" />
            ) : null}
          </div>
        ) : null}
      </header>

      {summary && ready ? <CoverageBanner summary={summary} /> : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!summary ? (
          <div className="space-y-4 px-6 py-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>
        ) : !ready ? (
          <div
            className="mx-6 my-8 rounded-card border border-line bg-surface p-5 shadow-raised"
            aria-live="polite"
          >
            <p className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Writing the
              summary
            </p>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              {summary.stepDetail ?? 'Waiting to start'}
            </p>
            <Progress value={summary.progress ?? 0} label="Summary progress" className="mt-3" />
            <p className="mt-3 text-[12.5px] text-fg-subtle">
              Every page is read in order, so nothing is skipped.
            </p>
          </div>
        ) : (
          <article className="px-6 py-5">
            {summary.mismatch ? (
              <p className="mb-5 flex gap-2.5 rounded-card border border-warning/20 bg-warning-tint px-4 py-3 text-[13px] text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {summary.mismatch}
              </p>
            ) : null}
            <div className="space-y-5">
              {summary.sections.map((section) => (
                <section key={section.key} aria-label={section.title}>
                  <h3 className="mb-1.5 text-[12px] font-semibold tracking-[0.05em] text-fg-muted uppercase">
                    {section.title}
                  </h3>
                  {section.body ? (
                    <AnswerBody text={section.body} citations={summary.citations} size="compact" />
                  ) : (
                    <p className="flex items-center gap-2 text-[13.5px] text-fg-subtle italic">
                      <SearchX className="size-3.5 not-italic" aria-hidden /> Not found in this
                      document
                    </p>
                  )}
                </section>
              ))}
            </div>
            <p className="mt-8 border-t border-line pt-3 text-[11.5px] text-fg-subtle">
              AI summary · check every citation before relying on it · {summary.modelLabel}
            </p>
          </article>
        )}
      </div>
    </div>
  )
}
