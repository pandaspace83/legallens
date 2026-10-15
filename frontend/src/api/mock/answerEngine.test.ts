import { describe, expect, it } from 'vitest'
import { answerFor } from '@/api/mock/answerEngine'

describe('mock answer engine', () => {
  it('answers a termination question with verified, pinpoint citations', () => {
    const answer = answerFor('smith', 'What notice do we need to terminate the MSA?', 't')
    expect(answer.state).toBe('found')
    expect(answer.citations[0]).toMatchObject({
      documentId: 'doc-msa',
      page: 6,
      para: '4.2(a)',
      verified: true,
    })
    expect(answer.citations[0]?.quote).toContain('sixty (60) days')
  })

  it('flags questions that need outside law', () => {
    const answer = answerFor('smith', 'Is the non-compete enforceable in California?', 't')
    expect(answer).toMatchObject({ state: 'partial', outsideLaw: true })
  })

  it('says "not found" instead of guessing', () => {
    const answer = answerFor('smith', 'What is the weather in Paris?', 't')
    expect(answer.state).toBe('not_found')
    expect(answer.citations).toHaveLength(0)
  })

  it('never answers one matter from another matter’s documents', () => {
    expect(answerFor('rivera', 'What notice do we need to terminate the MSA?', 't').state).toBe(
      'not_found',
    )
  })
})
