import { describe, expect, it } from 'vitest'
import type { Conversation } from '@/api/types'
import { groupConversations, groupOf } from '@/lib/dates'

const now = new Date('2026-10-06T15:00:00')
const at = (iso: string, pinned = false): Conversation => ({
  id: iso,
  matterId: 'm',
  title: iso,
  pinned,
  createdAt: iso,
  updatedAt: iso,
})

describe('groupOf', () => {
  it('buckets dates like the sidebar', () => {
    expect(groupOf('2026-10-06T09:00:00', now)).toBe('Today')
    expect(groupOf('2026-10-05T23:00:00', now)).toBe('Yesterday')
    expect(groupOf('2026-10-01T10:00:00', now)).toBe('Previous 7 days')
    expect(groupOf('2026-09-20T10:00:00', now)).toBe('Previous 30 days')
    expect(groupOf('2026-06-01T10:00:00', now)).toBe('Older')
  })
})

describe('groupConversations', () => {
  it('puts pinned chats first, then date groups newest first', () => {
    const groups = groupConversations(
      [at('2026-10-05T10:00:00'), at('2026-10-06T10:00:00'), at('2026-09-01T10:00:00', true)],
      now,
    )
    expect(groups.map((g) => g.group)).toEqual(['Pinned', 'Today', 'Yesterday'])
  })
})
