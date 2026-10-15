import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpApiClient } from '@/api/http/HttpApiClient'
import { ApiError } from '@/api/http/request'
import type { components } from '@/api/http/schema'
import { useSession } from '@/stores/session'
import me from './fixtures/me.json'
import matters from './fixtures/matters.json'
import matter from './fixtures/matter.json'
import conversations from './fixtures/conversations.json'
import messages from './fixtures/messages.json'
import documents from './fixtures/documents.json'
import documentDetail from './fixtures/document-detail.json'
import pages from './fixtures/pages.json'
import deletion from './fixtures/deletion-preview.json'
import sendAccepted from './fixtures/send-accepted.json'
import summaries from './fixtures/summaries.json'
import summary from './fixtures/summary.json'
import drafts from './fixtures/drafts.json'
import draft from './fixtures/draft.json'
import sectionProposal from './fixtures/section-proposal.json'
import claimProposal from './fixtures/claim-proposal.json'
import draftChecks from './fixtures/draft-checks.json'
import runStream from './fixtures/run-stream.txt?raw'

// Contract tests (INT-2.11): every HttpApiClient method runs against responses recorded from the real backend.
// A route table stands in for the network; the test then checks both what the client sent and what it returned.
type Wire = components['schemas']
type Handler = (request: {
  url: URL
  init: RequestInit
  json: () => unknown
}) => Response | Promise<Response>

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const problem = (status: number, code: string, detail: string, extra = {}) =>
  json({ code, detail, status, title: code, type: 'about:blank', instance: '/', ...extra }, status)

let routes: Record<string, Handler>
let calls: { key: string; init: RequestInit; query: URLSearchParams }[]

beforeEach(() => {
  calls = []
  routes = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input, 'http://localhost')
      const key = `${init.method ?? 'GET'} ${url.pathname.replace('/api/v1', '')}`
      calls.push({ key, init, query: url.searchParams })
      const handler = routes[key]
      if (!handler) return problem(404, 'not_found', `No fixture for ${key}`)
      return handler({ url, init, json: () => JSON.parse(String(init.body)) })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const smith = (matter as unknown as Wire['MatterOut']).id
const doc = (documents as unknown as Wire['Page_DocumentOut_']).items[0]!
const body = (key: string) => JSON.parse(String(calls.find((c) => c.key === key)!.init.body))

describe('auth', () => {
  it('signs in in two steps and reads the user', async () => {
    routes['POST /auth/login'] = () => json({ mfa_required: true })
    routes['POST /auth/mfa/verify'] = () => json(me)
    routes['GET /auth/me'] = () => json(me)
    const api = createHttpApiClient()
    expect(await api.signIn('a@b.c', 'pw')).toEqual({ mfaRequired: true })
    expect(body('POST /auth/login')).toEqual({ email: 'a@b.c', password: 'pw' })
    const user = await api.verifyMfa('123456')
    expect(user.email).toBe((me as unknown as Wire['Me']).user.email)
    expect(await api.getMe()).toEqual(user)
  })

  it('turns a wrong code into an ApiError with the server’s words and request id', async () => {
    routes['POST /auth/mfa/verify'] = () =>
      problem(401, 'invalid_code', 'That code is not correct.', { request_id: 'req_1' })
    const error = await createHttpApiClient()
      .verifyMfa('000000')
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 401,
      code: 'invalid_code',
      message: 'That code is not correct.',
      requestId: 'req_1',
    })
  })

  it('locks the screen when the session has ended', async () => {
    routes['GET /matters'] = () => problem(401, 'session_expired', 'Your session has expired.')
    useSession.getState().unlock()
    await createHttpApiClient()
      .listMatters()
      .catch(() => {})
    expect(useSession.getState().locked).toBe(true)
    useSession.getState().unlock()
  })

  it('names a lost connection plainly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(createHttpApiClient().getMe()).rejects.toMatchObject({
      status: 0,
      code: 'unreachable',
    })
  })
})

describe('matters, chats and documents', () => {
  it('walks every page of a list', async () => {
    routes['GET /matters'] = ({ url }) =>
      url.searchParams.get('cursor')
        ? json({
            items: [(matters as unknown as Wire['Page_MatterSummaryOut_']).items[1]],
            next_cursor: null,
          })
        : json({
            items: [(matters as unknown as Wire['Page_MatterSummaryOut_']).items[0]],
            next_cursor: 'c2',
          })
    const list = await createHttpApiClient().listMatters()
    expect(list).toHaveLength(2)
    expect(calls.map((c) => c.query.get('cursor'))).toEqual([null, 'c2'])
  })

  it('reads a matter, its chats and its messages oldest first', async () => {
    routes[`GET /matters/${smith}`] = () => json(matter)
    routes[`GET /matters/${smith}/conversations`] = () => json(conversations)
    routes['GET /conversations/c1/messages'] = ({ url }) =>
      url.searchParams.get('before')
        ? json({
            items: [{ ...(messages as unknown as Wire['Page_MessageOut_']).items[0], id: 'old' }],
            next_cursor: null,
          })
        : json({
            items: (messages as unknown as Wire['Page_MessageOut_']).items,
            next_cursor: 'older',
          })
    const api = createHttpApiClient()
    expect((await api.getMatter(smith)).opposingParty).not.toBe('')
    expect(await api.listConversations(smith)).toBeInstanceOf(Array)
    const list = await api.listMessages('c1')
    expect(list[0]!.id).toBe('old')
    expect(list.length).toBeGreaterThan(1)
  })

  it('renames and deletes a chat', async () => {
    routes['PATCH /conversations/c1'] = ({ json: j }) =>
      json({
        ...(conversations as unknown as Wire['Page_ConversationOut_']).items[0],
        ...(j() as object),
      })
    routes['DELETE /conversations/c1'] = () => new Response(null, { status: 204 })
    const api = createHttpApiClient()
    expect((await api.updateConversation('c1', { title: 'Renamed' })).title).toBe('Renamed')
    await expect(api.deleteConversation('c1')).resolves.toBeUndefined()
  })

  it('lists documents with coverage, reads pages and a deletion preview, and deletes', async () => {
    routes[`GET /matters/${smith}/documents`] = () => json(documents)
    routes[`GET /documents/${doc.id}/pages`] = () => json(pages)
    routes[`DELETE /documents/${doc.id}`] = ({ url }) =>
      url.searchParams.get('dry_run')
        ? json(deletion)
        : json({ ...(deletion as object), dry_run: false })
    const api = createHttpApiClient()
    const list = await api.listDocuments(smith)
    expect(list.find((d) => d.status === 'ready')!.coverage).toBeDefined()
    expect((await api.getDocumentPages(doc.id))[0]!.blocks.length).toBeGreaterThan(0)
    expect((await api.getDeletionImpact(doc.id)).passages).toBeGreaterThanOrEqual(0)
    expect(calls.at(-1)!.query.get('dry_run')).toBe('true')
    await api.deleteDocument(doc.id)
    expect(calls.at(-1)!.query.get('dry_run')).toBeNull()
  })

  it('uploads the file with its origin and returns the document and job', async () => {
    const sent: { form?: FormData } = {}
    const detailId = (documentDetail as unknown as Wire['DocumentDetailOut']).id
    class FakeXhr {
      upload: {
        onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void
      } = {}
      onload?: () => void
      onerror?: () => void
      status = 202
      responseText = JSON.stringify({ document_id: detailId, job_id: 'job_1', status: 'queued' })
      withCredentials = false
      open() {}
      setRequestHeader() {}
      send(form: FormData) {
        sent.form = form
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
        this.onload?.()
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    routes[`GET /documents/${detailId}`] = () => json(documentDetail)
    const progress: number[] = []
    const file = new File(['hello'], 'letter.txt', { type: 'text/plain' })
    const result = await createHttpApiClient().uploadDocument(smith, file, 'other_party', (f) =>
      progress.push(f),
    )
    expect(sent.form!.get('origin')).toBe('other_party')
    expect((sent.form!.get('file') as File).name).toBe('letter.txt')
    expect(progress).toEqual([0.5])
    expect(result.jobId).toBe('job_1')
    expect(result.document.id).toBe(detailId)
    vi.unstubAllGlobals()
  })
})

describe('chat', () => {
  it('creates the chat, sends one idempotency key, and reuses it on a retry', async () => {
    routes[`POST /matters/${smith}/conversations`] = () => json({ id: 'c9' }, 201)
    let attempt = 0
    routes['POST /conversations/c9/messages'] = () => {
      attempt += 1
      if (attempt === 1) throw new TypeError('Failed to fetch')
      return json(sendAccepted, 202)
    }
    const api = createHttpApiClient()
    const result = await api.sendMessage({
      matterId: smith,
      content: 'Hi',
      scope: { kind: 'document', documentId: doc.id },
      mode: 'summarize',
      summary: { template: 'letter_demand', audience: 'detailed' },
    })
    expect(result.conversationId).toBe('c9')
    expect(result.runId).toBe((sendAccepted as unknown as Wire['SendMessageAccepted']).run_id)
    const posts = calls.filter((c) => c.key === 'POST /conversations/c9/messages')
    expect(posts).toHaveLength(2)
    const keys = posts.map((p) => new Headers(p.init.headers).get('idempotency-key'))
    expect(keys[0]).toBeTruthy()
    expect(keys[0]).toBe(keys[1])
    expect(body('POST /conversations/c9/messages')).toMatchObject({
      mode: 'summarize',
      scope: { kind: 'documents', document_ids: [doc.id] },
      options: { summary_template: 'letter_demand', audience: 'detailed' },
    })
  })

  it('streams a recorded run to its end', async () => {
    routes['GET /runs/run_1/stream'] = () =>
      new Response(runStream, { headers: { 'content-type': 'text/event-stream' } })
    const events: string[] = []
    await createHttpApiClient().streamRun('run_1', (e) => events.push(e.type))
    expect(events[0]).toBe('run.started')
    expect(events.at(-1)).toBe('done')
    expect(events).toContain('citation')
  })

  it('on Stop, cancels the run on the server and ends the answer as stopped', async () => {
    const encoder = new TextEncoder()
    routes['GET /runs/run_1/stream'] = ({ init }) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'id: 1\nevent: run.started\ndata: {"run_id":"run_1","message_id":"m1"}\n\n',
              ),
            )
            init.signal?.addEventListener('abort', () =>
              controller.error(new DOMException('x', 'AbortError')),
            )
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    routes['POST /runs/run_1/cancel'] = () => json({ run_id: 'run_1', status: 'cancelled' })
    const controller = new AbortController()
    const events: unknown[] = []
    const finished = createHttpApiClient().streamRun(
      'run_1',
      (e) => {
        events.push(e)
        if (e.type === 'run.started') controller.abort()
      },
      controller.signal,
    )
    await finished
    expect(calls.some((c) => c.key === 'POST /runs/run_1/cancel')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'done', messageId: 'm1', cancelled: true })
  })
})

describe('summaries', () => {
  it('lists, reads, creates and exports', async () => {
    const wire = summary as unknown as Wire['SummaryOut']
    routes[`GET /matters/${smith}/summaries`] = () => json(summaries)
    routes[`GET /summaries/${wire.id}`] = () => json(wire)
    routes[`POST /documents/${doc.id}/summaries`] = () =>
      json({ summary_id: wire.id, job_id: 'job_s' }, 202)
    routes[`POST /summaries/${wire.id}/export`] = () =>
      new Response('docx-bytes', {
        headers: { 'content-disposition': 'attachment; filename="summary.docx"' },
      })
    const api = createHttpApiClient()
    expect((await api.listSummaries(smith))[0]!.matterId).toBe(smith)
    expect((await api.getSummary(wire.id)).sections.length).toBeGreaterThan(0)
    const created = await api.createSummary({
      matterId: smith,
      documentId: doc.id,
      template: 'letter_demand',
      audience: 'detailed',
    })
    expect(created.jobId).toBe('job_s')
    expect(created.summary.id).toBe(wire.id)
    const file = await api.exportSummary(wire.id)
    expect(file.filename).toBe('summary.docx')
  })
})

describe('drafts', () => {
  const wire = draft as unknown as Wire['DraftOut']
  const point = wire.sections.find((s) => s.kind === 'point')!
  const intro = wire.sections.find((s) => s.kind === 'intro')!

  beforeEach(() => {
    routes[`GET /drafts/${wire.id}`] = () => json(wire)
    routes[`GET /documents/${wire.incoming_document_id}`] = () => json(documentDetail)
    routes[`GET /matters/${smith}/drafts`] = () => json(drafts)
  })

  it('lists, reads and starts a draft', async () => {
    routes[`POST /matters/${smith}/drafts`] = () =>
      json({ draft_id: wire.id, job_id: 'job_d' }, 202)
    const api = createHttpApiClient()
    expect((await api.listDrafts(smith))[0]!.sections).toEqual([])
    const read = await api.getDraft(wire.id)
    expect(read.incomingDocumentName).not.toBe('')
    const created = await api.createDraft({
      matterId: smith,
      type: 'response_letter',
      incomingDocumentId: wire.incoming_document_id!,
      supportingDocumentIds: [],
      instructions: 'Be brief.',
    })
    expect(created.jobId).toBe('job_d')
    expect(created.draft.instructions).toBe('Be brief.')
    expect(body(`POST /matters/${smith}/drafts`).incoming_document_id).toBe(
      wire.incoming_document_id,
    )
  })

  it('sends only the sections that changed, with the text it cut put back, and the version it saw', async () => {
    routes[`PATCH /drafts/${wire.id}`] = () => json({ ...wire, version: wire.version + 1 })
    const api = createHttpApiClient()
    const read = await api.getDraft(wire.id)
    const sections = read.sections.map((s) =>
      s.id === intro.id ? { ...s, body: `${s.body} Edited.` } : s,
    )
    await api.updateDraft(wire.id, { sections, versionLabel: 'Tightened intro' })
    const sent = body(`PATCH /drafts/${wire.id}`)
    expect(sent.base_version).toBe(wire.version)
    expect(sent.version_label).toBe('Tightened intro')
    expect(sent.sections).toHaveLength(1)
    expect(sent.sections[0].id).toBe(intro.id)
    expect(sent.sections[0].content).toMatch(/^Dear .*:\n\n/)
    expect(sent.sections[0].content).toMatch(/Edited\.$/)
  })

  it('accepting a preview sends its id, not its text', async () => {
    routes[`POST /drafts/${wire.id}/sections/${point.id}/propose`] = () => json(sectionProposal)
    routes[`PATCH /drafts/${wire.id}`] = () => json({ ...wire, version: wire.version + 1 })
    const api = createHttpApiClient()
    const read = await api.getDraft(wire.id)
    const { body: proposed } = await api.proposeSectionRewrite(
      wire.id,
      point.id,
      'Make this firmer.',
    )
    const sections = read.sections.map((s) => (s.id === point.id ? { ...s, body: proposed } : s))
    await api.updateDraft(wire.id, { sections })
    const sent = body(`PATCH /drafts/${wire.id}`)
    expect(sent.accept_proposal).toBe(
      (sectionProposal as unknown as Wire['SectionProposalOut']).proposal_id,
    )
    expect(sent.sections).toBeUndefined()
  })

  it('turns the lawyer’s ticks and set-aside points into the server’s fields', async () => {
    routes[`PATCH /drafts/${wire.id}`] = () => json(wire)
    const api = createHttpApiClient()
    const read = await api.getDraft(wire.id)
    await api.updateDraft(wire.id, {
      acknowledged: ['auth_1'],
      claims: read.claims.map((c, i) => ({ ...c, waived: i === 0 })),
      safeguards: { fre408: true },
    })
    const sent = body(`PATCH /drafts/${wire.id}`)
    expect(sent.acknowledge).toEqual(['auth_1'])
    expect(sent.waived_claims).toEqual([read.claims[0]!.id])
    expect(sent.safeguards).toMatchObject({ fre408_header: true })
  })

  it('reloads and says so when someone else changed the draft first', async () => {
    routes[`PATCH /drafts/${wire.id}`] = () =>
      problem(409, 'version_conflict', 'The draft changed since you opened it.', {
        current_version: 3,
      })
    const api = createHttpApiClient()
    const read = await api.getDraft(wire.id)
    const error = await api
      .updateDraft(wire.id, { sections: [{ ...read.sections[0]!, body: 'x' }] })
      .catch((e: unknown) => e)
    expect(error).toMatchObject({
      status: 409,
      code: 'version_conflict',
      extras: { current_version: 3 },
    })
  })

  it('proposes a claim response, reviews and exports', async () => {
    const claim = wire.claims![0]!
    routes[`POST /drafts/${wire.id}/claims/${claim.id}/propose`] = () => json(claimProposal)
    routes[`POST /drafts/${wire.id}/review`] = () => json({ ...wire, status: 'reviewed_adopted' })
    routes[`POST /drafts/${wire.id}/export`] = () =>
      new Response('docx', {
        headers: { 'content-disposition': 'attachment; filename="letter.docx"' },
      })
    const api = createHttpApiClient()
    const proposal = await api.proposeClaimResponse(wire.id, claim.id)
    expect(proposal.section.body.length).toBeGreaterThan(0)
    await api.reviewDraft(wire.id)
    expect(body(`POST /drafts/${wire.id}/review`)).toEqual({ confirm: true })
    const file = await api.exportDraft(wire.id, 'working')
    expect(file.filename).toBe('letter.docx')
    expect(calls.at(-1)!.query.get('kind')).toBe('working')
  })
})

describe('matter events', () => {
  it('maps named events from an EventSource and closes on unsubscribe', () => {
    const instances: FakeSource[] = []
    class FakeSource {
      listeners = new Map<string, (e: { data: string }) => void>()
      closed = false
      url: string
      constructor(url: string) {
        this.url = url
        instances.push(this)
      }
      addEventListener(name: string, fn: (e: { data: string }) => void) {
        this.listeners.set(name, fn)
      }
      close() {
        this.closed = true
      }
    }
    vi.stubGlobal('EventSource', FakeSource)
    const seen: unknown[] = []
    const stop = createHttpApiClient().subscribeMatterEvents(smith, (e) => seen.push(e))
    const source = instances[0]!
    expect(source.url).toBe(`/api/v1/matters/${smith}/events`)
    source.listeners.get('job.done')!({
      data: JSON.stringify({ kind: 'draft', job_id: 'j', draft_id: 'drf_1', title: 'Response' }),
    })
    source.listeners.get('job.failed')!({
      data: JSON.stringify({
        kind: 'summarize',
        job_id: 'j',
        summary_id: 'sum_1',
        error: { message: 'Failed' },
      }),
    })
    expect(seen).toEqual([
      { type: 'job.done', kind: 'draft', jobId: 'j', draftId: 'drf_1', title: 'Response' },
      { type: 'job.failed', kind: 'summarize', jobId: 'j', entityId: 'sum_1', message: 'Failed' },
    ])
    stop()
    expect(source.closed).toBe(true)
  })
})

describe('INT-3 additions', () => {
  it('reads the server’s checks: server ids, the vouch flag and the gate', async () => {
    const wire = draft as unknown as Wire['DraftOut']
    routes[`GET /drafts/${wire.id}/checks`] = () => json(draftChecks)
    const checks = await createHttpApiClient().getDraftChecks(wire.id)
    const first = (draftChecks as unknown as Wire['DraftChecksOut']).citation_checklist[0]!
    expect(checks.authorities[0]).toMatchObject({
      key: first.id,
      unverified: first.unverified,
      status: 'mentioned_only',
    })
    expect(checks.cleanAllowed).toBe(false)
    expect(checks.blockers.map((b) => b.key)).toEqual(['tokens', 'authorities', 'review'])
  })

  it('saves licensing states and learns the idle timeout and the stand-in engine', async () => {
    routes['PATCH /auth/me'] = () => json(me)
    const user = await createHttpApiClient().updateLicensingStates(['NY', 'CA'])
    expect(body('PATCH /auth/me')).toEqual({ licensing_states: ['NY', 'CA'] })
    expect(user.idleTimeoutMs).toBe((me as unknown as Wire['Me']).session.idle_timeout_s * 1000)
    expect(user.standInEngine).toBe((me as unknown as Wire['Me']).app.orchestrator === 'stub')
  })

  it('asks for the matter’s name when deleting it', async () => {
    routes[`DELETE /matters/${smith}`] = () => new Response(null, { status: 204 })
    await createHttpApiClient().deleteMatter(smith, 'Smith v. Acme')
    expect(calls.at(-1)!.query.get('confirm')).toBe('Smith v. Acme')
  })

  it('reads hidden content only through the audited endpoint', async () => {
    routes['GET /documents/d1/hidden-content'] = () =>
      json({
        document_id: 'd1',
        origin: 'other_party',
        notice: 'n',
        items: [{ kind: 'comments', location: 'p.2', page: 2, text: 'Check clause 4' }],
      })
    const items = await createHttpApiClient().getHiddenContent('d1')
    expect(items).toEqual([{ kind: 'comments', description: 'Check clause 4 · page 2 · p.2' }])
  })

  it('creates a matter with the other side as a party and the AI-consent record', async () => {
    routes['POST /matters'] = () => json(matter, 201)
    await createHttpApiClient().createMatter({
      name: 'A v. B',
      clientName: 'A',
      ourSide: 'Plaintiff',
      opposingParty: 'B Corp',
      opposingCounsel: { name: 'C. Dee', firm: 'Dee LLP' },
      aiConsent: { status: 'given', toldTool: true, toldData: true, toldRisks: false },
    })
    expect(body('POST /matters')).toMatchObject({
      client_name: 'A',
      profile: {
        parties: [
          { role: 'opposing', name: 'B Corp', represented: true, counsel: { name: 'C. Dee' } },
        ],
      },
      ai_consent: { status: 'given', told_tool: true, told_risks: false },
    })
  })
})
