// @vitest-environment node
import { readFileSync } from 'node:fs'
import openapiTS, { astToString } from 'openapi-typescript'
import { describe, expect, it } from 'vitest'

// The wire types in schema.d.ts are generated from the backend's openapi.json (INT-0.4). If the backend's
// contract changes and nobody re-runs `npm run api:types`, this test fails, so drift breaks the build instead
// of surfacing as a runtime bug (integration principle 3).
const contract = new URL('../../../../backend/openapi.json', import.meta.url)
const generated = new URL('./schema.d.ts', import.meta.url)

describe('generated API types', () => {
  it('match the backend’s openapi.json (run `npm run api:types` if this fails)', async () => {
    const fresh = astToString(await openapiTS(JSON.parse(readFileSync(contract, 'utf8'))))
    const file = readFileSync(generated, 'utf8')
    expect(file.endsWith(fresh)).toBe(true)
  })
})
