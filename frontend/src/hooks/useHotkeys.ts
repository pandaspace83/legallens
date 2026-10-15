import { useEffect, useRef } from 'react'

// Keyboard shortcuts with ⌘ on Mac and Ctrl elsewhere, e.g. useHotkey('mod+k', open) (FE-3.7).
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const modKey = isMac ? '⌘' : 'Ctrl+'

export function useHotkey(combo: string, handler: (event: KeyboardEvent) => void) {
  const saved = useRef(handler)
  useEffect(() => {
    saved.current = handler
  })

  useEffect(() => {
    const parts = combo.toLowerCase().split('+')
    const key = parts.at(-1)
    const wantMod = parts.includes('mod')
    const wantShift = parts.includes('shift')
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = isMac ? event.metaKey : event.ctrlKey
      if (mod !== wantMod || event.shiftKey !== wantShift || event.altKey) return
      if (event.key.toLowerCase() !== key) return
      event.preventDefault()
      saved.current(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [combo])
}
