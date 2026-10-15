import { Command } from 'cmdk'
import {
  FileText,
  Folder,
  Keyboard,
  Lock,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  SquarePen,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useConversations } from '@/api/queries/conversations'
import { useDocuments } from '@/api/queries/documents'
import { useMatters } from '@/api/queries/matters'
import { Kbd } from '@/components/ui/Kbd'
import { useHotkey } from '@/hooks/useHotkeys'
import { useSession } from '@/stores/session'
import { useCommandPalette, useShortcutsSheet } from '@/stores/ui'

// ⌘K palette: new chat, jump to a chat or document, switch matter, go to settings (FE-3.7).

/** The items worth showing: the most recent few before anything is typed, then the first matches for every
 * word typed. A matter can hold thousands of chats, and the palette must not render them all (FE-9.2). */
function shortlist<T>(
  items: T[],
  text: (item: T) => string,
  query: string,
  idle: number,
  max: number,
) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return items.slice(0, idle)
  const found: T[] = []
  for (const item of items) {
    const haystack = text(item).toLowerCase()
    if (words.every((w) => haystack.includes(w))) found.push(item)
    if (found.length === max) break
  }
  return found
}

const itemClass =
  'flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-sm text-fg outline-none select-none data-[selected=true]:bg-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle'

export function CommandPalette() {
  const { matterId = '' } = useParams()
  const navigate = useNavigate()
  const { open, setOpen } = useCommandPalette()
  const showShortcuts = useShortcutsSheet((s) => s.setOpen)
  const lock = useSession((s) => s.lock)
  const { data: conversations = [] } = useConversations(matterId)
  const { data: documents = [] } = useDocuments(matterId)
  const { data: matters = [] } = useMatters()
  const [search, setSearch] = useState('')
  const chats = useMemo(
    () => shortlist(conversations, (c) => c.title, search, 8, 25),
    [conversations, search],
  )
  const docs = useMemo(
    () =>
      shortlist(
        [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
        (d) => d.name,
        search,
        6,
        15,
      ),
    [documents, search],
  )

  const show = (next: boolean) => {
    setOpen(next)
    if (!next) setSearch('')
  }
  useHotkey('mod+k', () => show(!open))

  const go = (to: string) => {
    show(false)
    navigate(to)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={show}
      label="Search chats, documents and matters"
      overlayClassName="fixed inset-0 z-40 bg-fg/25 animate-fade-in"
      contentClassName="fixed top-[14vh] left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-[14px] border border-line bg-surface shadow-overlay animate-pop-in"
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:uppercase"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-[18px] text-fg-subtle" aria-hidden />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search chats, documents and matters…"
          className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
        />
        <Kbd>esc</Kbd>
      </div>
      <Command.List className="max-h-[min(440px,60vh)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-10 text-center text-sm text-fg-subtle">
          No matching chats, documents or matters.
        </Command.Empty>
        {matterId ? (
          <Command.Group heading="Actions">
            <Command.Item className={itemClass} onSelect={() => go(`/m/${matterId}`)}>
              <SquarePen /> New chat
            </Command.Item>
          </Command.Group>
        ) : null}
        {chats.length ? (
          <Command.Group heading={search ? 'Chats' : 'Recent chats'}>
            {chats.map((c) => (
              <Command.Item
                key={c.id}
                value={`chat ${c.title}`}
                className={itemClass}
                onSelect={() => go(`/m/${matterId}/c/${c.id}`)}
              >
                <MessageSquare /> <span className="truncate">{c.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        {docs.length ? (
          <Command.Group heading={search ? 'Documents' : 'Recent documents'}>
            {docs.map((d) => (
              <Command.Item
                key={d.id}
                value={`document ${d.name}`}
                className={itemClass}
                onSelect={() => go(`?doc=${d.id}`)}
              >
                <FileText /> <span className="truncate">{d.name}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        <Command.Group heading="Matters">
          {matters.map((m) => (
            <Command.Item
              key={m.id}
              value={`matter ${m.name} ${m.clientName}`}
              className={itemClass}
              onSelect={() => go(`/m/${m.id}`)}
            >
              <Folder /> <span className="truncate">{m.name}</span>
              <span className="ml-auto truncate text-xs text-fg-subtle">{m.clientName}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Go to">
          <Command.Item className={itemClass} onSelect={() => go('/settings')}>
            <Settings /> Settings
          </Command.Item>
          <Command.Item className={itemClass} onSelect={() => go('/settings/data')}>
            <ShieldCheck /> Where your data goes
          </Command.Item>
          <Command.Item
            className={itemClass}
            onSelect={() => {
              show(false)
              showShortcuts(true)
            }}
          >
            <Keyboard /> Keyboard shortcuts
          </Command.Item>
          <Command.Item
            className={itemClass}
            onSelect={() => {
              show(false)
              lock('manual')
            }}
          >
            <Lock /> Lock LegalLens
          </Command.Item>
        </Command.Group>
      </Command.List>
      <div className="flex items-center gap-4 border-t border-line bg-app px-4 py-2 text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> open
        </span>
      </div>
    </Command.Dialog>
  )
}
