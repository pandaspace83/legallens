import { Loader2, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useProposeRewrite } from '@/api/queries/drafts'
import type { DraftSection, ID } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { DiffView } from '@/features/drafts/DiffView'
import { errorText } from '@/lib/errors'

// Rewrite one section from an instruction, show the change, and apply it only if the lawyer accepts (FE-7.4, DEC-44).
const SUGGESTIONS = ['Make it firmer', 'Make it shorter']

interface RefineSectionProps {
  draftId: ID
  section: DraftSection
  onAccept(body: string, instruction: string): void
  onCancel(): void
}

export function RefineSection({ draftId, section, onAccept, onCancel }: RefineSectionProps) {
  const [instruction, setInstruction] = useState('')
  const propose = useProposeRewrite(draftId)
  const proposal = propose.data?.body

  const run = (text: string) => {
    if (!text.trim()) return
    setInstruction(text)
    propose.mutate({ sectionId: section.id, instruction: text })
  }

  return (
    <div className="mt-3 rounded-card border border-primary/30 bg-primary-tint/30 p-3.5 font-sans">
      {!proposal ? (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            run(instruction)
          }}
        >
          <label
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary"
            htmlFor={`refine-${section.id}`}
          >
            <Sparkles className="size-3.5" aria-hidden /> How should “{section.label}” change?
          </label>
          <input
            id={`refine-${section.id}`}
            autoFocus
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Make it firmer, and mention the 30-day negotiation period"
            className="mt-2 h-9 w-full rounded-control border border-control bg-surface px-3 text-[13.5px] text-fg outline-none focus:border-primary"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => run(s)}
                className="h-7 rounded-full border border-line bg-surface px-2.5 text-[12px] font-medium text-fg-muted hover:border-line-strong hover:text-fg"
              >
                {s}
              </button>
            ))}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              type="submit"
              loading={propose.isPending}
              disabled={!instruction.trim()}
            >
              Rewrite
            </Button>
          </div>
          {propose.error ? (
            <p role="alert" className="mt-2 text-[12.5px] text-danger">
              {errorText(propose.error)}
            </p>
          ) : null}
          {propose.isPending ? (
            <p
              className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-muted"
              aria-live="polite"
            >
              <Loader2 className="size-3 animate-spin" aria-hidden /> Rewriting only this section;
              the rest stays as it is
            </p>
          ) : null}
        </form>
      ) : (
        <div>
          <p className="text-[12.5px] font-semibold text-primary">
            Proposed change · “{instruction}”
          </p>
          <div className="mt-2 rounded-control border border-line bg-surface px-3.5 py-3">
            <DiffView before={section.body} after={proposal} />
          </div>
          <div className="mt-2.5 flex items-center justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Discard
            </Button>
            <Button size="sm" variant="secondary" onClick={() => propose.reset()}>
              Try another instruction
            </Button>
            <Button size="sm" variant="primary" onClick={() => onAccept(proposal, instruction)}>
              Accept change
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
