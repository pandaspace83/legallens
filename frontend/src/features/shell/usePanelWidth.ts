import { useCallback, useEffect, useState } from 'react'

// The context panel's width, remembered between visits (FE-3.6). The conversation beside it keeps 440 px.
const KEY = 'legallens.panel-width'
const MIN = 420

function read(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY))
    return Number.isFinite(n) && n >= MIN ? n : null
  } catch {
    return null
  }
}

export function usePanelWidth(sidebarPx = 272) {
  const [width, setWidth] = useState<number | null>(read)
  const max = () => Math.max(MIN, window.innerWidth - sidebarPx - 440)

  const set = useCallback((next: number) => {
    const clamped = Math.round(
      Math.min(Math.max(next, MIN), Math.max(MIN, window.innerWidth - 272 - 440)),
    )
    setWidth(clamped)
    try {
      localStorage.setItem(KEY, String(clamped))
    } catch {
      /* the width just isn't remembered */
    }
  }, [])

  // A window made smaller than the remembered width pulls the panel in with it.
  useEffect(() => {
    const onResize = () => setWidth((w) => (w === null ? w : Math.min(w, max())))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { width, set, min: MIN, max }
}
