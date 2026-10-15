import type { components } from '@/api/http/schema'
import type { MatterEvent, RunEvent } from '@/api/events'
import type {
  AuditEntry,
  Authority,
  Citation,
  Conversation,
  Coverage,
  DeletionImpact,
  DocumentKind,
  DocumentPage,
  Draft,
  DraftChecks,
  DraftClaim,
  DraftSection,
  DraftStep,
  Health,
  HiddenItem,
  IngestStep,
  JobStatus,
  LegalDocument,
  Matter,
  Message,
  PageBlock,
  SearchedInfo,
  Summary,
  SummaryStep,
  User,
} from '@/api/types'

// Wire format → the view models the screens use (INT-2.2). Pure functions: no fetching, no state, so each one
// is tested on responses recorded from the real backend (fixtures/).
type Wire = components['schemas']

// ------------------------------------------------------------------ people

export function toUser(
  wire: Wire['UserOut'],
  extra: { session?: Wire['SessionInfo']; app?: Wire['AppInfo'] } = {},
): User {
  const words = wire.name.trim().split(/\s+/).filter(Boolean)
  const initial = (word: string | undefined) => (word ? ([...word][0] ?? '').toUpperCase() : '')
  return {
    id: wire.id,
    name: wire.name,
    firstName: words[0] ?? wire.name,
    email: wire.email,
    initials: words.length > 1 ? initial(words[0]) + initial(words.at(-1)) : initial(words[0]),
    licensingStates: wire.licensing_states,
    idleTimeoutMs: extra.session ? extra.session.idle_timeout_s * 1000 : undefined,
    standInEngine: extra.app ? extra.app.orchestrator === 'stub' : undefined,
  }
}

// ----------------------------------------------------------------- matters

export function toMatterFromSummary(wire: Wire['MatterSummaryOut']): Matter {
  return {
    id: wire.id,
    name: wire.name,
    clientName: wire.client_name,
    ourSide: wire.our_side,
    opposingParty: wire.opposing_party ?? '',
    opposingCounsel: wire.opposing_counsel
      ? { name: wire.opposing_counsel.name, firm: wire.opposing_counsel.firm ?? '' }
      : null,
    court: wire.court ?? '',
    practiceArea: wire.practice_area ?? '',
    status: wire.status,
    documentCount: wire.document_count,
    updatedAt: wire.last_activity_at,
  }
}

export function toMatter(wire: Wire['MatterOut']): Matter {
  const opposing = wire.profile.parties?.find((party) => party.role === 'opposing')
  return {
    id: wire.id,
    name: wire.name,
    clientName: wire.client_name,
    ourSide: wire.our_side,
    opposingParty: opposing?.name ?? '',
    opposingCounsel: opposing?.counsel
      ? { name: opposing.counsel.name, firm: opposing.counsel.firm ?? '' }
      : null,
    court: wire.court ?? '',
    practiceArea: wire.practice_area ?? '',
    status: wire.status,
    documentCount: wire.counts.documents,
    updatedAt: wire.last_activity_at,
    aiConsent: {
      status: wire.ai_consent.status ?? 'not_recorded',
      toldTool: wire.ai_consent.told_tool ?? false,
      toldData: wire.ai_consent.told_data ?? false,
      toldRisks: wire.ai_consent.told_risks ?? false,
      recordedOn: wire.ai_consent.recorded_on ?? undefined,
      notes: wire.ai_consent.notes ?? undefined,
    },
  }
}

// ------------------------------------------------------------------- chats

export function toConversation(wire: Wire['ConversationOut']): Conversation {
  return {
    id: wire.id,
    matterId: wire.matter_id,
    title: wire.title,
    pinned: wire.pinned,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  }
}

export function toCitation(wire: Wire['CitationOut']): Citation {
  return {
    n: wire.n,
    id: String(wire.id),
    documentId: wire.document_id,
    documentName: wire.document_name,
    page: wire.page,
    para: wire.para_ref ?? '',
    quote: wire.quote,
    verified: wire.verified,
  }
}

export function toSearched(wire: Wire['SearchedOut'] | null | undefined): SearchedInfo | undefined {
  if (!wire) return undefined
  return {
    scopeLabel: wire.scope_label,
    rewrittenQuestion: wire.rewritten_question,
    documentsSearched: wire.documents_searched,
    passagesReviewed: wire.passages_reviewed,
  }
}

export function toMessage(wire: Wire['MessageOut']): Message {
  const job = wire.job
  return {
    id: wire.id,
    conversationId: wire.conversation_id,
    role: wire.role,
    content: wire.content,
    createdAt: wire.created_at,
    answerState: wire.answer_state ?? undefined,
    outsideLaw: wire.outside_law || undefined,
    citations: wire.citations?.length ? wire.citations.map(toCitation) : undefined,
    searched: toSearched(wire.searched),
    stopped: wire.status === 'cancelled' || undefined,
    job:
      job?.kind === 'summarize'
        ? { kind: 'summarize', summaryId: job.entity_id }
        : job?.kind === 'draft'
          ? { kind: 'draft', draftId: job.entity_id }
          : undefined,
  }
}

// --------------------------------------------------------------- documents

const KINDS: Record<string, DocumentKind> = {
  pdf: 'pdf',
  docx: 'docx',
  eml: 'eml',
  msg: 'msg',
  txt: 'txt',
}

/** The file type from the extension, then the MIME type. */
export function documentKind(filename: string, mime: string): DocumentKind {
  const extension = filename.split('.').at(-1)?.toLowerCase() ?? ''
  if (KINDS[extension]) return KINDS[extension]
  if (mime.includes('pdf')) return 'pdf'
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime.includes('rfc822')) return 'eml'
  if (mime.includes('outlook')) return 'msg'
  return 'txt'
}

export function toCoverage(wire: Wire['Coverage']): Coverage {
  return {
    pagesRead: wire.pages_read,
    unreadablePages: wire.pages_unreadable,
    lowConfidencePages: wire.low_confidence_pages.map((p) => ({
      page: p.page,
      confidence: p.ocr_conf,
    })),
  }
}

export function toDocument(wire: Wire['DocumentOut']): LegalDocument {
  return {
    id: wire.id,
    matterId: wire.matter_id,
    name: wire.filename,
    kind: documentKind(wire.filename, wire.mime),
    origin: wire.origin,
    pages: wire.pages_total ?? 0,
    status: wire.status,
    ocrConfidence: wire.ocr_conf_avg ?? undefined,
    // Only the notice (kinds and a count). The items come from the audited endpoint, as a deliberate step (DEC-59).
    hiddenContent: wire.hidden_content ? wire.hidden_content.count > 0 : undefined,
    hiddenCount: wire.hidden_content?.count,
    hiddenKinds: wire.hidden_content?.kinds,
    sizeBytes: wire.size_bytes,
    sha256: wire.sha256,
    coverage: wire.coverage ? toCoverage(wire.coverage) : undefined,
    error: wire.error?.message,
    uploadedAt: wire.uploaded_at,
  }
}

const BLOCK_KINDS: Record<string, PageBlock['kind']> = {
  heading: 'heading',
  page_header: 'meta',
  page_footer: 'meta',
  meta: 'meta',
  metadata: 'meta',
  header: 'meta',
  footer: 'meta',
}

export function toPages(wire: Wire['PagesOut']): DocumentPage[] {
  return wire.pages.map((page) => ({
    documentId: wire.document_id,
    page: page.page_no,
    blocks: page.blocks.map((block) => ({
      // The clause or ¶ pinpoint a citation points at; blocks without one get a stable id of their own.
      anchor: block.ref ?? `b${block.id}`,
      kind: BLOCK_KINDS[block.kind] ?? 'paragraph',
      text: block.text,
    })),
  }))
}

export function toDeletionImpact(wire: Wire['DeletionReport']): DeletionImpact {
  return {
    pages: wire.removed.pages,
    passages: wire.removed.chunks,
    citations: wire.removed.citations,
    conversations: wire.removed.conversations,
  }
}

// --------------------------------------------------------------- summaries

/** A readable model label from what the server stored. */
function modelLabel(modelId?: string | null, promptVersion?: string | null): string {
  return [modelId, promptVersion && `prompt ${promptVersion}`].filter(Boolean).join(' · ')
}

/** Citations from every section as one list. Numbers are already unique across a summary or draft. */
function flattenCitations(sections: { citations: Wire['InlineCitation'][] }[]): Citation[] {
  const seen = new Map<number, Citation>()
  for (const section of sections) {
    for (const c of section.citations) {
      if (seen.has(c.n)) continue
      seen.set(c.n, {
        n: c.n,
        id: `c${c.n}`,
        documentId: c.document_id,
        documentName: c.document_name ?? '',
        page: c.page,
        para: c.para_ref ?? '',
        quote: c.quote,
        // Server-made citations point at a real passage; the unverified ones are marked in the text itself.
        verified: true,
      })
    }
  }
  return [...seen.values()].sort((a, b) => a.n - b.n)
}

const SUMMARY_STATUS = { pending: 'processing', ready: 'ready', failed: 'failed' } as const

export function toSummary(wire: Wire['SummaryOut']): Summary {
  return {
    id: wire.id,
    matterId: wire.matter_id,
    documentId: wire.document_id,
    documentName: wire.document_name ?? '',
    template: wire.template,
    audience: wire.audience,
    status: SUMMARY_STATUS[wire.status],
    jobId: wire.job_id ?? undefined,
    sections: wire.sections.map((s) => ({
      key: s.field,
      title: s.title,
      body: s.found ? s.content : null,
    })),
    citations: flattenCitations(wire.sections),
    coverage: wire.coverage ? toCoverage(wire.coverage) : undefined,
    conversationId: wire.conversation_id ?? undefined,
    modelLabel: modelLabel(wire.model_id, wire.prompt_version),
    createdAt: wire.created_at,
  }
}

/** A list row: no sections yet. The summary itself comes from GET /summaries/{id}. */
export function toSummaryFromListItem(wire: Wire['SummaryListItem'], matterId: string): Summary {
  return {
    id: wire.id,
    matterId,
    documentId: wire.document_id,
    documentName: wire.document_name,
    template: wire.template,
    audience: wire.audience,
    status: SUMMARY_STATUS[wire.status],
    sections: [],
    citations: [],
    conversationId: wire.conversation_id ?? undefined,
    modelLabel: '',
    createdAt: wire.created_at,
  }
}

// ------------------------------------------------------------------ drafts

const DRAFT_STATUS = {
  generating: 'drafting',
  not_reviewed: 'not_reviewed',
  reviewed_adopted: 'reviewed_adopted',
  failed: 'failed',
} as const

/** Letter parts the editor draws itself (the date, addressee, Re line, "Dear …:" and signature) and so are not
 * body sections. The server keeps them as sections; these kinds never reach the screen. */
const HEAD_KINDS = new Set(['addressee', 're', 'memo_header'])
const SALUTATION = /^Dear [^\n]*:\n+/
const SIGN_OFF = /\n+Sincerely,[\s\S]*$/

/** What was cut from a section for display, so a save can put it back. */
export interface SectionFrame {
  prefix: string
  suffix: string
}

export interface MappedDraft {
  draft: Draft
  /** By section id. Only sections that had something cut appear. */
  frames: Record<string, SectionFrame>
}

function bodyOf(section: Wire['DraftSectionOut']): { body: string; frame?: SectionFrame } {
  let body = section.content
  const frame: SectionFrame = { prefix: '', suffix: '' }
  if (section.kind === 'intro') {
    const match = SALUTATION.exec(body)
    if (match) {
      frame.prefix = match[0]
      body = body.slice(match[0].length)
    }
  }
  if (section.kind === 'closing') {
    const match = SIGN_OFF.exec(body)
    if (match) {
      frame.suffix = match[0]
      body = body.slice(0, match.index)
    }
  }
  return { body, frame: frame.prefix || frame.suffix ? frame : undefined }
}

const BLANK_CITATION: Citation = {
  n: 0,
  id: '',
  documentId: '',
  documentName: '',
  page: 0,
  para: '',
  quote: '',
  verified: false,
}

function toClaim(wire: Wire['ClaimOut'], citations: Citation[]): DraftClaim {
  const source = wire.source ? citations.find((c) => c.n === wire.source?.n) : undefined
  return {
    id: wire.id,
    text: wire.text,
    source: source ?? BLANK_CITATION,
    addressedBy: wire.addressed_by ?? null,
    waived: wire.waived || wire.status === 'waived' || undefined,
  }
}

export function toDraftSection(section: Wire['DraftSectionOut']): DraftSection {
  return { id: section.id, label: section.heading, body: bodyOf(section).body }
}

export function toDraft(
  wire: Wire['DraftOut'],
  extras: { incomingDocumentName?: string } = {},
): MappedDraft {
  const frames: Record<string, SectionFrame> = {}
  const shown = wire.sections.filter((s) => !HEAD_KINDS.has(s.kind ?? ''))
  const sections = shown.map((s) => {
    const { body, frame } = bodyOf(s)
    if (frame) frames[s.id] = frame
    return { id: s.id, label: s.heading, body }
  })
  const citations = flattenCitations(wire.sections)
  const addressee = wire.safeguards.addressee
  const memo = wire.memo_header
  const draft: Draft = {
    id: wire.id,
    matterId: wire.matter_id,
    conversationId: wire.conversation_id ?? undefined,
    type: wire.type,
    title: wire.title,
    incomingDocumentId: wire.incoming_document_id ?? '',
    incomingDocumentName: extras.incomingDocumentName ?? '',
    supportingDocumentIds: wire.supporting_document_ids,
    // The server doesn't store the instructions text.
    instructions: '',
    status: DRAFT_STATUS[wire.status],
    jobId: wire.job_id ?? undefined,
    reviewedAt: wire.reviewed_at ?? undefined,
    addressee:
      wire.type === 'response_letter' && addressee
        ? {
            name: addressee.name,
            firm: addressee.firm ?? undefined,
            address: (addressee.address ?? '').split('\n').filter(Boolean),
            represented: addressee.rule === '4.2',
          }
        : undefined,
    memoHeader: memo ? { to: memo.to ?? '', from: memo.from ?? '', re: memo.re ?? '' } : undefined,
    dateLine: wire.date_line ?? '',
    sections,
    citations,
    claims: (wire.claims ?? []).map((claim) => toClaim(claim, citations)),
    addedAuthorities: wire.added_authorities ?? [],
    acknowledged: wire.acknowledged ?? [],
    safeguards: {
      fre408: wire.safeguards.fre408_header ?? false,
      reservationOfRights: wire.safeguards.reservation_of_rights ?? false,
    },
    version: wire.version,
    versions: wire.versions.map((v) => ({
      version: v.version,
      label: v.label || (v.source === 'ai' ? 'AI draft' : 'Edited'),
      createdAt: v.created_at,
      // Older text arrives on demand (GET ?version=n); the current version's text is the draft's own.
      sections: v.version === wire.version ? sections : [],
    })),
    modelLabel: modelLabel(wire.model_id, wire.prompt_version),
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  }
  return { draft, frames }
}

/** A list row: no text yet. The draft itself comes from GET /drafts/{id}. */
export function toDraftFromListItem(wire: Wire['DraftListItem'], matterId: string): Draft {
  return {
    id: wire.id,
    matterId,
    conversationId: wire.conversation_id ?? undefined,
    type: wire.type,
    title: wire.title,
    incomingDocumentId: wire.incoming_document_id ?? '',
    incomingDocumentName: wire.incoming_document_name ?? '',
    supportingDocumentIds: [],
    instructions: '',
    status: DRAFT_STATUS[wire.status],
    reviewedAt: wire.reviewed_at ?? undefined,
    dateLine: '',
    sections: [],
    citations: [],
    claims: [],
    addedAuthorities: [],
    acknowledged: [],
    safeguards: { fre408: false, reservationOfRights: false },
    version: wire.version,
    versions: [],
    modelLabel: '',
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  }
}

// ------------------------------------------------------------------ health

export function toHealth(wire: Wire['HealthOut']): Health {
  const { status, version, ...parts } = wire
  return {
    status,
    version,
    components: Object.entries(parts).map(([name, part]) => ({
      name,
      kind: part.kind,
      ok: part.ok,
      detail: part.detail ?? undefined,
    })),
  }
}

// ---------------------------------------------------- checks, audit, jobs (INT-3.1, INT-3.3)

const AUTHORITY_STATUS: Record<Wire['ChecklistItem']['status'], Authority['status']> = {
  full_text_uploaded: 'full_text',
  only_mentioned: 'mentioned_only',
  not_in_documents: 'not_uploaded',
  added_by_lawyer: 'added_by_lawyer',
}

const BLOCKER_KEY: Record<string, DraftChecks['blockers'][number]['key']> = {
  placeholders: 'tokens',
  unanswered_claims: 'claims',
  unacknowledged_citations: 'authorities',
  not_reviewed: 'review',
  draft_not_ready: 'review',
}

export function toDraftChecks(wire: Wire['DraftChecksOut']): DraftChecks {
  return {
    version: wire.version,
    authorities: wire.citation_checklist.map((row) => ({
      key: row.id,
      label: row.authority,
      status: AUTHORITY_STATUS[row.status],
      detail: row.note,
      unverified: row.unverified,
      acknowledged: row.acknowledged,
    })),
    blockers: wire.export.blockers.map((b) => ({
      key: BLOCKER_KEY[b.code ?? ''] ?? 'review',
      message: b.message ?? '',
    })),
    cleanAllowed: wire.export.clean_allowed,
  }
}

export function toHiddenItems(wire: Wire['HiddenContentOut']): HiddenItem[] {
  return wire.items.map((item) => ({
    kind: item.kind,
    description: [item.text, item.page ? `page ${item.page}` : '', item.location]
      .filter(Boolean)
      .join(' · '),
  }))
}

export function toAuditEntry(wire: Wire['AuditEntryOut']): AuditEntry {
  return {
    id: String(wire.id),
    at: wire.ts,
    action: wire.action,
    entityType: wire.entity_type,
    entityId: wire.entity_id ?? undefined,
  }
}

export function toJobStatus(wire: Wire['JobOut']): JobStatus {
  return {
    id: wire.id,
    kind: wire.kind,
    status: wire.status as JobStatus['status'],
    progress: wire.progress,
    step: wire.step ?? undefined,
  }
}

// ------------------------------------------------------------------ events

type Json = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)

/** One run-stream event. Returns null for events the screens don't use. */
export function toRunEvent(name: string, data: Json): RunEvent | null {
  switch (name) {
    case 'run.started':
      return { type: 'run.started', runId: str(data.run_id), messageId: str(data.message_id) }
    case 'intent':
      return {
        type: 'intent',
        intent: data.intent as Extract<RunEvent, { type: 'intent' }>['intent'],
        confidence: num(data.confidence),
      }
    case 'scope':
      return { type: 'scope', searching: str(data.searching) }
    case 'status':
      return { type: 'status', step: data.step as Extract<RunEvent, { type: 'status' }>['step'] }
    case 'token':
      return { type: 'token', delta: str(data.delta) }
    case 'answer_text':
      return { type: 'answer_text', text: str(data.text) }
    case 'citation':
      return {
        type: 'citation',
        citation: {
          n: num(data.n),
          id: String(data.citation_id),
          documentId: str(data.document_id),
          documentName: str(data.document),
          page: num(data.page),
          para: str(data.para),
          quote: str(data.quote),
          verified: data.verified === true,
        },
      }
    case 'answer_state':
      return {
        type: 'answer_state',
        state: data.state as Extract<RunEvent, { type: 'answer_state' }>['state'],
        outsideLaw: data.outside_law === true,
        searched: toSearched(data.searched as Wire['SearchedOut'] | null),
      }
    case 'job': {
      if (data.kind === 'summarize') {
        return {
          type: 'job',
          kind: 'summarize',
          jobId: str(data.job_id),
          summaryId: str(data.entity_id),
        }
      }
      if (data.kind === 'draft') {
        return { type: 'job', kind: 'draft', jobId: str(data.job_id), draftId: str(data.entity_id) }
      }
      return null
    }
    case 'error':
      return { type: 'error', code: str(data.code), message: str(data.message) }
    case 'done':
      return {
        type: 'done',
        messageId: str(data.message_id),
        ...(data.cancelled === true ? { cancelled: true } : {}),
      }
    default:
      return null
  }
}

/** One matter-stream event. Returns null for events the screens don't use (export and regenerate jobs, chat
 * renames). */
export function toMatterEvent(name: string, data: Json): MatterEvent | null {
  const kind = str(data.kind)
  const jobId = str(data.job_id)
  switch (name) {
    case 'job.progress': {
      const pct = num(data.pct)
      const detail = str(data.detail ?? data.step)
      const step = str(data.step_code)
      if (kind === 'ingest') {
        return {
          type: 'job.progress',
          kind,
          jobId,
          documentId: str(data.document_id),
          pct,
          step: (step || 'reading') as IngestStep,
          detail,
        }
      }
      if (kind === 'summarize') {
        return {
          type: 'job.progress',
          kind,
          jobId,
          summaryId: str(data.summary_id),
          pct,
          step: (step || 'reading') as SummaryStep,
          detail,
        }
      }
      if (kind === 'draft') {
        return {
          type: 'job.progress',
          kind,
          jobId,
          draftId: str(data.draft_id),
          pct,
          step: (step || 'reading') as DraftStep,
          detail,
        }
      }
      return null
    }
    case 'job.done':
      if (kind === 'summarize') {
        return {
          type: 'job.done',
          kind,
          jobId,
          summaryId: str(data.summary_id || data.entity_id),
          documentName: str(data.document_name),
        }
      }
      if (kind === 'draft') {
        return {
          type: 'job.done',
          kind,
          jobId,
          draftId: str(data.draft_id || data.entity_id),
          title: str(data.title),
        }
      }
      return null
    case 'job.failed': {
      if (kind !== 'summarize' && kind !== 'draft') return null
      const error = (data.error ?? {}) as Json
      return {
        type: 'job.failed',
        kind,
        jobId,
        entityId: str(kind === 'summarize' ? data.summary_id : data.draft_id),
        message: str(error.message),
      }
    }
    case 'document.ready':
      return {
        type: 'document.ready',
        documentId: str(data.document_id),
        name: str(data.name),
        coverage: toCoverage(data.coverage as Wire['Coverage']),
      }
    case 'document.failed':
      return {
        type: 'document.failed',
        documentId: str(data.document_id),
        name: str(data.name),
        reason: str(data.reason),
        quarantined: data.quarantined === true,
      }
    default:
      return null
  }
}
