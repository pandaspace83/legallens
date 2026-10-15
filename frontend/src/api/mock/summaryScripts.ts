import { SEED_DOCUMENTS } from '@/api/mock/seed/documents'
import { SEED_PAGES } from '@/api/mock/seed/documentPages'
import type { Citation, ID, SummaryAudience, SummarySection, SummaryTemplate } from '@/api/types'
import { TEMPLATE_FIELDS, TEMPLATE_LABELS } from '@/lib/summaries'

// Scripted summaries for the documents that have page text (FE-2.3). A template that doesn't fit the
// document yields every field as "Not found in this document" plus a note, never invented content.

type CiteRef = readonly [documentId: ID, page: number, anchor: string]
interface Script {
  sections: Record<string, string | null>
  cites: CiteRef[]
}

const D = 'doc-demand'
const R = 'doc-acme-resp'

const SCRIPTS: Record<ID, Partial<Record<SummaryTemplate, Record<SummaryAudience, Script>>>> = {
  [D]: {
    letter_demand: {
      detailed: {
        sections: {
          who: 'Whitfield & Crane LLP, on behalf of Acme Corp, about the Master Services Agreement dated March 1, 2024 [1].',
          what: 'Payment of **$50,369.00**: $48,200.00 for invoices INV-2207, INV-2231 and INV-2245, plus $2,169.00 in interest at 1.5% per month [2][3].',
          deadline: '**October 20, 2026**, 21 days after the date of the letter [3].',
          claims:
            '- Acme says it performed its obligations under the Agreement in full [4].\n- Smith failed to pay the three invoices despite repeated requests [4].\n- Late payments accrue interest at 1.5% per month under the Agreement [2].',
          threats:
            'A complaint in the Superior Court of California, San Francisco County, filed without further notice, and a claim for attorneys’ fees and costs under Section 15.4 [5].',
          other:
            'Acme reserves its rights under the non-competition clause in Section 11.2 and refers to a competing freight-routing vendor Smith recently engaged [6].',
        },
        cites: [
          [D, 1, 'dl-1-1'],
          [D, 1, 'dl-1-3'],
          [D, 1, 'dl-1-4'],
          [D, 1, 'dl-1-2'],
          [D, 2, 'dl-2-1'],
          [D, 2, 'dl-2-2'],
        ],
      },
      one_paragraph: {
        sections: {
          summary:
            'Whitfield & Crane LLP, for Acme Corp, demands **$50,369.00** by **October 20, 2026**: $48,200.00 for three unpaid invoices plus interest at 1.5% a month [1][2]. If it isn’t paid, Acme says it will sue in San Francisco Superior Court and seek its attorneys’ fees [3], and it reserves its rights under the Agreement’s non-compete clause [4].',
        },
        cites: [
          [D, 1, 'dl-1-3'],
          [D, 1, 'dl-1-4'],
          [D, 2, 'dl-2-1'],
          [D, 2, 'dl-2-2'],
        ],
      },
      plain_english: {
        sections: {
          who: 'A law firm, Whitfield & Crane, wrote to Smith Logistics on behalf of Acme Corp [1].',
          what: 'Acme says Smith owes **$48,200** for three unpaid invoices, plus **$2,169** in interest: **$50,369** in total [2][3].',
          deadline: 'Acme wants to be paid by **October 20, 2026** [3].',
          claims:
            '- Acme says it did all the work the contract required [4].\n- Acme says Smith didn’t pay, even after being asked several times [4].',
          threats:
            'If it isn’t paid by then, Acme says it will file a lawsuit and ask Smith to pay its legal fees too [5].',
          other:
            'Acme also suggests Smith may have broken a promise in the contract not to work with a competitor in California [6].',
        },
        cites: [
          [D, 1, 'dl-1-1'],
          [D, 1, 'dl-1-3'],
          [D, 1, 'dl-1-4'],
          [D, 1, 'dl-1-2'],
          [D, 2, 'dl-2-1'],
          [D, 2, 'dl-2-2'],
        ],
      },
    },
  },
  [R]: {
    letter_demand: {
      detailed: {
        sections: {
          who: 'Acme Corp, responding to Smith Logistics LLC’s letter of September 12, 2026 about service availability [1].',
          what: 'Payment in full of invoices INV-2207, INV-2231 and INV-2245 [2].',
          deadline: null,
          claims:
            '- Monthly availability was 99.2% in June, 99.4% in July and 99.1% in August [3].\n- Each month was above the 99.0% commitment in Schedule 1 of the Agreement [3].\n- So no service credits are owed for the period [2].',
          threats: null,
          other: null,
        },
        cites: [
          [R, 1, 'ar-1-1'],
          [R, 1, 'ar-1-3'],
          [R, 1, 'ar-1-2'],
        ],
      },
      one_paragraph: {
        sections: {
          summary:
            'Acme rejects Smith’s September 12 complaint about service levels [1]. It says availability was 99.2%, 99.4% and 99.1% from June to August, above the 99.0% commitment [2], so no credits are owed and the three invoices remain due in full [3]. The letter sets no deadline and makes no threat.',
        },
        cites: [
          [R, 1, 'ar-1-1'],
          [R, 1, 'ar-1-2'],
          [R, 1, 'ar-1-3'],
        ],
      },
      plain_english: {
        sections: {
          who: 'Acme Corp replied to Smith’s complaint about service outages [1].',
          what: 'Acme wants the three invoices paid in full [2].',
          deadline: null,
          claims:
            '- Acme says its service was up more than 99% of the time each month from June to August [3].\n- Because that beats the 99% promised in the contract, Acme says it owes Smith no credits [3].',
          threats: null,
          other: null,
        },
        cites: [
          [R, 1, 'ar-1-1'],
          [R, 1, 'ar-1-3'],
          [R, 1, 'ar-1-2'],
        ],
      },
    },
  },
}

function citation(n: number, [documentId, page, anchor]: CiteRef, key: string): Citation {
  const block = SEED_PAGES.find((p) => p.documentId === documentId && p.page === page)?.blocks.find(
    (b) => b.anchor === anchor,
  )
  if (!block) throw new Error(`Summary cites a missing passage: ${documentId} p.${page} ${anchor}`)
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

export interface ScriptedSummary {
  sections: SummarySection[]
  citations: Citation[]
  mismatch?: string
}

export function summaryFor(
  documentId: ID,
  template: SummaryTemplate,
  audience: SummaryAudience,
  key: string,
): ScriptedSummary {
  const script = SCRIPTS[documentId]?.[template]?.[audience]
  const fields =
    audience === 'one_paragraph'
      ? [{ key: 'summary', title: 'Summary' }]
      : TEMPLATE_FIELDS[template]

  if (!script) {
    return {
      sections: fields.map((f) => ({ ...f, body: null })),
      citations: [],
      mismatch: `This document doesn’t match the “${TEMPLATE_LABELS[template]}” template, so none of its fields could be filled. Try another template.`,
    }
  }
  return {
    sections: fields.map((f) => ({ ...f, body: script.sections[f.key] ?? null })),
    citations: script.cites.map((ref, i) => citation(i + 1, ref, key)),
  }
}

/** The document a request like "Summarize Acme's demand letter" refers to, if it names one. */
export function documentNamedIn(question: string): ID | undefined {
  if (/demand letter|whitfield/i.test(question)) return D
  if (/acme('s)? response|sla complaint|response to/i.test(question)) return R
  if (/\bmsa\b|master services|agreement/i.test(question)) return 'doc-msa'
  return undefined
}
