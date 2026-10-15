import { Keyboard, Lock, LogOut, Settings, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useMe } from '@/api/queries/auth'
import { Avatar } from '@/components/common/Avatar'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/DropdownMenu'
import { useSession } from '@/stores/session'
import { useShortcutsSheet } from '@/stores/ui'

// Account menu: settings, shortcuts, where your data goes, lock and sign out (FE-3.3, FE-8.1).
export function UserMenu() {
  const navigate = useNavigate()
  const { data: me } = useMe()
  const lock = useSession((s) => s.lock)
  const showShortcuts = useShortcutsSheet((s) => s.setOpen)

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="rounded-full ring-offset-2 ring-offset-surface transition-shadow hover:ring-2 hover:ring-line-strong data-[state=open]:ring-2 data-[state=open]:ring-line-strong"
        >
          <Avatar initials={me?.initials ?? '··'} />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-[260px]">
        {me ? (
          <div className="px-2 pt-1.5 pb-2">
            <p className="truncate text-sm font-semibold text-fg">{me.name}</p>
            <p className="truncate text-xs text-fg-subtle">{me.email}</p>
          </div>
        ) : null}
        <MenuSeparator />
        <MenuItem icon={<Settings />} onSelect={() => navigate('/settings')}>
          Settings
        </MenuItem>
        <MenuItem icon={<Keyboard />} onSelect={() => showShortcuts(true)}>
          Keyboard shortcuts
        </MenuItem>
        <MenuItem icon={<ShieldCheck />} onSelect={() => navigate('/settings/data')}>
          Where your data goes
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Lock />} onSelect={() => lock('manual')}>
          Lock now
        </MenuItem>
        <MenuItem
          icon={<LogOut />}
          onSelect={() => navigate('/login', { state: { signedOut: 'manual' } })}
        >
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
