import { ChevronDown, FileText } from 'lucide-react'
import type { ID } from '@/api/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { SummaryOptionsFields } from '@/features/summaries/SummaryOptions'
import { AUDIENCE_SHORT, TEMPLATE_SHORT } from '@/lib/summaries'
import { useComposer, useMatterSummaryChoice } from '@/stores/composer'

// In Summarize mode, the composer shows the chosen template and audience; click to change (FE-4.4, FE-6.1).
export function SummaryChoicePill({ matterId }: { matterId: ID }) {
  const choice = useMatterSummaryChoice(matterId)
  const setSummary = useComposer((s) => s.setSummary)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 max-w-[280px] animate-fade-in items-center gap-1.5 rounded-full border border-primary/30 bg-primary-tint/60 px-3 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary-tint data-[state=open]:bg-primary-tint"
        >
          <FileText className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {TEMPLATE_SHORT[choice.template]} · {AUDIENCE_SHORT[choice.audience]}
          </span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[380px]">
        <SummaryOptionsFields
          template={choice.template}
          audience={choice.audience}
          onTemplate={(template) => setSummary(matterId, { ...choice, template })}
          onAudience={(audience) => setSummary(matterId, { ...choice, audience })}
        />
        <p className="mt-4 text-[12px] text-fg-subtle">
          Pick the document under “Search in”, or name it in your request.
        </p>
      </PopoverContent>
    </Popover>
  )
}
