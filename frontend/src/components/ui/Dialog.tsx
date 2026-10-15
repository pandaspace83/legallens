import { X } from 'lucide-react'
import { Dialog as Radix } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Radix Dialog: modal with title, description, focus trap and Esc to close (FE-1.2).
export const Dialog = Radix.Root
export const DialogClose = Radix.Close

interface DialogContentProps {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  /** Width of the dialog. */
  size?: 'sm' | 'md' | 'lg'
  onOpenAutoFocus?: (event: Event) => void
}

const WIDTHS = {
  sm: 'w-[min(440px,calc(100vw-32px))]',
  md: 'w-[min(560px,calc(100vw-32px))]',
  lg: 'w-[min(720px,calc(100vw-32px))]',
}

export function DialogContent({
  title,
  description,
  children,
  className,
  size = 'md',
  onOpenAutoFocus,
}: DialogContentProps) {
  return (
    <Radix.Portal>
      <Radix.Overlay className="fixed inset-0 z-40 animate-fade-in bg-fg/30" />
      <Radix.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-48px)] -translate-x-1/2 -translate-y-1/2 animate-pop-in flex-col rounded-[16px] border border-line bg-surface shadow-overlay outline-none',
          WIDTHS[size],
          className,
        )}
      >
        <div className="relative shrink-0 px-6 pt-5 pr-14 pb-4">
          <Radix.Title className="font-serif text-[21px] leading-snug tracking-[-0.01em] text-fg">
            {title}
          </Radix.Title>
          {description ? (
            <Radix.Description className="mt-1 text-[13.5px] text-fg-muted">
              {description}
            </Radix.Description>
          ) : (
            <Radix.Description className="sr-only">{title}</Radix.Description>
          )}
          <Radix.Close
            aria-label="Close"
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <X className="size-4" />
          </Radix.Close>
        </div>
        {children}
      </Radix.Content>
    </Radix.Portal>
  )
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 pb-5', className)}>{children}</div>
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-end gap-2 rounded-b-[16px] border-t border-line bg-app/60 px-6 py-3.5',
        className,
      )}
    >
      {children}
    </div>
  )
}
