import { EyeOff, MessageSquareWarning, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRevealHiddenContent } from '@/api/queries/documents'
import type { HiddenItem, LegalDocument } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { errorText } from '@/lib/errors'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog'

// Documents from the other side with hidden content: notice only, and a deliberate step to look (FE-5.5, DEC-59).
const KIND_LABEL: Record<string, string> = {
  tracked_changes: 'tracked changes',
  comments: 'comments',
  hidden_text: 'hidden text',
  white_text: 'hidden text',
  tiny_text: 'tiny text',
  metadata: 'metadata',
  annotations: 'annotations',
  embedded_files: 'embedded files',
  // The mock's singular kinds
  tracked_change: 'tracked changes',
  comment: 'comments',
}
const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind.replace(/_/g, ' ')

export function HiddenContentNotice({ document }: { document: LegalDocument }) {
  const [confirming, setConfirming] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const reveal = useRevealHiddenContent()
  const [items, setItems] = useState<HiddenItem[]>([])
  // The notice is kinds and a count only. The items come from the audited endpoint, after the step below.
  const count = document.hiddenCount ?? document.hiddenItems?.length ?? 0
  const kinds = [
    ...new Set(document.hiddenKinds ?? document.hiddenItems?.map((i) => i.kind) ?? []),
  ].map(kindLabel)

  return (
    <div className="border-b border-line bg-warning-tint px-4 py-3 text-[12.5px] text-warning">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">This document from the other side contains hidden content</p>
          <p className="mt-0.5">
            {count
              ? `${count} ${count === 1 ? 'item' : 'items'}${kinds.length ? `: ${kinds.join(', ')}` : ''}.`
              : 'Tracked changes, comments or metadata.'}{' '}
            They are kept from the AI and from this view.
          </p>
          {revealed ? (
            <ul className="mt-2.5 space-y-1.5 rounded-control border border-warning/20 bg-surface px-3 py-2.5 text-fg">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-semibold text-fg-muted">
                    {kindLabel(item.kind)}:
                  </span>
                  <span>{item.description}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {revealed ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-warning hover:bg-warning/10 hover:text-warning"
            onClick={() => setRevealed(false)}
          >
            <EyeOff /> Hide
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
            Review hidden content
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent size="sm" title="Review the other side’s hidden content?">
          <DialogBody className="space-y-3 text-[13.5px] leading-relaxed text-fg-muted">
            <p className="flex gap-2.5">
              <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              Some states restrict lawyers from reviewing metadata in documents from opposing
              counsel, although ABA Formal Opinion 06-442 allows it. Check the rule in your
              licensing state first.
            </p>
            <p>
              If this content was sent to you by mistake, Model Rule 4.4(b) requires you to promptly
              notify the sender.
            </p>
            <p className="text-fg-subtle">Your decision is recorded in this matter’s audit log.</p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Don’t show</Button>
            </DialogClose>
            <Button
              variant="primary"
              loading={reveal.isPending}
              onClick={() =>
                reveal.mutate(document.id, {
                  onSuccess: (found) => {
                    setItems(found)
                    setConfirming(false)
                    setRevealed(true)
                  },
                  onError: (e) => {
                    setConfirming(false)
                    toast.error(errorText(e))
                  },
                })
              }
            >
              Show hidden content
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
