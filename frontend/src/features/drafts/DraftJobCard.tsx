import { ArrowRight, Loader2, PenLine } from 'lucide-react'
import { useParams } from 'react-router'
import { useCancelJob } from '@/api/queries/chat'
import { useDraft, useDraftChecks } from '@/api/queries/drafts'
import type { DraftStep, ID } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { Skeleton } from '@/components/ui/Skeleton'
import { useViewer } from '@/features/viewer/useViewer'
import { cn } from '@/lib/cn'

// In-chat card for a draft job (FE-7.1): live progress through the drafting steps, then what needs the
// lawyer's attention and "Open draft".
const STEPS: { step: DraftStep; label: string }[] = [
  { step: 'reading', label: 'Read' },
  { step: 'claims', label: 'Claims' },
  { step: 'retrieving', label: 'Facts' },
  { step: 'drafting', label: 'Draft' },
  { step: 'safeguards', label: 'Guard' },
  { step: 'verifying', label: 'Check' },
]

export function DraftJobCard({ draftId }: { draftId: ID }) {
  const { matterId = '' } = useParams()
  const { data: draft } = useDraft(matterId, draftId)
  const { data: checks } = useDraftChecks(matterId, draftId, draft?.status !== 'drafting')
  const { openDraft, draftId: openId } = useViewer()
  const cancel = useCancelJob(matterId)

  if (!draft) return <Skeleton className="mt-4 h-[104px] w-full max-w-[520px] rounded-card" />

  const ready = draft.status !== 'drafting'
  const current = STEPS.findIndex((s) => s.step === draft.step)
  // Placeholders and flags, unanswered claims and unacknowledged citations: each needs the lawyer.
  const open = (checks?.blockers ?? []).filter((b) => b.key !== 'review').length
  const clear = Boolean(checks?.cleanAllowed)

  return (
    <div
      className={cn(
        'mt-4 max-w-[520px] rounded-card border bg-surface p-4 shadow-raised transition-colors',
        openId === draftId ? 'border-primary/40' : 'border-line',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <PenLine className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-fg">
            {draft.type === 'memo' ? 'Memo' : 'Letter'} · {draft.title}
          </p>
          <p className="truncate text-[12.5px] text-fg-subtle">
            Replying to {draft.incomingDocumentName}
          </p>
        </div>
      </div>

      {draft.status === 'failed' ? (
        <p role="status" className="mt-3.5 text-[12.5px] text-fg-muted">
          Stopped: this draft was cancelled or couldn’t be completed. Start it again to retry.
        </p>
      ) : ready ? (
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-fg-muted">
            {clear
              ? 'Adopted · ready to export'
              : `${open} to check · ${draft.status === 'reviewed_adopted' ? 'adopted' : 'not reviewed'}`}
          </p>
          {openId === draftId ? (
            <span className="shrink-0 text-[12.5px] font-medium whitespace-nowrap text-primary">
              Shown in the panel
            </span>
          ) : (
            <Button
              size="sm"
              variant="primary"
              className="shrink-0"
              onClick={() => openDraft(draftId)}
            >
              Open draft <ArrowRight />
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3.5" aria-live="polite">
          <p className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
            <Loader2 className="size-3 animate-spin text-primary" aria-hidden />
            {draft.stepDetail ?? 'Waiting to start'}
          </p>
          <Progress value={draft.progress ?? 0} label="Draft progress" className="mt-2" />
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
          {draft.jobId ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(draft.jobId!)}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
