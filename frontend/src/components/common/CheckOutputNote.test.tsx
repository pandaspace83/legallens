import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CHECK_OUTPUT_TEXT, CheckOutputNote } from './CheckOutputNote'

describe('CheckOutputNote', () => {
  it('tells the lawyer to check the output and that it is not legal advice', () => {
    render(<CheckOutputNote />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(CHECK_OUTPUT_TEXT)
    expect(note).toHaveTextContent(/check it against the cited passages/i)
    expect(note).toHaveTextContent(/not legal advice/i)
  })
})
