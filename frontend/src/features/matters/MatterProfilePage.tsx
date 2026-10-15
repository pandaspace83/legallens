import {
  Bot,
  FileText,
  Landmark,
  Lock,
  MessageSquare,
  Pencil,
  Scale,
  Trash2,
  Users,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Link, useParams } from 'react-router'
import type { Matter } from '@/api/types'
import { useConversations } from '@/api/queries/conversations'
import { useDocuments } from '@/api/queries/documents'
import { useCloseMatter, useMatter } from '@/api/queries/matters'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog'
import { DeleteMatterDialog } from '@/features/matters/DeleteMatterDialog'
import { ExportMatterButton } from '@/features/matters/ExportMatterButton'
import { NewMatterDialog } from '@/features/matters/NewMatterDialog'
import { errorText } from '@/lib/errors'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatRelative } from '@/lib/dates'
import { plural } from '@/lib/format'

// The matter's details: client, sides, opposing counsel, court, the client's AI consent, and what it holds; edit,
// close, export and delete live here (FE-3.8, FE-3.9).
export function MatterProfilePage() {
  const { matterId = '' } = useParams()
  const { data: matter, isPending, isError, refetch } = useMatter(matterId)
  const { data: documents } = useDocuments(matterId)
  const { data: chats } = useConversations(matterId)
  const close = useCloseMatter(matterId)
  const [editing, setEditing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-8">
        <p className="text-[12px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
          Matter details
        </p>
        {isError && !matter ? (
          <div role="alert" className="mt-6 text-[14px] text-fg-muted">
            This matter’s details couldn’t load.{' '}
            <button
              type="button"
              onClick={() => refetch()}
              className="font-medium text-link hover:underline"
            >
              Try again
            </button>
          </div>
        ) : isPending ? (
          <div className="mt-3 space-y-3" aria-busy="true" aria-label="Loading matter details">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="mt-6 h-48 w-full" />
          </div>
        ) : (
          <>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-[30px] leading-tight tracking-[-0.015em] text-fg">
                {matter.name}
              </h1>
              {matter.status === 'closed' ? (
                <Badge tone="neutral">
                  <Lock className="size-3" aria-hidden /> Closed, read-only
                </Badge>
              ) : (
                <Badge tone="success">Open</Badge>
              )}
            </div>
            <p className="mt-1 text-[14px] text-fg-muted">
              {matter.practiceArea} · updated {formatRelative(matter.updatedAt)}
            </p>

            <section
              aria-label="Parties and court"
              className="mt-8 overflow-hidden rounded-card border border-line bg-surface shadow-raised"
            >
              <dl className="divide-y divide-line">
                <Row icon={<Users />} term="Our client">
                  {matter.clientName} <span className="text-fg-subtle">· {matter.ourSide}</span>
                </Row>
                <Row icon={<Scale />} term="Other side">
                  {matter.opposingParty}
                </Row>
                <Row icon={<Scale />} term="Their counsel">
                  {matter.opposingCounsel ? (
                    <>
                      {matter.opposingCounsel.name}{' '}
                      <span className="text-fg-subtle">· {matter.opposingCounsel.firm}</span>
                    </>
                  ) : (
                    <span className="text-fg-subtle">None recorded</span>
                  )}
                </Row>
                <Row icon={<Landmark />} term="Court">
                  {matter.court}
                </Row>
                <Row icon={<Bot />} term="Client’s AI consent">
                  {CONSENT[matter.aiConsent?.status ?? 'not_recorded']}
                  {matter.aiConsent?.status === 'given' ? (
                    <span className="text-fg-subtle">
                      {' '}
                      · told: {told(matter.aiConsent) || 'nothing recorded'}
                    </span>
                  ) : null}
                </Row>
              </dl>
            </section>

            <section aria-label="What this matter holds" className="mt-6 grid gap-3 sm:grid-cols-2">
              <Count
                icon={<FileText />}
                to={`/m/${matterId}/documents`}
                label="Open the document library"
                value={documents ? plural(documents.length, 'document') : undefined}
              />
              <Count
                icon={<MessageSquare />}
                to={`/m/${matterId}`}
                label="Start a new chat"
                value={chats ? plural(chats.length, 'chat') : undefined}
              />
            </section>

            <section aria-label="Manage this matter" className="mt-8 flex flex-wrap gap-2.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={matter.status === 'closed'}
                onClick={() => setEditing(true)}
              >
                <Pencil /> Edit details
              </Button>
              <ExportMatterButton matterId={matterId} />
              <Button
                size="sm"
                variant="secondary"
                disabled={matter.status === 'closed'}
                onClick={() => setClosing(true)}
              >
                <Lock /> Close matter
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => setDeleting(true)}
              >
                <Trash2 /> Delete matter
              </Button>
            </section>

            <NewMatterDialog open={editing} onOpenChange={setEditing} matter={matter} />
            <DeleteMatterDialog matter={matter} open={deleting} onOpenChange={setDeleting} />
            <Dialog open={closing} onOpenChange={setClosing}>
              <DialogContent
                size="sm"
                title={`Close ${matter.name}?`}
                description="Its chats, documents and drafts become read-only. You can still read, search and export them."
              >
                <DialogBody className="text-[13.5px] text-fg-muted">
                  Closing keeps everything; nothing is deleted.
                </DialogBody>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="primary"
                    loading={close.isPending}
                    onClick={() =>
                      close.mutate(undefined, {
                        onSuccess: () => {
                          setClosing(false)
                          toast.success(`${matter.name} is closed`)
                        },
                        onError: (e) => toast.error(errorText(e)),
                      })
                    }
                  >
                    Close the matter
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  )
}

const CONSENT = {
  not_recorded: 'Not recorded',
  given: 'Given',
  declined: 'Declined',
} as const

const told = (c: NonNullable<Matter['aiConsent']>) =>
  [c.toldTool && 'the tool', c.toldData && 'the data', c.toldRisks && 'the risks']
    .filter(Boolean)
    .join(', ')

function Row({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="flex items-center gap-2 text-[13px] text-fg-muted [&_svg]:size-4 [&_svg]:text-fg-subtle">
        {icon}
        {term}
      </dt>
      <dd className="text-[14px] text-fg">{children}</dd>
    </div>
  )
}

function Count({
  icon,
  to,
  label,
  value,
}: {
  icon: ReactNode
  to: string
  label: string
  value?: string
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-raised transition-colors hover:border-line-strong"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary-tint text-primary [&_svg]:size-[18px]">
        {icon}
      </span>
      <span>
        <span className="block text-[15px] font-semibold text-fg">
          {value ?? <Skeleton className="h-4 w-24" />}
        </span>
        <span className="block text-[12.5px] text-fg-muted group-hover:text-fg">{label}</span>
      </span>
    </Link>
  )
}
