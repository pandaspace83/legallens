import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

// Six-box code input with paste, auto-advance and backspace handling (FE-3.1).
interface OtpInputProps {
  value: string
  onChange(value: string): void
  invalid?: boolean
  disabled?: boolean
}

export function OtpInput({ value, onChange, invalid, disabled }: OtpInputProps) {
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '')

  const setAt = (index: number, digit: string) => {
    const next = digits.slice()
    next[index] = digit
    onChange(next.join('').slice(0, 6))
  }

  const onInput = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    if (!digit) return
    setAt(index, digit)
    boxes.current[index + 1]?.focus()
  }

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[index]) setAt(index, '')
      else if (index > 0) {
        setAt(index - 1, '')
        boxes.current[index - 1]?.focus()
      }
    }
    if (e.key === 'ArrowLeft') boxes.current[index - 1]?.focus()
    if (e.key === 'ArrowRight') boxes.current[index + 1]?.focus()
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    e.preventDefault()
    onChange(pasted)
    boxes.current[Math.min(pasted.length, 5)]?.focus()
  }

  return (
    <div role="group" aria-label="Verification code" className="flex gap-2.5">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          autoFocus={i === 0}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            'h-14 w-full min-w-0 rounded-control border bg-surface text-center font-serif text-[24px] text-fg transition-[border-color,box-shadow] outline-none focus:border-primary focus:shadow-[0_0_0_4px_rgb(30_58_95/0.1)] disabled:opacity-60',
            invalid ? 'border-danger' : 'border-control',
          )}
        />
      ))}
    </div>
  )
}
