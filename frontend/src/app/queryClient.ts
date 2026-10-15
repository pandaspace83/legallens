import { QueryClient } from '@tanstack/react-query'

// One place for cache and retry defaults. Tests create a fresh client per render.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  })
}
