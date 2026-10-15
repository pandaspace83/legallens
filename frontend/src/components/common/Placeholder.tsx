import { cn } from '@/lib/cn'

// Temporary stand-in for a screen or region that is not built yet. Removed by FE-9.4.
interface PlaceholderProps {
  name: string
  task: string
  purpose: string
  className?: string
}

export function Placeholder({ name, task, purpose, className }: PlaceholderProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-dashed border-line-strong bg-surface p-4 text-left',
        className,
      )}
    >
      <p className="font-medium text-fg">
        {name} <span className="font-normal text-fg-subtle">· {task}</span>
      </p>
      <p className="mt-1 text-fg-muted">{purpose}</p>
    </div>
  )
}
