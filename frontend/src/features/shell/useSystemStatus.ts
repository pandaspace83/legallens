import { useHealth } from '@/api/queries/health'

// What is working on this computer right now, from GET /health (FE-8.3). Screens use it to pause what can't work
// (asking, summarizing and drafting need the AI engine) instead of failing when the lawyer tries.
export function useSystemStatus() {
  const { data, isError, refetch, isFetching } = useHealth()
  const part = (name: string) => data?.components.find((c) => c.name === name)
  const down = (name: string) => part(name)?.ok === false
  return {
    /** LegalLens itself isn't answering (only possible against the real backend). */
    unreachable: isError,
    engineDown: isError || down('orchestrator'),
    workerDown: down('worker'),
    scannerDown: down('scanner'),
    storageLow: down('storage'),
    storageDetail: part('storage')?.detail,
    version: data?.version,
    components: data?.components ?? [],
    checking: isFetching,
    recheck: () => void refetch(),
  }
}

/** True while the AI engine can take work. */
export function useEngineReady() {
  return !useSystemStatus().engineDown
}

export const ENGINE_PAUSED = 'Paused: the local AI engine isn’t running'
