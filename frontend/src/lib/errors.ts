import { ApiError } from '@/api/http/request'

// Every problem the server can answer, in the voice of FRONTEND_TODO §2.4: what happened, then what to do (INT-3.8).
// Codes not listed here fall back to the server's own sentence, which is already written for a person.
const MICROCOPY: Record<string, string> = {
  unreachable: 'LegalLens can’t reach its own server. Check that it is running, then try again.',
  session_expired: 'Your session timed out. Sign in again; nothing you wrote was lost.',
  not_authenticated: 'You’re not signed in. Sign in again to carry on.',
  invalid_credentials: 'That email and password didn’t match. Check them and try again.',
  invalid_code: 'That code didn’t match. Check your authenticator app and try again.',
  forbidden_matter: 'You don’t have access to this matter.',
  matter_closed: 'This matter is closed, so it is read-only. Reopen it to make changes.',
  not_found: 'This item no longer exists. It may have been deleted.',
  file_too_large:
    'This file is over the 50 MB limit. Split it, or save a smaller copy, and try again.',
  too_many_pages:
    'This file has more pages than LegalLens can read at once. Split it and upload the parts.',
  unreadable_file: 'This file couldn’t be read. If it is a scan, try a clearer copy.',
  malware_detected: 'The malware scan flagged this file, so it was not stored. Don’t open it.',
  document_not_ready: 'This document is still processing. Try again when it is ready.',
  document_quarantined: 'This document was quarantined and can’t be used.',
  summary_not_ready: 'This summary is still being written.',
  draft_not_ready: 'This draft is still being written.',
  run_in_progress: 'An answer is still on its way in this chat. Wait for it, or press Stop.',
  version_conflict:
    'This draft was changed somewhere else. The latest version is now showing; make your change again.',
  proposal_stale:
    'The draft changed after this preview was made. Ask for the rewrite again so it fits the current text.',
  export_blocked: 'The clean copy can’t be exported yet. Open the checks to see what is left.',
  review_blocked: 'Something in the draft is still open. Open the checks to see what.',
  job_not_cancellable: 'This job has already finished, so it can’t be cancelled.',
  confirmation_mismatch: 'Type the matter’s name exactly to confirm.',
}

export interface DescribedError {
  message: string
  code?: string
  /** For support: quote it when reporting a problem. */
  requestId?: string
}

export function describeError(error: unknown): DescribedError {
  if (error instanceof ApiError) {
    const scanner = error.status === 503 && /scan/i.test(error.message)
    return {
      message: MICROCOPY[error.code] ?? (scanner ? scannerPaused : error.message),
      code: error.code,
      requestId: error.requestId,
    }
  }
  return {
    message:
      error instanceof Error && error.message
        ? error.message
        : 'Something went wrong. Try again; if it keeps happening, restart LegalLens.',
  }
}

const scannerPaused =
  'The malware scanner isn’t responding, so uploads are paused. Nothing was stored. Try again when it is back.'

/** One line for a toast or an inline error, with the reference to quote when there is one. */
export function errorText(error: unknown): string {
  const { message, requestId } = describeError(error)
  return requestId ? `${message} (Reference ${requestId})` : message
}
