import { SEED_DOCUMENTS } from '@/api/mock/seed/documents'
import { SEED_PAGES } from '@/api/mock/seed/documentPages'
import type { Citation, DraftClaim, DraftSection, DraftType, ID } from '@/api/types'
import { findTokens } from '@/lib/drafts'

// Scripted drafts for the demo (FE-2.3): a response letter and a memo built from Acme's demand letter.
// They deliberately contain what the safeguards exist to catch: placeholders for facts the documents
// don't hold, a [CITE NEEDED], an [UNVERIFIED] authority flagged by the citation check, and two claims
// in the demand letter that the first draft does not answer (DEC-47, DEC-48).

type CiteRef = readonly [documentId: ID, page: number, anchor: string]

function citation(n: number, [documentId, page, anchor]: CiteRef, key: string): Citation {
  const block = SEED_PAGES.find((p) => p.documentId === documentId && p.page === page)?.blocks.find(
    (b) => b.anchor === anchor,
  )
  if (!block) throw new Error(`Draft cites a missing passage: ${documentId} p.${page} ${anchor}`)
  return {
    n,
    id: `cite-${key}-${n}`,
    documentId,
    documentName: SEED_DOCUMENTS.find((d) => d.id === documentId)?.name ?? documentId,
    page,
    para: anchor,
    quote: block.text,
    verified: true,
  }
}

const CITES: CiteRef[] = [
  ['doc-demand', 1, 'dl-1-1'],
  ['doc-msa', 9, '6.4'],
  ['doc-msa', 9, '6.3'],
  ['doc-demand', 1, 'dl-1-3'],
  ['doc-demand', 1, 'dl-1-4'],
  ['doc-demand', 1, 'dl-1-2'],
  ['doc-demand', 2, 'dl-2-1'],
  ['doc-demand', 2, 'dl-2-2'],
]

export function draftCitations(key: string) {
  return CITES.map((ref, i) => citation(i + 1, ref, key))
}

// ---------- the response letter ----------

const LETTER: DraftSection[] = [
  {
    id: 'opening',
    label: 'Opening',
    body: 'We represent Smith Logistics LLC in connection with the Master Services Agreement dated March 1, 2024 (the “Agreement”). We write in response to your letter of September 29, 2026 on behalf of Acme Corp [1].',
  },
  {
    id: 'invoices',
    label: 'The invoices',
    body: 'Smith disputes invoices INV-2207, INV-2231 and INV-2245. Section 6.4 of the Agreement allows Smith to withhold any amount it disputes in good faith, provided it gives written notice within fifteen days of receiving the invoice [2]. Smith gave that notice on [DATE OF DISPUTE NOTICE].',
  },
  {
    id: 'interest',
    label: 'Interest',
    body: 'Even if any amount were owed, the Agreement does not permit interest at 1.5% per month. Section 6.3 limits interest to the lesser of 1% per month or the maximum rate permitted by law, and only on undisputed amounts [3]. The $2,169.00 claimed in your letter [4] is therefore overstated. Statutory interest would not change this [UNVERIFIED: Cal. Civ. Code § 3289].',
  },
  {
    id: 'service',
    label: 'Acme’s performance',
    body: 'Your letter states that Acme performed its obligations in full [6]. It did not: Smith experienced repeated service failures from June through August 2026 [CITE NEEDED: Smith’s record of the June–August service failures], and is entitled to the service credits the Agreement provides.',
  },
  {
    id: 'position',
    label: 'Smith’s position',
    body: 'Smith will not pay the disputed amounts by October 20, 2026 [5] while the dispute is unresolved. Section 6.4 requires the parties to negotiate in good faith to resolve it within thirty days [2]. Smith proposes a call during the week of [PROPOSED WEEK] to begin those discussions.',
  },
  {
    id: 'closing',
    label: 'Closing',
    body: 'Please direct any further communication about this matter to me.',
  },
]

const LETTER_CLAIMS: Omit<DraftClaim, 'source'>[] = [
  {
    id: 'performed',
    text: 'Acme performed its obligations under the Agreement in full',
    addressedBy: 'service',
  },
  {
    id: 'unpaid',
    text: 'Smith failed to pay invoices INV-2207, INV-2231 and INV-2245',
    addressedBy: 'invoices',
  },
  {
    id: 'interest',
    text: 'Late payments accrue interest at 1.5% per month; $2,169.00 is owed',
    addressedBy: 'interest',
  },
  { id: 'demand', text: 'Pay $50,369.00 on or before October 20, 2026', addressedBy: 'position' },
  {
    id: 'lawsuit',
    text: 'A lawsuit and attorneys’ fees under Section 15.4 if not paid',
    addressedBy: null,
  },
  {
    id: 'noncompete',
    text: 'Rights reserved under the non-competition clause, Section 11.2',
    addressedBy: null,
  },
]

const CLAIM_SOURCE: Record<string, number> = {
  performed: 6,
  unpaid: 6,
  interest: 4,
  demand: 5,
  lawsuit: 7,
  noncompete: 8,
}

// ---------- the memo (DEC-45) ----------

const MEMO: DraftSection[] = [
  {
    id: 'question',
    label: 'Question presented',
    body: 'Can Acme recover interest at 1.5% per month on invoices INV-2207, INV-2231 and INV-2245?',
  },
  {
    id: 'brief',
    label: 'Brief answer',
    body: 'Not under the Agreement. Section 6.3 caps interest at 1% per month and applies only to undisputed amounts [3]. Whether California law separately limits contractual interest can’t be answered from this matter’s documents.',
  },
  {
    id: 'facts',
    label: 'Statement of facts',
    body: 'Acme’s counsel demands $48,200.00 for three invoices plus $2,169.00 in interest at 1.5% per month [4]. The Agreement lets Smith withhold amounts it disputes in good faith if it gives written notice within fifteen days of receiving an invoice [2].',
  },
  {
    id: 'rule',
    label: 'Discussion: rule',
    body: 'Under Section 6.3, interest accrues on undisputed late amounts at the lesser of 1% per month or the maximum legal rate [3]. [RULE NEEDED: California authority on limits to contractual interest rates]',
  },
  {
    id: 'application',
    label: 'Discussion: application',
    body: 'The 1.5% rate in Acme’s letter exceeds the Agreement’s cap [3][4]. If Smith’s dispute notice was timely, the invoices are not “undisputed” and Section 6.3 interest does not run at all [2]. Smith’s notice is dated [DATE OF DISPUTE NOTICE].',
  },
  {
    id: 'conclusion',
    label: 'Conclusion',
    body: 'Acme’s interest claim should be rejected to the extent it exceeds 1% per month, and entirely if Smith’s dispute notice was timely.',
  },
]

export function initialDraft(type: DraftType, key: string) {
  const citations = draftCitations(key)
  const claims: DraftClaim[] =
    type === 'response_letter'
      ? LETTER_CLAIMS.map((c) => ({ ...c, source: citations[(CLAIM_SOURCE[c.id] ?? 1) - 1]! }))
      : []
  return { sections: structuredClone(type === 'memo' ? MEMO : LETTER), citations, claims }
}

// ---------- "Refine this section" (DEC-44) and answering a missed claim (DEC-47) ----------

const FIRMER: Record<string, string> = {
  invoices:
    'Smith rejects Acme’s demand for payment of invoices INV-2207, INV-2231 and INV-2245. Section 6.4 of the Agreement entitles Smith to withhold any amount it disputes in good faith once it gives written notice within fifteen days [2], and Smith did so on [DATE OF DISPUTE NOTICE]. Nothing is due on these invoices while the dispute stands.',
  interest:
    'Acme’s claim to interest at 1.5% per month has no basis in the Agreement. Section 6.3 caps interest at the lesser of 1% per month or the legal maximum, and only on undisputed amounts [3]. The $2,169.00 in your letter [4] must be withdrawn.',
  service:
    'Acme did not perform its obligations in full [6]. Smith suffered repeated service failures from June through August 2026 [CITE NEEDED: Smith’s record of the June–August service failures], and Acme owes Smith the service credits the Agreement provides.',
  position:
    'Smith will not pay any disputed amount by October 20, 2026 [5] or at all until the dispute is resolved. Section 6.4 obliges both parties to negotiate in good faith within thirty days [2]; Smith expects Acme to do so, and is available during the week of [PROPOSED WEEK].',
}

const SHORTER: Record<string, string> = {
  invoices:
    'Smith disputes invoices INV-2207, INV-2231 and INV-2245 and gave written notice on [DATE OF DISPUTE NOTICE], as Section 6.4 allows [2].',
  interest:
    'Section 6.3 caps interest at 1% per month, and only on undisputed amounts [3]; the $2,169.00 claimed [4] is overstated.',
  service:
    'Acme did not perform in full [6]: service failed repeatedly from June through August 2026 [CITE NEEDED: Smith’s record of the June–August service failures].',
  position:
    'Smith will not pay the disputed amounts while the dispute is open [5]. Under Section 6.4 [2], Smith proposes a call during the week of [PROPOSED WEEK].',
}

// Sections without a scripted rewrite get a light, rule-based one, so "Refine" works everywhere in the demo.
const FIRM_WORDS: [RegExp, string][] = [
  [/\bdoes not accept\b/g, 'rejects'],
  [/\bwould be premature\b/g, 'is premature'],
  [/\bshould be rejected\b/g, 'must be rejected'],
  [/\bwould not\b/g, 'does not'],
  [/\bPlease direct\b/g, 'Direct'],
  [/\bcan’t\b/g, 'cannot'],
]

function genericRewrite(body: string, shorter: boolean) {
  if (!shorter) return FIRM_WORDS.reduce((text, [from, to]) => text.replace(from, to), body)
  // Shorter: keep the first sentence and every sentence that carries a citation or a flag.
  const sentences = body.split(/(?<=[.!?])\s+/)
  return sentences.filter((s, i) => i === 0 || /\[\d+\]|\[[A-Z]/.test(s)).join(' ')
}

/** What the lawyer filled in or resolved in a section survives a rewrite of it (DEC-44). */
function carryOver(original: string, current: string, rewritten: string) {
  let out = rewritten
  for (const token of findTokens(rewritten)) {
    if (current.includes(token.raw)) continue
    const at = original.indexOf(token.raw)
    if (at === -1) continue
    const before = original.slice(Math.max(0, at - 20), at).trim()
    const after = original.slice(at + token.raw.length, at + token.raw.length + 12).trim()
    const b = current.indexOf(before)
    if (b === -1) continue
    const start = b + before.length
    const end = after ? current.indexOf(after, start) : current.length
    if (end === -1) continue
    out = out.replace(token.raw, current.slice(start, end).trim())
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:)])/g, '$1')
}

export function rewriteSection(type: DraftType, section: DraftSection, instruction: string) {
  const shorter = /short|concise|brief|trim/i.test(instruction)
  const scripted = (shorter ? SHORTER : FIRMER)[section.id]
  const original = (type === 'memo' ? MEMO : LETTER).find((s) => s.id === section.id)?.body
  if (scripted && original) return carryOver(original, section.body, scripted)
  const generic = genericRewrite(section.body, shorter)
  if (generic === section.body) {
    throw new Error(
      'LegalLens couldn’t improve this section with that instruction. Try other wording, or edit it yourself.',
    )
  }
  return generic
}

const CLAIM_RESPONSES: Record<string, DraftSection> = {
  lawsuit: {
    id: 'lawsuit',
    label: 'Threatened lawsuit',
    body: 'A lawsuit would be premature while the parties’ obligation to negotiate under Section 6.4 is unmet [2]. Smith also does not accept that Acme could recover its fees under Section 15.4 [7] [CITE NEEDED: the text of Section 15.4 of the Agreement].',
  },
  noncompete: {
    id: 'noncompete',
    label: 'Non-competition',
    body: 'Smith denies any breach of Section 11.2 [8] and does not accept that the restriction is enforceable. [CITE NEEDED: authority on the enforceability of the restriction]',
  },
}

export function claimResponse(claimId: ID) {
  return CLAIM_RESPONSES[claimId]
}
