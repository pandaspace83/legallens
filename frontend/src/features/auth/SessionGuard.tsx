import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router'
import { useMe } from '@/api/queries/auth'
import { LockScreen } from '@/features/auth/LockScreen'
import { SessionTimeoutDialog } from '@/features/auth/SessionTimeoutDialog'
import { ShortcutsSheet } from '@/features/shell/ShortcutsSheet'
import { useSession, warningWindow } from '@/stores/session'

// Wraps every signed-in page (FE-3.2): watches for activity, warns a minute before the idle timeout, then locks.
// While the warning is open, only "Stay signed in" counts as activity, so a stray mouse move can't silently keep
// an unattended session alive.
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const

export function SessionGuard() {
  const locked = useSession((s) => s.locked)
  const lock = useSession((s) => s.lock)
  const timeout = useSession((s) => s.idleTimeoutMs)
  const epoch = useSession((s) => s.activityEpoch)
  const setIdleTimeout = useSession((s) => s.setIdleTimeout)
  // The server decides how long a session may sit idle (INT-3.7); the lock follows it, not a fixed 30 minutes.
  const serverTimeout = useMe().data?.idleTimeoutMs
  useEffect(() => {
    if (serverTimeout && serverTimeout !== useSession.getState().idleTimeoutMs)
      setIdleTimeout(serverTimeout)
  }, [serverTimeout, setIdleTimeout])
  const lastActivity = useRef(0) // set when the clock starts, in the effect below
  const warningOpen = useRef(false)
  // The countdown belongs to one activity epoch: "Stay signed in" starts a new epoch, which hides it.
  const [countdown, setCountdown] = useState<{ epoch: number; ms: number } | null>(null)
  const remaining = !locked && countdown?.epoch === epoch ? countdown.ms : null

  useEffect(() => {
    warningOpen.current = remaining !== null
  }, [remaining])

  useEffect(() => {
    if (locked) return
    lastActivity.current = Date.now() // a new epoch, or unlocking, restarts the clock
    let last = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - last < 1000 || warningOpen.current) return
      last = now
      lastActivity.current = now
    }
    ACTIVITY.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    const tick = window.setInterval(() => {
      const left = timeout - (Date.now() - lastActivity.current)
      if (left <= 0) {
        setCountdown(null)
        lock('idle')
      } else {
        setCountdown(left <= warningWindow(timeout) ? { epoch, ms: left } : null)
      }
    }, 500)
    return () => {
      ACTIVITY.forEach((e) => window.removeEventListener(e, onActivity))
      window.clearInterval(tick)
    }
  }, [locked, timeout, lock, epoch])

  return (
    <>
      {/* While locked the page stays loaded, so work in progress survives, but it is inert: out of the tab order
          and hidden from assistive technology. The lock screen above it covers it visually. */}
      <div inert={locked} aria-hidden={locked || undefined}>
        <Outlet />
      </div>
      <SessionTimeoutDialog remainingMs={remaining} />
      <ShortcutsSheet />
      {locked ? <LockScreen /> : null}
    </>
  )
}
