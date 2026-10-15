import { SEED_DOCUMENTS } from '@/api/mock/seed/documents'
import { SEED_PAGES } from '@/api/mock/seed/documentPages'
import type {
  AnswerState,
  Citation,
  DraftType,
  ID,
  SearchedInfo,
  SummaryAudience,
  SummaryTemplate,
} from '@/api/types'
import { AUDIENCE_LABELS, TEMPLATE_LABELS } from '@/lib/summaries'

// Scripted answers that stand in for the RAG pipeline (FE-2.4). A question is matched by keywords; anything
// unmatched gets an honest "Not found in your documents". Citation quotes are read from the seeded pages,
// so a citation always matches the passage the viewer highlights.

type CiteRef = readonly [documentId: ID, page: number, anchor: string]

interface AnswerScript {
  id: string
  match: RegExp
  title: string
  rewritten: string
  state: AnswerState
  outsideLaw?: boolean
  text: string
  cites: CiteRef[]
}

export interface ScriptedAnswer {
  title: string
  state: AnswerState
  outsideLaw: boolean
  text: string
  citations: Citation[]
  searched: SearchedInfo
}

const SCRIPTS: AnswerScript[] = [
  {
    id: 'email-notice',
    match: /\bemail\b/i,
    title: 'Does email count as notice?',
    rewritten: 'Is notice sent by email valid under the Smith MSA v3?',
    state: 'found',
    text:
      'No. Notices must be delivered **by hand, by overnight courier, or by certified mail** to the address in Schedule 2. A copy sent by email is a courtesy only and does not count as notice [1].\n\n' +
      'A notice takes effect when it is received, or when delivery is refused, as shown by the courier’s or postal service’s records [2].',
    cites: [
      ['doc-msa', 28, '14.1'],
      ['doc-msa', 28, '14.2'],
    ],
  },
  {
    id: 'termination',
    match: /terminat|end the (msa|agreement|contract)|cancel/i,
    title: 'Termination notice in the MSA',
    rewritten:
      'What notice is required to terminate the Smith MSA v3, for convenience and for cause?',
    state: 'found',
    text:
      'Either party may end the Agreement for convenience by giving **sixty (60) days’ written notice** to the other party [1]. Termination for cause can be quicker: if a party materially breaches the Agreement and doesn’t cure it within **thirty (30) days** of written notice, the other party may terminate [2].\n\n' +
      'The notice must be delivered by hand, courier or certified mail; email counts only as a courtesy copy [3]. Notices to Acme go to its General Counsel at 500 Harbor Boulevard, Oakland [4].',
    cites: [
      ['doc-msa', 6, '4.2(a)'],
      ['doc-msa', 6, '4.2(c)'],
      ['doc-msa', 28, '14.1'],
      ['doc-msa', 31, 'sch2-provider'],
    ],
  },
  {
    id: 'demand-summary',
    match: /summar|overview|demand letter/i,
    title: 'Summary of Acme’s demand letter',
    rewritten: 'Summarize the demand letter from Whitfield & Crane LLP dated September 29, 2026.',
    state: 'found',
    text:
      '**Who is asking.** Whitfield & Crane LLP, on behalf of Acme Corp [1].\n\n' +
      '**What they want.** $48,200.00 for three unpaid invoices, plus $2,169.00 in interest at 1.5% per month [2].\n\n' +
      '**By when.** Payment of $50,369.00 on or before **October 20, 2026** [3].\n\n' +
      '**What they threaten.** A complaint in San Francisco Superior Court and a claim for attorneys’ fees under Section 15.4 [4].\n\n' +
      '**Also raised.** A reservation of rights over the non-competition clause in Section 11.2 [5].',
    cites: [
      ['doc-demand', 1, 'dl-1-1'],
      ['doc-demand', 1, 'dl-1-3'],
      ['doc-demand', 1, 'dl-1-4'],
      ['doc-demand', 2, 'dl-2-1'],
      ['doc-demand', 2, 'dl-2-2'],
    ],
  },
  {
    id: 'late-fee',
    match: /\blate\b|\binterest\b|\binvoices?\b|\bowe\b|1\.5\s*%/i,
    title: 'Late fee claimed vs. the MSA',
    rewritten:
      'Compare the interest claimed in Acme’s demand letter with the late-payment terms of the MSA.',
    state: 'partial',
    text:
      'The demand letter claims **$48,200.00** in unpaid invoices plus interest at **1.5% per month** [1]. The MSA sets a lower rate: late payments accrue interest at the lesser of **1% per month** or the legal maximum [2].\n\n' +
      'The MSA also lets Smith withhold an amount it disputes in good faith, if it gave written notice within 15 days of receiving the invoice [3]. Whether Smith sent that notice for these three invoices is not shown in your documents.',
    cites: [
      ['doc-demand', 1, 'dl-1-3'],
      ['doc-msa', 9, '6.3'],
      ['doc-msa', 9, '6.4'],
    ],
  },
  {
    id: 'non-compete',
    match: /non-?compet|enforce|restrictive covenant|california law/i,
    title: 'Is the non-compete enforceable?',
    rewritten:
      'Is the non-competition clause in Section 11.2 of the Smith MSA v3 enforceable in California?',
    state: 'partial',
    outsideLaw: true,
    text:
      'Section 11.2 bars Smith from running or serving a competing freight-routing business in California during the term and for **two (2) years** after it ends [1]. Acme’s demand letter reserves its rights under that clause and refers to a competing vendor Smith recently engaged [2].\n\n' +
      'Whether a California court would enforce this restriction depends on California law, which isn’t in this matter’s documents.',
    cites: [
      ['doc-msa', 20, '11.2'],
      ['doc-demand', 2, 'dl-2-2'],
    ],
  },
  {
    id: 'liability-cap',
    match: /liabil|\bcap\b|\bdamages\b|indemn/i,
    title: 'Liability cap under section 9',
    rewritten: 'What limits on liability apply under Section 9 of the Smith MSA v3?',
    state: 'found',
    text:
      'Each party’s total liability is capped at the **fees paid or payable in the twelve (12) months** before the event that gave rise to the claim [1]. The cap does not apply to unpaid undisputed fees, indemnification obligations, or gross negligence and willful misconduct [2].\n\n' +
      'Neither party can recover lost profits or other indirect or consequential damages [3].',
    cites: [
      ['doc-msa', 18, '9.2'],
      ['doc-msa', 18, '9.3'],
      ['doc-msa', 18, '9.1'],
    ],
  },
  {
    id: 'deadlines',
    match: /deadline|key dates|due date|by when/i,
    title: 'Key dates and deadlines',
    rewritten: 'List every deadline and time period in the matter’s documents.',
    state: 'found',
    text:
      'Four deadlines appear in your documents:\n\n' +
      '1. **October 20, 2026.** Acme’s deadline for payment of $50,369.00 [1].\n' +
      '2. **15 days after receiving an invoice.** Smith’s window to dispute an invoice in writing [2].\n' +
      '3. **30 days after notice of a material breach.** The cure period before termination for cause [3].\n' +
      '4. **60 days.** The notice period for termination for convenience [4].',
    cites: [
      ['doc-demand', 1, 'dl-1-4'],
      ['doc-msa', 9, '6.4'],
      ['doc-msa', 6, '4.2(c)'],
      ['doc-msa', 6, '4.2(a)'],
    ],
  },
]

const NOT_FOUND_TEXT =
  'Nothing in this matter’s documents answers this question. If the answer is in a document that isn’t uploaded yet, add it and ask again.'

function quoteFor(documentId: ID, page: number, anchor: string) {
  const block = SEED_PAGES.find((p) => p.documentId === documentId && p.page === page)?.blocks.find(
    (b) => b.anchor === anchor,
  )
  if (!block)
    throw new Error(`Seed citation points at a missing passage: ${documentId} p.${page} ${anchor}`)
  return block.text
}

function citation(n: number, [documentId, page, anchor]: CiteRef, key: string): Citation {
  const doc = SEED_DOCUMENTS.find((d) => d.id === documentId)
  return {
    n,
    id: `cite-${key}-${n}`,
    documentId,
    documentName: doc?.name ?? documentId,
    page,
    para: anchor,
    quote: quoteFor(documentId, page, anchor),
    verified: true,
  }
}

function readyDocumentCount(matterId: ID) {
  return SEED_DOCUMENTS.filter((d) => d.matterId === matterId && d.status === 'ready').length
}

export function titleFromQuestion(question: string) {
  const words = question
    .replace(/[?.!]+$/, '')
    .split(/\s+/)
    .slice(0, 7)
    .join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Answer a question for a matter. `key` makes citation IDs unique per message. */
export function answerFor(matterId: ID, question: string, key: string): ScriptedAnswer {
  const docs = readyDocumentCount(matterId)
  const scopeLabel = `All ${docs} documents in this matter`
  const script = matterId === 'smith' ? SCRIPTS.find((s) => s.match.test(question)) : undefined

  if (!script) {
    return {
      title: titleFromQuestion(question),
      state: 'not_found',
      outsideLaw: false,
      text: NOT_FOUND_TEXT,
      citations: [],
      searched: {
        scopeLabel,
        rewrittenQuestion: question,
        documentsSearched: docs,
        passagesReviewed: 40,
      },
    }
  }

  return {
    title: script.title,
    state: script.state,
    outsideLaw: script.outsideLaw ?? false,
    text: script.text,
    citations: script.cites.map((ref, i) => citation(i + 1, ref, key)),
    searched: {
      scopeLabel,
      rewrittenQuestion: script.rewritten,
      documentsSearched: docs,
      passagesReviewed: 50,
    },
  }
}

/** The chat reply when a turn starts a summary job. */
export function SUMMARY_STARTED(
  documentName: string,
  template: SummaryTemplate,
  audience: SummaryAudience,
) {
  return `Summarizing **${documentName}** with the “${TEMPLATE_LABELS[template]}” template, as a ${AUDIENCE_LABELS[audience].charAt(0).toLowerCase()}${AUDIENCE_LABELS[audience].slice(1)}. Every page is read in order, so nothing is skipped. It runs in the background; keep working and open it when it’s ready.`
}

export const CLARIFY_WHICH_DOCUMENT =
  'Which document should be summarized? Choose it under **Search in → One document** below, or name it in your request (for example, “Summarize the demand letter”).'

/** The chat reply when a turn starts a draft job (DEC-43). */
export function DRAFT_STARTED(type: DraftType, documentName: string) {
  return type === 'memo'
    ? `Drafting a legal memo from **${documentName}**. It states law only from authority you uploaded; anything else is marked [RULE NEEDED] for you to supply. It runs in the background.`
    : `Drafting a response to **${documentName}**, following your instructions. Every claim in the letter is listed and checked against the draft, missing facts become placeholders, and nothing is sent: you review it, then export it yourself. It runs in the background.`
}

export const CLARIFY_WHICH_INCOMING =
  'Which document are you responding to? Choose it under **Search in → One document** below, or name it (for example, “Draft a reply to the demand letter”). This demo drafts replies to the Whitfield & Crane demand letter.'
