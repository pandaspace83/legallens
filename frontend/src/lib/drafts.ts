import type { Draft } from '@/api/types'
import { parseInline, type Inline } from '@/lib/citations'

// Display helpers for a draft: the placeholder grammar (DEC-48), word diff and token actions. The citation
// checklist and the export gate are the server's to work out (GET /drafts/{id}/checks, INT-3.3); the mock's
// version of them is src/api/mock/draftChecks.ts.

// ---------- placeholder tokens ----------

export type TokenKind = 'placeholder' | 'cite_needed' | 'rule_needed' | 'unverified'

export interface DraftToken {
  kind: TokenKind
  /** What the token asks for, e.g. "DATE OF DISPUTE NOTICE" or "authority for X". */
  text: string
  /** The token exactly as written, so it can be replaced. */
  raw: string
}

// The same grammar as the backend's drafting/placeholders.py, so what the screen offers to resolve is what the
// server counts: [PLACEHOLDER: …], [CITE NEEDED: …], [RULE NEEDED: …], [UNVERIFIED: …] and all-caps slots.
const TOKEN =
  /\[(PLACEHOLDER|CITE NEEDED|RULE NEEDED|UNVERIFIED)(?::\s*([^\]]*))?\]|\[([A-Z][A-Z0-9’'&/. -]{2,40})\]/g
const KIND: Record<string, TokenKind> = {
  PLACEHOLDER: 'placeholder',
  'CITE NEEDED': 'cite_needed',
  'RULE NEEDED': 'rule_needed',
  UNVERIFIED: 'unverified',
}

export function findTokens(text: string): DraftToken[] {
  return [...text.matchAll(TOKEN)].map((m) =>
    m[1]
      ? { kind: KIND[m[1]] ?? 'placeholder', text: m[2] ?? '', raw: m[0] }
      : { kind: 'placeholder', text: m[3] ?? '', raw: m[0] },
  )
}

export type DraftInline = Inline | { kind: 'token'; token: DraftToken }

/** Text, bold, [n] citations and placeholder tokens, in order. */
export function parseDraftInline(text: string): DraftInline[] {
  const out: DraftInline[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push(...parseInline(text.slice(last, at)))
    out.push({ kind: 'token', token: findTokens(m[0])[0]! })
    last = at + m[0].length
  }
  if (last < text.length) out.push(...parseInline(text.slice(last)))
  return out
}

export function allTokens(draft: Pick<Draft, 'sections'>) {
  return draft.sections.flatMap((s) =>
    findTokens(s.body).map((token) => ({ token, sectionId: s.id })),
  )
}

/** The closing sentence the reservation-of-rights safeguard adds; the editor and the export share it. */
export function reservationOfRights(clientName: string) {
  return `Nothing in this letter waives any right or remedy of ${clientName}, all of which are expressly reserved.`
}

/** Text for the clean copy that goes to the other side: no source citations, no AI notes (DEC-50). */
export function cleanText(body: string) {
  return body.replace(/\s?\[\d+\]/g, '').replace(/ +([.,;:])/g, '$1')
}

// ---------- word diff for "Refine this section" (DEC-44) ----------

export type DiffPart = { kind: 'same' | 'add' | 'del'; text: string }

export function diffWords(before: string, after: string): DiffPart[] {
  // Words keep their trailing space, and are compared without it, so spacing never shows as a change.
  const words = (text: string) => text.split(/(?<=\s)(?=\S)/)
  const a = words(before)
  const b = words(after)
  const same = (x: string, y: string) => x.trimEnd() === y.trimEnd()
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] = same(a[i]!, b[j]!)
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)

  const out: DiffPart[] = []
  const push = (kind: DiffPart['kind'], text: string) => {
    const prev = out.at(-1)
    if (prev?.kind === kind) prev.text += text
    else out.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (same(a[i]!, b[j]!)) {
      // Keep whichever side has the space, so a removal or addition after it isn't run into it.
      push('same', b[j]!.length >= a[i]!.length ? b[j]! : a[i]!)
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push('del', a[i++]!)
    else push('add', b[j++]!)
  }
  while (i < a.length) push('del', a[i++]!)
  while (j < b.length) push('add', b[j++]!)
  return out
}

// ---------- resolving a token (DEC-48) ----------

export type TokenAction =
  | { type: 'fill'; value: string } // a placeholder: the missing fact
  | { type: 'source'; value: string } // [CITE NEEDED] / [RULE NEEDED]: the authority the lawyer relies on
  | { type: 'vouch' } // [UNVERIFIED]: the lawyer has checked it; it becomes "added by you"
  | { type: 'remove_sentence' } // [UNVERIFIED]: drop the sentence that relies on it
  | { type: 'drop_flag' } // [CITE NEEDED]: remove the flag, keep the sentence

const tidy = (text: string) =>
  text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:)])/g, '$1')
    .replace(/\( /g, '(')
    .trim()

export function applyTokenAction(body: string, token: DraftToken, action: TokenAction) {
  switch (action.type) {
    case 'fill':
      return tidy(body.replace(token.raw, action.value))
    case 'source':
      return tidy(body.replace(token.raw, `(${action.value})`))
    case 'vouch':
      return tidy(body.replace(token.raw, `(${token.text})`))
    case 'drop_flag':
      return tidy(body.replace(token.raw, ''))
    case 'remove_sentence': {
      // A sentence ends at . ! or ? followed by white space, so "1.5%" and "$2,169.00" stay whole. The token
      // is shielded first, because authorities such as "Cal. Civ. Code" contain full stops of their own.
      const mark = '\u0000'
      const parts = body.replace(token.raw, mark).split(/(?<=[.!?])(\s+)/)
      const kept: string[] = []
      for (let i = 0; i < parts.length; i += 2) {
        const after = parts[i + 1] ?? ''
        if (!parts[i]!.includes(mark)) kept.push(parts[i]!, after)
        // A removed sentence that ended a paragraph leaves the paragraph break in place.
        else if (after.includes('\n') && kept.length) kept[kept.length - 1] = after
      }
      return tidy(kept.join(''))
    }
  }
}

/** The authority an action adds to the checklist as "added by you", if any. */
export function addedBy(token: DraftToken, action: TokenAction) {
  if (action.type === 'source') return action.value
  if (action.type === 'vouch') return token.text
  return undefined
}
