import { ArrowRight, FileText, Loader2 } from 'lucide-react'
import { useParams } from 'react-router'
import { useCancelJob } from '@/api/queries/chat'
import { useSummary } from '@/api/queries/summaries'
import type { ID, SummaryStep } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton } from '@/components/ui/Skeleton'
import { useViewer } from '@/features/viewer/useViewer'
import { cn } from '@/lib/cn'
import { plural } from '@/lib/format'
import { AUDIENCE_SHORT, TEMPLATE_LABELS } from '@/lib/summaries'

// In-chat card for a summary job: live progress and steps, then "Open summary" (FE-4.10).
const STEPS: { step: SummaryStep; label: string }[] = [
  { step: 'reading', label: 'Read' },
  { step: 'extracting', label: 'Extract' },
  { step: 'writing', label: 'Write' },
  { step: 'verifying', label: 'Check' },
]

export function JobCard({ summaryId }: { summaryId: ID }) {
  const { matterId = '' } = useParams()
  const { data: summary } = useSummary(matterId, summaryId)
  const { openSummary, summaryId: openId } = useViewer()
  const cancel = useCancelJob(matterId)

  if (!summary) return <Skeleton className="mt-4 h-[104px] w-full max-w-[520px] rounded-card" />

  const ready = summary.status === 'ready'
  const found = summary.sections.filter((s) => s.body).length
  const current = STEPS.findIndex((s) => s.step === summary.step)

  return (
    <div
      className={cn(
        'mt-4 max-w-[520px] rounded-card border bg-surface p-4 shadow-raised transition-colors',
        openId === summaryId ? 'border-primary/40' : 'border-line',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <FileText className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-fg">
            Summary · {summary.documentName}
          </p>
          <p className="text-[12.5px] text-fg-subtle">
            {TEMPLATE_LABELS[summary.template]} · {AUDIENCE_SHORT[summary.audience]}
          </p>
        </div>
      </div>

      {summary.status === 'failed' ? (
        <p role="status" className="mt-3.5 text-[12.5px] text-fg-muted">
          Stopped: this summary was cancelled or couldn’t be completed. Ask again to retry.
        </p>
      ) : ready ? (
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-fg-muted">
            Ready · {found} of {plural(summary.sections.length, 'item')} found ·{' '}
            {plural(summary.citations.length, 'citation')}
          </p>
          {openId === summaryId ? (
            <span className="text-[12.5px] font-medium text-primary">Shown in the panel</span>
          ) : (
            <Button size="sm" variant="primary" onClick={() => openSummary(summaryId)}>
              Open summary <ArrowRight />
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3.5" aria-live="polite">
          <p className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
            <Loader2 className="size-3 animate-spin text-primary" aria-hidden />
            {summary.stepDetail ?? 'Waiting to start'}
          </p>
          <Progress value={summary.progress ?? 0} label="Summary progress" className="mt-2" />
          <ol className="mt-1.5 flex justify-between text-[10.5px] font-medium tracking-wide text-fg-subtle uppercase">
            {STEPS.map((s, i) => (
              <li
                key={s.step}
                className={cn(i < current && 'text-success', i === current && 'text-primary')}
              >
                {s.label}
              </li>
            ))}
          </ol>
          {summary.jobId ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(summary.jobId!)}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
