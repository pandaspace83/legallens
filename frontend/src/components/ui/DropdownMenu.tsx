import { DropdownMenu as Radix } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

// Radix DropdownMenu styled for row actions, the user menu and the matter switcher (FE-1.2).
// Non-modal, as in the WAI-ARIA menu button pattern: the page behind stays exposed to screen readers (a modal menu
// hid it while its controls stayed focusable, which axe reports as aria-hidden-focus), Tab leaves the menu, and a
// click outside still closes it (FE-9.1).
export function Menu(props: ComponentProps<typeof Radix.Root>) {
  return <Radix.Root modal={false} {...props} />
}
export const MenuTrigger = Radix.Trigger

export function MenuContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'z-50 min-w-[220px] rounded-card border border-line bg-surface p-1.5 shadow-overlay outline-none',
          'origin-[--radix-dropdown-menu-content-transform-origin] data-[state=open]:animate-pop-in',
          className,
        )}
        {...props}
      />
    </Radix.Portal>
  )
}

interface MenuItemProps extends ComponentProps<typeof Radix.Item> {
  icon?: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'danger'
}

export function MenuItem({
  className,
  icon,
  hint,
  tone = 'default',
  children,
  ...props
}: MenuItemProps) {
  return (
    <Radix.Item
      className={cn(
        'flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover [&_svg]:size-4 [&_svg]:shrink-0',
        tone === 'danger' ? 'text-danger' : 'text-fg [&_svg]:text-fg-muted',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
    </Radix.Item>
  )
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof Radix.Label>) {
  return (
    <Radix.Label
      className={cn('px-2 pt-1.5 pb-1 text-xs font-medium text-fg-subtle', className)}
      {...props}
    />
  )
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn('-mx-1.5 my-1.5 h-px bg-line', className)} {...props} />
}
