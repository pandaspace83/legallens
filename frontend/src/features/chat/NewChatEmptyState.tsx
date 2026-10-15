import {
  CalendarClock,
  FileText,
  MessageSquareText,
  PenLine,
  Percent,
  type LucideIcon,
} from 'lucide-react'
import { useMe } from '@/api/queries/auth'
import { useDocuments } from '@/api/queries/documents'
import { useMatter } from '@/api/queries/matters'
import type { ID } from '@/api/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { Composer } from '@/features/composer/Composer'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { useShowOnboarding } from '@/features/onboarding/useShowOnboarding'
import { useAsk } from '@/features/composer/useAsk'
import { greeting } from '@/lib/dates'
import { plural } from '@/lib/format'
import { useEngineReady } from '@/features/shell/useSystemStatus'

// New chat: a greeting, the composer, and questions built from the matter's documents (FE-4.1).
interface Suggestion {
  Icon: LucideIcon
  question: string
  hint: string
}

const SMITH: Suggestion[] = [
  {
    Icon: MessageSquareText,
    question: 'What notice do we need to terminate the MSA?',
    hint: 'Master Services Agreement',
  },
  {
    Icon: FileText,
    question: 'Summarize Acme’s demand letter',
    hint: 'Whitfield & Crane LLP, Sept 29',
  },
  {
    Icon: Percent,
    question: 'Is the 1.5% late fee Acme claims allowed under the MSA?',
    hint: 'Demand letter vs. MSA §6.3',
  },
  {
    Icon: PenLine,
    question: 'Draft a reply to Acme’s demand letter',
    hint: 'Response letter for your review',
  },
]

const GENERIC: Suggestion[] = [
  { Icon: FileText, question: 'Summarize the most recent document', hint: 'Newest upload' },
  {
    Icon: CalendarClock,
    question: 'List every deadline in the documents',
    hint: 'All documents in this matter',
  },
]

export function NewChatEmptyState({ matterId }: { matterId: ID }) {
  const { data: me } = useMe()
  const { data: matter } = useMatter(matterId)
  const { data: documents = [] } = useDocuments(matterId)
  const { ask } = useAsk(matterId)
  const engineReady = useEngineReady()

  const ready = documents.filter((d) => d.status === 'ready').length
  const processing = documents.filter(
    (d) => d.status === 'processing' || d.status === 'queued',
  ).length
  const suggestions = matterId === 'smith' ? SMITH : GENERIC
  const closed = matter?.status === 'closed'
  const guide = useShowOnboarding(matterId) && !closed

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[780px] flex-col justify-center px-6 pt-10 pb-20">
        <header className="mb-8 animate-rise-in text-center">
          <p className="text-[13.5px] text-fg-subtle">
            {greeting()}
            {me ? `, ${me.firstName}` : ''}
          </p>
          {matter ? (
            <h1 className="mt-2 font-serif text-[34px] leading-[1.2] tracking-[-0.015em] text-balance text-fg">
              What would you like to know about <span className="text-primary">{matter.name}</span>?
            </h1>
          ) : (
            <Skeleton className="mx-auto mt-3 h-9 w-[70%]" />
          )}
          <p className="mt-3 text-[13.5px] text-fg-muted">
            {documents.length === 0
              ? 'No documents yet · add some, then ask anything about them'
              : `${plural(ready, 'document')} ready to search${processing ? ` · ${processing} still processing` : ''} · every answer cites the page and paragraph`}
          </p>
        </header>

        <div className="animate-rise-in [animation-delay:60ms] [animation-fill-mode:backwards]">
          <Composer matterId={matterId} variant="hero" autoFocus />
        </div>

        {guide && matter ? (
          <Onboarding matterId={matterId} matterName={matter.name} />
        ) : !closed ? (
          <section
            aria-label="Suggested questions"
            className="mt-8 grid animate-rise-in gap-3 [animation-delay:120ms] [animation-fill-mode:backwards] sm:grid-cols-2"
          >
            {suggestions.map(({ Icon, question, hint }) => (
              <button
                key={question}
                type="button"
                disabled={!engineReady}
                onClick={() => ask(question)}
                className="group flex items-start gap-3 rounded-card border border-line bg-surface p-4 text-left shadow-raised transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-overlay disabled:pointer-events-none disabled:opacity-55"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] leading-snug font-medium text-fg">
                    {question}
                  </span>
                  <span className="mt-1 block text-[12.5px] text-fg-subtle">{hint}</span>
                </span>
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  )
}
