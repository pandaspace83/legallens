import { cn } from '@/lib/cn'

// Initials avatar for the signed-in lawyer (FE-1.3).
export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold tracking-wide text-white',
        className,
      )}
    >
      {initials}
    </span>
  )
}
