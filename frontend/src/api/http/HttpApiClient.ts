import type { ApiClient } from '@/api/client'
import type { components } from '@/api/http/schema'
import type { MatterEvent } from '@/api/events'
import {
  BASE,
  ApiError,
  request,
  requestFile,
  setUnauthorizedHandler,
  walk,
} from '@/api/http/request'
import { readSse } from '@/api/http/sse'
import {
  toAuditEntry,
  toCitation,
  toConversation,
  toDeletionImpact,
  toDocument,
  toDraft,
  toDraftChecks,
  toHiddenItems,
  toJobStatus,
  toDraftFromListItem,
  toHealth,
  toMatter,
  toMatterEvent,
  toMatterFromSummary,
  toMessage,
  toPages,
  toRunEvent,
  toSummary,
  toSummaryFromListItem,
  toUser,
  type SectionFrame,
} from '@/api/http/mappers'
import type { DocumentPage, Draft, DraftSection, MatterInput, Message, Scope } from '@/api/types'
import { useSession } from '@/stores/session'

// The real client: the FastAPI backend at /api/v1, reached through the Vite proxy in development (INT-0.3) and
// from the same origin once FastAPI serves the app (INT-5.1). Wire types come from schema.d.ts, generated from
// backend/openapi.json (INT-0.4); mappers.ts turns them into the view types the screens use.
type Wire = components['schemas']

const wireScope = (scope: Scope): Wire['Scope'] =>
  scope.kind === 'document'
    ? { kind: 'documents', document_ids: [scope.documentId] }
    : { kind: 'all' }

const wireMatter = (input: Partial<MatterInput>) => {
  const body: Record<string, unknown> = {
    name: input.name,
    client_name: input.clientName,
    our_side: input.ourSide,
    court: input.court,
    practice_area: input.practiceArea,
  }
  // The opposing side is a party in the profile; the profile is replaced as a whole.
  if (input.opposingParty !== undefined || input.opposingCounsel !== undefined) {
    body.profile = {
      parties: [
        {
          role: 'opposing',
          name: input.opposingParty ?? '',
          represented: Boolean(input.opposingCounsel),
          counsel: input.opposingCounsel
            ? { name: input.opposingCounsel.name, firm: input.opposingCounsel.firm }
            : null,
        },
      ],
    }
  }
  if (input.aiConsent) {
    const c = input.aiConsent
    body.ai_consent = {
      status: c.status,
      told_tool: c.toldTool,
      told_data: c.toldData,
      told_risks: c.toldRisks,
      recorded_on: c.recordedOn || null,
      notes: c.notes || null,
    }
  }
  return body
}

export function createHttpApiClient(): ApiClient {
  setUnauthorizedHandler(() => useSession.getState().lock('idle'))

  // Per draft: what was cut from letter sections for display, the text last shown (so only changed sections are
  // sent), and the previews the server holds (so accepting one sends its id, not the text).
  const frames = new Map<string, Record<string, SectionFrame>>()
  const shown = new Map<string, Draft>()
  const proposals = new Map<string, { id: string; sectionId: string; body: string }>()

  const documentNames = new Map<string, string>()
  const nameOf = async (documentId: string | null | undefined) => {
    if (!documentId) return ''
    const cached = documentNames.get(documentId)
    if (cached) return cached
    const detail = await request<Wire['DocumentDetailOut']>(`/documents/${documentId}`)
    documentNames.set(documentId, detail.filename)
    return detail.filename
  }

  async function loadDraft(draftId: string, version?: number): Promise<Draft> {
    const wire = await request<Wire['DraftOut']>(`/drafts/${draftId}`, { query: { version } })
    const mapped = toDraft(wire, { incomingDocumentName: await nameOf(wire.incoming_document_id) })
    if (version !== undefined) return mapped.draft
    // Older versions, so the history can compare and restore them. Capped: a long history shows its newest.
    const older = wire.versions.filter((v) => v.version !== wire.version).slice(-10)
    const texts = await Promise.all(
      older.map((v) =>
        request<Wire['DraftOut']>(`/drafts/${draftId}`, { query: { version: v.version } }),
      ),
    )
    for (const text of texts) {
      const entry = mapped.draft.versions.find((v) => v.version === text.version)
      if (entry) entry.sections = toDraft(text).draft.sections
    }
    remember(mapped.draft, mapped.frames)
    return mapped.draft
  }

  function remember(draft: Draft, draftFrames: Record<string, SectionFrame>) {
    frames.set(draft.id, draftFrames)
    shown.set(draft.id, draft)
  }

  async function sectionsToWire(draftId: string, sections: DraftSection[]) {
    const before = shown.get(draftId)?.sections ?? []
    const cut = frames.get(draftId) ?? {}
    return sections
      .filter((s) => {
        const old = before.find((b) => b.id === s.id)
        return !old || old.body !== s.body || old.label !== s.label
      })
      .map((s) => ({
        id: s.id,
        heading: s.label,
        content: `${cut[s.id]?.prefix ?? ''}${s.body}${cut[s.id]?.suffix ?? ''}`,
      }))
  }

  const client: ApiClient = {
    kind: 'http',

    // ---- A · Auth
    async signIn(email, password) {
      await request('/auth/login', { method: 'POST', body: { email, password } })
      return { mfaRequired: true }
    },
    async verifyMfa(code) {
      const me = await request<Wire['Me']>('/auth/mfa/verify', { method: 'POST', body: { code } })
      return toUser(me.user, { session: me.session, app: me.app })
    },
    async getMe() {
      const me = await request<Wire['Me']>('/auth/me')
      return toUser(me.user, { session: me.session, app: me.app })
    },
    async updateLicensingStates(states) {
      const me = await request<Wire['Me']>('/auth/me', {
        method: 'PATCH',
        body: { licensing_states: states },
      })
      return toUser(me.user, { session: me.session, app: me.app })
    },
    async signOut() {
      await request('/auth/logout', { method: 'POST' })
    },

    // ---- B · Matters
    async listMatters() {
      const pages = await walk<Wire['MatterSummaryOut']>('/matters', { status: 'all' })
      return pages.flat().map(toMatterFromSummary)
    },
    async getMatter(matterId) {
      return toMatter(await request<Wire['MatterOut']>(`/matters/${matterId}`))
    },
    async createMatter(input) {
      const body = wireMatter(input)
      const wire = await request<Wire['MatterOut']>('/matters', { method: 'POST', body })
      return toMatter(wire)
    },
    async updateMatter(matterId, patch) {
      const wire = await request<Wire['MatterOut']>(`/matters/${matterId}`, {
        method: 'PATCH',
        body: wireMatter(patch),
      })
      return toMatter(wire)
    },
    async closeMatter(matterId) {
      return toMatter(
        await request<Wire['MatterOut']>(`/matters/${matterId}/close`, { method: 'POST' }),
      )
    },
    async exportMatter(matterId) {
      // A job builds the archive; poll it, then fetch the file.
      const accepted = await request<Wire['JobAccepted']>(`/matters/${matterId}/export`, {
        method: 'POST',
      })
      for (let tries = 0; tries < 240; tries++) {
        const job = await client.getJob(accepted.job_id)
        if (job.status === 'done') return requestFile(`/jobs/${accepted.job_id}/file`)
        if (job.status === 'failed' || job.status === 'cancelled')
          throw new Error('The export didn’t finish. Nothing was changed; try again.')
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      throw new Error('The export is taking longer than expected. Try again in a moment.')
    },
    async deleteMatter(matterId, confirmName) {
      await request(`/matters/${matterId}`, { method: 'DELETE', query: { confirm: confirmName } })
    },
    async getAudit(matterId) {
      const page = await request<Wire['AuditPage']>(`/matters/${matterId}/audit`, {
        query: { limit: 100 },
      })
      return { entries: page.items.map(toAuditEntry), chainValid: page.chain_valid }
    },

    // ---- C · Chat history
    async listConversations(matterId) {
      const pages = await walk<Wire['ConversationOut']>(`/matters/${matterId}/conversations`)
      return pages.flat().map(toConversation)
    },
    async listMessages(conversationId) {
      // Newest page first; each page runs oldest to newest, and next_cursor reaches back in time.
      const pages = await walk<Wire['MessageOut']>(
        `/conversations/${conversationId}/messages`,
        {},
        'before',
      )
      return pages.reverse().flat().map(toMessage) as Message[]
    },
    async updateConversation(conversationId, patch) {
      const wire = await request<Wire['ConversationOut']>(`/conversations/${conversationId}`, {
        method: 'PATCH',
        body: patch,
      })
      return toConversation(wire)
    },
    async deleteConversation(conversationId) {
      await request(`/conversations/${conversationId}`, { method: 'DELETE' })
    },

    // ---- D · Chat
    async sendMessage(input) {
      let conversationId = input.conversationId
      if (!conversationId) {
        const created = await request<Wire['ConversationOut']>(
          `/matters/${input.matterId}/conversations`,
          { method: 'POST', body: { scope: wireScope(input.scope) } },
        )
        conversationId = created.id
      }
      const body: Wire['SendMessage'] = {
        content: input.content,
        mode: input.mode,
        scope: wireScope(input.scope),
        options: {
          summary_template: input.summary?.template,
          audience: input.summary?.audience,
          draft_type: input.draft?.type,
        },
      }
      // One key for this send. A retry after a dropped connection reuses it, so the server answers with the
      // same message instead of starting a second run.
      const key = crypto.randomUUID()
      const post = () =>
        request<Wire['SendMessageAccepted']>(`/conversations/${conversationId}/messages`, {
          method: 'POST',
          body,
          headers: { 'Idempotency-Key': key },
        })
      let accepted: Wire['SendMessageAccepted']
      try {
        accepted = await post()
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 0) throw error
        accepted = await post()
      }
      return { conversationId, messageId: accepted.message_id, runId: accepted.run_id }
    },

    async streamRun(runId, onEvent, signal) {
      let messageId = ''
      let finished = false
      const cancelOnAbort = () => {
        void client.cancelRun(runId).catch(() => {})
      }
      signal?.addEventListener('abort', cancelOnAbort, { once: true })
      try {
        await readSse({
          path: `/runs/${runId}/stream`,
          signal,
          onMessage(message) {
            const data = JSON.parse(message.data) as Record<string, unknown>
            const event = toRunEvent(message.event, data)
            if (event?.type === 'run.started') messageId = event.messageId
            if (event) onEvent(event)
            if (message.event === 'done' || message.event === 'error') finished = true
            return finished
          },
        })
      } finally {
        signal?.removeEventListener('abort', cancelOnAbort)
      }
      // Stop closes the stream before the server's own `done` arrives: say so, so the answer ends as stopped.
      if (signal?.aborted && !finished) onEvent({ type: 'done', messageId, cancelled: true })
    },
    async cancelRun(runId) {
      await request(`/runs/${runId}/cancel`, { method: 'POST' })
    },
    async sendFeedback(messageId, kind, note) {
      await request(`/messages/${messageId}/feedback`, { method: 'POST', body: { kind, note } })
    },
    async getCitation(citationId) {
      return toCitation(await request<Wire['CitationOut']>(`/citations/${citationId}`))
    },

    // ---- E · Documents
    async listDocuments(matterId) {
      const pages = await walk<Wire['DocumentOut']>(`/matters/${matterId}/documents`)
      const documents = pages.flat()
      for (const d of documents) documentNames.set(d.id, d.filename)
      return documents.map(toDocument)
    },
    async getDocumentPages(documentId) {
      const out: DocumentPage[] = []
      let from = 1
      for (;;) {
        const wire = await request<Wire['PagesOut']>(`/documents/${documentId}/pages`, {
          query: { from, limit: 50 },
        })
        out.push(...toPages(wire))
        from += 50
        if (from > wire.pages_total || wire.pages.length === 0) break
      }
      return out
    },
    async uploadDocument(matterId, file, origin, onProgress) {
      // XMLHttpRequest, because fetch can't report how much of an upload has been sent.
      const form = new FormData()
      form.set('file', file)
      form.set('origin', origin)
      const accepted = await new Promise<Wire['UploadAccepted']>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${BASE}/matters/${matterId}/documents`)
        xhr.withCredentials = true
        xhr.setRequestHeader('accept', 'application/json')
        xhr.setRequestHeader('x-legallens-request', '1')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress?.(e.loaded / e.total)
        }
        xhr.onerror = () =>
          reject(
            new ApiError({
              status: 0,
              code: 'unreachable',
              detail:
                'LegalLens can’t reach its own server. Check that it is running, then try again.',
            }),
          )
        xhr.onload = () => {
          let body: Record<string, unknown> = {}
          try {
            body = JSON.parse(xhr.responseText) as Record<string, unknown>
          } catch {
            // Not JSON: the status decides.
          }
          if (xhr.status >= 200 && xhr.status < 300) return resolve(body as Wire['UploadAccepted'])
          const { code, detail, request_id, type, title, status, instance, ...extras } = body
          void [type, title, status, instance]
          reject(
            new ApiError({
              status: xhr.status,
              code: typeof code === 'string' ? code : `http_${xhr.status}`,
              detail:
                typeof detail === 'string'
                  ? detail
                  : `The server answered ${xhr.status}. Try again.`,
              requestId: typeof request_id === 'string' ? request_id : undefined,
              extras,
            }),
          )
        }
        xhr.send(form)
      })
      const document = toDocument(
        await request<Wire['DocumentDetailOut']>(`/documents/${accepted.document_id}`),
      )
      return { document, jobId: accepted.job_id }
    },
    async getHiddenContent(documentId) {
      return toHiddenItems(
        await request<Wire['HiddenContentOut']>(`/documents/${documentId}/hidden-content`),
      )
    },
    async getDeletionImpact(documentId) {
      const report = await request<Wire['DeletionReport']>(`/documents/${documentId}`, {
        method: 'DELETE',
        query: { dry_run: true },
      })
      return toDeletionImpact(report)
    },
    async deleteDocument(documentId) {
      await request(`/documents/${documentId}`, { method: 'DELETE' })
    },

    // ---- F · Summaries
    async listSummaries(matterId) {
      const pages = await walk<Wire['SummaryListItem']>(`/matters/${matterId}/summaries`)
      return pages.flat().map((item) => toSummaryFromListItem(item, matterId))
    },
    async getSummary(summaryId) {
      return toSummary(await request<Wire['SummaryOut']>(`/summaries/${summaryId}`))
    },
    async createSummary(input) {
      const accepted = await request<Wire['SummaryAccepted']>(
        `/documents/${input.documentId}/summaries`,
        { method: 'POST', body: { template: input.template, audience: input.audience } },
      )
      const summary = toSummary(
        await request<Wire['SummaryOut']>(`/summaries/${accepted.summary_id}`),
      )
      return { summary, jobId: accepted.job_id }
    },
    async exportSummary(summaryId) {
      return requestFile(`/summaries/${summaryId}/export`, { method: 'POST' })
    },

    // ---- G · Drafts
    async listDrafts(matterId) {
      const pages = await walk<Wire['DraftListItem']>(`/matters/${matterId}/drafts`)
      return pages.flat().map((item) => toDraftFromListItem(item, matterId))
    },
    async getDraft(draftId) {
      return loadDraft(draftId)
    },
    async createDraft(input) {
      const accepted = await request<Wire['DraftAccepted']>(`/matters/${input.matterId}/drafts`, {
        method: 'POST',
        body: {
          type: input.type,
          incoming_document_id: input.incomingDocumentId,
          supporting_document_ids: input.supportingDocumentIds,
          instructions: input.instructions,
          conversation_id: input.conversationId,
        },
      })
      const draft = await loadDraft(accepted.draft_id)
      return { draft: { ...draft, instructions: input.instructions }, jobId: accepted.job_id }
    },
    async updateDraft(draftId, patch) {
      const current = shown.get(draftId) ?? (await loadDraft(draftId))
      const changed = patch.sections ? await sectionsToWire(draftId, patch.sections) : []

      // Accepting a preview sends its id: the server applies the text it made, so its citations stay its own.
      const accepted = changed
        .map((s) => ({ s, p: proposals.get(`${draftId}:${s.id}`) }))
        .find((x) => x.p && x.s.content.trim() === x.p.body.trim())

      const fields: Wire['DraftPatch'] = {
        base_version: current.version,
        version_label: patch.versionLabel,
      }
      if (patch.claims) {
        fields.waived_claims = patch.claims.filter((c) => c.waived).map((c) => c.id)
      }
      if (patch.addedAuthorities) fields.added_authorities = patch.addedAuthorities
      if (patch.acknowledged) {
        fields.acknowledge = patch.acknowledged.filter((k) => !current.acknowledged.includes(k))
        fields.unacknowledge = current.acknowledged.filter((k) => !patch.acknowledged?.includes(k))
      }
      if (patch.safeguards) {
        fields.safeguards = {
          fre408_header: patch.safeguards.fre408,
          reservation_of_rights: patch.safeguards.reservationOfRights,
        }
      }

      // The server takes one text change per request: a preview, a restore or edited sections.
      const text: Partial<Wire['DraftPatch']>[] = []
      if (accepted?.p) text.push({ accept_proposal: accepted.p.id })
      if (patch.restoreVersion !== undefined) text.push({ restore_version: patch.restoreVersion })
      const edits = changed.filter((s) => s.id !== accepted?.s.id)
      if (edits.length) text.push({ sections: edits })

      let wire: Wire['DraftOut'] | null = null
      let version = current.version
      const bodies = text.length ? text : [{}]
      for (const [index, part] of bodies.entries()) {
        wire = await request<Wire['DraftOut']>(`/drafts/${draftId}`, {
          method: 'PATCH',
          body: { ...(index === 0 ? fields : {}), ...part, base_version: version },
        }).catch(async (error: unknown) => {
          // Someone else changed the draft first (another tab): show what the server has.
          if (error instanceof ApiError && error.code === 'version_conflict') {
            await loadDraft(draftId)
          }
          throw error
        })
        version = wire.version
      }
      if (accepted) proposals.delete(`${draftId}:${accepted.s.id}`)
      const result = await loadDraft(draftId)
      return result
    },
    async proposeSectionRewrite(draftId, sectionId, instruction) {
      const wire = await request<Wire['SectionProposalOut']>(
        `/drafts/${draftId}/sections/${sectionId}/propose`,
        { method: 'POST', body: { instruction } },
      )
      const cut = frames.get(draftId)?.[sectionId]
      proposals.set(`${draftId}:${sectionId}`, {
        id: wire.proposal_id,
        sectionId,
        body: wire.body,
      })
      return { body: stripFrame(wire.body, cut) }
    },
    async proposeClaimResponse(draftId, claimId) {
      const wire = await request<Wire['ClaimProposalOut']>(
        `/drafts/${draftId}/claims/${claimId}/propose`,
        { method: 'POST' },
      )
      proposals.set(`${draftId}:${wire.section.id}`, {
        id: wire.proposal_id,
        sectionId: wire.section.id,
        body: wire.section.content,
      })
      return {
        section: { id: wire.section.id, label: wire.section.heading, body: wire.section.content },
      }
    },
    async reviewDraft(draftId) {
      await request(`/drafts/${draftId}/review`, { method: 'POST', body: { confirm: true } })
      return loadDraft(draftId)
    },
    async getDraftChecks(draftId) {
      return toDraftChecks(await request<Wire['DraftChecksOut']>(`/drafts/${draftId}/checks`))
    },
    async exportDraft(draftId, kind) {
      return requestFile(`/drafts/${draftId}/export`, { method: 'POST', query: { kind } })
    },

    // ---- Ops
    async getHealth() {
      return toHealth(await request<Wire['HealthOut']>('/health'))
    },
    async getJob(jobId) {
      return toJobStatus(await request<Wire['JobOut']>(`/jobs/${jobId}`))
    },
    async cancelJob(jobId) {
      await request(`/jobs/${jobId}/cancel`, { method: 'POST' })
    },

    // ---- Matter events
    subscribeMatterEvents(matterId, onEvent) {
      // EventSource reconnects by itself and resumes with Last-Event-ID (decision 7).
      const source = new EventSource(`${BASE}/matters/${matterId}/events`)
      const names = [
        'job.progress',
        'job.done',
        'job.failed',
        'document.ready',
        'document.failed',
      ] as const
      for (const name of names) {
        source.addEventListener(name, (message) => {
          try {
            const data = JSON.parse((message as MessageEvent<string>).data) as Record<
              string,
              unknown
            >
            const event: MatterEvent | null = toMatterEvent(name, data)
            if (event) onEvent(event)
          } catch {
            // A malformed event is dropped; the next one carries on.
          }
        })
      }
      return () => source.close()
    },
  }
  return client
}

function stripFrame(body: string, frame?: SectionFrame) {
  let out = body
  if (frame?.prefix && out.startsWith(frame.prefix)) out = out.slice(frame.prefix.length)
  if (frame?.suffix && out.endsWith(frame.suffix)) out = out.slice(0, -frame.suffix.length)
  return out
}
