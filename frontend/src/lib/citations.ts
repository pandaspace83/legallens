// Turns answer text into blocks (paragraphs and lists) and inline parts (text, bold, [n] citations).
// Never produces HTML, so document or model text can't inject markup (FRONTEND_TODO.md §5).

export type Inline =
  { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'cite'; n: number }

export type Block =
  | { kind: 'p'; parts: Inline[] }
  | { kind: 'ol'; items: Inline[][] }
  | { kind: 'ul'; items: Inline[][] }

const INLINE = /(\*\*[^*]+\*\*|\[\d+\])/g

export function parseInline(text: string): Inline[] {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((token): Inline => {
      if (token.startsWith('**') && token.endsWith('**') && token.length > 4)
        return { kind: 'bold', text: token.slice(2, -2) }
      const cite = /^\[(\d+)\]$/.exec(token)
      if (cite) return { kind: 'cite', n: Number(cite[1]) }
      // A half-streamed "**" is hidden until its closing pair arrives.
      return { kind: 'text', text: token.replace(/\*\*/g, '') }
    })
}

export function parseAnswer(text: string): Block[] {
  return text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): Block => {
      const lines = chunk.split('\n')
      if (lines.every((l) => /^\d+\.\s/.test(l)))
        return { kind: 'ol', items: lines.map((l) => parseInline(l.replace(/^\d+\.\s/, ''))) }
      if (lines.every((l) => /^[-•]\s/.test(l)))
        return { kind: 'ul', items: lines.map((l) => parseInline(l.replace(/^[-•]\s/, ''))) }
      return { kind: 'p', parts: parseInline(chunk) }
    })
}

/**
 * How a passage anchor reads in a citation: contract sections as §4.2(a), letter paragraphs as ¶3,
 * schedules as Sch. 2. Anchors themselves stay as stored, for navigation.
 */
export function pinpoint(anchor: string) {
  if (/^\d/.test(anchor)) return `§${anchor}`
  const schedule = /^sch(\d+)/.exec(anchor)
  if (schedule) return `Sch. ${schedule[1]}`
  const paragraph = /^dl-\d+-(\d+)$/.exec(anchor)
  if (paragraph) return `¶${paragraph[1]}`
  return anchor
}

/** How a citation is announced, wherever it appears: "Source 1: Smith MSA, page 12, §4.2(a)" (§6). */
export function citationLabel(c: { n: number; documentName: string; page: number; para: string }) {
  return `Source ${c.n}: ${c.documentName}, page ${c.page}, ${pinpoint(c.para)}`
}

/** Plain text with citations written out, for Copy. */
export function answerToPlainText(
  text: string,
  citations: { n: number; documentName: string; page: number; para: string }[],
) {
  const body = text.replace(/\*\*/g, '')
  if (!citations.length) return body
  const sources = citations
    .map((c) => `[${c.n}] ${c.documentName}, page ${c.page}, ${pinpoint(c.para)}`)
    .join('\n')
  return `${body}\n\nSources\n${sources}`
}
