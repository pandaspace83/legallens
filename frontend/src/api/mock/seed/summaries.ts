import { summaryFor } from '@/api/mock/summaryScripts'
import type { Summary } from '@/api/types'
import { ago } from '@/lib/ids'

// One finished summary of the demand letter, made from the "Summary of Acme’s demand letter" chat.
const scripted = summaryFor('doc-demand', 'letter_demand', 'detailed', 'sum-demand')

export const SEED_SUMMARIES: Summary[] = [
  {
    id: 'sum-demand',
    matterId: 'smith',
    documentId: 'doc-demand',
    documentName: 'Demand letter – Whitfield & Crane.pdf',
    template: 'letter_demand',
    audience: 'detailed',
    status: 'ready',
    ...scripted,
    coverage: {
      pagesRead: 3,
      unreadablePages: [],
      lowConfidencePages: [{ page: 3, confidence: 0.84 }],
    },
    conversationId: 'c-demand',
    modelLabel: 'Local model · prompt v0.3',
    createdAt: ago({ hours: 3 }),
  },
]
