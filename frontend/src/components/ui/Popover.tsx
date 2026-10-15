import { Popover as Radix } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

// Radix Popover for the scope picker, the 'Runs locally' explainer and placeholder fixes (FE-1.2).
export const Popover = Radix.Root
export const PopoverTrigger = Radix.Trigger
export const PopoverClose = Radix.Close

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'z-50 rounded-card border border-line bg-surface p-4 shadow-overlay outline-none data-[state=open]:animate-pop-in',
          className,
        )}
        {...props}
      />
    </Radix.Portal>
  )
}
