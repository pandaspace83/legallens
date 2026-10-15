import {
  AlertOctagon,
  HardDrive,
  Loader2,
  PauseCircle,
  ShieldAlert,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { useSystemStatus } from '@/features/shell/useSystemStatus'
import { cn } from '@/lib/cn'

// App-wide banners for what isn't working on this computer (FE-8.3): LegalLens not responding, the AI engine
// stopped, the malware scanner down, background work paused, storage almost full. Each says what still works and
// what to do. At most two show, most serious first; the rest are listed under Settings → About.
interface Issue {
  key: string
  tone: 'danger' | 'warning'
  Icon: LucideIcon
  title: string
  body: string
  dismissible?: boolean
}

export function SystemBanner() {
  const status = useSystemStatus()
  const [dismissed, setDismissed] = useState<string[]>([])

  const issues: Issue[] = []
  if (status.unreachable) {
    issues.push({
      key: 'unreachable',
      tone: 'danger',
      Icon: WifiOff,
      title: 'LegalLens isn’t responding on this computer.',
      body: 'Your documents and work are safe. Start LegalLens again, then check.',
    })
  } else {
    if (status.engineDown)
      issues.push({
        key: 'engine',
        tone: 'danger',
        Icon: AlertOctagon,
        title: 'The local AI engine isn’t running.',
        body: 'You can still read documents, answers and drafts. Asking, summarizing and drafting resume when it’s back.',
      })
    if (status.scannerDown)
      issues.push({
        key: 'scanner',
        tone: 'warning',
        Icon: ShieldAlert,
        title: 'Uploads are paused: the malware scanner isn’t responding.',
        body: 'Files can’t be checked, so none are accepted until it’s back. Nothing is ever stored unchecked.',
      })
    if (status.workerDown)
      issues.push({
        key: 'worker',
        tone: 'warning',
        Icon: PauseCircle,
        title: 'Background work is paused.',
        body: 'New documents, summaries and drafts wait in line until it restarts. Nothing is lost.',
      })
    if (status.storageLow)
      issues.push({
        key: 'storage',
        tone: 'warning',
        Icon: HardDrive,
        title: `This computer is almost out of space${status.storageDetail ? `: ${status.storageDetail}` : ''}.`,
        body: 'Free up space before adding large files; LegalLens needs room for documents and the search index.',
        dismissible: true,
      })
  }

  const shown = issues.filter((i) => !dismissed.includes(i.key))
  if (!shown.length) return null
  const more = shown.length - 2

  return (
    <div role="status" aria-live="polite" className="border-b border-line">
      {shown.slice(0, 2).map((issue, index) => (
        <div
          key={issue.key}
          className={cn(
            'flex items-center gap-3 px-5 py-2 text-[13px] [&+&]:border-t [&+&]:border-line',
            issue.tone === 'danger' ? 'bg-danger-tint text-danger' : 'bg-warning-tint text-warning',
          )}
        >
          <issue.Icon className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">{issue.title}</span>{' '}
            <span className="text-fg-muted">{issue.body}</span>
          </p>
          {issue.dismissible ? (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed((d) => [...d, issue.key])}
              className="flex size-7 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-black/5 hover:text-fg"
            >
              <X className="size-4" />
            </button>
          ) : index === 0 ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0"
              onClick={status.recheck}
              disabled={status.checking}
            >
              {status.checking ? <Loader2 className="animate-spin" /> : null} Check again
            </Button>
          ) : null}
        </div>
      ))}
      {more > 0 ? (
        <p className="border-t border-line bg-warning-tint px-5 py-1.5 text-[12px] text-fg-muted">
          {more} more {more === 1 ? 'issue' : 'issues'} ·{' '}
          <Link to="/settings#about" className="font-medium text-link hover:underline">
            See every component
          </Link>
        </p>
      ) : null}
    </div>
  )
}
