import { AlertTriangle } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

// Catches a failure inside one panel (the sidebar, the conversation or the side panel), so the rest of the app
// keeps working (§6). Like the route error screen it never shows a stack trace; the error goes to the console
// only, because nothing is sent anywhere (DEC-56).
interface Props {
  /** What the panel is, in the lawyer's words: "the conversation", "this document". */
  name: string
  children: ReactNode
  /** Changing this clears the error, e.g. when the lawyer opens something else in the panel. */
  resetKey?: string
}

interface State {
  failed: boolean
  resetKey?: string
}

export class PanelBoundary extends Component<Props, State> {
  override state: State = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`LegalLens: ${this.props.name} failed`, error, info.componentStack)
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center p-6 text-center"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-danger-tint text-danger">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <p className="mt-3 font-medium text-fg">Something went wrong in {this.props.name}</p>
        <p className="mt-1 max-w-xs text-[13.5px] text-fg-muted">
          The rest of LegalLens still works, and nothing was lost. Try again, or reload if it keeps
          happening.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="rounded-control border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:border-line-strong"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-control px-3 py-1.5 text-sm font-medium text-link hover:underline"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
