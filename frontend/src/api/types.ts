// Domain types shared by every screen. They mirror the SQLite data model in the Technical Architecture doc.

export type ID = string

export interface User {
  id: ID
  name: string
  firstName: string
  email: string
  initials: string
  /** The states the lawyer is licensed in (DEC-29). Kept on the server since INT-3.10. */
  licensingStates: string[]
  /** How long the server lets a session sit idle; the lock screen follows it (INT-3.7). */
  idleTimeoutMs?: number
  /** The AI engine is a stand-in (stub orchestrator): answers are not a model's (decision 10, INT-3.9). */
  standInEngine?: boolean
}

export type MatterStatus = 'open' | 'closed'

/** The client's AI-consent record (DEC-60): what they were told, and when. */
export interface AiConsent {
  status: 'not_recorded' | 'given' | 'declined'
  toldTool: boolean
  toldData: boolean
  toldRisks: boolean
  /** ISO date the consent was given or declined. */
  recordedOn?: string
  notes?: string
}

export interface Matter {
  id: ID
  name: string
  clientName: string
  ourSide: string
  opposingParty: string
  opposingCounsel: { name: string; firm: string } | null
  court: string
  practiceArea: string
  status: MatterStatus
  documentCount: number
  updatedAt: string
  aiConsent?: AiConsent
}

export interface Conversation {
  id: ID
  matterId: ID
  title: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export type AnswerState = 'found' | 'partial' | 'not_found'

export interface Citation {
  /** The number shown in the answer, e.g. [1]. */
  n: number
  id: ID
  documentId: ID
  documentName: string
  page: number
  /** Paragraph or clause anchor, e.g. "4.2(a)". */
  para: string
  quote: string
  verified: boolean
}

export interface SearchedInfo {
  scopeLabel: string
  rewrittenQuestion: string
  documentsSearched: number
  passagesReviewed: number
}

export interface Message {
  id: ID
  conversationId: ID
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  answerState?: AnswerState
  outsideLaw?: boolean
  citations?: Citation[]
  searched?: SearchedInfo
  /** The lawyer pressed Stop before the answer finished. */
  stopped?: boolean
  /** Set when the turn started a background job (a summary) instead of answering inline. */
  job?: JobRef
}

export type DocumentOrigin = 'client' | 'other_party'
export type DocumentStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'quarantined'
export type DocumentKind = 'pdf' | 'docx' | 'eml' | 'msg' | 'txt'

/** Where ingestion is for a document that is still processing (Technical Architecture, frame 6). */
export type IngestStep = 'checking' | 'scanning' | 'reading' | 'ocr' | 'indexing'

/** What was actually read, so nothing is silently skipped (DEC-42). */
export interface Coverage {
  pagesRead: number
  unreadablePages: number[]
  lowConfidencePages: { page: number; confidence: number }[]
}

/** Content hidden from the AI in a document from the other side (DEC-59). */
export interface HiddenItem {
  /** The backend's kinds (tracked_changes, comments, hidden_text, white_text, tiny_text, metadata, annotations,
   * embedded_files); the mock also uses the singular forms. Unknown kinds are shown by their own name. */
  kind: string
  description: string
}

/** Everything that a document's deletion removes (DEC-58). */
export interface DeletionImpact {
  pages: number
  passages: number
  citations: number
  conversations: number
}

export interface LegalDocument {
  id: ID
  matterId: ID
  name: string
  kind: DocumentKind
  origin: DocumentOrigin
  pages: number
  status: DocumentStatus
  /** 0–100 while processing. */
  progress?: number
  /** Average OCR confidence (0–1) when any page was scanned. */
  ocrConfidence?: number
  hiddenContent?: boolean
  /** The notice: how many items and of what kinds. The items themselves come from getHiddenContent (DEC-59). */
  hiddenCount?: number
  hiddenKinds?: string[]
  hiddenItems?: HiddenItem[]
  sizeBytes?: number
  sha256?: string
  /** Set while processing. */
  step?: IngestStep
  stepDetail?: string
  coverage?: Coverage
  /** Why a document failed or was quarantined, in plain words. */
  error?: string
  uploadedAt: string
}

export interface PageBlock {
  /** Paragraph or clause anchor that citations point at. */
  anchor: string
  kind: 'heading' | 'paragraph' | 'meta'
  text: string
}

export interface DocumentPage {
  documentId: ID
  page: number
  blocks: PageBlock[]
}

export type Scope = { kind: 'all' } | { kind: 'document'; documentId: ID }
export type Mode = 'auto' | 'ask' | 'summarize' | 'draft'

// Summaries (DEC-40, DEC-41)
export type SummaryTemplate = 'letter_demand' | 'pleading' | 'opinion'
export type SummaryAudience = 'one_paragraph' | 'detailed' | 'plain_english'
export type SummaryStep = 'reading' | 'extracting' | 'writing' | 'verifying'

export interface SummarySection {
  key: string
  title: string
  /** Null when the document doesn't contain this item: shown as "Not found in this document". */
  body: string | null
}

export interface Summary {
  id: ID
  matterId: ID
  documentId: ID
  documentName: string
  template: SummaryTemplate
  audience: SummaryAudience
  status: 'processing' | 'ready' | 'failed'
  /** The background job, so the chat card can cancel it. */
  jobId?: ID
  progress?: number
  step?: SummaryStep
  stepDetail?: string
  sections: SummarySection[]
  citations: Citation[]
  coverage?: Coverage
  /** Set when the document doesn't fit the template, e.g. a contract run through the letter template. */
  mismatch?: string
  conversationId?: ID
  modelLabel: string
  createdAt: string
}

/** A background job started from a chat turn: its card follows the job live. */
export type JobRef = { kind: 'summarize'; summaryId: ID } | { kind: 'draft'; draftId: ID }

// Drafts (DEC-43 to DEC-51)
export type DraftType = 'response_letter' | 'memo'
export type DraftStep =
  'reading' | 'claims' | 'retrieving' | 'drafting' | 'safeguards' | 'verifying'

export interface DraftSection {
  id: ID
  /** Shown in the editor's margin only; never exported. */
  label: string
  /** Text with **bold**, [n] source citations and placeholder tokens such as [CITE NEEDED: …]. */
  body: string
}

/** A claim or demand in the incoming document, and the section that answers it (DEC-47). */
export interface DraftClaim {
  id: ID
  text: string
  source: Citation
  addressedBy: ID | null
  /** The lawyer chose to leave it unanswered. */
  waived?: boolean
}

export type AuthorityStatus = 'full_text' | 'mentioned_only' | 'not_uploaded' | 'added_by_lawyer'

/** A row in the citation checklist (DEC-49). Derived from the draft's text; see lib/drafts.ts. */
export interface Authority {
  key: string
  label: string
  status: AuthorityStatus
  detail: string
  /** The text still carries an [UNVERIFIED] flag: ticking the row is the lawyer vouching for it (DEC-49). */
  unverified?: boolean
  acknowledged?: boolean
}

export interface DraftVersion {
  version: number
  label: string
  createdAt: string
  sections: DraftSection[]
}

export interface Draft {
  id: ID
  matterId: ID
  conversationId?: ID
  type: DraftType
  title: string
  incomingDocumentId: ID
  incomingDocumentName: string
  supportingDocumentIds: ID[]
  instructions: string
  status: 'drafting' | 'not_reviewed' | 'reviewed_adopted' | 'failed'
  /** The background job, so the chat card can cancel it. */
  jobId?: ID
  reviewedAt?: string
  progress?: number
  step?: DraftStep
  stepDetail?: string
  /** Letters: who it goes to. `represented` drives the Rule 4.2 / 4.3 safeguard (DEC-46). */
  addressee?: { name: string; firm?: string; address: string[]; represented: boolean }
  /** Memos: the To / From / Re block (DEC-45). */
  memoHeader?: { to: string; from: string; re: string }
  dateLine: string
  sections: DraftSection[]
  citations: Citation[]
  claims: DraftClaim[]
  /** Authorities the lawyer typed in to resolve a [CITE NEEDED]: status "added by the lawyer". */
  addedAuthorities: string[]
  acknowledged: string[]
  safeguards: { fre408: boolean; reservationOfRights: boolean }
  version: number
  versions: DraftVersion[]
  modelLabel: string
  createdAt: string
  updatedAt: string
}

/** PATCH /drafts/{id}. Changing sections saves a new version and returns an adopted draft to "not reviewed". */
export interface DraftPatch {
  sections?: DraftSection[]
  versionLabel?: string
  claims?: DraftClaim[]
  addedAuthorities?: string[]
  acknowledged?: string[]
  safeguards?: Partial<Draft['safeguards']>
  restoreVersion?: number
}

/** GET /health: the state of each local component. Needs no sign-in and holds no client data (Ops). */
export interface Health {
  status: 'ok' | 'degraded'
  version: string
  components: { name: string; kind: string; ok: boolean; detail?: string }[]
}

// ---- Added in INT-3.1: what the real backend serves beyond the original mock interface ----

/** What the lawyer enters to open or change a matter (FE-3.8). Fields left out are unchanged on update. */
export interface MatterInput {
  name: string
  clientName: string
  ourSide: string
  opposingParty?: string
  opposingCounsel?: { name: string; firm: string } | null
  court?: string
  practiceArea?: string
  aiConsent?: AiConsent
}

/** GET /drafts/{id}/checks: the server's reading of the draft (DEC-47, DEC-49, DEC-50). */
export interface DraftChecks {
  version: number
  /** Legal authorities only. `key` is the server's id; acknowledgements use it. */
  authorities: Authority[]
  /** Why the clean copy can't be exported yet. Empty when it can. */
  blockers: { key: 'tokens' | 'claims' | 'authorities' | 'review'; message: string }[]
  cleanAllowed: boolean
}

/** One line of a matter's audit log (DEC-57). */
export interface AuditEntry {
  id: ID
  at: string
  action: string
  entityType: string
  entityId?: ID
}

export interface JobStatus {
  id: ID
  kind: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  progress: number
  step?: string
}

export type FeedbackKind = 'helpful' | 'wrong_citation' | 'missed_something' | 'should_be_not_found'

export interface DownloadedFile {
  blob: Blob
  filename: string
}
