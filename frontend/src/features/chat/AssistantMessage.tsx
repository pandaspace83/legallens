import { AlertTriangle } from 'lucide-react'
import { useParams } from 'react-router'
import type { RunStep } from '@/api/events'
import type { AnswerState, Citation, ID, JobRef, SearchedInfo } from '@/api/types'
import { LogoMark } from '@/components/common/Logo'
import { useAsk } from '@/features/composer/useAsk'
import { AnswerBody } from '@/features/chat/AnswerBody'
import { AnswerStateBadge } from '@/features/chat/AnswerStateBadge'
import { JobCard } from '@/features/chat/JobCard'
import { DraftJobCard } from '@/features/drafts/DraftJobCard'
import { MessageActions } from '@/features/chat/MessageActions'
import { OutsideLawNotice } from '@/features/chat/OutsideLawNotice'
import { SearchedDetails, SearchedRoot, SearchedToggle } from '@/features/chat/SearchedDisclosure'
import { SourcesList } from '@/features/chat/SourcesList'
import { StatusSteps } from '@/features/chat/StatusSteps'

// One answer: live steps, streamed serif text, citations, answer state, sources and actions (FE-4.5).
export interface AnswerView {
  messageId?: ID
  /** The question this answers, for "Ask again". */
  question?: string
  text: string
  citations: Citation[]
  state?: AnswerState
  outsideLaw?: boolean
  searched?: SearchedInfo
  stopped?: boolean
  error?: string
  job?: JobRef
  streaming: boolean
  step?: RunStep
  stepsDone?: RunStep[]
  scopeLabel?: string
}

export function AssistantMessage({ answer }: { answer: AnswerView }) {
  const settled = !answer.streaming
  const { matterId = '', conversationId } = useParams()
  const { ask } = useAsk(matterId, conversationId)
  const { question } = answer
  const showSteps = answer.streaming && (answer.step || answer.stepsDone?.length)

  return (
    <article aria-label="Answer" className="group/answer animate-rise-in">
      <div className="mb-3 flex h-6 items-center gap-2.5">
        <LogoMark className="size-6" />
        {settled ? (
          <AnswerStateBadge state={answer.state} stopped={answer.stopped} />
        ) : (
          <span className="text-[13px] font-medium text-fg-muted">LegalLens</span>
        )}
      </div>

      {showSteps ? (
        <div className="mb-4">
          <StatusSteps
            done={answer.stepsDone ?? []}
            current={answer.step}
            scope={answer.scopeLabel}
          />
        </div>
      ) : null}

      {/* Only the text is busy while it streams, so screen readers read it once it is complete, while the steps
          above are still announced as they happen (FE-9.1). */}
      {answer.text ? (
        <div aria-busy={answer.streaming || undefined}>
          <AnswerBody
            text={answer.text}
            citations={answer.citations}
            streaming={answer.streaming && answer.step === 'generating'}
          />
        </div>
      ) : null}

      {answer.error ? (
        <p role="alert" className="mt-3 flex items-center gap-2 text-[13.5px] text-danger">
          <AlertTriangle className="size-4" aria-hidden /> The answer couldn’t be completed. Try
          asking again.
        </p>
      ) : null}

      {answer.job?.kind === 'summarize' ? <JobCard summaryId={answer.job.summaryId} /> : null}
      {answer.job?.kind === 'draft' ? <DraftJobCard draftId={answer.job.draftId} /> : null}

      {settled && answer.outsideLaw ? <OutsideLawNotice /> : null}
      {settled && answer.citations.length ? <SourcesList citations={answer.citations} /> : null}

      {settled && !answer.error && !answer.job ? (
        <SearchedRoot className="mt-3">
          {/* Full strength: faded, the "What was searched" label fell below 4.5:1 contrast (FE-9.1). */}
          <div className="flex items-center gap-1">
            <MessageActions
              text={answer.text}
              citations={answer.citations}
              messageId={answer.messageId}
              onRetry={question ? () => ask(question) : undefined}
            />
            {answer.searched ? <SearchedToggle /> : null}
          </div>
          {answer.searched ? <SearchedDetails searched={answer.searched} /> : null}
        </SearchedRoot>
      ) : null}
    </article>
  )
}
