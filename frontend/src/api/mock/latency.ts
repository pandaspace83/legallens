import { mockControls, SimulatedFailure, SimulatedOutage } from '@/api/mock/devControls'

// Realistic network timing for the mock, so loading states are seen and designed (FE-2.3).

export function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

/** A random delay between min and max milliseconds, scaled by the dev panel. No delay under Vitest. A request
 * the dev panel marked to fail rejects after its delay. */
export async function latency(min = 150, max = 450) {
  const { latencyScale, failNext, unreachable } = mockControls.get()
  if (import.meta.env.MODE !== 'test')
    await delay((min + Math.random() * (max - min)) * latencyScale)
  if (unreachable) throw new SimulatedOutage()
  if (failNext) {
    mockControls.set({ failNext: false })
    throw new SimulatedFailure()
  }
}
