import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/test/render'

describe('app routes', () => {
  it('sends / to the sign-in screen', async () => {
    renderRoute('/')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('renders the workspace for a matter with its chat history', async () => {
    renderRoute('/m/smith')
    expect(
      await screen.findByRole('heading', { name: /What would you like to know about/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Chats and documents' })).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Termination notice in the MSA' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('shows the not-found page for an unknown address', async () => {
    renderRoute('/no/such/page')
    expect(
      await screen.findByRole('heading', { name: 'This page doesn’t exist' }),
    ).toBeInTheDocument()
  })
})
