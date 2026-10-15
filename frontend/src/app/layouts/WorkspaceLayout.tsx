import { Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { PanelBoundary } from '@/components/common/PanelBoundary'
import { UploadDialog } from '@/features/documents/UploadDialog'
import { ClosedMatterBanner } from '@/features/matters/ClosedMatterBanner'
import { CommandPalette } from '@/features/shell/CommandPalette'
import { ContextPanel } from '@/features/shell/ContextPanel'
import { Sidebar } from '@/features/shell/Sidebar'
import { SidebarDrawer } from '@/features/shell/SidebarDrawer'
import { SystemBanner } from '@/features/shell/SystemBanner'
import { TopBar } from '@/features/shell/TopBar'
import { useHotkey } from '@/hooks/useHotkeys'
import { useSidebarInline } from '@/hooks/useMediaQuery'
import { useMatterEvents } from '@/hooks/useMatterEvents'
import { cn } from '@/lib/cn'

// The workspace: top bar, sidebar, conversation, and the context panel when a document is open (§2.3).
// Below 1024 px the sidebar is a drawer; below 1280 px the panel covers the conversation (FE-9.3).
export function WorkspaceLayout() {
  const { matterId = '' } = useParams()
  const navigate = useNavigate()
  const sidebarInline = useSidebarInline()
  const { pathname } = useLocation()
  useMatterEvents(matterId)
  useHotkey('mod+shift+o', () => navigate(`/m/${matterId}`))

  return (
    <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[var(--height-topbar)_auto_minmax(0,1fr)] overflow-hidden bg-app">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-primary px-3 py-2 text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to conversation
      </a>
      <TopBar />
      <div>
        <SystemBanner />
        <ClosedMatterBanner matterId={matterId} />
      </div>
      <div
        className={cn(
          'grid min-h-0 grid-rows-[minmax(0,1fr)]',
          sidebarInline
            ? 'grid-cols-[var(--width-sidebar)_minmax(0,1fr)_auto]'
            : 'grid-cols-[minmax(0,1fr)_auto]',
        )}
      >
        {sidebarInline ? (
          <PanelBoundary name="the sidebar">
            <Sidebar />
          </PanelBoundary>
        ) : (
          <SidebarDrawer />
        )}
        <main id="main" tabIndex={-1} className="min-h-0 min-w-0 overflow-hidden outline-none">
          {/* A failure in one chat or page clears when the lawyer goes somewhere else. */}
          <PanelBoundary name="this page" resetKey={pathname}>
            <Outlet />
          </PanelBoundary>
        </main>
        <ContextPanel />
      </div>
      <CommandPalette />
      <UploadDialog />
    </div>
  )
}
