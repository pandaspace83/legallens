import type {
  AnswerState,
  Citation,
  Coverage,
  ID,
  IngestStep,
  SearchedInfo,
  DraftStep,
  SummaryStep,
} from '@/api/types'

// Events on GET /runs/{run_id}/stream, in the order the server sends them (API reference, SSE events).
export type RunStep = 'rewriting' | 'searching' | 'reranking' | 'generating' | 'verifying'

export type RunEvent =
  | { type: 'run.started'; runId: ID; messageId: ID }
  | {
      type: 'intent'
      intent: 'ask' | 'summarize' | 'draft' | 'refine_draft' | 'clarify'
      confidence: number
    }
  | { type: 'scope'; searching: string }
  | { type: 'status'; step: RunStep }
  | { type: 'token'; delta: string }
  /** The checked text, replacing what was streamed (citations renumbered, unsupported parts removed). */
  | { type: 'answer_text'; text: string }
  | { type: 'citation'; citation: Citation }
  | { type: 'answer_state'; state: AnswerState; outsideLaw: boolean; searched?: SearchedInfo }
  | { type: 'job'; jobId: ID; kind: 'summarize'; summaryId: ID }
  | { type: 'job'; jobId: ID; kind: 'draft'; draftId: ID }
  | { type: 'error'; code: string; message: string }
  | { type: 'done'; messageId: ID; cancelled?: boolean }

// Events on GET /matters/{matter_id}/events: background jobs and documents (API reference, SSE events).
export type MatterEvent =
  | {
      type: 'job.progress'
      kind: 'ingest'
      jobId: ID
      documentId: ID
      pct: number
      step: IngestStep
      detail: string
    }
  | {
      type: 'job.progress'
      kind: 'summarize'
      jobId: ID
      summaryId: ID
      pct: number
      step: SummaryStep
      detail: string
    }
  | {
      type: 'job.progress'
      kind: 'draft'
      jobId: ID
      draftId: ID
      pct: number
      step: DraftStep
      detail: string
    }
  | { type: 'job.done'; kind: 'summarize'; jobId: ID; summaryId: ID; documentName: string }
  | { type: 'job.done'; kind: 'draft'; jobId: ID; draftId: ID; title: string }
  | { type: 'job.failed'; kind: 'summarize' | 'draft'; jobId: ID; entityId: ID; message: string }
  | { type: 'document.ready'; documentId: ID; name: string; coverage: Coverage }
  | { type: 'document.failed'; documentId: ID; name: string; reason: string; quarantined: boolean }
