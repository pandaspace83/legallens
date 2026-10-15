import { describe, expect, it } from 'vitest'
import {
  answerToPlainText,
  citationLabel,
  parseAnswer,
  parseInline,
  pinpoint,
} from '@/lib/citations'

describe('parseInline', () => {
  it('splits text, bold and citation markers', () => {
    expect(parseInline('Give **sixty days** notice [1].')).toEqual([
      { kind: 'text', text: 'Give ' },
      { kind: 'bold', text: 'sixty days' },
      { kind: 'text', text: ' notice ' },
      { kind: 'cite', n: 1 },
      { kind: 'text', text: '.' },
    ])
  })

  it('hides a half-streamed bold marker instead of showing asterisks', () => {
    expect(parseInline('Give **sixty')).toEqual([{ kind: 'text', text: 'Give sixty' }])
  })
})

describe('parseAnswer', () => {
  it('recognises paragraphs and numbered lists', () => {
    const blocks = parseAnswer('Two deadlines:\n\n1. **Oct 20** [1]\n2. 15 days [2]')
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'ol'])
  })
})

describe('answerToPlainText', () => {
  it('writes the sources out when copying', () => {
    const text = answerToPlainText('Notice is **60 days** [1].', [
      { n: 1, documentName: 'MSA.pdf', page: 6, para: '4.2(a)' },
    ])
    expect(text).toBe('Notice is 60 days [1].\n\nSources\n[1] MSA.pdf, page 6, §4.2(a)')
  })
})

describe('pinpoint', () => {
  it('cites contracts by section, letters by paragraph and schedules by number', () => {
    expect(pinpoint('4.2(a)')).toBe('§4.2(a)')
    expect(pinpoint('dl-2-2')).toBe('¶2')
    expect(pinpoint('sch2-provider')).toBe('Sch. 2')
  })
})

describe('citationLabel', () => {
  it('reads a citation the same way wherever it appears (§6)', () => {
    expect(citationLabel({ n: 1, documentName: 'Smith MSA.pdf', page: 12, para: '4.2(a)' })).toBe(
      'Source 1: Smith MSA.pdf, page 12, §4.2(a)',
    )
    expect(
      citationLabel({ n: 3, documentName: 'Demand letter.pdf', page: 1, para: 'dl-1-3' }),
    ).toBe('Source 3: Demand letter.pdf, page 1, ¶3')
  })
})
