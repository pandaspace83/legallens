import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockControls } from '@/api/mock/devControls'
import { renderRoute } from '@/test/render'

// System states (FE-8.3): what isn't working is said plainly, and what can't work is paused, not left to fail.
describe('system banners', () => {
  afterEach(() => mockControls.reset())

  it('shows nothing when every component works', async () => {
    renderRoute('/m/smith')
    await screen.findByRole(
      'heading',
      { name: /What would you like to know about/ },
      { timeout: 5000 },
    )
    expect(screen.queryByText(/isn’t running/)).not.toBeInTheDocument()
  })

  it('pauses asking while the AI engine is down, and says what still works', async () => {
    mockControls.set({ engineOffline: true })
    renderRoute('/m/smith')
    expect(
      await screen.findByText('The local AI engine isn’t running.', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.getByText(/You can still read documents, answers and drafts/)).toBeInTheDocument()
    expect(screen.getByText(/New questions are paused/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('shows the two most serious issues and counts the rest', async () => {
    mockControls.set({ engineOffline: true, workerStopped: true, storageLow: true })
    renderRoute('/m/smith')
    expect(
      await screen.findByText('The local AI engine isn’t running.', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Background work is paused.')).toBeInTheDocument()
    expect(screen.queryByText(/almost out of space/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 more issue/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Check again/ })).toHaveLength(1)
  })
})
