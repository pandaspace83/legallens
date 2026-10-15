import { Lock } from 'lucide-react'
import { useMatter } from '@/api/queries/matters'
import type { ID } from '@/api/types'

// Shown across a closed matter (FE-3.9, FE-8.3): everything can still be read, searched and exported, but nothing
// in it can change.
export function ClosedMatterBanner({ matterId }: { matterId: ID }) {
  const { data: matter } = useMatter(matterId)
  if (matter?.status !== 'closed') return null
  return (
    <div
      role="note"
      className="flex items-center gap-2.5 border-b border-line bg-hover/70 px-5 py-2 text-[13px] text-fg-muted"
    >
      <Lock className="size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold text-fg">{matter.name} is closed.</span> Its chats, documents
        and drafts are read-only; you can still read, search and export them.
      </span>
    </div>
  )
}
