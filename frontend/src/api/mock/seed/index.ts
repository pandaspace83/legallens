import { SEED_CONVERSATIONS, SEED_MESSAGES } from '@/api/mock/seed/conversations'
import { SEED_DOCUMENTS } from '@/api/mock/seed/documents'
import { SEED_DRAFTS } from '@/api/mock/seed/drafts'
import { SEED_PAGES } from '@/api/mock/seed/documentPages'
import { SEED_MATTERS, SEED_USER } from '@/api/mock/seed/matters'
import { SEED_SUMMARIES } from '@/api/mock/seed/summaries'

// The complete seed database. MockApiClient works on a deep copy, so the seed itself never changes.
export function createSeed() {
  return structuredClone({
    user: SEED_USER,
    matters: SEED_MATTERS,
    conversations: SEED_CONVERSATIONS,
    messages: SEED_MESSAGES,
    documents: SEED_DOCUMENTS,
    pages: SEED_PAGES,
    summaries: SEED_SUMMARIES,
    drafts: SEED_DRAFTS,
  })
}

export type MockDatabase = ReturnType<typeof createSeed>
