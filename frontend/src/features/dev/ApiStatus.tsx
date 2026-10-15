import { useApi } from '@/api/ApiProvider'
import { useHealth } from '@/api/queries/health'
import { cn } from '@/lib/cn'

// Development builds only: which data source the app is using and, against the real backend, whether it is
// reachable and healthy (INT-0.3). Production gets the system banners instead (FE-8.3).
export function ApiStatus() {
  const api = useApi()
  const { data: health, isError } = useHealth()

  let tone = 'bg-fg-subtle'
  let text = 'Mock data in the browser (VITE_API=mock)'
  if (api.kind === 'http') {
    if (isError) {
      tone = 'bg-danger'
      text = 'Backend not reachable through /api. Start it with `uv run legallens dev`.'
    } else if (!health) {
      text = 'Checking the backend…'
    } else {
      const down = health.components.filter((c) => !c.ok).map((c) => c.name)
      const stub = health.components.find((c) => c.name === 'orchestrator')?.kind === 'stub'
      tone = down.length ? 'bg-warning' : 'bg-success'
      text = `Backend ${health.version}${down.length ? ` · degraded: ${down.join(', ')}` : ' · all components ok'}${stub ? ' · stub answers' : ''}`
    }
  }

  return (
    <p className="flex items-center gap-2 font-mono text-[11.5px] text-fg-subtle" role="status">
      <span className={cn('size-1.5 shrink-0 rounded-full', tone)} aria-hidden />
      <span>Development · {text}</span>
    </p>
  )
}
