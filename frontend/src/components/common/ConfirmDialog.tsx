import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog'

// Confirmation for consequential actions; `typed` asks the lawyer to type a word first (FE-1.3, DEC-34).
interface ConfirmDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: ReactNode
  children?: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger'
  loading?: boolean
  typed?: string
  onConfirm(): void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  tone = 'primary',
  loading,
  typed,
  onConfirm,
}: ConfirmDialogProps) {
  const [entry, setEntry] = useState('')
  const ready = !typed || entry.trim().toLowerCase() === typed.toLowerCase()

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setEntry('')
        onOpenChange(o)
      }}
    >
      <DialogContent title={title} description={description} size="sm">
        <DialogBody>
          {children}
          {typed ? (
            <label className="mt-4 block text-[13px] text-fg-muted">
              Type <span className="font-semibold text-fg">{typed}</span> to confirm
              <input
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-control border border-control px-3 text-sm text-fg outline-none focus:border-primary"
              />
            </label>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            disabled={!ready}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
