import { describe, expect, it } from 'vitest'
import type { components } from '@/api/http/schema'
import {
  toDeletionImpact,
  toDocument,
  toDraft,
  toDraftFromListItem,
  toHealth,
  toMatter,
  toMatterEvent,
  toMatterFromSummary,
  toMessage,
  toPages,
  toRunEvent,
  toSummary,
  toUser,
} from '@/api/http/mappers'
import { SseParser } from '@/api/http/sse'
import me from './fixtures/me.json'
import matters from './fixtures/matters.json'
import matter from './fixtures/matter.json'
import documents from './fixtures/documents.json'
import pages from './fixtures/pages.json'
import deletion from './fixtures/deletion-preview.json'
import messages from './fixtures/messages.json'
import summary from './fixtures/summary.json'
import draft from './fixtures/draft.json'
import drafts from './fixtures/drafts.json'
import health from './fixtures/health.json'
import runStream from './fixtures/run-stream.txt?raw'
import matterEvents from './fixtures/matter-events.txt?raw'

// Fixtures are real responses, recorded by `npm run api:fixtures` from a freshly seeded backend.
type Wire = components['schemas']
const as = <T>(value: unknown) => value as T

function messagesOf(stream: string) {
  const parser = new SseParser()
  return parser.push(stream + '\n\n')
}

describe('people and matters', () => {
  it('derives the first name and initials from the full name', () => {
    const user = toUser(as<Wire['Me']>(me).user)
    expect(user.firstName).toBe(as<Wire['Me']>(me).user.name.split(' ')[0])
    expect(user.initials).toMatch(/^[A-Z]{2}$/)
    expect(toUser({ ...as<Wire['Me']>(me).user, name: 'Madonna' }).initials).toBe('M')
  })

  it('maps a list row and the detail to the same view model', () => {
    const row = as<Wire['Page_MatterSummaryOut_']>(matters).items.find((m) =>
      m.name.includes('Smith'),
    )!
    const fromList = toMatterFromSummary(row)
    const fromDetail = toMatter(as<Wire['MatterOut']>(matter))
    expect(fromList.ourSide).toBe(fromDetail.ourSide)
    expect(fromList.opposingParty).toBe(fromDetail.opposingParty)
    expect(fromList.opposingParty).not.toBe('')
    expect(fromList.documentCount).toBe(fromDetail.documentCount)
    expect(fromList.updatedAt).toBe(row.last_activity_at)
  })
})

describe('documents', () => {
  const list = as<Wire['Page_DocumentOut_']>(documents).items

  it('maps names, kinds, origin, coverage and the hidden-content flag', () => {
    const mapped = list.map(toDocument)
    expect(mapped.every((d) => ['pdf', 'docx', 'eml', 'msg', 'txt'].includes(d.kind))).toBe(true)
    const ready = mapped.find((d) => d.status === 'ready')!
    expect(ready.name).toBe(list.find((d) => d.id === ready.id)!.filename)
    expect(ready.coverage?.pagesRead).toBeGreaterThan(0)
    // The items themselves are never in a list answer (DEC-59).
    expect(mapped.every((d) => d.hiddenItems === undefined)).toBe(true)
  })

  it('numbers the pages and gives every block an anchor', () => {
    const mapped = toPages(as<Wire['PagesOut']>(pages))
    expect(mapped[0]!.page).toBe(1)
    expect(mapped.flatMap((p) => p.blocks).every((b) => b.anchor.length > 0)).toBe(true)
  })

  it('reads a deletion preview', () => {
    const impact = toDeletionImpact(as<Wire['DeletionReport']>(deletion))
    expect(impact.passages).toBe(as<Wire['DeletionReport']>(deletion).removed.chunks)
  })
})

describe('messages and streams', () => {
  it('maps stored messages, citations and what was searched', () => {
    const items = as<Wire['Page_MessageOut_']>(messages).items.map(toMessage)
    const answer = items.find((m) => m.role === 'assistant')!
    expect(answer.answerState).toBe('found')
    expect(answer.citations?.[0]?.quote.length).toBeGreaterThan(0)
    expect(answer.citations?.[0]?.id).toMatch(/^\d+$/)
    expect(answer.searched?.documentsSearched).toBeGreaterThan(0)
    expect(answer.stopped).toBeUndefined()
  })

  it('maps every event of a recorded run, ending in done', () => {
    const events = messagesOf(runStream).map((m) => toRunEvent(m.event, JSON.parse(m.data)))
    expect(events.every((e) => e !== null)).toBe(true)
    expect(events[0]).toMatchObject({ type: 'run.started' })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    const citation = events.find((e) => e?.type === 'citation')
    expect(citation).toMatchObject({ citation: { quote: expect.any(String), n: 1 } })
    const state = events.find((e) => e?.type === 'answer_state')
    expect(state).toMatchObject({ searched: { documentsSearched: expect.any(Number) } })
  })

  it('maps matter events to the screens’ shapes and skips the ones they have no use for', () => {
    const mapped = messagesOf(matterEvents).map((m) => ({
      raw: m,
      event: toMatterEvent(m.event, JSON.parse(m.data)),
    }))
    const ingest = mapped.find((m) => m.event?.type === 'job.progress' && m.event.kind === 'ingest')
    expect(ingest?.event).toMatchObject({
      documentId: expect.stringMatching(/^doc_/),
      step: expect.any(String),
    })
    expect(mapped.find((m) => m.event?.type === 'document.ready')?.event).toMatchObject({
      coverage: { pagesRead: expect.any(Number) },
    })
    expect(
      mapped.find((m) => m.event?.type === 'job.done' && m.event.kind === 'summarize')?.event,
    ).toMatchObject({ summaryId: expect.stringMatching(/^sum_/), documentName: expect.any(String) })
    expect(
      mapped.find((m) => m.event?.type === 'job.done' && m.event.kind === 'draft')?.event,
    ).toMatchObject({ draftId: expect.stringMatching(/^drf_/), title: expect.any(String) })
    // Chat renames are not a screen concern.
    expect(mapped.find((m) => m.raw.event === 'conversation.updated')?.event).toBeNull()
  })
})

describe('summaries', () => {
  it('maps sections, flattens citations and names the document', () => {
    const mapped = toSummary(as<Wire['SummaryOut']>(summary))
    expect(mapped.status).toBe('ready')
    expect(mapped.documentName).not.toBe('')
    expect(mapped.sections.some((s) => s.body === null)).toBe(
      as<Wire['SummaryOut']>(summary).sections.some((s) => !s.found),
    )
    const numbers = mapped.citations.map((c) => c.n)
    expect(new Set(numbers).size).toBe(numbers.length)
  })
})

describe('drafts', () => {
  const wire = as<Wire['DraftOut']>(draft)

  it('hands the letterhead to the header fields and keeps the body as sections', () => {
    const { draft: mapped } = toDraft(wire, { incomingDocumentName: 'letter.pdf' })
    expect(mapped.status).toBe('not_reviewed')
    expect(mapped.addressee).toMatchObject({ name: 'Dana Whitfield', represented: true })
    expect(mapped.addressee?.address.length).toBeGreaterThan(0)
    expect(mapped.sections.length).toBe(wire.sections.length - 2) // the addressee and the Re line
    expect(mapped.sections.some((s) => /^Dear /.test(s.body))).toBe(false)
    expect(mapped.sections.some((s) => /Sincerely/.test(s.body))).toBe(false)
  })

  it('remembers what it cut so a save can put it back', () => {
    const { frames } = toDraft(wire)
    const intro = wire.sections.find((s) => s.kind === 'intro')!
    expect(frames[intro.id]?.prefix).toMatch(/^Dear /)
    const closing = wire.sections.find((s) => s.kind === 'closing')!
    expect(frames[closing.id]?.suffix).toMatch(/Sincerely/)
  })

  it('maps claims to the sections that answer them', () => {
    const { draft: mapped } = toDraft(wire)
    expect(mapped.claims.length).toBe(wire.claims?.length)
    const sectionIds = new Set(mapped.sections.map((s) => s.id))
    for (const claim of mapped.claims) {
      if (claim.addressedBy) expect(sectionIds.has(claim.addressedBy)).toBe(true)
    }
  })

  it('maps a list row without text', () => {
    const row = as<Wire['Page_DraftListItem_']>(drafts).items[0]!
    const mapped = toDraftFromListItem(row, 'mat_x')
    expect(mapped.id).toBe(row.id)
    expect(mapped.sections).toEqual([])
    expect(mapped.incomingDocumentName).toBe(row.incoming_document_name ?? '')
  })

  it('maps generating to drafting', () => {
    const mapped = toDraft({ ...wire, status: 'generating' }).draft
    expect(mapped.status).toBe('drafting')
  })
})

describe('health', () => {
  it('lists each component by the backend’s name', () => {
    const mapped = toHealth(as<Wire['HealthOut']>(health))
    expect(mapped.components.map((c) => c.name)).toContain('orchestrator')
  })
})
