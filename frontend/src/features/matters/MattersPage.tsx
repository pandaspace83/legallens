import { ArrowRight, FileText, Landmark, Lock, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useMatters } from '@/api/queries/matters'
import { LoadError } from '@/components/common/LoadError'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { NewMatterDialog } from '@/features/matters/NewMatterDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { SystemBanner } from '@/features/shell/SystemBanner'
import { TopBar } from '@/features/shell/TopBar'
import { formatRelative } from '@/lib/dates'

// All matters at a glance; each card opens its workspace (FE-3.8).
export function MattersPage() {
  const { data: matters, isPending, isError, refetch, isFetching } = useMatters()
  const open = matters?.filter((m) => m.status === 'open').length ?? 0
  const [creating, setCreating] = useState(false)

  return (
    <div className="min-h-dvh bg-app">
      <TopBar />
      <SystemBanner />
      <main className="mx-auto max-w-[1080px] px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-serif text-[32px] leading-tight tracking-[-0.015em] text-fg">
            Your matters
          </h1>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus /> New matter
          </Button>
        </div>
        <NewMatterDialog open={creating} onOpenChange={setCreating} />
        <p className="mt-1.5 text-[14.5px] text-fg-muted">
          {matters
            ? `${matters.length} matters · ${open} open · each matter’s documents stay separate`
            : isError
              ? 'Each matter’s documents stay separate'
              : 'Loading… · each matter’s documents stay separate'}
        </p>

        {isError && !matters ? (
          <LoadError
            what="Your matters"
            onRetry={() => refetch()}
            retrying={isFetching}
            className="mt-8 rounded-card border border-line bg-surface"
          />
        ) : null}
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isPending
            ? [0, 1, 2].map((i) => (
                <li key={i} className="space-y-3 rounded-card border border-line bg-surface p-5">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-5/6" />
                </li>
              ))
            : matters?.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/m/${m.id}`}
                    className="group flex h-full flex-col rounded-card border border-line bg-surface p-5 shadow-raised transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-overlay"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-serif text-[19px] leading-snug font-semibold text-fg">
                        {m.name}
                      </h2>
                      {m.status === 'closed' ? (
                        <Badge size="sm" tone="neutral">
                          <Lock aria-hidden /> Closed
                        </Badge>
                      ) : (
                        <Badge size="sm" tone="success">
                          Open
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[13.5px] text-fg-muted">
                      {m.clientName} · {m.ourSide}
                    </p>
                    <p className="mt-4 mb-5 flex items-start gap-2 text-[13px] text-fg-subtle">
                      <Landmark className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {m.court}
                    </p>
                    <div className="mt-auto flex items-center gap-3 border-t border-line pt-4 text-[12.5px] text-fg-subtle">
                      <span className="flex items-center gap-1.5">
                        <FileText className="size-3.5" aria-hidden /> {m.documentCount}{' '}
                        {m.documentCount === 1 ? 'document' : 'documents'}
                      </span>
                      <span>· {formatRelative(m.updatedAt)}</span>
                      <ArrowRight
                        className="ml-auto size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden
                      />
                    </div>
                  </Link>
                </li>
              ))}
        </ul>
      </main>
    </div>
  )
}
