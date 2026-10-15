import { Check } from 'lucide-react'
import type { DraftType } from '@/api/types'
import { DRAFT_TYPES } from '@/features/drafts/draftTypes'
import { cn } from '@/lib/cn'

// Response letter or internal memo, as two radio cards (FE-7.1).
export function DraftTypeFields({
  value,
  onChange,
}: {
  value: DraftType
  onChange(type: DraftType): void
}) {
  return (
    <div role="radiogroup" aria-label="Type of draft" className="grid grid-cols-2 gap-2">
      {DRAFT_TYPES.map(({ type, label, hint, Icon }) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={value === type}
          onClick={() => onChange(type)}
          className={cn(
            'relative rounded-control border px-3 py-2.5 text-left transition-colors',
            value === type
              ? 'border-primary bg-primary-tint/50'
              : 'border-line hover:border-line-strong hover:bg-app',
          )}
        >
          <Icon
            className={cn('size-4', value === type ? 'text-primary' : 'text-fg-subtle')}
            aria-hidden
          />
          <span className="mt-1.5 block text-[13.5px] font-medium text-fg">{label}</span>
          <span className="block text-[12px] leading-snug text-fg-subtle">{hint}</span>
          {value === type ? (
            <span className="absolute top-2.5 right-2.5 flex size-4 items-center justify-center rounded-full bg-primary text-white">
              <Check className="size-2.5" strokeWidth={3} aria-hidden />
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
