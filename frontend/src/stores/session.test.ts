import { describe, expect, it } from 'vitest'
import { formatDuration, IDLE_TIMEOUT_MS, warningWindow } from '@/stores/session'

describe('session timing (FE-3.2, DEC-54)', () => {
  it('locks after 30 minutes and warns a minute before', () => {
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60_000)
    expect(warningWindow(IDLE_TIMEOUT_MS)).toBe(60_000)
  })

  it('warns for a third of a short dev timeout', () => {
    expect(warningWindow(30_000)).toBe(10_000)
  })

  it('says durations the way people do', () => {
    expect(formatDuration(IDLE_TIMEOUT_MS)).toBe('30 minutes')
    expect(formatDuration(60_000)).toBe('1 minute')
    expect(formatDuration(30_000)).toBe('30 seconds')
  })
})
