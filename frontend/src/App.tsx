import { lazy, Suspense } from 'react'
import { RouterProvider } from 'react-router'
import type { ApiClient } from '@/api/client'
import { AppProviders } from '@/app/providers'
import { router } from '@/app/router'

// The dev panel (⌘⇧D) is loaded only in development builds; production never ships it (FE-2.6).
const DevPanel = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('@/features/shell/DevPanel')).DevPanel }))
  : null

export function App({ client }: { client?: ApiClient }) {
  return (
    <AppProviders client={client}>
      <RouterProvider router={router} />
      {DevPanel ? (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      ) : null}
    </AppProviders>
  )
}
