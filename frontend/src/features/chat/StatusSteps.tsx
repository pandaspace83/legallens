import { Check, Loader2 } from 'lucide-react'
import type { RunStep } from '@/api/events'
import { cn } from '@/lib/cn'

// Live steps while an answer is prepared, so the lawyer sees the work (FE-4.5, DEC-22).
const LABELS: Record<RunStep, (scope?: string) => string> = {
  rewriting: () => 'Understanding your question',
  searching: (scope) =>
    scope
      ? `Searching ${scope.charAt(0).toLowerCase()}${scope.slice(1)}`
      : 'Searching your documents',
  reranking: () => 'Ranking the most relevant passages',
  generating: () => 'Writing the answer',
  verifying: () => 'Checking every citation against its passage',
}

export function StatusSteps({
  done,
  current,
  scope,
}: {
  done: RunStep[]
  current?: RunStep
  scope?: string
}) {
  const steps = [...done, ...(current ? [current] : [])]
  return (
    <ol aria-live="polite" className="space-y-1.5">
      {steps.map((step) => {
        const active = step === current
        return (
          <li
            key={step}
            className={cn(
              'flex animate-fade-in items-center gap-2.5 text-[13px]',
              active ? 'text-fg' : 'text-fg-subtle',
            )}
          >
            {active ? (
              <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
            ) : (
              <Check className="size-3.5 text-success" aria-hidden />
            )}
            {LABELS[step](scope)}
          </li>
        )
      })}
    </ol>
  )
}
