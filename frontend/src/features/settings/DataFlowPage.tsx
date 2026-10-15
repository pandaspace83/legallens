import {
  Ban,
  Cpu,
  Database,
  FileLock2,
  HardDriveUpload,
  KeyRound,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { SystemBanner } from '@/features/shell/SystemBanner'
import { TopBar } from '@/features/shell/TopBar'

// Where your data goes: a plain-language account of what stays on this computer (FE-8.2, DEC-55).
const LOCAL: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: FileLock2,
    title: 'Your documents',
    body: 'Stored encrypted (AES-256), one folder per matter.',
  },
  {
    Icon: Database,
    title: 'Chats, drafts and the audit log',
    body: 'Kept in one encrypted database file on this computer.',
  },
  {
    Icon: Search,
    title: 'The search index',
    body: 'Built and searched locally, always filtered to one matter.',
  },
  {
    Icon: Cpu,
    title: 'The AI model',
    body: 'Runs on this computer. Your text is never sent to an AI company.',
  },
]

const NEVER = [
  'Sent to outside AI services such as OpenAI, Anthropic or Google',
  'Used to train any AI model',
  'Included in analytics, crash reports or tracing tools',
  'Mixed between matters: each matter’s documents are searched on their own',
]

export function DataFlowPage() {
  return (
    <div className="min-h-dvh bg-app">
      <TopBar />
      <SystemBanner />
      <main className="mx-auto max-w-[880px] px-6 py-12">
        <span className="flex size-11 items-center justify-center rounded-full bg-success-tint text-success">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <h1 className="mt-5 font-serif text-[34px] leading-tight tracking-[-0.015em] text-fg">
          Where your data goes
        </h1>
        <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-fg-muted">
          Everything LegalLens does happens on this computer. This page explains it in plain
          language, for you and for your clients.
        </p>

        <section className="mt-10">
          <h2 className="text-[11px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
            Stays on this computer
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {LOCAL.map(({ Icon, title, body }) => (
              <li
                key={title}
                className="flex gap-3.5 rounded-card border border-line bg-surface p-4 shadow-raised"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-fg">{title}</h3>
                  <p className="mt-0.5 text-[13.5px] text-fg-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 font-semibold text-fg">
              <Ban className="size-4 text-danger" aria-hidden /> Your data is never
            </h2>
            <ul className="mt-3 space-y-2 text-[13.5px] text-fg-muted">
              {NEVER.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-card border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 font-semibold text-fg">
              <HardDriveUpload className="size-4 text-primary" aria-hidden /> The one thing that
              leaves
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-fg-muted">
              A nightly backup, so a lost or broken computer doesn’t mean a lost client file. It is
              encrypted before it leaves, under a key only you hold.
            </p>
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-fg-subtle">
              <KeyRound className="size-3.5" aria-hidden /> Without your key, the backup can’t be
              read by anyone.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
