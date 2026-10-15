import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import type { IngestStep, LegalDocument } from '@/api/types'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/cn'
import { plural } from '@/lib/format'

// One file's way through ingestion: check, malware scan, reading pages, OCR, indexing (FE-5.3).
const STEPS: { step: IngestStep; label: string }[] = [
  { step: 'checking', label: 'Check' },
  { step: 'scanning', label: 'Scan' },
  { step: 'reading', label: 'Read' },
  { step: 'ocr', label: 'OCR' },
  { step: 'indexing', label: 'Index' },
]

export function IngestionProgress({
  document,
  onOpen,
}: {
  document: LegalDocument
  onOpen?: () => void
}) {
  const current = STEPS.findIndex((s) => s.step === document.step)
  const ready = document.status === 'ready'
  const failed = document.status === 'failed' || document.status === 'quarantined'
  const coverage = document.coverage
  const total = coverage ? coverage.pagesRead + coverage.unreadablePages.length : document.pages
  const partial = ready && Boolean(coverage?.unreadablePages.length)

  return (
    <div className="flex gap-3 py-3">
      <span
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
          partial
            ? 'bg-warning-tint text-warning'
            : ready
              ? 'bg-success-tint text-success'
              : failed
                ? 'bg-danger-tint text-danger'
                : 'bg-hover text-fg-muted',
        )}
      >
        {partial ? (
          <AlertTriangle className="size-[18px]" aria-hidden />
        ) : ready ? (
          <CheckCircle2 className="size-[18px]" aria-hidden />
        ) : document.status === 'quarantined' ? (
          <ShieldAlert className="size-[18px]" aria-hidden />
        ) : failed ? (
          <AlertTriangle className="size-[18px]" aria-hidden />
        ) : (
          <DocumentIcon kind={document.kind} className="size-[18px]" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">
            {document.name}
          </p>
          {ready && onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="shrink-0 text-[12.5px] font-medium text-link hover:underline"
            >
              Open
            </button>
          ) : null}
        </div>

        {ready ? (
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            Ready to search ·{' '}
            {coverage && coverage.unreadablePages.length
              ? `${coverage.pagesRead} of ${total} pages read; page ${coverage.unreadablePages.join(', ')} unreadable`
              : `${plural(total, 'page')} read`}
          </p>
        ) : failed ? (
          <p className="mt-0.5 text-[12.5px] text-danger">{document.error}</p>
        ) : (
          <>
            <p
              className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-fg-muted"
              aria-live="polite"
            >
              <Loader2 className="size-3 animate-spin text-primary" aria-hidden />
              {document.stepDetail ?? 'Waiting to start'}
            </p>
            <Progress
              value={document.progress ?? 0}
              label={`Processing ${document.name}`}
              className="mt-2"
            />
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
          </>
        )}
      </div>
    </div>
  )
}
