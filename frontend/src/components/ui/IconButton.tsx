import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'

// Square icon-only button. The label is required: it becomes the accessible name and the tooltip (FE-1.2).
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  shortcut?: string
  size?: 'sm' | 'md'
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, size = 'md', tooltipSide, className, children, ...props },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors duration-150 hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-hover data-[state=open]:text-fg',
          size === 'sm' ? 'size-7 [&_svg]:size-3.5' : 'size-8 [&_svg]:size-4',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  )
})
