// Shown for the moment it takes the first screen's code to load, instead of a blank page.
export function AppBoot() {
  return (
    <div className="grid min-h-dvh place-items-center bg-app" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-fg-muted">
        <img src="/favicon.svg" alt="" className="size-7 animate-pulse" />
        <span>Opening LegalLens…</span>
      </div>
    </div>
  )
}
