// Records real backend responses as fixtures for the contract tests (INT-2.11).
//
//   npm run api:fixtures            (a freshly seeded backend must be running on 127.0.0.1:8000)
//
// It signs in with the dev shortcut, walks the Smith v. Acme matter, makes one chat turn, one summary and one
// draft, and writes each answer to src/api/http/fixtures/. Run it against a throw-away data directory:
// LEGALLENS_DATA_DIR=/tmp/ll uv run legallens db upgrade && ... seed --with-documents && ... dev
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const API = process.env.API ?? 'http://127.0.0.1:8000/api/v1'
const OUT = fileURLToPath(new URL('../src/api/http/fixtures/', import.meta.url))
let cookie = ''

async function call(path, { method = 'GET', body, headers = {}, text = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const set = response.headers.getSetCookie?.() ?? []
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
  if (!response.ok)
    throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`)
  if (response.status === 204) return null
  return text ? response.text() : response.json()
}

async function save(name, value) {
  const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
  await writeFile(`${OUT}${name}`, content)
  console.log('recorded', name)
}

async function job(jobId) {
  for (let i = 0; i < 120; i++) {
    const j = await call(`/jobs/${jobId}`)
    if (['done', 'failed', 'cancelled'].includes(j.status)) return j
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`job ${jobId} did not finish`)
}

await mkdir(OUT, { recursive: true })
await save('me.json', await call('/auth/dev-session', { method: 'POST', body: {} }))
await save('health.json', await call('/health'))

const matters = await call('/matters?limit=100')
await save('matters.json', matters)
const smith = matters.items.find((m) => m.name.includes('Smith'))
await save('matter.json', await call(`/matters/${smith.id}`))

// Documents
const documents = await call(`/matters/${smith.id}/documents?limit=100`)
await save('documents.json', documents)
const ready = documents.items.filter((d) => d.status === 'ready')
const incoming = ready.find((d) => d.origin === 'other_party') ?? ready[0]
await save('document-detail.json', await call(`/documents/${incoming.id}`))
await save('pages.json', await call(`/documents/${incoming.id}/pages?from=1&limit=2`))
await save(
  'deletion-preview.json',
  await call(`/documents/${incoming.id}?dry_run=true`, { method: 'DELETE' }),
)

// A chat turn: the stream is recorded as raw text, exactly as the server sent it
const conversation = await call(`/matters/${smith.id}/conversations`, { method: 'POST', body: {} })
const accepted = await call(`/conversations/${conversation.id}/messages`, {
  method: 'POST',
  headers: { 'Idempotency-Key': `fixtures-${Date.now()}` },
  body: { content: 'How must a termination notice be delivered?', mode: 'ask' },
})
await save('send-accepted.json', accepted)
await save('run-stream.txt', await call(`/runs/${accepted.run_id}/stream`, { text: true }))
await save('conversations.json', await call(`/matters/${smith.id}/conversations?limit=100`))
await save('messages.json', await call(`/conversations/${conversation.id}/messages?limit=50`))

// A summary
const summaryAccepted = await call(`/documents/${incoming.id}/summaries`, {
  method: 'POST',
  body: { template: 'letter_demand', audience: 'detailed' },
})
const summaryJob = await job(summaryAccepted.job_id)
await save('summary.json', await call(`/summaries/${summaryAccepted.summary_id}`))
await save('summaries.json', await call(`/matters/${smith.id}/summaries?limit=100`))

// A draft
const draftAccepted = await call(`/matters/${smith.id}/drafts`, {
  method: 'POST',
  body: { type: 'response_letter', incoming_document_id: incoming.id },
})
await job(draftAccepted.job_id)
const draft = await call(`/drafts/${draftAccepted.draft_id}`)
await save('draft.json', draft)
await save('drafts.json', await call(`/matters/${smith.id}/drafts?limit=100`))
await save('draft-checks.json', await call(`/drafts/${draft.id}/checks`))
const point = draft.sections.find((s) => s.kind === 'point')
if (point) {
  await save(
    'section-proposal.json',
    await call(`/drafts/${draft.id}/sections/${point.id}/propose`, {
      method: 'POST',
      body: { instruction: 'Make this firmer.' },
    }),
  )
}
const claim = (draft.claims ?? []).find((c) => c.status !== 'addressed') ?? draft.claims?.[0]
if (claim) {
  await save(
    'claim-proposal.json',
    await call(`/drafts/${draft.id}/claims/${claim.id}/propose`, { method: 'POST' }),
  )
}

// The matter's event stream, from the beginning: ingestion, the summary job and the draft job
const controller = new AbortController()
setTimeout(() => controller.abort(), 2500)
let events = ''
try {
  const response = await fetch(`${API}/matters/${smith.id}/events?since=0`, {
    headers: { cookie, accept: 'text/event-stream' },
    signal: controller.signal,
  })
  const decoder = new TextDecoder()
  for await (const chunk of response.body) events += decoder.decode(chunk, { stream: true })
} catch {
  // The abort ends the read.
}
await save('matter-events.txt', events)
void summaryJob
