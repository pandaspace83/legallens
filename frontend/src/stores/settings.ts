import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// Settings kept in this browser (FE-8.1, FE-8.5): whether the first-run guide was dismissed. Licensing states
// (DEC-29) live on the server since INT-3.10; `licensingStates` here is only what an older version saved in this
// browser, which Settings moves to the server once and then clears.
interface SettingsState {
  licensingStates: string[]
  clearLegacyLicensingStates(): void
  onboardingDismissed: boolean
  dismissOnboarding(): void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      licensingStates: [],
      clearLegacyLicensingStates: () => set({ licensingStates: [] }),
      onboardingDismissed: false,
      dismissOnboarding: () => set({ onboardingDismissed: true }),
    }),
    { name: 'legallens.settings.v1', storage: createJSONStorage(() => localStorage) },
  ),
)
