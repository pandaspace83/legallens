import { act, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'
import { useSession } from '@/stores/session'
import { renderRoute } from '@/test/render'

// The lock screen (FE-3.2, DEC-54) must show nothing of the matter behind it.
describe('lock screen', () => {
  afterEach(() => act(() => useSession.getState().unlock()))

  it('shows no toasts while locked, because they name documents', async () => {
    renderRoute('/m/smith')
    await screen.findByRole(
      'heading',
      { name: /What would you like to know about/ },
      { timeout: 5000 },
    )
    act(() => void toast('Exhibit B.docx is ready to search'))
    expect(await screen.findByText('Exhibit B.docx is ready to search')).toBeInTheDocument()

    act(() => useSession.getState().lock('manual'))
    expect(await screen.findByRole('heading', { name: 'LegalLens is locked' })).toBeInTheDocument()
    expect(screen.queryByText('Exhibit B.docx is ready to search')).not.toBeInTheDocument()

    act(() => void toast('Exhibit A.pdf is ready to search'))
    expect(screen.queryByText('Exhibit A.pdf is ready to search')).not.toBeInTheDocument()
  })
})
