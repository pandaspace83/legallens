import { PanelLeft, Search } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useMe } from '@/api/queries/auth'
import { LocalOnlyBadge } from '@/components/common/LocalOnlyBadge'
import { Logo } from '@/components/common/Logo'
import { IconButton } from '@/components/ui/IconButton'
import { Kbd } from '@/components/ui/Kbd'
import { MatterSwitcher } from '@/features/matters/MatterSwitcher'
import { useSidebarInline } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'
import { useCommandPalette, useSidebarDrawer } from '@/stores/ui'
import { UserMenu } from '@/features/shell/UserMenu'
import { modKey } from '@/hooks/useHotkeys'

// Logo, matter switcher, ⌘K search, 'Runs locally' status and the account menu (FE-3.3). Below 1024 px it
// also opens the sidebar drawer, and on a phone the wordmark, search box and badge text give way (FE-9.3).
export function TopBar() {
  const { matterId } = useParams()
  const openPalette = useCommandPalette((s) => s.setOpen)
  const openDrawer = useSidebarDrawer((s) => s.setOpen)
  const sidebarInline = useSidebarInline()
  const standIn = useMe().data?.standInEngine

  return (
    <header className="relative z-20 flex h-[var(--height-topbar)] items-center gap-2 border-b border-line bg-surface px-3">
      {matterId && !sidebarInline ? (
        <IconButton label="Chats and documents" onClick={() => openDrawer(true)}>
          <PanelLeft />
        </IconButton>
      ) : null}
      <Link
        to="/matters"
        aria-label="LegalLens, all matters"
        // On a phone inside a matter the matter's name needs the room; "All matters" is in its menu.
        className={cn(
          'shrink-0 rounded-control px-1.5 py-1 transition-colors hover:bg-hover',
          matterId && 'max-sm:hidden',
        )}
      >
        <Logo />
      </Link>
      {matterId ? (
        <>
          <span aria-hidden className="mx-0.5 text-xl font-light text-line-strong max-sm:hidden">
            /
          </span>
          <MatterSwitcher matterId={matterId} />
        </>
      ) : null}

      <div className="flex-1" />

      {matterId ? (
        <IconButton
          label="Search chats and documents"
          className="lg:hidden"
          onClick={() => openPalette(true)}
        >
          <Search />
        </IconButton>
      ) : null}
      {matterId ? (
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="mr-1 hidden h-8 w-[300px] items-center gap-2 rounded-control border border-line bg-app px-2.5 text-[13px] text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted lg:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search chats and documents</span>
          <Kbd>{modKey}K</Kbd>
        </button>
      ) : null}
      {standIn ? (
        // Decision 10: until a real model is connected, answers must not be mistaken for a model's.
        <span
          title="The AI engine is a stand-in for development. Answers and drafts are placeholders, not a model’s work."
          className="inline-flex h-8 items-center rounded-full border border-warning/30 bg-warning-tint px-3 text-[12.5px] font-medium text-warning max-sm:hidden"
        >
          Stand-in answers
        </span>
      ) : null}
      <LocalOnlyBadge />
      <div className="ml-1.5">
        <UserMenu />
      </div>
    </header>
  )
}
