import { Tooltip as RadixTooltip } from 'radix-ui'
import type { ReactNode } from 'react'

// Tooltip with the shared delay and look (FE-1.2). Put `shortcut` to show a key hint beside the label.
interface TooltipProps {
  label: ReactNode
  shortcut?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactNode
}

export function Tooltip({ label, shortcut, side = 'bottom', children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs font-medium text-white shadow-overlay data-[state=delayed-open]:animate-fade-in"
        >
          {label}
          {shortcut ? <span className="text-white/60">{shortcut}</span> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
