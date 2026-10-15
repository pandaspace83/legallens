import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

// Small inline spinner with a screen-reader label (FE-1.3).
export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className="inline-flex">
      <Loader2 aria-hidden className={cn('size-4 animate-spin text-fg-subtle', className)} />
      <span className="sr-only">{label}</span>
    </span>
  )
}
