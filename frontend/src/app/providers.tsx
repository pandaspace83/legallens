import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { Tooltip } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { ApiProvider } from '@/api/ApiProvider'
import { Toast } from '@/components/ui/Toast'
import { createHttpApiClient } from '@/api/http/HttpApiClient'
import { createQueryClient } from '@/app/queryClient'
import { useSession } from '@/stores/session'
import type { ApiClient } from '@/api/client'

interface AppProvidersProps {
  children: ReactNode
  /** main.tsx passes the mock in mock mode and tests pass their own. With none, the backend's client is used. */
  client?: ApiClient
  queryClient?: QueryClient
}

export function AppProviders({ children, client, queryClient }: AppProvidersProps) {
  const [api] = useState(() => client ?? createHttpApiClient())
  const [queries] = useState(() => queryClient ?? createQueryClient())
  // Toasts name documents and matters, so none show over the lock screen; any raised while locked are dropped.
  const locked = useSession((s) => s.locked)

  return (
    <ApiProvider client={api}>
      <QueryClientProvider client={queries}>
        <Tooltip.Provider delayDuration={300} skipDelayDuration={150}>
          {children}
          {locked ? null : <Toast />}
        </Tooltip.Provider>
      </QueryClientProvider>
    </ApiProvider>
  )
}
