import { describe, expect, it } from 'vitest'
import type { Draft } from '@/api/types'
import { initialDraft } from '@/api/mock/draftScripts'
import { computeChecks, deriveAuthorities, exportBlockers } from '@/api/mock/draftChecks'

function draft(overrides: Partial<Draft> = {}): Draft {
  const { sections, citations, claims } = initialDraft('response_letter', 't')
  return {
    id: 'd',
    matterId: 'm',
    type: 'response_letter',
    title: 't',
    incomingDocumentId: 'doc-demand',
    incomingDocumentName: 'x',
    supportingDocumentIds: [],
    instructions: '',
    status: 'not_reviewed',
    dateLine: '',
    sections,
    citations,
    claims,
    addedAuthorities: [],
    acknowledged: [],
    safeguards: { fre408: false, reservationOfRights: false },
    version: 1,
    versions: [],
    modelLabel: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('citation checklist (DEC-49)', () => {
  it('lists legal authority only: the unverified statute, not the contract clauses or letters quoted', () => {
    const rows = deriveAuthorities(draft())
    expect(rows.map((r) => [r.label, r.status])).toEqual([
      ['Cal. Civ. Code § 3289', 'not_uploaded'],
    ])
  })

  it('adds a source the lawyer names as its own row', () => {
    const rows = deriveAuthorities(draft({ addedAuthorities: ['SLA incident log, Aug 2026'] }))
    expect(rows.at(-1)).toMatchObject({
      label: 'SLA incident log, Aug 2026',
      status: 'added_by_lawyer',
    })
  })
})

describe('export gate (DEC-47, DEC-49, DEC-50, DEC-51)', () => {
  it('blocks the seeded draft for every open reason', () => {
    expect(exportBlockers(draft()).map((b) => b.key)).toEqual([
      'tokens',
      'claims',
      'authorities',
      'review',
    ])
  })

  it('opens once everything is resolved and the draft is adopted', () => {
    const d = draft({ status: 'reviewed_adopted' })
    d.sections = d.sections.map((s) => ({ ...s, body: s.body.replace(/\[[A-Z][^\]]*\]/g, 'x') }))
    d.claims = d.claims.map((c) => ({ ...c, waived: true }))
    d.acknowledged = deriveAuthorities(d).map((a) => a.key)
    expect(exportBlockers(d)).toEqual([])
  })
})

describe('computeChecks', () => {
  it('reports the gate and a tick per authority', () => {
    const d = draft()
    const checks = computeChecks(d)
    expect(checks.cleanAllowed).toBe(false)
    expect(checks.authorities[0]).toMatchObject({ unverified: true, acknowledged: false })
  })

  it('stops blocking on an [UNVERIFIED] token once its row is ticked', () => {
    const d = draft()
    const before = exportBlockers(d).find((b) => b.key === 'tokens')!.message
    d.acknowledged = ['unverified:Cal. Civ. Code § 3289']
    const after = exportBlockers(d).find((b) => b.key === 'tokens')?.message
    expect(after).not.toBe(before)
  })
})
