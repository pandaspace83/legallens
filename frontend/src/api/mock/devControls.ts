// Switches for the mock, set from the dev panel (FE-2.6), so system states can be shown without a backend:
// the AI engine or the worker stopped, the malware scanner down, storage running low, a slow network or one failed
// request. Development builds only; the http client never reads these.

export interface MockControls {
  /** Every request fails, as if LegalLens on this computer had stopped (FE-9.4: error states). */
  unreachable: boolean
  engineOffline: boolean
  workerStopped: boolean
  scannerOffline: boolean
  storageLow: boolean
  /** Multiplies every simulated network delay: 0 instant, 1 realistic, 4 slow. */
  latencyScale: number
  /** The next API call fails once, to show error states. */
  failNext: boolean
}

const initial: MockControls = {
  unreachable: false,
  engineOffline: false,
  workerStopped: false,
  scannerOffline: false,
  storageLow: false,
  latencyScale: 1,
  failNext: false,
}

let state = initial
const listeners = new Set<() => void>()

export const mockControls = {
  get: () => state,
  set(patch: Partial<MockControls>) {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  },
  reset() {
    state = initial
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

/** Actions each mock client registers for itself, e.g. adding an empty matter for the first-run guide. Keyed by
 * client, because React's development mode can create a client twice and keep only one of them. */
export interface MockActions {
  addEmptyMatter(): string
  /** Large-data mode (FE-9.2): 2,000 chats and 200 documents added to a matter, once. */
  loadLargeData(matterId: string): void
}

const actions = new WeakMap<object, MockActions>()

export function registerMockActions(client: object, registered: MockActions) {
  actions.set(client, registered)
}

export function mockActionsFor(client: object): MockActions | undefined {
  return actions.get(client)
}

export class SimulatedOutage extends Error {
  constructor() {
    super('LegalLens isn’t responding (dev panel: “LegalLens not responding”).')
  }
}

export class SimulatedFailure extends Error {
  constructor() {
    super('This request failed on purpose (dev panel: “Fail the next request”).')
  }
}
