import { describe, expect, it } from 'vitest'
import { apiOrigin, BASE, url } from './request'

// AS-3.1: the backend's address comes from the build, not from the page's origin.
describe('apiOrigin', () => {
  it('is empty when unset, so the web build stays same-origin', () => {
    expect(apiOrigin(undefined)).toBe('')
    expect(apiOrigin('')).toBe('')
    expect(apiOrigin('   ')).toBe('')
  })

  it('keeps a hosted address and drops trailing slashes', () => {
    expect(apiOrigin('https://api.example.com')).toBe('https://api.example.com')
    expect(apiOrigin('https://api.example.com//')).toBe('https://api.example.com')
    expect(apiOrigin(' https://api.example.com/ ')).toBe('https://api.example.com')
  })
})

describe('url', () => {
  it('uses the same-origin path when no address is configured', () => {
    expect(BASE).toBe('/api/v1')
    expect(url('/matters', { limit: 5 })).toBe('/api/v1/matters?limit=5')
  })
})
