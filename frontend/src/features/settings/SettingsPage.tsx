import { KeyRound, Lock, LogOut, ShieldCheck, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useMe } from '@/api/queries/auth'
import { Avatar } from '@/components/common/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { AboutSection } from '@/features/settings/AboutSection'
import { LicensingStates } from '@/features/settings/LicensingStates'
import { ShortcutList } from '@/features/shell/ShortcutsSheet'
import { SystemBanner } from '@/features/shell/SystemBanner'
import { TopBar } from '@/features/shell/TopBar'
import { cn } from '@/lib/cn'
import { formatDuration, useSession } from '@/stores/session'

// Settings (FE-8.1): profile, licensing states (DEC-29), security (DEC-54), keyboard shortcuts and about.
const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'licensing', label: 'Licensing states' },
  { id: 'security', label: 'Security' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'about', label: 'About' },
]

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-card border border-line bg-surface p-6 shadow-raised"
    >
      <h2 id={`${id}-title`} className="font-serif text-[21px] leading-snug text-fg">
        {title}
      </h2>
      {hint ? <p className="mt-1 max-w-[560px] text-[13.5px] text-fg-muted">{hint}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Row({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode
  title: ReactNode
  detail: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-hover text-fg-muted [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-fg">
          {title}
        </div>
        <p className="mt-0.5 text-[13px] text-fg-muted">{detail}</p>
      </div>
      {action}
    </div>
  )
}

export function SettingsPage() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const lock = useSession((s) => s.lock)
  const timeout = useSession((s) => s.idleTimeoutMs)
  const active = hash.slice(1) || 'profile'

  return (
    <div className="min-h-dvh bg-app">
      <TopBar />
      <SystemBanner />
      <main className="mx-auto grid max-w-[1040px] grid-cols-[minmax(0,1fr)] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <h1 className="font-serif text-[32px] leading-tight tracking-[-0.015em] text-fg">
            Settings
          </h1>
          <nav aria-label="Settings sections" className="sticky top-6 mt-6 hidden md:block">
            <ul className="space-y-0.5">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={active === s.id ? 'true' : undefined}
                    className={cn(
                      'block rounded-control px-3 py-1.5 text-[13.5px] transition-colors',
                      active === s.id
                        ? 'bg-hover font-medium text-fg'
                        : 'text-fg-muted hover:bg-hover hover:text-fg',
                    )}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
              <li className="mt-3 border-t border-line pt-3">
                <Link
                  to="/settings/data"
                  className="flex items-center gap-2 rounded-control px-3 py-1.5 text-[13.5px] text-fg-muted hover:bg-hover hover:text-fg"
                >
                  <ShieldCheck className="size-3.5" aria-hidden /> Where your data goes
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="space-y-6 md:pt-[60px]">
          <Section id="profile" title="Profile" hint="Your name and email come from your sign-in.">
            <div className="flex items-center gap-4">
              <Avatar initials={me?.initials ?? '··'} className="size-12 text-[15px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-fg">{me?.name}</p>
                <p className="truncate text-[13.5px] text-fg-muted">{me?.email}</p>
              </div>
              <Button
                variant="secondary"
                onClick={() => navigate('/login', { state: { signedOut: 'manual' } })}
              >
                <LogOut /> Sign out
              </Button>
            </div>
          </Section>

          <Section
            id="licensing"
            title="Licensing states"
            hint="Rules on AI use, client consent and reviewing metadata differ by state. LegalLens uses these for reminders and defaults. Saved on this computer."
          >
            <LicensingStates />
          </Section>

          <Section id="security" title="Security">
            <div className="divide-y divide-line">
              <Row
                icon={<KeyRound />}
                title={
                  <>
                    Two-step verification{' '}
                    <Badge size="sm" tone="success">
                      On
                    </Badge>
                  </>
                }
                detail="Required at every sign-in: your password, then a code from your authenticator app."
              />
              <Row
                icon={<Timer />}
                title="Automatic lock"
                detail={`LegalLens locks after ${formatDuration(timeout)} without activity, and you sign in again to continue.`}
                action={
                  <Button variant="secondary" size="sm" onClick={() => lock('manual')}>
                    <Lock /> Lock now
                  </Button>
                }
              />
            </div>
          </Section>

          <Section
            id="shortcuts"
            title="Keyboard shortcuts"
            hint="Press ? anywhere outside a text field to see these."
          >
            <ShortcutList />
          </Section>

          <Section id="about" title="About">
            <AboutSection />
          </Section>
        </div>
      </main>
    </div>
  )
}
