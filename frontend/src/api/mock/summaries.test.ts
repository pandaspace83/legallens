import { describe, expect, it } from 'vitest'
import type { MatterEvent, RunEvent } from '@/api/events'
import { createMockApiClient } from '@/api/mock/MockApiClient'
import { summaryFor } from '@/api/mock/summaryScripts'

describe('summary scripts', () => {
  it('fills every letter field with cited text for the demand letter', () => {
    const s = summaryFor('doc-demand', 'letter_demand', 'detailed', 'k')
    expect(s.sections.map((x) => x.title)).toEqual([
      'Who is asking',
      'What they want',
      'By when',
      'Claims made',
      'Threats',
      'Also raised',
    ])
    expect(s.sections.every((x) => x.body)).toBe(true)
    expect(s.citations[2]).toMatchObject({ page: 1, para: 'dl-1-4', verified: true })
  })

  it('says "not found" for items a letter does not contain', () => {
    const s = summaryFor('doc-acme-resp', 'letter_demand', 'detailed', 'k')
    expect(s.sections.find((x) => x.key === 'deadline')?.body).toBeNull()
    expect(s.sections.find((x) => x.key === 'threats')?.body).toBeNull()
  })

  it('reports a template that does not fit instead of inventing content', () => {
    const s = summaryFor('doc-demand', 'opinion', 'detailed', 'k')
    expect(s.mismatch).toMatch(/doesn’t match/)
    expect(s.sections.every((x) => x.body === null)).toBe(true)
  })
})

describe('summarize requests in the chat', () => {
  async function turn(content: string) {
    const api = createMockApiClient()
    const done = new Promise<MatterEvent>((resolve) =>
      api.subscribeMatterEvents('smith', (e) => e.type === 'job.done' && resolve(e)),
    )
    const { runId, conversationId } = await api.sendMessage({
      matterId: 'smith',
      content,
      scope: { kind: 'all' },
      mode: 'auto',
    })
    const events: RunEvent[] = []
    await api.streamRun(runId, (e) => events.push(e))
    return { api, events, done, conversationId }
  }

  it('starts a background job and replies with a job card', async () => {
    const { api, events, done, conversationId } = await turn(
      'Summarize the demand letter for the client',
    )
    expect(events.find((e) => e.type === 'intent')).toMatchObject({ intent: 'summarize' })
    const job = events.find((e) => e.type === 'job')
    expect(job).toBeTruthy()
    await done
    const summary = await api.getSummary(
      job && job.type === 'job' && job.kind === 'summarize' ? job.summaryId : '',
    )
    expect(summary).toMatchObject({
      status: 'ready',
      audience: 'plain_english',
      documentId: 'doc-demand',
    })
    const reply = (await api.listMessages(conversationId)).at(-1)
    expect(reply?.job).toEqual({ kind: 'summarize', summaryId: summary.id })
  })

  it('asks which document when the request names none', async () => {
    const { events } = await turn('Summarize this please')
    expect(events.find((e) => e.type === 'intent')).toMatchObject({ intent: 'clarify' })
    expect(events.some((e) => e.type === 'job')).toBe(false)
  })
})
