import { CheckCircle2, ShieldAlert } from 'lucide-react'
import type { Draft } from '@/api/types'
import { COPY } from '@/lib/copy'
import { formatRelative } from '@/lib/dates'

// "AI draft · not reviewed" until the lawyer adopts it; then who adopted it and when (DEC-51).
// Any change after adoption puts the band back, because the letter is no longer the one reviewed.
export function WatermarkBand({ draft }: { draft: Draft }) {
  if (draft.status === 'reviewed_adopted') {
    return (
      <div className="flex items-center gap-2 border-b border-success/20 bg-success-tint/70 px-5 py-2 text-[12.5px] text-success">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold">{COPY.draftAdopted} by you</span>
          {draft.reviewedAt ? ` · ${formatRelative(draft.reviewedAt)}` : ''} · editing it again
          returns it to “not reviewed”
        </span>
      </div>
    )
  }
  return (
    <div
      role="note"
      className="flex items-center gap-2 border-b border-warning/25 bg-[repeating-linear-gradient(135deg,var(--color-warning-tint)_0_12px,color-mix(in_srgb,var(--color-warning-tint)_55%,white)_12px_24px)] px-5 py-2 text-[12.5px] text-warning"
    >
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold tracking-[0.04em] uppercase">{COPY.draftNotReviewed}</span> ·
        nothing leaves LegalLens until you adopt it as your own work
      </span>
    </div>
  )
}
