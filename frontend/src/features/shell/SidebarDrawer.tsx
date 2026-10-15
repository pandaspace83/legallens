import { X } from 'lucide-react'
import { Dialog as Radix } from 'radix-ui'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { Logo } from '@/components/common/Logo'
import { IconButton } from '@/components/ui/IconButton'
import { keepEscape } from '@/features/shell/keepEscape'
import { PanelBoundary } from '@/components/common/PanelBoundary'
import { Sidebar } from '@/features/shell/Sidebar'
import { useSidebarDrawer } from '@/stores/ui'

// Below 1024 px the sidebar slides in from the left over the conversation, opened from the top bar. It closes
// once a chat or document is chosen, on Esc, or on a click outside (FE-9.3).
export function SidebarDrawer() {
  const open = useSidebarDrawer((s) => s.open)
  const setOpen = useSidebarDrawer((s) => s.setOpen)
  const { pathname, search } = useLocation()

  useEffect(() => setOpen(false), [pathname, search, setOpen])

  return (
    <Radix.Root open={open} onOpenChange={setOpen}>
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 z-40 animate-fade-in bg-fg/30" />
        <Radix.Content
          aria-describedby={undefined}
          onEscapeKeyDown={keepEscape}
          // Focus the drawer itself, not its first button, so a tooltip doesn't pop up uninvited; the title is
          // still announced and Tab reaches every control.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            ;(event.target as HTMLElement | null)?.focus()
          }}
          className="fixed inset-y-0 left-0 z-40 flex w-[min(300px,85vw)] animate-slide-in-left flex-col bg-sidebar shadow-overlay outline-none"
        >
          <Radix.Title className="sr-only">Chats and documents</Radix.Title>
          <div className="flex h-[var(--height-topbar)] shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
            <Logo />
            <IconButton label="Close" onClick={() => setOpen(false)}>
              <X />
            </IconButton>
          </div>
          <PanelBoundary name="the sidebar">
            <Sidebar className="flex-1 border-r-0" />
          </PanelBoundary>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
