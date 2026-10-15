import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useDraftChecks, useReviewDraft } from '@/api/queries/drafts'
import type { Draft } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog'
import { errorText } from '@/lib/errors'

// "Reviewed and adopted": the lawyer confirms they have read the whole draft and make it their own (FE-7.7,
// DEC-51). It can't be confirmed while anything else in the export gate is open; the server refuses it too.
interface ReviewDialogProps {
  draft: Draft
  open: boolean
  onOpenChange(open: boolean): void
  onShowChecks(): void
}

export function ReviewDialog({ draft, open, onOpenChange, onShowChecks }: ReviewDialogProps) {
  const [read, setRead] = useState(false)
  const review = useReviewDraft(draft.matterId, draft.id)
  const { data: checks } = useDraftChecks(draft.matterId, draft.id)
  const open_ = (checks?.blockers ?? []).filter((b) => b.key !== 'review')
  const kind = draft.type === 'memo' ? 'memo' : 'letter'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setRead(false)
        onOpenChange(o)
      }}
    >
      <DialogContent
        size="sm"
        title="Review and adopt this draft"
        description={`Once adopted, the ${kind} is yours: the watermark comes off and the clean copy can be exported.`}
      >
        <DialogBody>
          {open_.length ? (
            <div className="rounded-card border border-warning/25 bg-warning-tint px-4 py-3 text-[13px] text-warning">
              <p className="flex items-center gap-2 font-semibold">
                <AlertCircle className="size-4" aria-hidden /> Resolve these first
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                {open_.map((b) => (
                  <li key={b.key}>{b.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <ul className="space-y-2 text-[13.5px] text-fg-muted">
                <li>Every statement of fact is one you can stand behind.</li>
                <li>Every authority says what the {kind} says it does.</li>
                <li>The tone and the positions taken are the ones you intend.</li>
              </ul>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-card border border-line bg-app px-3.5 py-3 text-[13.5px] text-fg">
                <Checkbox
                  className="mt-0.5"
                  checked={read}
                  onCheckedChange={setRead}
                  label={`I’ve read the whole ${kind} and adopt it as my own work`}
                />
                <span aria-hidden>I’ve read the whole {kind} and adopt it as my own work.</span>
              </label>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          {open_.length ? (
            <Button
              variant="primary"
              onClick={() => {
                onOpenChange(false)
                onShowChecks()
              }}
            >
              Go to checks
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!read}
              loading={review.isPending}
              onClick={() =>
                review.mutate(undefined, {
                  onSuccess: () => {
                    onOpenChange(false)
                    setRead(false)
                    toast.success('Draft adopted', {
                      description: 'The clean copy can now be exported.',
                    })
                  },
                  onError: (e) => toast.error(errorText(e)),
                })
              }
            >
              Adopt as my own
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
