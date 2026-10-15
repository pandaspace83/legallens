import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Icon, title, one line of help and an optional action, for screens with nothing to show yet (FE-1.3).
interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-hover text-fg-subtle">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 font-serif text-[19px] text-fg">{title}</h2>
      <p className="mt-1 max-w-[380px] text-[13.5px] text-fg-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
