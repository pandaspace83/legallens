import { ToggleGroup } from 'radix-ui'
import { cn } from '@/lib/cn'

// A compact choice between a few options, e.g. who a document came from. Selecting is required, not toggled.
interface SegmentedProps<T extends string> {
  value: T | undefined
  onChange(value: T): void
  options: { value: T; label: string }[]
  label: string
  size?: 'sm' | 'md'
  invalid?: boolean
  disabled?: boolean
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  invalid,
  disabled,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value ?? ''}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'inline-flex shrink-0 rounded-control border border-line bg-hover p-0.5',
        invalid && 'ring-1 ring-warning/50',
      )}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'rounded-[6px] font-medium whitespace-nowrap text-fg-muted transition-[background-color,color,box-shadow] hover:text-fg data-[state=on]:bg-surface data-[state=on]:font-semibold data-[state=on]:text-primary data-[state=on]:shadow-[0_1px_2px_rgb(31_30_28/0.14),0_0_0_1px_rgb(31_30_28/0.08)]',
            size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-2.5 text-[12.5px]',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
