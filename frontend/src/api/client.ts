import type { MatterEvent, RunEvent } from '@/api/events'
import type {
  Conversation,
  DeletionImpact,
  AuditEntry,
  DocumentOrigin,
  DocumentPage,
  DownloadedFile,
  DraftChecks,
  FeedbackKind,
  HiddenItem,
  JobStatus,
  MatterInput,
  Citation,
  ID,
  LegalDocument,
  Matter,
  Message,
  Mode,
  Scope,
  Draft,
  DraftPatch,
  DraftSection,
  DraftType,
  Health,
  Summary,
  SummaryAudience,
  SummaryTemplate,
  User,
} from '@/api/types'

// The one interface every screen talks to. It mirrors the API reference in
// architecture/LegalLens_Technical_Architecture_v0.1.md. MockApiClient implements it in the browser;
// HttpApiClient talks to the FastAPI backend. VITE_API=mock|http picks one (INTEGRATION_TODO.md).
export interface ApiClient {
  readonly kind: 'mock' | 'http'

  // A · Auth
  signIn(email: string, password: string): Promise<{ mfaRequired: true }>
  verifyMfa(code: string): Promise<User>
  getMe(): Promise<User>
  /** PATCH /auth/me: the states the lawyer is licensed in (DEC-29, INT-3.10). */
  updateLicensingStates(states: string[]): Promise<User>
  /** POST /auth/logout */
  signOut(): Promise<void>

  // B · Matters
  listMatters(): Promise<Matter[]>
  getMatter(matterId: ID): Promise<Matter>
  // Matter admin (FE-3.8, FE-3.9)
  createMatter(input: MatterInput): Promise<Matter>
  updateMatter(matterId: ID, patch: Partial<MatterInput>): Promise<Matter>
  /** POST /matters/{id}/close: read-only from then on. */
  closeMatter(matterId: ID): Promise<Matter>
  /** POST /matters/{id}/export: the whole matter as one archive. */
  exportMatter(matterId: ID): Promise<DownloadedFile>
  /** DELETE /matters/{id}: removes everything in it. `confirmName` is the matter's name, typed exactly (DEC-34). */
  deleteMatter(matterId: ID, confirmName: string): Promise<void>
  /** GET /matters/{id}/audit: the audit log, newest first, and whether its hash chain checks out. */
  getAudit(matterId: ID): Promise<{ entries: AuditEntry[]; chainValid: boolean }>

  // C · Chat history
  listConversations(matterId: ID): Promise<Conversation[]>
  listMessages(conversationId: ID): Promise<Message[]>
  updateConversation(
    conversationId: ID,
    patch: Partial<Pick<Conversation, 'title' | 'pinned'>>,
  ): Promise<Conversation>
  deleteConversation(conversationId: ID): Promise<void>

  // D · Chat
  sendMessage(input: {
    matterId: ID
    conversationId?: ID
    content: string
    scope: Scope
    mode: Mode
    /** Template and audience when the turn asks for a summary. */
    summary?: { template: SummaryTemplate; audience: SummaryAudience }
    /** The draft type when the turn asks for a draft. */
    draft?: { type: DraftType }
  }): Promise<{ conversationId: ID; messageId: ID; runId: ID }>
  streamRun(runId: ID, onEvent: (event: RunEvent) => void, signal?: AbortSignal): Promise<void>
  /** POST /runs/{id}/cancel: Stop. The stream is aborted too; this makes the server stop work. */
  cancelRun(runId: ID): Promise<void>
  /** POST /messages/{id}/feedback */
  sendFeedback(messageId: ID, kind: FeedbackKind, note?: string): Promise<void>
  /** GET /citations/{id}: one citation with its quote, for a link that opens it outside the answer. */
  getCitation(citationId: ID): Promise<Citation>

  // E · Documents
  listDocuments(matterId: ID): Promise<LegalDocument[]>
  getDocumentPages(documentId: ID): Promise<DocumentPage[]>
  /** POST /matters/{id}/documents (the file itself): returns at once; ingestion continues as a job (202). The
   * server hashes, scans and checks it; its answer is final (INT-3.2). `onProgress` gets 0–1 while bytes go up. */
  uploadDocument(
    matterId: ID,
    file: File,
    origin: DocumentOrigin,
    onProgress?: (fraction: number) => void,
  ): Promise<{ document: LegalDocument; jobId: ID }>
  /** GET /documents/{id}/hidden-content: audited, so only called after the lawyer's deliberate step (DEC-59). */
  getHiddenContent(documentId: ID): Promise<HiddenItem[]>
  getDeletionImpact(documentId: ID): Promise<DeletionImpact>
  deleteDocument(documentId: ID): Promise<void>

  // F · Summaries and jobs
  listSummaries(matterId: ID): Promise<Summary[]>
  getSummary(summaryId: ID): Promise<Summary>
  /** POST /documents/{id}/summaries: returns at once; the summary is written by a background job. */
  createSummary(input: {
    matterId: ID
    documentId: ID
    template: SummaryTemplate
    audience: SummaryAudience
    conversationId?: ID
  }): Promise<{ summary: Summary; jobId: ID }>

  /** POST /summaries/{id}/export: a Word working copy. */
  exportSummary(summaryId: ID): Promise<DownloadedFile>

  // G · Drafts (the lawyer reviews and adopts; LegalLens never sends anything, DEC-23)
  listDrafts(matterId: ID): Promise<Draft[]>
  getDraft(draftId: ID): Promise<Draft>
  createDraft(input: {
    matterId: ID
    type: DraftType
    incomingDocumentId: ID
    supportingDocumentIds: ID[]
    instructions: string
    conversationId?: ID
  }): Promise<{ draft: Draft; jobId: ID }>
  updateDraft(draftId: ID, patch: DraftPatch): Promise<Draft>
  /** POST /drafts/{id}/sections/{sid}/regenerate: a proposal only; nothing changes until it is accepted. */
  proposeSectionRewrite(draftId: ID, sectionId: ID, instruction: string): Promise<{ body: string }>
  /** A new section answering a claim the draft doesn't address yet (DEC-47). Also a proposal. */
  proposeClaimResponse(draftId: ID, claimId: ID): Promise<{ section: DraftSection }>
  reviewDraft(draftId: ID): Promise<Draft>
  /** GET /drafts/{id}/checks: the citation checklist and the export gate, worked out by the server. */
  getDraftChecks(draftId: ID): Promise<DraftChecks>
  /** POST /drafts/{id}/export: a Word file. The clean copy is refused while anything in the gate is open. */
  exportDraft(draftId: ID, kind: 'clean' | 'working'): Promise<DownloadedFile>

  // Ops · health: each local component's state, without signing in (added in INT-0.3)
  getHealth(): Promise<Health>
  /** GET /jobs/{id} and POST /jobs/{id}/cancel */
  getJob(jobId: ID): Promise<JobStatus>
  cancelJob(jobId: ID): Promise<void>

  // Matter events (SSE): job progress and document readiness. Returns an unsubscribe function.
  subscribeMatterEvents(matterId: ID, onEvent: (event: MatterEvent) => void): () => void
}
