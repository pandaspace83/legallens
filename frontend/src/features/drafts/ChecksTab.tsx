import { CheckCircle2, Circle, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDraftChecks } from '@/api/queries/drafts'
import type { Draft, DraftChecks, DraftPatch } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { CitationChecklist } from '@/features/drafts/CitationChecklist'
import { PointByPoint } from '@/features/drafts/PointByPoint'
import { Safeguards } from '@/features/drafts/Safeguards'
import { COPY } from '@/lib/copy'
import { cn } from '@/lib/cn'

// Everything that must be true before the clean copy can go out, then the three checks behind it:
// point by point, the citation checklist and the safeguards (FE-7.5, FE-7.6, DEC-47 to DEC-51).
const GATE: { key: DraftChecks['blockers'][number]['key']; done: string }[] = [
  { key: 'tokens', done: 'No placeholders or flags left in the letter' },
  { key: 'claims', done: 'Every claim answered or set aside' },
  { key: 'authorities', done: 'Every citation acknowledged' },
  { key: 'review', done: `${COPY.draftAdopted} by you` },
]

interface ChecksTabProps {
  draft: Draft
  readOnly: boolean
  onUpdate(patch: DraftPatch): void
  onShowSection(sectionId: string): void
  onReview(): void
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-7">
      <h3 className="text-[12px] font-semibold tracking-[0.05em] text-fg-muted uppercase">
        {title}
      </h3>
      <p className="mt-0.5 mb-2.5 text-[12.5px] text-fg-subtle">{hint}</p>
      {children}
    </section>
  )
}

export function ChecksTab({ draft, readOnly, onUpdate, onShowSection, onReview }: ChecksTabProps) {
  const { data: checks } = useDraftChecks(draft.matterId, draft.id)
  const blockers = checks?.blockers ?? []
  const ready = Boolean(checks?.cleanAllowed)
  const onlyReview = blockers.length === 1 && blockers[0]?.key === 'review'
  const letter = draft.type === 'response_letter'

  return (
    <div className="px-5 py-5">
      <div
        className={cn(
          'rounded-card border p-4',
          ready ? 'border-success/25 bg-success-tint/50' : 'border-line bg-surface shadow-raised',
        )}
      >
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
          <ShieldCheck
            className={cn('size-4', ready ? 'text-success' : 'text-primary')}
            aria-hidden
          />
          {ready ? 'Ready to export the clean copy' : 'Before the clean copy can go out'}
        </p>
        <ul className="mt-2.5 space-y-1.5" aria-label="Export checklist">
          {GATE.filter((g) => letter || g.key !== 'claims').map((g) => {
            const open = blockers.find((b) => b.key === g.key)
            return (
              <li key={g.key} className="flex items-center gap-2 text-[13px]">
                {open ? (
                  <Circle className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
                )}
                <span className={open ? 'text-fg' : 'text-fg-muted'}>
                  {open ? open.message : g.done}
                  <span className="sr-only">{open ? ' (to do)' : ' (done)'}</span>
                </span>
              </li>
            )
          })}
        </ul>
        {onlyReview && !readOnly ? (
          <Button size="sm" variant="primary" className="mt-3.5" onClick={onReview}>
            Review and adopt
          </Button>
        ) : null}
      </div>

      {letter ? (
        <Section
          title="Point by point"
          hint="Each claim and demand in the incoming letter, and where your draft answers it."
        >
          <PointByPoint
            draft={draft}
            readOnly={readOnly}
            onUpdate={onUpdate}
            onShowSection={onShowSection}
          />
        </Section>
      ) : null}

      <Section
        title="Citation checklist"
        hint="Tick each authority once you’ve read it and are satisfied it says what the draft claims."
      >
        <CitationChecklist
          draft={draft}
          authorities={checks?.authorities}
          readOnly={readOnly}
          onUpdate={onUpdate}
        />
      </Section>

      <Section
        title="Safeguards"
        hint="Professional-conduct checks for anything sent to the other side."
      >
        <Safeguards
          draft={draft}
          readOnly={readOnly}
          onChange={(safeguards) => onUpdate({ safeguards })}
        />
      </Section>
    </div>
  )
}
