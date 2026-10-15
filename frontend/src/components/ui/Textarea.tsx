import { type ComponentProps, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

// Multi-line input that grows with its content up to a max height (FE-1.2).
export function Textarea({
  className,
  maxHeight = 240,
  value,
  ...props
}: ComponentProps<'textarea'> & { maxHeight?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [value, maxHeight])

  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      className={cn(
        'block w-full resize-none rounded-control border border-control bg-surface px-3 py-2 text-[13.5px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-primary disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}
