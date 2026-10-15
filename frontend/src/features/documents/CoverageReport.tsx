import { AlertTriangle, CheckCircle2, ScanText } from 'lucide-react'
import type { LegalDocument } from '@/api/types'
import { Progress } from '@/components/ui/Progress'
import { percent, plural } from '@/lib/format'

// What was actually read: pages read and unreadable, low-confidence OCR pages, with links (FE-5.4, DEC-42).
export function CoverageReport({
  document,
  onGoToPage,
}: {
  document: LegalDocument
  onGoToPage?: (page: number) => void
}) {
  const coverage = document.coverage
  if (!coverage)
    return (
      <p className="text-[13px] text-fg-muted">
        The coverage report appears when processing finishes.
      </p>
    )

  const total = coverage.pagesRead + coverage.unreadablePages.length
  const complete = coverage.unreadablePages.length === 0
  const pageLink = (page: number) =>
    onGoToPage ? (
      <button
        key={page}
        type="button"
        onClick={() => onGoToPage(page)}
        className="font-medium text-link hover:underline"
      >
        page {page}
      </button>
    ) : (
      <span key={page}>page {page}</span>
    )

  return (
    <div className="space-y-3.5 text-[13px]">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="font-semibold text-fg">
            {coverage.pagesRead} of {plural(total, 'page')} read
          </p>
          {document.ocrConfidence !== undefined ? (
            <p className="text-fg-subtle">OCR confidence {percent(document.ocrConfidence)}</p>
          ) : null}
        </div>
        <Progress
          value={(coverage.pagesRead / total) * 100}
          label="Pages read"
          tone={complete ? 'success' : 'primary'}
          className="mt-2"
        />
      </div>

      {complete ? (
        <p className="flex items-start gap-2 text-fg-muted">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          Every page was read. Summaries and answers can use the whole document.
        </p>
      ) : (
        <p className="flex items-start gap-2 text-fg-muted">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            Unreadable: {coverage.unreadablePages.map(pageLink)}. Answers and summaries can’t use
            it; summaries say so.
          </span>
        </p>
      )}

      {coverage.lowConfidencePages.length ? (
        <p className="flex items-start gap-2 text-fg-muted">
          <ScanText className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            Scanned with low confidence:{' '}
            {coverage.lowConfidencePages.map((p, i) => (
              <span key={p.page}>
                {i ? ', ' : ''}
                {pageLink(p.page)} ({percent(p.confidence)})
              </span>
            ))}
            . Check quotes from these pages against the original.
          </span>
        </p>
      ) : null}
    </div>
  )
}
