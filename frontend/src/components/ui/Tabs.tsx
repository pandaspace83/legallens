import { Tabs as Radix } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

// Radix Tabs with an underline style, for the draft panel's Letter and Checks (FE-1.2).
export const Tabs = Radix.Root
export const TabsContent = Radix.Content

export function TabsList({ className, ...props }: ComponentProps<typeof Radix.List>) {
  return <Radix.List className={cn('flex gap-5 border-b border-line', className)} {...props} />
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof Radix.Trigger>) {
  return (
    <Radix.Trigger
      className={cn(
        '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent text-[13px] font-medium text-fg-muted transition-colors hover:text-fg data-[state=active]:border-primary data-[state=active]:text-fg',
        className,
      )}
      {...props}
    />
  )
}
