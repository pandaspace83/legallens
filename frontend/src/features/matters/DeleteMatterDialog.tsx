import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useDeleteMatter } from '@/api/queries/matters'
import type { Matter } from '@/api/types'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { ExportMatterButton } from '@/features/matters/ExportMatterButton'
import { errorText } from '@/lib/errors'

// Delete a matter for good (DEC-34): an export prompt first, then the matter's name typed exactly.
export function DeleteMatterDialog({
  matter,
  open,
  onOpenChange,
}: {
  matter: Matter
  open: boolean
  onOpenChange(open: boolean): void
}) {
  const [step, setStep] = useState<'export' | 'confirm'>('export')
  const [typed, setTyped] = useState('')
  const remove = useDeleteMatter(matter.id)
  const navigate = useNavigate()

  const reset = (next: boolean) => {
    if (!next) {
      setStep('export')
      setTyped('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent
        size="sm"
        title={`Delete ${matter.name}?`}
        description="This permanently deletes the matter, its documents, summaries, drafts and chats. It can’t be undone."
      >
        {step === 'export' ? (
          <>
            <DialogBody className="space-y-3 text-[13.5px] text-fg-muted">
              <p>
                Export the matter’s file first, so you can return or keep the client’s file. Once it
                is deleted, LegalLens can’t get it back.
              </p>
              <ExportMatterButton matterId={matter.id} variant="primary" />
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button variant="secondary" onClick={() => setStep('confirm')}>
                Continue without exporting
              </Button>
              <Button variant="danger" onClick={() => setStep('confirm')}>
                I’ve exported it, continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody className="space-y-3">
              <Input
                label={`Type “${matter.name}” to confirm`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                autoComplete="off"
                error={remove.isError ? errorText(remove.error) : undefined}
              />
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => reset(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={remove.isPending}
                disabled={typed.trim() !== matter.name.trim()}
                onClick={() =>
                  remove.mutate(typed, {
                    onSuccess: () => {
                      toast.success(`${matter.name} was deleted`)
                      reset(false)
                      navigate('/matters', { replace: true })
                    },
                  })
                }
              >
                Delete the matter
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
