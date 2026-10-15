import { ChevronDown, PenLine } from 'lucide-react'
import type { ID } from '@/api/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { DraftTypeFields } from '@/features/drafts/DraftTypeFields'
import { DRAFT_TYPES } from '@/features/drafts/draftTypes'
import { useComposer, useMatterDraftType } from '@/stores/composer'

// In Draft mode, the composer shows the type of draft; click to change it (FE-4.4, FE-7.1).
export function DraftChoicePill({ matterId }: { matterId: ID }) {
  const type = useMatterDraftType(matterId)
  const setDraftType = useComposer((s) => s.setDraftType)
  const label = DRAFT_TYPES.find((t) => t.type === type)?.label

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 max-w-[240px] animate-fade-in items-center gap-1.5 rounded-full border border-primary/30 bg-primary-tint/60 px-3 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary-tint data-[state=open]:bg-primary-tint"
        >
          <PenLine className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[400px]">
        <DraftTypeFields value={type} onChange={(t) => setDraftType(matterId, t)} />
        <p className="mt-3 text-[12px] text-fg-subtle">
          Name the letter you’re replying to, or pick it under “Search in”. For more control, use
          “Draft a reply…” on the document.
        </p>
      </PopoverContent>
    </Popover>
  )
}
