import { toast } from 'sonner'
import { useDeleteDocument, useDeletionImpact } from '@/api/queries/documents'
import type { ID, LegalDocument } from '@/api/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { plural } from '@/lib/format'

// Lists exactly what will be removed before a document is deleted (FE-5.7, DEC-58).
interface DeleteDocumentDialogProps {
  matterId: ID
  document: LegalDocument | null
  onOpenChange(open: boolean): void
  onDeleted?(): void
}

export function DeleteDocumentDialog({
  matterId,
  document,
  onOpenChange,
  onDeleted,
}: DeleteDocumentDialogProps) {
  const { data: impact } = useDeletionImpact(document?.id)
  const remove = useDeleteDocument(matterId)

  return (
    <ConfirmDialog
      open={Boolean(document)}
      onOpenChange={onOpenChange}
      title="Delete this document?"
      description={document?.name}
      confirmLabel="Delete document"
      tone="danger"
      loading={remove.isPending}
      onConfirm={() =>
        document &&
        remove.mutate(document.id, {
          onSuccess: () => {
            onOpenChange(false)
            onDeleted?.()
            toast(`${document.name} was deleted`, {
              description: 'Everything made from it was removed.',
            })
          },
        })
      }
    >
      <p className="text-[13.5px] text-fg-muted">
        This permanently removes everything LegalLens made from it:
      </p>
      {impact ? (
        <ul className="mt-3 space-y-1.5 text-[13.5px] text-fg">
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
            The original file ({plural(impact.pages, 'page')})
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
            Its extracted text and {plural(impact.passages, 'search passage')}
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
            {impact.citations
              ? `${plural(impact.citations, 'citation')} in ${plural(impact.conversations, 'chat')}; those answers will show the source as removed`
              : 'No answers cite it'}
          </li>
        </ul>
      ) : (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      <p className="mt-3 text-[12.5px] text-fg-subtle">
        Encrypted backups age it out within 35 days. This can’t be undone.
      </p>
    </ConfirmDialog>
  )
}
