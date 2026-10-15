import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// jsdom has no matchMedia. Answer as a 1440 × 900 window, the size the browser tests use, so components
// render their desktop layout. (Tests that run in plain Node have no window at all.)
const WIDTH = 1440
if (typeof window !== 'undefined')
  window.matchMedia ??= (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    const max = /max-width:\s*(\d+)px/.exec(query)
    const matches =
      (!min || WIDTH >= Number(min[1])) &&
      (!max || WIDTH <= Number(max[1])) &&
      !/prefers-reduced-motion|prefers-color-scheme: dark/.test(query)
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList
  }
