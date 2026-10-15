import { useCallback, useLayoutEffect, useRef, useState } from 'react'

// Keeps a scroll container at the bottom while content grows, unless the lawyer has scrolled up (FE-4.9).
export function useStickToBottom(resetKey: unknown, contentKey: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    pinned.current = distance < 96
    setAtBottom(pinned.current)
  }, [])

  const scrollToBottom = useCallback((smooth = true) => {
    const el = ref.current
    if (!el) return
    pinned.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // Each conversation remounts its view, so only the scroll position needs resetting here.
  useLayoutEffect(() => {
    pinned.current = true
    scrollToBottom(false)
  }, [resetKey, scrollToBottom])

  useLayoutEffect(() => {
    if (pinned.current) ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [contentKey])

  return { ref, onScroll, atBottom, scrollToBottom }
}
