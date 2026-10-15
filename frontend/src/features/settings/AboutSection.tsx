import { Loader2 } from 'lucide-react'
import { Link } from 'react-router'
import { useApi } from '@/api/ApiProvider'
import { Button } from '@/components/ui/Button'
import { useSystemStatus } from '@/features/shell/useSystemStatus'
import { cn } from '@/lib/cn'

// Versions and the state of every local component (FE-8.1, FE-8.3), from GET /health. The banners link here.
const LABELS: Record<string, string> = {
  orchestrator: 'AI engine',
  embedder: 'Search model',
  converter: 'Document reader',
  scanner: 'Malware scanner',
  worker: 'Background worker',
  db: 'Database',
  storage: 'Storage',
  fts5: 'Keyword search',
  sqlite_vec: 'Vector search',
}

export function AboutSection() {
  const api = useApi()
  const status = useSystemStatus()

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-[180px_1fr] gap-y-2 text-[13.5px]">
        <dt className="text-fg-muted">LegalLens app</dt>
        <dd className="text-fg tabular-nums">{__APP_VERSION__}</dd>
        <dt className="text-fg-muted">Data</dt>
        <dd className="text-fg">
          {api.kind === 'mock'
            ? 'Demo data in this browser'
            : status.unreachable
              ? 'LegalLens on this computer (not responding)'
              : `LegalLens on this computer, version ${status.version ?? '…'}`}
        </dd>
      </dl>

      <div className="overflow-hidden rounded-card border border-line">
        <div className="flex items-center justify-between border-b border-line bg-app/60 px-4 py-2.5">
          <p className="text-[12px] font-semibold tracking-[0.05em] text-fg-subtle uppercase">
            Components
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={status.recheck}
            disabled={status.checking}
          >
            {status.checking ? <Loader2 className="animate-spin" /> : null} Check again
          </Button>
        </div>
        <ul className="divide-y divide-line" aria-label="Components">
          {status.components.map((c) => (
            <li key={c.name} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
              <span
                className={cn('size-2 shrink-0 rounded-full', c.ok ? 'bg-success' : 'bg-danger')}
                aria-hidden
              />
              <span className="w-[160px] shrink-0 font-medium text-fg">
                {LABELS[c.name] ?? c.name}
              </span>
              <span className="min-w-0 flex-1 truncate text-fg-muted">
                {[c.kind, c.detail].filter(Boolean).join(' · ')}
              </span>
              <span
                className={cn('text-[12.5px] font-medium', c.ok ? 'text-success' : 'text-danger')}
              >
                {c.ok ? 'Working' : 'Not working'}
              </span>
            </li>
          ))}
          {!status.components.length ? (
            <li className="px-4 py-3 text-[13px] text-fg-subtle">
              {status.unreachable
                ? 'LegalLens isn’t responding, so the components can’t be checked.'
                : 'Checking…'}
            </li>
          ) : null}
        </ul>
      </div>
      <p className="text-[13px] text-fg-muted">
        Nothing here leaves this computer.{' '}
        <Link to="/settings/data" className="font-medium text-link hover:underline">
          Where your data goes
        </Link>
      </p>
    </div>
  )
}
