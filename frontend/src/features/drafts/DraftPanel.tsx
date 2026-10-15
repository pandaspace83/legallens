import { CheckCircle2, Loader2, PenLine, SearchX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMe } from '@/api/queries/auth'
import { useDraft, useDraftChecks, useDrafts, useUpdateDraft } from '@/api/queries/drafts'
import { LoadError } from '@/components/common/LoadError'
import { useMatter } from '@/api/queries/matters'
import type { Draft, DraftPatch, ID } from '@/api/types'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Progress } from '@/components/ui/Progress'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { ChecksTab } from '@/features/drafts/ChecksTab'
import { DraftEditor } from '@/features/drafts/DraftEditor'
import { ExportMenu } from '@/features/drafts/ExportMenu'
import { ReviewDialog } from '@/features/drafts/ReviewDialog'
import { VersionHistory } from '@/features/drafts/VersionHistory'
import { WatermarkBand } from '@/features/drafts/WatermarkBand'
import { useViewer } from '@/features/viewer/useViewer'
import { addedBy, applyTokenAction, type DraftToken, type TokenAction } from '@/lib/drafts'
import { formatRelative } from '@/lib/dates'
import { errorText } from '@/lib/errors'

// A draft in the side panel (FE-7.2): the letter or memo to read and edit, the checks that guard the clean
// copy, version history, review and export. Every change is saved as a new version on the server.
const TYPE_LABEL: Record<Draft['type'], string> = {
  response_letter: 'Response letter',
  memo: 'Internal memo',
}

const TOKEN_LABEL: Record<TokenAction['type'], (t: DraftToken) => string> = {
  fill: (t) => `Filled in ${t.text.toLowerCase()}`,
  source: (t) => `Added a source: ${t.text}`,
  vouch: (t) => `Vouched for ${t.text}`,
  remove_sentence: (t) => `Removed the sentence citing ${t.text}`,
  drop_flag: (t) => `Removed the flag: ${t.text}`,
}

function StatusBadge({ draft }: { draft: Draft }) {
  if (draft.status === 'drafting')
    return (
      <Badge size="sm" tone="primary">
        Drafting
      </Badge>
    )
  if (draft.status === 'reviewed_adopted')
    return (
      <Badge size="sm" tone="success">
        <CheckCircle2 /> Adopted
      </Badge>
    )
  return (
    <Badge size="sm" tone="warning">
      Not reviewed
    </Badge>
  )
}

export function DraftPanel({ matterId }: { matterId: ID }) {
  const { draftId, closeDraft } = useViewer()
  const { data: draft, isError, refetch, isFetching } = useDraft(matterId, draftId)
  const { data: drafts, isSuccess: listed } = useDrafts(matterId)
  const { data: checks } = useDraftChecks(matterId, draftId, draft?.status !== 'drafting')
  const { data: me } = useMe()
  const { data: matter } = useMatter(matterId)
  const update = useUpdateDraft(matterId, draftId ?? '')
  const [tab, setTab] = useState('letter')
  const [reviewing, setReviewing] = useState(false)
  const [highlighted, setHighlighted] = useState<string>()
  const scroller = useRef<HTMLDivElement>(null)

  // A section shown from the checks is scrolled to and flashed once; the Letter tab is already mounted.
  useEffect(() => {
    if (!highlighted) return
    const el = scroller.current?.querySelector(`#section-${CSS.escape(highlighted)}`)
    if (el instanceof HTMLElement && scroller.current) {
      scroller.current.scrollTo({ top: el.offsetTop - 120, behavior: 'smooth' })
    }
    const t = setTimeout(() => setHighlighted(undefined), 1800)
    return () => clearTimeout(t)
  }, [highlighted])

  // Gone only when the matter's drafts loaded without it; any other failure is a failed load.
  const gone = listed && !drafts.some((d) => d.id === draftId)
  if (isError && !draft && !gone) {
    return (
      <LoadError
        what="This draft"
        onRetry={() => refetch()}
        retrying={isFetching}
        className="flex h-full items-center justify-center"
      />
    )
  }

  if (isError && !draft) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={SearchX}
          title="This draft isn’t available"
          description="It may have been deleted with its matter."
        />
      </div>
    )
  }

  const readOnly = matter?.status === 'closed' || draft?.status === 'drafting'

  const change = (patch: DraftPatch, done?: () => void) =>
    update.mutate(patch, { onSuccess: () => done?.(), onError: (e) => toast.error(errorText(e)) })

  const saveSection = (sectionId: string, body: string, versionLabel: string) =>
    draft &&
    change({
      sections: draft.sections.map((s) => (s.id === sectionId ? { ...s, body } : s)),
      versionLabel,
    })

  const resolveToken = (sectionId: string, token: DraftToken, action: TokenAction) => {
    if (!draft) return
    const authority = addedBy(token, action)
    change({
      sections: draft.sections.map((s) =>
        s.id === sectionId ? { ...s, body: applyTokenAction(s.body, token, action) } : s,
      ),
      versionLabel: TOKEN_LABEL[action.type](token),
      // A source the lawyer names joins the citation checklist, where it is ticked like any other (DEC-49).
      ...(authority && { addedAuthorities: [...draft.addedAuthorities, authority] }),
    })
  }

  const showSection = (sectionId: string) => {
    setTab('letter')
    setHighlighted(sectionId)
  }

  const open = (checks?.blockers ?? []).filter((b) => b.key !== 'review').length

  // One Tabs root around the header and the body, so each tab is linked to its panel.
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line bg-surface px-5 pt-4">
        {/* On a phone the actions take a row of their own under the title; Close stays top right. */}
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <PenLine className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
              {draft ? TYPE_LABEL[draft.type] : 'Draft'}
              {draft ? <StatusBadge draft={draft} /> : null}
            </p>
            {draft ? (
              <>
                <h2 className="truncate text-[14.5px] font-semibold text-fg" title={draft.title}>
                  {draft.title}
                </h2>
                <p className="truncate text-[12.5px] text-fg-subtle">
                  Replying to {draft.incomingDocumentName}
                </p>
              </>
            ) : (
              <Skeleton className="mt-1 h-4 w-56" />
            )}
          </div>
          {draft && draft.status !== 'drafting' ? (
            <div className="flex items-center gap-1 max-sm:order-last max-sm:basis-full max-sm:justify-end">
              <VersionHistory draft={draft} readOnly={readOnly} onUpdate={change} />
              <ExportMenu draft={draft} onShowChecks={() => setTab('checks')} />
              {draft.status === 'not_reviewed' && !readOnly ? (
                <Button size="sm" variant="primary" onClick={() => setReviewing(true)}>
                  Review and adopt
                </Button>
              ) : null}
            </div>
          ) : null}
          <IconButton label="Close draft" className="sm:-ml-2" onClick={closeDraft}>
            <X />
          </IconButton>
        </div>

        {draft && draft.status !== 'drafting' ? (
          <div className="mt-3 flex items-end justify-between gap-3">
            <TabsList className="border-b-0" aria-label="Draft views">
              <TabsTrigger value="letter">{draft.type === 'memo' ? 'Memo' : 'Letter'}</TabsTrigger>
              <TabsTrigger value="checks">
                Checks
                {open ? (
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">
                    {open}
                    <span className="sr-only"> open</span>
                  </span>
                ) : (
                  <CheckCircle2 className="size-3.5 text-success" aria-label="All clear" />
                )}
              </TabsTrigger>
            </TabsList>
            <p className="pb-2.5 text-[12px] text-fg-subtle" aria-live="polite">
              {update.isPending
                ? 'Saving…'
                : `Version ${draft.version} · saved ${formatRelative(draft.updatedAt)}`}
            </p>
          </div>
        ) : (
          <div className="h-3" />
        )}
      </header>

      {draft && draft.status !== 'drafting' ? <WatermarkBand draft={draft} /> : null}

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
        {!draft ? (
          <div className="mx-auto max-w-[700px] space-y-4 px-6 py-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ))}
          </div>
        ) : draft.status === 'drafting' ? (
          <div
            className="mx-6 my-8 rounded-card border border-line bg-surface p-5 shadow-raised"
            aria-live="polite"
          >
            <p className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Writing the{' '}
              {TYPE_LABEL[draft.type].toLowerCase()}
            </p>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              {draft.stepDetail ?? 'Waiting to start'}
            </p>
            <Progress value={draft.progress ?? 0} label="Draft progress" className="mt-3" />
            <p className="mt-3 text-[12.5px] text-fg-subtle">
              Built only from your documents. Anything they don’t contain is left as a placeholder
              for you to fill in.
            </p>
          </div>
        ) : (
          <>
            <TabsContent value="letter" className="outline-none">
              <DraftEditor
                draft={draft}
                signer={me?.name ?? ''}
                clientName={matter?.clientName ?? ''}
                readOnly={readOnly}
                highlighted={highlighted}
                onSave={saveSection}
                onToken={resolveToken}
              />
            </TabsContent>
            <TabsContent value="checks" className="outline-none">
              <ChecksTab
                draft={draft}
                readOnly={readOnly}
                onUpdate={change}
                onShowSection={showSection}
                onReview={() => setReviewing(true)}
              />
            </TabsContent>
          </>
        )}
      </div>

      {draft ? (
        <ReviewDialog
          draft={draft}
          open={reviewing}
          onOpenChange={setReviewing}
          onShowChecks={() => setTab('checks')}
        />
      ) : null}
    </Tabs>
  )
}
