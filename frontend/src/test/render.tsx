import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createMockApiClient } from '@/api/mock/MockApiClient'
import { AppProviders } from '@/app/providers'
import { createQueryClient } from '@/app/queryClient'
import { routes } from '@/app/router'

// Render the real route tree at a URL, with fresh providers, so tests see what the lawyer sees.
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    router,
    ...render(
      <AppProviders client={createMockApiClient()} queryClient={createQueryClient()}>
        <RouterProvider router={router} />
      </AppProviders>,
    ),
  }
}
