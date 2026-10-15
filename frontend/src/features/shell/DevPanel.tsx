import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical, X } from 'lucide-react'
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { useApi } from '@/api/ApiProvider'
import { mockActionsFor, mockControls, type MockControls } from '@/api/mock/devControls'
import { queryKeys } from '@/api/queryKeys'
import { router } from '@/app/router'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Switch } from '@/components/ui/Switch'
import { useHotkey } from '@/hooks/useHotkeys'
import { IDLE_TIMEOUT_MS, useSession } from '@/stores/session'
import { useSettings } from '@/stores/settings'

// Development builds only (FE-2.6): ⌘⇧D opens switches that put the mock into the states the app must handle,
// such as the AI engine stopping, so each one can be seen and tested without a backend.
const SPEEDS = [
  { value: '0', label: 'Instant' },
  { value: '1', label: 'Realistic' },
  { value: '4', label: 'Slow' },
]

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange(v: boolean): void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-fg">{label}</span>
        <span className="block text-[11.5px] text-fg-subtle">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
    </label>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3">
      <h3 className="mb-1 text-[10.5px] font-semibold tracking-[0.08em] text-fg-subtle uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function DevPanel() {
  const [open, setOpen] = useState(false)
  const api = useApi()
  const client = useQueryClient()
  const controls = useSyncExternalStore(mockControls.subscribe, mockControls.get)
  const timeout = useSession((s) => s.idleTimeoutMs)
  const setIdleTimeout = useSession((s) => s.setIdleTimeout)
  const lock = useSession((s) => s.lock)
  const onboardingDismissed = useSettings((s) => s.onboardingDismissed)
  useHotkey('mod+shift+d', () => setOpen((o) => !o))

  if (!open) return null
  const mock = api.kind === 'mock'
  const set = (patch: Partial<MockControls>) => {
    mockControls.set(patch)
    void client.invalidateQueries({ queryKey: ['health'] })
  }

  return (
    <aside
      aria-label="Dev panel"
      className="fixed bottom-4 left-4 z-[80] w-[320px] animate-pop-in overflow-hidden rounded-card border border-line bg-surface shadow-overlay"
    >
      <header className="flex items-center gap-2 px-4 py-3">
        <FlaskConical className="size-4 text-primary" aria-hidden />
        <p className="flex-1 text-[13.5px] font-semibold text-fg">Dev panel</p>
        <span className="rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium text-fg-muted">
          {mock ? 'mock data' : 'backend'}
        </span>
        <button
          type="button"
          aria-label="Close dev panel"
          onClick={() => setOpen(false)}
          className="flex size-7 items-center justify-center rounded-control text-fg-subtle hover:bg-hover hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </header>

      {mock ? (
        <>
          <Group title="This computer">
            <Toggle
              label="LegalLens not responding"
              hint="Every request fails, to show the error states"
              checked={controls.unreachable}
              onChange={(v) => {
                mockControls.set({ unreachable: v })
                void client.invalidateQueries()
              }}
            />
            <Toggle
              label="AI engine offline"
              hint="Asking, summarizing and drafting pause"
              checked={controls.engineOffline}
              onChange={(v) => set({ engineOffline: v })}
            />
            <Toggle
              label="Worker stopped"
              hint="Background jobs wait in line"
              checked={controls.workerStopped}
              onChange={(v) => set({ workerStopped: v })}
            />
            <Toggle
              label="Malware scanner offline"
              hint="Uploads are refused"
              checked={controls.scannerOffline}
              onChange={(v) => set({ scannerOffline: v })}
            />
            <Toggle
              label="Storage almost full"
              hint="A warning, dismissible"
              checked={controls.storageLow}
              onChange={(v) => set({ storageLow: v })}
            />
          </Group>
          <Group title="Network">
            <div className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-[13px] font-medium text-fg">Speed</span>
              <Segmented
                size="sm"
                label="Network speed"
                value={String(controls.latencyScale)}
                options={SPEEDS}
                onChange={(v) => mockControls.set({ latencyScale: Number(v) })}
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="mt-1 w-full"
              disabled={controls.failNext}
              onClick={() => mockControls.set({ failNext: true })}
            >
              {controls.failNext ? 'The next request will fail' : 'Fail the next request'}
            </Button>
          </Group>
        </>
      ) : (
        <p className="border-t border-line px-4 py-3 text-[12.5px] text-fg-muted">
          Connected to the backend, so the demo-data switches are off. Stop its components to see
          their states.
        </p>
      )}

      <Group title="Session">
        <Toggle
          label="Lock after 30 seconds idle"
          hint="Instead of 30 minutes; the warning shows at 20 s"
          checked={timeout !== IDLE_TIMEOUT_MS}
          onChange={(v) => setIdleTimeout(v ? 30_000 : IDLE_TIMEOUT_MS)}
        />
        <Button
          size="sm"
          variant="secondary"
          className="mt-1 w-full"
          onClick={() => {
            setOpen(false)
            lock('manual')
          }}
        >
          Lock now
        </Button>
      </Group>

      {mock ? (
        <Group title="Large data">
          <Button
            size="sm"
            variant="secondary"
            className="mt-1 w-full"
            onClick={async () => {
              mockActionsFor(api)?.loadLargeData('smith')
              await client.invalidateQueries()
              void router.navigate('/m/smith')
            }}
          >
            Add 2,000 chats and 200 documents
          </Button>
        </Group>
      ) : null}

      {mock ? (
        <Group title="First run">
          <div className="flex gap-2 py-1">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={async () => {
                const id = mockActionsFor(api)?.addEmptyMatter()
                await client.invalidateQueries({ queryKey: queryKeys.matters })
                if (id) void router.navigate(`/m/${id}`)
              }}
            >
              Add an empty matter
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!onboardingDismissed}
              onClick={() => useSettings.setState({ onboardingDismissed: false })}
            >
              Show guide again
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 w-full text-danger"
            onClick={() => window.location.reload()}
          >
            Reset demo data (reload)
          </Button>
        </Group>
      ) : null}
    </aside>
  )
}
