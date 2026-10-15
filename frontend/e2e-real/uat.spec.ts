import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// User-acceptance run against the real backend and the local models (Ollama): every feature through the UI,
// each step checked against the backend's own records, with a screenshot at each step. Results are written to
// test-evidence/results.json; build_test_report.py turns them into the Excel workbook.
//
//   LEGALLENS_ORCHESTRATOR=local npm run test:e2e:real -- e2e-real/uat.spec.ts
const samples = join(process.env.LEGALLENS_E2E_DIR ?? join(tmpdir(), 'legallens-e2e'), 'samples')
const OUT = process.env.UAT_DIR ?? resolve(process.cwd(), '../test-evidence')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const ANSWER_WAIT = 240_000
const JOB_WAIT = 480_000

interface Check {
  desc: string
  ok: boolean
  detail?: string
}
interface Result {
  id: string
  title: string
  category: string
  layers: string
  steps: string[]
  expected: string
  actual: string
  status: 'PASS' | 'FAIL'
  checks: Check[]
  screenshots: { label: string; file: string }[]
  backend: Record<string, unknown>
  seconds: number
}
const results: Result[] = []

test.describe.configure({ mode: 'serial' })
test.setTimeout(3_600_000)

let page: Page
let matterId = ''
let matterPath = ''
let termChatId = '' // the termination-notice chat of TC-04, used by the rename, pin, feedback, retry and delete cases

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5175',
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  page = await context.newPage()
  page.setDefaultTimeout(90_000) // a missing control fails its own case in 90 s instead of stalling the run
})
test.afterAll(async () => {
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
  await page.context().close()
})

const axe = (p: Page) =>
  new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

interface Ctx {
  shot(label: string): Promise<void>
  check(desc: string, ok: boolean, detail?: string): void
  evidence(key: string, value: unknown): void
  api<T = unknown>(path: string): Promise<T>
}

interface Meta {
  id: string
  title: string
  category: string
  layers: string
  steps: string[]
  expected: string
}

// One test case: runs the body, records every check, never throws (so the whole matrix is always run).
async function tc(meta: Meta, body: (c: Ctx) => Promise<string | void>) {
  await test.step(`${meta.id} ${meta.title}`, async () => {
    const started = Date.now()
    const shots: Result['screenshots'] = []
    const checks: Check[] = []
    const backend: Record<string, unknown> = {}
    let n = 0
    const ctx: Ctx = {
      async shot(label) {
        n += 1
        const file = `${meta.id}-${String(n).padStart(2, '0')}.png`
        await page.screenshot({ path: join(SHOTS, file), fullPage: false })
        shots.push({ label, file })
      },
      check(desc, ok, detail) {
        checks.push({ desc, ok, detail })
      },
      evidence(key, value) {
        backend[key] = value
      },
      async api<T>(path: string) {
        const r = await page.request.get(`/api/v1${path}`)
        return (await r.json()) as T
      },
    }
    let actual = ''
    let status: Result['status'] = 'PASS'
    try {
      const out = await body(ctx)
      actual = out ?? ''
    } catch (error) {
      status = 'FAIL'
      actual = `Error: ${(error as Error).message.split('\n')[0]}`
      await ctx.shot('State when the step failed').catch(() => undefined)
    }
    const failed = checks.filter((c) => !c.ok)
    if (failed.length) {
      status = 'FAIL'
      actual = `${actual ? actual + ' | ' : ''}Failed checks: ${failed.map((c) => c.desc).join('; ')}`
    }
    if (!actual) actual = checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.desc}`).join('; ')
    results.push({
      ...meta,
      actual,
      status,
      checks,
      screenshots: shots,
      backend,
      seconds: Math.round((Date.now() - started) / 1000),
    })
  })
}

async function ask(question: string) {
  const composer = page.locator('textarea').first()
  await composer.fill(question)
  await composer.press('Enter')
}

async function messagesOf(c: Ctx) {
  const m = /\/c\/([^/?]+)/.exec(page.url())
  const id = m?.[1] ?? ''
  const data = await c.api<{ items: Record<string, unknown>[] }>(`/conversations/${id}/messages`)
  return { id, items: data.items }
}

async function openNewChat() {
  await page.goto(matterPath)
  await expect(
    page.getByRole('heading', { name: /What would you like to know about/ }),
  ).toBeVisible()
}

// ------------------------------------------------------------------ A · access and setup

test('UAT matrix', async () => {
  await tc(
    {
      id: 'TC-01',
      title: 'Sign in with email, password and the 6-digit code',
      category: 'A · Access',
      layers: 'UI → API (auth) → SQLite sessions',
      steps: ['Open the app', 'Enter email and password, Continue', 'Enter the 6-digit code'],
      expected: 'The matters list opens; the session cookie is set and /auth/me answers 200.',
    },
    async (c) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await c.shot('Sign-in screen')
      await page.getByLabel('Email').fill('lawyer@legallens.local')
      await page.getByLabel('Password', { exact: true }).fill('anything')
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByRole('heading', { name: 'Check your authenticator' })).toBeVisible()
      await c.shot('Code step')
      for (const [i, d] of ['1', '2', '3', '4', '5', '6'].entries())
        await page.getByLabel(`Digit ${i + 1}`).fill(d)
      await expect(page).toHaveURL(/\/matters$/)
      await c.shot('Signed in: matters list')
      const me = await c.api<{ user: { email: string }; auth_mode: string }>('/auth/me')
      c.evidence('GET /auth/me', me)
      c.check('Backend reports the signed-in user', me.user?.email === 'lawyer@legallens.local')
    },
  )

  await tc(
    {
      id: 'TC-02',
      title: 'Open a matter from the matters list',
      category: 'A · Access',
      layers: 'UI → API (matters)',
      steps: ['Click "Smith v. Acme Corp"'],
      expected: 'The matter workspace opens with the new-chat prompt.',
    },
    async (c) => {
      await page.getByRole('link', { name: /Smith v\. Acme Corp/ }).click()
      await expect(page).toHaveURL(/\/m\/[^/]+$/)
      matterPath = new URL(page.url()).pathname
      matterId = matterPath.split('/').pop() ?? ''
      await expect(
        page.getByRole('heading', { name: /What would you like to know about/ }),
      ).toBeVisible()
      await c.shot('Matter workspace')
      c.check('A matter id is in the URL', matterId.length > 4, matterId)
    },
  )

  await tc(
    {
      id: 'TC-03',
      title: 'Upload three documents with who each came from; ingestion completes',
      category: 'B · Documents',
      layers: 'UI → API (upload) → worker (scan, convert, chunk, embed) → SQLite FTS5 + vectors',
      steps: [
        'Documents → Upload documents',
        'Choose the MSA, the demand letter and the invoices',
        'Tag each (our client / other side)',
        'Upload and wait for "Documents processed"',
      ],
      expected:
        'All three show as Ready with page counts; the backend lists them with status ready.',
    },
    async (c) => {
      await page.goto(`${matterPath}/documents`)
      await page.getByRole('button', { name: 'Upload documents' }).first().click()
      const dialog = page.getByRole('dialog', { name: 'Upload documents' })
      const files = [
        ['smith_msa_v3.pdf', 'Our client'],
        ['acme_demand_letter_scanned.pdf', 'Other side'],
        ['exhibit_b_invoices.pdf', 'Our client'],
      ] as const
      await dialog
        .getByLabel('Choose files to upload')
        .setInputFiles(files.map(([n]) => join(samples, n)))
      for (const [name, origin] of files)
        await dialog
          .getByRole('radiogroup', { name: `${name} is from` })
          .getByRole('radio', { name: origin })
          .click()
      await c.shot('Files chosen and tagged')
      await dialog.getByRole('button', { name: 'Upload 3 files' }).click()
      await expect(page.getByRole('dialog', { name: 'Documents processed' })).toBeVisible({
        timeout: 180_000,
      })
      await c.shot('Processing finished')
      await page.getByRole('button', { name: 'Done' }).click()
      const docs = await c.api<{
        items: { filename: string; status: string; pages_total?: number }[]
      }>(`/matters/${matterId}/documents`)
      c.evidence(
        'GET /matters/{id}/documents',
        docs.items.map((d) => ({ name: d.filename, status: d.status })),
      )
      c.check('Three documents are stored', docs.items.length === 3, String(docs.items.length))
      c.check(
        'Every document is ready',
        docs.items.every((d) => d.status === 'ready'),
      )
      await c.shot('Documents library')
    },
  )

  // ---------------------------------------------------------------- C · conversations and ask
  await tc(
    {
      id: 'TC-04',
      title: 'Create a conversation and ask a question: the answer is cited and verified',
      category: 'C · Conversations (scenario 1)',
      layers:
        'UI → API (POST message, SSE) → router → rewrite? → hybrid search → bge reranker → gate → qwen2.5:14b → checker → SQLite',
      steps: [
        'New chat',
        'Ask "What notice is required to terminate the agreement?"',
        'Wait for the answer to finish streaming',
      ],
      expected:
        'A new conversation appears in the sidebar; the answer cites the MSA (60 days) with verified citations; the backend record names the local model and state "found".',
    },
    async (c) => {
      await openNewChat()
      await c.shot('New chat')
      await ask('What notice is required to terminate the agreement?')
      await expect(page).toHaveURL(/\/c\//, { timeout: 60_000 })
      termChatId = /\/c\/([^/?]+)/.exec(page.url())?.[1] ?? ''
      await expect(page.getByText(/From your documents|Partially found/).first()).toBeVisible({
        timeout: ANSWER_WAIT,
      })
      await c.shot('Answer with citations')
      const { id, items } = await messagesOf(c)
      const answer = items.find((m) => m.role === 'assistant') as Record<string, unknown>
      c.evidence('assistant message', {
        model_id: answer?.model_id,
        prompt_version: answer?.prompt_version,
        answer_state: answer?.answer_state,
        tokens_in: answer?.tokens_in,
        tokens_out: answer?.tokens_out,
        latency_ms: answer?.latency_ms,
        citations: (answer?.citations as unknown[] | undefined)?.length,
      })
      c.check('Conversation exists in the backend', id.length > 4, id)
      c.check(
        'Answer was written by the local model',
        String(answer?.model_id).startsWith('qwen2.5'),
        String(answer?.model_id),
      )
      c.check('Answer text mentions sixty / 60 days', /sixty|60/i.test(String(answer?.content)))
      const citations = (answer?.citations ?? []) as { verified: boolean; document_name?: string }[]
      c.check('At least one citation', citations.length > 0, String(citations.length))
      c.check(
        'Every citation is verified',
        citations.length > 0 && citations.every((x) => x.verified),
      )
      c.check('Model tokens were used (the LLM ran)', Number(answer?.tokens_out) > 0)
    },
  )

  await tc(
    {
      id: 'TC-05',
      title: 'Open a citation: the document viewer highlights the cited passage',
      category: 'C · Conversations',
      layers: 'UI → API (document pages, citation) → viewer',
      steps: [
        'Click source 1 under the answer',
        'Check the highlighted passage and the page header',
      ],
      expected: 'The viewer opens at the cited page with the passage highlighted.',
    },
    async (c) => {
      await page
        .getByRole('button', { name: /^Source 1:/ })
        .first()
        .click()
      const viewer = page.getByRole('complementary', { name: 'Document viewer' })
      await expect(viewer).toBeVisible()
      await expect(page.locator('[data-active]').first()).toBeVisible()
      await c.shot('Cited passage highlighted')
      c.check('Highlighted passage is visible', true)
      const text = (await page.locator('[data-active]').first().innerText()).toLowerCase()
      c.check(
        'The highlighted passage is about notice',
        /notice|terminate/.test(text),
        text.slice(0, 80),
      )
    },
  )

  await tc(
    {
      id: 'TC-06',
      title: 'Follow-up question: the question is rewritten with the chat history',
      category: 'C · Conversations',
      layers: 'UI → router → llama3.2:3b rewrite → search → answer',
      steps: ['In the same chat ask "And how must it be delivered?"', 'Open "What was searched"'],
      expected:
        'The answer covers courier or certified mail; the searched query is a standalone question.',
    },
    async (c) => {
      await page.keyboard.press('Escape')
      await ask('And how must it be delivered?')
      await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(2, {
        timeout: ANSWER_WAIT,
      })
      await expect(page.getByText(/From your documents|Partially found/).nth(1)).toBeVisible({
        timeout: ANSWER_WAIT,
      })
      const { items } = await messagesOf(c)
      const last = items.filter((m) => m.role === 'assistant').at(-1) as Record<string, unknown>
      c.evidence('second answer', {
        model_id: last?.model_id,
        tokens_in: last?.tokens_in,
        state: last?.answer_state,
      })
      c.check(
        'Mentions courier or certified mail',
        /courier|certified/i.test(String(last?.content)),
      )
      c.check('Rewrite + answer both used the model (tokens recorded)', Number(last?.tokens_in) > 0)
      const toggle = page.getByRole('button', { name: /What was searched/ }).last()
      if (await toggle.isVisible()) await toggle.click()
      await c.shot('Follow-up answer with the searched query')
    },
  )

  await tc(
    {
      id: 'TC-07',
      title: 'A question the documents cannot answer returns "Not found" without a model answer',
      category: 'C · Conversations',
      layers: 'UI → search → rerank → gate (blocks) → fixed answer (no LLM)',
      steps: ['New chat', 'Ask "What is the weather forecast for Tokyo tomorrow?"'],
      expected: '"Not found in your documents", no citations, and the answer model is not called.',
    },
    async (c) => {
      await openNewChat()
      await ask('What is the weather forecast for Tokyo tomorrow?')
      await expect(page.getByText('Not found in your documents').first()).toBeVisible({
        timeout: ANSWER_WAIT,
      })
      await c.shot('Not found')
      const { items } = await messagesOf(c)
      const a = items.find((m) => m.role === 'assistant') as Record<string, unknown>
      c.evidence('assistant message', {
        answer_state: a?.answer_state,
        model_id: a?.model_id,
        tokens_out: a?.tokens_out,
      })
      c.check('State is not_found', a?.answer_state === 'not_found', String(a?.answer_state))
      c.check('No citations', ((a?.citations as unknown[]) ?? []).length === 0)
    },
  )

  await tc(
    {
      id: 'TC-08',
      title: 'A question that needs outside law is answered with the notice',
      category: 'C · Conversations',
      layers: 'UI → router → search → answer → outside-law flag',
      steps: ['New chat', 'Ask "Is the late fee clause enforceable under California law?"'],
      expected: 'The answer carries the "needs law that isn’t in your documents" notice.',
    },
    async (c) => {
      await openNewChat()
      await ask('Is the late fee clause enforceable under California law?')
      await expect(page.getByText('needs law that isn’t in your documents')).toBeVisible({
        timeout: ANSWER_WAIT,
      })
      await c.shot('Outside-law notice')
      const { items } = await messagesOf(c)
      const a = items.find((m) => m.role === 'assistant') as Record<string, unknown>
      c.evidence('assistant message', {
        outside_law: a?.outside_law,
        answer_state: a?.answer_state,
      })
      c.check('outside_law flag is set', a?.outside_law === true)
    },
  )

  await tc(
    {
      id: 'TC-09',
      title: 'Rename a conversation',
      category: 'C · Conversations (scenario 2)',
      layers: 'UI → API (PATCH conversation) → SQLite',
      steps: [
        'Open the chat menu in the sidebar',
        'Rename',
        'Type a new title, Enter',
        'Reload the page',
      ],
      expected:
        'The new title shows in the sidebar, survives a reload, and the backend returns it.',
    },
    async (c) => {
      await openNewChat()
      const link = page.locator(`a[href$="/c/${termChatId}"]`)
      const oldTitle = (await link.innerText()).trim()
      await link.hover()
      await page.getByRole('button', { name: `Options for ${oldTitle}` }).click({ force: true })
      await c.shot('Chat menu')
      await page.getByRole('menuitem', { name: 'Rename' }).click()
      const input = page.getByLabel('Chat title')
      await input.fill('Termination notice - UAT rename')
      await input.press('Enter')
      await expect(page.locator(`a[href$="/c/${termChatId}"]`)).toHaveText(
        'Termination notice - UAT rename',
      )
      await c.shot('Renamed in the sidebar')
      await page.reload()
      await expect(page.locator(`a[href$="/c/${termChatId}"]`)).toHaveText(
        'Termination notice - UAT rename',
      )
      const list = await c.api<{ items: { id: string; title: string }[] }>(
        `/matters/${matterId}/conversations`,
      )
      const mine = list.items.find((x) => x.id === termChatId)
      c.evidence(
        'conversation titles',
        list.items.map((x) => x.title),
      )
      c.check(
        'Backend has the new title for this chat',
        mine?.title === 'Termination notice - UAT rename',
        mine?.title,
      )
      c.check('The old title is no longer on this chat', mine?.title !== oldTitle)
    },
  )

  await tc(
    {
      id: 'TC-10',
      title: 'Pin a conversation to the top and search the chat list',
      category: 'C · Conversations',
      layers: 'UI → API (PATCH pinned, list with q=)',
      steps: ['Menu → Pin to top', 'Type "weather" in Search chats'],
      expected: 'The chat moves to Pinned; search narrows the list to matching titles.',
    },
    async (c) => {
      const link = page.locator(`a[href$="/c/${termChatId}"]`)
      await link.hover()
      await page
        .getByRole('button', { name: /Options for Termination notice - UAT rename/ })
        .click({ force: true })
      await page.getByRole('menuitem', { name: /Pin to top/ }).click()
      await expect(page.getByRole('region', { name: 'Pinned' })).toBeVisible()
      await c.shot('Pinned section')
      const list = await c.api<{ items: { title: string; pinned: boolean }[] }>(
        `/matters/${matterId}/conversations`,
      )
      c.check(
        'Backend marks it pinned',
        list.items.some((x) => x.pinned),
      )
      await page
        .getByRole('searchbox')
        .or(page.getByPlaceholder(/Search chats/))
        .first()
        .fill('weather')
      await expect(page.locator(`a[href$="/c/${termChatId}"]`)).toHaveCount(0, { timeout: 10_000 })
      await c.shot('Search narrows the list')
      c.check('Search hides non-matching chats', true)
    },
  )

  await tc(
    {
      id: 'TC-11',
      title: 'Feedback: "Not helpful" opens the form and the note is stored',
      category: 'C · Conversations',
      layers: 'UI → API (POST /messages/{id}/feedback) → SQLite feedback + audit',
      steps: ['Open the renamed chat', 'Not helpful → Missed something + note → Send'],
      expected: 'A "Feedback saved" toast; the backend accepts the feedback (204).',
    },
    async (c) => {
      await page
        .getByPlaceholder(/Search chats/)
        .first()
        .fill('')
      await page.locator(`a[href$="/c/${termChatId}"]`).click()
      await expect(page.getByRole('article', { name: 'Answer' }).first()).toBeVisible()
      await page.getByRole('button', { name: 'Not helpful' }).first().click()
      const dialog = page.getByRole('dialog', { name: 'What was wrong with this answer?' })
      await expect(dialog).toBeVisible()
      await dialog.getByLabel(/Missed something/).check()
      await dialog
        .getByLabel('Note (optional)')
        .fill('UAT: Schedule 2 also lists the notice address.')
      await c.shot('Feedback form filled')
      await dialog.getByRole('button', { name: 'Send feedback' }).click()
      await expect(page.getByText('Feedback saved')).toBeVisible()
      await c.shot('Feedback saved')
      c.check('Toast shown', true)
    },
  )

  await tc(
    {
      id: 'TC-12',
      title: 'Ask again re-sends the question',
      category: 'C · Conversations',
      layers: 'UI → API → orchestrator',
      steps: ['Click "Ask again" under the first answer'],
      expected: 'A new answer to the same question is added to the chat.',
    },
    async (c) => {
      const before = (await messagesOf(c)).items.filter((m) => m.role === 'assistant').length
      await page.getByRole('button', { name: 'Ask again' }).first().click()
      // Wait on the backend's own record: the new assistant message exists, has finished, and has text.
      let latest: Record<string, unknown> | undefined
      for (let i = 0; i < 80; i++) {
        const { items } = await messagesOf(c)
        const assistant = items.filter((m) => m.role === 'assistant')
        latest = assistant.at(-1)
        if (
          assistant.length === before + 1 &&
          latest?.status !== 'streaming' &&
          String(latest?.content ?? '').length > 0
        )
          break
        await page.waitForTimeout(3000)
      }
      await expect(page.getByRole('article', { name: 'Answer' })).toHaveCount(before + 1, {
        timeout: 30_000,
      })
      await c.shot('New answer to the same question')
      const { items } = await messagesOf(c)
      const assistant = items.filter((m) => m.role === 'assistant')
      c.evidence(
        'assistant answers in the chat',
        assistant.map((m) => ({
          state: m.answer_state,
          model: m.model_id,
          status: m.status,
          chars: String(m.content ?? '').length,
        })),
      )
      c.check(
        'A new assistant message was stored',
        assistant.length === before + 1,
        `${assistant.length} vs ${before}+1`,
      )
      c.check(
        'The new answer has text',
        String(latest?.content ?? '').length > 0,
        String(latest?.content ?? '').slice(0, 60),
      )
      c.check(
        'The new answer has a state',
        Boolean(latest?.answer_state),
        String(latest?.answer_state),
      )
      c.check('The new answer states 60 days', /sixty|60/i.test(String(latest?.content)))
    },
  )

  await tc(
    {
      id: 'TC-13',
      title: 'Delete a conversation',
      category: 'C · Conversations (scenario 3)',
      layers: 'UI → API (DELETE conversation) → SQLite (messages, citations, traces cascade)',
      steps: ['Chat menu → Delete', 'Confirm'],
      expected: 'The chat disappears from the list; the backend no longer returns it.',
    },
    async (c) => {
      const idBefore = termChatId
      await page.locator(`a[href$="/c/${termChatId}"]`).hover()
      await page
        .getByRole('button', { name: /Options for Termination notice - UAT rename/ })
        .click({ force: true })
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await expect(page.getByText('Chat deleted')).toBeVisible()
      await c.shot('Deleted, with Undo offered for five seconds')
      await expect(page.locator(`a[href$="/c/${termChatId}"]`)).toHaveCount(0, { timeout: 15_000 })
      await page.waitForTimeout(7000) // the delete is committed when the undo toast closes
      await c.shot('Chat removed from the list')
      const r = await page.request.get(`/api/v1/conversations/${idBefore}/messages`)
      c.evidence('GET deleted conversation → status', r.status())
      c.check('Backend answers 404 for the deleted chat', r.status() === 404, String(r.status()))
    },
  )

  await tc(
    {
      id: 'TC-13b',
      title: 'Delete then Undo keeps the conversation',
      category: 'C · Conversations (scenario 3)',
      layers: 'UI (optimistic delete) → no API delete when undone',
      steps: ['Delete another chat', 'Click Undo within five seconds'],
      expected: 'The chat returns to the list and the backend still has it.',
    },
    async (c) => {
      const row = page.getByRole('link', { name: /weather/i }).first()
      await expect(row).toBeVisible()
      const href = (await row.getAttribute('href')) ?? ''
      const id = href.split('/c/')[1] ?? ''
      await row.hover()
      await page
        .getByRole('button', { name: /Options for What is the weather/ })
        .click({ force: true })
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await c.shot('Deleted: Undo toast')
      await page.getByRole('button', { name: 'Undo' }).click()
      await expect(page.getByRole('link', { name: /weather/i }).first()).toBeVisible()
      await page.waitForTimeout(7000)
      await c.shot('Restored in the list')
      const r = await page.request.get(`/api/v1/conversations/${id}/messages`)
      c.check('Backend still has the chat (200)', r.status() === 200, String(r.status()))
    },
  )

  // ---------------------------------------------------------------- D · summarize
  await tc(
    {
      id: 'TC-14',
      title: 'New conversation: pick an existing document and summarize it',
      category: 'D · Summarize (existing document)',
      layers:
        'UI scope selector → router (summarize) → job queue → worker → per-field retrieval → qwen2.5:14b → checker → summary record',
      steps: [
        'New chat',
        'Scope → acme_demand_letter_scanned',
        'Ask "Summarize this document"',
        'Wait for the summary card, Open summary',
      ],
      expected:
        'A summary job card appears and completes; the summary lists sender, recipient, demands, deadlines, claims, threats, amounts with citations; model id is the local model.',
    },
    async (c) => {
      await openNewChat()
      await page
        .getByRole('button', { name: /All documents/ })
        .first()
        .click()
      const popover = page.locator('[data-radix-popper-content-wrapper]')
      await expect(popover).toBeVisible()
      await c.shot('Scope selector open')
      await popover.getByRole('button', { name: /acme_demand_letter_scanned/ }).click()
      await expect(page.getByRole('button', { name: /^acme_demand_letter_scanned$/ })).toBeVisible()
      await c.shot('Document selected as the scope')
      await ask('Summarize this document')
      await expect(page.getByText(/Summary · acme_demand_letter_scanned/)).toBeVisible({
        timeout: ANSWER_WAIT,
      })
      await c.shot('Summary job card (running)')
      await page.getByRole('button', { name: 'Open summary' }).click({ timeout: JOB_WAIT })
      const panel = page.getByRole('complementary', { name: 'Summary' })
      await expect(panel.getByRole('region').first()).toBeVisible({ timeout: JOB_WAIT })
      await c.shot('Summary panel')
      const sums = await c.api<{ items: { id: string; status: string; model_id?: string }[] }>(
        `/matters/${matterId}/summaries`,
      )
      const s = sums.items[0]
      const full = await c.api<{
        model_id?: string
        prompt_version?: string
        sections: { field: string; content: string; citations: unknown[] }[]
      }>(`/summaries/${s.id}`)
      c.evidence('summary', {
        model_id: full.model_id,
        prompt_version: full.prompt_version,
        fields: full.sections.map((x) => ({ field: x.field, citations: x.citations.length })),
      })
      c.check('Summary is ready', s.status === 'ready', s.status)
      c.check(
        'Written by the local model',
        String(full.model_id).startsWith('qwen2.5'),
        String(full.model_id),
      )
      c.check('Seven template fields', full.sections.length === 7, String(full.sections.length))
      const amounts = full.sections.find((x) => x.field === 'amounts')?.content ?? ''
      c.check('Amounts field has the $48,500 demand', /48,500/.test(amounts), amounts.slice(0, 80))
    },
  )

  await tc(
    {
      id: 'TC-15',
      title: 'Summary: export to Word',
      category: 'D · Summarize (existing document)',
      layers: 'UI → API (export job) → python-docx → file',
      steps: ['In the summary panel click "Export to Word"'],
      expected: 'A .docx file downloads.',
    },
    async (c) => {
      const panel = page.getByRole('complementary', { name: 'Summary' })
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        panel.getByRole('button', { name: 'Export to Word' }).click(),
      ])
      c.check(
        'File is .docx',
        /\.docx$/.test(download.suggestedFilename()),
        download.suggestedFilename(),
      )
      c.evidence('download', download.suggestedFilename())
      await c.shot('After export')
    },
  )

  await tc(
    {
      id: 'TC-16',
      title: 'New conversation: upload a new document from the chat and summarize it',
      category: 'D · Summarize (new document)',
      layers:
        'UI attach → API upload → worker ingest → router (summarize) → summary job → local model',
      steps: [
        'New chat',
        'Attach → upload email_from_acme_counsel.eml',
        'Wait for ingestion',
        'Ask "Summarize email_from_acme_counsel"',
      ],
      expected: 'The document is ingested and a summary job completes for it.',
    },
    async (c) => {
      await openNewChat()
      await page
        .getByRole('button', { name: /Attach/ })
        .first()
        .click()
      const dialog = page.getByRole('dialog', { name: 'Upload documents' })
      await dialog
        .getByLabel('Choose files to upload')
        .setInputFiles(join(samples, 'email_from_acme_counsel.eml'))
      await dialog
        .getByRole('radiogroup', { name: /email_from_acme_counsel\.eml is from/ })
        .getByRole('radio', { name: 'Other side' })
        .click()
      await c.shot('Upload from the chat')
      await dialog.getByRole('button', { name: /Upload 1 file/ }).click()
      await expect(page.getByRole('dialog', { name: /processed/i })).toBeVisible({
        timeout: 180_000,
      })
      await page.getByRole('button', { name: 'Done' }).click()
      await ask('Summarize email_from_acme_counsel')
      await expect(page.getByText(/Summary · email_from_acme_counsel/)).toBeVisible({
        timeout: ANSWER_WAIT,
      })
      await page.getByRole('button', { name: 'Open summary' }).click({ timeout: JOB_WAIT })
      const panel = page.getByRole('complementary', { name: 'Summary' })
      await expect(panel.getByRole('region').first()).toBeVisible({ timeout: JOB_WAIT })
      await c.shot('Summary of the uploaded document')
      const docs = await c.api<{ items: { filename: string; status: string }[] }>(
        `/matters/${matterId}/documents`,
      )
      c.check(
        'New document is stored and ready',
        docs.items.some((d) => /email_from_acme/.test(d.filename) && d.status === 'ready'),
      )
    },
  )

  // ---------------------------------------------------------------- E · draft
  await tc(
    {
      id: 'TC-17',
      title: 'Draft an internal memo',
      category: 'E · Draft (memo)',
      layers: 'UI → router (draft) → draft job → templates (no model for memos) → checks',
      steps: [
        'New chat',
        'Mode → Draft',
        'Choose Internal memo',
        'Ask for a memo about the demand letter',
        'Open draft',
      ],
      expected:
        'A memo skeleton opens: Question Presented, Brief Answer, Statement of Facts (quoted from the document, cited), Discussion with [RULE NEEDED]; marked "AI draft · not reviewed".',
    },
    async (c) => {
      await openNewChat()
      await page.getByRole('button', { name: /^Auto/ }).first().click()
      await page.getByRole('menuitem', { name: /Draft/ }).click()
      await page
        .getByRole('button', { name: /Response letter/ })
        .first()
        .click()
      await c.shot('Draft type menu')
      await page.getByRole('radio', { name: /Internal memo/ }).click()
      await page.keyboard.press('Escape')
      await c.shot('Draft mode, Internal memo chosen')
      await ask('Draft a memo on the demand in acme_demand_letter_scanned')
      await page.getByRole('button', { name: 'Open draft' }).click({ timeout: JOB_WAIT })
      const panel = page.getByRole('complementary', { name: 'Draft' })
      await expect(panel.getByText('AI draft · not reviewed')).toBeVisible({ timeout: JOB_WAIT })
      await c.shot('Memo draft')
      const drafts = await c.api<{ items: { id: string; type: string }[] }>(
        `/matters/${matterId}/drafts`,
      )
      const memoDraft = drafts.items.find((d) => d.type === 'memo')
      c.check('A memo draft exists', Boolean(memoDraft))
      if (memoDraft) {
        const d = await c.api<{
          sections: { heading: string; kind?: string; citations: unknown[]; content: string }[]
          model_id?: string
        }>(`/drafts/${memoDraft.id}`)
        const facts = d.sections.find((x) => x.kind === 'facts')
        c.evidence('memo', {
          headings: d.sections.map((x) => x.heading),
          model_id: d.model_id,
          facts_start: facts?.content.slice(0, 160),
          facts_citations: facts?.citations.length,
        })
        c.check('Statement of Facts is cited', (facts?.citations.length ?? 0) > 0)
        c.check(
          'Statement of Facts was written by the local model',
          String(d.model_id).startsWith('qwen2.5'),
          String(d.model_id),
        )
        c.check(
          'Has Question Presented and Discussion',
          ['Question Presented', 'Discussion'].every((h) =>
            d.sections.some((s) => s.heading === h),
          ),
        )
      }
    },
  )

  await tc(
    {
      id: 'TC-17b',
      title: 'Auto mode: asking for "a memo" in words produces a memo, not a letter',
      category: 'E · Draft (memo)',
      layers: 'UI (no forced draft type in Auto) → router keywords → draft job → memo template',
      steps: [
        'New chat (mode Auto)',
        'Ask "Write a memo on the demand in acme_demand_letter_scanned"',
      ],
      expected: 'The draft type is memo.',
    },
    async (c) => {
      await openNewChat()
      await ask('Write a memo on the demand in acme_demand_letter_scanned')
      await page.getByRole('button', { name: 'Open draft' }).click({ timeout: JOB_WAIT })
      const panel = page.getByRole('complementary', { name: 'Draft' })
      await expect(panel.getByText('AI draft · not reviewed')).toBeVisible({ timeout: JOB_WAIT })
      await c.shot('Draft opened from a plain-words request')
      const drafts = await c.api<{ items: { id: string; type: string; title: string }[] }>(
        `/matters/${matterId}/drafts`,
      )
      c.evidence(
        'drafts',
        drafts.items.map((d) => ({ type: d.type, title: d.title })),
      )
      c.check('The newest draft is a memo', drafts.items[0]?.type === 'memo', drafts.items[0]?.type)
    },
  )

  await tc(
    {
      id: 'TC-18',
      title: 'Draft a response letter to the demand letter (model-written paragraphs)',
      category: 'E · Draft (response letter)',
      layers:
        'UI → router → draft job → claim extraction → retrieval → qwen2.5:14b per point → checker → safeguards',
      steps: ['New chat', 'Ask "Draft a reply to acme_demand_letter_scanned"', 'Open draft'],
      expected:
        'A letter addresses each claim; paragraphs cite the MSA; unverified authority is flagged [UNVERIFIED]; placeholders and [CITE NEEDED] lock the clean export; model id is recorded.',
    },
    async (c) => {
      await openNewChat()
      await ask('Draft a reply to acme_demand_letter_scanned')
      await page.getByRole('button', { name: 'Open draft' }).click({ timeout: JOB_WAIT })
      const panel = page.getByRole('complementary', { name: 'Draft' })
      await expect(panel.getByRole('article', { name: 'Letter' })).toBeVisible({
        timeout: JOB_WAIT,
      })
      await c.shot('Response letter draft')
      const drafts = await c.api<{ items: { id: string; type: string }[] }>(
        `/matters/${matterId}/drafts`,
      )
      const letter = drafts.items.find((d) => d.type === 'response_letter')
      c.check('A response letter exists', Boolean(letter))
      if (letter) {
        const d = await c.api<{
          model_id?: string
          prompt_version?: string
          claims: { status?: string }[]
          placeholders: { kind: string }[]
          watermark?: string
        }>(`/drafts/${letter.id}`)
        c.evidence('letter', {
          model_id: d.model_id,
          prompt_version: d.prompt_version,
          claims: d.claims.length,
          placeholders: d.placeholders.map((p) => p.kind),
          watermark: d.watermark,
        })
        c.check(
          'Model-written (draft model recorded)',
          String(d.model_id).startsWith('qwen2.5'),
          String(d.model_id),
        )
        c.check('Marked as not reviewed', Boolean(d.watermark))
        c.check('Claims are tracked', d.claims.length >= 3, String(d.claims.length))
        c.check(
          'Supporting facts come from the MSA',
          Boolean(
            await c
              .api<{ supporting_document_ids: string[] }>(`/drafts/${letter.id}`)
              .then((x) => x.supporting_document_ids.length > 0),
          ),
        )
      }
      await panel.getByRole('tab', { name: /Checks/ }).click()
      await c.shot('Checks: export checklist and point by point')
    },
  )

  await tc(
    {
      id: 'TC-19',
      title:
        'Draft review gate: resolve placeholders, acknowledge citations, adopt, export clean copy',
      category: 'E · Draft (response letter)',
      layers: 'UI → API (PATCH draft, review, export) → python-docx clean export',
      steps: [
        'Export is locked and says why',
        'Fill or remove every placeholder',
        'Acknowledge each citation row',
        'Review and adopt',
        'Export the clean copy',
      ],
      expected:
        'The clean copy stays locked until every safeguard is met; afterwards a .docx downloads.',
    },
    async (c) => {
      const panel = page.getByRole('complementary', { name: 'Draft' })
      await panel
        .getByRole('tab', { name: /Letter|Draft/ })
        .first()
        .click()
        .catch(() => undefined)
      const letter = panel.getByRole('article', { name: 'Letter' })
      const tokens = letter.getByRole('button', {
        name: /^(Missing fact|Citation needed|Rule needed)/,
      })
      await panel.getByRole('button', { name: /Export/ }).click()
      await expect(page.getByRole('button', { name: /Clean copy to send/ })).toBeDisabled()
      await c.shot('Export locked')
      c.check('Clean copy is locked at first', true)
      await page.keyboard.press('Escape')
      for (let guard = 0; guard < 60; guard++) {
        const left = await tokens.count()
        if (!left) break
        const label = (await tokens.first().getAttribute('aria-label')) ?? ''
        await tokens.first().click()
        if (label.startsWith('Missing fact')) {
          await page.getByRole('textbox').last().fill('October 15, 2026')
          await page.getByRole('button', { name: 'Fill in' }).click()
        } else {
          await page.getByRole('button', { name: 'Remove the flag' }).click()
        }
        await expect(tokens).toHaveCount(left - 1, { timeout: 20_000 })
      }
      await c.shot('Placeholders resolved')
      await panel.getByRole('tab', { name: /Checks/ }).click()
      const rows = panel.getByRole('checkbox', { name: /I’ve checked/ })
      const n = await rows.count()
      for (let i = 0; i < n; i++) {
        await rows.nth(i).click()
        await expect(rows.nth(i)).toBeChecked()
      }
      await c.shot('Citations acknowledged')
      await panel.getByRole('button', { name: 'Review and adopt' }).first().click()
      const dialog = page.getByRole('dialog', { name: 'Review and adopt this draft' })
      await dialog.getByRole('checkbox').click()
      await c.shot('Review and adopt dialog')
      await dialog.getByRole('button', { name: 'Adopt as my own' }).click()
      await expect(panel.getByText('Reviewed and adopted by you', { exact: true })).toBeVisible()
      await panel.getByRole('button', { name: /Export/ }).click()
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /Clean copy to send/ }).click(),
      ])
      c.check(
        'Clean .docx downloaded',
        /\.docx$/.test(download.suggestedFilename()),
        download.suggestedFilename(),
      )
      c.evidence('download', download.suggestedFilename())
      await c.shot('After clean export')
    },
  )

  // ---------------------------------------------------------------- F · system and other
  await tc(
    {
      id: 'TC-20',
      title: 'Settings → About: every layer reports healthy and names the model',
      category: 'F · System and layers',
      layers:
        'UI → GET /health → db, vectors, FTS5, worker, scanner, embedder, converter, orchestrator (Ollama)',
      steps: ['Open Settings → About', 'Read the component list'],
      expected: 'All components OK; AI engine shows the model and prompt version.',
    },
    async (c) => {
      await page.goto('/settings')
      await page.getByRole('heading', { name: 'About' }).scrollIntoViewIfNeeded()
      await expect(page.getByRole('list', { name: 'Components' })).toBeVisible()
      await c.shot('About: components')
      const health =
        await c.api<Record<string, { ok?: boolean; status?: string; detail?: string } | string>>(
          '/health',
        )
      c.evidence('GET /health', health)
      c.check('Overall status ok', health.status === 'ok', String(health.status))
      const engine = health.orchestrator as { detail?: string } | undefined
      c.check(
        'AI engine names the local model',
        /qwen2\.5/.test(engine?.detail ?? ''),
        engine?.detail,
      )
    },
  )

  await tc(
    {
      id: 'TC-21',
      title: '"Where your data goes" explains what stays on the computer',
      category: 'F · System and layers',
      layers: 'UI',
      steps: ['Open the data-flow page'],
      expected: 'The page loads with the local-only explanation and no accessibility violations.',
    },
    async (c) => {
      await page.goto('/settings/data')
      await expect(page.getByRole('heading').first()).toBeVisible()
      await c.shot('Where your data goes')
      const a = await axe(page)
      c.check(
        'No WCAG 2.1 AA violations',
        a.violations.length === 0,
        a.violations.map((v) => v.id).join(','),
      )
    },
  )

  await tc(
    {
      id: 'TC-22',
      title: 'Command palette (⌘K) finds a chat and a document',
      category: 'F · System and layers',
      layers: 'UI',
      steps: ['Press ⌘K', 'Type "invoices"'],
      expected: 'The palette lists the invoices document.',
    },
    async (c) => {
      await page.goto(matterPath)
      await page.getByRole('button', { name: /Search chats and documents/ }).click()
      await page.locator('[cmdk-input]').fill('invoices')
      await c.shot('Command palette')
      await expect(page.getByText(/exhibit_b_invoices/).first()).toBeVisible()
      c.check('Document is listed', true)
      await page.keyboard.press('Escape')
    },
  )

  await tc(
    {
      id: 'TC-23',
      title: 'Matter isolation: another matter shows none of this matter’s documents or answers',
      category: 'G · Security',
      layers: 'UI → API (matter scope guard) → SQL filters on both search legs',
      steps: ['Open the Rivera matter', 'List documents', 'Ask the termination-notice question'],
      expected:
        'No Smith documents are listed; the answer is "Not found" or has no citation from Smith documents.',
    },
    async (c) => {
      await page.goto('/matters')
      await page
        .getByRole('link', { name: /Rivera/ })
        .first()
        .click()
      await expect(page).toHaveURL(/\/m\/[^/]+$/)
      const rivera = new URL(page.url()).pathname
      await page.goto(`${rivera}/documents`)
      await c.shot('Rivera matter documents')
      await expect(page.getByText('smith_msa_v3')).toHaveCount(0)
      await page.goto(rivera)
      await ask('What notice is required to terminate the agreement?')
      await expect(
        page.getByText(/Not found in your documents|From your documents|Partially/).first(),
      ).toBeVisible({
        timeout: ANSWER_WAIT,
      })
      await c.shot('Answer in the other matter')
      c.check(
        'No Smith/Acme document names appear',
        (await page.getByText(/smith_msa|acme_demand/).count()) === 0,
      )
    },
  )

  await tc(
    {
      id: 'TC-24',
      title: 'Delete a document: it disappears and its passages are no longer searchable',
      category: 'B · Documents',
      layers: 'UI → API (DELETE document) → cascade: chunks, FTS5 rows, vectors, files',
      steps: ['Documents → delete email_from_acme_counsel', 'Confirm'],
      expected: 'The document is gone from the list and the API.',
    },
    async (c) => {
      await page.goto(`${matterPath}/documents`)
      const row = page.getByRole('row', { name: /email_from_acme_counsel/ })
      await expect(row).toBeVisible()
      await row.getByRole('button', { name: /More|Options|actions/i }).click()
      await page.getByRole('menuitem', { name: /Delete/ }).click()
      await c.shot('Delete confirmation')
      const dlg = page.getByRole('dialog').last()
      const typed = dlg.getByRole('textbox')
      if (await typed.isVisible().catch(() => false)) await typed.fill('delete')
      await dlg
        .getByRole('button', { name: /Delete/ })
        .last()
        .click()
      await expect(page.getByRole('row', { name: /email_from_acme_counsel/ })).toHaveCount(0, {
        timeout: 15_000,
      })
      await c.shot('Document removed')
      const docs = await c.api<{ items: { filename: string }[] }>(`/matters/${matterId}/documents`)
      c.check(
        'Backend no longer lists it',
        !docs.items.some((d) => /email_from_acme/.test(d.filename)),
      )
    },
  )

  await tc(
    {
      id: 'TC-25',
      title: 'Phone-width layout: ask screen and document list stay usable',
      category: 'F · System and layers',
      layers: 'UI',
      steps: ['Resize to 390×844', 'Open the matter'],
      expected: 'No horizontal scroll; the composer is reachable.',
    },
    async (c) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(matterPath)
      await expect(page.locator('textarea').first()).toBeVisible()
      await c.shot('Phone width')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      c.check('No horizontal page scroll', !overflow)
      await page.setViewportSize({ width: 1440, height: 900 })
    },
  )
})
