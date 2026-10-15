import { Fragment, type ReactNode } from 'react'
import type { Citation } from '@/api/types'
import { CitationChip } from '@/features/chat/CitationChip'
import { parseAnswer, type Inline } from '@/lib/citations'

// Renders answer text in reading serif: paragraphs, lists, bold and citation chips. No raw HTML.
function Parts({
  parts,
  citations,
  pending,
}: {
  parts: Inline[]
  citations: Citation[]
  pending?: boolean
}) {
  // A citation stays on the line of the word before it and takes the punctuation after it,
  // so a chip never starts a line and a full stop is never left alone.
  const out: ReactNode[] = []
  const rest = parts.map((p) => ({ ...p }))
  rest.forEach((part, i) => {
    const next = rest[i + 1]
    if (part.kind === 'bold') {
      out.push(
        <strong key={i} className="font-semibold">
          {part.text}
        </strong>,
      )
    } else if (part.kind === 'text') {
      if (next?.kind !== 'cite') return void out.push(<Fragment key={i}>{part.text}</Fragment>)
      const lead = /(\S+)\s*$/.exec(part.text)
      out.push(
        <Fragment key={i}>{lead ? part.text.slice(0, lead.index) : part.text.trimEnd()}</Fragment>,
      )
      ;(next as Inline & { lead?: string }).lead = lead?.[1] ?? ''
    } else {
      let tail = ''
      if (next?.kind === 'text') {
        tail = /^[.,;:)\]]+/.exec(next.text)?.[0] ?? ''
        next.text = next.text.slice(tail.length)
      }
      out.push(
        <span key={i} className="whitespace-nowrap">
          {(part as Inline & { lead?: string }).lead}
          {/* U+2060 word joiner: no line break between the previous word (even a bold one) and the chip. */}
          {'\u2060'}
          <CitationChip
            n={part.n}
            citation={citations.find((c) => c.n === part.n)}
            pending={pending}
          />
          {tail}
        </span>,
      )
    }
  })
  return <>{out}</>
}

const Caret = () => (
  <span
    aria-hidden
    className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-caret bg-primary"
  />
)

export function AnswerBody({
  text,
  citations,
  streaming,
  size = 'answer',
}: {
  text: string
  citations: Citation[]
  streaming?: boolean
  /** 'compact' for side panels such as a summary. */
  size?: 'answer' | 'compact'
}) {
  const blocks = parseAnswer(text)
  const last = blocks.length - 1

  return (
    <div
      className={
        size === 'compact'
          ? 'space-y-3 font-serif text-[15px] leading-[1.7] text-fg'
          : 'space-y-4 font-serif text-[16.5px] leading-[1.75] text-fg'
      }
    >
      {blocks.map((block, i) => {
        const caret = streaming && i === last ? <Caret /> : null
        if (block.kind === 'p') {
          return (
            <p key={i}>
              <Parts parts={block.parts} citations={citations} pending={streaming} />
              {caret}
            </p>
          )
        }
        const List = block.kind === 'ol' ? 'ol' : 'ul'
        return (
          <List
            key={i}
            className={`space-y-2 pl-6 marker:text-fg-subtle ${block.kind === 'ol' ? 'list-decimal' : 'list-disc'}`}
          >
            {block.items.map((item, j) => (
              <li key={j} className="pl-1">
                <Parts parts={item} citations={citations} pending={streaming} />
                {j === block.items.length - 1 ? caret : null}
              </li>
            ))}
          </List>
        )
      })}
      {streaming && !blocks.length ? <Caret /> : null}
    </div>
  )
}
