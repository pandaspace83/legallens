import { ChevronDown, FileCheck2, FileDown, FileLock2, Lock } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useDraftChecks, useExportDraft } from '@/api/queries/drafts'
import type { Draft } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { saveFile } from '@/lib/download'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'

// Two exports (FE-7.8, DEC-50): the clean copy to send, with no source numbers, notes or watermark, which
// stays locked until the export gate is clear; and a privileged working copy with its sources, for the file.
export function ExportMenu({ draft, onShowChecks }: { draft: Draft; onShowChecks(): void }) {
  const [open, setOpen] = useState(false)
  const exporter = useExportDraft(draft.id)
  const { data: checks } = useDraftChecks(draft.matterId, draft.id, draft.status !== 'drafting')
  const blockers = checks?.blockers ?? []
  // Locked until the server says the clean copy is allowed, so nothing is offered while it is still checking.
  const locked = !checks?.cleanAllowed

  const run = (kind: 'clean' | 'working') =>
    exporter.mutate(kind, {
      onSuccess: (file) => {
        saveFile(file)
        setOpen(false)
        toast.success(kind === 'clean' ? 'Clean copy exported' : 'Working copy exported', {
          description:
            kind === 'clean'
              ? 'Ready to send. LegalLens never sends anything itself.'
              : 'Privileged; keep it on your file.',
        })
      },
      onError: (e) => toast.error(errorText(e)),
    })

  const option =
    'flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-left transition-colors'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary" disabled={draft.status === 'drafting'}>
          <FileDown /> Export <ChevronDown className="-ml-0.5 text-fg-subtle" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-1.5">
        <button
          type="button"
          disabled={locked || exporter.isPending}
          onClick={() => run('clean')}
          className={cn(option, locked ? 'cursor-not-allowed' : 'hover:bg-hover')}
        >
          {locked ? (
            <Lock className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          ) : (
            <FileCheck2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          )}
          <span className="min-w-0">
            <span
              className={cn(
                'block text-[13.5px] font-medium',
                locked ? 'text-fg-muted' : 'text-fg',
              )}
            >
              Clean copy to send (Word)
            </span>
            <span className="block text-[12px] text-fg-subtle">
              No source numbers, notes or watermark
            </span>
          </span>
        </button>
        {locked && blockers.length ? (
          <div className="mx-3 mb-2 rounded-control bg-app px-3 py-2 text-[12px] text-fg-muted">
            <p className="font-medium text-fg">Locked until:</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
              {blockers.map((b) => (
                <li key={b.key}>{b.message}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onShowChecks()
              }}
              className="mt-1.5 font-medium text-link hover:underline"
            >
              Open the checks
            </button>
          </div>
        ) : null}
        <div className="my-1 h-px bg-line" />
        <button
          type="button"
          disabled={exporter.isPending}
          onClick={() => run('working')}
          className={cn(option, 'hover:bg-hover')}
        >
          <FileLock2 className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium text-fg">
              Working copy with sources (Word)
            </span>
            <span className="block text-[12px] text-fg-subtle">
              Marked privileged · do not send
            </span>
          </span>
        </button>
      </PopoverContent>
    </Popover>
  )
}
