import { describe, expect, it } from 'vitest'
import { applyTokenAction, diffWords, findTokens } from '@/lib/drafts'

describe('placeholder grammar (DEC-48)', () => {
  it('finds every kind of token and ignores [n] citations', () => {
    const kinds = findTokens(
      'On [DATE OF NOTICE] [2] per [CITE NEEDED: proof] and [UNVERIFIED: X v. Y] [RULE NEEDED: rule]',
    ).map((t) => t.kind)
    expect(kinds).toEqual(['placeholder', 'cite_needed', 'unverified', 'rule_needed'])
  })
})

describe('resolving tokens', () => {
  const body =
    'Smith gave notice on [DATE OF NOTICE]. Interest is capped [3]. Statutory interest would not change this [UNVERIFIED: Cal. Civ. Code § 3289].'
  const [date, , unverified] = [...findTokens(body), undefined]

  it('fills a placeholder with the fact', () => {
    expect(applyTokenAction(body, date!, { type: 'fill', value: 'September 30, 2026' })).toContain(
      'notice on September 30, 2026.',
    )
  })

  it('removes the whole sentence that relied on an unverified authority', () => {
    const tokens = findTokens(body)
    expect(applyTokenAction(body, tokens[1]!, { type: 'remove_sentence' })).toBe(
      'Smith gave notice on [DATE OF NOTICE]. Interest is capped [3].',
    )
    expect(unverified).toBeUndefined()
  })

  it('keeps decimals and amounts whole when removing a sentence', () => {
    const interest =
      'The Agreement does not permit interest at 1.5% per month. The $2,169.00 claimed [4] is overstated. Statutory interest would not change this [UNVERIFIED: Cal. Civ. Code § 3289].'
    const [token] = findTokens(interest)
    expect(applyTokenAction(interest, token!, { type: 'remove_sentence' })).toBe(
      'The Agreement does not permit interest at 1.5% per month. The $2,169.00 claimed [4] is overstated.',
    )
  })

  it('keeps paragraph breaks when removing a sentence', () => {
    const text = 'First point. Relies on [UNVERIFIED: X v. Y].\n\nSecond point.'
    const [token] = findTokens(text)
    expect(applyTokenAction(text, token!, { type: 'remove_sentence' })).toBe(
      'First point.\n\nSecond point.',
    )
  })

  it('turns a vouched-for authority into a parenthetical', () => {
    const tokens = findTokens(body)
    expect(applyTokenAction(body, tokens[1]!, { type: 'vouch' })).toContain(
      'change this (Cal. Civ. Code § 3289).',
    )
  })
})

describe('placeholder grammar', () => {
  it('reads the backend’s [PLACEHOLDER: …] token as a fact to fill', () => {
    expect(findTokens('As to this, [PLACEHOLDER: our response to point 1].')).toEqual([
      {
        kind: 'placeholder',
        text: 'our response to point 1',
        raw: '[PLACEHOLDER: our response to point 1]',
      },
    ])
  })

  it('still reads all-caps slots and leaves citation markers alone', () => {
    const kinds = findTokens('Dated [LETTER DATE], see [1] and [FIRM NAME].').map((t) => t.text)
    expect(kinds).toEqual(['LETTER DATE', 'FIRM NAME'])
  })
})

describe('diffWords', () => {
  it('marks added and removed words', () => {
    expect(diffWords('pay the invoices now', 'pay none of the invoices')).toEqual([
      { kind: 'same', text: 'pay ' },
      { kind: 'add', text: 'none of ' },
      { kind: 'same', text: 'the invoices ' },
      { kind: 'del', text: 'now' },
    ])
  })
})
