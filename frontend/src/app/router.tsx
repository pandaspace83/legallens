import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppBoot } from '@/app/AppBoot'
import { RouteError } from '@/app/RouteError'

// Every screen is lazy-loaded so the first paint only ships the shell (FRONTEND_TODO.md §6).
export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    hydrateFallbackElement: <AppBoot />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      {
        lazy: async () => ({ Component: (await import('@/app/layouts/AuthLayout')).AuthLayout }),
        children: [
          {
            path: 'login',
            lazy: async () => ({
              Component: (await import('@/features/auth/LoginPage')).LoginPage,
            }),
          },
          {
            path: 'login/mfa',
            lazy: async () => ({ Component: (await import('@/features/auth/MfaPage')).MfaPage }),
          },
        ],
      },
      {
        // Every signed-in page sits inside the session guard: idle warning and lock screen (FE-3.2).
        lazy: async () => ({
          Component: (await import('@/features/auth/SessionGuard')).SessionGuard,
        }),
        children: [
          {
            path: 'matters',
            lazy: async () => ({
              Component: (await import('@/features/matters/MattersPage')).MattersPage,
            }),
          },
          {
            path: 'm/:matterId',
            lazy: async () => ({
              Component: (await import('@/app/layouts/WorkspaceLayout')).WorkspaceLayout,
            }),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import('@/features/chat/ChatPage')).ChatPage,
                }),
              },
              {
                path: 'c/:conversationId',
                lazy: async () => ({
                  Component: (await import('@/features/chat/ChatPage')).ChatPage,
                }),
              },
              {
                path: 'documents',
                lazy: async () => ({
                  Component: (await import('@/features/documents/DocumentsPage')).DocumentsPage,
                }),
              },
              {
                path: 'profile',
                lazy: async () => ({
                  Component: (await import('@/features/matters/MatterProfilePage'))
                    .MatterProfilePage,
                }),
              },
            ],
          },
          {
            path: 'settings',
            lazy: async () => ({
              Component: (await import('@/features/settings/SettingsPage')).SettingsPage,
            }),
          },
          {
            path: 'settings/data',
            lazy: async () => ({
              Component: (await import('@/features/settings/DataFlowPage')).DataFlowPage,
            }),
          },
        ],
      },
      ...(import.meta.env.DEV
        ? [
            {
              path: 'dev/ui',
              lazy: async () => ({
                Component: (await import('@/features/dev/UiGalleryPage')).UiGalleryPage,
              }),
            },
          ]
        : []),
      {
        path: '*',
        lazy: async () => ({ Component: (await import('@/app/NotFoundPage')).NotFoundPage }),
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
