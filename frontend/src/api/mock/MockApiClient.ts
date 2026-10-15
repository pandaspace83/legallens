import type { ApiClient } from '@/api/client'
import type { MatterEvent } from '@/api/events'
import {
  answerFor,
  CLARIFY_WHICH_DOCUMENT,
  CLARIFY_WHICH_INCOMING,
  DRAFT_STARTED,
  SUMMARY_STARTED,
} from '@/api/mock/answerEngine'
import { claimResponse, initialDraft, rewriteSection } from '@/api/mock/draftScripts'
import { estimatePages, runDraft, runIngest, runSummary } from '@/api/mock/jobSimulator'
import { mockControls, registerMockActions, SimulatedOutage } from '@/api/mock/devControls'
import { delay } from '@/api/mock/latency'
import { documentNamedIn, summaryFor } from '@/api/mock/summaryScripts'
import { latency } from '@/api/mock/latency'
import { streamAnswer, type PendingRun } from '@/api/mock/runStreamer'
import { createSeed } from '@/api/mock/seed'
import { largeData } from '@/api/mock/seed/largeData'
import type {
  Conversation,
  AuditEntry,
  Draft,
  DraftType,
  ID,
  LegalDocument,
  Matter,
  MatterInput,
  Message,
  Summary,
  SummaryAudience,
  SummaryTemplate,
} from '@/api/types'
import { computeChecks, exportBlockers } from '@/api/mock/draftChecks'
import { draftToWordHtml, summaryToWordHtml, wordBlob } from '@/api/mock/exportWord'
import { sha256 } from '@/lib/hash'
import { newId } from '@/lib/ids'

// In-memory implementation of ApiClient (FE-2.2). Data lives for the session; persistence and the dev
// panel arrive in FE-2.6. The demo MFA code is 123456.
export function createMockApiClient(): ApiClient {
  const db = createSeed()
  const runs = new Map<ID, PendingRun>()
  // Turns that start a job or ask a question back, instead of answering from the documents.
  const special = new Map<
    ID,
    | { kind: 'summarize'; documentId: ID; template: SummaryTemplate; audience: SummaryAudience }
    | { kind: 'draft'; type: DraftType; incomingDocumentId: ID; instructions: string }
    | { kind: 'clarify'; text: string }
  >()
  // The demo has scripted drafts for replies to the Whitfield & Crane demand letter only.
  const DRAFTABLE = new Set(['doc-demand'])
  const pause = (ms: number, signal?: AbortSignal) =>
    import.meta.env.MODE === 'test' ? Promise.resolve() : delay(ms, signal)
  const listeners = new Map<ID, Set<(event: MatterEvent) => void>>()
  const emitTo = (matterId: ID) => (event: MatterEvent) =>
    listeners.get(matterId)?.forEach((fn) => fn(event))

  // Seeded documents that were mid-ingestion carry on, so the demo shows one finishing.
  for (const doc of db.documents) {
    if (doc.status === 'processing') runIngest(doc, newId('job'), emitTo(doc.matterId))
  }

  const byNewest = <T extends { updatedAt: string }>(a: T, b: T) =>
    b.updatedAt.localeCompare(a.updatedAt)

  function findConversation(id: ID): Conversation {
    const conversation = db.conversations.find((c) => c.id === id)
    if (!conversation) throw new Error('This conversation no longer exists.')
    return conversation
  }

  function startSummary(input: {
    matterId: ID
    documentId: ID
    template: SummaryTemplate
    audience: SummaryAudience
    conversationId?: ID
  }) {
    const document = db.documents.find((d) => d.id === input.documentId)
    if (!document) throw new Error('This document no longer exists.')
    if (document.status !== 'ready')
      throw new Error(`${document.name} is still processing. Summarize it when it’s ready.`)
    const summary: Summary = {
      id: newId('sum'),
      ...input,
      documentName: document.name,
      status: 'processing',
      progress: 0,
      stepDetail: 'Waiting to start',
      sections: [],
      citations: [],
      modelLabel: 'Local model · prompt v0.3',
      createdAt: new Date().toISOString(),
    }
    db.summaries.unshift(summary)
    const jobId = newId('job')
    runSummary(summary, document.pages, jobId, emitTo(input.matterId), () => {
      Object.assign(
        summary,
        summaryFor(document.id, summary.template, summary.audience, summary.id),
        {
          status: 'ready',
          progress: undefined,
          step: undefined,
          stepDetail: undefined,
          coverage: document.coverage,
        },
      )
    })
    return { summary, jobId }
  }

  function startDraft(input: {
    matterId: ID
    type: DraftType
    incomingDocumentId: ID
    supportingDocumentIds: ID[]
    instructions: string
    conversationId?: ID
  }) {
    const incoming = db.documents.find((d) => d.id === input.incomingDocumentId)
    if (!incoming) throw new Error('The document you are responding to no longer exists.')
    if (!DRAFTABLE.has(incoming.id)) {
      throw new Error(
        'This demo drafts replies to the Whitfield & Crane demand letter. Choose it as the document you’re responding to.',
      )
    }
    const matter = db.matters.find((m) => m.id === input.matterId)
    const now = new Date().toISOString()
    const memo = input.type === 'memo'
    const draft: Draft = {
      id: newId('draft'),
      ...input,
      title: memo
        ? 'Interest claimed in Acme’s demand'
        : 'Response to your letter of September 29, 2026',
      incomingDocumentName: incoming.name,
      status: 'drafting',
      progress: 0,
      stepDetail: 'Waiting to start',
      addressee: memo
        ? undefined
        : {
            name: matter?.opposingCounsel?.name ?? matter?.opposingParty ?? '',
            firm: matter?.opposingCounsel?.firm,
            address: ['88 Kearny Street, Suite 1400', 'San Francisco, CA 94108'],
            represented: Boolean(matter?.opposingCounsel),
          },
      memoHeader: memo
        ? {
            to: `${matter?.name ?? 'Matter'} file`,
            from: db.user.name,
            re: 'Whether Acme can recover interest at 1.5% per month',
          }
        : undefined,
      dateLine: new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
      sections: [],
      citations: [],
      claims: [],
      addedAuthorities: [],
      acknowledged: [],
      safeguards: { fre408: false, reservationOfRights: false },
      version: 0,
      versions: [],
      modelLabel: 'Local model · prompt v0.3',
      createdAt: now,
      updatedAt: now,
    }
    db.drafts.unshift(draft)
    const script = initialDraft(input.type, draft.id)
    const jobId = newId('job')
    runDraft(
      draft,
      incoming.pages,
      script.sections.map((s) => s.label),
      jobId,
      emitTo(input.matterId),
      () => {
        const at = new Date().toISOString()
        Object.assign(draft, script, {
          status: 'not_reviewed',
          progress: undefined,
          step: undefined,
          stepDetail: undefined,
          version: 1,
          versions: [
            {
              version: 1,
              label: 'AI draft',
              createdAt: at,
              sections: structuredClone(script.sections),
            },
          ],
          updatedAt: at,
        })
      },
    )
    return { draft, jobId }
  }

  function findDraft(id: ID) {
    const draft = db.drafts.find((d) => d.id === id)
    if (!draft) throw new Error('This draft no longer exists.')
    return draft
  }

  /** The audience a request asks for in words, e.g. "for the client". */
  function audienceIn(text: string): SummaryAudience | undefined {
    if (/plain english|for the client|for my client/i.test(text)) return 'plain_english'
    if (/one paragraph|short|brief/i.test(text)) return 'one_paragraph'
    return undefined
  }

  function scopeLabel(matterId: ID, scope: { kind: 'all' } | { kind: 'document'; documentId: ID }) {
    if (scope.kind === 'document')
      return db.documents.find((d) => d.id === scope.documentId)?.name ?? 'One document'
    const ready = db.documents.filter((d) => d.matterId === matterId && d.status === 'ready').length
    return `All ${ready} documents in this matter`
  }

  // First-run guide (FE-8.5): the dev panel can add a matter with no documents or chats yet.
  const addEmptyMatter = () => {
    const id = newId('matter')
    db.matters.unshift({
      id,
      name: 'Okafor employment claim',
      clientName: 'Grace Okafor',
      ourSide: 'Claimant',
      opposingParty: 'Brightline Logistics Inc.',
      opposingCounsel: null,
      court: 'Not yet filed',
      practiceArea: 'Employment',
      status: 'open',
      documentCount: 0,
      updatedAt: new Date().toISOString(),
    })
    return id
  }

  const loadLargeData = (matterId: string) => {
    if (db.conversations.some((c) => c.id.startsWith('bulk-'))) return
    const bulk = largeData(matterId)
    db.conversations.push(...bulk.conversations)
    db.documents.push(...bulk.documents)
    const matter = db.matters.find((m) => m.id === matterId)
    if (matter) matter.documentCount += bulk.documents.length
  }

  const client: ApiClient = {
    kind: 'mock',

    async signIn(email, password) {
      await latency(500, 800)
      if (!email.trim() || !password) throw new Error('Enter your email and password.')
      return { mfaRequired: true }
    },

    async verifyMfa(code) {
      await latency(500, 800)
      if (code !== '123456')
        throw new Error('That code didn’t match. Check your authenticator app and try again.')
      return db.user
    },

    async getMe() {
      await latency()
      return db.user
    },

    async updateLicensingStates(states) {
      await latency(100, 200)
      db.user.licensingStates = [...new Set(states)].sort()
      return { ...db.user }
    },

    async signOut() {
      await latency(100, 200)
    },

    async listMatters() {
      await latency()
      return [...db.matters].sort(byNewest)
    },

    async getMatter(matterId) {
      await latency()
      const matter = db.matters.find((m) => m.id === matterId)
      if (!matter) throw new Error('This matter doesn’t exist or was deleted.')
      return matter
    },

    async createMatter(input) {
      await latency(250, 450)
      const matter: Matter = {
        id: newId('matter'),
        name: input.name,
        clientName: input.clientName,
        ourSide: input.ourSide,
        opposingParty: input.opposingParty ?? '',
        opposingCounsel: input.opposingCounsel ?? null,
        court: input.court ?? '',
        practiceArea: input.practiceArea ?? '',
        status: 'open',
        documentCount: 0,
        updatedAt: new Date().toISOString(),
        aiConsent: input.aiConsent,
      }
      db.matters.unshift(matter)
      return structuredClone(matter)
    },

    async updateMatter(matterId, patch: Partial<MatterInput>) {
      await latency(200, 350)
      const matter = db.matters.find((m) => m.id === matterId)
      if (!matter) throw new Error('This matter doesn’t exist or was deleted.')
      if (matter.status === 'closed') throw new Error('This matter is closed, so it is read-only.')
      Object.assign(matter, patch, { updatedAt: new Date().toISOString() })
      return structuredClone(matter)
    },

    async closeMatter(matterId) {
      await latency(200, 350)
      const matter = db.matters.find((m) => m.id === matterId)
      if (!matter) throw new Error('This matter doesn’t exist or was deleted.')
      matter.status = 'closed'
      return structuredClone(matter)
    },

    async exportMatter(matterId) {
      await latency(400, 700)
      const matter = db.matters.find((m) => m.id === matterId)
      if (!matter) throw new Error('This matter doesn’t exist or was deleted.')
      const lines = db.documents.filter((d) => d.matterId === matterId).map((d) => d.name)
      return {
        blob: new Blob([`${matter.name}\n\n${lines.join('\n')}\n`], { type: 'text/plain' }),
        filename: `${matter.name} – matter export.txt`,
      }
    },

    async deleteMatter(matterId, confirmName) {
      await latency(300, 500)
      const index = db.matters.findIndex((m) => m.id === matterId)
      if (index >= 0 && db.matters[index]!.name.trim() !== confirmName.trim())
        throw new Error('Type the matter’s name exactly to delete it.')
      if (index >= 0) db.matters.splice(index, 1)
    },

    async getAudit(matterId) {
      await latency()
      const entries: AuditEntry[] = db.documents
        .filter((d) => d.matterId === matterId)
        .map((d, i) => ({
          id: String(i + 1),
          at: d.uploadedAt,
          action: 'document.upload',
          entityType: 'document',
          entityId: d.id,
        }))
      return { entries, chainValid: true }
    },

    async listConversations(matterId) {
      await latency()
      return db.conversations.filter((c) => c.matterId === matterId).sort(byNewest)
    },

    async listMessages(conversationId) {
      await latency()
      findConversation(conversationId)
      return db.messages.filter((m) => m.conversationId === conversationId)
    },

    async updateConversation(conversationId, patch) {
      await latency(100, 250)
      const conversation = findConversation(conversationId)
      Object.assign(conversation, patch)
      return { ...conversation }
    },

    async deleteConversation(conversationId) {
      await latency(100, 250)
      db.conversations = db.conversations.filter((c) => c.id !== conversationId)
      db.messages = db.messages.filter((m) => m.conversationId !== conversationId)
    },

    async sendMessage({ matterId, conversationId, content, scope, mode, summary, draft }) {
      await latency(120, 220)
      if (mockControls.get().engineOffline) {
        throw new Error('The local AI engine isn’t running, so new questions are paused.')
      }
      const now = new Date().toISOString()
      let conversation = conversationId ? findConversation(conversationId) : undefined
      if (!conversation) {
        conversation = {
          id: newId('c'),
          matterId,
          title: answerFor(matterId, content, 'title').title,
          pinned: false,
          createdAt: now,
          updatedAt: now,
        }
        db.conversations.push(conversation)
      }
      conversation.updatedAt = now

      const messageId = newId('m')
      db.messages.push({
        id: messageId,
        conversationId: conversation.id,
        role: 'user',
        content,
        createdAt: now,
      })

      const runId = newId('run')
      // The intent router (frame 4): a summary request becomes a background job; without a document, ask which.
      if (mode === 'summarize' || (mode === 'auto' && /\bsummar(y|i[sz]e)/i.test(content))) {
        const named = scope.kind === 'document' ? scope.documentId : documentNamedIn(content)
        const target = db.documents.find(
          (d) => d.id === named && d.matterId === matterId && d.status === 'ready',
        )
        special.set(
          runId,
          target
            ? {
                kind: 'summarize',
                documentId: target.id,
                template: summary?.template ?? 'letter_demand',
                audience: audienceIn(content) ?? summary?.audience ?? 'detailed',
              }
            : { kind: 'clarify', text: CLARIFY_WHICH_DOCUMENT },
        )
      } else if (
        mode === 'draft' ||
        (mode === 'auto' && /\b(draft|reply|respond|response letter|memo)\b/i.test(content))
      ) {
        // A draft needs the document being answered; the demo can draft replies to the demand letter.
        const named = scope.kind === 'document' ? scope.documentId : documentNamedIn(content)
        special.set(
          runId,
          named && DRAFTABLE.has(named)
            ? {
                kind: 'draft',
                type: /\bmemo\b/i.test(content) ? 'memo' : (draft?.type ?? 'response_letter'),
                incomingDocumentId: named,
                instructions: content,
              }
            : { kind: 'clarify', text: CLARIFY_WHICH_INCOMING },
        )
      }
      runs.set(runId, {
        runId,
        matterId,
        conversationId: conversation.id,
        question: content,
        scopeLabel: scopeLabel(matterId, scope),
      })
      return { conversationId: conversation.id, messageId, runId }
    },

    async cancelRun() {
      // The mock stops when its stream is aborted.
    },

    async sendFeedback() {
      await latency(100, 200)
    },

    async getCitation(citationId) {
      await latency(100, 200)
      const found = db.messages.flatMap((m) => m.citations ?? []).find((c) => c.id === citationId)
      if (!found) throw new Error('This citation no longer exists.')
      return structuredClone(found)
    },

    async streamRun(runId, onEvent, signal) {
      const run = runs.get(runId)
      if (!run) throw new Error('This answer is no longer available.')
      runs.delete(runId)

      const turn = special.get(runId)
      if (turn) {
        special.delete(runId)
        const messageId = `${runId}-answer`
        const message: Message = {
          id: messageId,
          conversationId: run.conversationId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        }
        onEvent({ type: 'run.started', runId, messageId })
        onEvent({ type: 'intent', intent: turn.kind, confidence: 0.91 })
        onEvent({ type: 'status', step: 'rewriting' })
        await pause(500, signal)
        if (turn.kind === 'summarize') {
          const { summary, jobId } = startSummary({
            matterId: run.matterId,
            conversationId: run.conversationId,
            ...turn,
          })
          message.job = { kind: 'summarize', summaryId: summary.id }
          message.content = SUMMARY_STARTED(summary.documentName, turn.template, turn.audience)
          onEvent({ type: 'job', jobId, kind: 'summarize', summaryId: summary.id })
        } else if (turn.kind === 'draft') {
          const { draft, jobId } = startDraft({
            matterId: run.matterId,
            conversationId: run.conversationId,
            supportingDocumentIds: [],
            ...turn,
          })
          message.job = { kind: 'draft', draftId: draft.id }
          message.content = DRAFT_STARTED(turn.type, draft.incomingDocumentName)
          onEvent({ type: 'job', jobId, kind: 'draft', draftId: draft.id })
        } else {
          message.content = turn.text
        }
        onEvent({ type: 'status', step: 'generating' })
        for (const token of message.content.match(/\S+\s*/g) ?? []) {
          await pause(12, signal)
          onEvent({ type: 'token', delta: token })
        }
        db.messages.push(message)
        onEvent({ type: 'done', messageId })
        return
      }

      await streamAnswer(run, onEvent, (message) => db.messages.push(message), signal)
    },

    async listDocuments(matterId) {
      await latency()
      // Copies, because ingestion keeps changing the stored records.
      return structuredClone(db.documents.filter((d) => d.matterId === matterId))
    },

    async getDocumentPages(documentId) {
      await latency(200, 400)
      return db.pages.filter((p) => p.documentId === documentId).sort((a, b) => a.page - b.page)
    },

    async uploadDocument(matterId, file, origin, onProgress) {
      await latency(250, 450)
      onProgress?.(1)
      if (mockControls.get().scannerOffline) {
        throw new Error(
          'The malware scanner isn’t responding, so uploads are paused. Nothing was stored.',
        )
      }
      const kind = (file.name.toLowerCase().split('.').pop() ?? 'txt') as LegalDocument['kind']
      const hash = await sha256(await file.arrayBuffer())
      const duplicate = db.documents.find((d) => d.matterId === matterId && d.sha256 === hash)
      if (duplicate) throw new Error(`Already in this matter as “${duplicate.name}”.`)

      const document = {
        id: newId('doc'),
        matterId,
        name: file.name,
        kind,
        origin,
        pages: estimatePages(kind, file.size),
        status: 'queued' as const,
        progress: 0,
        step: 'checking' as const,
        stepDetail: 'Waiting to start',
        sizeBytes: file.size,
        sha256: hash,
        uploadedAt: new Date().toISOString(),
      }
      db.documents.unshift(document)
      const matter = db.matters.find((m) => m.id === matterId)
      if (matter) matter.documentCount += 1

      const jobId = newId('job')
      runIngest(document, jobId, emitTo(matterId))
      return { document: structuredClone(document), jobId }
    },

    async getHiddenContent(documentId) {
      await latency(150, 300)
      const document = db.documents.find((d) => d.id === documentId)
      return structuredClone(document?.hiddenItems ?? [])
    },

    async getDeletionImpact(documentId) {
      await latency(150, 300)
      const document = db.documents.find((d) => d.id === documentId)
      if (!document) throw new Error('This document no longer exists.')
      const citing = db.messages.filter((m) =>
        m.citations?.some((c) => c.documentId === documentId),
      )
      return {
        pages: document.pages,
        passages: document.status === 'ready' ? document.pages * 8 : 0,
        citations: citing.reduce(
          (n, m) => n + (m.citations?.filter((c) => c.documentId === documentId).length ?? 0),
          0,
        ),
        conversations: new Set(citing.map((m) => m.conversationId)).size,
      }
    },

    async deleteDocument(documentId) {
      await latency(250, 450)
      const document = db.documents.find((d) => d.id === documentId)
      if (!document) return
      // Real deletion (DEC-58): the file, its pages, its index entries and the citations to it.
      db.documents = db.documents.filter((d) => d.id !== documentId)
      db.pages = db.pages.filter((p) => p.documentId !== documentId)
      for (const m of db.messages) {
        if (m.citations) m.citations = m.citations.filter((c) => c.documentId !== documentId)
      }
      const matter = db.matters.find((m) => m.id === document.matterId)
      if (matter) matter.documentCount -= 1
    },

    async listDrafts(matterId) {
      await latency()
      return structuredClone(db.drafts.filter((d) => d.matterId === matterId))
    },

    async getDraft(draftId) {
      await latency(150, 300)
      return structuredClone(findDraft(draftId))
    },

    async createDraft(input) {
      await latency(200, 350)
      const { draft, jobId } = startDraft(input)
      return { draft: structuredClone(draft), jobId }
    },

    async updateDraft(draftId, patch) {
      await latency(150, 300)
      const draft = findDraft(draftId)
      const now = new Date().toISOString()
      let sections = patch.sections
      let label = patch.versionLabel ?? 'Edited'
      if (patch.restoreVersion) {
        const version = draft.versions.find((v) => v.version === patch.restoreVersion)
        if (!version) throw new Error('That version no longer exists.')
        sections = structuredClone(version.sections)
        label = `Restored version ${version.version}`
      }
      const changesLetter = Boolean(sections) || patch.safeguards !== undefined
      if (sections) {
        draft.sections = sections
        draft.version += 1
        draft.versions.unshift({
          version: draft.version,
          label,
          createdAt: now,
          sections: structuredClone(sections),
        })
      }
      if (patch.claims) draft.claims = patch.claims
      if (patch.addedAuthorities) draft.addedAuthorities = patch.addedAuthorities
      if (patch.acknowledged) draft.acknowledged = patch.acknowledged
      if (patch.safeguards) draft.safeguards = { ...draft.safeguards, ...patch.safeguards }
      // An adopted draft that changes is no longer the version the lawyer reviewed (DEC-51).
      if (changesLetter && draft.status === 'reviewed_adopted') {
        draft.status = 'not_reviewed'
        draft.reviewedAt = undefined
      }
      draft.updatedAt = now
      return structuredClone(draft)
    },

    async proposeSectionRewrite(draftId, sectionId, instruction) {
      await latency(900, 1400)
      const draft = findDraft(draftId)
      const section = draft.sections.find((s) => s.id === sectionId)
      if (!section) throw new Error('That section no longer exists.')
      return { body: rewriteSection(draft.type, section, instruction) }
    },

    async proposeClaimResponse(draftId, claimId) {
      await latency(900, 1400)
      findDraft(draftId)
      const section = claimResponse(claimId)
      if (!section) throw new Error('No response could be drafted for that claim.')
      return { section: structuredClone(section) }
    },

    async reviewDraft(draftId) {
      await latency(200, 350)
      const draft = findDraft(draftId)
      const open = exportBlockers(draft).filter((b) => b.key !== 'review')
      if (open.length)
        throw new Error(`Resolve these first: ${open.map((b) => b.message).join('; ')}.`)
      draft.status = 'reviewed_adopted'
      draft.reviewedAt = new Date().toISOString()
      return structuredClone(draft)
    },

    async getDraftChecks(draftId) {
      await latency(100, 200)
      return computeChecks(findDraft(draftId))
    },

    async exportDraft(draftId, kind) {
      await latency(300, 500)
      const draft = findDraft(draftId)
      if (kind === 'clean') {
        const open = exportBlockers(draft)
        if (open.length)
          throw new Error(
            `The clean copy can’t be exported yet: ${open.map((b) => b.message).join('; ')}.`,
          )
      }
      const base = draft.type === 'memo' ? 'Memo' : 'Letter'
      const filename = `${base} – ${draft.title}${kind === 'working' ? ' (working copy)' : ''}.doc`
      const clientName = db.matters.find((m) => m.id === draft.matterId)?.clientName ?? ''
      const html = draftToWordHtml(draft, kind, { name: db.user.name, clientName })
      return { blob: wordBlob(html), filename }
    },

    async listSummaries(matterId) {
      await latency()
      return structuredClone(db.summaries.filter((s) => s.matterId === matterId))
    },

    async getSummary(summaryId) {
      await latency(150, 300)
      const summary = db.summaries.find((s) => s.id === summaryId)
      if (!summary) throw new Error('This summary no longer exists.')
      return structuredClone(summary)
    },

    async createSummary(input) {
      await latency(200, 350)
      const { summary, jobId } = startSummary(input)
      return { summary: structuredClone(summary), jobId }
    },

    async exportSummary(summaryId) {
      await latency(250, 450)
      const summary = db.summaries.find((x) => x.id === summaryId)
      if (!summary) throw new Error('This summary no longer exists.')
      return {
        blob: wordBlob(summaryToWordHtml(summary)),
        filename: `Summary – ${summary.documentName}.doc`,
      }
    },

    async getHealth() {
      // The same components the backend reports, driven by the dev panel's switches (FE-2.6, FE-8.3).
      const c = mockControls.get()
      if (c.unreachable) throw new SimulatedOutage()
      const components = [
        { name: 'db', kind: 'sqlite', ok: true, detail: 'legallens.db' },
        {
          name: 'worker',
          kind: 'worker',
          ok: !c.workerStopped,
          detail: c.workerStopped ? 'not running' : 'last heartbeat 2s ago',
        },
        {
          name: 'scanner',
          kind: 'clamd',
          ok: !c.scannerOffline,
          detail: c.scannerOffline ? 'not responding' : undefined,
        },
        { name: 'embedder', kind: 'hashing', ok: true, detail: '384 dimensions' },
        { name: 'converter', kind: 'docling', ok: true },
        {
          name: 'orchestrator',
          kind: 'mock',
          ok: !c.engineOffline,
          detail: c.engineOffline ? 'not running' : 'Local model · prompt v0.3',
        },
        {
          name: 'storage',
          kind: 'disk',
          ok: !c.storageLow,
          detail: c.storageLow ? '1.2 GB free (2%)' : '182 GB free',
        },
      ]
      return {
        status: components.every((x) => x.ok) ? 'ok' : 'degraded',
        version: 'mock',
        components,
      }
    },

    async getJob(jobId) {
      return { id: jobId, kind: 'unknown', status: 'done', progress: 100 }
    },

    async cancelJob() {},

    subscribeMatterEvents(matterId, onEvent) {
      const set = listeners.get(matterId) ?? new Set()
      set.add(onEvent)
      listeners.set(matterId, set)
      return () => set.delete(onEvent)
    },
  }
  registerMockActions(client, { addEmptyMatter, loadLargeData })
  return client
}
