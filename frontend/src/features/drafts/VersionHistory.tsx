import { History, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { Draft, DraftPatch } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { formatRelative } from '@/lib/dates'
import { cn } from '@/lib/cn'

// Every saved version of the draft, newest first, with restore (FE-7.9). Restoring makes a new version,
// so nothing is ever lost.
export function VersionHistory({
  draft,
  readOnly,
  onUpdate,
}: {
  draft: Draft
  readOnly: boolean
  onUpdate(patch: DraftPatch, done?: () => void): void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton label="Version history" disabled={!draft.versions.length}>
          <History />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <p className="border-b border-line px-4 py-2.5 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
          Version history
        </p>
        <ol className="max-h-[360px] overflow-y-auto py-1">
          {draft.versions.map((v) => {
            const current = v.version === draft.version
            return (
              <li
                key={v.version}
                className={cn(
                  'flex items-start gap-3 px-4 py-2.5',
                  current && 'bg-primary-tint/40',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 min-w-7 items-center justify-center rounded-[5px] px-1 text-[11px] font-semibold',
                    current ? 'bg-primary text-white' : 'bg-hover text-fg-muted',
                  )}
                >
                  v{v.version}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-fg" title={v.label}>
                    {v.label}
                  </p>
                  <p className="text-[11.5px] text-fg-subtle">{formatRelative(v.createdAt)}</p>
                </div>
                {current ? (
                  <span className="mt-0.5 text-[11.5px] font-medium text-primary">Current</span>
                ) : !readOnly ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="-my-1 h-7"
                    onClick={() =>
                      onUpdate({ restoreVersion: v.version }, () =>
                        toast(`Restored version ${v.version}`, {
                          description: 'Saved as a new version; nothing was lost.',
                        }),
                      )
                    }
                  >
                    <RotateCcw /> Restore
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ol>
      </PopoverContent>
    </Popover>
  )
}
