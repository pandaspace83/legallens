import { useSyncExternalStore } from 'react'

// Tracks a CSS media query, for the drawer and overlay layouts below laptop widths (FE-3.6, FE-9.3).
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** From 1024 px the sidebar sits beside the conversation; below that it is a drawer. */
export const useSidebarInline = () => useMediaQuery('(min-width: 1024px)')

/** From 1280 px the side panel sits beside the conversation; below that it covers it (FE-3.6). */
export const usePanelInline = () => useMediaQuery('(min-width: 1280px)')
