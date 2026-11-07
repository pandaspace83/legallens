import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { createMockApiClient } from '@/api/mock/MockApiClient'
import type { User } from '@/api/types'
import { AppProviders } from '@/app/providers'
import { createQueryClient } from '@/app/queryClient'
import { AiConsentGate } from '@/features/auth/AiConsentGate'

// AS-3.5: the agreement screen names Anthropic, cannot be passed without ticking the box, and sends the wording
// version it was shown.
function setup() {
  const base = createMockApiClient()
  const asked: User = {
    id: 'u1',
    name: 'A Lawyer',
    firstName: 'A',
    email: 'a@b.c',
    initials: 'AL',
    licensingStates: [],
    llmProvider: 'claude',
    aiConsentRequired: true,
    aiConsentVersion: '7',
  }
  const accept = vi.fn(async (_version: string) => ({ ...asked, aiConsentRequired: false }))
  const signOut = vi.fn(async () => {})
  const client: ApiClient = {
    ...base,
    getMe: async () => asked,
    acceptAiConsent: accept,
    signOut,
  }
  render(
    <MemoryRouter>
      <AppProviders client={client} queryClient={createQueryClient()}>
        <AiConsentGate />
      </AppProviders>
    </MemoryRouter>,
  )
  return { accept, signOut }
}

describe('AI consent gate', () => {
  it('says where the data goes and needs the box ticked before agreeing', async () => {
    const { accept } = setup()
    expect(await screen.findByRole('heading', { name: 'Where your data goes' })).toBeInTheDocument()
    expect(screen.getAllByText(/Anthropic/).length).toBeGreaterThan(0)
    const agree = screen.getByRole('button', { name: 'Agree and continue' })
    await waitFor(() => expect(agree).toBeDisabled())
    await userEvent.click(screen.getByRole('checkbox', { name: 'I understand and agree' }))
    await waitFor(() => expect(agree).toBeEnabled())
    await userEvent.click(agree)
    await waitFor(() => expect(accept).toHaveBeenCalledWith('7'))
  })

  it('declining signs out on the server and sends nothing', async () => {
    const { accept, signOut } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(signOut).toHaveBeenCalled())
    expect(accept).not.toHaveBeenCalled()
  })
})
