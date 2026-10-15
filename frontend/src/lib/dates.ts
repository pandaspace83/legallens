import type { Conversation } from '@/api/types'

// Date grouping for the sidebar and Intl formatting for timestamps (FE-3.4).

export type HistoryGroup =
  'Pinned' | 'Today' | 'Yesterday' | 'Previous 7 days' | 'Previous 30 days' | 'Older'

const ORDER: HistoryGroup[] = [
  'Pinned',
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Previous 30 days',
  'Older',
]

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function groupOf(iso: string, now = new Date()): Exclude<HistoryGroup, 'Pinned'> {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <= 7) return 'Previous 7 days'
  if (days <= 30) return 'Previous 30 days'
  return 'Older'
}

/** Conversations in sidebar order: pinned first, then by date group, newest first inside each group. */
export function groupConversations(conversations: Conversation[], now = new Date()) {
  const groups = new Map<HistoryGroup, Conversation[]>()
  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  for (const c of sorted) {
    const group = c.pinned ? 'Pinned' : groupOf(c.updatedAt, now)
    groups.set(group, [...(groups.get(group) ?? []), c])
  }
  return ORDER.filter((g) => groups.has(g)).map((g) => ({ group: g, items: groups.get(g) ?? [] }))
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const dateOnly = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** "just now", "40 minutes ago", "yesterday", "Sep 12, 2026". */
export function formatRelative(iso: string, now = new Date()) {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return relative.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  if (days < 7) return relative.format(-days, 'day')
  return dateOnly.format(new Date(iso))
}

export function greeting(now = new Date()) {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
