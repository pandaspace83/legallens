import { ChevronDown } from 'lucide-react'
import { type ComponentProps, useId } from 'react'
import { cn } from '@/lib/cn'

// A native select styled to the design tokens, with a label (FE-1.2). Native keeps keyboard, screen reader and
// mobile behaviour for free.
interface SelectProps extends Omit<ComponentProps<'select'>, 'children'> {
  label: string
  options: { value: string; label: string }[]
}

export function Select({ label, options, className, id, ...props }: SelectProps) {
  const generated = useId()
  const selectId = id ?? generated
  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'h-10 w-full appearance-none rounded-control border border-control bg-surface pr-9 pl-3 text-[14px] text-fg outline-none focus:border-primary',
            className,
          )}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-muted"
          aria-hidden
        />
      </div>
    </div>
  )
}
