import { Check } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { useCreateSummary } from '@/api/queries/summaries'
import type { LegalDocument, SummaryAudience, SummaryTemplate } from '@/api/types'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog'
import { Segmented } from '@/components/ui/Segmented'
import { useViewer } from '@/features/viewer/useViewer'
import { cn } from '@/lib/cn'
import { AUDIENCE_SHORT, TEMPLATE_HINTS, TEMPLATE_LABELS } from '@/lib/summaries'
import { useEngineReady } from '@/features/shell/useSystemStatus'
import { errorText } from '@/lib/errors'

// Template and audience picker (FE-6.1, DEC-40, DEC-41): a dialog from a document, and the same fields
// in the composer's Summarize mode.
const TEMPLATES = Object.keys(TEMPLATE_LABELS) as SummaryTemplate[]
const AUDIENCES = (Object.keys(AUDIENCE_SHORT) as SummaryAudience[]).map((value) => ({
  value,
  label: AUDIENCE_SHORT[value],
}))

interface FieldsProps {
  template: SummaryTemplate
  audience: SummaryAudience
  onTemplate(t: SummaryTemplate): void
  onAudience(a: SummaryAudience): void
}

export function SummaryOptionsFields({ template, audience, onTemplate, onAudience }: FieldsProps) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-fg-subtle uppercase">
          Template
        </legend>
        <div role="radiogroup" aria-label="Summary template" className="space-y-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={t === template}
              onClick={() => onTemplate(t)}
              className={cn(
                'flex w-full items-start gap-3 rounded-control border px-3 py-2.5 text-left transition-colors',
                t === template
                  ? 'border-primary bg-primary-tint/50'
                  : 'border-line hover:border-line-strong hover:bg-app',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                  t === template ? 'border-primary bg-primary text-white' : 'border-control',
                )}
              >
                {t === template ? <Check className="size-2.5" strokeWidth={3} /> : null}
              </span>
              <span>
                <span className="block text-[13.5px] font-medium text-fg">
                  {TEMPLATE_LABELS[t]}
                </span>
                <span className="block text-[12.5px] text-fg-subtle">{TEMPLATE_HINTS[t]}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <p className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-fg-subtle uppercase">
          Audience
        </p>
        <Segmented
          label="Summary audience"
          value={audience}
          onChange={onAudience}
          options={AUDIENCES}
        />
      </div>
    </div>
  )
}

/** "Summarize…" from a document: pick template and audience, then the summary opens in the panel. */
export function SummarizeDialog({
  document,
  onOpenChange,
}: {
  document: LegalDocument | null
  onOpenChange(open: boolean): void
}) {
  const { matterId = '' } = useParams()
  const create = useCreateSummary(matterId)
  const engineReady = useEngineReady()
  const { openSummary } = useViewer()
  const [template, setTemplate] = useState<SummaryTemplate>('letter_demand')
  const [audience, setAudience] = useState<SummaryAudience>('detailed')

  return (
    <Dialog open={Boolean(document)} onOpenChange={onOpenChange}>
      <DialogContent title="Summarize this document" description={document?.name} size="sm">
        <DialogBody>
          <SummaryOptionsFields
            template={template}
            audience={audience}
            onTemplate={setTemplate}
            onAudience={setAudience}
          />
          {create.error ? (
            <p className="mt-3 text-[13px] text-danger">{errorText(create.error)}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!engineReady}
            onClick={() =>
              document &&
              create.mutate(
                { documentId: document.id, template, audience },
                {
                  onSuccess: ({ summary }) => {
                    onOpenChange(false)
                    openSummary(summary.id)
                  },
                },
              )
            }
          >
            Summarize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
