import type { LegalDocument } from '@/api/types'
import { ago } from '@/lib/ids'

// Twelve documents for Smith v. Acme, a few for Rivera and Henderson.
export const SEED_DOCUMENTS: LegalDocument[] = [
  {
    id: 'doc-msa',
    matterId: 'smith',
    name: 'Master Services Agreement v3.pdf',
    kind: 'pdf',
    origin: 'client',
    pages: 41,
    status: 'ready',
    uploadedAt: ago({ days: 26 }),
  },
  {
    id: 'doc-demand',
    matterId: 'smith',
    name: 'Demand letter – Whitfield & Crane.pdf',
    kind: 'pdf',
    origin: 'other_party',
    pages: 3,
    status: 'ready',
    ocrConfidence: 0.92,
    uploadedAt: ago({ days: 6 }),
  },
  {
    id: 'doc-exb',
    matterId: 'smith',
    name: 'Exhibit B – Statement of Work.docx',
    kind: 'docx',
    origin: 'client',
    pages: 12,
    status: 'processing',
    progress: 64,
    uploadedAt: ago({ minutes: 3 }),
  },
  {
    id: 'doc-exa',
    matterId: 'smith',
    name: 'Exhibit A – Pricing Schedule.pdf',
    kind: 'pdf',
    origin: 'client',
    pages: 4,
    status: 'ready',
    uploadedAt: ago({ days: 26 }),
  },
  {
    id: 'doc-sla',
    matterId: 'smith',
    name: 'SLA performance reports Q2–Q3 2026.pdf',
    kind: 'pdf',
    origin: 'client',
    pages: 18,
    status: 'ready',
    uploadedAt: ago({ days: 9 }),
  },
  {
    id: 'doc-email',
    matterId: 'smith',
    name: 'Email from J. Smith re SLA failures.eml',
    kind: 'eml',
    origin: 'client',
    pages: 2,
    status: 'ready',
    uploadedAt: ago({ days: 9 }),
  },
  {
    id: 'doc-acme-resp',
    matterId: 'smith',
    name: 'Acme response to SLA complaint.pdf',
    kind: 'pdf',
    origin: 'other_party',
    pages: 3,
    status: 'ready',
    hiddenContent: true,
    uploadedAt: ago({ days: 8 }),
  },
  {
    id: 'doc-inv-2207',
    matterId: 'smith',
    name: 'Invoice INV-2207.pdf',
    kind: 'pdf',
    origin: 'other_party',
    pages: 1,
    status: 'ready',
    uploadedAt: ago({ days: 6 }),
  },
  {
    id: 'doc-inv-2231',
    matterId: 'smith',
    name: 'Invoice INV-2231.pdf',
    kind: 'pdf',
    origin: 'other_party',
    pages: 1,
    status: 'ready',
    uploadedAt: ago({ days: 6 }),
  },
  {
    id: 'doc-inv-2245',
    matterId: 'smith',
    name: 'Invoice INV-2245.pdf',
    kind: 'pdf',
    origin: 'other_party',
    pages: 1,
    status: 'ready',
    uploadedAt: ago({ days: 6 }),
  },
  {
    id: 'doc-co3',
    matterId: 'smith',
    name: 'Change order 3.pdf',
    kind: 'pdf',
    origin: 'client',
    pages: 2,
    status: 'ready',
    ocrConfidence: 0.81,
    uploadedAt: ago({ days: 20 }),
  },
  {
    id: 'doc-board',
    matterId: 'smith',
    name: 'Board resolution approving MSA.pdf',
    kind: 'pdf',
    origin: 'client',
    pages: 2,
    status: 'ready',
    uploadedAt: ago({ days: 26 }),
  },

  {
    id: 'doc-lease',
    matterId: 'rivera',
    name: 'Residential lease – 14 Bay St.pdf',
    kind: 'pdf',
    origin: 'client',
    pages: 9,
    status: 'ready',
    uploadedAt: ago({ days: 4 }),
  },
  {
    id: 'doc-move-out',
    matterId: 'rivera',
    name: 'Move-out inspection photos.pdf',
    kind: 'pdf',
    origin: 'client',
    pages: 14,
    status: 'ready',
    ocrConfidence: 0.88,
    uploadedAt: ago({ days: 3 }),
  },
  {
    id: 'doc-deposit',
    matterId: 'rivera',
    name: 'Deposit itemization from landlord.pdf',
    kind: 'pdf',
    origin: 'other_party',
    pages: 2,
    status: 'ready',
    uploadedAt: ago({ days: 2 }),
  },

  {
    id: 'doc-will',
    matterId: 'henderson',
    name: 'Last will and testament.pdf',
    kind: 'pdf',
    origin: 'client',
    pages: 7,
    status: 'ready',
    uploadedAt: ago({ days: 120 }),
  },
]

// Sizes, coverage reports and hidden content for the seeded documents (DEC-42, DEC-59).
const DETAILS: Record<string, Partial<LegalDocument>> = {
  'doc-demand': {
    coverage: {
      pagesRead: 3,
      unreadablePages: [],
      lowConfidencePages: [{ page: 3, confidence: 0.84 }],
    },
  },
  'doc-co3': {
    coverage: {
      pagesRead: 2,
      unreadablePages: [],
      lowConfidencePages: [{ page: 2, confidence: 0.71 }],
    },
  },
  'doc-move-out': {
    coverage: {
      pagesRead: 13,
      unreadablePages: [9],
      lowConfidencePages: [{ page: 4, confidence: 0.78 }],
    },
  },
  'doc-acme-resp': {
    hiddenItems: [
      {
        kind: 'comment',
        description: 'Comment by “D. Whitfield” on section 3: “Don’t concede the July outage.”',
      },
      {
        kind: 'tracked_change',
        description:
          'Two deleted sentences in section 3, beginning “Acme acknowledges the outages…”',
      },
      {
        kind: 'metadata',
        description:
          'Author: Dana Whitfield · Company: Whitfield & Crane LLP · Last edited Sep 24, 2026',
      },
    ],
  },
}

for (const doc of SEED_DOCUMENTS) {
  doc.sizeBytes = doc.pages * 46_000 + 18_000
  if (doc.status === 'ready')
    doc.coverage = { pagesRead: doc.pages, unreadablePages: [], lowConfidencePages: [] }
  if (doc.status === 'processing')
    Object.assign(doc, { step: 'reading', stepDetail: 'Reading page 8 of 12' })
  Object.assign(doc, DETAILS[doc.id])
}
