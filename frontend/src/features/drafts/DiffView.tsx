import { Fragment } from 'react'
import { diffWords } from '@/lib/drafts'
import { cn } from '@/lib/cn'

// Before / after of a proposed rewrite, word by word: removals struck through, additions underlined (FE-7.4).
// Source numbers show as small badges, as they do in the letter.
function Text({ text }: { text: string }) {
  return text.split(/(\[\d+\])/).map((piece, i) => {
    const n = /^\[(\d+)\]$/.exec(piece)?.[1]
    return n ? (
      <span
        key={i}
        className="mx-0.5 inline-flex h-[17px] min-w-[17px] -translate-y-px items-center justify-center rounded-[5px] bg-hover px-1 align-middle font-sans text-[10.5px] font-semibold text-fg-muted no-underline"
      >
        {n}
      </span>
    ) : (
      <Fragment key={i}>{piece}</Fragment>
    )
  })
}

export function DiffView({ before, after }: { before: string; after: string }) {
  return (
    <p className="font-serif text-[15px] leading-[1.8] text-fg">
      {diffWords(before, after).map((part, i) => {
        if (part.kind === 'same') return <Text key={i} text={part.text} />
        const word = part.text.trimEnd()
        return (
          <Fragment key={i}>
            <span
              className={cn(
                'rounded-[3px] px-0.5',
                part.kind === 'add'
                  ? 'bg-success-tint text-success underline decoration-success/50 underline-offset-[3px]'
                  : 'bg-danger-tint text-danger line-through decoration-danger/70',
              )}
            >
              <span className="sr-only">{part.kind === 'add' ? '[added: ' : '[removed: '}</span>
              <Text text={word} />
              <span className="sr-only">]</span>
            </span>
            {part.text.slice(word.length) || (part.kind === 'del' ? ' ' : '')}
          </Fragment>
        )
      })}
    </p>
  )
}
