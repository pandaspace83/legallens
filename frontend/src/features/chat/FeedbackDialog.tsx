import { useState } from 'react'
import { toast } from 'sonner'
import { useSendFeedback } from '@/api/queries/chat'
import type { FeedbackKind, ID } from '@/api/types'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/cn'
import { errorText } from '@/lib/errors'

// What was wrong with an answer (FE-4.8, DEC-52). The note stays in this matter's records, never in a prompt.
const KINDS: { kind: FeedbackKind; label: string; hint: string }[] = [
  {
    kind: 'wrong_citation',
    label: 'Wrong citation',
    hint: 'The cited passage doesn’t support it.',
  },
  { kind: 'missed_something', label: 'Missed something', hint: 'The documents have more on this.' },
  {
    kind: 'should_be_not_found',
    label: 'Should be “not found”',
    hint: 'The documents don’t actually say this.',
  },
]

export function FeedbackDialog({
  messageId,
  open,
  onOpenChange,
}: {
  messageId: ID
  open: boolean
  onOpenChange(open: boolean): void
}) {
  const [kind, setKind] = useState<FeedbackKind>('wrong_citation')
  const [note, setNote] = useState('')
  const send = useSendFeedback()

  const submit = () =>
    send.mutate(
      { messageId, kind, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast('Feedback saved', { description: 'Recorded in this matter’s audit trail.' })
          setNote('')
          onOpenChange(false)
        },
        onError: (e) => toast.error(errorText(e)),
      },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="What was wrong with this answer?"
        description="It helps us tune retrieval and checking. Nothing leaves this computer."
      >
        <DialogBody>
          <fieldset className="space-y-2">
            <legend className="sr-only">What was wrong</legend>
            {KINDS.map((k) => (
              <label
                key={k.kind}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-card border px-3.5 py-3 text-[13.5px]',
                  kind === k.kind ? 'border-primary bg-primary-tint' : 'border-line bg-surface',
                )}
              >
                <input
                  type="radio"
                  name="feedback-kind"
                  className="mt-1 accent-[var(--color-primary)]"
                  checked={kind === k.kind}
                  onChange={() => setKind(k.kind)}
                />
                <span>
                  <span className="block font-medium text-fg">{k.label}</span>
                  <span className="block text-fg-muted">{k.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="mt-4 block text-[13px] font-medium text-fg" htmlFor="feedback-note">
            Note (optional)
          </label>
          <Textarea
            id="feedback-note"
            className="mt-1.5"
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
          />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button variant="primary" onClick={submit} disabled={send.isPending}>
            Send feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
