import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/common/EmptyState'

// What a screen shows when its data couldn't load: what failed, that nothing was lost, and a way to try again
// (§2.4, §6). Never the empty state, which would wrongly say there is nothing there.
export function LoadError({
  what,
  onRetry,
  retrying,
  className,
}: {
  /** What couldn't load, e.g. "This matter’s documents". */
  what: string
  onRetry(): void
  retrying?: boolean
  className?: string
}) {
  return (
    <div role="alert" className={className}>
      <EmptyState
        icon={AlertTriangle}
        title={`${what} couldn’t load`}
        description="LegalLens on this computer didn’t answer. Nothing was lost; try again in a moment."
        action={
          <Button variant="secondary" onClick={onRetry} loading={retrying}>
            Try again
          </Button>
        }
      />
    </div>
  )
}
