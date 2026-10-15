import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PanelBoundary } from '@/components/common/PanelBoundary'

// A failure in one panel stays in that panel (§6).
function Broken({ fail }: { fail: boolean }) {
  if (fail) throw new Error('boom')
  return <p>Panel content</p>
}

function Harness() {
  const [fail, setFail] = useState(true)
  return (
    <div>
      <p>Sidebar still here</p>
      <button type="button" onClick={() => setFail(false)}>
        Fix it
      </button>
      <PanelBoundary name="this document">
        <Broken fail={fail} />
      </PanelBoundary>
    </div>
  )
}

describe('PanelBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows a calm message in the failed panel only, and recovers on Try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Harness />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong in this document')
    expect(screen.getByText('Sidebar still here')).toBeInTheDocument()
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Fix it' }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('clears when something else is opened in the panel', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <PanelBoundary name="this document" resetKey="doc-a">
        <Broken fail />
      </PanelBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(
      <PanelBoundary name="this document" resetKey="doc-b">
        <Broken fail={false} />
      </PanelBoundary>,
    )
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })
})
