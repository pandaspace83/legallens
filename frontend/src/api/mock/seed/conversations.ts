import { answerFor, DRAFT_STARTED, SUMMARY_STARTED } from '@/api/mock/answerEngine'
import type { Conversation, Message } from '@/api/types'
import { ago } from '@/lib/ids'

// Chat history spread across dates, so every sidebar group (Pinned, Today, Yesterday, …) has rows.
// Answers come from the same scripted engine the live chat uses.

interface SeedChat {
  id: string
  matterId: string
  title: string
  pinned?: boolean
  at: Parameters<typeof ago>[0]
  questions: string[]
}

const CHATS: SeedChat[] = [
  {
    id: 'c-termination',
    matterId: 'smith',
    title: 'Termination notice in the MSA',
    at: { minutes: 40 },
    questions: [
      'What notice do we need to give to terminate the MSA?',
      'Does sending the notice by email count?',
    ],
  },
  {
    id: 'c-demand',
    matterId: 'smith',
    title: 'Summary of Acme’s demand letter',
    at: { hours: 3 },
    questions: ['Summarize Acme’s demand letter for me.'],
  },
  {
    id: 'c-deadlines',
    matterId: 'smith',
    title: 'Key dates and deadlines',
    pinned: true,
    at: { days: 3 },
    questions: ['List every deadline in the matter’s documents.'],
  },
  {
    id: 'c-reply',
    matterId: 'smith',
    title: 'Reply to Acme’s demand letter',
    at: { days: 1, hours: 1 },
    questions: [
      'Draft a reply to Acme’s demand letter. Dispute the invoices under section 6.4, push back on the 1.5% interest, and propose a call.',
    ],
  },
  {
    id: 'c-latefee',
    matterId: 'smith',
    title: 'Late fee claimed vs. the MSA',
    at: { days: 1, hours: 2 },
    questions: ['Is the 1.5% late fee Acme claims allowed under the MSA?'],
  },
  {
    id: 'c-cap',
    matterId: 'smith',
    title: 'Liability cap under section 9',
    at: { days: 1, hours: 5 },
    questions: ['What is the liability cap under the MSA?'],
  },
  {
    id: 'c-noncompete',
    matterId: 'smith',
    title: 'Is the non-compete enforceable?',
    at: { days: 4 },
    questions: ['Is the non-compete in section 11.2 enforceable in California?'],
  },
  {
    id: 'c-sla',
    matterId: 'smith',
    title: 'SLA credits owed for Q3',
    at: { days: 12 },
    questions: ['How many SLA credits is Smith entitled to for Q3?'],
  },
  {
    id: 'c-assessment',
    matterId: 'smith',
    title: 'Initial case assessment',
    at: { days: 25 },
    questions: ['Give me an overview of the demand letter.'],
  },

  {
    id: 'c-deposit',
    matterId: 'rivera',
    title: 'Security deposit deductions',
    at: { days: 2 },
    questions: ['Which deductions from the deposit are allowed under the lease?'],
  },
  {
    id: 'c-henderson',
    matterId: 'henderson',
    title: 'Specific bequests in the will',
    at: { days: 64 },
    questions: ['List the specific bequests in the will.'],
  },
]

function buildMessages(chat: SeedChat): Message[] {
  const messages: Message[] = []
  chat.questions.forEach((question, i) => {
    const createdAt = ago({ ...chat.at, minutes: (chat.at.minutes ?? 0) - i * 2 })
    const answer = answerFor(chat.matterId, question, `${chat.id}-${i}`)
    messages.push({
      id: `${chat.id}-q${i}`,
      conversationId: chat.id,
      role: 'user',
      content: question,
      createdAt,
    })
    messages.push({
      id: `${chat.id}-a${i}`,
      conversationId: chat.id,
      role: 'assistant',
      content: answer.text,
      createdAt,
      answerState: answer.state,
      outsideLaw: answer.outsideLaw,
      citations: answer.citations,
      searched: answer.searched,
    })
  })
  return messages
}

export const SEED_CONVERSATIONS: Conversation[] = CHATS.map((c) => ({
  id: c.id,
  matterId: c.matterId,
  title: c.title,
  pinned: c.pinned ?? false,
  createdAt: ago(c.at),
  updatedAt: ago(c.at),
}))

export const SEED_MESSAGES: Message[] = CHATS.flatMap(buildMessages).map((m) =>
  m.id === 'c-reply-a0'
    ? {
        id: m.id,
        conversationId: m.conversationId,
        role: 'assistant',
        createdAt: m.createdAt,
        content: DRAFT_STARTED('response_letter', 'Demand letter – Whitfield & Crane.pdf'),
        job: { kind: 'draft', draftId: 'draft-reply' },
      }
    : m.id === 'c-demand-a0'
      ? {
          id: m.id,
          conversationId: m.conversationId,
          role: 'assistant',
          createdAt: m.createdAt,
          content: SUMMARY_STARTED(
            'Demand letter – Whitfield & Crane.pdf',
            'letter_demand',
            'detailed',
          ),
          job: { kind: 'summarize', summaryId: 'sum-demand' },
        }
      : m,
)
