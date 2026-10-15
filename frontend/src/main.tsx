import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/fonts'
import '@/styles/globals.css'
import { App } from '@/App'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root is missing from index.html')

// VITE_API=http talks to the backend. Anything else runs on the in-browser mock, which is imported only then, so
// an http build (the single app, INT-5.1) carries none of the mock's code or demo data.
async function start(element: HTMLElement) {
  const client =
    import.meta.env.VITE_API === 'http'
      ? undefined
      : (await import('@/api/mock/MockApiClient')).createMockApiClient()
  createRoot(element).render(
    <StrictMode>
      <App client={client} />
    </StrictMode>,
  )
}

void start(root)
