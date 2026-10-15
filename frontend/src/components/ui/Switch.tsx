import { Switch as Radix } from 'radix-ui'
import { cn } from '@/lib/cn'

// Radix Switch for on/off settings such as the FRE 408 header (FE-1.2).
interface SwitchProps {
  checked: boolean
  onCheckedChange(checked: boolean): void
  label: string
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onCheckedChange, label, disabled, className }: SwitchProps) {
  return (
    <Radix.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-control bg-hover transition-colors disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        className,
      )}
    >
      <Radix.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-surface shadow-raised transition-transform data-[state=checked]:translate-x-[18px]" />
    </Radix.Root>
  )
}
