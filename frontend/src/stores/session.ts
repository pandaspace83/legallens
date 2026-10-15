import { create } from 'zustand'

// Idle timeout and the lock screen (FE-3.2, DEC-54). The backend ends a session after 30 minutes without activity,
// so the screen locks at the same point and asks for a fresh sign-in. The lock survives a page reload, so reloading
// is not a way around it.
export const IDLE_TIMEOUT_MS = 30 * 60_000
const LOCK_KEY = 'legallens.locked'

function readLocked() {
  try {
    return sessionStorage.getItem(LOCK_KEY) === '1'
  } catch {
    return false
  }
}

function writeLocked(locked: boolean) {
  try {
    if (locked) sessionStorage.setItem(LOCK_KEY, '1')
    else sessionStorage.removeItem(LOCK_KEY)
  } catch {
    // Storage blocked: the lock still holds for this page.
  }
}

interface SessionState {
  locked: boolean
  reason: 'idle' | 'manual' | null
  /** The dev panel shortens this to show the warning and the lock quickly. */
  idleTimeoutMs: number
  /** Bumped by "Stay signed in" and by unlocking, so the idle clock restarts. */
  activityEpoch: number
  lock(reason: 'idle' | 'manual'): void
  unlock(): void
  stay(): void
  setIdleTimeout(ms: number): void
}

export const useSession = create<SessionState>((set) => ({
  locked: readLocked(),
  reason: readLocked() ? 'idle' : null,
  idleTimeoutMs: IDLE_TIMEOUT_MS,
  activityEpoch: 0,
  lock: (reason) => {
    writeLocked(true)
    set({ locked: true, reason })
  },
  unlock: () => {
    writeLocked(false)
    set((s) => ({ locked: false, reason: null, activityEpoch: s.activityEpoch + 1 }))
  },
  stay: () => set((s) => ({ activityEpoch: s.activityEpoch + 1 })),
  setIdleTimeout: (ms) => set((s) => ({ idleTimeoutMs: ms, activityEpoch: s.activityEpoch + 1 })),
}))

/** How long before the lock the warning appears: a minute, or a third of a short dev timeout. */
export function warningWindow(timeoutMs: number) {
  return Math.min(60_000, Math.round(timeoutMs / 3))
}

export function formatDuration(ms: number) {
  if (ms >= 60_000) {
    const minutes = Math.round(ms / 60_000)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }
  const seconds = Math.round(ms / 1000)
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
}
