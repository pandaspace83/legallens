import { cn } from '@/lib/cn'

// Determinate progress bar for uploads and jobs (FE-1.2).
interface ProgressProps {
  value: number
  label: string
  tone?: 'primary' | 'success' | 'danger'
  className?: string
}

export function Progress({ value, label, tone = 'primary', className }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('h-1.5 overflow-hidden rounded-full bg-line', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          tone === 'success' ? 'bg-success' : tone === 'danger' ? 'bg-danger' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
