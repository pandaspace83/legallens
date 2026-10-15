import { AlertTriangle, Check, ShieldAlert } from 'lucide-react'
import type { LegalDocument } from '@/api/types'
import { cn } from '@/lib/cn'

// Document status at a glance: ready, processing %, low OCR confidence, failed, quarantined (FE-1.3).
export function StatusPill({
  document,
  className,
}: {
  document: LegalDocument
  className?: string
}) {
  const lowOcr = document.ocrConfidence !== undefined && document.ocrConfidence < 0.85

  if (document.status === 'processing' || document.status === 'queued') {
    const pct = document.progress ?? 0
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle',
          className,
        )}
      >
        <span className="relative h-1 w-8 overflow-hidden rounded-full bg-line" aria-hidden>
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </span>
        {pct}%
      </span>
    )
  }
  if (document.status === 'failed') {
    return (
      <AlertTriangle
        className={cn('size-3.5 text-danger', className)}
        aria-label="Failed to read"
      />
    )
  }
  if (document.status === 'quarantined') {
    return (
      <ShieldAlert className={cn('size-3.5 text-danger', className)} aria-label="Quarantined" />
    )
  }
  if (lowOcr) {
    return (
      <span
        className={cn('text-[11px] font-medium text-warning', className)}
        title="Some pages were scanned with low confidence"
      >
        OCR {Math.round((document.ocrConfidence ?? 0) * 100)}%
      </span>
    )
  }
  return <Check className={cn('size-3.5 text-fg-subtle', className)} aria-label="Ready" />
}
