import type { Message } from '@/api/types'
import { AssistantMessage, type AnswerView } from '@/features/chat/AssistantMessage'
import { UserMessage } from '@/features/chat/UserMessage'
import type { LiveAnswer } from '@/stores/runs'

// The messages of one chat, plus the answer being streamed (FE-4.9). Virtualisation arrives in FE-9.2.
function fromMessage(m: Message, question?: string): AnswerView {
  return {
    messageId: m.id,
    question,
    text: m.content,
    citations: m.citations ?? [],
    state: m.answerState,
    outsideLaw: m.outsideLaw,
    searched: m.searched,
    stopped: m.stopped,
    job: m.job,
    streaming: false,
  }
}

function fromLive(a: LiveAnswer, question?: string): AnswerView {
  return {
    // No messageId until the saved message arrives: the live id can't take feedback.
    question,
    text: a.text,
    citations: a.citations,
    state: a.state,
    outsideLaw: a.outsideLaw,
    searched: a.searched,
    error: a.error,
    job: a.job,
    streaming: !a.finished,
    step: a.step,
    stepsDone: a.stepsDone,
    scopeLabel: a.scopeLabel,
  }
}

// The last user message before position i: what an answer there was a reply to.
function questionBefore(messages: Message[], i: number): string | undefined {
  for (let k = i - 1; k >= 0; k--) {
    const m = messages[k]
    if (m?.role === 'user') return m.content
  }
  return undefined
}

export function Thread({ messages, live }: { messages: Message[]; live?: LiveAnswer }) {
  const showLive = live && !messages.some((m) => m.id === live.messageId)
  return (
    <div role="log" aria-label="Conversation" className="space-y-9">
      {messages.map((m, i) =>
        m.role === 'user' ? (
          <UserMessage key={m.id} content={m.content} />
        ) : (
          <AssistantMessage key={m.id} answer={fromMessage(m, questionBefore(messages, i))} />
        ),
      )}
      {showLive ? (
        <AssistantMessage answer={fromLive(live, questionBefore(messages, messages.length))} />
      ) : null}
    </div>
  )
}
