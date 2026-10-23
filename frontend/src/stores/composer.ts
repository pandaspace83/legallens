import { create } from 'zustand'
import type { DraftType, ID, Mode, Scope, SummaryAudience, SummaryTemplate } from '@/api/types'

// Composer scope, mode, summary choice and draft type, remembered per matter (FE-4.3, FE-4.4).
interface ComposerState {
  scope: Record<ID, Scope>
  mode: Record<ID, Mode>
  setScope(matterId: ID, scope: Scope): void
  setMode(matterId: ID, mode: Mode): void
  summary: Record<ID, SummaryChoice>
  setSummary(matterId: ID, choice: SummaryChoice): void
  draftType: Record<ID, DraftType>
  setDraftType(matterId: ID, type: DraftType): void
}

export interface SummaryChoice {
  template: SummaryTemplate
  audience: SummaryAudience
}

export const useComposer = create<ComposerState>((set) => ({
  scope: {},
  mode: {},
  setScope: (matterId, scope) => set((s) => ({ scope: { ...s.scope, [matterId]: scope } })),
  setMode: (matterId, mode) => set((s) => ({ mode: { ...s.mode, [matterId]: mode } })),
  summary: {},
  setSummary: (matterId, choice) => set((s) => ({ summary: { ...s.summary, [matterId]: choice } })),
  draftType: {},
  setDraftType: (matterId, type) =>
    set((s) => ({ draftType: { ...s.draftType, [matterId]: type } })),
}))

const DEFAULT_SUMMARY: SummaryChoice = { template: 'letter_demand', audience: 'detailed' }

export function useMatterSummaryChoice(matterId: ID) {
  return useComposer((s) => s.summary[matterId] ?? DEFAULT_SUMMARY)
}

// The template and audience the lawyer picked, or undefined when they never did: only a picked choice is sent,
// so otherwise the backend matches the template to the document (an opinion is not summarized as a letter).
export function useMatterSummaryPick(matterId: ID) {
  return useComposer((s) => s.summary[matterId])
}

export function useMatterDraftType(matterId: ID) {
  return useComposer((s) => s.draftType[matterId] ?? 'response_letter')
}

const ALL: Scope = { kind: 'all' }

export function useMatterScope(matterId: ID) {
  return useComposer((s) => s.scope[matterId] ?? ALL)
}

export function useMatterMode(matterId: ID) {
  return useComposer((s) => s.mode[matterId] ?? 'auto')
}
