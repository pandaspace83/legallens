import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/api/ApiProvider'

// Ops · health. Polled, so starting the backend after the page turns the status green without a reload.
export function useHealth({ poll = 10_000 }: { poll?: number } = {}) {
  const api = useApi()
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: poll,
    retry: false,
  })
}
