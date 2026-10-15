// A field that uses Esc for itself (clear a search, cancel a rename, close find) is marked `data-own-escape`.
// Inside a drawer or an overlay panel, Esc there does that job and leaves the drawer or panel open.
export function keepEscape(event: KeyboardEvent) {
  if (event.target instanceof Element && event.target.closest('[data-own-escape]'))
    event.preventDefault()
}
