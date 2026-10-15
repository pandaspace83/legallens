import { Fragment, type ReactNode } from 'react'
import type { Citation } from '@/api/types'
import { CitationChip } from '@/features/chat/CitationChip'
import { PlaceholderToken } from '@/features/drafts/PlaceholderToken'
import { parseDraftInline, type DraftToken, type TokenAction } from '@/lib/drafts'

// A draft section's text in letter type: paragraphs and lists, bold, source citations and tokens (FE-7.2).
interface DraftBodyProps {
  body: string
  citations: Citation[]
  onToken(token: DraftToken, action: TokenAction): void
  readOnly?: boolean
}

const LIST_ITEM = /^([-•]|\d+\.)\s/

export function DraftBody({ body, citations, onToken, readOnly }: DraftBodyProps) {
  const inline = (text: string): ReactNode =>
    parseDraftInline(text).map((part, i) => {
      if (part.kind === 'token') {
        return (
          <PlaceholderToken
            key={i}
            token={part.token}
            readOnly={readOnly}
            onResolve={(a) => onToken(part.token, a)}
          />
        )
      }
      if (part.kind === 'cite')
        return <CitationChip key={i} n={part.n} citation={citations.find((c) => c.n === part.n)} />
      if (part.kind === 'bold')
        return (
          <strong key={i} className="font-semibold">
            {part.text}
          </strong>
        )
      return <Fragment key={i}>{part.text}</Fragment>
    })

  const chunks = body
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean)
  return (
    <div className="space-y-3">
      {chunks.map((chunk, i) => {
        const lines = chunk.split('\n')
        if (lines.every((l) => LIST_ITEM.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(LIST_ITEM, ''))}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{inline(chunk)}</p>
      })}
    </div>
  )
}
