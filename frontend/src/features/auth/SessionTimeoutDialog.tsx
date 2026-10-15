import { Clock } from 'lucide-react'
import { useMe } from '@/api/queries/auth'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { formatDuration, useSession } from '@/stores/session'

// The idle warning (FE-3.2, DEC-54): a countdown and "Stay signed in". Locking early is one click too.
export function SessionTimeoutDialog({ remainingMs }: { remainingMs: number | null }) {
  const stay = useSession((s) => s.stay)
  const lock = useSession((s) => s.lock)
  const timeout = useSession((s) => s.idleTimeoutMs)
  const { refetch } = useMe()
  const seconds = remainingMs === null ? 0 : Math.ceil(remainingMs / 1000)

  return (
    <Dialog open={remainingMs !== null} onOpenChange={(open) => !open && stay()}>
      <DialogContent
        size="sm"
        title="Still there?"
        description={`For your clients’ privacy, LegalLens locks after ${formatDuration(timeout)} without activity.`}
      >
        <DialogBody>
          <div className="flex items-center gap-3 rounded-card border border-warning/25 bg-warning-tint px-4 py-3">
            <Clock className="size-5 shrink-0 text-warning" aria-hidden />
            <p className="text-[14px] text-fg" role="timer" aria-live="off">
              Locking in <span className="font-semibold tabular-nums">{seconds}</span>{' '}
              {seconds === 1 ? 'second' : 'seconds'}
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => lock('manual')}>
            Lock now
          </Button>
          <Button
            variant="primary"
            autoFocus
            onClick={() => {
              stay()
              void refetch() // keeps the server's session alive too once the backend is connected
            }}
          >
            Stay signed in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
