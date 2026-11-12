import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { memoryTokenStore, saveToken, setBearerMode, setTokenStore } from '@/api/http/token'
import { StartRoute } from './StartRoute'

function renderAt() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route index element={<StartRoute />} />
        <Route path="login" element={<p>sign-in page</p>} />
        <Route path="matters" element={<p>matters page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('StartRoute', () => {
  afterEach(() => {
    setTokenStore(memoryTokenStore())
    setBearerMode(false)
  })

  it('opens the matters list when the iPhone app restored a sign-in', () => {
    setBearerMode(true)
    setTokenStore(memoryTokenStore())
    saveToken('restored')
    renderAt()
    expect(screen.getByText('matters page')).toBeInTheDocument()
  })

  it('starts at sign-in with no saved sign-in', () => {
    setBearerMode(true)
    setTokenStore(memoryTokenStore())
    renderAt()
    expect(screen.getByText('sign-in page')).toBeInTheDocument()
  })

  it('always starts at sign-in on the web, which holds no token', () => {
    setBearerMode(false)
    renderAt()
    expect(screen.getByText('sign-in page')).toBeInTheDocument()
  })
})
