import { AlertCircle, ArrowRight, CheckCircle2, MinusCircle, Sparkles, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useProposeClaimResponse } from '@/api/queries/drafts'
import type { Draft, DraftClaim, DraftPatch, DraftSection } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { CitationChip } from '@/features/chat/CitationChip'
import { DraftBody } from '@/features/drafts/DraftBody'
import { cn } from '@/lib/cn'
import { useEngineReady } from '@/features/shell/useSystemStatus'
import { errorText } from '@/lib/errors'

// Each claim and demand in the incoming letter, and where the draft answers it (FE-7.5, DEC-47). A claim the
// draft leaves unanswered blocks the clean copy until the lawyer answers it or deliberately sets it aside.
interface PointByPointProps {
  draft: Draft
  readOnly: boolean
  onUpdate(patch: DraftPatch): void
  onShowSection(sectionId: string): void
}

/** A new section goes before the closing paragraph, with an id that doesn't clash. */
function insertSection(sections: DraftSection[], section: DraftSection) {
  let id = section.id
  for (let i = 2; sections.some((s) => s.id === id); i++) id = `${section.id}-${i}`
  const at = sections.findIndex((s) => s.id === 'closing')
  const next = [...sections]
  next.splice(at === -1 ? next.length : at, 0, { ...section, id })
  return { sections: next, id }
}

export function PointByPoint({ draft, readOnly, onUpdate, onShowSection }: PointByPointProps) {
  const propose = useProposeClaimResponse(draft.id)
  const engineReady = useEngineReady()
  const [proposal, setProposal] = useState<{ claimId: string; section: DraftSection } | null>(null)
  const sectionLabel = (id: string) => draft.sections.find((s) => s.id === id)?.label

  const setClaim = (claim: DraftClaim, fields: Partial<DraftClaim>) =>
    draft.claims.map((c) => (c.id === claim.id ? { ...c, ...fields } : c))

  const accept = (claim: DraftClaim, section: DraftSection) => {
    const { sections, id } = insertSection(draft.sections, section)
    onUpdate({
      sections,
      claims: setClaim(claim, { addressedBy: id, waived: false }),
      versionLabel: `Answered “${claim.text}”`,
    })
    setProposal(null)
    onShowSection(id)
  }

  return (
    <ol className="divide-y divide-line rounded-card border border-line bg-surface">
      {draft.claims.map((claim) => {
        const answered = claim.addressedBy && sectionLabel(claim.addressedBy)
        const status = answered ? 'answered' : claim.waived ? 'waived' : 'open'
        const drafting = propose.isPending && propose.variables === claim.id
        const shown = proposal?.claimId === claim.id ? proposal.section : null
        return (
          <li
            key={claim.id}
            className={cn('px-4 py-3.5', status === 'open' && 'bg-danger-tint/25')}
          >
            <div className="flex items-start gap-3">
              {status === 'answered' ? (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-success"
                  aria-label="Answered"
                />
              ) : status === 'waived' ? (
                <MinusCircle
                  className="mt-0.5 size-4 shrink-0 text-fg-subtle"
                  aria-label="Set aside"
                />
              ) : (
                <AlertCircle
                  className="mt-0.5 size-4 shrink-0 text-danger"
                  aria-label="Not answered"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('text-[13.5px] text-fg', status === 'waived' && 'text-fg-muted')}>
                  {claim.text}
                  <CitationChip n={claim.source.n} citation={claim.source} />
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px]">
                  {status === 'answered' ? (
                    <>
                      <span className="text-fg-muted">Answered in “{answered}”</span>
                      <button
                        type="button"
                        onClick={() => onShowSection(claim.addressedBy!)}
                        className="inline-flex items-center gap-1 font-medium text-link hover:underline"
                      >
                        Show in letter <ArrowRight className="size-3" aria-hidden />
                      </button>
                    </>
                  ) : status === 'waived' ? (
                    <>
                      <span className="text-fg-muted">You chose not to answer this point</span>
                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() => onUpdate({ claims: setClaim(claim, { waived: false }) })}
                          className="inline-flex items-center gap-1 font-medium text-link hover:underline"
                        >
                          <Undo2 className="size-3" aria-hidden /> Undo
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-danger">Not answered in the draft</span>
                      {!readOnly && !shown ? (
                        <span className="ml-auto flex gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => onUpdate({ claims: setClaim(claim, { waived: true }) })}
                          >
                            Set aside
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7"
                            loading={drafting}
                            disabled={propose.isPending || !engineReady}
                            onClick={() =>
                              propose.mutate(claim.id, {
                                onSuccess: ({ section }) =>
                                  setProposal({ claimId: claim.id, section }),
                                onError: (e) => toast.error(errorText(e)),
                              })
                            }
                          >
                            <Sparkles /> Draft a response
                          </Button>
                        </span>
                      ) : null}
                    </>
                  )}
                </div>

                {shown ? (
                  <div className="mt-3 animate-fade-in rounded-control border border-primary/30 bg-surface">
                    <p className="border-b border-line px-3.5 py-2 text-[12px] font-semibold text-primary">
                      Proposed paragraph · “{shown.label}”
                    </p>
                    <div className="px-3.5 py-3 font-serif text-[14.5px] leading-[1.7]">
                      <DraftBody
                        body={shown.body}
                        citations={draft.citations}
                        onToken={() => {}}
                        readOnly
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-line px-3.5 py-2">
                      <p className="text-[11.5px] text-fg-subtle">
                        Its flags stay in the letter until you resolve them.
                      </p>
                      <span className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => setProposal(null)}
                        >
                          Discard
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          className="h-7"
                          onClick={() => accept(claim, shown)}
                        >
                          Add to the letter
                        </Button>
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
