import { BookMarked } from 'lucide-react'
import type { Authority, Draft, DraftPatch } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Checkbox'

// Every authority the draft relies on, with where it came from and an acknowledgement per row (FE-7.5, DEC-49).
// The rows come from the server (GET /drafts/{id}/checks, INT-3.3). Ticking an [UNVERIFIED] row is the lawyer
// vouching for it: the clean copy then cites it normally, so the row says so before it is ticked.
// Each row, the lawyer's own sources included, needs its own tick, and each says later history wasn't checked.
// Only legal authority is listed. Contract clauses and letters the draft quotes are evidence: they keep their
// source citations in the letter but are not rows here (integration decision 1, approved 2026-10-10).
const STATUS: Record<
  Authority['status'],
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  full_text: { label: 'Full text uploaded', tone: 'success' },
  mentioned_only: { label: 'Mentioned only', tone: 'warning' },
  not_uploaded: { label: 'Not in your documents', tone: 'danger' },
  added_by_lawyer: { label: 'Added by you', tone: 'neutral' },
}

interface CitationChecklistProps {
  draft: Draft
  /** Undefined while the server's checks are loading. */
  authorities?: Authority[]
  readOnly: boolean
  onUpdate(patch: DraftPatch): void
}

export function CitationChecklist({
  draft,
  authorities,
  readOnly,
  onUpdate,
}: CitationChecklistProps) {
  const rows = authorities ?? []

  if (!authorities) {
    return (
      <p className="rounded-card border border-line bg-surface px-4 py-3.5 text-[12.5px] text-fg-muted">
        Checking the citations…
      </p>
    )
  }

  if (!rows.length) {
    return (
      <p className="rounded-card border border-line bg-surface px-4 py-3.5 text-[12.5px] text-fg-muted">
        The draft cites no legal authority. The contract clauses and letters it quotes are linked as
        sources in the letter.
      </p>
    )
  }

  const toggle = (key: string, on: boolean) =>
    onUpdate({
      acknowledged: on ? [...draft.acknowledged, key] : draft.acknowledged.filter((k) => k !== key),
    })

  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface">
      {rows.map((row) => {
        const checked = draft.acknowledged.includes(row.key)
        return (
          <li key={row.key} className="flex items-start gap-3 px-4 py-3.5">
            <Checkbox
              className="mt-0.5"
              checked={checked}
              label={`I’ve checked ${row.label}`}
              disabled={readOnly}
              onCheckedChange={(on) => toggle(row.key, on)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-fg">
                  <BookMarked className="size-3.5 text-fg-subtle" aria-hidden />
                  {row.label}
                </span>
                <Badge size="sm" tone={STATUS[row.status].tone}>
                  {STATUS[row.status].label}
                </Badge>
              </div>
              <p className="mt-0.5 text-[12.5px] text-fg-muted">{row.detail}</p>
              <p className="mt-1 text-[11.5px] text-fg-subtle">
                Later history not checked. Confirm it is still good law in your citator.
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
