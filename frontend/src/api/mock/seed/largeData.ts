import type { Conversation, DocumentKind, ID, LegalDocument } from '@/api/types'
import { ago } from '@/lib/ids'

// Large-data mode for the dev panel (FE-9.2, DEC-14): 2,000 chats and 200 documents added to one matter, to test
// the sidebar, the library and the command palette at the size a long-running matter reaches. Generated from a
// fixed seed, so every run is the same. The documents have no page text; opening one shows the not-found state.

export const LARGE_CHATS = 2000
export const LARGE_DOCUMENTS = 200

/** Small deterministic generator (mulberry32), so the demo data is identical on every load. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ASKS = [
  'Termination rights under',
  'Notice period in',
  'Indemnity cap in',
  'Payment terms in',
  'Late fee under',
  'Governing law of',
  'Assignment clause in',
  'Confidentiality duties in',
  'Limitation of liability in',
  'Renewal terms in',
  'Service credits under',
  'Dispute resolution in',
]
const SOURCES = [
  'the MSA',
  'Exhibit A',
  'Exhibit B',
  'the SOW',
  'change order 3',
  'the demand letter',
  'the April invoice',
  'the SLA report',
]
const DOC_TITLES: [string, DocumentKind][] = [
  ['Invoice INV-', 'pdf'],
  ['Email from J. Smith re ', 'eml'],
  ['Deposition transcript – witness ', 'pdf'],
  ['Board resolution ', 'docx'],
  ['SLA performance report ', 'pdf'],
  ['Change order ', 'docx'],
]

export function largeData(matterId: ID) {
  const next = random(14)
  const conversations: Conversation[] = Array.from({ length: LARGE_CHATS }, (_, i) => {
    // Spread over two years, newest first, so every date group fills.
    const at = ago({ minutes: Math.round(i * 520 + next() * 400) })
    return {
      id: `bulk-c-${i}`,
      matterId,
      title: `${ASKS[i % ASKS.length]} ${SOURCES[Math.floor(next() * SOURCES.length)]} (#${i + 1})`,
      pinned: false,
      createdAt: at,
      updatedAt: at,
    }
  })
  const documents: LegalDocument[] = Array.from({ length: LARGE_DOCUMENTS }, (_, i) => {
    const [title, kind] = DOC_TITLES[i % DOC_TITLES.length]!
    return {
      id: `bulk-d-${i}`,
      matterId,
      name: `${title}${3000 + i}.${kind}`,
      kind,
      origin: next() < 0.7 ? 'client' : 'other_party',
      pages: 1 + Math.floor(next() * 120),
      status: 'ready',
      sizeBytes: 20_000 + Math.floor(next() * 4_000_000),
      uploadedAt: ago({ hours: 30 + i * 7 }),
    }
  })
  return { conversations, documents }
}
