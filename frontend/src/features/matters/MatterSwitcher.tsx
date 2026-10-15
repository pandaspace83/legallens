import { Check, ChevronsUpDown, Folders, Info, Lock, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMatter, useMatters } from '@/api/queries/matters'
import type { ID } from '@/api/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { NewMatterDialog } from '@/features/matters/NewMatterDialog'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/DropdownMenu'

// Searchable matter switcher in the top bar; closed matters are marked read-only (FE-3.3).
export function MatterSwitcher({ matterId }: { matterId: ID }) {
  const navigate = useNavigate()
  const { data: matter } = useMatter(matterId)
  const { data: matters } = useMatters()
  const [creating, setCreating] = useState(false)

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label={matter ? `${matter.name}: switch matter` : 'Switch matter'}
            className="group flex h-9 min-w-0 items-center gap-2 rounded-control px-2.5 text-left transition-colors hover:bg-hover data-[state=open]:bg-hover"
          >
            {matter ? (
              <span className="min-w-0">
                <span className="block truncate text-sm leading-tight font-semibold text-fg">
                  {matter.name}
                </span>
                <span className="block truncate text-[11.5px] leading-tight text-fg-subtle">
                  {matter.practiceArea}
                </span>
              </span>
            ) : (
              <Skeleton className="h-4 w-36" />
            )}
            {matter?.status === 'closed' ? (
              <Lock className="size-3.5 text-fg-subtle" aria-label="Closed" />
            ) : null}
            <ChevronsUpDown
              className="size-4 shrink-0 text-fg-subtle group-hover:text-fg-muted"
              aria-hidden
            />
          </button>
        </MenuTrigger>
        <MenuContent className="w-[340px]">
          <MenuLabel>Switch matter</MenuLabel>
          {matters?.map((m) => (
            <MenuItem
              key={m.id}
              onSelect={() => navigate(`/m/${m.id}`)}
              className="py-2"
              icon={
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-hover font-serif text-[13px] font-semibold text-fg-muted">
                  {m.name.charAt(0)}
                </span>
              }
              hint={
                m.id === matterId ? (
                  <Check className="size-4 text-primary" aria-label="Current matter" />
                ) : m.status === 'closed' ? (
                  <Lock className="size-3.5" aria-label="Closed" />
                ) : null
              }
            >
              <span className="block truncate font-medium">{m.name}</span>
              <span className="block truncate text-xs text-fg-subtle">
                {m.clientName} · {m.status === 'closed' ? 'Closed, read-only' : m.practiceArea}
              </span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem icon={<Info />} onSelect={() => navigate(`/m/${matterId}/profile`)}>
            Matter details
          </MenuItem>
          <MenuItem icon={<Plus />} onSelect={() => setCreating(true)}>
            New matter
          </MenuItem>
          <MenuItem icon={<Folders />} onSelect={() => navigate('/matters')}>
            All matters
          </MenuItem>
        </MenuContent>
      </Menu>
      <NewMatterDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
