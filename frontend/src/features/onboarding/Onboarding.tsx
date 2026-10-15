import { Check, MessageSquareText, UploadCloud, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useConversations } from '@/api/queries/conversations'
import { useDocuments } from '@/api/queries/documents'
import type { ID } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { useAsk } from '@/features/composer/useAsk'
import { useEngineReady } from '@/features/shell/useSystemStatus'
import { cn } from '@/lib/cn'
import { useSettings } from '@/stores/settings'
import { useUploadDialog } from '@/stores/ui'

// The first-run guide (FE-8.5): create the matter, add its documents, ask the first question. It shows in a matter
// that has no documents or no chats yet, ticks each step as it happens, and can be hidden for good.
const EXAMPLE = 'What are the key dates and deadlines in these documents?'

function Step({
  n,
  done,
  title,
  detail,
  action,
}: {
  n: number
  done: boolean
  title: string
  detail: string
  action?: ReactNode
}) {
  return (
    <li className="flex items-start gap-3.5 py-3.5 first:pt-0 last:pb-0">
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
          done ? 'bg-success text-white' : 'border border-line-strong text-fg-muted',
        )}
      >
        {done ? <Check className="size-4" aria-hidden /> : n}
        <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[14.5px] font-medium',
            done ? 'text-fg-muted line-through decoration-fg-subtle/50' : 'text-fg',
          )}
        >
          {title}
        </p>
        <p className="mt-0.5 text-[13px] text-fg-muted">{detail}</p>
      </div>
      {action && !done ? <div className="shrink-0">{action}</div> : null}
    </li>
  )
}

export function Onboarding({ matterId, matterName }: { matterId: ID; matterName: string }) {
  const dismiss = useSettings((s) => s.dismissOnboarding)
  const showUpload = useUploadDialog((s) => s.show)
  const { data: documents = [] } = useDocuments(matterId)
  const { data: conversations = [] } = useConversations(matterId)
  const { ask, sending } = useAsk(matterId)
  const engineReady = useEngineReady()
  const hasDocs = documents.length > 0
  const anyReady = documents.some((d) => d.status === 'ready')
  const asked = conversations.length > 0
  const done = 1 + Number(hasDocs) + Number(asked)

  return (
    <section
      aria-label="Getting started"
      className="mt-8 animate-rise-in rounded-card border border-line bg-surface p-5 shadow-raised [animation-delay:120ms] [animation-fill-mode:backwards]"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-[19px] text-fg">Getting started</h2>
          <p className="text-[12.5px] text-fg-subtle">
            {done} of 3 done · everything stays on this computer
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide this guide"
          className="flex size-8 items-center justify-center rounded-control text-fg-subtle hover:bg-hover hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
      <ol className="divide-y divide-line">
        <Step
          n={1}
          done
          title="Create the matter"
          detail={`${matterName} is set up. Its documents and chats stay inside it.`}
        />
        <Step
          n={2}
          done={hasDocs}
          title="Add its documents"
          detail="PDFs, Word files and emails. Each is checked, read page by page, and searched only within this matter."
          action={
            <Button size="sm" variant="primary" onClick={() => showUpload()}>
              <UploadCloud /> Upload
            </Button>
          }
        />
        <Step
          n={3}
          done={asked}
          title="Ask your first question"
          detail={
            anyReady
              ? `Type below, or try: “${EXAMPLE}”`
              : 'Once a document is ready, ask anything; every answer cites the page and paragraph.'
          }
          action={
            <Button
              size="sm"
              variant="secondary"
              disabled={!anyReady || !engineReady}
              loading={sending}
              onClick={() => ask(EXAMPLE)}
            >
              <MessageSquareText /> Try it
            </Button>
          }
        />
      </ol>
    </section>
  )
}
