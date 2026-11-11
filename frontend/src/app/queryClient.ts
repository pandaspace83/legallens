import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/http/request'

// One place for cache and retry defaults. Tests create a fresh client per render.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // One more try for a dropped connection or a server error. A 4xx (signed out, no access, not found) is
        // the server's answer and will be the same the second time.
        retry: (failures, error) =>
          failures < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  })
}
