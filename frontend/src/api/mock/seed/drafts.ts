import { initialDraft } from '@/api/mock/draftScripts'
import type { Draft } from '@/api/types'
import { ago } from '@/lib/ids'

// One response-letter draft in progress (FE-2.3): placeholders unresolved, two claims unanswered,
// one UNVERIFIED citation, not reviewed. Made from the "Reply to Acme’s demand letter" chat.
const created = ago({ days: 1, hours: 1 })
const { sections, citations, claims } = initialDraft('response_letter', 'draft-reply')

export const SEED_DRAFTS: Draft[] = [
  {
    id: 'draft-reply',
    matterId: 'smith',
    conversationId: 'c-reply',
    type: 'response_letter',
    title: 'Response to your letter of September 29, 2026',
    incomingDocumentId: 'doc-demand',
    incomingDocumentName: 'Demand letter – Whitfield & Crane.pdf',
    supportingDocumentIds: ['doc-msa', 'doc-sla'],
    instructions:
      'Dispute the invoices under section 6.4, push back on the 1.5% interest, and propose a call.',
    status: 'not_reviewed',
    addressee: {
      name: 'Dana Whitfield',
      firm: 'Whitfield & Crane LLP',
      address: ['88 Kearny Street, Suite 1400', 'San Francisco, CA 94108'],
      represented: true,
    },
    dateLine: new Date(created).toLocaleDateString('en-US', { dateStyle: 'long' }),
    sections,
    citations,
    claims,
    addedAuthorities: [],
    acknowledged: [],
    safeguards: { fre408: false, reservationOfRights: false },
    version: 1,
    versions: [
      { version: 1, label: 'AI draft', createdAt: created, sections: structuredClone(sections) },
    ],
    modelLabel: 'Local model · prompt v0.3',
    createdAt: created,
    updatedAt: created,
  },
]
