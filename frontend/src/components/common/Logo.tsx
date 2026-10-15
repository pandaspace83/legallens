import { cn } from '@/lib/cn'

// The LegalLens mark and serif wordmark.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-7 shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="var(--color-primary)" />
      <circle cx="14" cy="14" r="7" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path
        d="M10.5 12.5h7M10.5 15.5h5"
        stroke="var(--color-highlight)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M19.2 19.2l5.3 5.3" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span
        className={cn(
          'font-serif text-[19px] font-semibold tracking-[-0.01em]',
          inverted ? 'text-white' : 'text-fg',
        )}
      >
        LegalLens
      </span>
    </span>
  )
}
