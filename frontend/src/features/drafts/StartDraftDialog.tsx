import { BookOpen } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { useDocuments } from '@/api/queries/documents'
import { useCreateDraft } from '@/api/queries/drafts'
import type { DraftType, ID, LegalDocument } from '@/api/types'
import { DocumentIcon } from '@/components/common/DocumentIcon'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog'
import { DraftTypeFields } from '@/features/drafts/DraftTypeFields'
import { useViewer } from '@/features/viewer/useViewer'
import { useUploadDialog } from '@/stores/ui'
import { useEngineReady } from '@/features/shell/useSystemStatus'
import { errorText } from '@/lib/errors'

// "Draft a reply…" from a document the other side sent (FE-7.1, DEC-43): the type of draft, the documents it
// may draw on, and what the reply should do. The draft opens in the panel and fills in as it is written.
function Fields({ incoming, onDone }: { incoming: LegalDocument; onDone(): void }) {
  const { matterId = '' } = useParams()
  const { data: documents = [] } = useDocuments(matterId)
  const create = useCreateDraft(matterId)
  const engineReady = useEngineReady()
  const { openDraft } = useViewer()
  const showUpload = useUploadDialog((s) => s.show)
  const others = documents.filter((d) => d.id !== incoming.id && d.status === 'ready')
  const [type, setType] = useState<DraftType>('response_letter')
  const [supporting, setSupporting] = useState<ID[]>(() =>
    others.filter((d) => d.origin === 'client').map((d) => d.id),
  )
  const [instructions, setInstructions] = useState('')

  const toggle = (id: ID, on: boolean) =>
    setSupporting((s) => (on ? [...s, id] : s.filter((x) => x !== id)))

  return (
    <>
      <DialogBody className="space-y-5">
        <div className="flex items-center gap-3 rounded-card border border-line bg-app px-3.5 py-2.5">
          <DocumentIcon kind={incoming.kind} className="size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.05em] text-fg-subtle uppercase">
              Responding to
            </p>
            <p className="truncate text-[13.5px] font-medium text-fg">{incoming.name}</p>
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-fg-subtle uppercase">
            Draft
          </legend>
          <DraftTypeFields value={type} onChange={setType} />
        </fieldset>

        {type === 'memo' ? (
          // DEC-45: before a memo is drafted, the lawyer is asked for the governing authority.
          <div className="flex animate-fade-in items-start gap-3 rounded-card border border-info/20 bg-info-tint px-3.5 py-3 text-[12.5px] text-info">
            <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p>
                A memo states law only from opinions, statutes or regulations uploaded to this
                matter. An issue with none gets a [RULE NEEDED] block, and the brief answer says it
                can’t be answered from the documents.
              </p>
              <button
                type="button"
                onClick={() => {
                  onDone()
                  showUpload()
                }}
                className="mt-1.5 font-semibold underline underline-offset-2"
              >
                Upload the governing authority first
              </button>
            </div>
          </div>
        ) : null}

        <fieldset>
          <legend className="mb-1 text-[12px] font-semibold tracking-[0.04em] text-fg-subtle uppercase">
            Draw on
          </legend>
          <p className="mb-2 text-[12.5px] text-fg-muted">
            The draft states only what these documents support. Anything else is left for you to
            fill in.
          </p>
          <ul className="max-h-[168px] divide-y divide-line overflow-y-auto rounded-control border border-line">
            {others.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-app">
                  <Checkbox
                    checked={supporting.includes(d.id)}
                    onCheckedChange={(on) => toggle(d.id, on)}
                    label={d.name}
                  />
                  <span aria-hidden className="min-w-0 flex-1 truncate text-[13px] text-fg">
                    {d.name}
                  </span>
                  <span aria-hidden className="text-[11.5px] text-fg-subtle">
                    {d.origin === 'client' ? 'Our client' : 'Other side'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div>
          <label
            htmlFor="draft-instructions"
            className="mb-2 block text-[12px] font-semibold tracking-[0.04em] text-fg-subtle uppercase"
          >
            What should it do?
          </label>
          <textarea
            id="draft-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Dispute the invoices under section 6.4, push back on the 1.5% interest, and propose a call."
            className="block w-full resize-none rounded-control border border-control bg-surface px-3 py-2 text-[13.5px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-primary"
          />
        </div>

        {create.error ? (
          <p role="alert" className="text-[13px] text-danger">
            {errorText(create.error)}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter className="justify-between">
        <p className="text-[12px] text-fg-subtle">
          You review every draft. LegalLens never sends anything.
        </p>
        <div className="flex gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!supporting.length || !engineReady}
            onClick={() =>
              create.mutate(
                {
                  type,
                  incomingDocumentId: incoming.id,
                  supportingDocumentIds: supporting,
                  instructions: instructions.trim(),
                },
                {
                  onSuccess: ({ draft }) => {
                    onDone()
                    openDraft(draft.id)
                  },
                },
              )
            }
          >
            Start draft
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

export function StartDraftDialog({
  document,
  onOpenChange,
}: {
  document: LegalDocument | null
  onOpenChange(open: boolean): void
}) {
  return (
    <Dialog open={Boolean(document)} onOpenChange={onOpenChange}>
      <DialogContent
        title="Draft a reply"
        description="A first draft for you to review, edit and adopt."
        size="md"
      >
        {document ? (
          <Fields key={document.id} incoming={document} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
