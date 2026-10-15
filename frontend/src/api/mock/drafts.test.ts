import { describe, expect, it } from 'vitest'
import type { MatterEvent, RunEvent } from '@/api/events'
import { rewriteSection } from '@/api/mock/draftScripts'
import { createMockApiClient } from '@/api/mock/MockApiClient'
import type { ApiClient } from '@/api/client'
import type { Draft } from '@/api/types'
import { allTokens } from '@/lib/drafts'
import { deriveAuthorities, exportBlockers } from '@/api/mock/draftChecks'

async function turn(content: string, api: ApiClient = createMockApiClient()) {
  const done = new Promise<MatterEvent>((resolve) =>
    api.subscribeMatterEvents('smith', (e) => e.type === 'job.done' && resolve(e)),
  )
  const { runId } = await api.sendMessage({
    matterId: 'smith',
    content,
    scope: { kind: 'all' },
    mode: 'auto',
  })
  const events: RunEvent[] = []
  await api.streamRun(runId, (e) => events.push(e))
  const job = events.find((e) => e.type === 'job')
  return {
    api,
    events,
    done,
    draftId: job?.type === 'job' && job.kind === 'draft' ? job.draftId : '',
  }
}

/** Resolve everything the export gate checks, except the review itself. */
function cleared(draft: Draft) {
  return {
    sections: draft.sections.map((s) => ({
      ...s,
      body: s.body
        .replace(/\s?\[(?:CITE NEEDED|RULE NEEDED|UNVERIFIED): [^\]]+\]/g, '')
        .replace(/\[[A-Z][A-Z ]+\]/g, 'X'),
    })),
    claims: draft.claims.map((c) => ({ ...c, waived: !c.addressedBy })),
  }
}

describe('draft requests in the chat', () => {
  it('starts a background draft of a response letter and replies with a job card', async () => {
    const { api, events, done, draftId } = await turn('Draft a reply to Acme’s demand letter')
    expect(events.find((e) => e.type === 'intent')).toMatchObject({ intent: 'draft' })
    expect(draftId).toBeTruthy()
    await done
    const draft = await api.getDraft(draftId)
    expect(draft).toMatchObject({ type: 'response_letter', status: 'not_reviewed', version: 1 })
    expect(draft.claims.filter((c) => !c.addressedBy)).toHaveLength(2)
    expect(allTokens(draft).map((t) => t.token.kind)).toContain('unverified')
  })

  it('drafts a memo when asked for one', async () => {
    const { api, done, draftId } = await turn('Write a memo on the interest in the demand letter')
    await done
    const draft = await api.getDraft(draftId)
    expect(draft.type).toBe('memo')
    expect(allTokens(draft).map((t) => t.token.kind)).toContain('rule_needed')
  })

  it('asks which document to answer instead of guessing', async () => {
    const { events, draftId } = await turn('Draft a reply')
    expect(draftId).toBe('')
    const text = events
      .filter((e) => e.type === 'token')
      .map((e) => (e.type === 'token' ? e.delta : ''))
      .join('')
    expect(text).toMatch(/Which document are you responding to/)
  })
})

describe('the export gate on the server', () => {
  it('refuses review and the clean copy while anything is open, but allows the working copy', async () => {
    const api = createMockApiClient()
    await expect(api.reviewDraft('draft-reply')).rejects.toThrow(/Resolve these first/)
    await expect(api.exportDraft('draft-reply', 'clean')).rejects.toThrow(/can’t be exported yet/)
    const working = await api.exportDraft('draft-reply', 'working')
    expect(await working.blob.text()).toContain('DO NOT SEND')
  })

  it('exports a clean copy once everything is resolved and adopted, and an edit un-adopts it', async () => {
    const api = createMockApiClient()
    let draft = await api.updateDraft('draft-reply', {
      ...cleared(await api.getDraft('draft-reply')),
      versionLabel: 'Resolved',
    })
    draft = await api.updateDraft('draft-reply', {
      acknowledged: deriveAuthorities(draft).map((a) => a.key),
    })
    expect(exportBlockers(draft).map((b) => b.key)).toEqual(['review'])

    draft = await api.reviewDraft('draft-reply')
    expect(draft.status).toBe('reviewed_adopted')
    const clean = await api.exportDraft('draft-reply', 'clean')
    expect(await clean.blob.text()).not.toMatch(/\[\d+\]|DO NOT SEND|Sources/)

    draft = await api.updateDraft('draft-reply', { safeguards: { fre408: true } })
    expect(draft.status).toBe('not_reviewed')
  })

  it('restores an earlier version as a new version', async () => {
    const api = createMockApiClient()
    const original = await api.getDraft('draft-reply')
    await api.updateDraft('draft-reply', { ...cleared(original), versionLabel: 'Resolved' })
    const restored = await api.updateDraft('draft-reply', { restoreVersion: 1 })
    expect(restored.version).toBe(3)
    expect(restored.versions[0]?.label).toBe('Restored version 1')
    expect(restored.sections).toEqual(original.sections)
  })
})

describe('refining a section', () => {
  it('keeps what the lawyer already filled in', () => {
    const body =
      'Smith will not pay the disputed amounts by October 20, 2026 [5] while the dispute is unresolved. Section 6.4 requires the parties to negotiate in good faith to resolve it within thirty days [2]. Smith proposes a call during the week of October 19 to begin those discussions.'
    const firmer = rewriteSection(
      'response_letter',
      { id: 'position', label: 'Position', body },
      'Make it firmer',
    )
    expect(firmer).toContain('during the week of October 19.')
    expect(firmer).not.toContain('[PROPOSED WEEK]')
  })

  it('refuses a rewrite that would change nothing', () => {
    expect(() =>
      rewriteSection(
        'memo',
        { id: 'question', label: 'Question', body: 'Is it allowed?' },
        'Make it firmer',
      ),
    ).toThrow(/couldn’t improve/)
  })
})
