import { isRouteErrorResponse, useRouteError } from 'react-router'

// Shown when a route fails to load or throws. Never shows a stack trace to the lawyer (FE-8.4).
export function RouteError() {
  const error = useRouteError()
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null

  return (
    <main className="grid min-h-dvh place-items-center bg-app p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-fg">Something went wrong on this screen</h1>
        <p className="mt-2 text-fg-muted">
          Your matters and documents are safe. Reload to try again.
          {detail ? <span className="mt-1 block text-fg-subtle">{detail}</span> : null}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-control bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover"
        >
          Reload
        </button>
      </div>
    </main>
  )
}
