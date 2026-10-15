import type { Authority, Draft, DraftChecks } from '@/api/types'
import { COPY } from '@/lib/copy'
import { allTokens } from '@/lib/drafts'

// What the real backend works out at GET /drafts/{id}/checks, for the mock (INT-3.3): the citation checklist
// (DEC-49) and the export gate (DEC-47, DEC-50, DEC-51). Screens never compute these themselves.

/**
 * Every legal authority in the draft (cases, statutes, rules, regulations), with its checklist status.
 * Contract clauses and letters the draft quotes are evidence, not authority: they keep their source
 * citations in the text but are not checklist rows (integration decision 1, approved 2026-10-10). Rows for
 * uploaded authority ("Full text uploaded") come from the server's checks once the backend is connected.
 */
export function deriveAuthorities(
  draft: Pick<Draft, 'sections' | 'citations' | 'addedAuthorities'>,
): Authority[] {
  const rows: Authority[] = []
  for (const { token } of allTokens(draft)) {
    if (token.kind !== 'unverified') continue
    rows.push({
      key: `unverified:${token.text}`,
      label: token.text,
      status: 'not_uploaded',
      unverified: true,
      detail:
        'Not in any uploaded document. Ticking it says you have checked it yourself; or remove the sentence.',
    })
  }
  for (const label of draft.addedAuthorities) {
    rows.push({
      key: `added:${label}`,
      label,
      status: 'added_by_lawyer',
      detail: 'You named this source. LegalLens hasn’t read it, so it can’t check what it says.',
    })
  }
  return rows
}

// ---------- export gate (DEC-47, DEC-49, DEC-50, DEC-51) ----------

export interface Blocker {
  key: 'tokens' | 'claims' | 'authorities' | 'review'
  message: string
}

export function exportBlockers(draft: Draft): Blocker[] {
  const blockers: Blocker[] = []
  // An [UNVERIFIED] token stops blocking once the lawyer ticks its row: the tick is the vouch (INT-3.3).
  const tokens = allTokens(draft).filter(
    ({ token }) =>
      !(token.kind === 'unverified' && draft.acknowledged.includes(`unverified:${token.text}`)),
  ).length
  if (tokens)
    blockers.push({
      key: 'tokens',
      message: `${tokens} ${tokens === 1 ? 'placeholder or flag' : 'placeholders or flags'} to resolve in the letter`,
    })
  const unanswered = draft.claims.filter((c) => !c.addressedBy && !c.waived).length
  if (unanswered)
    blockers.push({
      key: 'claims',
      message: `${unanswered} ${unanswered === 1 ? 'claim' : 'claims'} in the incoming letter not answered or set aside`,
    })
  const pending = deriveAuthorities(draft).filter((a) => !draft.acknowledged.includes(a.key)).length
  if (pending)
    blockers.push({
      key: 'authorities',
      message: `${pending} ${pending === 1 ? 'citation' : 'citations'} to acknowledge in the checklist`,
    })
  if (draft.status !== 'reviewed_adopted')
    blockers.push({ key: 'review', message: `Mark the draft “${COPY.draftAdopted}”` })
  return blockers
}

export function computeChecks(draft: Draft): DraftChecks {
  const blockers = exportBlockers(draft)
  return {
    version: draft.version,
    authorities: deriveAuthorities(draft).map((a) => ({
      ...a,
      acknowledged: draft.acknowledged.includes(a.key),
    })),
    blockers,
    cleanAllowed: !blockers.length,
  }
}
