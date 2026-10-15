import { Check, Minus } from 'lucide-react'
import { Checkbox as Radix } from 'radix-ui'
import { cn } from '@/lib/cn'

// Radix Checkbox with an indeterminate state, for bulk selection (FE-1.2).
interface CheckboxProps {
  checked: boolean | 'indeterminate'
  onCheckedChange(checked: boolean): void
  label: string
  disabled?: boolean
  className?: string
}

export function Checkbox({ checked, onCheckedChange, label, disabled, className }: CheckboxProps) {
  return (
    <Radix.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-control bg-surface transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
        className,
      )}
    >
      <Radix.Indicator className="text-white">
        {checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </Radix.Indicator>
    </Radix.Root>
  )
}
